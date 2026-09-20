/**
 * The FX consolidation P9 builds on: translate a foreign organisation's rows
 * into the presentation currency at the P8 convention (balance-sheet-shaped
 * figures at the closing rate of their own date, P&L-shaped figures at the
 * month's average rate), relabel every row onto one synthetic tenant, and
 * refuse — naming the organisation and the date or month — when a needed
 * rate is not stored.
 */
import { describe, it, expect } from 'vitest'
import {
  CONSOLIDATED_TENANT_ID,
  consolidateBalanceRows,
  consolidateFlowRows,
  datesPresentIn,
  listOf,
  type ConsolidationOrg,
  type FxRateLike,
} from '../multi-org-consolidate'

const AUD_ORG: ConsolidationOrg = { tenant_id: 'aud-1', name: 'Dragon Roofing Pty Ltd', functional_currency: 'AUD' }
const AUD_ORG_2: ConsolidationOrg = { tenant_id: 'aud-2', name: 'EASY HAIL CLAIM PTY LTD', functional_currency: 'AUD' }
const HKD_ORG: ConsolidationOrg = { tenant_id: 'hkd-1', name: 'IICT Group Limited', functional_currency: 'HKD' }

const RATES: FxRateLike[] = [
  { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-07-31', rate: 0.181785 },
  { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 0.177902 },
  { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-08-01', rate: 0.179536 },
]

describe('listOf', () => {
  it('joins 0, 1, 2 and 3+ items', () => {
    expect(listOf([])).toBe('')
    expect(listOf(['A'])).toBe('A')
    expect(listOf(['A', 'B'])).toBe('A and B')
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C')
  })
})

describe('consolidateBalanceRows', () => {
  it('same-currency: sums with no translation at all, relabelled onto one tenant', () => {
    const rows = [
      { tenant_id: 'aud-1', account_name: 'Bank', balances_by_date: { '2026-07-31': 100, '2026-08-31': 120 } },
      { tenant_id: 'aud-2', account_name: 'Bank', balances_by_date: { '2026-07-31': 200, '2026-08-31': 210 } },
    ]
    const result = consolidateBalanceRows(rows, [AUD_ORG, AUD_ORG_2], [], ['2026-07-31', '2026-08-31'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows.every((r) => r.tenant_id === CONSOLIDATED_TENANT_ID)).toBe(true)
    expect(result.rows.map((r) => r.balances_by_date)).toEqual([
      { '2026-07-31': 100, '2026-08-31': 120 },
      { '2026-07-31': 200, '2026-08-31': 210 },
    ])
  })

  it('translates a foreign organisation at the CLOSING rate of each date', () => {
    const rows = [
      { tenant_id: 'hkd-1', account_name: 'AWX Cash HKD', balances_by_date: { '2026-07-31': 1303713.43, '2026-08-31': 1237808.62 } },
    ]
    const result = consolidateBalanceRows(rows, [HKD_ORG], RATES, ['2026-07-31', '2026-08-31'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].balances_by_date['2026-07-31']).toBeCloseTo(1303713.43 * 0.181785, 2)
    expect(result.rows[0].balances_by_date['2026-08-31']).toBeCloseTo(1237808.62 * 0.177902, 2)
  })

  it('prefixes the account name with the organisation only when asked and only with more than one org', () => {
    const rows = [{ tenant_id: 'aud-1', account_name: 'Trade Debtors', balances_by_date: { '2026-08-31': 10 } }]
    const bare = consolidateBalanceRows(rows, [AUD_ORG, AUD_ORG_2], [], ['2026-08-31'])
    expect(bare.ok && bare.rows[0].account_name).toBe('Trade Debtors')
    const prefixed = consolidateBalanceRows(rows, [AUD_ORG, AUD_ORG_2], [], ['2026-08-31'], { prefixLabel: true })
    expect(prefixed.ok && prefixed.rows[0].account_name).toBe('Dragon Roofing Pty Ltd — Trade Debtors')
    const single = consolidateBalanceRows(rows, [AUD_ORG], [], ['2026-08-31'], { prefixLabel: true })
    expect(single.ok && single.rows[0].account_name).toBe('Trade Debtors')
  })

  it('refuses, naming the organisation and currency, when it was never recorded', () => {
    const unknown: ConsolidationOrg = { ...HKD_ORG, functional_currency: null }
    const result = consolidateBalanceRows([], [AUD_ORG, unknown], RATES, [])
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('the reporting currency of IICT Group Limited is not recorded') })
  })

  it('refuses, naming the pair and every missing date, when a closing rate is not stored', () => {
    const rows = [{ tenant_id: 'hkd-1', account_name: 'Bank', balances_by_date: { '2026-06-30': 1, '2026-08-31': 1 } }]
    const result = consolidateBalanceRows(rows, [HKD_ORG], RATES, ['2026-06-30', '2026-08-31'])
    expect(result).toEqual({ ok: false, reason: 'no HKD/AUD closing rate is stored for 2026-06-30' })
  })

  it('never requires a foreign rate for a date only a SIBLING organisation carries — the real IICT shape (IICT-55/56)', () => {
    // IICT (Aust) Pty Ltd (AUD) has been synced since well before IICT Group
    // Limited (HKD) was even connected, and fx_rates does not go back that
    // far either. None of that is this report's business: dateKeys mirrors a
    // caller that passed the union of every date ANY row carries (the exact
    // bug — datesPresentIn over an unfiltered read), but IICT Group Limited
    // never itself carries a value at the early AUD-only dates, so no rate
    // should ever be demanded for them.
    const AUD_EARLY: ConsolidationOrg = { tenant_id: 'aud-early', name: 'IICT (Aust) Pty Ltd', functional_currency: 'AUD' }
    const rows: Array<{ tenant_id: string; account_name: string; balances_by_date: Record<string, number> }> = [
      { tenant_id: 'aud-early', account_name: 'Bank', balances_by_date: { '2024-07-31': 10, '2025-07-31': 12, '2026-07-31': 14, '2026-08-31': 15 } },
      { tenant_id: 'hkd-1', account_name: 'Bank', balances_by_date: { '2025-07-31': 100, '2026-07-31': 120, '2026-08-31': 130 } },
    ]
    const ratesWith2025: FxRateLike[] = [...RATES, { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2025-07-31', rate: 0.198 }]
    // The union of every date any row carries — no rate is stored for
    // 2024-07-31 at all, for either currency.
    const dateKeys = ['2024-07-31', '2025-07-31', '2026-07-31', '2026-08-31']
    const result = consolidateBalanceRows(rows, [AUD_EARLY, HKD_ORG], ratesWith2025, dateKeys)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const hkdRow = result.rows.find((r) => r.account_name === 'Bank' && '2025-07-31' in r.balances_by_date && r.balances_by_date['2024-07-31'] === undefined)!
    expect(hkdRow.balances_by_date['2025-07-31']).toBeCloseTo(100 * 0.198, 2)
    expect(hkdRow.balances_by_date['2026-08-31']).toBeCloseTo(130 * 0.177902, 2)
    // The AUD organisation's own early date is untouched — 2024 was always fine.
    const audRow = result.rows.find((r) => r.tenant_id === CONSOLIDATED_TENANT_ID && r.balances_by_date['2024-07-31'] === 10)
    expect(audRow).toBeDefined()
  })

  it('still refuses, naming the date, when the organisation that OWNS that date genuinely lacks a rate for it', () => {
    const rows = [
      { tenant_id: 'hkd-1', account_name: 'Bank', balances_by_date: { '2025-07-31': 100, '2026-07-31': 120, '2026-08-31': 130 } },
    ]
    // No 2025-07-31 rate this time — and the HKD row itself carries that date.
    const result = consolidateBalanceRows(rows, [HKD_ORG], RATES, ['2025-07-31', '2026-07-31', '2026-08-31'])
    expect(result).toEqual({ ok: false, reason: 'no HKD/AUD closing rate is stored for 2025-07-31' })
  })

  it('a row for a tenant outside the organisation list is dropped, not guessed at', () => {
    const rows = [
      { tenant_id: 'aud-1', account_name: 'Bank', balances_by_date: { '2026-08-31': 10 } },
      { tenant_id: 'someone-else', account_name: 'Bank', balances_by_date: { '2026-08-31': 999999 } },
    ]
    const result = consolidateBalanceRows(rows, [AUD_ORG], [], ['2026-08-31'])
    expect(result.ok && result.rows).toHaveLength(1)
  })
})

describe('consolidateFlowRows', () => {
  it('translates every month a row carries at THAT month\'s average rate', () => {
    const rows = [{ tenant_id: 'hkd-1', monthly_values: { '2026-08': 1628444.86 } }]
    const result = consolidateFlowRows(rows, [HKD_ORG], RATES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].monthly_values['2026-08']).toBeCloseTo(1628444.86 * 0.179536, 0)
    expect(result.rows[0].tenant_id).toBe(CONSOLIDATED_TENANT_ID)
  })

  it('refuses, naming the organisation and the month, when a monthly average is not stored', () => {
    const rows = [{ tenant_id: 'hkd-1', monthly_values: { '2026-06': 100, '2026-08': 100 } }]
    const result = consolidateFlowRows(rows, [HKD_ORG], RATES)
    expect(result).toEqual({ ok: false, reason: 'no HKD/AUD monthly average rate is stored for 2026-06' })
  })

  it('a null value stays null; an undefined key is dropped, never treated as zero', () => {
    const rows = [{ tenant_id: 'aud-1', monthly_values: { '2026-08': null, '2026-07': undefined as unknown as null } }]
    const result = consolidateFlowRows(rows, [AUD_ORG], [])
    expect(result.ok && result.rows[0].monthly_values).toEqual({ '2026-08': null })
  })
})

describe('datesPresentIn', () => {
  it('is the union of every date any row carries — never a theoretical range', () => {
    const rows = [
      { balances_by_date: { '2026-07-31': 1, '2026-08-31': 2 } },
      { balances_by_date: { '2026-08-31': 3 } },
    ]
    expect(datesPresentIn(rows).sort()).toEqual(['2026-07-31', '2026-08-31'])
  })
})
