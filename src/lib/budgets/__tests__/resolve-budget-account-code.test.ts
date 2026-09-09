/**
 * The account code is the join key, and losing it costs money twice.
 *
 * `resolveInForceVersion` used to select everything about a budget line EXCEPT
 * the one field that is the same string on the budget side and the actuals
 * side, then group the lines by account NAME. That produced two failures with
 * opposite signs:
 *
 *   - matching fell entirely to lowercase/punctuation-stripped/word-sorted name
 *     matching, which loses whenever a bookkeeper renamed an account on one
 *     side only. Urban Road's P&L says "Foreign Currency Gains and Losses"
 *     where its budget says "Foreign Currency Loss/Gain" — no overlap after
 *     normalisation — so the pack printed that account TWICE, once with the
 *     actual and a $0 budget and once budget-only with a $0 actual.
 *   - two genuinely different Xero accounts that happen to share a name were
 *     merged into one line and their budgets summed, invisibly, because the row
 *     that came out looked perfectly ordinary.
 *
 * The forecast path has no codes and must stay byte-identical; that is asserted
 * here too, because the same function serves both.
 */
import { describe, it, expect } from 'vitest'
import { resolveBudget, budgetLineKey } from '../resolve-budget'

// ── Supabase ─────────────────────────────────────────────────────────────────
/**
 * Honours `.eq()/.in()/.not()/.order()/.limit()/.maybeSingle()`, because the
 * resolution IS a sequence of filters. A harness that ignored `.not()` would
 * let an unlocked version resolve and the assertion would pass for the wrong
 * reason.
 */
function clientOver(tables: Record<string, any[]>) {
  const build = (
    table: string,
    filters: Array<[string, unknown, 'eq' | 'in' | 'not-is']> = [],
    ordered: { col: string; ascending: boolean } | null = null,
  ): any => {
    const run = () => {
      let out = (tables[table] ?? []).filter((row) =>
        filters.every(([col, val, op]) =>
          op === 'in' ? Array.isArray(val) && val.includes(row[col])
          : op === 'not-is' ? (val === null ? row[col] != null : row[col] !== val)
          : row[col] === val,
        ),
      )
      if (ordered) {
        const { col, ascending } = ordered
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)))
      }
      return out
    }
    const self: any = {
      select: () => self,
      eq: (col: string, val: unknown) => build(table, [...filters, [col, val, 'eq']], ordered),
      in: (col: string, val: unknown[]) => build(table, [...filters, [col, val, 'in']], ordered),
      not: (col: string, _op: string, val: unknown) => build(table, [...filters, [col, val, 'not-is']], ordered),
      order: (col: string, opts?: { ascending?: boolean }) =>
        build(table, filters, { col, ascending: opts?.ascending ?? true }),
      limit: (n: number) => ({
        maybeSingle: async () => ({ data: run().slice(0, n)[0] ?? null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: run().slice(0, n), error: null }).then(resolve),
      }),
      single: async () => ({ data: run()[0] ?? null, error: run()[0] ? null : { message: 'not found' } }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: run(), error: null }).then(resolve),
    }
    return self
  }
  return { from: (table: string) => build(table) } as any
}

const BIZ = 'biz-0001'
const PROFILE = 'profile-0001'
const FY = 2027
const MONTHS = ['2026-07', '2026-08']

const VERSION = {
  id: 'v1',
  business_id: BIZ,
  fiscal_year: FY,
  label: 'Overall Budget',
  effective_from: '2026-07',
  version_number: 1,
  locked_at: '2026-09-09T00:00:00Z',
  tenant_id: 'tenant-a',
}

const bLine = (
  id: string,
  account_code: string | null,
  account_name: string,
  month: string,
  amount: number,
  category = 'Operating Expenses',
) => ({ id, budget_version_id: 'v1', business_id: BIZ, account_code, account_name, category, month, amount })

const onStore = (budget_lines: any[]) =>
  resolveBudget(clientOver({ budget_versions: [VERSION], budget_lines }), {
    businessId: BIZ,
    profileId: PROFILE,
    fiscalYear: FY,
    reportMonth: '2026-08',
    months: MONTHS,
    budgetSource: 'budget_version',
    pin: {},
  })

describe('budgetLineKey', () => {
  it('prefers the code, and namespaces it away from names', () => {
    expect(budgetLineKey({ account_code: '62700', account_name: 'Foreign Currency Loss/Gain' })).toBe('code:62700')
    expect(budgetLineKey({ account_code: null, account_name: 'Foreign Currency Loss/Gain' }))
      .toBe('name:foreign currency loss/gain')
    // An account literally named "62700" must not collide with account 62700.
    expect(budgetLineKey({ account_name: '62700' })).not.toBe(budgetLineKey({ account_code: '62700', account_name: 'x' }))
  })

  it('trims and lowercases, so " 62700 " is the same account as "62700"', () => {
    expect(budgetLineKey({ account_code: ' 62700 ', account_name: 'x' })).toBe('code:62700')
    expect(budgetLineKey({ account_code: '51400.A', account_name: 'x' })).toBe('code:51400.a')
  })

  it('treats a blank code as no code — an empty string is not an identity', () => {
    expect(budgetLineKey({ account_code: '  ', account_name: 'General Expenses' })).toBe('name:general expenses')
  })
})

