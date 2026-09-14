/**
 * Shared harness for the FX account split tests — the flag-off golden and the
 * flag-on orchestrator suite.
 *
 * Deliberately records EVERYTHING the orchestrator does at its two I/O
 * boundaries, in order: every Xero URL (with the tenant header it went out
 * under) and every Supabase call (table, operation, payload, filters). The
 * golden test serialises that log and compares it byte for byte with the log
 * captured from origin/main before the split existed, so "flag off changes
 * nothing" is a checked claim rather than a hope.
 *
 * Figures are Urban Road Pty Ltd's (tenant 8519c134): the 15 stored monthly
 * amounts of the merged "Foreign Currency Gains and Losses" row, Jul-25 to
 * Sep-26, read from xero_pl_lines in prod on 14 Sep 2026; the catalog GUIDs of
 * 497/498/499 from xero_accounts. The per-account Jul/Aug/Mar movements come
 * from Xero's own P&L reporting via the read-only Xero MCP — CONSTRUCTED Trial
 * Balance responses, shaped exactly like the committed IICT/JDS TB captures,
 * until the gate-0 capture for this tenant replaces them.
 */

// ─── Urban Road identities ──────────────────────────────────────────────────

export const UR_BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
export const UR_PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
export const UR_TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'
/** The uuid-v5 the P&L parser derives for Urban Road's FXGROUPID row (prod). */
export const UR_FX_GROUP_ID = 'f9638432-1548-5b9f-851f-3dc817398597'

export const ACC_SALES = '11111111-aaaa-4aaa-8aaa-000000000200'
export const ACC_BANK_FEES = '11111111-aaaa-4aaa-8aaa-000000000404'
export const ACC_62700 = 'bc9ba37e-f214-4bbf-b340-bbdf9e9624da'
export const ACC_497 = 'aff02854-908f-42a1-8cd5-017d645854e0'
export const ACC_498 = 'd1459087-2d84-4809-8138-a1d42c1cf219'
export const ACC_499 = '9f5c53b1-e2ba-4cd8-abca-5820f4863d04'

export type CatalogAccount = {
  id: string
  code: string
  name: string
  type: string
  systemAccount?: string
}

export const UR_CATALOG: CatalogAccount[] = [
  { id: ACC_SALES, code: '200', name: 'Sales', type: 'REVENUE' },
  { id: ACC_BANK_FEES, code: '404', name: 'Bank Fees', type: 'EXPENSE' },
  { id: ACC_62700, code: '62700', name: 'Foreign Currency Loss/Gain', type: 'EXPENSE' },
  { id: ACC_497, code: '497', name: 'Bank Revaluations', type: 'EXPENSE', systemAccount: 'BANKCURRENCYGAIN' },
  { id: ACC_498, code: '498', name: 'Unrealised Currency Gains', type: 'EXPENSE', systemAccount: 'UNREALISEDCURRENCYGAIN' },
  { id: ACC_499, code: '499', name: 'Realised Currency Gains', type: 'EXPENSE', systemAccount: 'REALISEDCURRENCYGAIN' },
]

/** Stored merged-row amounts, prod xero_pl_lines, Jul-25..Sep-26. */
export const UR_FX_MERGED: Record<string, number> = {
  '2025-07-01': 136.69,
  '2025-08-01': 697.51,
  '2025-09-01': -313.29,
  '2025-10-01': 506.32,
  '2025-11-01': 170.97,
  '2025-12-01': 179.21,
  '2026-01-01': -159.83,
  '2026-02-01': 149.1,
  '2026-03-01': 368.43,
  '2026-04-01': 209.98,
  '2026-05-01': 156.44,
  '2026-06-01': 1790.14,
  '2026-07-01': 238.61,
  '2026-08-01': 919.25,
  '2026-09-01': 1249.83,
}

/**
 * Per-account month movements [497 Bank Revaluations, 498 Unrealised, 499
 * Realised]. Jul/Aug/Mar are Urban Road's real figures (Xero MCP, 14 Sep 2026).
 * Every other month is CONSTRUCTED to sum exactly to the stored merged amount —
 * those months exercise the pipeline, not a claim about Urban Road's ledger.
 */
