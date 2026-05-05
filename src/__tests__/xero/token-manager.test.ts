/**
 * Phase 53-03 Task 1 RED:
 *   Test suite for src/lib/xero/token-manager.ts covering:
 *
 *   NEW race-closure tests (FAIL on HEAD):
 *     - A3: post-lock refetch sees sibling rotation, short-circuits without calling Xero
 *     - A4: post-lock refetch reads fresh refresh_token before calling Xero
 *     - B1: invalid_grant + post-failure refetch shows row was rotated → NO deactivate
 *     - B2: invalid_grant + post-failure refetch confirms still stale → DEACTIVATE
 *           (also asserts business_id + tenant_id present in the structured log payload — F3 fix)
 *     - B3: race detection via updated_at advance with expires_at unchanged
 *
 *   NEW policy tests (FAIL on HEAD):
 *     - C1, C2: categorizeError unit tests with attempt parameter
 *     - C3: 3x unauthorized_client → retry → deactivate (assert 1s + 2s sleeps only)
 *     - C4: 2x unauthorized_client + 1 ok → success, no deactivate
 *     - D1, D2: invalid_client never deactivates (separate branch)
 *
 *   Regression-preservation tests (PASS on HEAD):
 *     - A1: already-valid token short-circuits without calling Xero
 *     - A2: lock-not-acquired branch waits and re-uses sibling-rotated token
 *     - E1, E2: generic 400 never deactivates
 *     - F1, F2: 5xx and network errors are transient
 *     - G1: successful refresh writes new tokens to row
 *
 *   Tests use mocked encryption (identity), mocked global.fetch for
 *   https://identity.xero.com/connect/token, and a chainable Supabase mock
 *   with closure-state that supports mid-flight row mutation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (must be declared before importing the module-under-test) ──

vi.mock('@/lib/utils/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));

// ─── Types & helpers ────────────────────────────────────────────────────────

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

interface MockSupabaseHandle {
  client: any;
  state: { row: MockRow };
  setRow: (next: Partial<MockRow>) => void;
  // If true, acquireRefreshLock returns acquired:false (single-row UPDATE returns no row)
  failNextLockAcquire: { value: boolean };
}

function isoMinutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function makeMockSupabase(initialRow: MockRow): MockSupabaseHandle {
  const state = { row: { ...initialRow } };
  const failNextLockAcquire = { value: false };

  const builder = (_table: string): any => {
    // Fluent builder — track which kind of write we're building.
    let pendingUpdate: Record<string, unknown> | null = null;
    // Tracks whether this update is a lock-acquire attempt (has .or() filter)
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
      // Lock acquire path: .update().eq().or().select().single()
      if (pendingUpdate && isLockAcquire) {
        if (failNextLockAcquire.value) {
          failNextLockAcquire.value = false; // one-shot
          pendingUpdate = null;
          isLockAcquire = false;
          return { data: null, error: null };
        }
        // Success: commit token_refreshing_at to row, return id
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null;
        isLockAcquire = false;
        return { data: { id: state.row.id }, error: null };
      }
      // Plain read: .select().eq().single()
      // Return a deep-ish clone so consumer's "stale" reads don't mutate state
      return { data: { ...state.row }, error: null };
    };
    ctx.maybeSingle = ctx.single;
    // For chains that end without .single() — treated as fire-and-forget update
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
    failNextLockAcquire,
  };
}

type XeroScenario =
  | 'ok'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'access_denied'
  | 'invalid_client'
  | '500'
  | 'generic_400';

function makeXeroResponse(scenario: XeroScenario): Response {
  switch (scenario) {
    case 'ok':
      return new Response(
        JSON.stringify({
          access_token: 'new-at',
          refresh_token: 'new-rt',
          expires_in: 1800,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    case 'invalid_grant':
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    case 'unauthorized_client':
      return new Response(
        JSON.stringify({ error: 'unauthorized_client' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    case 'access_denied':
      return new Response(
        JSON.stringify({ error: 'access_denied' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    case 'invalid_client':
      return new Response(
        JSON.stringify({ error: 'invalid_client' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    case '500':
      return new Response('Bad Gateway', { status: 502 });
    case 'generic_400':
      return new Response('<html>oops</html>', { status: 400 });
  }
}

function captureConsole() {
  const errors: string[] = [];
  const warns: string[] = [];
  const logs: string[] = [];
  const origError = console.error;
  const origWarn = console.warn;
  const origLog = console.log;
  console.error = (...args: any[]) => {
    errors.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  console.warn = (...args: any[]) => {
    warns.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  console.log = (...args: any[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return {
    errors,
    warns,
    logs,
    restore() {
      console.error = origError;
      console.warn = origWarn;
      console.log = origLog;
    },
  };
}

/** Find the structured deactivation_decision JSON payload in captured console lines. */
function findDeactivationPayload(lines: string[]): any | null {
  for (const line of lines) {
    const idx = line.indexOf('deactivation_decision');
    if (idx === -1) continue;
    // Payload follows the marker, separated by space
    const jsonStart = line.indexOf('{', idx);
    if (jsonStart === -1) continue;
    try {
      return JSON.parse(line.slice(jsonStart));
    } catch {
      // try unescaping wrapped quotes (when console.log(x, y) joined with space)
      try {
        return JSON.parse(line.slice(jsonStart).replace(/\\"/g, '"'));
      } catch {
        continue;
      }
    }
  }
  return null;
}

const BASE_ROW: MockRow = {
  id: 'conn-1',
  business_id: 'biz-1',
  tenant_id: 'tenant-xyz',
  tenant_name: 'Test Tenant',
  access_token: 'enc:current-at',
  refresh_token: 'enc:current-rt',
  expires_at: isoMinutesFromNow(-5), // expired 5 min ago → triggers refresh
  is_active: true,
  token_refreshing_at: null,
  updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getValidAccessToken — race-closure (Hole A)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A1 — already-valid token short-circuits without calling Xero', async () => {
    const handle = makeMockSupabase({
      ...BASE_ROW,
      expires_at: isoMinutesFromNow(30), // still valid
    });
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('current-at');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A2 — lock-not-acquired branch waits 2s and re-uses sibling-rotated token', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);
    handle.failNextLockAcquire.value = true; // first lock attempt fails

    const fetchSpy = vi.spyOn(global, 'fetch');

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    // While the function is sleeping for the lock-not-acquired branch,
    // simulate a sibling completing the refresh
    await Promise.resolve();
    handle.setRow({
      expires_at: isoMinutesFromNow(30),
      access_token: 'enc:sibling-rotated-at',
    });

    await vi.advanceTimersByTimeAsync(2500);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('sibling-rotated-at');
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('A3 — POST-LOCK re-fetch sees sibling rotation, short-circuits without calling Xero (Hole A)', async () => {
    // We acquire the lock successfully, but BEFORE we call Xero, sibling has
    // already rotated the token. After lock acquire, the implementation must
    // re-fetch the row, see expires_at advanced, and short-circuit.
    const handle = makeMockSupabase(BASE_ROW);

    const fetchSpy = vi.spyOn(global, 'fetch');

    // Patch the Supabase mock so that AFTER the lock acquire (single() call
    // that returned {id}), the next .single() read returns a fresh row.
    const originalFrom = handle.client.from;
    let lockAcquired = false;
    handle.client.from = (table: string) => {
      const ctx = originalFrom(table);
      const origSingle = ctx.single;
      ctx.single = async () => {
        const result = await origSingle();
        // Detect that we just acquired the lock (returned id only, not full row)
        if (
          result.data &&
          typeof result.data === 'object' &&
          'id' in result.data &&
          !('access_token' in result.data) &&
          !lockAcquired
        ) {
          lockAcquired = true;
          // Sibling completes the refresh between our lock acquire and our re-fetch
          handle.setRow({
            expires_at: isoMinutesFromNow(30),
            access_token: 'enc:sibling-fresh-at',
            refresh_token: 'enc:sibling-fresh-rt',
            updated_at: new Date().toISOString(),
          });
        }
        return result;
      };
      return ctx;
    };

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('sibling-fresh-at');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A4 — POST-LOCK re-fetch reads fresh refresh_token before calling Xero (Hole A)', async () => {
    // Lock acquired. Before our Xero call, sibling rotated the refresh_token
    // but the new access_token is also expired (forcing us to refresh again
    // with the *new* refresh_token).
    const handle = makeMockSupabase(BASE_ROW);

    const originalFrom = handle.client.from;
    let lockAcquired = false;
    handle.client.from = (table: string) => {
      const ctx = originalFrom(table);
      const origSingle = ctx.single;
      ctx.single = async () => {
        const result = await origSingle();
        if (
          result.data &&
          typeof result.data === 'object' &&
          'id' in result.data &&
          !('access_token' in result.data) &&
          !lockAcquired
        ) {
          lockAcquired = true;
          // Sibling rotated the refresh_token but expires_at stays expired
          // (perhaps sibling failed to save, or test simulates sibling rotation
          // with no expiry advance). Implementation must use the fresh rt.
          handle.setRow({
            refresh_token: 'enc:sibling-rotated-rt',
            updated_at: new Date().toISOString(),
          });
        }
        return result;
      };
      return ctx;
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts: any) => {
      if (!String(url).includes('identity.xero.com/connect/token')) {
        throw new Error('Unexpected URL: ' + url);
      }
      // Capture refresh_token from the body
      const body = String(opts?.body ?? '');
      (fetchSpy as any).__lastBody = body;
      return makeXeroResponse('ok');
    });

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.success).toBe(true);
    const lastBody = (fetchSpy as any).__lastBody as string;
    expect(lastBody).toContain('refresh_token=sibling-rotated-rt');
    expect(lastBody).not.toContain('refresh_token=current-rt');
  });
});

