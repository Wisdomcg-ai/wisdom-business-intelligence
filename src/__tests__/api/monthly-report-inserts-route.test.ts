// @vitest-environment node
/**
 * /api/monthly-report/inserts — uploading a month's PDF against a placement,
 * listing the month's uploads, and handing a file back to the export.
 *
 * Through the exported handlers, wrapper and all: withSchema passes the
 * handler only (request, context), so a route that expected a parsed body
 * would read nothing (#528). This one reads its own multipart body.
 *
 * Node environment: the upload is a real multipart request, which jsdom's
 * FormData cannot be serialised into.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
const requireSectionPermission = vi.fn(async (..._a: unknown[]) => ({ allowed: true, reason: 'ok' }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: (...a: unknown[]) => requireSectionPermission(...a) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser }, error: null })) },
  })),
}))
const verifyBusinessAccess = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: (...a: unknown[]) => verifyBusinessAccess(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: () => fake.client }))

import { GET, POST } from '@/app/api/monthly-report/inserts/route'
import { MAX_INSERT_BYTES } from '@/lib/monthly-report/pack-inserts'
import { uploadedPdf, encryptedPdf } from '@/app/finances/monthly-report/services/__tests__/pack-insert-test-pdf'

const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = '9b1f2c3d-0000-4000-8000-000000000001'
const OTHER_BIZ = '11111111-2222-4333-8444-555555555555'
let currentUser: { id: string } | null = { id: 'user-1' }

const LAYOUT = {
  version: 1,
  pages: [
    { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
    { id: 'p2', orientation: 'portrait', widgets: [{ id: 'lumary', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: 'Lumary Income Analysis' }] },
  ],
}

/** An in-memory stand-in for the service-role client: three tables and one bucket. */
function makeFake() {
  const state = {
    settings: [{ business_id: BIZ, pdf_layout: LAYOUT }] as any[],
    profiles: [{ id: PROFILE, business_id: BIZ }] as any[],
    inserts: [] as any[],
    objects: new Map<string, Uint8Array>(),
    removed: [] as string[],
    insertError: null as null | { code: string; message: string },
    selectError: null as null | { code: string; message: string },
  }
  const query = (rows: () => any[], error: () => any = () => null) => {
    const filters: ((r: any) => boolean)[] = []
    let order: { col: string; asc: boolean } | null = null
    const run = () => {
      let out = rows().filter((r) => filters.every((f) => f(r)))
      if (order) out = [...out].sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1))
      return out
    }
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b },
      order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return b },
      limit: () => b,
      maybeSingle: async () => (error() ? { data: null, error: error() } : { data: run()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(error() ? { data: null, error: error() } : { data: run(), error: null }).then(res, rej),
    }
    return b
  }
  const client = {
    from: (table: string) => {
      if (table === 'monthly_report_settings') return query(() => state.settings)
      if (table === 'business_profiles') return query(() => state.profiles)
      if (table === 'monthly_report_inserts') {
        const q = query(() => state.inserts, () => state.selectError)
        q.insert = (row: any) => ({
          select: () => ({
            single: async () => {
              if (state.insertError) return { data: null, error: state.insertError }
              const stored = { created_at: new Date(Date.now() + state.inserts.length).toISOString(), ...row }
              state.inserts.push(stored)
              return { data: stored, error: null }
            },
          }),
        })
        return q
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('report-inserts')
        return {
          upload: async (path: string, body: ArrayBuffer | Uint8Array, opts: { contentType: string; upsert: boolean }) => {
            expect(opts).toEqual({ contentType: 'application/pdf', upsert: false })
            state.objects.set(path, new Uint8Array(body))
            return { data: { path }, error: null }
          },
          download: async (path: string) => {
            const bytes = state.objects.get(path)
            return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: 'Object not found' } }
          },
          remove: async (paths: string[]) => {
            for (const p of paths) { state.objects.delete(p); state.removed.push(p) }
            return { data: [], error: null }
          },
        }
      },
    },
  }
  return { state, client }
}
let fake = makeFake()

async function upload(fields: Record<string, string>, file?: { bytes: Uint8Array; name?: string; type?: string }) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  if (file) form.append('file', new File([file.bytes as BlobPart], file.name ?? 'lumary-aug.pdf', { type: file.type ?? 'application/pdf' }))
  const res = await POST(new NextRequest('http://localhost/api/monthly-report/inserts', { method: 'POST', body: form }))
  return { status: res.status, body: await res.json() }
}
const fields = (over: Record<string, string> = {}) => ({ business_id: BIZ, report_month: '2026-08', widget_id: 'lumary', ...over })

beforeEach(() => {
  fake = makeFake()
  currentUser = { id: 'user-1' }
  verifyBusinessAccess.mockClear()
  verifyBusinessAccess.mockResolvedValue(true)
  requireSectionPermission.mockClear()
})

