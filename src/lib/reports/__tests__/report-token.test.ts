import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'
import { signReportToken, verifyReportToken } from '../report-token'

const VALID_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

describe('report-token', () => {
  beforeEach(() => {
    vi.stubEnv('REPORT_LINK_SECRET', VALID_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signReportToken returns base64url.base64url format (two non-empty parts)', () => {
    const token = signReportToken('abc-123')
    expect(typeof token).toBe('string')
    const parts = token.split('.')
    expect(parts).toHaveLength(2)
    expect(parts[0].length).toBeGreaterThan(0)
    expect(parts[1].length).toBeGreaterThan(0)
    // base64url charset check (no +, /, = characters)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('verifyReportToken roundtrips a statusId', () => {
    const id = 'abc-123-def-456'
    expect(verifyReportToken(signReportToken(id))).toBe(id)
  })

  it('verifyReportToken returns null for a non-token string', () => {
    expect(verifyReportToken('not-a-token')).toBeNull()
  })

  it('verifyReportToken returns null for tampered signature', () => {
    const token = signReportToken('abc-123')
    const [payload] = token.split('.')
    const tampered = `${payload}.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
    expect(verifyReportToken(tampered)).toBeNull()
  })

  it('verifyReportToken returns null for truncated payload', () => {
    expect(verifyReportToken('abc')).toBeNull()
  })

  it('verifyReportToken returns null when REPORT_LINK_SECRET has rotated between sign and verify', () => {
    const token = signReportToken('abc-123')
    // Rotate the secret
    vi.stubEnv('REPORT_LINK_SECRET', 'rotated-secret-0123456789abcdef0123456789abcdef')
    expect(verifyReportToken(token)).toBeNull()
  })

  it('signReportToken throws when REPORT_LINK_SECRET is missing, with clear message', () => {
    vi.stubEnv('REPORT_LINK_SECRET', '')
    expect(() => signReportToken('abc-123')).toThrow(/REPORT_LINK_SECRET/)
  })

  it('signReportToken throws when statusId is empty', () => {
    expect(() => signReportToken('')).toThrow(/statusId/)
  })

  // ─── R9: expiry ───────────────────────────────────────────────────────────

  it('verifyReportToken accepts a token within its TTL', () => {
    const id = 'status-within-ttl'
    const now = new Date('2026-06-02T00:00:00Z')
    const token = signReportToken(id, { ttlDays: 60, now })
    const later = new Date('2026-07-31T00:00:00Z') // 59 days later — still valid
    expect(verifyReportToken(token, { now: later })).toBe(id)
  })

  it('verifyReportToken rejects a token past its expiry', () => {
    const id = 'status-expired'
    const now = new Date('2026-06-02T00:00:00Z')
    const token = signReportToken(id, { ttlDays: 60, now })
    const later = new Date('2026-08-03T00:00:00Z') // 62 days later — expired
    expect(verifyReportToken(token, { now: later })).toBeNull()
  })

  it('verifyReportToken treats the expiry boundary as expired (>=)', () => {
    const id = 'status-boundary'
    const now = new Date('2026-06-02T00:00:00Z')
    const token = signReportToken(id, { ttlDays: 1, now })
    const atExpiry = new Date('2026-06-03T00:00:00Z') // exactly now + 1 day
    expect(verifyReportToken(token, { now: atExpiry })).toBeNull()
  })

  it('a freshly signed token (default TTL) verifies immediately', () => {
    const id = 'status-default-ttl'
    expect(verifyReportToken(signReportToken(id))).toBe(id)
  })

  it('expiry is inside the signed payload — tampering with it breaks verification', () => {
    const token = signReportToken('status-tamper', { ttlDays: 1, now: new Date('2026-06-02T00:00:00Z') })
    // Re-encode the payload with a far-future expiry but keep the original signature.
    const forged = Buffer.from('status-tamper|99999999999', 'utf8').toString('base64url')
    const sig = token.split('.')[1]
    expect(verifyReportToken(`${forged}.${sig}`)).toBeNull()
  })

  // ─── R9: legacy (pre-R9, no-expiry) tokens within the grace window ──────────

  // A legacy token is `base64url(statusId).hmac(payload)` — no embedded '|expiry'.
  function signLegacyToken(statusId: string, secret: string): string {
    const payload = Buffer.from(statusId, 'utf8').toString('base64url')
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  it('verifyReportToken honors a legacy no-expiry token before the sunset', () => {
    const legacy = signLegacyToken('legacy-status', VALID_SECRET)
    const beforeSunset = new Date('2026-06-15T00:00:00Z') // < 2026-07-02 sunset
    expect(verifyReportToken(legacy, { now: beforeSunset })).toBe('legacy-status')
  })

  it('verifyReportToken rejects a legacy no-expiry token after the sunset', () => {
    const legacy = signLegacyToken('legacy-status', VALID_SECRET)
    const afterSunset = new Date('2026-07-02T00:00:01Z') // >= sunset
    expect(verifyReportToken(legacy, { now: afterSunset })).toBeNull()
  })
})
