/**
 * REL-N3 — the Xero identity-token refresh must honor a 429 `Retry-After`.
 *
 * The bug: on a 429 (rate limit) the refresh retried on a fixed exponential
 * backoff (1s, 2s) and ignored Xero's `Retry-After` header entirely, so it
 * retried too soon and immediately re-tripped the limiter.
 *
 * The fix (refreshTokenWithRetry): on a 429, parse `Retry-After` and wait at
 * least that long (still never shorter than our own exponential backoff). If
 * Xero asks us to wait longer than we can usefully sleep inside one invocation
 * (> MAX_RETRY_AFTER_MS), defer the retry to the caller instead of burning the
 * function on a sleep that would wake up still throttled.
 *
 * Driven with fake timers so the wait windows are asserted deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MockRow {
  id: string;
  business_id: string;
  tenant_id: string;
  tenant_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  is_active: boolean;
  token_refreshing_at: string | null;
  updated_at: string;
}

function isoMinutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

/** Simple chainable Supabase mock — always grants the refresh lock. */
function makeMockSupabase(initialRow: MockRow) {
  const state = { row: { ...initialRow } };

  const builder = (_table: string): any => {
    let pendingUpdate: Record<string, unknown> | null = null;
    let isLockAcquire = false;

    const ctx: any = {};
    ctx.select = () => ctx;
    ctx.eq = () => ctx;
    ctx.or = () => {
      isLockAcquire = true;
      return ctx;
    };
    ctx.in = () => ctx;
    ctx.update = (vals: Record<string, unknown>) => {
      pendingUpdate = vals;
      return ctx;
    };
    ctx.single = async () => {
      if (pendingUpdate && isLockAcquire) {
        // Always grant the lock.
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null;
        isLockAcquire = false;
        return { data: { id: state.row.id }, error: null };
      }
      return { data: { ...state.row }, error: null };
    };
    ctx.maybeSingle = ctx.single;
    ctx.then = (resolve: any, reject: any) => {
      if (pendingUpdate) {
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null;
        isLockAcquire = false;
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    };
    return ctx;
  };

  return {
    client: { from: builder },
    state,
    setRow(next: Partial<MockRow>) {
      Object.assign(state.row, next);
    },
  };
}

function okXeroResponse(): Response {
  return new Response(
    JSON.stringify({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 1800 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function rateLimitedResponse(retryAfter?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
  if (retryAfter !== undefined) headers['Retry-After'] = retryAfter;
  // Plain-text body → no `error` field → categorizeError takes the 429 branch.
  return new Response('rate limit exceeded', { status: 429, headers });
}

const BASE_ROW: MockRow = {
  id: 'conn-1',
  business_id: 'biz-1',
  tenant_id: 'tenant-xyz',
  tenant_name: 'Test Tenant',
  access_token: 'enc:current-at',
  refresh_token: 'enc:current-rt',
  expires_at: isoMinutesFromNow(-5), // expired → triggers refresh
  is_active: true,
  token_refreshing_at: null,
  updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('REL-N3 — 429 Retry-After honored on token refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits the full Retry-After window (5s), not the 1s exponential backoff', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(rateLimitedResponse('5')) // Retry-After: 5 seconds
      .mockResolvedValueOnce(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    // First refresh attempt fires immediately (lock held, no pre-sleep).
    await vi.advanceTimersByTimeAsync(1000); // the OLD exponential retry point
    expect(fetchSpy).toHaveBeenCalledTimes(1); // must NOT have retried yet

    await vi.advanceTimersByTimeAsync(4000); // now 5s elapsed → Retry-After window done
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
  });

  it('falls back to exponential backoff when 429 carries no Retry-After', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(rateLimitedResponse()) // no Retry-After header
      .mockResolvedValueOnce(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    await vi.advanceTimersByTimeAsync(1000); // exponential delay for attempt 1
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it('defers the retry (returns rate_limited) when Retry-After exceeds the max wait', async () => {
    // Retry-After 120s > MAX_RETRY_AFTER_MS (60s): don't sleep — surface the
    // transient error so the caller / next cron tick retries later.
    const handle = makeMockSupabase(BASE_ROW);
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValue(rateLimitedResponse('120'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    // Only the first attempt — no retry sleep, returned straight away.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('rate_limited');
    expect(result.shouldDeactivate).not.toBe(true);
    expect(handle.state.row.is_active).toBe(true);
  });
});
