/**
 * POST /api/monthly-report/account-mappings writes only the fields it was sent.
 *
 * The route used to upsert the whole row on (business_id, xero_account_name)
 * with `|| null` on every column, so any field the caller left out was written
 * as an explicit NULL. The mapping editor saves one control at a time:
 *
 *   handleCategoryChange      sends name/code/type/category/is_confirmed
 *     -> erased forecast_pl_line_id + forecast_pl_line_name (the coach's
 *        budget-line pin, the top tier of budget matching in
 *        monthly-report/generate) and report_subcategory (the expense group)
 *   handleForecastLineChange  sends name/category/forecast line/is_confirmed
 *     -> erased xero_account_code, xero_account_type and report_subcategory
 *
 * Nothing in the editor shows the loss: the control you touched holds the value
 * you chose, and the column you wiped belongs to a different control.
 *
 * These tests go through the exported POST, withSchema wrapper and all, against
 * an in-memory account_mappings that applies UPDATE/INSERT the way Postgres
 * does — an UPDATE touches exactly the columns in its SET list — so they assert
 * the STORED ROW, not the shape of the payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}))
const verifyBusinessAccess = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...a: unknown[]) => verifyBusinessAccess(...a),
}))

// The route builds its service-role client at import time, so the fake has to
// be reachable through a stable object that each test re-points.
let db: FakeTable
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (table: string) => db.from(table) })),
}))

// ── an in-memory account_mappings ───────────────────────────────────────────

type Row = Record<string, any>

/** The table's own defaults, for columns an INSERT does not name. */
const COLUMN_DEFAULTS: Row = {
  xero_account_code: null,
  xero_account_type: null,
  report_subcategory: null,
  forecast_pl_line_id: null,
  forecast_pl_line_name: null,
  is_auto_mapped: false,
  is_confirmed: false,
  mapped_at: null,
}

class FakeTable {
  rows: Row[]
  writes: { op: 'update' | 'insert'; payload: Row }[] = []
  /** Simulates a concurrent writer: runs when an UPDATE matches nothing. */
  onUpdateMiss: (() => void) | null = null

  constructor(seed: Row[] = []) {
    this.rows = seed.map((r) => ({ ...COLUMN_DEFAULTS, ...r }))
  }

  row(name: string): Row | undefined {
    return this.rows.find((r) => r.xero_account_name === name)
  }

