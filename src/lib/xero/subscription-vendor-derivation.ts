/**
 * Subscription vendor frequency + budget derivation.
 *
 * Extracted from `src/app/api/Xero/subscription-transactions/route.ts` so the
 * arithmetic that decides a vendor's forecast budget can be tested directly —
 * it is the number that lands in the client's P&L, so "CFO-level accuracy" is
 * the bar.
 *
 * The multi-org rule is the important one. A business with several Xero orgs
 * (Dragon Roofing = Dragon Roofing Pty Ltd + Easy Hail Claim; IICT Group = three
 * entities) bills the SAME vendor from more than one org. Pooling those payments
 * into one stream corrupts both derivations, and both fail by UNDER-stating:
 *
 *   - `detectFrequency` measures gaps between consecutive payments. Two monthly
 *     streams interleave to ~15-day gaps, miss the 25-35 day monthly band and
 *     degrade to 'ad-hoc'.
 *   - `calculateSuggestedMonthlyBudget` returns the per-transaction average for a
 *     monthly sub. Pooled over two orgs that average is ONE org's bill, not the
 *     combined monthly cost.
 *
 * So we derive per org and sum the budgets. For a single-org business this is
 * arithmetically identical to deriving over the whole vendor.
 */

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'annual' | 'ad-hoc'
export type FrequencyConfidence = 'high' | 'medium' | 'low'

/** The minimum a transaction must carry for these derivations. */
export interface DerivableTransaction {
  /** ISO date (YYYY-MM-DD). */
  date: string
  /** Signed amount — positive expense, negative credit/refund. */
  amount: number
  period: 'prior_fy' | 'current_fy'
  /** Xero tenant (org) this payment came from. */
  tenantId: string
}

export function detectFrequency(transactions: Pick<DerivableTransaction, 'date'>[]): {
  frequency: SubscriptionFrequency
  confidence: FrequencyConfidence
} {
  if (transactions.length === 1) {
    return { frequency: 'ad-hoc', confidence: 'low' }
  }

  // Sort by date
  const sorted = [...transactions].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Calculate intervals between transactions
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round(
      (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime())
      / (1000 * 60 * 60 * 24)
    )
    if (days > 0) intervals.push(days)
  }

  if (intervals.length === 0) {
    return { frequency: 'ad-hoc', confidence: 'low' }
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  const consistency = stdDev / avgInterval // Lower is more consistent

  // Determine frequency based on average interval
  if (avgInterval >= 25 && avgInterval <= 35) {
    return {
      frequency: 'monthly',
      confidence: consistency < 0.2 ? 'high' : consistency < 0.4 ? 'medium' : 'low',
    }
  } else if (avgInterval >= 80 && avgInterval <= 100) {
    return {
      frequency: 'quarterly',
      confidence: consistency < 0.3 ? 'high' : consistency < 0.5 ? 'medium' : 'low',
    }
  } else if (avgInterval >= 350 && avgInterval <= 380) {
    return {
      frequency: 'annual',
      confidence: consistency < 0.1 ? 'high' : 'medium',
    }
  }

  // Check if it might be annual with only 1-2 transactions
  if (transactions.length <= 2) {
    const firstDate = new Date(sorted[0].date)
    const lastDate = new Date(sorted[sorted.length - 1].date)
    const span = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)

    if (span >= 300 && span <= 400) {
      return { frequency: 'annual', confidence: 'medium' }
    }
  }

  return { frequency: 'ad-hoc', confidence: 'low' }
}

export function calculateSuggestedMonthlyBudget(
  priorFYAmount: number,
  avgAmount: number,
  frequency: SubscriptionFrequency,
  monthsSpan: number
): number {
  switch (frequency) {
    case 'monthly':
      // Use average transaction amount for monthly subscriptions
      return avgAmount
    case 'quarterly':
      // Use average transaction amount divided by 3 for quarterly
      return avgAmount / 3
    case 'annual':
      // Use prior FY amount (full year) divided by 12 for annual subscriptions
      // Fall back to avgAmount if no prior FY data
      return priorFYAmount > 0 ? priorFYAmount / 12 : avgAmount / 12
    case 'ad-hoc':
      // Spread over the period we have data for, or 12 months
      return (priorFYAmount > 0 ? priorFYAmount : avgAmount) / Math.max(monthsSpan, 12)
    default:
      return priorFYAmount > 0 ? priorFYAmount / 12 : avgAmount / 12
  }
}

/** Months between the first and last payment in a stream (minimum 1). */
function monthsSpanOf(sortedDates: string[]): number {
  const first = new Date(sortedDates[0])
  const last = new Date(sortedDates[sortedDates.length - 1])
  return Math.max(1, Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30)))
}

