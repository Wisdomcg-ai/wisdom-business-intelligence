/**
 * Phase 44.2 Plan 44.2-06B Task 1 — fetchXeroWithRateLimit unit tests.
 *
 * Mocks global.fetch to assert the rate-limit handler:
 *   - 200 happy path
 *   - 429 with X-Rate-Limit-Problem='concurrent' → 1 retry after 500 ms
 *   - 429 with X-Rate-Limit-Problem='minute' + Retry-After → sleeps that long
 *   - 429 with X-Rate-Limit-Problem='minute' (no Retry-After) → defaults to 60 s
 *   - 429 with X-Rate-Limit-Problem='daily' → throws RateLimitDailyExceededError immediately
 *   - 503 once then 200 → retried once
 *   - 5×503 → throws after attempt 5; backoff sequence asserted
 *   - 401 → no retry; throws
 *
 * Uses vi.useFakeTimers + advanceTimersByTime so we don't actually sleep.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

function makeResponse(
  status: number,
  body: any,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('fetchXeroWithRateLimit', () => {
  it('200 happy path — returns immediately', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeResponse(200, { ok: true }, {
        'X-DayLimit-Remaining': '4995',
        'X-MinLimit-Remaining': '58',
      }),
    )
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')
    const res = await fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // Authorization + xero-tenant-id headers are set on the request.
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    expect((init.headers as any).Authorization).toBe('Bearer tok')
    expect((init.headers as any)['xero-tenant-id']).toBe('tenant-A')
  })

  it('429 concurrent — retries once after 500 ms', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'concurrent' }, {
          'X-Rate-Limit-Problem': 'concurrent',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    const promise = fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    // First fetch returns the 429; client schedules a 500 ms timeout before retry.
    await vi.advanceTimersByTimeAsync(500)
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('429 minute with Retry-After=60 — sleeps 60 s then retries', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'minute' }, {
          'X-Rate-Limit-Problem': 'minute',
          'Retry-After': '60',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    const promise = fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    await vi.advanceTimersByTimeAsync(60_000)
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('429 minute without Retry-After — defaults to 60 s', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'minute' }, {
          'X-Rate-Limit-Problem': 'minute',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    const promise = fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    // Default fallback is 60 s; advance just enough.
    await vi.advanceTimersByTimeAsync(60_000)
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('429 daily — throws RateLimitDailyExceededError immediately, no retry', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeResponse(429, { error: 'daily' }, {
        'X-Rate-Limit-Problem': 'daily',
      }),
    )
    const { fetchXeroWithRateLimit, RateLimitDailyExceededError } = await import(
      '@/lib/xero/xero-api-client'
    )

    await expect(
      fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
        accessToken: 'tok',
        tenantId: 'tenant-A',
      }),
    ).rejects.toBeInstanceOf(RateLimitDailyExceededError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('503 once then 200 — retried once', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse(503, { error: 'service' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    const promise = fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    // Backoff sequence: 1s, 2s, 5s, 15s, 60s. First retry waits 1 s.
    await vi.advanceTimersByTimeAsync(1_000)
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('5×503 — throws after 5 attempts', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    for (let i = 0; i < 5; i++) {
      fetchSpy.mockResolvedValueOnce(makeResponse(503, { error: 'service' }))
    }
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    const promise = fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    // Reject swallowing — make the promise observable, then advance time
    // through the full backoff sequence: 1+2+5+15 = 23 s before the 5th attempt.
    const rejectionPromise = expect(promise).rejects.toThrow(/503|service unavailable|max attempts/i)
    await vi.advanceTimersByTimeAsync(1_000) // before attempt 2
    await vi.advanceTimersByTimeAsync(2_000) // before attempt 3
    await vi.advanceTimersByTimeAsync(5_000) // before attempt 4
    await vi.advanceTimersByTimeAsync(15_000) // before attempt 5
    await rejectionPromise
    expect(fetchSpy).toHaveBeenCalledTimes(5)
  })

  it('401 — no retry; throws', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeResponse(401, { error: 'unauthorized' }),
    )
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')

    await expect(
      fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
        accessToken: 'tok',
        tenantId: 'tenant-A',
      }),
    ).rejects.toThrow(/401|unauthorized/i)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('captures Sentry breadcrumb with X-DayLimit-Remaining on every response', async () => {
    const Sentry = await import('@sentry/nextjs')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeResponse(200, { ok: true }, {
        'X-DayLimit-Remaining': '4995',
        'X-MinLimit-Remaining': '58',
      }),
    )
    const { fetchXeroWithRateLimit } = await import('@/lib/xero/xero-api-client')
    await fetchXeroWithRateLimit('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss', {
      accessToken: 'tok',
      tenantId: 'tenant-A',
    })
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'xero.api',
        data: expect.objectContaining({
          'X-DayLimit-Remaining': '4995',
          'X-MinLimit-Remaining': '58',
        }),
      }),
    )
  })
})