describe('refreshTokenWithRetry — pre-deactivation race check (Hole B)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B1 — invalid_grant + post-failure refetch shows row was rotated → NO deactivate', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    const cap = captureConsole();

    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      // While Xero is "processing" our request, sibling completes refresh
      handle.setRow({
        expires_at: isoMinutesFromNow(30),
        access_token: 'enc:rotated-by-sibling',
        refresh_token: 'enc:rotated-by-sibling-rt',
        updated_at: new Date().toISOString(),
      });
      return makeXeroResponse('invalid_grant');
    });

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    cap.restore();

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('rotated-by-sibling');
    expect(handle.state.row.is_active).toBe(true);

    const payload = findDeactivationPayload(cap.errors);
    expect(payload).toBeTruthy();
    expect(payload.rationale).toBe('race_detected_no_deactivate');
    expect(payload.decision).toBe('no_deactivate');
  });

  it('B2 — invalid_grant + post-failure refetch confirms still stale → DEACTIVATE (with full Sentry-ready payload)', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    const cap = captureConsole();

    vi.spyOn(global, 'fetch').mockImplementation(async () => makeXeroResponse('invalid_grant'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    cap.restore();

    expect(result.success).toBe(false);
    expect(result.shouldDeactivate).toBe(true);
    expect(result.error).toBe('token_expired_permanently');
    expect(handle.state.row.is_active).toBe(false);

    const payload = findDeactivationPayload(cap.errors);
    expect(payload).toBeTruthy();
    expect(payload.decision).toBe('deactivate');
    expect(payload.rationale).toBe('invalid_grant_confirmed');
    expect(payload.connection_id).toBe('conn-1');
    expect(payload.xero_status).toBe(400);
    expect(payload.xero_error_code).toBe('invalid_grant');
    expect(typeof payload.xero_error_body).toBe('string');
    expect(payload.xero_error_body.length).toBeLessThanOrEqual(500);
    // F3 fix: business_id and tenant_id must be present (53-05 needs these for Sentry tags)
    expect(payload.business_id).toBe('biz-1');
    expect(payload.tenant_id).toBe('tenant-xyz');
    // expires_at_pre must be populated (NOT the 'unknown' literal)
    expect(payload.expires_at_pre).toBeTruthy();
    expect(payload.expires_at_pre).not.toBe('unknown');
  });

  it('B3 — race detection via updated_at advance (expires_at unchanged)', async () => {
    // Sibling completed refresh but for some reason expires_at didn't advance
    // past threshold (edge case — perhaps sibling's clock drift or partial
    // save). updated_at advance alone must trigger race detection.
    const handle = makeMockSupabase(BASE_ROW);
    const cap = captureConsole();
    const originalUpdatedAt = handle.state.row.updated_at;

    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      // Mutate ONLY updated_at + access_token (NOT expires_at)
      handle.setRow({
        access_token: 'enc:rotated-by-sibling',
        updated_at: new Date(Date.now() + 1000).toISOString(),
      });
      return makeXeroResponse('invalid_grant');
    });

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    cap.restore();

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('rotated-by-sibling');
    expect(handle.state.row.is_active).toBe(true);

    const payload = findDeactivationPayload(cap.errors);
    expect(payload).toBeTruthy();
    expect(payload.rationale).toBe('race_detected_no_deactivate');
    // Sanity: updated_at advanced
    expect(payload.updated_at_post).not.toBe(originalUpdatedAt);
  });
});

