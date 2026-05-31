/**
 * Phase 47 Plan 01 — withSchema / withQuerySchema / isEnforced unit tests
 *
 * TDD RED phase: all tests fail because src/lib/api/with-schema.ts does not exist yet.
 *
 * Covers VALID-01:
 *  - observe mode (default): parse failure → Sentry warning + handler still runs with intact body
 *  - observe mode: valid body → handler runs, no Sentry warning
 *  - enforce mode: parse failure → 400 { error, issues }, handler NOT called
 *  - enforce mode: valid body → handler runs, no 400
 *  - params forwarding: 2nd ctx arg forwarded verbatim (sync + Promise param forms)
 *  - empty / non-JSON body: no throw; schema decides
 *  - withQuerySchema: searchParams object validated, same observe/enforce semantics
 *  - isEnforced: '*' sentinel, explicit comma list, whitespace trim, per-call env read
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { NextResponse } from 'next/server'

// ─── Sentry mock (verified convention) ───────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { withSchema, withQuerySchema, isEnforced } from '../with-schema'

const bodySchema = z.object({ name: z.string() })

function makeRequest(body: unknown, url = 'http://x/y') {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ZOD_ENFORCE_ROUTES
})

// ─── withSchema: observe mode (default) ───────────────────────────────────────
describe('withSchema — observe mode (default, env unset)', () => {
  it('invalid body → logs zod:would-reject AND still runs the handler with intact body', async () => {
    const handler = vi.fn(async (req: Request) => {
      // body stream must still be readable — proves clone-and-forward (Pitfall 1)
      const raw = await req.json()
      return NextResponse.json({ seen: raw })
    })
    const wrapped = withSchema('test/route', bodySchema, handler)
    const res = await wrapped(makeRequest({ name: 123 }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.seen).toEqual({ name: 123 })

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = (Sentry.captureMessage as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(msg).toBe('zod:would-reject')
    expect(opts.level).toBe('warning')
    expect(opts.tags.route).toBe('test/route')
    expect(opts.tags.invariant).toBe('zod_would_reject')
  })

  it('valid body → handler invoked, captureMessage NOT called', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withSchema('test/route', bodySchema, handler)
    const res = await wrapped(makeRequest({ name: 'ok' }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
})

// ─── withSchema: enforce mode ─────────────────────────────────────────────────
describe('withSchema — enforce mode', () => {
  it('invalid body → 400 with { error, issues:flatten }, handler NOT called', async () => {
    process.env.ZOD_ENFORCE_ROUTES = 'test/route'
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withSchema('test/route', bodySchema, handler)
    const res = await wrapped(makeRequest({ name: 123 }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Validation failed')
    // flatten() output: { formErrors, fieldErrors }
    expect(json.issues).toHaveProperty('fieldErrors')
    expect(json.issues.fieldErrors).toHaveProperty('name')
    expect(handler).not.toHaveBeenCalled()
  })

  it('valid body → handler invoked, no 400', async () => {
    process.env.ZOD_ENFORCE_ROUTES = 'test/route'
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withSchema('test/route', bodySchema, handler)
    const res = await wrapped(makeRequest({ name: 'ok' }))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

// ─── withSchema: params forwarding (both signatures) ──────────────────────────
describe('withSchema — params forwarding (Pitfall 4)', () => {
  it('forwards a sync { params: { id } } ctx verbatim (same reference)', async () => {
    const ctx = { params: { id: 'abc' } }
    let seen: unknown
    const handler = vi.fn(async (_req: Request, c: typeof ctx) => {
      seen = c
      return NextResponse.json({ ok: true })
    })
    const wrapped = withSchema('test/route', bodySchema, handler)
    await wrapped(makeRequest({ name: 'ok' }), ctx)
    expect(seen).toBe(ctx) // same object reference
  })

  it('forwards a Promise { params: Promise<{ id }> } ctx verbatim (same reference)', async () => {
    const ctx = { params: Promise.resolve({ id: 'abc' }) }
    let seen: unknown
    const handler = vi.fn(async (_req: Request, c: typeof ctx) => {
      seen = c
      return NextResponse.json({ ok: true })
    })
    const wrapped = withSchema('test/route', bodySchema, handler)
    await wrapped(makeRequest({ name: 'ok' }), ctx)
    expect(seen).toBe(ctx) // wrapper never awaits/destructures ctx
  })
})

// ─── withSchema: empty / non-JSON body (Pitfall 2) ────────────────────────────
describe('withSchema — empty / non-JSON body', () => {
  it('no body + permissive schema z.object({}) → no throw, handler runs', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withSchema('test/route', z.object({}), handler)
    const req = new Request('http://x/y', { method: 'POST' }) // no body
    const res = await wrapped(req)

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('no body + required-field schema → logs in observe, handler still runs', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withSchema('test/route', bodySchema, handler)
    const req = new Request('http://x/y', { method: 'POST' }) // no body → raw undefined
    const res = await wrapped(req)

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })
})

// ─── withQuerySchema ──────────────────────────────────────────────────────────
describe('withQuerySchema', () => {
  const querySchema = z.object({ page: z.string() })

  it('valid query → handler invoked, no Sentry warning', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withQuerySchema('test/query', querySchema, handler)
    const res = await wrapped(new Request('http://x/y?page=2', { method: 'GET' }))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('invalid query (missing param) → logs in observe, handler still runs', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withQuerySchema('test/query', querySchema, handler)
    const res = await wrapped(new Request('http://x/y', { method: 'GET' }))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [, opts] = (Sentry.captureMessage as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts.tags.route).toBe('test/query')
  })

  it('invalid query in enforce mode → 400, handler NOT called', async () => {
    process.env.ZOD_ENFORCE_ROUTES = 'test/query'
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withQuerySchema('test/query', querySchema, handler)
    const res = await wrapped(new Request('http://x/y', { method: 'GET' }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Validation failed')
    expect(json.issues).toHaveProperty('fieldErrors')
    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards ctx (2nd arg) verbatim', async () => {
    const ctx = { params: { id: 'q' } }
    let seen: unknown
    const handler = vi.fn(async (_req: Request, c: typeof ctx) => {
      seen = c
      return NextResponse.json({ ok: true })
    })
    const wrapped = withQuerySchema('test/query', querySchema, handler)
    await wrapped(new Request('http://x/y?page=1', { method: 'GET' }), ctx)
    expect(seen).toBe(ctx)
  })
})

// ─── isEnforced ───────────────────────────────────────────────────────────────
describe('isEnforced', () => {
  it('env unset → false for any route', () => {
    expect(isEnforced('test/route')).toBe(false)
  })

  it("'*' sentinel → true for any route", () => {
    process.env.ZOD_ENFORCE_ROUTES = '*'
    expect(isEnforced('anything/at/all')).toBe(true)
  })

  it('explicit comma list → true only for listed ids', () => {
    process.env.ZOD_ENFORCE_ROUTES = 'a/one,b/two'
    expect(isEnforced('a/one')).toBe(true)
    expect(isEnforced('b/two')).toBe(true)
    expect(isEnforced('c/three')).toBe(false)
  })

  it('trims whitespace around comma-separated ids', () => {
    process.env.ZOD_ENFORCE_ROUTES = '  a/one , b/two  '
    expect(isEnforced('a/one')).toBe(true)
    expect(isEnforced('b/two')).toBe(true)
  })

  it('reads env per-call — return flips when env mutates', () => {
    expect(isEnforced('a/one')).toBe(false)
    process.env.ZOD_ENFORCE_ROUTES = 'a/one'
    expect(isEnforced('a/one')).toBe(true)
    delete process.env.ZOD_ENFORCE_ROUTES
    expect(isEnforced('a/one')).toBe(false)
  })

  it('empty string env → false (filtered to empty set)', () => {
    process.env.ZOD_ENFORCE_ROUTES = ''
    expect(isEnforced('a/one')).toBe(false)
  })
})
