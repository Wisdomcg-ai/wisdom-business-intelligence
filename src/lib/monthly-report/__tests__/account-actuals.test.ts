/**
 * Rows shaped like Urban Road's xero_pl_lines_wide_compat for August 2026. The
 * Revenue accounts sum to the statement's Total Income of 527,561.80; the bank
 * interest in 81000 is Other Income and must not be in it.
 */
import { describe, it, expect } from 'vitest'
import {
  buildAccountActuals,
  accountActualsRefusal,
  listLedgerAccounts,
  monthsEndingAt,
  type PlLineRow,
} from '../account-actuals'

const TENANT = '8519c134'

const row = (code: string | null, name: string, type: string, values: Record<string, number | null>, updated_at = '2026-09-13T22:00:00Z'): PlLineRow =>
  ({ tenant_id: TENANT, account_code: code, account_name: name, account_type: type, monthly_values: values, updated_at })

// August 2026 Revenue, account by account (sums to 527,561.80).
const AUG_REVENUE: [string, string, number][] = [
  ['200', 'Sales', 157.63],
  ['41000', 'Canvas Sales', 295826.71],
  ['41140', 'USA Sales', 8322.25],
  ['41150', 'NZ Sales', 50837.52],
  ['41200', 'Rolled Prints', 3221.53],
  ['41300', 'Decor Sales', 16622.86],
  ['41600', 'Framed Prints (41600)', 50806.62],
  ['41700', 'Posters (41700)', 66911.11],
  ['41750', 'Wallpaper', 3040.56],
  ['42010', 'Sales Discounts (Zoho)', -2257.7],
  ['43000', 'POD Exchange Income', 149.05],
  ['44000', 'Shipping', 36699.46],
  ['44250', 'Services', 4200],
  ['48000', 'Returns & Allowances', -6975.8],
]

function ledger(): PlLineRow[] {
  return [
    ...AUG_REVENUE.map(([code, name, v]) => row(code, name, 'revenue', { '2026-08': v })),
    row('81000', 'Bank Interest Income', 'other_income', { '2026-07': 90.1, '2026-08': 110.93 }),
    row('55000', 'Freight to Customer', 'cogs', { '2026-07': 51102.0, '2026-08': 50924.95, '2026-09': 17000 }),
    // No August key: unbilled.
    row('51150', 'Posters', 'cogs', { '2026-06': 26335.76, '2026-07': 33710.98 }),
    row('61000', 'Rent', 'opex', { '2026-08': 12000 }),
    row(null, 'Foreign Currency Gains and Losses', 'opex', { '2026-08': 150 }),
  ]
}

describe('buildAccountActuals', () => {
  it("'income' is the statement's Revenue subtotal and excludes Other Income", () => {
    const a = buildAccountActuals(ledger(), [], '2026-08', 2, [])
    expect(a.totals.income['2026-08']).toBe(527561.8)
    // 81000 is other_income: nowhere in the four totals.
    expect(a.totals.income['2026-07']).toBeUndefined()
  })

  it('buckets cost of sales, operating expenses and gross profit by the same rule', () => {
    const a = buildAccountActuals(ledger(), [], '2026-08', 3, [])
    expect(a.totals.cost_of_sales).toEqual({ '2026-06': 26335.76, '2026-07': 84812.98, '2026-08': 50924.95 })
    expect(a.totals.operating_expenses).toEqual({ '2026-08': 12150 })
    expect(a.totals.gross_profit['2026-08']).toBe(476636.85)
    // A month with cost of sales and no income is a negative gross profit, not absent.
    expect(a.totals.gross_profit['2026-07']).toBe(-84812.98)
  })

  it("an account_mappings report_category overrides the account_type — matched by name, as the statement matches", () => {
    const a = buildAccountActuals(
      ledger(),
      [
        { xero_account_name: 'Shipping', report_category: 'Other Income' },
        { xero_account_name: 'Bank Interest Income', report_category: 'Revenue' },
      ],
      '2026-08', 1, [],
    )
    expect(a.totals.income['2026-08']).toBe(Math.round((527561.8 - 36699.46 + 110.93) * 100) / 100)
  })

  it('a mapping with no category falls back to the account type', () => {
    const a = buildAccountActuals(ledger(), [{ xero_account_name: 'Shipping', report_category: null }], '2026-08', 1, [])
    expect(a.totals.income['2026-08']).toBe(527561.8)
  })

  it('absent months stay absent — no zero-fill — and nothing past the end month is read', () => {
    const a = buildAccountActuals(ledger(), [], '2026-08', 3, ['55000', '51150'])
    expect(a.months).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(a.accounts['51150'].values).toEqual({ '2026-06': 26335.76, '2026-07': 33710.98 })
    expect('2026-08' in a.accounts['51150'].values).toBe(false)
    // September is the month in progress.
    expect(a.accounts['55000'].values).toEqual({ '2026-07': 51102, '2026-08': 50924.95 })
    expect(a.totals.operating_expenses['2026-07']).toBeUndefined()
  })

  it('a code not in the ledger has no entry; only requested codes are returned', () => {
    const a = buildAccountActuals(ledger(), [], '2026-08', 1, ['55000', '99999'])
    expect(Object.keys(a.accounts)).toEqual(['55000'])
  })

  it('sums a renamed account’s two rows under its code and names it as Xero does today', () => {
    const rows = [
      row('6380.30', 'Contractors (Alistair)', 'opex', { '2026-06': 100 }, '2026-07-01T00:00:00Z'),
      row('6380.30', 'Contractors (Alistair, R&P Green)', 'opex', { '2026-07': 200, '2026-08': 300 }, '2026-09-01T00:00:00Z'),
    ]
    const a = buildAccountActuals(rows, [], '2026-08', 3, ['6380.30'])
    expect(a.accounts['6380.30']).toEqual({
      name: 'Contractors (Alistair, R&P Green)', account_type: 'opex',
      values: { '2026-06': 100, '2026-07': 200, '2026-08': 300 },
    })
  })

  it('first_synced_month looks at the whole ledger, not just the window; synced_at is the newest write', () => {
    const rows = [...ledger(), row('41000', 'Canvas Sales', 'revenue', { '2025-07': 1 }, '2026-09-14T04:00:00Z')]
    const a = buildAccountActuals(rows, [], '2026-08', 1, [])
    expect(a.first_synced_month).toBe('2025-07')
    expect(a.synced_at).toBe('2026-09-14T04:00:00Z')
    expect(buildAccountActuals([], [], '2026-08', 1, []).first_synced_month).toBeNull()
  })

  it('ignores null values rather than counting them as a posting', () => {
    const a = buildAccountActuals([row('55000', 'Freight', 'cogs', { '2026-08': null })], [], '2026-08', 1, ['55000'])
    expect(a.accounts['55000'].values).toEqual({})
    expect(a.first_synced_month).toBeNull()
  })
})