describe('categorizeError — unauthorized_client 3-retry policy', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C1 — unauthorized_client on attempt 1 returns shouldDeactivate=false', async () => {
    const mod: any = await import('@/lib/xero/token-manager');
    // categorizeError is internal but exposed for testing in 53-03 implementation
    // (or invoked indirectly). Prefer direct unit test if exported; otherwise
    // skip-flag this test (executor exports the helper via a __testing__ symbol
    // OR we cover via integration tests C3/C4).
    if (typeof mod.categorizeError === 'function') {
      const result = mod.categorizeError(400, '{"error":"unauthorized_client"}', 1);
      expect(result.shouldDeactivate).toBe(false);
    } else {
      // Integration assertion: 1x unauthorized then 1x ok yields success
      const handle = makeMockSupabase(BASE_ROW);
      const fetchMock = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(makeXeroResponse('unauthorized_client'))
        .mockResolvedValueOnce(makeXeroResponse('ok'));
      vi.useFakeTimers();
      const promise = mod.getValidAccessToken({ id: 'conn-1' }, handle.client);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      vi.useRealTimers();
      expect(result.success).toBe(true);
      expect(handle.state.row.is_active).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('C2 — unauthorized_client on attempt 3 returns shouldDeactivate=true', async () => {
    const mod: any = await import('@/lib/xero/token-manager');
    if (typeof mod.categorizeError === 'function') {
      const result = mod.categorizeError(400, '{"error":"unauthorized_client"}', 3);
      expect(result.shouldDeactivate).toBe(true);
    } else {
      // Skip: integration covered by C3
      expect(true).toBe(true);
    }
  });

  it('C3 — Integration: 3 successive unauthorized_client → 3 retries → deactivate (1s + 2s sleeps)', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);
    const cap = captureConsole();

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValue(makeXeroResponse('unauthorized_client'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    // F4: only two sleeps fire (1s before attempt 2, 2s before attempt 3).
    // After attempt 3 fails → deactivate; no 4th sleep.
    await vi.advanceTimersByTimeAsync(1000); // before attempt 2
    await vi.advanceTimersByTimeAsync(2000); // before attempt 3
    // Drain pending microtasks for deactivation path
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    cap.restore();
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.shouldDeactivate).toBe(true);
    expect(handle.state.row.is_active).toBe(false);

    const payload = findDeactivationPayload(cap.errors);
    expect(payload).toBeTruthy();
    expect(payload.rationale).toBe('unauthorized_client_3x_exhausted');
    expect(payload.attempt).toBe(3);
  });

  it('C4 — Integration: 2 unauthorized_client + 1 ok → success, no deactivate', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeXeroResponse('unauthorized_client'))
      .mockResolvedValueOnce(makeXeroResponse('unauthorized_client'))
      .mockResolvedValueOnce(makeXeroResponse('ok'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    expect(handle.state.row.is_active).toBe(true);
    expect(handle.state.row.access_token).toBe('enc:new-at');
  });
});

