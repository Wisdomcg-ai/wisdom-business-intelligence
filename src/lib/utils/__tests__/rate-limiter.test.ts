import { describe, it, expect } from 'vitest'
import { checkRateLimit, getClientIP, createRateLimitKey } from '../rate-limiter'

// No UPSTASH_REDIS_REST_URL/TOKEN in the test env → checkRateLimit uses the
// in-memory fallback, which is deterministic.

describe('rate-limiter — in-memory fallback', () => {
  it('allows up to maxRequests then blocks, per identifier', async () => {
    const id = createRateLimitKey('test-route', `id-${Math.random()}`)
    const config = { windowMs: 60_000, maxRequests: 3 }

    const r1 = await checkRateLimit(id, config)
    const r2 = await checkRateLimit(id, config)
    const r3 = await checkRateLimit(id, config)
    const r4 = await checkRateLimit(id, config)

    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
    expect(r4.allowed).toBe(false) // 4th over a limit of 3
    expect(r4.remaining).toBe(0)
  })

  it('tracks identifiers independently', async () => {
    const config = { windowMs: 60_000, maxRequests: 1 }
    const a = await checkRateLimit(`a-${Math.random()}`, config)
    const b = await checkRateLimit(`b-${Math.random()}`, config)
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true) // different key — not affected by a's usage
  })
})

describe('getClientIP — spoof-resistant precedence (R11)', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('https://example.com/api/x', { headers })
  }

  it('uses the platform-verified x-real-ip when present', () => {
    expect(getClientIP(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it('does NOT trust the spoofable leftmost x-forwarded-for; uses the last hop', () => {
    // A client can forge the leftmost entry. We must not return '1.1.1.1'.
    const ip = getClientIP(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))
    expect(ip).toBe('2.2.2.2')
    expect(ip).not.toBe('1.1.1.1')
  })

  it('prefers x-real-ip over x-forwarded-for', () => {
    const ip = getClientIP(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))
    expect(ip).toBe('9.9.9.9')
  })

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIP(req({}))).toBe('unknown')
  })
})