/**
 * Lifecycle state, derived from payment recency measured against the stream's
 * own cadence (a monthly sub is lapsed after ~2 missed cycles; an annual one
 * only after its renewal window passes). The CFO questions this answers:
 * "which monthlies stopped mid-year, and when — do they carry forward?"
 *
 *  - active:  paying on cadence
 *  - lapsed:  payments stopped (stoppedMonth says when) — default EXCLUDED
 *             from the budget; carrying a dead sub forward overstates costs
 *  - new:     first payment falls in the current FY (and still on cadence)
 *  - one-off: a single payment with no prior-year twin — a purchase, not a
 *             subscription — default EXCLUDED
 */
export type VendorStatus = 'active' | 'lapsed' | 'new' | 'one-off'

export interface VendorDossier {
  status: VendorStatus
  /** ISO date of the newest payment across all orgs. */
  lastPaymentDate: string | null
  /** Amount of that newest payment — the "what are we actually paying now"
   *  evidence figure. */
  lastPaymentAmount: number
  daysSinceLastPayment: number | null
  /** 'YYYY-MM' of the final payment when status is 'lapsed'; null otherwise. */
  stoppedMonth: string | null
  /**
   * A payment ~12 months (330-400 days) before a later one, within ±30% of its
   * amount. This is the evidence that separates an ANNUAL RENEWAL (carry it
   * forward) from a ONE-OFF purchase (don't) — the single most consequential
   * call in subscription forecasting. The crawl window starts at prior-FY
   * start, so a true annual paid this FY has its twin in view.
   */
  priorYearTwin: boolean
}

