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

export interface VendorDerivation {
  /** Combined monthly cost across every org that pays this vendor. */
  suggestedMonthlyBudget: number
  /** Billing rhythm of the org that spends the most on this vendor. */
  suggestedFrequency: SubscriptionFrequency
  confidence: FrequencyConfidence
  /** Calendar month (1-12) for annual subs, from the dominant org. Null otherwise. */
  renewalMonth: number | null
  /** How many distinct orgs pay this vendor — 2+ means the merge path ran. */
  orgCount: number
}

/**
 * Derive a vendor's billing rhythm and monthly budget from its payments,
 * splitting by Xero org so that each org's rhythm is measured on its own and the
 * budgets are summed.
 */
export function deriveVendorFromTransactions(
  transactions: DerivableTransaction[]
): VendorDerivation {
  if (transactions.length === 0) {
    return {
      suggestedMonthlyBudget: 0,
      suggestedFrequency: 'ad-hoc',
      confidence: 'low',
      renewalMonth: null,
      orgCount: 0,
    }
  }

  const byTenant = new Map<string, DerivableTransaction[]>()
  for (const tx of transactions) {
    const list = byTenant.get(tx.tenantId)
    if (list) list.push(tx)
    else byTenant.set(tx.tenantId, [tx])
  }

  let suggestedMonthlyBudget = 0
  // The label shown to the operator comes from the org that spends the most on
  // this vendor — the rhythm that best characterises the line.
  let dominantSpend = -Infinity
  let suggestedFrequency: SubscriptionFrequency = 'ad-hoc'
  let confidence: FrequencyConfidence = 'low'
  let dominantLastDate = ''

  for (const stream of byTenant.values()) {
    const streamTotal = stream.reduce((s, t) => s + t.amount, 0)
    const streamPriorFY = stream.reduce((s, t) => (t.period === 'prior_fy' ? s + t.amount : s), 0)
    const streamAvg = streamTotal / stream.length
    const dates = stream.map(t => t.date).sort()

    const { frequency: streamFreq, confidence: streamConf } = detectFrequency(stream)

    suggestedMonthlyBudget += calculateSuggestedMonthlyBudget(
      streamPriorFY,
      streamAvg,
      streamFreq,
      monthsSpanOf(dates)
    )

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

  return {
    suggestedMonthlyBudget,
    suggestedFrequency,
    confidence,
    renewalMonth,
    orgCount: byTenant.size,
  }
}
