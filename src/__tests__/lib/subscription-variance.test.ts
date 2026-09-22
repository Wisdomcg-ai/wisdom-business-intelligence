/**
 * Subscription variance intelligence — phases 2+3 (18 Aug 2026 CFO plan).
 *
 * The structural rule under test: the P&L forecast smooths annual subs to
 * 1/12, but the VARIANCE report must be lumpy — the renewal month expects the
 * whole annual amount and the other eleven expect $0. Smoothed variance makes
 * every renewal read as a blowout and every other month as phantom savings,
 * which teaches people to ignore the report; an ignored variance report is how
 * leakage survives.
 */
import { describe, it, expect } from 'vitest'
import {
  expectedMonthlyBudget,
  classifyLeakage,
  aggregateVendorMonthActuals,
} from '@/lib/subscriptions/variance'

describe('expectedMonthlyBudget — cadence-aware, not smoothed', () => {
  const annual = {
    vendor_key: 'acme',
    vendor_name: 'Acme',
    monthly_budget: 1000, // smoothed 1/12 of a $12k annual
    frequency: 'annual' as const,
    renewal_month: 2,
  }

  it('an annual sub expects its FULL amount in the renewal month', () => {
    expect(expectedMonthlyBudget(annual, '2027-02')).toBe(12_000)
  })

  it('and $0 in every other month — no phantom savings', () => {
    expect(expectedMonthlyBudget(annual, '2027-03')).toBe(0)
    expect(expectedMonthlyBudget(annual, '2026-07')).toBe(0)
  })

  it('an annual sub with an UNKNOWN renewal month falls back to smoothed', () => {
    expect(expectedMonthlyBudget({ ...annual, renewal_month: null }, '2027-02')).toBe(1000)
  })

  it('monthly and quarterly stay smoothed', () => {
    expect(
      expectedMonthlyBudget({ vendor_key: 'x', vendor_name: 'X', monthly_budget: 250, frequency: 'monthly' }, '2027-02'),
    ).toBe(250)
    expect(
      expectedMonthlyBudget({ vendor_key: 'q', vendor_name: 'Q', monthly_budget: 300, frequency: 'quarterly' }, '2027-02'),
    ).toBe(300)
  })
})

describe('classifyLeakage — the three lines a CFO acts on', () => {
  const MONTH = '2027-02'
  const budgets = [
    { vendor_key: 'zendesk', vendor_name: 'Zendesk', monthly_budget: 500, frequency: 'monthly' as const },
    { vendor_key: 'old-crm', vendor_name: 'Old CRM', monthly_budget: 350, frequency: 'monthly' as const },
    { vendor_key: 'acme', vendor_name: 'Acme Insurance', monthly_budget: 1000, frequency: 'annual' as const, renewal_month: 2 },
    { vendor_key: 'quarterly-thing', vendor_name: 'Quarterly Thing', monthly_budget: 200, frequency: 'quarterly' as const },
  ]

  it('a vendor billing with NO budget row is new-unbudgeted leakage', () => {
    const r = classifyLeakage(
      [{ vendor_key: 'sneaky-saas', vendor_name: 'Sneaky SaaS', actual: 240, transaction_count: 1 }],
      budgets, MONTH,
    )
    expect(r.new_unbudgeted).toHaveLength(1)
    expect(r.new_unbudgeted[0].delta).toBe(240)
    expect(r.totals.new_unbudgeted).toBe(240)
  })

  it('a monthly vendor ≥10% and ≥$10 over budget is price-rise leakage', () => {
    const r = classifyLeakage(
      [{ vendor_key: 'zendesk', vendor_name: 'Zendesk', actual: 590, transaction_count: 1 }],
      budgets, MONTH,
    )
    expect(r.price_rises).toHaveLength(1)
    expect(r.price_rises[0].delta).toBeCloseTo(90, 2)
  })

  it('small overages clear NEITHER gate and stay quiet', () => {
    // +8% (under ratio gate) and +$8 on a tiny sub (under dollar gate).
    const r = classifyLeakage(
      [
        { vendor_key: 'zendesk', vendor_name: 'Zendesk', actual: 540, transaction_count: 1 },
        { vendor_key: 'old-crm', vendor_name: 'Old CRM', actual: 358, transaction_count: 1 },
      ],
      budgets, MONTH,
    )
    expect(r.price_rises).toHaveLength(0)
  })

  it('a budgeted monthly with NO billing is lapsed-still-budgeted', () => {
    const r = classifyLeakage(
      [{ vendor_key: 'zendesk', vendor_name: 'Zendesk', actual: 500, transaction_count: 1 }],
      budgets, MONTH,
    )
    const keys = r.lapsed_still_budgeted.map((l) => l.vendor_key)
    expect(keys).toContain('old-crm')
    // Annual + quarterly vendors legitimately bill nothing most months —
    // flagging them as lapsed would be renewal-cadence noise.
    expect(keys).not.toContain('acme')
    expect(keys).not.toContain('quarterly-thing')
  })

  it('an annual renewal at its expected amount raises NOTHING — on budget, lumpy-to-lumpy', () => {
    const r = classifyLeakage(
      [{ vendor_key: 'acme', vendor_name: 'Acme Insurance', actual: 12_000, transaction_count: 1 }],
      budgets, MONTH,
    )
    expect(r.price_rises).toHaveLength(0)
    expect(r.new_unbudgeted).toHaveLength(0)
  })

  it('lines are ranked by impact so the worst leak reads first', () => {
    const r = classifyLeakage(
      [
        { vendor_key: 'small', vendor_name: 'Small', actual: 40, transaction_count: 1 },
        { vendor_key: 'big', vendor_name: 'Big', actual: 4000, transaction_count: 1 },
      ],
      budgets, MONTH,
    )
    expect(r.new_unbudgeted[0].vendor_key).toBe('big')
  })
})

describe('aggregateVendorMonthActuals — the phase-2 persistence rows', () => {
  it('collapses transactions into per-tenant per-month rows', () => {
    const rows = aggregateVendorMonthActuals('biz-1', 'zendesk', 'Zendesk', [
      { date: '2026-07-03', amount: 100, tenantId: 'org-a' },
      { date: '2026-07-21', amount: 50, tenantId: 'org-a' },
      { date: '2026-08-03', amount: 100, tenantId: 'org-a' },
      { date: '2026-07-18', amount: 75, tenantId: 'org-b' },
    ])
    const find = (t: string, m: string) => rows.find((r) => r.tenant_id === t && r.month === m)
    expect(rows).toHaveLength(3)
    expect(find('org-a', '2026-07')?.amount).toBe(150)
    expect(find('org-a', '2026-08')?.amount).toBe(100)
    // Multi-org rows stay separable — never pre-summed across tenants
    // (IICT's HK org bills in HKD; summing currencies is forbidden).
    expect(find('org-b', '2026-07')?.amount).toBe(75)
  })

  it('drops malformed dates rather than fabricating a month', () => {
    const rows = aggregateVendorMonthActuals('biz-1', 'v', 'V', [
      { date: '', amount: 100, tenantId: 'org-a' },
      { date: '2026-07-03', amount: 10, tenantId: 'org-a' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(10)
  })
})