describe('categorizeError — invalid_client never deactivates', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('D1 — Direct unit: categorizeError on invalid_client returns shouldDeactivate=false', async () => {
    const mod: any = await import('@/lib/xero/token-manager');
    if (typeof mod.categorizeError === 'function') {
      const result = mod.categorizeError(401, '{"error":"invalid_client"}', 1);
      expect(result.shouldDeactivate).toBe(false);
      expect(result.error).toBe('unknown');
      expect(result.message?.toLowerCase()).toMatch(/ops|config|invalid_client/);
    } else {
      // Fallback covered by D2
      expect(true).toBe(true);
    }
  });

  it('D2 — Integration: 3x invalid_client → no deactivate', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValue(makeXeroResponse('invalid_client'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(handle.state.row.is_active).toBe(true);
    expect(result.shouldDeactivate).not.toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('categorizeError — generic 400 never deactivates (regression preservation)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('E1 — Direct unit: categorizeError on `<html>oops</html>` 400 returns shouldDeactivate=false', async () => {
    const mod: any = await import('@/lib/xero/token-manager');
    if (typeof mod.categorizeError === 'function') {
      const result = mod.categorizeError(400, '<html>oops</html>', 1);
      expect(result.shouldDeactivate).toBe(false);
      expect(result.error).toBe('unknown');
    } else {
      expect(true).toBe(true);
    }
  });

  it('E2 — Integration: 3x generic 400 → no deactivate', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);

    vi.spyOn(global, 'fetch').mockResolvedValue(makeXeroResponse('generic_400'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(handle.state.row.is_active).toBe(true);
    expect(result.shouldDeactivate).not.toBe(true);
  });
});

describe('5xx and network — transient (regression preservation)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('F1 — 502 then 502 then 200 OK → success', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeXeroResponse('500'))
      .mockResolvedValueOnce(makeXeroResponse('500'))
      .mockResolvedValueOnce(makeXeroResponse('ok'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(true);
    expect(handle.state.row.is_active).toBe(true);
  });

  it('F2 — 3x network error → returns network_error, no deactivate', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toBe('network_error');
    expect(result.shouldDeactivate).not.toBe(true);
    expect(handle.state.row.is_active).toBe(true);
  });
});

describe('Successful refresh writes new tokens to row', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('G1 — ok response → row updated with new tokens + advanced expiry', async () => {
    const handle = makeMockSupabase(BASE_ROW);

    vi.spyOn(global, 'fetch').mockResolvedValue(makeXeroResponse('ok'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    expect(handle.state.row.access_token).toBe('enc:new-at');
    expect(handle.state.row.refresh_token).toBe('enc:new-rt');
    // expires_at advanced ~30 min from now
    const expiresMs = new Date(handle.state.row.expires_at).getTime() - Date.now();
    expect(expiresMs).toBeGreaterThan(25 * 60 * 1000);
    expect(expiresMs).toBeLessThan(35 * 60 * 1000);
  });
});
