/**
 * Multi-org subscription vendor derivation.
 *
 * Dragon Roofing is one business with two Xero orgs (Dragon Roofing Pty Ltd +
 * Easy Hail Claim); IICT Group has three. The crawl used to analyse ONE org and
 * present it as the whole business — Dragon's forecast carried Easy Hail's 11
 * vendors and missed Dragon Roofing's own ~$77k/yr of subscriptions.
 *
 * Crawling every org fixes the coverage, but pooling each vendor's payments into
 * a single stream introduces a subtler version of the SAME understatement, which
 * is what these tests pin down:
 *   - a monthly sub's budget is the per-transaction average, so pooling two orgs
 *     halves it;
 *   - frequency is inferred from gaps between payments, so two interleaved
 *     monthly streams look fortnightly and degrade to 'ad-hoc'.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveVendorFromTransactions,
  type DerivableTransaction,
} from '@/lib/xero/subscription-vendor-derivation'

const DRAGON = '42735fc3-21f2-4668-9783-93ce0f66f481'
const EASY_HAIL = '3b67e5b6-780c-4158-831c-82293f34ca04'

/** A monthly stream billed on `day` of each month for `months`, starting at `startMonth`. */
function monthlyStream(
  tenantId: string,
  amount: number,
  { months = 12, day = 3, startYear = 2025, startMonth = 8 } = {}
): DerivableTransaction[] {
  const out: DerivableTransaction[] = []
  for (let i = 0; i < months; i++) {
    const m0 = startMonth - 1 + i
    const year = startYear + Math.floor(m0 / 12)
    const month = (m0 % 12) + 1
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // Prior FY = Jul 2025-Jun 2026 for a FY starting Jul 2026.
    const period: DerivableTransaction['period'] = date < '2026-07-01' ? 'prior_fy' : 'current_fy'
    out.push({ date, amount, period, tenantId })
  }
  return out
}

describe('single-org vendors are unchanged', () => {
  it('a monthly sub budgets at its monthly bill', () => {
    const d = deriveVendorFromTransactions(monthlyStream(DRAGON, 1200))
    expect(d.orgCount).toBe(1)
    expect(d.suggestedFrequency).toBe('monthly')
    expect(d.suggestedMonthlyBudget).toBeCloseTo(1200, 2)
  })

  it('an annual sub budgets the LATEST renewal price, not last year\'s', () => {
    const txs: DerivableTransaction[] = [
      { date: '2025-09-15', amount: 6000, period: 'prior_fy', tenantId: DRAGON },
      { date: '2026-09-15', amount: 6600, period: 'current_fy', tenantId: DRAGON },
    ]
    const d = deriveVendorFromTransactions(txs, '2026-10-01')
    expect(d.suggestedFrequency).toBe('annual')
    // DELIBERATE semantics change (dossier upgrade): the vendor renewed at
    // $6,600, so that is the price being paid — 6600/12, not 6000/12. The old
    // basis is preserved as evidence:
    expect(d.suggestedMonthlyBudget).toBeCloseTo(550, 2)
    expect(d.fyAverageMonthly).toBeCloseTo(500, 2)
    expect(d.renewalMonth).toBe(9)
    // And the twin (~12mo gap, +10% amount) makes annual an evidenced call:
    expect(d.dossier.priorYearTwin).toBe(true)
    expect(d.confidence).toBe('high')
  })
})

