// @vitest-environment node
/**
 * POST /api/budgets/import-spreadsheet — a coach uploads the budget the client
 * is actually held to.
 *
 * Preview first, always: the coach sees which rows matched an account, which
 * are budget-only and which are neither, with the year's totals, before a row
 * is written (IICT-08, DRG-04 option a). Saving writes one locked version per
 * organisation the sheet names, or one business-level version.
 *
 * Tested through the exported POST with a real multipart body — withSchema
 * passes (request, context) and never hands the handler a parsed body, so a
 * route that read its own form is the only one that works (#528).
 *
 * Node environment: the upload is a real multipart request, which jsdom's
 * FormData cannot be serialised into (as the uploaded-pages route's suite does).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DRAGON, DRG, EHC, FY_MONTHS, dragonState, memorySupabase } from '@/lib/budgets/__fixtures__/multi-org-budgets'

const { adminMock, authMock } = vi.hoisted(() => ({ adminMock: { current: null as any }, authMock: { current: null as any } }))

vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/supabase/server', () => ({ createRouteHandlerClient: vi.fn(async () => authMock.current) }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: vi.fn(() => adminMock.current) }))

const FY = [...FY_MONTHS]
const MONTH_HEADER = FY.map((m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`)

function csv(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map((c) => (typeof c === 'string' && /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}

/** Calxa's per-org export, both organisations in one file. */
const DRAGON_CSV = csv([
  ['Business Unit Name', 'Account Number', 'Account Name', ...MONTH_HEADER],
  ['Dragon Roofing Pty Ltd', '477', 'Wages and Salaries - Admin', ...FY.map(() => 26_023)],
  ['EASY HAIL CLAIM PTY LTD', '477', 'Wages and Salaries', ...FY.map(() => 12_000)],
  ['Dragon Roofing Pty Ltd', '9999', 'A Calxa-only account', ...FY.map(() => 1_000)],
])

const writes: any[] = []

/** The fixture's tables, plus the chart of accounts and the inserts the route makes. */
function state() {
  const tables = dragonState({ budgetSource: 'forecast' })
  tables.budget_versions = []
  tables.budget_lines = []
  tables.xero_accounts = [
    { tenant_id: DRG, xero_account_id: 'a1', account_code: '477', account_name: 'Wages and Salaries - Admin', xero_type: 'WAGESEXPENSE', xero_status: 'ACTIVE' },
    { tenant_id: EHC, xero_account_id: 'a2', account_code: '477', account_name: 'Wages and Salaries', xero_type: 'WAGESEXPENSE', xero_status: 'ACTIVE' },
    { tenant_id: DRG, xero_account_id: 'a3', account_code: '485', account_name: 'Subscriptions', xero_type: 'OVERHEADS', xero_status: 'ACTIVE' },
  ]
  tables.monthly_report_snapshots = []
  const mem = memorySupabase(tables)
  return {
    tables,
    client: {
      from: (table: string) => {
        const q: any = mem.from(table)
        q.insert = (rows: any) => {
          const list = Array.isArray(rows) ? rows : [rows]
          writes.push({ table, rows: list })
          const withIds = list.map((r: any, i: number) => ({ ...r, id: r.id ?? `${table}-${(tables[table]?.length ?? 0) + i + 1}` }))
          tables[table] = [...(tables[table] ?? []), ...withIds]
          const ret: any = Promise.resolve({ data: withIds, error: null })
          ret.select = () => ({ single: async () => ({ data: withIds[0], error: null }), then: (r: any) => Promise.resolve({ data: withIds, error: null }).then(r) })
          return ret
        }
        q.update = (patch: any) => ({
          eq: (col: string, val: unknown) => applyUpdate(tables, table, patch, (row) => row[col] === val),
          in: (col: string, vals: unknown[]) => applyUpdate(tables, table, patch, (row) => vals.includes(row[col])),
        })
        return q
      },
    },
  }
}

function applyUpdate(tables: Record<string, any[]>, table: string, patch: any, match: (row: any) => boolean) {
  const rows = tables[table] ?? []
  let touched = 0
  for (const row of rows) if (match(row)) { Object.assign(row, patch); touched++ }
  writes.push({ table, update: patch, touched })
  return Promise.resolve({ data: null, error: null })
}

async function post(fields: Record<string, string>, file?: { name: string; body: string }) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  if (file) form.append('file', new File([file.body], file.name, { type: 'text/csv' }))
  const { POST } = await import('../route')
  const res = await POST(new Request('http://localhost/api/budgets/import-spreadsheet', { method: 'POST', body: form }) as any)
  return { status: res.status, json: (await res.json()) as any }
}

beforeEach(() => {
  writes.length = 0
  const s = state()
  adminMock.current = s.client
  authMock.current = { auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) } }
})

