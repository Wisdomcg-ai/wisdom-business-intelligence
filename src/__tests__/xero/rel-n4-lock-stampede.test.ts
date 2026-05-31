/**
 * REL-N4 — refresh-lock contention must NOT degrade into a rotated-token stampede.
 *
 * The bug: when a caller could not acquire the refresh lock (a sibling already
 * holds it), the old code slept a fixed 2s ONCE and, if the sibling hadn't
 * finished yet, fell straight through to an UNLOCKED self-refresh. Xero's
 * single-use refresh-token rotation means that two callers refreshing in
 * parallel each invalidate the other's token — and under Xero backoff the
 * holder's refresh routinely takes >2s, so EVERY concurrent caller would
 * stampede the token and brick the connection.
 *
 * The fix (getValidAccessToken, lock-not-acquired branch): poll for up to the
 * lock TTL (~30s — the longest a healthy holder can legitimately be mid-refresh):
 *   - if the sibling rotates the token, return that fresh token (no Xero call);
 *   - if the lock frees up, take it over and do a *locked* refresh ourselves;
 *   - only after the entire TTL elapses (holder wedged) do we fall through to a
 *     best-effort unlocked self-refresh.
 *
 * These tests use fake timers to drive the poll loop deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (declared before importing the module-under-test) ──────────

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

/**
 * Chainable Supabase mock whose lock-acquire outcome is controlled by
 * `lockAcquire()` — call it each time the code attempts to take the refresh
 * lock (a `.update().eq().or().select().single()` chain). Return true to grant.
 */
function makeMockSupabase(initialRow: MockRow, lockAcquire: () => boolean) {
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
      // Lock-acquire chain: .update().eq().or().select().single()
      if (pendingUpdate && isLockAcquire) {
        const granted = lockAcquire();
        pendingUpdate = null;
        isLockAcquire = false;
        if (!granted) return { data: null, error: null };
        Object.assign(state.row, { token_refreshing_at: new Date().toISOString() });
        return { data: { id: state.row.id }, error: null };
      }
      // Plain read: clone so consumers' stale reads don't mutate state.
      return { data: { ...state.row }, error: null };
    };
    ctx.maybeSingle = ctx.single;
    // Fire-and-forget update chains (e.g. token write, lock release).
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

describe('REL-N4 — lock-contention poll (no rotated-token stampede)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps polling past 2s and adopts the sibling-rotated token WITHOUT self-refreshing', async () => {
    // Lock is held by a sibling the WHOLE time (acquire always fails). The
    // sibling only finishes its refresh on the 3rd poll (~6s) — well past the
    // old single 2s wait. The waiter must keep polling and adopt the rotated
    // token instead of calling Xero itself (which would stampede the token).
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW, () => false); // never grant the lock
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    await vi.advanceTimersByTimeAsync(2000); // poll 1 — still stale
    await vi.advanceTimersByTimeAsync(2000); // poll 2 — still stale

    // Sibling completes its refresh now (between poll 2 and poll 3).
    handle.setRow({
      expires_at: isoMinutesFromNow(30),
      access_token: 'enc:sibling-rotated-at',
    });

    await vi.advanceTimersByTimeAsync(2000); // poll 3 — sees rotation
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('sibling-rotated-at');
    // The critical assertion: we never hit Xero ourselves.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes over the lock once the sibling releases it and does a LOCKED self-refresh', async () => {
    // First acquire fails (sibling holds it); on the next poll the sibling has
    // released, so we acquire the lock ourselves and refresh under it. Exactly
    // one Xero call — no stampede.
    vi.useFakeTimers();
    let lockCalls = 0;
    const handle = makeMockSupabase(BASE_ROW, () => {
      lockCalls += 1;
      return lockCalls > 1; // fail the first attempt, grant afterwards
    });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    await vi.advanceTimersByTimeAsync(2000); // poll 1 — stale, acquire fails
    await vi.advanceTimersByTimeAsync(2000); // poll 2 — stale, acquire succeeds → take over
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    // Exactly one refresh — we held the lock; no parallel stampede.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(handle.state.row.access_token).toBe('enc:new-at');
  });

  it('falls through to a best-effort unlocked refresh only after the full lock TTL elapses', async () => {
    // Pathological: the holder is wedged — lock never frees and the token never
    // rotates. The waiter must not block forever; after ~30s TTL it does a
    // best-effort self-refresh so this caller can still make progress.
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = makeMockSupabase(BASE_ROW, () => false); // lock never frees
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client as any);

    // Drive the entire ~30s poll window plus the trailing refresh.
    await vi.advanceTimersByTimeAsync(31000);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    // Exactly one (best-effort, post-TTL) refresh.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // We logged the wedged-holder fallthrough.
    expect(warnSpy.mock.calls.flat().some((a) => String(a).includes('did not clear within TTL'))).toBe(true);
  });
});
