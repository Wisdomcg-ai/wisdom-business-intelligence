/**
 * Phase 61 Plan 04 — PATCH /api/todos/[id]/complete route tests
 *
 * Groups:
 *  A. Auth gate (401)
 *  B. Body validation (400 — missing / non-boolean `completed`)
 *  C. Success (200 with { task } via supabase.rpc('mark_task_complete'))
 *  D. RPC error mapping (42501 → 403; other → 500 + Sentry)
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
    rpcResult = { data: { id: 't1', user_id: 'user-1', status: 'done', completed_at: '2026-05-14T00:00:00Z' }, error: null },
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
  return new Request('http://localhost/api/todos/t1/complete', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = 't1') {
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
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 401 when getUser returns an error', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ user: null, userError: new Error('auth') }))
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(401)
  })
})

describe('B: Body validation', () => {
  it('returns 400 when completed is missing', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({}), makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 when completed is not a boolean (string)', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ completed: 'true' }), makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 when completed is null', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ completed: null }), makeCtx())
    expect(res.status).toBe(400)
  })
})

describe('C: Success', () => {
  it("calls supabase.rpc('mark_task_complete', { p_task_id, p_completed }) and returns 200 with { task }", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(200)
    expect(rpcSpy).toHaveBeenCalledWith('mark_task_complete', { p_task_id: 't1', p_completed: true })
    const body = await res.json()
    expect(body.task).toBeDefined()
    expect(body.task.id).toBe('t1')
  })

  it('marks is_owner=true when RPC row user_id === auth user.id', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    const body = await res.json()
    expect(body.task.is_owner).toBe(true)
  })

  it('marks is_owner=false when RPC row user_id !== auth user.id', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: { id: 't1', user_id: 'other-user', status: 'done' }, error: null },
    }))
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    const body = await res.json()
    expect(body.task.is_owner).toBe(false)
  })
})

describe('D: RPC error mapping', () => {
  it('returns 403 when RPC error code is 42501 (visibility denied)', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: null, error: { code: '42501', message: 'Task not found or access denied' } },
    }))
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/access denied/i)
    // 42501 is NOT a programmer bug — should NOT be sent to Sentry
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })

  it('returns 500 and calls Sentry for other RPC error codes', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      rpcResult: { data: null, error: { code: 'XYZ99', message: 'boom' } },
    }))
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    const call = vi.mocked(Sentry.captureException).mock.calls[0]
    expect((call[1] as any)?.tags?.route).toBe('todos/complete')
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
    const res = await PATCH(makeRequest({ completed: true }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled()
  })
})
