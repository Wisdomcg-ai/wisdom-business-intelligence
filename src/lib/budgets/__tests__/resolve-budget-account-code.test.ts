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
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { resolveBudget, budgetLineKey } from '../resolve-budget'
import { FakePostgrest } from '@/__tests__/helpers/postgrest-fake'

// ── Supabase ─────────────────────────────────────────────────────────────────
/**
 * Honours `.eq()/.in()/.not()/.gt()/.order()/.limit()/.maybeSingle()`, because
 * the resolution IS a sequence of filters. A harness that ignored `.not()` would
 * let an unlocked version resolve and the assertion would pass for the wrong
 * reason.
 */
function clientOver(tables: Record<string, any[]>) {
  // How many unordered pages this client has served. PostgREST gives no
  // guarantee about the order of an un-ORDERed read, so two page requests
  // against it need not partition the rows — see the page() comment.
  let unorderedPages = 0
  const build = (
    table: string,
    filters: Array<[string, unknown, 'eq' | 'in' | 'not-is' | 'gt']> = [],
    ordered: { col: string; ascending: boolean } | null = null,
  ): any => {
    const run = () => {
      let out = (tables[table] ?? []).filter((row) =>
        filters.every(([col, val, op]) =>
          op === 'in' ? Array.isArray(val) && val.includes(row[col])
          : op === 'not-is' ? (val === null ? row[col] != null : row[col] !== val)
          : op === 'gt' ? String(row[col]) > String(val)
          : row[col] === val,
        ),
      )
      if (ordered) {
        const { col, ascending } = ordered
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)))
      }
      return out
    }
    // PostgREST caps a page at 1000 rows and the resolver pages through
    // budget_lines; a harness without the cap would silently return every row
    // on page one and prove nothing about it.
    //
    // An UNORDERED page is deliberately unstable. Postgres may hand the same
    // query back in a different order between two statements, so pages of an
    // un-ORDERed read overlap and drop rather than partition — which is the
    // whole reason the pager orders by id. A harness that partitioned a stable
    // array either way would pass the cap cases with the ordering deleted, and
    // the ordering half of the fix would be unpinned. Rotating by one more row
    // per page is the cheapest faithful model of that: page two then repeats a
    // row page one already returned and skips one nobody returned.
    const page = (from: number, count: number) => {
      let out = run()
      if (!ordered && out.length > 0) {
        const k = ++unorderedPages % out.length
        out = [...out.slice(k), ...out.slice(0, k)]
      }
      return out.slice(from, from + Math.min(count, 1000))
    }
    const self: any = {
      select: () => self,
      eq: (col: string, val: unknown) => build(table, [...filters, [col, val, 'eq']], ordered),
      in: (col: string, val: unknown[]) => build(table, [...filters, [col, val, 'in']], ordered),
      not: (col: string, _op: string, val: unknown) => build(table, [...filters, [col, val, 'not-is']], ordered),
      gt: (col: string, val: unknown) => build(table, [...filters, [col, val, 'gt']], ordered),
      order: (col: string, opts?: { ascending?: boolean }) =>
        build(table, filters, { col, ascending: opts?.ascending ?? true }),
      range: (from: number, to: number) => ({
        then: (resolve: any) => Promise.resolve({ data: page(from, to - from + 1), error: null }).then(resolve),
      }),
      limit: (n: number) => ({
        maybeSingle: async () => ({ data: run().slice(0, n)[0] ?? null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: page(0, n), error: null }).then(resolve),
      }),
      single: async () => ({ data: run()[0] ?? null, error: run()[0] ? null : { message: 'not found' } }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      // An un-ranged read is capped at 1000 rows, because that is what
      // PostgREST does. A harness that returned everything would let an
      // unpaginated resolver pass this file's cap cases for free.
      then: (resolve: any) => Promise.resolve({ data: run().slice(0, 1000), error: null }).then(resolve),
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

// ─────────────────────────────────────────────────────────────────────────────
// budget_lines is one row per account per month, so the 1000-row PostgREST cap
// is twelve times closer than it looks. Urban Road's version is already 699
// rows and Distinct Directions' 619; 84 budgeted accounts is 1008, and an
// unpaginated read would drop the tail with no error and no warning — an annual
// budget quietly smaller than the one the client approved.
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveBudget — reading past the 1000-row page cap', () => {
  const FY_MONTHS = [
    '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
  ]

  /** `accounts` budgeted accounts × 12 months, $100 a month each. */
  function fullYearBudget(accounts: number) {
    const rows: any[] = []
    for (let a = 0; a < accounts; a++) {
      const code = String(40000 + a)
      for (const [i, month] of FY_MONTHS.entries()) {
        rows.push(bLine(`l-${String(a).padStart(4, '0')}-${i}`, code, `Account ${code}`, month, 100))
      }
    }
    return rows
  }

  const resolveFullYear = (budget_lines: any[]) =>
    resolveBudget(clientOver({ budget_versions: [VERSION], budget_lines }), {
      businessId: BIZ,
      profileId: PROFILE,
      fiscalYear: FY,
      reportMonth: '2026-08',
      months: FY_MONTHS,
      budgetSource: 'budget_version',
      pin: {},
    })

  it('keeps every account when the version is one account past the cap', async () => {
    // 84 × 12 = 1008. Unpaginated, the last 8 rows never arrive.
    const r = await resolveFullYear(fullYearBudget(84))
    expect(r.source).toBe('budget_version')
    expect(r.lines).toHaveLength(84)

    const annual = r.lines.reduce(
      (sum, line) => sum + Object.values(line.forecast_months).reduce((s, v) => s + v, 0),
      0,
    )
    expect(annual).toBe(84 * 12 * 100)
  })

  it('keeps every account across several pages', async () => {
    const r = await resolveFullYear(fullYearBudget(250)) // 3000 rows
    expect(r.lines).toHaveLength(250)
    expect(r.monthsCovered).toBe(12)
  })

  it('does not double-count a row that sits on a page boundary', async () => {
    // The pages have to partition the rows, not overlap them, and ordering by
    // id is what makes that true: the harness serves an un-ORDERed page from a
    // rotating array, so a pager without `.order('id')` gets page two repeating
    // a row from page one and skipping one nobody read. A repeated row silently
    // inflates the very account it lands on, and a skipped one shrinks another
    // — neither raises an error.
    const r = await resolveFullYear(fullYearBudget(84))
    expect(r.lines).toHaveLength(84)
    for (const line of r.lines) {
      expect(Object.keys(line.forecast_months)).toHaveLength(12)
      expect(Object.values(line.forecast_months).every((v) => v === 100)).toBe(true)
    }
  })

  describe('against PostgREST as it answers: Max rows cut, pages by keyset', () => {
    beforeEach(() => {
      vi.mocked(Sentry.captureMessage).mockClear()
    })

    const resolveOn = (db: FakePostgrest) =>
      resolveBudget(db as any, {
        businessId: BIZ,
        profileId: PROFILE,
        fiscalYear: FY,
        reportMonth: '2026-08',
        months: FY_MONTHS,
        budgetSource: 'budget_version',
        pin: {},
      })

    const annualTotal = (lines: Array<{ forecast_months: Record<string, number> }>) =>
      lines.reduce((sum, line) => sum + Object.values(line.forecast_months).reduce((s, v) => s + v, 0), 0)

    it('a revision read with the version it supersedes: the rows past the first 1,000 are the revised months', async () => {
      // The realistic crossing: 70 accounts is 840 rows a version, and an
      // October revision is read together with July's version — 1,680 rows.
      // July's rows sort first, so the rows past 1,000 are nearly all of the
      // revision's October-to-June money.
      const V2 = { ...VERSION, id: 'v2', effective_from: '2026-10', version_number: 2 }
      const rows: any[] = []
      for (const [version, amount] of [['v1', 100], ['v2', 150]] as const) {
        for (let a = 0; a < 70; a++) {
          for (const [i, month] of FY_MONTHS.entries()) {
            rows.push({
              ...bLine(`${version}-${String(a).padStart(4, '0')}-${String(i).padStart(2, '0')}`, String(40000 + a), `Account ${40000 + a}`, month, amount),
              budget_version_id: version,
            })
          }
        }
      }
      const db = new FakePostgrest()
      db.table('budget_versions', [VERSION, V2])
      db.table('budget_lines', rows)

      const r = await resolveOn(db)
      expect(r.source).toBe('budget_version')
      expect(r.lines).toHaveLength(70)
      // Jul–Sep on v1 at $100, Oct–Jun on v2 at $150.
      expect(annualTotal(r.lines)).toBe(70 * (3 * 100 + 9 * 150))
      expect(db.requestsTo('budget_lines').map((p) => p.rowsReturned)).toEqual([1000, 680, 0])
    })

    it('a Max rows cap below the page size: a short page is not the end of the budget', async () => {
      const db = new FakePostgrest()
      db.table('budget_versions', [VERSION])
      db.table('budget_lines', fullYearBudget(84), { maxRows: 400 })

      const r = await resolveOn(db)
      expect(r.lines).toHaveLength(84)
      expect(annualTotal(r.lines)).toBe(84 * 12 * 100)
      expect(db.requestsTo('budget_lines').map((p) => p.rowsReturned)).toEqual([400, 400, 208, 0])
    })

    it('exactly 1,000 rows: the full page is followed by the empty page that ends the read', async () => {
      // 83 accounts × 12 = 996, plus four months of an 84th account.
      const rows = [
        ...fullYearBudget(83),
        ...FY_MONTHS.slice(0, 4).map((month, i) => bLine(`l-0083-${i}`, '40083', 'Account 40083', month, 100)),
      ]
      expect(rows).toHaveLength(1000)
      const db = new FakePostgrest()
      db.table('budget_versions', [VERSION])
      db.table('budget_lines', rows)

      const r = await resolveOn(db)
      expect(r.lines).toHaveLength(84)
      expect(r.lines.find((l) => l.account_code === '40083')?.forecast_months).toEqual({
        '2026-07': 100, '2026-08': 100, '2026-09': 100, '2026-10': 100,
      })
      expect(db.requestsTo('budget_lines').map((p) => p.rowsReturned)).toEqual([1000, 0])
    })

    it('a failed later page is "the approved budget could not be read", never a shorter budget', async () => {
      const db = new FakePostgrest()
      db.table('budget_versions', [VERSION])
      db.table('budget_lines', fullYearBudget(84), { failOnRequest: [1] })

      const r = await resolveOn(db)
      expect(r.source).toBe('none')
      expect(r.noBudgetReason).toBe('budget_read_failed')
      expect(r.lines).toEqual([])
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Budget lines could not all be read'),
        expect.objectContaining({
          tags: { invariant: 'budget-lines-read-incomplete' },
          extra: expect.objectContaining({ reason: 'query_error', rowsRead: 1000 }),
        }),
      )
    })
  })
})