describe('a vendor billed by TWO orgs', () => {
  // Zendesk, Hubstaff and Google Workspace are all billed by both Dragon orgs.
  const zendesk = [
    ...monthlyStream(DRAGON, 1200, { day: 3 }),
    ...monthlyStream(EASY_HAIL, 760, { day: 18 }),
  ]

  it('budgets the COMBINED monthly cost, not one org\'s bill', () => {
    const d = deriveVendorFromTransactions(zendesk)
    expect(d.orgCount).toBe(2)
    // The bug this guards: pooling gives avgAmount = (1200+760)/2 = 980,
    // understating the real combined $1,960/month by half.
    expect(d.suggestedMonthlyBudget).toBeCloseTo(1960, 2)
  })

  it('still reads as monthly rather than degrading to ad-hoc', () => {
    // Interleaved, the two streams sit ~15 days apart — outside the 25-35 day
    // monthly band — so a pooled derivation would report 'ad-hoc'.
    expect(deriveVendorFromTransactions(zendesk).suggestedFrequency).toBe('monthly')
  })

  it('reports the dominant org\'s rhythm as the label', () => {
    // Dragon spends more, and Dragon is monthly.
    const d = deriveVendorFromTransactions([
      ...monthlyStream(DRAGON, 1200),
      { date: '2025-11-02', amount: 90, period: 'prior_fy', tenantId: EASY_HAIL },
    ])
    expect(d.suggestedFrequency).toBe('monthly')
    expect(d.orgCount).toBe(2)
    // One-off $90 in the second org still counts toward the budget.
    expect(d.suggestedMonthlyBudget).toBeGreaterThan(1200)
  })

  it('sums a monthly org and an annual org without double-counting', () => {
    const d = deriveVendorFromTransactions([
      ...monthlyStream(DRAGON, 300),
      { date: '2025-10-01', amount: 2400, period: 'prior_fy', tenantId: EASY_HAIL },
      { date: '2026-10-01', amount: 2400, period: 'current_fy', tenantId: EASY_HAIL },
    ])
    // Dragon $300/mo + Easy Hail $2400/yr → $200/mo = $500/mo combined.
    expect(d.suggestedMonthlyBudget).toBeCloseTo(500, 2)
  })

  it('counts same-day charges in both orgs as two real expenses', () => {
    // A shared product billed to both orgs on the same day is NOT a duplicate —
    // collapsing them would re-create the understatement being fixed.
    const sameDay = [
      ...monthlyStream(DRAGON, 49, { day: 10 }),
      ...monthlyStream(EASY_HAIL, 49, { day: 10 }),
    ]
    expect(deriveVendorFromTransactions(sameDay).suggestedMonthlyBudget).toBeCloseTo(98, 2)
  })
})

describe('three orgs (IICT Group)', () => {
  it('sums every org', () => {
    const A = 'iict-aust', B = 'iict-limited', C = 'iict-pty'
    const d = deriveVendorFromTransactions([
      ...monthlyStream(A, 1000, { day: 5 }),
      ...monthlyStream(B, 2000, { day: 12 }),
      ...monthlyStream(C, 500, { day: 25 }),
    ])
    expect(d.orgCount).toBe(3)
    expect(d.suggestedMonthlyBudget).toBeCloseTo(3500, 2)
    // Label follows the biggest spender.
    expect(d.suggestedFrequency).toBe('monthly')
  })
})

describe('degenerate input', () => {
  it('returns a zero budget for no transactions rather than NaN', () => {
    const d = deriveVendorFromTransactions([])
    expect(d.suggestedMonthlyBudget).toBe(0)
    expect(d.orgCount).toBe(0)
    expect(d.renewalMonth).toBeNull()
  })

  it('never yields NaN when an org nets to zero on credits', () => {
    const d = deriveVendorFromTransactions([
      { date: '2025-09-01', amount: 100, period: 'prior_fy', tenantId: DRAGON },
      { date: '2025-09-20', amount: -100, period: 'prior_fy', tenantId: DRAGON },
    ])
    expect(Number.isNaN(d.suggestedMonthlyBudget)).toBe(false)
  })
})


/**
 * Dossier — the CFO questions of 18 Aug 2026:
 *   1. which subscriptions were annual (1 payment/yr) — and are they renewals
 *      or one-offs?
 *   2. which monthlies stopped mid-year, and when?
 *   3. what is the current price to carry forward (not the FY average)?
 * All recency judgements pass an explicit referenceDate so these tests are
 * deterministic and a replayed crawl derives identically.
 */
