/**
 * Phase 44.2 Plan 44.2-06B Task 1 — Rate-limit-aware Xero API client.
 *
 * Concentrates all 429/5xx/Retry-After logic in one module so the orchestrator
 * (and any future Xero caller) doesn't reinvent it. Replaces the prior
 * `fetch + sleep(300ms)` pattern in sync-orchestrator.ts (44.2-04).
 *
 * Behavior contract (per Xero docs and 44.2-06B-PLAN.md Task 1):
 *   - 200            → return immediately
 *   - 429 concurrent → 1 retry after 500 ms (no Retry-After expected)
 *   - 429 minute     → sleep `Retry-After` seconds (default 60 s if missing); 1 retry
 *   - 429 daily      → throw RateLimitDailyExceededError immediately (caller pauses tenant)
 *   - 5xx            → exponential backoff [1s, 2s, 5s, 15s, 60s]; max 5 attempts
 *   - 4xx other      → no retry; throw with response body
 *   - Every response → Sentry breadcrumb with rate-limit headers for observability
 *
 * Pure-ish: only side effects are `fetch` (caller's network) and Sentry
 * breadcrumbs (caller-side observability). Caller owns concurrency.
 */
import * as Sentry from '@sentry/nextjs'

// ─── Types ──────────────────────────────────────────────────────────────────

export type FetchXeroOpts = {
  accessToken: string
  tenantId: string
  /** Optional AbortSignal so callers can cancel a long-sleeping retry. */
  abortSignal?: AbortSignal
  /** Override max retry attempts on 5xx. Default 5. */
  maxRetries?: number
  /** Override base headers (e.g. add If-Modified-Since). */
  extraHeaders?: Record<string, string>
}

export type FetchXeroResult = {
  ok: boolean
  status: number
  json: any
  headers: Record<string, string>
}

/**
 * Thrown when Xero returns 429 with X-Rate-Limit-Problem='daily'. The caller
 * MUST mark the tenant 'paused' and resume on the next sync — the daily limit
 * is per-org and only resets at midnight UTC.
 */
export class RateLimitDailyExceededError extends Error {
  readonly tenantId: string
  readonly status: number
  constructor(tenantId: string, message: string = 'Xero daily rate limit exceeded') {
    super(message)
    this.name = 'RateLimitDailyExceededError'
    this.tenantId = tenantId
    this.status = 429
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const FIVEXX_BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 60_000]
const CONCURRENT_RETRY_MS = 500
const MINUTE_FALLBACK_SECONDS = 60

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(() => resolve(), ms)
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        },
        { once: true },
      )
    }
  })
}

