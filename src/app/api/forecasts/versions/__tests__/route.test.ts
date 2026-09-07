/**
 * POST /api/forecasts/versions — "Save as New Version" must carry the P&L.
 *
 * Urban Road, 7 Sep 2026: the copy became the ACTIVE forecast with zero
 * forecast_pl_lines (the line insert's error was never read), so the overview
 * read $0 until the next Generate. The contract now: rows are copied with
 * fresh identity/audit fields, and a copy that cannot carry its rows is rolled
 * back and reported as a 500 — never a silently empty version.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureMock(...a), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: 'biz-1', profileId: 'profile-1', all: ['biz-1', 'profile-1'] })),
}))
const createClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createRouteHandlerClient: (...a: unknown[]) => createClientMock(...a) }))

import { POST } from '../route'

const SOURCE = {
  id: 'src-1', business_id: 'profile-1', fiscal_year: 2027, name: 'FY2027 Forecast', is_active: true,
  assumptions: { goals: {} }, forecast_type: 'forecast', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-07T00:00:00Z',
}
const LINE = (over: Record<string, unknown> = {}) => ({
  id: 'row-1', forecast_id: 'src-1', account_code: '200', account_name: 'Sales', category: 'Revenue', subcategory: null,
  sort_order: 1, actual_months: {}, forecast_months: { '2026-07': 100, '2026-08': 200 }, is_from_xero: false, is_manual: false,
  notes: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-07T00:00:00Z', forecast_method: null, analysis: null,
  is_from_payroll: false, computed_at: '2026-09-07T00:00:00Z', deleted_at: null, deleted_by: null, created_by: 'someone-else', updated_by: 'someone-else',
  ...over,
})

type Calls = { inserts: Array<{ table: string; rows: unknown }>; deletes: Array<{ table: string; filters: unknown[] }>; updates: Array<{ table: string; payload: unknown; filters: unknown[] }> }
let calls: Calls

function makeSupabase(opts: { lines?: unknown[]; linesError?: unknown; insertError?: unknown } = {}) {
  const { lines = [LINE()], linesError = null, insertError = null } = opts
  calls = { inserts: [], deletes: [], updates: [] }
  const builder = (table: string, op: { kind: string; payload?: unknown }) => {
    const filters: unknown[] = []
    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['select', 'order', 'limit']) b[m] = vi.fn(chain)
    b.eq = vi.fn((col: string, val: unknown) => { filters.push([col, val]); return b })
    b.is = vi.fn((col: string, val: unknown) => { filters.push([col, 'is', val]); return b })
    b.maybeSingle = vi.fn(async () => (table === 'financial_forecasts' ? { data: SOURCE, error: null } : { data: null, error: null }))
    b.single = vi.fn(async () => ({ data: { ...SOURCE, id: 'new-1', name: 'Copy' }, error: null }))
    const resolve = () => {
      if (op.kind === 'insert') {
        calls.inserts.push({ table, rows: op.payload })
        return { data: null, error: table === 'forecast_pl_lines' ? insertError : null }
      }
      if (op.kind === 'delete') { calls.deletes.push({ table, filters }); return { data: null, error: null } }
      if (op.kind === 'update') { calls.updates.push({ table, payload: op.payload, filters }); return { data: null, error: null } }
      if (table === 'forecast_pl_lines') return { data: linesError ? null : lines, error: linesError }
      return { data: [], error: null }
    }
    ;(b as { then?: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(resolve()).then(res, rej)
    return b
  }
  const from = vi.fn((table: string) => {
    const root = builder(table, { kind: 'select' })
    root.insert = vi.fn((payload: unknown) => {
      const ib = builder(table, { kind: 'insert', payload })
      // insert(...).select().single() for the forecast row
      ib.select = vi.fn(() => ib)
      return ib
    })
    root.update = vi.fn((payload: unknown) => builder(table, { kind: 'update', payload }))
    root.delete = vi.fn(() => builder(table, { kind: 'delete' }))
    return root
  })
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from,
    rpc: vi.fn(async () => ({ data: 2, error: null })),
  }
}

const request = (body: Record<string, unknown> = { forecastId: 'src-1', versionName: 'Copy', versionType: 'forecast' }) =>
  new Request('http://localhost/api/forecasts/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  captureMock.mockReset()
})

describe('POST /api/forecasts/versions — P&L copy', () => {
  it('copies every non-deleted row onto the new version with fresh identity and audit fields', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ lines: [LINE(), LINE({ id: 'row-2', account_code: '400', account_name: 'Advertising', category: 'Operating Expenses' })] }))
    const res = await POST(request())
    expect(res.status).toBe(200)
    const plInsert = calls.inserts.find((i) => i.table === 'forecast_pl_lines')!
    const rows = plInsert.rows as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.forecast_id).toBe('new-1')
      expect(r).not.toHaveProperty('id')
      expect(r).not.toHaveProperty('created_at')
      expect(r).not.toHaveProperty('computed_at')
      expect(r).not.toHaveProperty('deleted_at')
      expect(r.created_by).toBe('user-1')
    }
    expect(rows[0]).toMatchObject({ account_code: '200', forecast_months: { '2026-07': 100, '2026-08': 200 } })
    expect(calls.deletes).toHaveLength(0)
  })

  it('applies What-If parameters to the copied months by category', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ lines: [LINE(), LINE({ id: 'row-2', account_code: '400', category: 'Operating Expenses', forecast_months: { '2026-07': 50 } })] }))
    const res = await POST(request({ forecastId: 'src-1', versionName: 'What if', versionType: 'forecast', parameters: { revenueChange: 10, cogsChange: 0, opexChange: -20 } }))
    expect(res.status).toBe(200)
    const rows = calls.inserts.find((i) => i.table === 'forecast_pl_lines')!.rows as Record<string, { [k: string]: number }>[]
    expect(rows[0].forecast_months['2026-07']).toBeCloseTo(110)
    expect(rows[1].forecast_months['2026-07']).toBeCloseTo(40)
  })

  it('a failed line insert rolls the new version back, re-activates the source, and returns 500 with a Sentry invariant', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ insertError: { message: 'duplicate key', code: '23505' } }))
    const res = await POST(request())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/copy P&L lines/)
    // Rolled back: lines for the new id, then the new forecast row.
    expect(calls.deletes.map((d) => d.table)).toEqual(['forecast_pl_lines', 'financial_forecasts'])
    expect(calls.deletes[1].filters).toContainEqual(['id', 'new-1'])
    // Source made active again (this call had deactivated it).
    const reactivate = calls.updates.find((u) => u.table === 'financial_forecasts' && (u.payload as { is_active?: boolean }).is_active === true)
    expect(reactivate?.filters).toContainEqual(['id', 'src-1'])
    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock.mock.calls[0][1]).toMatchObject({ tags: { invariant: 'version_copy_lines_insert_failed' } })
  })

  it('a failed line read rolls back the same way', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ linesError: { message: 'timeout' } }))
    const res = await POST(request())
    expect(res.status).toBe(500)
    expect(calls.deletes.map((d) => d.table)).toEqual(['forecast_pl_lines', 'financial_forecasts'])
    expect(captureMock.mock.calls[0][1]).toMatchObject({ tags: { invariant: 'version_copy_lines_read_failed' } })
  })

  it('a source with no rows still creates the version (nothing to copy is not an error)', async () => {
    createClientMock.mockResolvedValue(makeSupabase({ lines: [] }))
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(calls.inserts.some((i) => i.table === 'forecast_pl_lines')).toBe(false)
  })
})