  from(table: string) {
    if (table !== 'account_mappings') throw new Error(`unexpected table: ${table}`)
    const self = this
    let op: 'update' | 'insert' | null = null
    let payload: Row = {}
    const filters: [string, unknown][] = []

    const run = (): { data: Row | null; error: Row | null } => {
      if (op === 'update') {
        const hit = self.rows.find((r) => filters.every(([c, v]) => r[c] === v))
        if (!hit) {
          self.onUpdateMiss?.()
          return { data: null, error: null }
        }
        // An UPDATE writes the columns in its SET list and no others.
        Object.assign(hit, payload)
        return { data: { ...hit }, error: null }
      }
      const clash = self.rows.find(
        (r) =>
          r.business_id === payload.business_id &&
          r.xero_account_name === payload.xero_account_name,
      )
      // UNIQUE (business_id, xero_account_name)
      if (clash) return { data: null, error: { code: '23505', message: 'duplicate key value' } }
      const row = { ...COLUMN_DEFAULTS, ...payload, id: `row-${self.rows.length + 1}` }
      self.rows.push(row)
      return { data: { ...row }, error: null }
    }

    const builder: any = {
      update(p: Row) {
        op = 'update'
        payload = p
        self.writes.push({ op: 'update', payload: { ...p } })
        return builder
      },
      insert(p: Row) {
        op = 'insert'
        payload = p
        self.writes.push({ op: 'insert', payload: { ...p } })
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return builder
      },
      select() {
        return builder
      },
      async maybeSingle() {
        return run()
      },
      async single() {
        const res = run()
        if (!res.error && !res.data) {
          return { data: null, error: { code: 'PGRST116', message: 'no rows returned' } }
        }
        return res
      },
    }
    return builder
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────

const BUSINESS = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
const ACCOUNT = 'Wages and Salaries'
const LINE_ID = 'f1e2d3c4-0000-4000-8000-000000000001'

/** The Envisage row as it stood before the editor save that flattened it. */
function seededRow(): Row {
  return {
    id: 'row-1',
    business_id: BUSINESS,
    xero_account_name: ACCOUNT,
    xero_account_code: '477',
    xero_account_type: 'opex',
    report_category: 'Operating Expenses',
    report_subcategory: 'Less Operating Expenses',
    forecast_pl_line_id: LINE_ID,
    forecast_pl_line_name: 'Wages and Salaries',
    is_auto_mapped: true,
    is_confirmed: true,
    mapped_at: '2026-02-16T10:55:34.191Z',
  }
}

function post(body: unknown) {
  return new NextRequest('http://localhost/api/monthly-report/account-mappings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function send(body: unknown) {
  const { POST } = await import('@/app/api/monthly-report/account-mappings/route')
  return (POST as (req: Request, ctx: unknown) => Promise<Response>)(post(body), { params: {} })
}

/** Exactly what AccountMappingEditor.handleCategoryChange sends. */
function categoryChangeBody(row: Row, newCategory: string) {
  return {
    business_id: BUSINESS,
    xero_account_name: row.xero_account_name,
    xero_account_code: row.xero_account_code,
    xero_account_type: row.xero_account_type,
    report_category: newCategory,
    is_confirmed: true,
  }
}

/** Exactly what AccountMappingEditor.handleForecastLineChange sends. */
function forecastLineBody(row: Row, lineId: string | null, lineName: string | null) {
  return {
    business_id: BUSINESS,
    xero_account_name: row.xero_account_name,
    report_category: row.report_category,
    forecast_pl_line_id: lineId || null,
    forecast_pl_line_name: lineName || null,
    is_confirmed: true,
  }
}

describe('POST account-mappings — an omitted field keeps its stored value', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
    verifyBusinessAccess.mockClear()
    db = new FakeTable([seededRow()])
  })

  it('a category change leaves the forecast line link intact', async () => {
    const res = await send(categoryChangeBody(seededRow(), 'Cost of Sales'))
    expect(res.status).toBe(200)

    const row = db.row(ACCOUNT)!
    expect(row.report_category).toBe('Cost of Sales')
    // The columns the caller never mentioned.
    expect(row.forecast_pl_line_id).toBe(LINE_ID)
    expect(row.forecast_pl_line_name).toBe('Wages and Salaries')
    expect(row.report_subcategory).toBe('Less Operating Expenses')
  })

  it('a category change sends no forecast-link or subcategory column at all', async () => {
    await send(categoryChangeBody(seededRow(), 'Cost of Sales'))

    const update = db.writes.find((w) => w.op === 'update')!
    expect(Object.keys(update.payload).sort()).toEqual([
      'business_id',
      'is_confirmed',
      'mapped_at',
      'report_category',
      'updated_at',
      'xero_account_code',
      'xero_account_name',
      'xero_account_type',
    ])
  })

  it('linking a budget line leaves the Xero code, type and expense group intact', async () => {
    const other = 'f1e2d3c4-0000-4000-8000-000000000002'
    const res = await send(forecastLineBody(seededRow(), other, 'Payroll'))
    expect(res.status).toBe(200)

    const row = db.row(ACCOUNT)!
    expect(row.forecast_pl_line_id).toBe(other)
    expect(row.forecast_pl_line_name).toBe('Payroll')
    // The columns the caller never mentioned.
    expect(row.xero_account_code).toBe('477')
    expect(row.xero_account_type).toBe('opex')
    expect(row.report_subcategory).toBe('Less Operating Expenses')
  })

  it('a category change and a link, one after the other, both survive', async () => {
    await send(categoryChangeBody(seededRow(), 'Cost of Sales'))
    await send(forecastLineBody(db.row(ACCOUNT)!, LINE_ID, 'Wages and Salaries'))

    const row = db.row(ACCOUNT)!
    expect(row.report_category).toBe('Cost of Sales')
    expect(row.forecast_pl_line_id).toBe(LINE_ID)
    expect(row.xero_account_code).toBe('477')
    expect(row.xero_account_type).toBe('opex')
    expect(row.report_subcategory).toBe('Less Operating Expenses')
  })

  it('an explicit null still clears — unlinking a budget line works', async () => {
    const res = await send(forecastLineBody(seededRow(), null, null))
    expect(res.status).toBe(200)

    const row = db.row(ACCOUNT)!
    expect(row.forecast_pl_line_id).toBeNull()
    expect(row.forecast_pl_line_name).toBeNull()
    // and still does not take the rest of the row with it
    expect(row.xero_account_code).toBe('477')
    expect(row.report_subcategory).toBe('Less Operating Expenses')
  })

  it('is_confirmed:true stamps mapped_at; leaving it out touches neither', async () => {
    const before = db.row(ACCOUNT)!.mapped_at
    await send(categoryChangeBody(seededRow(), 'Cost of Sales'))
    const stamped = db.row(ACCOUNT)!.mapped_at
    expect(stamped).not.toBe(before)
    expect(Date.parse(stamped)).toBeGreaterThan(Date.parse(before))

    await send({
      business_id: BUSINESS,
      xero_account_name: ACCOUNT,
      report_category: 'Operating Expenses',
    })
    const row = db.row(ACCOUNT)!
    expect(row.mapped_at).toBe(stamped)
    expect(row.is_confirmed).toBe(true)
  })

  it('is_confirmed:false clears mapped_at', async () => {
    await send({
      business_id: BUSINESS,
      xero_account_name: ACCOUNT,
      report_category: 'Operating Expenses',
      is_confirmed: false,
    })
    const row = db.row(ACCOUNT)!
    expect(row.is_confirmed).toBe(false)
    expect(row.mapped_at).toBeNull()
  })
})

