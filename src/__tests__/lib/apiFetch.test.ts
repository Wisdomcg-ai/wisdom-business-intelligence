import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to test the client-side fetch wrapper
// Since it reads cookies from document.cookie, we mock that

describe('apiFetch', () => {
  let apiFetch: typeof import('@/lib/api/fetch').apiFetch
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    vi.restoreAllMocks()
    // Mock fetch globally
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    // Set a test cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf_token=test-csrf-token-abc123; other_cookie=value',
    })
    // Re-import to get fresh module
    const mod = await import('@/lib/api/fetch')
    apiFetch = mod.apiFetch
  })

  it('adds CSRF token header for POST requests', async () => {
    await apiFetch('/api/test', { method: 'POST', body: '{}' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        'x-csrf-token': 'test-csrf-token-abc123',
      }),
    }))
  })

  it('adds CSRF token header for DELETE requests', async () => {
    await apiFetch('/api/test', { method: 'DELETE' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        'x-csrf-token': 'test-csrf-token-abc123',
      }),
    }))
  })

  it('does NOT add CSRF token for GET requests', async () => {
    await apiFetch('/api/test')

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', expect.not.objectContaining({
      headers: expect.objectContaining({
        'x-csrf-token': expect.any(String),
      }),
    }))
  })

  it('does NOT add CSRF token for HEAD requests', async () => {
    await apiFetch('/api/test', { method: 'HEAD' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', expect.not.objectContaining({
      headers: expect.objectContaining({
        'x-csrf-token': expect.any(String),
      }),
    }))
  })

  it('preserves existing headers when adding CSRF', async () => {
    await apiFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-csrf-token': 'test-csrf-token-abc123',
      }),
    }))
  })
})