describe('preview', () => {
  it('shows each organisation its own rows, and refuses to save on a row that matches nothing', async () => {
    const { status, json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'preview' },
      { name: 'FY27 Budget.csv', body: DRAGON_CSV },
    )
    expect(status).toBe(200)
    expect(json.preview.months).toEqual(FY)
    const dragon = json.preview.scopes.find((s: any) => s.scope === DRG)
    const easyHail = json.preview.scopes.find((s: any) => s.scope === EHC)
    expect(dragon.rows.map((r: any) => [r.account_name, r.status])).toEqual([
      ['Wages and Salaries - Admin', 'matched'],
      ['A Calxa-only account', 'unmatched'],
    ])
    expect(easyHail.rows.map((r: any) => [r.account_name, r.status])).toEqual([['Wages and Salaries', 'matched']])
    expect(json.preview.can_save).toBe(false)
    expect(json.preview.blocking[0]).toContain('row 4')
    // Nothing was written.
    expect(writes).toEqual([])
    // The chart of accounts comes back, so the coach can map the row.
    expect(json.accounts.find((a: any) => a.code === '485')).toMatchObject({ tenant_id: DRG, name: 'Subscriptions' })
    expect(json.effective_from).toBe('2026-07')
  })

  it('takes the choice that keeps the unmatched row as a budget-only account', async () => {
    const { json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'preview', choices: JSON.stringify({ 4: { action: 'budget_only', account_type: 'opex' } }) },
      { name: 'FY27 Budget.csv', body: DRAGON_CSV },
    )
    expect(json.preview.can_save).toBe(true)
    const dragon = json.preview.scopes.find((s: any) => s.scope === DRG)
    expect(dragon.rows[1]).toMatchObject({ status: 'budget_only', account_type: 'opex' })
    expect(dragon.totals.by_type.opex).toBe((26_023 + 1_000) * 12)
  })
})

describe('save', () => {
  const choices = JSON.stringify({ 4: { action: 'skip' } })

  it('writes one locked version per organisation, with its lines', async () => {
    const { status, json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'save', choices, label: 'FY27 Budget' },
      { name: 'FY27 Budget.csv', body: DRAGON_CSV },
    )
    expect(status).toBe(200)
    expect(json.versions.map((v: any) => [v.tenant_id, v.label, v.version_number, v.effective_from, v.line_count])).toEqual([
      [DRG, 'FY27 Budget', 1, '2026-07', 12],
      [EHC, 'FY27 Budget', 1, '2026-07', 12],
    ])
    const versionRows = writes.filter((w) => w.table === 'budget_versions' && w.rows)
    expect(versionRows).toHaveLength(1)
    expect(versionRows[0].rows.every((r: any) => r.locked_at === null && r.source === 'manual' && r.currency === 'AUD')).toBe(true)
    // Locked only once every line has landed, in one statement.
    const lock = writes.filter((w) => w.table === 'budget_versions' && w.update)
    expect(lock).toHaveLength(1)
    expect(writes.findIndex((w) => w.table === 'budget_lines')).toBeLessThan(writes.indexOf(lock[0]))
    const lines = writes.filter((w) => w.table === 'budget_lines').flatMap((w) => w.rows)
    expect(lines).toHaveLength(24)
    expect(lines.find((l: any) => l.tenant_id === EHC && l.month === '2026-08')).toMatchObject({
      account_code: '477', account_name: 'Wages and Salaries', account_type: 'opex', category: 'Operating Expenses', amount: 12_000, business_id: DRAGON,
    })
  })

  it('refuses the same sheet twice rather than stacking a second version on the same month', async () => {
    await post({ business_id: DRAGON, fiscal_year: '2027', mode: 'save', choices, label: 'FY27 Budget' }, { name: 'FY27 Budget.csv', body: DRAGON_CSV })
    writes.length = 0
    const { status, json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'save', choices, label: 'FY27 Budget' },
      { name: 'FY27 Budget.csv', body: DRAGON_CSV },
    )
    expect(status).toBe(409)
    expect(json.code).toBe('DUPLICATE_IMPORT')
    expect(json.error).toContain('Dragon Roofing Pty Ltd')
    expect(writes).toEqual([])
  })

  it('refuses a row that matches nothing, even when the coach posts save', async () => {
    const { status, json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'save' },
      { name: 'FY27 Budget.csv', body: DRAGON_CSV },
    )
    expect(status).toBe(400)
    expect(json.code).toBe('PREVIEW_BLOCKED')
    expect(writes).toEqual([])
  })

  it('refuses a business-level version while the organisations have their own', async () => {
    await post({ business_id: DRAGON, fiscal_year: '2027', mode: 'save', choices, label: 'FY27 Budget' }, { name: 'FY27 Budget.csv', body: DRAGON_CSV })
    writes.length = 0
    const { status, json } = await post(
      { business_id: DRAGON, fiscal_year: '2027', mode: 'save', scope: 'business', currency: 'AUD' },
      { name: 'Group.csv', body: csv([['Account Code', 'Account Name', ...MONTH_HEADER], ['485', 'Subscriptions', ...FY.map(() => 7_206)]]) },
    )
    expect(status).toBe(400)
    expect(json.code).toBe('MIXED_BUDGET_SCOPES')
    expect(writes).toEqual([])
  })
})

describe('access', () => {
  it('is refused without a session', async () => {
    authMock.current = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
    const { status } = await post({ business_id: DRAGON, fiscal_year: '2027', mode: 'preview' }, { name: 'b.csv', body: DRAGON_CSV })
    expect(status).toBe(401)
  })

  it('is refused without a file', async () => {
    const { status, json } = await post({ business_id: DRAGON, fiscal_year: '2027', mode: 'preview' })
    expect(status).toBe(400)
    expect(json.error).toContain('spreadsheet')
  })
})
