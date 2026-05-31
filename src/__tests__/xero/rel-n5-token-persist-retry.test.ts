/**
 * REL-N5 — token-rotation persistence guard for token-manager.ts.
 *
 * Bug (pre-fix, token-manager.ts:412-422): after a SUCCESSFUL Xero refresh, if
 * the DB save of the rotated token failed, the function returned
 * `success: true`. But Xero rotates refresh tokens — the old one is already
 * dead — so the DB was left holding a dead token. The next refresh read it,
 * got `invalid_grant`, and a healthy tenant was deactivated by a transient
 * write blip.
 *
 * Fix: persist the rotated token with retry; only if every attempt fails do we
 * return `success:false` / `shouldDeactivate:false` (transient, caller retries
 * within Xero's grace window) — NEVER `success:true` on an unpersisted rotation.
 *
 * Tests:
 *   RN5-1: one transient save failure → retried → succeeds, row persisted.
 *   RN5-2: all save attempts fail → success:false, shouldDeactivate:false,
 *          row NOT mutated, connection stays active, Sentry alert fired.
 *   RN5-3: (regression) first save succeeds → success:true, single attempt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));

const captureMessageSpy = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: any[]) => captureMessageSpy(...args),
  captureException: vi.fn(),
}));

// ─── Chainable Supabase mock with injectable token-save failures ─────────────
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

function makeMockSupabase(initialRow: MockRow, tokenSaveFailures = 0) {
  const state = { row: { ...initialRow }, tokenSaveAttempts: 0 };
  let failuresRemaining = tokenSaveFailures;

  const builder = (): any => {
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
      // Lock acquire: .update().eq().or().select().single() → returns {id}
      if (pendingUpdate && isLockAcquire) {
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null;
        isLockAcquire = false;
        return { data: { id: state.row.id }, error: null };
      }
      // Plain read
      return { data: { ...state.row }, error: null };
    };
    ctx.maybeSingle = ctx.single;
    // Awaited update (token-save or lock-release) — no .single()
    ctx.then = (resolve: any, reject: any) => {
      if (pendingUpdate) {
        const isTokenSave = 'access_token' in pendingUpdate;
        if (isTokenSave) {
          state.tokenSaveAttempts++;
          if (failuresRemaining > 0) {
            failuresRemaining--;
            pendingUpdate = null;
            return Promise.resolve({ data: null, error: { message: 'transient write blip' } }).then(
              resolve,
              reject,
            );
          }
        }
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null;
        isLockAcquire = false;
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    };
    return ctx;
  };

  return { client: { from: builder } as any, state };
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

describe('token-manager REL-N5 — rotated token must be persisted before reporting success', () => {
  beforeEach(() => {
    vi.resetModules();
    captureMessageSpy.mockClear();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RN5-1 — a transient save failure is retried and then persisted (success, row updated)', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW, 1); // first save fails, retry succeeds
    vi.spyOn(global, 'fetch').mockResolvedValue(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(250); // one 200ms retry backoff
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    expect(handle.state.row.access_token).toBe('enc:new-at');
    expect(handle.state.row.refresh_token).toBe('enc:new-rt');
    expect(handle.state.tokenSaveAttempts).toBe(2);
    expect(handle.state.row.is_active).toBe(true);
  });

  it('RN5-2 — all save attempts fail → success:false, no deactivation, row untouched, alert fired', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW, 99); // every save fails
    vi.spyOn(global, 'fetch').mockResolvedValue(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(250); // backoff after attempt 1
    await vi.advanceTimersByTimeAsync(250); // backoff after attempt 2
    const result = await promise;
    vi.useRealTimers();

    // CRITICAL: must NOT mask the failure as success
    expect(result.success).toBe(false);
    expect(result.error).toBe('database_error');
    // Transient — caller should retry, NOT deactivate the tenant
    expect(result.shouldDeactivate).toBe(false);

    // DB row left untouched (still the old token) — we did not commit a partial state
    expect(handle.state.row.access_token).toBe('enc:current-at');
    expect(handle.state.row.refresh_token).toBe('enc:current-rt');
    // Connection stays ACTIVE — a write blip must not deactivate a healthy tenant
    expect(handle.state.row.is_active).toBe(true);
    // Bounded retries
    expect(handle.state.tokenSaveAttempts).toBe(3);

    // Observability: the rare unpersisted-rotation is surfaced to Sentry
    const alert = captureMessageSpy.mock.calls.find(
      (args: any[]) => args[0] === 'Xero token rotated but failed to persist',
    );
    expect(alert).toBeDefined();
    expect(alert![1]?.tags?.invariant).toBe('xero_token_persist_failed');
    expect(alert![1]?.tags?.connection_id).toBe('conn-1');
  });

  it('RN5-3 — regression: first save succeeds → success in a single attempt', async () => {
    const handle = makeMockSupabase(BASE_ROW, 0);
    vi.spyOn(global, 'fetch').mockResolvedValue(okXeroResponse());

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-at');
    expect(handle.state.tokenSaveAttempts).toBe(1);
    expect(handle.state.row.access_token).toBe('enc:new-at');
    expect(captureMessageSpy).not.toHaveBeenCalledWith(
      'Xero token rotated but failed to persist',
      expect.anything(),
    );
  });
});