function headerMap(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function rateLimitBreadcrumb(
  url: string,
  tenantId: string,
  status: number,
  hdrs: Record<string, string>,
): void {
  // Lower-case lookup is safe — fetch's Headers normalizes; but our test
  // helper uses the casing we set, so prefer the original-case keys when
  // present, fallback to lower-case.
  const pick = (k: string): string | undefined =>
    hdrs[k] ?? hdrs[k.toLowerCase()] ?? hdrs[k.toUpperCase()]
  try {
    Sentry.addBreadcrumb({
      category: 'xero.api',
      level: status >= 400 ? 'warning' : 'info',
      message: `${status} ${url}`,
      data: {
        tenant_id: tenantId,
        status,
        'X-DayLimit-Remaining': pick('X-DayLimit-Remaining') ?? '',
        'X-MinLimit-Remaining': pick('X-MinLimit-Remaining') ?? '',
        'X-AppMinLimit-Remaining': pick('X-AppMinLimit-Remaining') ?? '',
        'X-Rate-Limit-Problem': pick('X-Rate-Limit-Problem') ?? '',
        'Retry-After': pick('Retry-After') ?? '',
      },
    })
  } catch {
    // Sentry breadcrumb failures must never abort a Xero call.
  }
}

async function readBodySafe(res: Response): Promise<any> {
  try {
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch {
    return null
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Issue a Xero API GET with rate-limit-aware retries.
 *
 * @returns On success, FetchXeroResult with ok=true and parsed JSON body.
 * @throws  RateLimitDailyExceededError on 429-daily.
 * @throws  Error on other 4xx / exhausted 5xx retries.
 */
export async function fetchXeroWithRateLimit(
  url: string,
  opts: FetchXeroOpts,
): Promise<FetchXeroResult> {
  const maxRetries = opts.maxRetries ?? FIVEXX_BACKOFF_MS.length
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    'xero-tenant-id': opts.tenantId,
    Accept: 'application/json',
    ...(opts.extraHeaders ?? {}),
  }

  let attempt = 0
  let concurrentRetried = false
  let minuteRetried = false

  while (true) {
    attempt++
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: baseHeaders,
        signal: opts.abortSignal,
      })
    } catch (networkErr) {
      // Network error (ECONNRESET, DNS, etc.) — treat as transient. Retries
      // honor the same 5xx backoff sequence; abort propagates.
      if ((networkErr as any)?.name === 'AbortError') throw networkErr
      if (attempt >= maxRetries) {
        throw new Error(
          `xero fetch network error after ${attempt} attempts: ${(networkErr as Error).message}`,
        )
      }
      const backoff = FIVEXX_BACKOFF_MS[Math.min(attempt - 1, FIVEXX_BACKOFF_MS.length - 1)]!
      await sleep(backoff, opts.abortSignal)
      continue
    }

    const hdrs = headerMap(res)
    rateLimitBreadcrumb(url, opts.tenantId, res.status, hdrs)

    // 200 → success.
    if (res.status >= 200 && res.status < 300) {
      const json = await readBodySafe(res)
      return { ok: true, status: res.status, json, headers: hdrs }
    }

    // 429 → consult X-Rate-Limit-Problem.
    if (res.status === 429) {
      const problem = (
        hdrs['X-Rate-Limit-Problem'] ?? hdrs['x-rate-limit-problem'] ?? ''
      ).toLowerCase()
      const retryAfterRaw = hdrs['Retry-After'] ?? hdrs['retry-after']

      if (problem === 'daily') {
        // Caller must mark tenant 'paused'.
        await readBodySafe(res) // drain
        throw new RateLimitDailyExceededError(
          opts.tenantId,
          `Xero daily rate limit exceeded for tenant ${opts.tenantId}`,
        )
      }
      if (problem === 'concurrent') {
        if (concurrentRetried) {
          // One concurrent retry already burned and still 429? Treat as 5xx
          // path so the exponential backoff catches it.
          await readBodySafe(res)
          if (attempt >= maxRetries) {
            throw new Error(
              `xero 429 concurrent persists after ${attempt} attempts for tenant ${opts.tenantId}`,
            )
          }
          const backoff = FIVEXX_BACKOFF_MS[Math.min(attempt - 1, FIVEXX_BACKOFF_MS.length - 1)]!
          await sleep(backoff, opts.abortSignal)
          continue
        }
        concurrentRetried = true
        await readBodySafe(res)
        await sleep(CONCURRENT_RETRY_MS, opts.abortSignal)
        continue
      }
      if (problem === 'minute' || problem === 'appminute' || problem === '') {
        if (minuteRetried) {
          await readBodySafe(res)
          throw new Error(
            `xero 429 ${problem || 'minute'} persists after retry for tenant ${opts.tenantId}`,
          )
        }
        minuteRetried = true
        const seconds = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN
        const waitMs =
          Number.isFinite(seconds) && seconds > 0
            ? seconds * 1000
            : MINUTE_FALLBACK_SECONDS * 1000
        await readBodySafe(res)
        await sleep(waitMs, opts.abortSignal)
        continue
      }
      // Unknown rate-limit problem → fall through to generic 4xx handler.
    }

    // 5xx → retry with backoff up to maxRetries.
    if (res.status >= 500 && res.status < 600) {
      if (attempt >= maxRetries) {
        const body = await readBodySafe(res)
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? {})
        throw new Error(
          `xero ${res.status} after ${attempt} attempts for tenant ${opts.tenantId}: ${bodyStr.slice(0, 200)}`,
        )
      }
      await readBodySafe(res)
      const backoff = FIVEXX_BACKOFF_MS[Math.min(attempt - 1, FIVEXX_BACKOFF_MS.length - 1)]!
      await sleep(backoff, opts.abortSignal)
      continue
    }

    // 4xx (other than 429) → no retry; throw.
    const body = await readBodySafe(res)
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? {})
    throw new Error(
      `xero ${res.status} for tenant ${opts.tenantId}: ${bodyStr.slice(0, 300)}`,
    )
  }
}