export const UR_FX_SPLIT: Record<string, [number, number, number]> = (() => {
  const out: Record<string, [number, number, number]> = {}
  for (const [month, merged] of Object.entries(UR_FX_MERGED)) {
    // Constructed: 497 carries 10.00, 498 carries 20.00, 499 the remainder.
    const rest = Math.round((merged - 30) * 100) / 100
    out[month] = [10, 20, rest]
  }
  out['2026-07-01'] = [76.93, -124.09, 285.77] // real: 238.61
  out['2026-08-01'] = [96.72, 484.27, 338.26] // real: 919.25
  // real: Bank Revaluations (123.21), Unrealised 292.02, Realised 199.63 =
  // 368.44 against the stored merged 368.43 — Xero's per-account rounding.
  out['2026-03-01'] = [-123.21, 292.02, 199.63]
  return out
})()

// ─── Xero response builders ─────────────────────────────────────────────────

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function organisationResponse() {
  return {
    Organisations: [
      { OrganisationID: 'org-ur', Timezone: 'AUSEASTERNSTANDARDTIME', CountryCode: 'AU', BaseCurrency: 'AUD' },
    ],
  }
}

export function accountsResponse(accounts: CatalogAccount[]) {
  return {
    Accounts: accounts.map((a) => ({
      AccountID: a.id,
      Code: a.code,
      Name: a.name,
      Type: a.type,
      Status: 'ACTIVE',
      ...(a.systemAccount ? { SystemAccount: a.systemAccount } : {}),
    })),
  }
}

export type PLRowSpec = { name: string; id: string; amount: number; section: string }

/** Single-period P&L, the shape parsePLSinglePeriod reads (standardLayout=false). */
export function plReport(label: string, rows: PLRowSpec[]) {
  const bySection = new Map<string, PLRowSpec[]>()
  for (const r of rows) {
    const arr = bySection.get(r.section) ?? []
    arr.push(r)
    bySection.set(r.section, arr)
  }
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: label }] },
          ...Array.from(bySection.entries()).map(([title, rs]) => ({
            RowType: 'Section',
            Title: title,
            Rows: rs.map((r) => ({
              RowType: 'Row',
              Cells: [
                { Value: r.name, Attributes: [{ Id: 'account', Value: r.id }] },
                { Value: r.amount.toFixed(2) },
              ],
            })),
          })),
        ],
      },
    ],
  }
}

export type TBRowSpec = { name: string; id: string; movement: number; ytd?: number; section: string }

/**
 * A Reports/TrialBalance response shaped exactly like the committed captures
 * (iict-hk-/jds-trialbalance-*.json): header Account | Debit | Credit | YTD
 * Debit | YTD Credit, the account label carrying its code in brackets, the
 * account Attribute repeated on every cell, a positive movement in Debit and a
 * negative one as a positive Credit, the empty side as ''.
 */