describe('resolveBudget — the budget store carries the account code', () => {
  it('puts account_code on every resolved line', async () => {
    const r = await onStore([
      bLine('l-1', '62700', 'Foreign Currency Loss/Gain', '2026-08', 500),
      bLine('l-2', '62700', 'Foreign Currency Loss/Gain', '2026-07', 400),
    ])
    expect(r.source).toBe('budget_version')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].account_code).toBe('62700')
    expect(r.lines[0].forecast_months).toEqual({ '2026-07': 400, '2026-08': 500 })
  })

  it('does NOT merge two accounts that share a name but differ by code', async () => {
    // The fleet risk. Grouped on the name, these two became one line budgeted
    // 900 in August; the report then showed one row where the chart of accounts
    // has two, and the second account's money was attributed to the first.
    const r = await onStore([
      bLine('l-1', '428.1', 'General Expenses', '2026-08', 500),
      bLine('l-2', '428.2', 'General Expenses', '2026-08', 400),
    ])
    expect(r.lines).toHaveLength(2)
    expect(r.lines.map((l) => l.account_code).sort()).toEqual(['428.1', '428.2'])
    expect(r.lines.map((l) => l.forecast_months['2026-08']).sort()).toEqual([400, 500])
    // Distinct ids, because the route keys the claim guard and the budget-only
    // pass on the id. One shared id and the second account renders $0.
    expect(new Set(r.lines.map((l) => l.id)).size).toBe(2)
  })

  it('still merges the months of ONE account — one row per account per month is the input shape', async () => {
    const r = await onStore([
      bLine('l-1', '428.1', 'General Expenses', '2026-07', 100),
      bLine('l-2', '428.1', 'General Expenses', '2026-08', 200),
    ])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].forecast_months).toEqual({ '2026-07': 100, '2026-08': 200 })
    expect(r.monthsCovered).toBe(2)
  })

  it('falls back to the name for a line with no code at all', async () => {
    // A code-less budget must keep behaving the way a name-keyed budget did,
    // or an import that predates codes silently splits into per-row lines.
    const r = await onStore([
      bLine('l-1', null, 'General Expenses', '2026-07', 100),
      bLine('l-2', null, 'General Expenses', '2026-08', 200),
    ])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].account_code).toBeNull()
    expect(r.lines[0].forecast_months).toEqual({ '2026-07': 100, '2026-08': 200 })
  })
})

describe('resolveBudget — the forecast path is untouched', () => {
  const forecastTables = {
    financial_forecasts: [
      { id: 'fc-1', name: 'Active FY27', fiscal_year: FY, is_active: true, business_id: PROFILE, created_at: '2026-01-01' },
    ],
    forecast_pl_lines: [
      { id: 'bl-1', forecast_id: 'fc-1', account_name: 'General Expenses', category: 'Operating Expenses', forecast_months: { '2026-08': 500 } },
      { id: 'bl-2', forecast_id: 'fc-1', account_name: 'General Expenses', category: 'Operating Expenses', forecast_months: { '2026-08': 400 } },
    ],
  }

  it('resolves the rows verbatim — no account_code property is invented', async () => {
    const r = await resolveBudget(clientOver(forecastTables), {
      businessId: BIZ,
      profileId: PROFILE,
      fiscalYear: FY,
      reportMonth: '2026-08',
      months: MONTHS,
      budgetSource: 'forecast',
      pin: {},
    })

    expect(r.source).toBe('forecast')
    expect(r.forecastId).toBe('fc-1')
    // Byte-identical: the forecast path does no grouping, so duplicate names
    // stay two rows and the objects are the query rows themselves. `in` rather
    // than `?? null`, because an absent property and a null one behave
    // differently in budgetLineKey's consumers.
    expect(r.lines).toHaveLength(2)
    for (const line of r.lines) expect('account_code' in line).toBe(false)
    expect(r.lines).toEqual(forecastTables.forecast_pl_lines)
  })

  it('keys those code-less duplicates on the name, exactly as before', async () => {
    // Both forecast rows are the same account as far as the report is
    // concerned; the budget-only pass must go on suppressing the second.
    const [a, b] = forecastTables.forecast_pl_lines
    expect(budgetLineKey(a)).toBe(budgetLineKey(b))
  })
})