describe('accountActualsRefusal', () => {
  const aud = { tenant_id: TENANT, functional_currency: 'AUD' }

  it('lets a single AUD organisation through', () => {
    expect(accountActualsRefusal({ activeConnections: [aud], rows: ledger(), rowTenantConnections: [aud] })).toBeNull()
  })

  it('refuses two connected organisations (Dragon) — codes are per org', () => {
    const reason = accountActualsRefusal({
      activeConnections: [aud, { tenant_id: 't2', functional_currency: 'AUD' }],
      rows: ledger(),
      rowTenantConnections: [aud],
    })
    expect(reason).toContain('2 Xero organisations')
  })

  it('refuses a ledger holding two tenants even when only one is still connected', () => {
    const reason = accountActualsRefusal({
      activeConnections: [aud],
      rows: [...ledger(), { tenant_id: 'old-org' }],
      rowTenantConnections: [aud],
    })
    expect(reason).toContain('2 Xero organisations')
  })

  it('refuses HKD (IICT), and fails closed on an unrecorded currency', () => {
    const hkd = { tenant_id: TENANT, functional_currency: 'HKD' }
    expect(accountActualsRefusal({ activeConnections: [hkd], rows: ledger(), rowTenantConnections: [hkd] })).toContain('HKD')
    const unknown = { tenant_id: TENANT, functional_currency: null }
    expect(accountActualsRefusal({ activeConnections: [], rows: ledger(), rowTenantConnections: [unknown] })).toContain('not recorded')
    // A ledger whose org has no connection row left at all is the same case.
    expect(accountActualsRefusal({ activeConnections: [], rows: ledger(), rowTenantConnections: [] })).toContain('not recorded')
  })
})

describe('listLedgerAccounts — what the ratio settings panel may offer', () => {
  it('lists every coded ledger account once, in code order, with the subtotal it sums into', () => {
    const list = listLedgerAccounts(ledger(), [])
    expect(list.accounts.map((a) => a.code)).toEqual([
      '200', '41000', '41140', '41150', '41200', '41300', '41600', '41700', '41750',
      '42010', '43000', '44000', '44250', '48000', '51150', '55000', '61000', '81000',
    ])
    expect(list.accounts.find((a) => a.code === '55000')).toEqual({ code: '55000', name: 'Freight to Customer', bucket: 'cost_of_sales' })
    expect(list.accounts.find((a) => a.code === '41700')?.bucket).toBe('income')
    expect(list.accounts.find((a) => a.code === '61000')?.bucket).toBe('operating_expenses')
    // Other Income is on the ledger but in no statement total.
    expect(list.accounts.find((a) => a.code === '81000')?.bucket).toBeNull()
  })

  it('leaves out the codeless row a ratio cannot name, and counts it', () => {
    const list = listLedgerAccounts(ledger(), [])
    expect(list.accounts.some((a) => a.name === 'Foreign Currency Gains and Losses')).toBe(false)
    expect(list.codeless_count).toBe(1)
  })

  it('every listed code is a code buildAccountActuals finds — the reason the list reads the ledger', () => {
    const list = listLedgerAccounts(ledger(), [])
    const codes = list.accounts.map((a) => a.code)
    const built = buildAccountActuals(ledger(), [], '2026-08', 3, codes)
    expect(Object.keys(built.accounts).sort()).toEqual([...codes].sort())
  })

  it('groups by the same mapping rule the totals use', () => {
    const mappings = [{ xero_account_name: 'Shipping', report_category: 'Other Income' }]
    const list = listLedgerAccounts(ledger(), mappings)
    expect(list.accounts.find((a) => a.code === '44000')?.bucket).toBeNull()
  })

  it('a renamed account is listed once, under the name Xero shows today', () => {
    const rows = [
      row('6380.30', 'Contractors (Alistair, R&P Green)', 'opex', { '2026-07': 200 }, '2026-09-01T00:00:00Z'),
      row('6380.30', 'Contractors (Alistair)', 'opex', { '2026-06': 100 }, '2026-07-01T00:00:00Z'),
    ]
    expect(listLedgerAccounts(rows, []).accounts).toEqual([
      { code: '6380.30', name: 'Contractors (Alistair, R&P Green)', bucket: 'operating_expenses' },
    ])
  })
})

describe('monthsEndingAt', () => {
  it('crosses a year boundary', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