describe('POST — uploading a month\'s PDF against a placement', () => {
  it('keeps a readable 2-page PDF and records it against businesses.id, the month and the placement', async () => {
    const bytes = await uploadedPdf('LUMARY')
    const { status, body } = await upload(fields(), { bytes })
    expect(status).toBe(200)
    expect(body.insert).toMatchObject({
      business_id: BIZ, report_month: '2026-08', widget_id: 'lumary', label: 'Lumary Income Analysis',
      filename: 'lumary-aug.pdf', page_count: 2, size_bytes: bytes.length, uploaded_by: 'user-1',
    })
    expect(body.insert.storage_path).toMatch(new RegExp(`^${BIZ}/2026-08/lumary/[0-9a-f-]{36}\\.pdf$`))
    expect(fake.state.objects.get(body.insert.storage_path)).toEqual(bytes)
    // The access gates saw the business the caller named.
    expect(verifyBusinessAccess).toHaveBeenCalledWith('user-1', BIZ)
    expect(requireSectionPermission.mock.calls[0][2]).toBe(BIZ)
  })

  it('a caller holding the business_profiles id still files it under businesses.id', async () => {
    const { status, body } = await upload(fields({ business_id: PROFILE }), { bytes: await uploadedPdf('L') })
    expect(status).toBe(200)
    expect(body.insert.business_id).toBe(BIZ)
    expect(body.insert.storage_path.startsWith(`${BIZ}/`)).toBe(true)
  })

  it('refuses a file that is not a PDF, naming why, and keeps nothing', async () => {
    const { status, body } = await upload(fields(), { bytes: new TextEncoder().encode('a,b\n1,2'), name: 'lumary.csv', type: 'text/csv' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/must be a PDF/)
    expect(fake.state.objects.size).toBe(0)
    expect(fake.state.inserts).toHaveLength(0)
  })

  it('refuses a file over the limit before reading it', async () => {
    const big = new Uint8Array(MAX_INSERT_BYTES + 1)
    big.set(new TextEncoder().encode('%PDF-1.7\n'))
    const { status, body } = await upload(fields(), { bytes: big })
    expect(status).toBe(413)
    expect(body.error).toMatch(/at most 3 MB/)
    expect(fake.state.objects.size).toBe(0)
  })

  it('refuses an encrypted PDF with the reason', async () => {
    const { status, body } = await upload(fields(), { bytes: encryptedPdf() })
    expect(status).toBe(400)
    expect(body.error).toMatch(/encrypted or password-protected/)
    expect(fake.state.objects.size).toBe(0)
  })

  it('refuses a placement that is not in the business\'s saved layout', async () => {
    const { status, body } = await upload(fields({ widget_id: 'not-placed' }), { bytes: await uploadedPdf('L') })
    expect(status).toBe(400)
    expect(body.error).toMatch(/saved layout/)
  })

  it('refuses a malformed month or placement id before touching anything', async () => {
    expect((await upload(fields({ report_month: '2026-13' }), { bytes: await uploadedPdf('L') })).status).toBe(400)
    expect((await upload(fields({ widget_id: '../../etc' }), { bytes: await uploadedPdf('L') })).status).toBe(400)
    expect(verifyBusinessAccess).not.toHaveBeenCalled()
  })

  it('403 for a business the caller cannot see; 401 with no session', async () => {
    verifyBusinessAccess.mockResolvedValue(false)
    expect((await upload(fields(), { bytes: await uploadedPdf('L') })).status).toBe(403)
    currentUser = null
    expect((await upload(fields(), { bytes: await uploadedPdf('L') })).status).toBe(401)
    expect(fake.state.objects.size).toBe(0)
  })

  it('before the migration: says the feature is not set up, and takes the file back out of storage', async () => {
    fake.state.insertError = { code: '42P01', message: 'relation "monthly_report_inserts" does not exist' }
    const { status, body } = await upload(fields(), { bytes: await uploadedPdf('L') })
    expect(status).toBe(503)
    expect(body.error).toMatch(/aren't set up in the database yet/)
    expect(fake.state.objects.size).toBe(0)
    expect(fake.state.removed).toHaveLength(1)
  })
})

describe('GET — the month\'s uploads, and a file', () => {
  const get = async (query: string) => GET(new NextRequest(`http://localhost/api/monthly-report/inserts?${query}`))

  it('lists the newest upload per placement — a replacement is a new row', async () => {
    await upload(fields(), { bytes: await uploadedPdf('OLD'), name: 'old.pdf' })
    await upload(fields(), { bytes: await uploadedPdf('NEW', [[612, 792]]), name: 'new.pdf' })
    const res = await get(`business_id=${BIZ}&report_month=2026-08`)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.inserts).toHaveLength(1)
    expect(body.inserts[0]).toMatchObject({ widget_id: 'lumary', filename: 'new.pdf', page_count: 1 })
  })

  it('before the migration: could-not-check, with the reason — never an empty list', async () => {
    fake.state.selectError = { code: 'PGRST205', message: 'Could not find the table' }
    const body = await (await get(`business_id=${BIZ}&report_month=2026-08`)).json()
    expect(body).toMatchObject({ success: true, status: 'unavailable' })
    expect(body.reason).toMatch(/aren't set up/)
    expect(body.inserts).toBeUndefined()
  })

  it('hands back a stored file\'s bytes by id, and only for its own business', async () => {
    const bytes = await uploadedPdf('FILE')
    const { body: posted } = await upload(fields(), { bytes })
    const res = await get(`business_id=${BIZ}&id=${posted.insert.id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)

    const other = await get(`business_id=${OTHER_BIZ}&id=${posted.insert.id}`)
    expect(other.status).toBe(404)
  })

  it('403 when the caller cannot see the business', async () => {
    verifyBusinessAccess.mockResolvedValue(false)
    expect((await get(`business_id=${BIZ}&report_month=2026-08`)).status).toBe(403)
  })
})