describe('POST account-mappings — a first save still creates the row', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
    verifyBusinessAccess.mockClear()
    db = new FakeTable([])
  })

  it('creates the row with the caller’s fields and the table’s defaults', async () => {
    const res = await send({
      business_id: BUSINESS,
      xero_account_name: 'Bank Fees',
      xero_account_code: '404',
      xero_account_type: 'opex',
      report_category: 'Operating Expenses',
      is_confirmed: true,
    })
    expect(res.status).toBe(200)

    const row = db.row('Bank Fees')!
    expect(row.xero_account_code).toBe('404')
    expect(row.report_category).toBe('Operating Expenses')
    expect(row.is_confirmed).toBe(true)
    expect(row.mapped_at).not.toBeNull()
    // Nothing was invented for what the caller did not send.
    expect(row.forecast_pl_line_id).toBeNull()
    expect(row.report_subcategory).toBeNull()
  })

  it('patches, not duplicates, a row another save created mid-request', async () => {
    // The UPDATE finds nothing, a concurrent writer inserts, the INSERT hits
    // the unique key, and the retry has to land on the existing row.
    db.onUpdateMiss = () => {
      db.onUpdateMiss = null
      db.rows.push({
        ...COLUMN_DEFAULTS,
        id: 'racer',
        business_id: BUSINESS,
        xero_account_name: 'Bank Fees',
        report_category: 'Operating Expenses',
        report_subcategory: 'Less Operating Expenses',
        forecast_pl_line_id: LINE_ID,
        forecast_pl_line_name: 'Bank Fees',
      })
    }

    const res = await send({
      business_id: BUSINESS,
      xero_account_name: 'Bank Fees',
      xero_account_code: '404',
      report_category: 'Cost of Sales',
      is_confirmed: true,
    })
    expect(res.status).toBe(200)

    expect(db.rows.filter((r) => r.xero_account_name === 'Bank Fees')).toHaveLength(1)
    const row = db.row('Bank Fees')!
    expect(row.report_category).toBe('Cost of Sales')
    expect(row.xero_account_code).toBe('404')
    // The racing writer's columns are not this request's to clear.
    expect(row.forecast_pl_line_id).toBe(LINE_ID)
    expect(row.report_subcategory).toBe('Less Operating Expenses')
  })
})

describe('POST account-mappings — the gates still hold', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
    verifyBusinessAccess.mockClear()
    verifyBusinessAccess.mockResolvedValue(true)
    db = new FakeTable([seededRow()])
  })

  it('403 for a business the user cannot reach, and writes nothing', async () => {
    verifyBusinessAccess.mockResolvedValue(false)
    const res = await send(categoryChangeBody(seededRow(), 'Cost of Sales'))
    expect(res.status).toBe(403)
    expect(db.writes).toHaveLength(0)
    expect(db.row(ACCOUNT)!.report_category).toBe('Operating Expenses')
  })

  it('400 without a report_category, before any access check or write', async () => {
    const res = await send({ business_id: BUSINESS, xero_account_name: ACCOUNT })
    expect(res.status).toBe(400)
    expect(verifyBusinessAccess).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(0)
  })
})