export function tbReport(balanceDate: string, rows: TBRowSpec[]) {
  const cell = (id: string, value: string) => ({ Value: value, Attributes: [{ Value: id, Id: 'account' }] })
  const side = (n: number): [string, string] =>
    n >= 0 ? [n.toFixed(2), ''] : ['', Math.abs(n).toFixed(2)]
  const bySection = new Map<string, TBRowSpec[]>()
  for (const r of rows) {
    const arr = bySection.get(r.section) ?? []
    arr.push(r)
    bySection.set(r.section, arr)
  }
  return {
    Id: 'constructed-tb',
    Status: 'OK',
    ProviderName: 'Business Coaching Platform',
    Reports: [
      {
        ReportID: 'TrialBalance',
        ReportName: 'Trial Balance',
        ReportType: 'TrialBalance',
        ReportTitles: ['Trial Balance', 'Urban Road Pty Ltd', `As at ${balanceDate}`],
        Fields: [],
        Rows: [
          {
            RowType: 'Header',
            Cells: [{ Value: 'Account' }, { Value: 'Debit' }, { Value: 'Credit' }, { Value: 'YTD Debit' }, { Value: 'YTD Credit' }],
          },
          ...Array.from(bySection.entries()).map(([title, rs]) => ({
            RowType: 'Section',
            Title: title,
            Rows: rs.map((r) => {
              const [d, c] = side(r.movement)
              const [yd, yc] = side(r.ytd ?? r.movement)
              return {
                RowType: 'Row',
                Cells: [cell(r.id, r.name), cell(r.id, d), cell(r.id, c), cell(r.id, yd), cell(r.id, yc)],
              }
            }),
          })),
          { RowType: 'Section', Title: '', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total' }] }] },
        ],
      },
    ],
  }
}

export function emptyBalancedBS(balanceDate: string) {
  return {
    Reports: [
      {
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: balanceDate }] },
          {
            RowType: 'Section',
            Title: 'Assets',
            Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Placeholder Asset', Attributes: [{ Id: 'account', Value: 'fffffff1-0000-0000-0000-000000000001' }] },
                  { Value: '0.00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

// ─── URL helpers ────────────────────────────────────────────────────────────

export function monthOfPerMonthUrl(u: string): string | null {
  const f = u.match(/fromDate=(\d{4})-(\d{2})-01/)
  const t = u.match(/toDate=(\d{4})-(\d{2})-\d{2}/)
  if (!f || !t) return null
  if (f[1] !== t[1] || f[2] !== t[2]) return null
  return `${f[1]}-${f[2]}-01`
}

export function fyRange(u: string): { from: string; to: string } | null {
  const f = u.match(/fromDate=(\d{4}-\d{2}-\d{2})/)
  const t = u.match(/toDate=(\d{4}-\d{2}-\d{2})/)
  if (!f || !t) return null
  if (monthOfPerMonthUrl(u)) return null
  return { from: f[1]!, to: t[1]! }
}

export function tbMonthOfUrl(u: string): string | null {
  if (!u.includes('/Reports/TrialBalance')) return null
  const m = u.match(/date=(\d{4})-(\d{2})-\d{2}/)
  return m ? `${m[1]}-${m[2]}-01` : null
}

// ─── Urban Road-shaped router ───────────────────────────────────────────────

export type TenantBook = {
  catalog: CatalogAccount[]
  /** Rows per month tag; the FY-total oracle is their per-account sum. */
  monthRows: (month: string) => PLRowSpec[]
  /** TB movements for a month, or a Response to return instead (failure cases). */
  tb?: (month: string) => TBRowSpec[] | Response
}

export function urbanRoadBook(over: Partial<TenantBook> = {}): TenantBook {
  return {
    catalog: UR_CATALOG,
    monthRows: (month) => [
      { name: 'Sales', id: ACC_SALES, amount: 1000, section: 'Income' },
      { name: 'Bank Fees', id: ACC_BANK_FEES, amount: 55.5, section: 'Less Operating Expenses' },
      ...(month in UR_FX_MERGED
        ? [{ name: 'Foreign Currency Gains and Losses', id: 'FXGROUPID', amount: UR_FX_MERGED[month]!, section: 'Less Operating Expenses' }]
        : []),
    ],
    tb: (month) => urbanRoadTb(month),
    ...over,
  }
}

export function urbanRoadTb(month: string, opts: { omit497?: boolean } = {}): TBRowSpec[] {
  const split = UR_FX_SPLIT[month]
  const rows: TBRowSpec[] = [
    { name: 'Sales (200)', id: ACC_SALES, movement: -1000, section: 'Revenue' },
    { name: 'Bank Fees (404)', id: ACC_BANK_FEES, movement: 55.5, section: 'Expenses' },
  ]
  if (split) {
    if (!opts.omit497) rows.push({ name: 'Bank Revaluations (497)', id: ACC_497, movement: split[0], section: 'Expenses' })
    rows.push({ name: 'Unrealised Currency Gains (498)', id: ACC_498, movement: split[1], section: 'Expenses' })
    rows.push({ name: 'Realised Currency Gains (499)', id: ACC_499, movement: split[2], section: 'Expenses' })
  }
  rows.push({ name: 'Business Bank Account', id: '11111111-aaaa-4aaa-8aaa-000000000090', movement: 944.5, section: 'Assets' })
  return rows
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = parseInt(from.slice(0, 4), 10)
  let m = parseInt(from.slice(5, 7), 10)
  const ty = parseInt(to.slice(0, 4), 10)
  const tm = parseInt(to.slice(5, 7), 10)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export type FetchRecord = { url: string; tenant: string }

/**
 * Route every Xero URL by shape and by the xero-tenant-id header, recording
 * each call in order.
 */
export function routeXero(books: Record<string, TenantBook>, fetches: FetchRecord[]) {
  return async (input: any, init?: any): Promise<Response> => {
    const url = String(input)
    const tenant = String(init?.headers?.['xero-tenant-id'] ?? '')
    fetches.push({ url, tenant })
    const book = books[tenant]
    if (!book) return jsonResponse({ error: `no book for ${tenant}` }, 500)
    if (url.endsWith('/Organisation')) return jsonResponse(organisationResponse())
    if (url.includes('/api.xro/2.0/Accounts')) return jsonResponse(accountsResponse(book.catalog))
    if (url.includes('/Reports/BalanceSheet')) {
      const d = url.match(/date=(\d{4}-\d{2}-\d{2})/)
      return jsonResponse(emptyBalancedBS(d ? d[1]! : ''))
    }
    const tbMonth = tbMonthOfUrl(url)
    if (tbMonth) {
      const tb = book.tb ? book.tb(tbMonth) : []
      if (tb instanceof Response) return tb
      return jsonResponse(tbReport(url.match(/date=(\d{4}-\d{2}-\d{2})/)![1]!, tb))
    }
    if (url.includes('/Reports/ProfitAndLoss')) {
      const cash = url.includes('paymentsOnly=true')
      const scale = cash ? 0.8 : 1
      const month = monthOfPerMonthUrl(url)
      if (month) {
        const rows = book.monthRows(month).map((r) => ({ ...r, amount: Math.round(r.amount * scale * 100) / 100 }))
        return jsonResponse(plReport(month, rows))
      }
      const range = fyRange(url)
      if (range) {
        const sums = new Map<string, PLRowSpec>()
        for (const m of monthsBetween(range.from, range.to)) {
          for (const r of book.monthRows(m)) {
            const cur = sums.get(r.id) ?? { ...r, amount: 0 }
            cur.amount = Math.round((cur.amount + r.amount) * 100) / 100
            sums.set(r.id, cur)
          }
        }
        return jsonResponse(plReport('FY', Array.from(sums.values())))
      }
    }
    return jsonResponse({ error: `unhandled ${url}` }, 500)
  }
}

// ─── Supabase stub ──────────────────────────────────────────────────────────

export type DbEvent = {
  table: string
  op: string
  payload?: unknown
  opts?: unknown
  select?: unknown
  filters: Array<[string, string, unknown]>
}

export type StubConfig = {
  connections: Array<{ id: string; tenant_id: string; tenant_name: string; business_id: string }>
  settings?: { sections: Record<string, unknown> } | null
  /** Rows the xero_pl_lines select returns (filtered by the eq/in filters). */
  storedPlRows?: Array<Record<string, unknown>>
  /** Make the xero_pl_lines select fail. */
  plSelectError?: { message: string; code?: string } | null
  /** The fx_split record of this tenant's previous finished sync_jobs row. */
  priorFxSplit?: Record<string, unknown> | null
  /** Make the previous sync_jobs read fail. */
  syncJobsSelectError?: { message: string; code?: string } | null
}

export function installSupabaseStub(target: any, cfg: StubConfig) {
  const events: DbEvent[] = []
  let jobSeq = 0

  const respond = (st: any) => {
    const ev: DbEvent = { table: st.table, op: st.op, filters: st.filters }
    if (st.payload !== undefined) ev.payload = st.payload
    if (st.opts !== undefined) ev.opts = st.opts
    if (st.select !== undefined) ev.select = st.select
    events.push(ev)

    if (st.op === 'select') {
      let rows: any[] = []
      if (st.table === 'business_profiles') rows = [{ id: UR_PROFILE, business_id: UR_BIZ, fiscal_year_start: 7 }]
      else if (st.table === 'monthly_report_settings') rows = cfg.settings ? [cfg.settings] : []
      else if (st.table === 'xero_connections') rows = cfg.connections
      else if (st.table === 'account_mappings') return { data: null, error: null, count: 1 }
      else if (st.table === 'sync_jobs') {
        if (cfg.syncJobsSelectError) return { data: null, error: cfg.syncJobsSelectError }
        rows = cfg.priorFxSplit ? [{ fx_split: cfg.priorFxSplit }] : []
      }
      else if (st.table === 'xero_pl_lines') {
        if (cfg.plSelectError) return { data: null, error: cfg.plSelectError }
        rows = (cfg.storedPlRows ?? []).filter((r) =>
          st.filters.every(([op, col, val]: [string, string, any]) =>
            op === 'eq' ? r[col] === val : op === 'in' ? (val as any[]).includes(r[col]) : true,
          ),
        )
      }
      return { data: rows, error: null }
    }
    if (st.op === 'insert' && st.table === 'sync_jobs') {
      jobSeq++
      return { data: { id: `tenant-job-${jobSeq}` }, error: null }
    }
    if (st.op === 'delete') return { data: null, error: null, count: 0 }
    return { data: null, error: null }
  }

  target.from = (table: string) => {
    const st: any = { table, op: 'select', filters: [] as Array<[string, string, unknown]> }
    const b: any = {
      select: (cols?: unknown, opts?: unknown) => {
        if (st.op === 'select') {
          st.select = cols
          if (opts !== undefined) st.opts = opts
        }
        return b
      },
      insert: (payload: unknown) => { st.op = 'insert'; st.payload = payload; return b },
      update: (payload: unknown) => { st.op = 'update'; st.payload = payload; return b },
      upsert: (payload: unknown, opts: unknown) => { st.op = 'upsert'; st.payload = payload; st.opts = opts; return b },
      delete: (opts?: unknown) => { st.op = 'delete'; if (opts !== undefined) st.opts = opts; return b },
      eq: (col: string, val: unknown) => { st.filters.push(['eq', col, val]); return b },
      in: (col: string, val: unknown) => { st.filters.push(['in', col, val]); return b },
      not: (col: string, op: string, val: unknown) => { st.filters.push([`not.${op}`, col, val]); return b },
      order: (col: string, opts?: unknown) => { st.filters.push(['order', col, opts ?? null]); return b },
      limit: (n: number) => { st.filters.push(['limit', 'n', n]); return b },
      single: async () => { const r = respond(st); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } },
      maybeSingle: async () => { const r = respond(st); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } },
      then: (resolve: any, reject: any) => Promise.resolve(respond(st)).then(resolve, reject),
    }
    return b
  }
  target.rpc = async (name: string, args: unknown) => {
    events.push({ table: `rpc:${name}`, op: 'rpc', payload: args, filters: [] })
    if (name === 'begin_xero_sync_job') return { data: 'sync-job-outer', error: null }
    return { data: null, error: null }
  }
  return { events }
}

export const UR_CONNECTION = { id: 'conn-ur', tenant_id: UR_TENANT, tenant_name: 'Urban Road Pty Ltd', business_id: UR_BIZ }
export const SECOND_TENANT = 'a2222222-bbbb-4bbb-8bbb-000000000002'
export const SECOND_CONNECTION = { id: 'conn-2', tenant_id: SECOND_TENANT, tenant_name: 'Second Org', business_id: UR_BIZ }
