/**
 * Phase 53-05 Task 1 RED:
 *   Sentry capture wiring for the token-manager deactivation site.
 *
 *   Six core cases verify:
 *     1. Sentry.captureMessage fires with invariant=xero_connection_deactivated
 *        on confirmed invalid_grant deactivation (after 53-03's race-check).
 *     2. Tag schema is exact and complete: invariant, tenant_id, business_id,
 *        connection_id, error_code, retry_count (all strings).
 *     3. Extras include xero_status, xero_error_body (truncated to ≤4KB),
 *        xero_message, attempt.
 *     4. No capture fires for transient errors (5xx, generic 400) where
 *        shouldDeactivate is false.
 *     5. A throwing Sentry call must NOT abort the deactivation DB write.
 *     6. Per-route deactivation in employees/route.ts:187 does NOT call Sentry
 *        — capture is centralized in token-manager only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (must be declared before importing the module-under-test) ──

vi.mock('@/lib/utils/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));

const captureMessageMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: any[]) => captureMessageMock(...args),
  captureException: (...args: any[]) => captureExceptionMock(...args),
}));

// ─── Types & helpers (mirrors token-manager.test.ts harness) ─────────────────

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
  failNextLockAcquire: { value: boolean };
}

function isoMinutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function makeMockSupabase(initialRow: MockRow): MockSupabaseHandle {
  const state = { row: { ...initialRow } };
  const failNextLockAcquire = { value: false };

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
        if (failNextLockAcquire.value) {
          failNextLockAcquire.value = false;
          pendingUpdate = null;
          isLockAcquire = false;
          return { data: null, error: null };
        }
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
    failNextLockAcquire,
  };
}

function xeroResponse(scenario: 'invalid_grant' | 'unauthorized_client' | '500' | 'generic_400' | 'invalid_grant_huge_body'): Response {
  switch (scenario) {
    case 'invalid_grant':
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    case 'unauthorized_client':
      return new Response(JSON.stringify({ error: 'unauthorized_client' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    case '500':
      return new Response('Bad Gateway', { status: 502 });
    case 'generic_400':
      return new Response('<html>oops</html>', { status: 400 });
    case 'invalid_grant_huge_body': {
      // Build a 5KB string to test 4KB truncation
      const bigDescription = 'X'.repeat(5000);
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: bigDescription,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
}

const BASE_ROW: MockRow = {
  id: 'conn-1',
  business_id: 'biz-1',
  tenant_id: 'tenant-xyz',
  tenant_name: 'Test Tenant',
  access_token: 'enc:current-at',
  refresh_token: 'enc:current-rt',
  expires_at: isoMinutesFromNow(-5),
  is_active: true,
  token_refreshing_at: null,
  updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Phase 53-05 — Sentry capture on Xero connection deactivation', () => {
  beforeEach(() => {
    vi.resetModules();
    captureMessageMock.mockReset();
    captureExceptionMock.mockReset();
    process.env.XERO_CLIENT_ID = 'test-client';
    process.env.XERO_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1 — fires captureMessage with invariant=xero_connection_deactivated when refresh returns confirmed invalid_grant', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () => xeroResponse('invalid_grant'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.shouldDeactivate).toBe(true);
    expect(handle.state.row.is_active).toBe(false);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureMessageMock.mock.calls[0];
    expect(message).toBe('Xero connection deactivated');
    expect(ctx?.tags?.invariant).toBe('xero_connection_deactivated');
  });

  it('Test 2 — tags include all 6 required keys (invariant, tenant_id, business_id, connection_id, error_code, retry_count) all as strings', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () => xeroResponse('invalid_grant'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [, ctx] = captureMessageMock.mock.calls[0];
    expect(ctx?.tags?.invariant).toBe('xero_connection_deactivated');
    expect(ctx?.tags?.tenant_id).toBe('tenant-xyz');
    expect(ctx?.tags?.business_id).toBe('biz-1');
    expect(ctx?.tags?.connection_id).toBe('conn-1');
    expect(ctx?.tags?.error_code).toBe('invalid_grant');
    // retry_count must be a STRING (Sentry tags must be strings)
    expect(typeof ctx?.tags?.retry_count).toBe('string');
    expect(ctx?.tags?.retry_count).toBe('1');
  });

  it('Test 3 — extras include xero_status, xero_error_body (truncated ≤4KB), xero_message, attempt', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () => xeroResponse('invalid_grant_huge_body'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [, ctx] = captureMessageMock.mock.calls[0];
    expect(ctx?.extra?.xero_status).toBe(400);
    expect(typeof ctx?.extra?.xero_error_body).toBe('string');
    // 4KB cap (4096 chars). Must NOT be the full 5KB body.
    expect(ctx?.extra?.xero_error_body.length).toBeLessThanOrEqual(4096);
    expect(ctx?.extra?.xero_message).toBeTruthy();
    expect(ctx?.extra?.attempt).toBe(1);
    expect(ctx?.level).toBe('error');
  });

  it('Test 4 — does NOT fire capture on transient errors (5xx) where shouldDeactivate=false', async () => {
    vi.useFakeTimers();
    const handle = makeMockSupabase(BASE_ROW);
    vi.spyOn(global, 'fetch').mockImplementation(async () => xeroResponse('500'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    const promise = getValidAccessToken({ id: 'conn-1' }, handle.client);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    vi.useRealTimers();

    expect(result.shouldDeactivate).not.toBe(true);
    expect(handle.state.row.is_active).toBe(true);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('Test 5 — Sentry capture failure is non-fatal: deactivation DB write still happens', async () => {
    const handle = makeMockSupabase(BASE_ROW);
    captureMessageMock.mockImplementation(() => {
      throw new Error('Sentry exploded');
    });
    vi.spyOn(global, 'fetch').mockImplementation(async () => xeroResponse('invalid_grant'));

    const { getValidAccessToken } = await import('@/lib/xero/token-manager');
    // Must NOT throw despite Sentry blowing up
    const result = await getValidAccessToken({ id: 'conn-1' }, handle.client);

    expect(result.shouldDeactivate).toBe(true);
    // The is_active=false write completed despite the Sentry throw
    expect(handle.state.row.is_active).toBe(false);
  });

  it('Test 6 — per-route deactivation in employees/route.ts has comment marker indicating Sentry capture is centralized in token-manager', async () => {
    // Static-analysis assertion: the comment marker MUST exist in
    // employees/route.ts so future maintainers know not to add a duplicate
    // Sentry capture there. See must_haves.truths[2] in 53-05-PLAN.md.
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(
      process.cwd(),
      'src/app/api/Xero/employees/route.ts',
    );
    const contents = fs.readFileSync(file, 'utf8');
    expect(contents).toMatch(
      /Phase 53-05: Sentry capture is centralized in token-manager\.ts; do NOT add a second capture here\./,
    );
    // And no Sentry import sneaks in
    expect(contents).not.toMatch(/from ['"]@sentry\/nextjs['"]/);
  });
});