describe('vendor dossier', () => {
  const REF = '2026-08-18'

  it('a monthly sub paying on cadence is active', () => {
    const d = deriveVendorFromTransactions(
      monthlyStream(DRAGON, 500, { months: 12, startYear: 2025, startMonth: 9 }), REF)
    expect(d.dossier.status).toBe('active')
    expect(d.dossier.stoppedMonth).toBeNull()
  })

  it('a monthly sub that stopped mid-year is lapsed, with the stop month named', () => {
    // 9 payments Jul 2025 → Mar 2026, then silence — Matt's question #2.
    const d = deriveVendorFromTransactions(
      monthlyStream(DRAGON, 350, { months: 9, startYear: 2025, startMonth: 7 }), REF)
    expect(d.dossier.status).toBe('lapsed')
    expect(d.dossier.stoppedMonth).toBe('2026-03')
    expect(d.dossier.daysSinceLastPayment).toBeGreaterThan(60)
  })

  it('a stopped monthly still reports its real cadence-priced budget for reinstatement', () => {
    const d = deriveVendorFromTransactions(
      monthlyStream(DRAGON, 350, { months: 9, startYear: 2025, startMonth: 7 }), REF)
    // Suggestion stays sensible ($350/mo); INCLUSION is the operator's call
    // via the default-excluded toggle, not a zeroed number.
    expect(d.suggestedMonthlyBudget).toBeCloseTo(350, 2)
  })

  it('carry-forward uses the CURRENT price after a mid-year rise, average kept as evidence', () => {
    // $160/mo for 8 months, then a rise to $190 for the last 4 — the classic
    // quiet price creep. The average books $170; the price being paid is $190.
    const txs = [
      ...monthlyStream(DRAGON, 160, { months: 8, startYear: 2025, startMonth: 9 }),
      ...monthlyStream(DRAGON, 190, { months: 4, startYear: 2026, startMonth: 5 }),
    ]
    const d = deriveVendorFromTransactions(txs, REF)
    expect(d.suggestedFrequency).toBe('monthly')
    expect(d.suggestedMonthlyBudget).toBeCloseTo(190, 2)
    expect(d.fyAverageMonthly).toBeCloseTo(170, 2)
  })

  it('median-of-3 keeps one pro-rata month from setting the budget', () => {
    const txs = [
      ...monthlyStream(DRAGON, 500, { months: 11, startYear: 2025, startMonth: 9 }),
      // Final month double-billed (catch-up invoice)
      ...monthlyStream(DRAGON, 1000, { months: 1, startYear: 2026, startMonth: 8 }),
    ]
    const d = deriveVendorFromTransactions(txs, '2026-09-01')
    expect(d.suggestedMonthlyBudget).toBeCloseTo(500, 2)
  })

  it('a single payment with a prior-year twin is an ANNUAL renewal, not a one-off', () => {
    // Question #1: 1 payment this FY. The twin ~12 months earlier at a similar
    // amount is the evidence it renews.
    const txs: DerivableTransaction[] = [
      { date: '2025-07-20', amount: 4200, period: 'prior_fy', tenantId: DRAGON },
      { date: '2026-07-22', amount: 4550, period: 'current_fy', tenantId: DRAGON },
    ]
    const d = deriveVendorFromTransactions(txs, REF)
    expect(d.suggestedFrequency).toBe('annual')
    expect(d.confidence).toBe('high')
    expect(d.dossier.priorYearTwin).toBe(true)
    expect(d.dossier.status).toBe('active')
    expect(d.suggestedMonthlyBudget).toBeCloseTo(4550 / 12, 2)
  })

  it('a single old payment with NO twin is a one-off — excluded by default', () => {
    const txs: DerivableTransaction[] = [
      { date: '2026-02-10', amount: 3800, period: 'current_fy', tenantId: DRAGON },
    ]
    const d = deriveVendorFromTransactions(txs, REF)
    expect(d.dossier.status).toBe('one-off')
    expect(d.dossier.priorYearTwin).toBe(false)
  })

  it('a single RECENT payment reads as new, not one-off — the second charge may be coming', () => {
    const txs: DerivableTransaction[] = [
      { date: '2026-08-01', amount: 89, period: 'current_fy', tenantId: DRAGON },
    ]
    const d = deriveVendorFromTransactions(txs, REF)
    expect(d.dossier.status).toBe('new')
  })

  it('a 12-payment monthly is never flipped to annual by twin-matching Januarys', () => {
    const d = deriveVendorFromTransactions(
      monthlyStream(DRAGON, 250, { months: 14, startYear: 2025, startMonth: 7 }), REF)
    expect(d.suggestedFrequency).toBe('monthly')
  })

  it('multi-org: carry-forward sums each org\'s CURRENT price', () => {
    // Dragon's org at $1,200 all year; Easy Hail rose $700 → $760 mid-year.
    const txs = [
      ...monthlyStream(DRAGON, 1200, { months: 12, startYear: 2025, startMonth: 9 }),
      ...monthlyStream(EASY_HAIL, 700, { months: 8, startYear: 2025, startMonth: 9, day: 18 }),
      ...monthlyStream(EASY_HAIL, 760, { months: 4, startYear: 2026, startMonth: 5, day: 18 }),
    ]
    const d = deriveVendorFromTransactions(txs, REF)
    expect(d.orgCount).toBe(2)
    expect(d.suggestedMonthlyBudget).toBeCloseTo(1960, 2)
  })

  it('multi-org: vendor is lapsed only when EVERY org has stopped', () => {
    const stopped = monthlyStream(DRAGON, 300, { months: 6, startYear: 2025, startMonth: 9 })
    const alive = monthlyStream(EASY_HAIL, 400, { months: 12, startYear: 2025, startMonth: 9 })
    expect(deriveVendorFromTransactions([...stopped, ...alive], REF).dossier.status).toBe('active')
    expect(deriveVendorFromTransactions(stopped, REF).dossier.status).toBe('lapsed')
  })
})
