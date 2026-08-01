/**
 * Regression tests: cross-tenant IDOR fix for /api/team/org-chart.
 *
 * The org chart is stored per business OWNER (team_data.user_id = owner). The
 * old handler read/wrote whatever `user_id` the CLIENT supplied against a
 * service-role client, so any authenticated user could read or overwrite any
 * other user's chart by passing their id.
 *
 * The fix: the client-supplied `user_id` is ignored entirely. Access is
 * authorized against `business_id` via verifyBusinessAccess(), and the storage
 * key (owner) is resolved server-side via getBusinessOwnerId().
 *
 * These tests assert the security property directly:
 *   1. GET with a business the caller can't access → 403 (never leaks data),
 *      regardless of any `user_id` in the query.
 *   2. GET with access → the DB is queried for the SERVER-resolved owner, never
 *      the client-supplied `user_id`.
 *   3. POST without access → 403 and no write.
 *   4. POST with access → the row is written for the SERVER-resolved owner,
 *      never the client-supplied `user_id`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Sentry (no-op) ───────────────────────────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// ── with-schema wrappers: pass-through so we call the raw handlers ───────────
vi.mock('@/lib/api/with-schema', () => ({
  withSchema: (_n: string, _s: unknown, handler: any) => handler,
  withQuerySchema: (_n: string, _s: unknown, handler: any) => handler,
}))

// ── supabase key helpers (called at module load) ─────────────────────────────
vi.mock('@/lib/supabase/keys', () => ({
  getSupabasePublishableKey: () => 'anon',
  getSupabaseSecretKey: () => 'secret',
}))

// ── cookies() ────────────────────────────────────────────────────────────────
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

// ── auth: getAuthUser resolves to a fixed caller ─────────────────────────────
const CALLER_ID = 'caller-user'
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: CALLER_ID } } }) },
  }),
}))

// ── service-role admin client: capture team_data reads/writes ────────────────
const eqSpy = vi.fn()
const upsertSpy = vi.fn(() => ({ error: null }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          eqSpy(col, val)
          return { maybeSingle: async () => ({ data: { org_chart: { secret: true } }, error: null }) }
        },
      }),
      upsert: (data: any, opts: any) => upsertSpy(data, opts),
    }),
  }),
}))

// ── access layer: controlled per test ────────────────────────────────────────
const verifyBusinessAccessMock = vi.fn()
const getBusinessOwnerIdMock = vi.fn()
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...a: any[]) => verifyBusinessAccessMock(...a),
  getBusinessOwnerId: (...a: any[]) => getBusinessOwnerIdMock(...a),
}))

import { GET, POST } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('team/org-chart IDOR fix', () => {
  it('GET: forbids reading a business the caller cannot access (and ignores client user_id)', async () => {
    verifyBusinessAccessMock.mockResolvedValue(false)

    const res: any = await GET(
      new Request('http://x/api/team/org-chart?business_id=BIZ&user_id=VICTIM'),
    )

    expect(res.status).toBe(403)
    // No data was read for anyone.
    expect(eqSpy).not.toHaveBeenCalled()
    // Access was checked against the business_id, not the spoofed user_id.
    expect(verifyBusinessAccessMock).toHaveBeenCalledWith(CALLER_ID, 'BIZ')
  })

  it('GET: with access, reads the SERVER-resolved owner — not the client user_id', async () => {
    verifyBusinessAccessMock.mockResolvedValue(true)
    getBusinessOwnerIdMock.mockResolvedValue('real-owner')

    const res: any = await GET(
      new Request('http://x/api/team/org-chart?business_id=BIZ&user_id=VICTIM'),
    )

    expect(res.status).toBe(200)
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'real-owner')
    expect(eqSpy).not.toHaveBeenCalledWith('user_id', 'VICTIM')
  })

  it('POST: forbids writing to a business the caller cannot access, and does not write', async () => {
    verifyBusinessAccessMock.mockResolvedValue(false)

    const res: any = await POST(
      new Request('http://x/api/team/org-chart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ org_chart: { a: 1 }, business_id: 'BIZ', user_id: 'VICTIM' }),
      }),
    )

    expect(res.status).toBe(403)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('POST: with access, writes for the SERVER-resolved owner — not the client user_id', async () => {
    verifyBusinessAccessMock.mockResolvedValue(true)
    getBusinessOwnerIdMock.mockResolvedValue('real-owner')

    const res: any = await POST(
      new Request('http://x/api/team/org-chart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ org_chart: { a: 1 }, business_id: 'BIZ', user_id: 'VICTIM' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const [writtenRow] = upsertSpy.mock.calls[0]
    expect(writtenRow.user_id).toBe('real-owner')
    expect(writtenRow.user_id).not.toBe('VICTIM')
  })
})
