import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers before importing the module
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { cookies } from 'next/headers'
import { validateCsrfToken, csrfProtection, generateCsrfToken, getClientCsrfToken } from '@/lib/security/csrf'

describe('generateCsrfToken', () => {
  it('generates a 64-character hex string', () => {
    const token = generateCsrfToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique tokens', () => {
    const token1 = generateCsrfToken()
    const token2 = generateCsrfToken()
    expect(token1).not.toBe(token2)
  })
})

describe('validateCsrfToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when cookie and header tokens match', async () => {
    const token = 'abc123def456'
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: token }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    })

    const result = await validateCsrfToken(request)
    expect(result).toBe(true)
  })

  it('returns false when tokens do not match', async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: 'cookie-token' }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
    })

    const result = await validateCsrfToken(request)
    expect(result).toBe(false)
  })

  it('returns false when no header token provided', async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: 'cookie-token' }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/test', { method: 'POST' })

    const result = await validateCsrfToken(request)
    expect(result).toBe(false)
  })

  it('returns false when no cookie token exists', async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue(undefined) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'some-token' },
    })

    const result = await validateCsrfToken(request)
    expect(result).toBe(false)
  })
})

describe('csrfProtection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips validation for GET requests', async () => {
    const request = new Request('http://localhost/api/test', { method: 'GET' })
    const result = await csrfProtection(request)
    expect(result.valid).toBe(true)
  })

  it('skips validation for auth callback paths', async () => {
    const request = new Request('http://localhost/api/auth/callback', { method: 'POST' })
    const result = await csrfProtection(request)
    expect(result.valid).toBe(true)
  })

  it('skips validation for Xero callback paths', async () => {
    const request = new Request('http://localhost/api/Xero/callback', { method: 'POST' })
    const result = await csrfProtection(request)
    expect(result.valid).toBe(true)
  })

  it('rejects POST requests without valid CSRF token', async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue(undefined) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/team/invite', { method: 'POST' })
    const result = await csrfProtection(request)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid or missing CSRF token')
  })

  it('accepts POST requests with valid CSRF token', async () => {
    const token = 'valid-token-12345'
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: token }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const request = new Request('http://localhost/api/team/invite', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    })
    const result = await csrfProtection(request)
    expect(result.valid).toBe(true)
  })
})

describe('getClientCsrfToken', () => {
  it('returns null in server environment', () => {
    const result = getClientCsrfToken()
    expect(result).toBeNull()
  })
})
