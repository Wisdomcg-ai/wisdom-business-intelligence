/**
 * The payroll grid route read its body from an argument withSchema never passes.
 *
 * withSchema (lib/api/with-schema) validates a clone of the body and then calls
 * `handler(request, ...rest)` — the rest being Next's route context, not the
 * parsed body. The route's handler was declared `(request, body)`, so `body`
 * was the context, every field was undefined, and the section-permission check
 * queried `businesses.id = 'undefined'`: Postgres 22P02, a 500, and the pack's
 * Payroll Report printed "the payroll figures could not be loaded" on every
 * export since the page shipped (#504, Sentry WISDOM-BI-22/23). The preview
 * harness calls the loader directly, so its render was always fine.
 *
 * These tests go through the exported POST, wrapper and all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

const requireSectionPermission = vi.fn(async (..._args: unknown[]) => ({ allowed: true, reason: 'ok' }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: (...args: unknown[]) => requireSectionPermission(...args),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}))
const verifyBusinessAccess = vi.fn(async (..._args: unknown[]) => true)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: unknown[]) => verifyBusinessAccess(...args),
}))
const loadPayrollGrid = vi.fn(async (..._args: unknown[]) => ({ data: { months: [], employees: [] } }))
vi.mock('@/lib/monthly-report/payroll-grid-load', () => ({
  loadPayrollGrid: (...args: unknown[]) => loadPayrollGrid(...args),
}))

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'

function post(body: unknown) {
  return new NextRequest('http://localhost/api/monthly-report/payroll-grid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/monthly-report/payroll-grid reads the request body', () => {
  beforeEach(() => {
    requireSectionPermission.mockClear()
    verifyBusinessAccess.mockClear()
    loadPayrollGrid.mockClear()
  })

  it('passes the posted business, month, year and window to the checks and the loader', async () => {
    const { POST } = await import('@/app/api/monthly-report/payroll-grid/route')
    // Next calls a route handler with (request, context).
    const res = await (POST as (req: Request, ctx: unknown) => Promise<Response>)(
      post({ business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027, months: 2 }),
      { params: {} },
    )

    expect(res.status).toBe(200)
    expect(requireSectionPermission).toHaveBeenCalledWith(expect.anything(), 'user-1', BUSINESS, 'finances')
    expect(verifyBusinessAccess).toHaveBeenCalledWith('user-1', BUSINESS)
    expect(loadPayrollGrid).toHaveBeenCalledWith(expect.anything(), {
      business_id: BUSINESS,
      report_month: '2026-08',
      fiscal_year: 2027,
      months: 2,
    })
  })

  it('refuses a request with no business rather than querying for "undefined"', async () => {
    const { POST } = await import('@/app/api/monthly-report/payroll-grid/route')
    const res = await (POST as (req: Request, ctx: unknown) => Promise<Response>)(
      post({ report_month: '2026-08', fiscal_year: 2027 }),
      { params: {} },
    )

    expect(res.status).toBe(400)
    expect(requireSectionPermission).not.toHaveBeenCalled()
    expect(loadPayrollGrid).not.toHaveBeenCalled()
  })
})

describe('no withSchema-wrapped route handler expects the body as an argument', () => {
  // The wrapper never passes one. A handler declared (request, body) gets the
  // route context instead — the defect above, silent until it reaches Postgres.
  it('every wrapped handler reads the body from the request', () => {
    const apiRoot = path.resolve(__dirname, '../../app/api')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name === 'route.ts') {
          const src = fs.readFileSync(full, 'utf8')
          for (const m of src.matchAll(/withSchema\(\s*['"][^'"]+['"]\s*,\s*\w+\s*,\s*(\w+)\s*\)/g)) {
            const handler = m[1]
            const sig = new RegExp(`(?:function\\s+${handler}\\s*\\(|const\\s+${handler}\\s*=\\s*(?:async\\s*)?\\()\\s*\\w+\\s*(?::\\s*\\w+)?\\s*,\\s*(body|payload|input|data|json)\\b`)
            if (sig.test(src)) offenders.push(`${path.relative(apiRoot, full)} (${handler})`)
          }
        }
      }
    }
    walk(apiRoot)
    expect(offenders).toEqual([])
  })
})
