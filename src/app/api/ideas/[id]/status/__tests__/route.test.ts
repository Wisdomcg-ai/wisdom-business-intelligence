/**
 * Phase 61 Plan 04 — PATCH /api/ideas/[id]/status route tests
 *
 * Groups:
 *  A. Auth gate (401)
 *  B. Body validation (400 — missing / non-string / empty `status`)
 *  C. Success (200 with { idea } via supabase.rpc('mark_idea_status'))
 *  D. RPC error mapping (42501 → 403; 22P02 → 400; other → 500 + Sentry)
 *  E. Hygiene (no console.error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'

const createRouteHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}))

let rpcSpy: ReturnType<typeof vi.fn>

type MockOptions = {
  user?: { id: string } | null
  userError?: unknown
  rpcResult?: { data?: unknown; error?: unknown }
}

function makeSupabase(opts: MockOptions = {}) {
  const {
    user = { id: 'user-1' },
    userError = null,
    rpcResult = { data: { id: 'i1', user_id: 'user-1', status: 'approved' }, error: null },
  } = opts

  rpcSpy = vi.fn(() => Promise.resolve({ data: rpcResult.data ?? null, error: rpcResult.error ?? null }))

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
    },
    from: vi.fn(),
    rpc: rpcSpy,
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ideas/i1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = 'i1') {
  return { params: Promise.resolve({ id }) }
}

import { PATCH } from '../route'

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(consoleErrorSpy.mock.calls.length, 'console.error must not be called (Sentry only)').toBe(0)
  consoleErrorSpy.mockRestore()
})

describe('A: Auth gate', () => {
  it('returns 401 when no authenticated user', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ user: null }))
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 401 when getUser returns an error', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ user: null, userError: new Error('auth') }))
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(401)
  })
})

describe('B: Body validation', () => {
  it('returns 400 when status is missing', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({}), makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 when status is not a string', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ status: 123 }), makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 when status is empty string', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ status: '' }), makeCtx())
    expect(res.status).toBe(400)
  })
})

describe('C: Success', () => {
  it("calls supabase.rpc('mark_idea_status', { p_idea_id, p_status }) and returns 200 with { idea }", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(200)
    expect(rpcSpy).toHaveBeenCalledWith('mark_idea_status', { p_idea_id: 'i1', p_status: 'approved' })
    const body = await res.json()
    expect(body.idea).toBeDefined()
    expect(body.idea.id).toBe('i1')
  })

  it('marks is_owner=true when RPC row user_id === auth user.id', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    const body = await res.json()
    expect(body.idea.is_owner).toBe(true)
  })

  it('marks is_owner=false when RPC row user_id !== auth user.id', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: { id: 'i1', user_id: 'other-user', status: 'approved' }, error: null },
    }))
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    const body = await res.json()
    expect(body.idea.is_owner).toBe(false)
  })
})

describe('D: RPC error mapping', () => {
  it('returns 403 when RPC error code is 42501 (visibility denied)', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: null, error: { code: '42501', message: 'access denied' } },
    }))
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/access denied/i)
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })

  it('returns 400 when RPC error code is 22P02 (invalid status)', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: null, error: { code: '22P02', message: 'invalid status' } },
    }))
    const res = await PATCH(makeRequest({ status: 'not-a-real-status' }), makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid status/i)
    expect(body.code).toBe('22P02')
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })

  it('returns 500 and calls Sentry for other RPC error codes', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: null, error: { code: 'XYZ99', message: 'boom' } },
    }))
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    const call = vi.mocked(Sentry.captureException).mock.calls[0]
    expect((call[1] as any)?.tags?.route).toBe('ideas/status')
  })

  it('returns 500 on unexpected throw and calls Sentry', async () => {
    createRouteHandlerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockImplementation(() => {
          throw new Error('boom')
        }),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    })
    const res = await PATCH(makeRequest({ status: 'approved' }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled()
  })
})
