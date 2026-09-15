/**
 * DRG-40 — two orgs' accounts are merged by what they ARE, never by code alone.
 *
 * getMonthlyComposite's long → wide step grouped xero_pl_lines on
 * account_code across every tenant of the business. Dragon Roofing and Easy
 * Hail share 74 codes and 26 of them name different accounts: 402 is Easy
 * Hail's "Marketing" and Dragon's "Bad Debts expense", 510 is Easy Hail's
 * "Consultants" and Dragon's "Stripe Fees". The Full Year page, which reads the
 * composite, summed each pair into one row under whichever name was read
 * first — and printed "Marketing" twice — while the consolidated statement,
 * which aligns on account type and name, printed them apart.
 *
 * Within one org a code IS the account, so a single-org business is grouped
 * exactly as before — pinned below against the old grouping, row for row.
 */
import { describe, it, expect } from 'vitest'
import { aggregateXeroPlRows, type XeroPlRowLike } from '../aggregate-xero-pl-rows'

const DRAGON = '42735fc3-21f2-4668-9783-93ce0f66f481'
const EASY_HAIL = '3b67e5b6-780c-4158-831c-82293f34ca04'

const r = (tenant_id: string, account_code: string | null, account_name: string, period_month: string, amount: number | string, account_type = 'opex'): XeroPlRowLike => ({
  tenant_id, account_code, account_name, account_type, period_month, amount,
})

/** The grouping as it stood before DRG-40, copied, as the single-org golden. */
function legacy(rows: readonly XeroPlRowLike[]) {
  const normalize = (t: string | null | undefined) =>
    t === 'revenue' || t === 'cogs' || t === 'opex' || t === 'other_income' || t === 'other_expense' ? t : 'opex'
  const grouped = new Map<string, { account_code: string | null; account_name: string; account_type: string; monthly_values: Record<string, number> }>()
  for (const row of rows) {
    const key = row.account_code ?? `NAME:${row.account_name}`
    let agg = grouped.get(key)
    if (!agg) {
      agg = { account_code: row.account_code, account_name: row.account_name, account_type: normalize(row.account_type), monthly_values: {} }
      grouped.set(key, agg)
    }
    const monthKey = (row.period_month ?? '').slice(0, 7)
    if (!monthKey) continue
    const amt = Number(row.amount)
    agg.monthly_values[monthKey] = (agg.monthly_values[monthKey] ?? 0) + (Number.isFinite(amt) ? amt : 0)
  }
  return [...grouped.values()]
}

describe('a single-org business is grouped exactly as before', () => {
  it('matches the old grouping row for row — order, names, codes, types and every month', () => {
    const rows: XeroPlRowLike[] = [
      r(DRAGON, '200', 'Sales', '2026-07-01', 1_232_129.15, 'revenue'),
      r(DRAGON, '402', 'Bad Debts expense', '2026-07-01', 0),
      r(DRAGON, '485', 'Subscriptions', '2026-07-01', 4256.13),
      r(DRAGON, '485', 'Subscriptions', '2026-08-01', '4729.08'),
      // A superseded mirror row: same code, same name, different account_id.
      r(DRAGON, '485', 'Subscriptions', '2025-04-01', 4501.45),
      r(DRAGON, null, 'Foreign Currency Gains and Losses', '2026-08-01', -12.5, 'other_income'),
      r(DRAGON, '200', 'Sales', '2026-08-01', 873_832.4, 'revenue'),
      r(DRAGON, '999', 'Odd type', '2026-08-01', 'not a number', 'mystery'),
      r(DRAGON, '998', 'No month', '', 5),
    ]
    expect(aggregateXeroPlRows(rows)).toEqual(legacy(rows))
  })

  it('rows with no tenant_id (history from before the column) do not make it a second org', () => {
    const rows: XeroPlRowLike[] = [
      { ...r(DRAGON, '485', 'Subscriptions', '2025-04-01', 4501.45), tenant_id: null },
      { ...r(DRAGON, '485', 'Software Subscriptions', '2025-05-01', 10), tenant_id: null },
      r(DRAGON, '485', 'Subscriptions', '2026-08-01', 4729.08),
    ]
    expect(aggregateXeroPlRows(rows)).toEqual(legacy(rows))
  })
})

describe('two orgs', () => {
  const rows: XeroPlRowLike[] = [
    r(EASY_HAIL, '402', 'Marketing', '2026-08-01', 176),
    r(DRAGON, '402', 'Bad Debts expense', '2026-08-01', 1_250),
    r(DRAGON, '420', 'Marketing', '2026-08-01', 9_933),
    r(DRAGON, '485', 'Subscriptions', '2026-08-01', 4_729.08),
    r(EASY_HAIL, '485', 'Subscriptions', '2026-08-01', 1_786),
    r(EASY_HAIL, '510', 'Consultants', '2026-08-01', 3_000),
    r(DRAGON, '510', 'Stripe Fees', '2026-08-01', 88),
  ]
  const out = aggregateXeroPlRows(rows)
  const named = (name: string) => out.filter((x) => x.account_name === name)

  it('never sums two different accounts because they share a code', () => {
    expect(named('Bad Debts expense')).toHaveLength(1)
    expect(named('Bad Debts expense')[0].monthly_values['2026-08']).toBe(1_250)
    expect(named('Stripe Fees')[0].monthly_values['2026-08']).toBe(88)
    expect(named('Consultants')[0].monthly_values['2026-08']).toBe(3_000)
  })

  it('merges the same account across orgs by type and name, as the consolidated statement does', () => {
    // One "Marketing" row, 10,109 — the statement's figure — not two.
    expect(named('Marketing')).toHaveLength(1)
    expect(named('Marketing')[0].monthly_values['2026-08']).toBe(10_109)
    expect(named('Subscriptions')).toHaveLength(1)
    expect(named('Subscriptions')[0].monthly_values['2026-08']).toBeCloseTo(6_515.08, 6)
  })

  it('keeps a code only where it names one account across the business', () => {
    expect(named('Subscriptions')[0].account_code).toBe('485')
    // Marketing is 402 in one org and 420 in the other.
    expect(named('Marketing')[0].account_code).toBeNull()
    // 402 and 510 each name two accounts, so neither row can claim them.
    expect(named('Bad Debts expense')[0].account_code).toBeNull()
    expect(named('Consultants')[0].account_code).toBeNull()
    expect(named('Stripe Fees')[0].account_code).toBeNull()
  })

  it('does not merge same-named accounts of different types', () => {
    const typed = aggregateXeroPlRows([
      r(DRAGON, '600', 'Interest', '2026-08-01', 10, 'other_income'),
      r(EASY_HAIL, '601', 'Interest', '2026-08-01', 20, 'other_expense'),
    ])
    expect(typed).toHaveLength(2)
  })

  it('keeps the order rows were first read in', () => {
    expect(out.map((x) => x.account_name)).toEqual(['Marketing', 'Bad Debts expense', 'Subscriptions', 'Consultants', 'Stripe Fees'])
  })
})
