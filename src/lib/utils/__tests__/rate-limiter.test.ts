import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkRateLimit, getClientIP, createRateLimitKey, resolveUpstashCreds } from '../rate-limiter'

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

describe('resolveUpstashCreds — supports KV_ and UPSTASH_ env naming (R11 fix)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads the Vercel Marketplace KV_REST_API_* names', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io')
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
    expect(resolveUpstashCreds()).toEqual({
      url: 'https://kv.example.upstash.io',
      token: 'kv-token',
    })
  })

  it('reads the @upstash default UPSTASH_REDIS_REST_* names', () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://up.example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'up-token')
    expect(resolveUpstashCreds()).toEqual({
      url: 'https://up.example.upstash.io',
      token: 'up-token',
    })
  })

  it('prefers the explicit UPSTASH_ override when both are set', () => {
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io')
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://up.example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'up-token')
    expect(resolveUpstashCreds()?.url).toBe('https://up.example.upstash.io')
  })

  it('returns null when no credentials are present', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    expect(resolveUpstashCreds()).toBeNull()
  })
})
