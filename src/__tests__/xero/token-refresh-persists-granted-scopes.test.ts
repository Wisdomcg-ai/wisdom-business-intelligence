/**
 * Every successful token refresh re-records the scopes the org has granted
 * (xero_connections.granted_scopes / scopes_granted_at).
 *
 * Why: PR 1 of XERO-BUDGET-SEED-PLAN.md adds `accounting.budgets.read` to the
 * consent request. Which orgs have actually granted it is only knowable from
 * the tokens Xero issues. The 6-hourly refresh is the one write that touches
 * every healthy connection, so it is what backfills the column fleet-wide
 * without anyone reconnecting — and what keeps it current after they do.
 *
 * Harness mirrors phase-53-token-manager-sentry.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

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
  granted_scopes?: string[] | null;
  scopes_granted_at?: string | null;
}

function isoMinutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function makeMockSupabase(initialRow: MockRow) {
  const state = { row: { ...initialRow }, rejectScopeColumnsWith: null as null | { code: string; message: string }, scopeRejections: 0 };
  const builder = (_table: string): any => {
    let pendingUpdate: Record<string, unknown> | null = null;
    let isLockAcquire = false;
    const ctx: any = {};
    ctx.select = () => ctx;
    ctx.eq = () => ctx;
    ctx.or = () => { isLockAcquire = true; return ctx; };
    ctx.in = () => ctx;
    ctx.update = (vals: Record<string, unknown>) => { pendingUpdate = vals; return ctx; };
    ctx.single = async () => {
      if (pendingUpdate && isLockAcquire) {
        Object.assign(state.row, pendingUpdate);
        pendingUpdate = null; isLockAcquire = false;
        return { data: { id: state.row.id }, error: null };
      }
      return { data: { ...state.row }, error: null };
    };
    ctx.maybeSingle = ctx.single;
    ctx.then = (resolve: any, reject: any) => {
      // Simulate a DB / PostgREST that does not know the scope columns yet.
      if (pendingUpdate && state.rejectScopeColumnsWith && 'granted_scopes' in pendingUpdate) {
        state.scopeRejections++;
        pendingUpdate = null; isLockAcquire = false;
        return Promise.resolve({ data: null, error: state.rejectScopeColumnsWith }).then(resolve, reject);
      }
      if (pendingUpdate) { Object.assign(state.row, pendingUpdate); pendingUpdate = null; isLockAcquire = false; }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    };
    return ctx;
  };
  // `any` mirrors the phase-53 harness: getValidAccessToken takes a real SupabaseClient type.
  const client: any = { from: builder };
  return { client, state };
}

function fakeJwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`;
}

function refreshOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const EXPIRED_ROW: MockRow = {
  id: 'conn-1',
  business_id: 'biz-1',
  tenant_id: 'tenant-xyz',
  tenant_name: 'Test Tenant',
  access_token: 'enc:old-at',
  refresh_token: 'enc:old-rt',
  expires_at: isoMinutesFromNow(-5),
  is_active: true,
  token_refreshing_at: null,
  updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  granted_scopes: ['offline_access', 'accounting.reports.read'],
  scopes_granted_at: '2026-08-01T00:00:00.000Z',
};

describe('token refresh persists granted scopes', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes granted_scopes from the refresh response scope string (sorted, de-duplicated)', async () => {
    const handle = makeMockSupabase(EXPIRED_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      refreshOk({
        access_token: 'new-at', refresh_token: 'new-rt', expires_in: 1800, token_type: 'Bearer',
        scope: 'offline_access accounting.reports.read accounting.budgets.read offline_access',
      }),
    );
    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);
    expect(result.error).toBeUndefined();
    expect(handle.state.row.access_token).toBe('enc:new-at');
    expect(handle.state.row.granted_scopes).toEqual([
      'accounting.budgets.read',
      'accounting.reports.read',
      'offline_access',
    ]);
    expect(handle.state.row.scopes_granted_at).not.toBe('2026-08-01T00:00:00.000Z');
  });

  it('falls back to the access token JWT scope claim when the response has no scope field', async () => {
    const handle = makeMockSupabase(EXPIRED_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      refreshOk({
        access_token: fakeJwt({ scope: ['accounting.reports.read', 'offline_access'] }),
        refresh_token: 'new-rt', expires_in: 1800, token_type: 'Bearer',
      }),
    );
    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    await getValidAccessToken({ id: 'conn-1' }, handle.client);
    expect(handle.state.row.granted_scopes).toEqual(['accounting.reports.read', 'offline_access']);
  });

  it.each([
    ['Postgres undefined_column (migration not yet applied)', { code: '42703', message: 'column "granted_scopes" of relation "xero_connections" does not exist' }],
    ['PostgREST stale schema cache', { code: 'PGRST204', message: "Could not find the 'granted_scopes' column of 'xero_connections' in the schema cache" }],
  ])('still persists the rotated token when the scope columns are unavailable — %s', async (_label, dbError) => {
    const handle = makeMockSupabase(EXPIRED_ROW);
    handle.state.rejectScopeColumnsWith = dbError;
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      refreshOk({
        access_token: 'new-at', refresh_token: 'new-rt', expires_in: 1800, token_type: 'Bearer',
        scope: 'offline_access accounting.budgets.read',
      }),
    );
    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);
    // The rotated token is what matters: it must be saved, and the refresh must report success.
    expect(result.error).toBeUndefined();
    expect(result.shouldDeactivate).not.toBe(true);
    expect(handle.state.row.access_token).toBe('enc:new-at');
    expect(handle.state.row.refresh_token).toBe('enc:new-rt');
    // Exactly one rejected write, then the fallback write without the columns.
    expect(handle.state.scopeRejections).toBe(1);
    expect(handle.state.row.granted_scopes).toEqual(['offline_access', 'accounting.reports.read']);
    expect(handle.state.row.is_active).toBe(true);
  });

  it('leaves granted_scopes untouched when the token carries no scope information at all', async () => {
    const handle = makeMockSupabase(EXPIRED_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      refreshOk({ access_token: 'opaque-at', refresh_token: 'new-rt', expires_in: 1800, token_type: 'Bearer' }),
    );
    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    await getValidAccessToken({ id: 'conn-1' }, handle.client);
    expect(handle.state.row.access_token).toBe('enc:opaque-at');
    expect(handle.state.row.granted_scopes).toEqual(['offline_access', 'accounting.reports.read']);
    expect(handle.state.row.scopes_granted_at).toBe('2026-08-01T00:00:00.000Z');
  });
});
