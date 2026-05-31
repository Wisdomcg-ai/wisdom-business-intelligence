/**
 * R31 (SEC-N4) — single super-admin source of truth.
 *
 * Two privileged routes had drifted off the canonical `system_roles` table and
 * gated on the legacy `users.system_role` column instead:
 *   - POST /api/admin/reset-password  (resets ANY user's password)
 *   - POST /api/email/send  (type:'custom' — arbitrary WisdomBI-branded email)
 *
 * `users.system_role` is a denormalized fallback column that can drift out of
 * sync with `system_roles` (the source of truth every other privileged route
 * already uses). A super-admin demoted in `system_roles` but stale in `users`
 * would keep these powers; a legitimately-promoted admin missing from `users`
 * would be wrongly denied.
 *
 * These tests lock: (1) both gates query `system_roles` and NEVER `users` for
 * the role decision, and (2) a non-super-admin canonical role yields 403 before
 * any privileged work runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const queriedTables: string[] = []
let roleRow: { role: string } | null = null

function makeAuthClient() {
  return {
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      queriedTables.push(table)
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: roleRow, error: null }),
        single: async () => ({ data: roleRow, error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => makeAuthClient()),
}))
vi.mock('@/lib/security/csrf', () => ({
  csrfProtection: vi.fn(async () => ({ valid: true })),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
  createRateLimitKey: vi.fn(() => 'k'),
  RATE_LIMIT_CONFIGS: { auth: {}, email: {} },
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))
// Module-level service-role admin client in reset-password — must never be
// reached when the gate denies.
const mockAdminUpdateUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => {
      throw new Error('service-role admin client must not run when access is denied')
    },
    auth: { admin: { updateUserById: mockAdminUpdateUser } },
  })),
}))
const mockSendEmail = vi.fn(async (..._a: any[]) => ({ success: true, id: 'e1' }))
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...a: any[]) => mockSendEmail(...a),
  sendPasswordReset: vi.fn(async () => ({ success: true })),
  sendClientInvitation: vi.fn(async () => ({ success: true })),
  sendSessionReminder: vi.fn(async () => ({ success: true })),
  sendMessageNotification: vi.fn(async () => ({ success: true })),
}))

const authedUser = { data: { user: { id: 'user-1' } }, error: null }

beforeEach(() => {
  mockGetUser.mockReset()
  mockSendEmail.mockClear()
  mockAdminUpdateUser.mockReset()
  queriedTables.length = 0
  roleRow = null
  mockGetUser.mockResolvedValue(authedUser)
})

describe('R31 — admin/reset-password super-admin gate', () => {
  it('queries `system_roles` (never `users`) for the role decision', async () => {
    roleRow = { role: 'super_admin' }
    const { POST } = await import('@/app/api/admin/reset-password/route')
    const req = new NextRequest('http://test.local/api/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2', email: 'u2@x.com', action: 'reset' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(queriedTables).toContain('system_roles')
    expect(queriedTables).not.toContain('users')
  })

  it('returns 403 when the canonical role is not super_admin', async () => {
    roleRow = { role: 'coach' }
    const { POST } = await import('@/app/api/admin/reset-password/route')
    const req = new NextRequest('http://test.local/api/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2', email: 'u2@x.com', action: 'reset' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(mockAdminUpdateUser).not.toHaveBeenCalled()
  })
})

describe('R31 — email/send custom super-admin gate', () => {
  function customReq() {
    return new NextRequest('http://test.local/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ type: 'custom', to: 'x@y.com', subject: 's', html: '<p>h</p>' }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('queries `system_roles` (never `users`) and sends when super_admin', async () => {
    roleRow = { role: 'super_admin' }
    const { POST } = await import('@/app/api/email/send/route')
    const res = await POST(customReq())
    expect(res.status).toBe(200)
    expect(queriedTables).toContain('system_roles')
    expect(queriedTables).not.toContain('users')
    expect(mockSendEmail).toHaveBeenCalled()
  })

  it('returns 403 for a non-super_admin and never sends the custom email', async () => {
    roleRow = { role: 'coach' }
    const { POST } = await import('@/app/api/email/send/route')
    const res = await POST(customReq())
    expect(res.status).toBe(403)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  // R32 (SEC-N5): the phishing primitive was the NON-custom types, which used
  // to send to an arbitrary `to` for any authenticated caller. They are now
  // behind the same super_admin gate.
  it('R32: a non-admin cannot send a branded client-invitation to an arbitrary recipient', async () => {
    roleRow = { role: 'client' }
    const { POST } = await import('@/app/api/email/send/route')
    const req = new NextRequest('http://test.local/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-invitation', to: 'victim@elsewhere.com', clientName: 'V' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(queriedTables).toContain('system_roles')
  })
})