export interface VendorDerivation {
  /**
   * Combined monthly cost across every org that pays this vendor, sized from
   * the CURRENT price point: monthly = median of the last 3 payments, annual =
   * last renewal / 12. NOT the FY average — averaging a year that contains a
   * price rise budgets last year's price (Dragon: avg said $1,796.67 while the
   * price being paid was $1,960).
   */
  suggestedMonthlyBudget: number
  /**
   * The old FY-average basis, kept as EVIDENCE: when this differs from
   * suggestedMonthlyBudget the gap is the price movement during the year —
   * shown to the operator, never silently used.
   */
  fyAverageMonthly: number
  /** Billing rhythm of the org that spends the most on this vendor. */
  suggestedFrequency: SubscriptionFrequency
  confidence: FrequencyConfidence
  /** Calendar month (1-12) for annual subs, from the dominant org. Null otherwise. */
  renewalMonth: number | null
  /** How many distinct orgs pay this vendor — 2+ means the merge path ran. */
  orgCount: number
  dossier: VendorDossier
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Days after the last payment before a stream reads as stopped: ~2 missed
 *  cycles for monthly/quarterly, renewal window + grace for annual. */
const LAPSE_THRESHOLD_DAYS: Record<SubscriptionFrequency, number> = {
  'monthly': 60,
  'quarterly': 180,
  'annual': 425,
  'ad-hoc': Infinity, // no cadence to be late against
}

/** Median of the last `n` payment amounts — jitter-resistant "current price".
 *  Median, not mean: one pro-rata or double-billed month shouldn't set the
 *  whole year's budget. */
function currentPriceOf(sortedByDate: DerivableTransaction[], n: number): number {
  const tail = sortedByDate.slice(-n).map(t => t.amount).sort((a, b) => a - b)
  if (tail.length === 0) return 0
  const mid = Math.floor(tail.length / 2)
  return tail.length % 2 === 1 ? tail[mid] : (tail[mid - 1] + tail[mid]) / 2
}

/** A pair of payments ~12 months apart at a similar amount. */
function hasPriorYearTwin(sortedByDate: DerivableTransaction[]): boolean {
  for (let i = 1; i < sortedByDate.length; i++) {
    for (let j = 0; j < i; j++) {
      const gap = (new Date(sortedByDate[i].date).getTime() - new Date(sortedByDate[j].date).getTime()) / DAY_MS
      if (gap < 330 || gap > 400) continue
      const a = Math.abs(sortedByDate[j].amount)
      const b = Math.abs(sortedByDate[i].amount)
      if (a === 0 || b === 0) continue
      const ratio = Math.max(a, b) / Math.min(a, b)
      if (ratio <= 1.3) return true
    }
  }
  return false
}

/**
 * Derive a vendor's billing rhythm and monthly budget from its payments,
 * splitting by Xero org so that each org's rhythm is measured on its own and the
 * budgets are summed.
 */
export function deriveVendorFromTransactions(
  transactions: DerivableTransaction[],
  /** "As of" date for recency judgements (ISO). Injectable for tests; the
   *  crawl passes its own toDate so a replayed crawl derives identically. */
  referenceDate?: string
): VendorDerivation {
  const emptyDossier: VendorDossier = {
    status: 'one-off',
    lastPaymentDate: null,
    lastPaymentAmount: 0,
    daysSinceLastPayment: null,
    stoppedMonth: null,
    priorYearTwin: false,
  }
  if (transactions.length === 0) {
    return {
      suggestedMonthlyBudget: 0,
      fyAverageMonthly: 0,
      suggestedFrequency: 'ad-hoc',
      confidence: 'low',
      renewalMonth: null,
      orgCount: 0,
      dossier: emptyDossier,
    }
  }

  const refMs = referenceDate ? new Date(referenceDate).getTime() : Date.now()

  const byTenant = new Map<string, DerivableTransaction[]>()
  for (const tx of transactions) {
    const list = byTenant.get(tx.tenantId)
    if (list) list.push(tx)
    else byTenant.set(tx.tenantId, [tx])
  }

  let suggestedMonthlyBudget = 0
  let fyAverageMonthly = 0
  // The label shown to the operator comes from the org that spends the most on
  // this vendor — the rhythm that best characterises the line.
  let dominantSpend = -Infinity
  let suggestedFrequency: SubscriptionFrequency = 'ad-hoc'
  let confidence: FrequencyConfidence = 'low'
  let dominantLastDate = ''
  let anyStreamOnCadence = false
  let anyTwin = false

  for (const stream of byTenant.values()) {
    const streamTotal = stream.reduce((s, t) => s + t.amount, 0)
    const streamPriorFY = stream.reduce((s, t) => (t.period === 'prior_fy' ? s + t.amount : s), 0)
    const streamAvg = streamTotal / stream.length
    const sorted = [...stream].sort((a, b) => a.date.localeCompare(b.date))
    const dates = sorted.map(t => t.date)

    let { frequency: streamFreq, confidence: streamConf } = detectFrequency(stream)

    // Annual-vs-one-off is decided by EVIDENCE, not spacing alone: a payment
    // with a twin ~12 months earlier at a similar amount is a renewal. Only
    // sparse streams are upgraded — a 12-payment monthly whose Januarys happen
    // to rhyme must not flip to annual.
    const twin = hasPriorYearTwin(sorted)
    anyTwin = anyTwin || twin
    if (twin && sorted.length <= 3 && streamFreq !== 'annual') {
      streamFreq = 'annual'
      streamConf = 'high'
    } else if (twin && streamFreq === 'annual') {
      streamConf = 'high'
    }

    // Budget from the CURRENT price point, not the FY average — the average of
    // a year containing a price rise budgets the OLD price. The FY average is
    // still computed below and surfaced as evidence of that movement.
    switch (streamFreq) {
      case 'monthly':
        suggestedMonthlyBudget += currentPriceOf(sorted, 3)
        break
      case 'quarterly':
        suggestedMonthlyBudget += currentPriceOf(sorted, 2) / 3
        break
      case 'annual':
        // The most recent renewal IS the current annual price.
        suggestedMonthlyBudget += Math.abs(sorted[sorted.length - 1].amount) / 12
        break
      default:
        suggestedMonthlyBudget += calculateSuggestedMonthlyBudget(
          streamPriorFY, streamAvg, streamFreq, monthsSpanOf(dates))
    }
    fyAverageMonthly += calculateSuggestedMonthlyBudget(
      streamPriorFY, streamAvg, streamFreq, monthsSpanOf(dates))

    const streamLastMs = new Date(dates[dates.length - 1]).getTime()
    const streamDaysSince = (refMs - streamLastMs) / DAY_MS
    if (streamDaysSince <= LAPSE_THRESHOLD_DAYS[streamFreq]) anyStreamOnCadence = true

    if (streamTotal > dominantSpend) {
      dominantSpend = streamTotal
      suggestedFrequency = streamFreq
      confidence = streamConf
      dominantLastDate = dates[dates.length - 1]
    }
  }

  let renewalMonth: number | null = null
  if (suggestedFrequency === 'annual' && dominantLastDate) {
    const parsed = new Date(dominantLastDate)
    renewalMonth = Number.isNaN(parsed.getTime()) ? null : parsed.getMonth() + 1
  }

  // ── Dossier ──
  const allSorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const newest = allSorted[allSorted.length - 1]
  const daysSinceLast = Math.round((refMs - new Date(newest.date).getTime()) / DAY_MS)
  const firstIsCurrentFY = allSorted[0].period === 'current_fy'

  // Precedence: one-off > lapsed > new > active. A vendor that stopped is
  // 'lapsed' even if it also started this FY — the carry-forward question
  // outranks the novelty flag.
  let status: VendorStatus
  if (transactions.length === 1 && !anyTwin) {
    // A single recent payment may be a brand-new subscription whose second
    // charge hasn't arrived; give it one monthly cycle before writing it off.
    status = daysSinceLast <= 60 ? 'new' : 'one-off'
  } else if (!anyStreamOnCadence) {
    status = 'lapsed'
  } else if (firstIsCurrentFY) {
    status = 'new'
  } else {
    status = 'active'
  }

  return {
    suggestedMonthlyBudget,
    fyAverageMonthly,
    suggestedFrequency,
    confidence,
    renewalMonth,
    orgCount: byTenant.size,
    dossier: {
      status,
      lastPaymentDate: newest.date,
      lastPaymentAmount: Math.abs(newest.amount),
      daysSinceLastPayment: daysSinceLast,
      stoppedMonth: status === 'lapsed' ? newest.date.slice(0, 7) : null,
      priorYearTwin: anyTwin,
    },
  }
}
