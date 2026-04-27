import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
})
