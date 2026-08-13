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

  it('an annual sub spreads the prior-FY payment over 12 months', () => {
    const txs: DerivableTransaction[] = [
      { date: '2025-09-15', amount: 6000, period: 'prior_fy', tenantId: DRAGON },
      { date: '2026-09-15', amount: 6600, period: 'current_fy', tenantId: DRAGON },
    ]
    const d = deriveVendorFromTransactions(txs)
    expect(d.suggestedFrequency).toBe('annual')
    expect(d.suggestedMonthlyBudget).toBeCloseTo(500, 2) // 6000 / 12
    expect(d.renewalMonth).toBe(9)
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
