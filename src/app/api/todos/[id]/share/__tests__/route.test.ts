/**
 * Phase 61 Plan 04 — PATCH /api/todos/[id]/share route tests
 *
 * Groups:
 *  A. Auth gate (401)
 *  B. Body validation (400)
 *  C. Visibility / ownership (404 hidden, 403 visible-but-not-owner)
 *  D. Teammate validation (mode='specific')
 *  E. Success paths (private / team / specific)
 *  F. Error handling (Sentry on update failure, 500)
 *  G. Hygiene (no console.error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Sentry mock ─────────────────────────────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'

// ─── Supabase chainable mock ─────────────────────────────────────────────────
const createRouteHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}))

type TableResult = { data: unknown; error?: unknown }
type MockOptions = {
  user?: { id: string } | null
  userError?: unknown
  daily_tasks?: TableResult
  business_users?: TableResult
  updateResult?: TableResult
}

let fromSpy: ReturnType<typeof vi.fn>
let updateSpy: ReturnType<typeof vi.fn>
let updatePatch: Record<string, unknown> | undefined

function makeThenable(result: unknown): Record<string, unknown> {
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = vi.fn(chain)
  b.eq = vi.fn(chain)
  b.in = vi.fn(chain)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  b.single = vi.fn(() => Promise.resolve(result))
  ;(b as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    Promise.resolve(result).then(resolve, reject)
  }
  return b
}

function makeSupabase(opts: MockOptions = {}) {
  const {
    user = { id: 'owner-1' },
    userError = null,
    daily_tasks = { data: { id: 't1', user_id: 'owner-1', business_id: 'biz-1' }, error: null },
    business_users = { data: [], error: null },
    updateResult = { data: { id: 't1', user_id: 'owner-1', business_id: 'biz-1', shared_with_all: false, shared_with: [] }, error: null },
  } = opts

  updatePatch = undefined

  fromSpy = vi.fn((table: string) => {
    if (table === 'daily_tasks') {
      updateSpy = vi.fn((patch: Record<string, unknown>) => {
        updatePatch = patch
        // After .update(), chain to .eq().eq().select().single()
        const updateChain: Record<string, unknown> = {}
        const eq = vi.fn(() => updateChain)
        updateChain.eq = eq
        updateChain.select = vi.fn(() => updateChain)
        updateChain.single = vi.fn(() => Promise.resolve(updateResult))
        return updateChain
      })
      const b = makeThenable(daily_tasks)
      b.update = updateSpy
      return b
    }
    if (table === 'business_users') {
      return makeThenable(business_users)
    }
    return makeThenable({ data: null, error: null })
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: userError,
      }),
    },
    from: fromSpy,
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/todos/t1/share', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = 't1') {
  return { params: Promise.resolve({ id }) }
}

import { PATCH } from '../route'

// ─── Console hygiene ────────────────────────────────────────────────────────
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(consoleErrorSpy.mock.calls.length, 'console.error must not be called (Sentry only)').toBe(0)
  consoleErrorSpy.mockRestore()
})

// ═══════════════════════════════════════════════════════════════════════════
// Group A — Auth gate
// ═══════════════════════════════════════════════════════════════════════════
describe('A: Auth gate', () => {
  it('returns 401 when no authenticated user', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ user: null }))
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 401 when getUser returns an error', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ user: null, userError: new Error('auth') }))
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group B — Body validation
// ═══════════════════════════════════════════════════════════════════════════
describe('B: Body validation', () => {
  it('returns 400 when mode is missing', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({}), makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 when mode is invalid', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'invalid' }), makeCtx())
    expect(res.status).toBe(400)
  })

  it("returns 400 when mode='specific' with missing userIds", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'specific' }), makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/at least one teammate/i)
  })

  it("returns 400 when mode='specific' with empty userIds", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'specific', userIds: [] }), makeCtx())
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group C — Visibility / ownership
// ═══════════════════════════════════════════════════════════════════════════
describe('C: Visibility / ownership', () => {
  it('returns 404 when row is not visible (null)', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({ daily_tasks: { data: null, error: null } }))
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(404)
  })

  it('returns 403 when row is visible but user is not owner', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      daily_tasks: { data: { id: 't1', user_id: 'other-user', business_id: 'biz-1' }, error: null },
    }))
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/owner/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group D — Teammate validation
// ═══════════════════════════════════════════════════════════════════════════
describe('D: Teammate validation', () => {
  it("returns 400 when mode='specific' but business_id is null", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      daily_tasks: { data: { id: 't1', user_id: 'owner-1', business_id: null }, error: null },
    }))
    const res = await PATCH(makeRequest({ mode: 'specific', userIds: ['u-a'] }), makeCtx())
    expect(res.status).toBe(400)
  })

  it("returns 400 with invalid array when userIds contains non-members", async () => {
    // business_users returns only 1 valid member out of 2 requested
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      business_users: { data: [{ user_id: 'good-user' }], error: null },
    }))
    const res = await PATCH(makeRequest({ mode: 'specific', userIds: ['good-user', 'bad-user'] }), makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid teammate/i)
    expect(body.invalid).toEqual(['bad-user'])
    // assert no UPDATE was issued (the updateSpy is the .update fn on the from('daily_tasks')
    // builder — it gets created when from() is called for the initial SELECT, but the test
    // confirms it was never invoked as a function)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(updatePatch).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group E — Success paths
// ═══════════════════════════════════════════════════════════════════════════
describe('E: Success', () => {
  it("mode='private' issues update with shared_with_all=false, shared_with=[]", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'private' }), makeCtx())
    expect(res.status).toBe(200)
    expect(updatePatch).toEqual({ shared_with_all: false, shared_with: [] })
    const body = await res.json()
    expect(body.task).toBeDefined()
  })

  it("mode='team' issues update with shared_with_all=true, shared_with=[]", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(200)
    expect(updatePatch).toEqual({ shared_with_all: true, shared_with: [] })
  })

  it("mode='specific' with valid userIds issues update", async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      business_users: { data: [{ user_id: 'u-a' }, { user_id: 'u-b' }], error: null },
    }))
    const res = await PATCH(makeRequest({ mode: 'specific', userIds: ['u-a', 'u-b'] }), makeCtx())
    expect(res.status).toBe(200)
    expect(updatePatch).toEqual({ shared_with_all: false, shared_with: ['u-a', 'u-b'] })
  })

  it('response includes is_owner: true for owner', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase())
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    const body = await res.json()
    expect(body.task.is_owner).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group F — Error handling
// ═══════════════════════════════════════════════════════════════════════════
describe('F: Error handling', () => {
  it('returns 500 and calls Sentry when update errors', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabase({
      updateResult: { data: null, error: { code: 'XYZ', message: 'boom' } },
    }))
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    const call = vi.mocked(Sentry.captureException).mock.calls[0]
    expect((call[1] as any)?.tags?.route).toBe('todos/share')
  })

  it('returns 500 on unexpected throw and calls Sentry', async () => {
    createRouteHandlerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockImplementation(() => {
          throw new Error('boom')
        }),
      },
      from: vi.fn(),
    })
    const res = await PATCH(makeRequest({ mode: 'team' }), makeCtx())
    expect(res.status).toBe(500)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled()
  })
})
