/**
 * Phase 53-02: Centralized Xero token refresh — invariant tests.
 *
 * These tests LOCK IN the centralization invariant so a future regression
 * that re-introduces a duplicate refresh implementation FAILS in CI.
 *
 * Pre-Task-1, Test 1 fails (refresh-tokens route file exists).
 * Pre-Task-2, Test 4 fails (reactivate uses inline fetch instead of getValidAccessToken).
 * Pre-Task-2, Test 2 fails (4 fetch sites: token-manager + callback + reactivate +
 * refresh-tokens before deletion).
 * Pre-Task-2, Test 3 fails (2 grant_type=refresh_token call sites in src/).
 *
 * Plan-check F2 fix: Test 2 verifies URL-substring count (with explicit allowlist
 * for known non-refresh callsites: callback uses authorization_code, middleware is
 * a CSP allowlist string). Test 3 is the SHARPER invariant — exactly ONE
 * grant_type=refresh_token usage in src/, and it must live in token-manager.ts.
 *
 * Plan-check F3 (informational): scripts/resync-envisage-now.ts:83 IS a real
 * refresh duplicate that bypasses the lock. It is OUT OF SCOPE for 53-02
 * (operator-only ops script) and intentionally NOT scanned by these tests.
 * Future cleanup work should fold it into the centralized refresh path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const REPO_ROOT = process.cwd();

// ─── Hoisted mock state for Test 4 ───────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRouteHandlerFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockGetValidAccessToken = vi.fn();

// ─── Module mocks (must be declared before importing the route) ──────────────

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockRouteHandlerFrom,
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}));

// ─── Helpers for Test 4 ──────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/Xero/reactivate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build the supabaseAdmin .from() stub for a successful reactivate.
 * Returns chainable mocks for:
 *   - businesses: returns { id, owner_id, assigned_coach_id }
 *   - business_profiles: no profile row (the business-id form is the only one)
 *   - xero_connections (read by business_id): the business's rows — one inactive
 *   - xero_connections (update is_active=true): returns success
 *   - xero_connections (read by id): the freshly-saved row
 * Multi-org behaviour is covered in src/__tests__/api/xero-reactivate-every-org.test.ts.
 */
function buildAdminFromForReactivate(opts: {
  business: { id: string; owner_id: string; assigned_coach_id: string | null };
  connectionRow: any;
  refreshedRow: any;
}) {
  return (table: string) => {
    if (table === 'businesses') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data: opts.business, error: null }),
      };
      return chain;
    }
    if (table === 'business_profiles') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    }
    if (table === 'xero_connections') {
      let isUpdate = false;
      let inColumn = '';
      const chain: any = {
        select: () => chain,
        update: () => {
          isUpdate = true;
          return chain;
        },
        eq: () => chain,
        in: (column: string) => {
          inColumn = column;
          return chain;
        },
        order: () => chain,
        // Every chain in reactivate is awaited directly.
        then: (resolve: any) => {
          if (isUpdate) return resolve({ data: [{ id: opts.connectionRow.id }], error: null });
          if (inColumn === 'business_id') return resolve({ data: [opts.connectionRow], error: null });
          // No other business holds this tenant live.
          if (inColumn === 'tenant_id') return resolve({ data: [], error: null });
          return resolve({ data: [opts.refreshedRow], error: null });
        },
      };
      return chain;
    }
    throw new Error(`buildAdminFromForReactivate: unexpected table "${table}"`);
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Phase 53-02 — centralized Xero token refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1: deleted route file is gone ──────────────────────────────────
  it('Test 1 — /api/Xero/refresh-tokens/route.ts no longer exists', () => {
    const deletedRoute = path.join(REPO_ROOT, 'src/app/api/Xero/refresh-tokens/route.ts');
    expect(fs.existsSync(deletedRoute)).toBe(false);

    // Also assert the parent directory is gone (no empty dir lingering).
    const deletedDir = path.join(REPO_ROOT, 'src/app/api/Xero/refresh-tokens');
    expect(fs.existsSync(deletedDir)).toBe(false);
  });

  // ─── Test 2: URL-substring count of identity.xero.com/connect/token ──────
  // INVARIANT: number of files in src/app/api/ + src/lib/ that mention the
  //            Xero token URL. The allowlist excludes middleware (CSP string)
  //            because we restrict the grep to the API + lib trees.
  // (Plan-check F2 fix: scope narrowed; semantics renamed.)
  it('Test 2 — URL-substring count: only token-manager + callback mention identity.xero.com/connect/token in src/app/api + src/lib', () => {
    let out = '';
    try {
      out = execSync(
        `grep -rln "identity.xero.com/connect/token" src/app/api src/lib --include='*.ts' --include='*.tsx' || true`,
        { encoding: 'utf8', cwd: REPO_ROOT }
      ).trim();
    } catch (e: any) {
      // grep exit 1 means no matches; treat as empty
      out = (e.stdout || '').toString().trim();
    }

    const files = out.split('\n').filter(Boolean).sort();

    const expected = [
      'src/app/api/Xero/callback/route.ts',     // authorization_code grant (initial OAuth)
      'src/lib/xero/token-manager.ts',           // refresh_token grant (canonical)
    ].sort();

    expect(files).toEqual(expected);
  });

  // ─── Test 3: refresh-implementation count (sharper invariant) ────────────
  // INVARIANT: exactly ONE site in src/ that issues a Xero refresh-token
  //            grant request. Greps for both URL-encoded form-body
  //            (`grant_type=refresh_token`) and JS object-literal
  //            (`grant_type: 'refresh_token'`) shapes.
  // (Plan-check F2 fix: this is the test that actually proves "centralized".)
  it("Test 3 — exactly one grant_type=refresh_token call site in src/app/api + src/lib, and it lives in token-manager.ts", () => {
    let out = '';
    try {
      out = execSync(
        // Restrict to runtime trees (src/app/api + src/lib) so this test file
        // (which contains the grep pattern as a literal string) does not
        // self-match. The runtime-trees scope is also the meaningful one —
        // ops scripts and __tests__ are out-of-scope per plan + plan-check F3.
        `grep -rln -E "grant_type=refresh_token|grant_type: ['\\"]refresh_token['\\"]" src/app/api src/lib --include='*.ts' --include='*.tsx' || true`,
        { encoding: 'utf8', cwd: REPO_ROOT }
      ).trim();
    } catch (e: any) {
      out = (e.stdout || '').toString().trim();
    }

    const files = out.split('\n').filter(Boolean);

    // Exactly one file in src/app/api + src/lib should issue a refresh-token grant.
    expect(files).toEqual(['src/lib/xero/token-manager.ts']);
  });

  // ─── Test 4: reactivate route delegates to getValidAccessToken ───────────
  // INVARIANT: reactivate calls the centralized helper, not fetch() directly.
  it('Test 4 — reactivate route calls getValidAccessToken (mocked) and never fetches identity.xero.com', async () => {
    // Spy on global fetch BEFORE importing the route handler so any direct
    // fetch attempt would be observable.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (..._args: any[]) => new Response(JSON.stringify({}), { status: 200 }) as any
    );

    // Auth: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-owner-1' } },
      error: null,
    });

    // RBAC: owner check via supabaseAdmin.from('businesses') succeeds without
    // needing the role-row fallback. (allowed=true after the first check.)
    const connectionRow = {
      id: 'conn-1',
      business_id: 'biz-1',
      tenant_id: 'tenant-uuid-1',
      tenant_name: 'Test Org',
      access_token: 'ENCRYPTED-AT',
      refresh_token: 'ENCRYPTED-RT',
      expires_at: '2020-01-01T00:00:00.000Z',
      is_active: false,
      updated_at: '2024-01-01T00:00:00.000Z',
    };
    const refreshedRow = {
      id: 'conn-1',
      tenant_name: 'Test Org',
      expires_at: '2026-12-31T00:00:00.000Z',
    };

    mockAdminFrom.mockImplementation(
      buildAdminFromForReactivate({
        business: { id: 'biz-1', owner_id: 'user-owner-1', assigned_coach_id: null },
        connectionRow,
        refreshedRow,
      })
    );

    // The token-manager mock returns a successful refresh.
    mockGetValidAccessToken.mockResolvedValue({
      success: true,
      accessToken: 'fresh-access-token',
    });

    // Import the route handler AFTER mocks are wired up.
    const { POST } = await import('@/app/api/Xero/reactivate/route');

    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    // Assert the centralized helper was called exactly once with { id }.
    expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
    const [arg0] = mockGetValidAccessToken.mock.calls[0];
    expect(arg0).toEqual({ id: 'conn-1' });

    // Assert no direct fetch to identity.xero.com from reactivate.
    const xeroFetches = fetchSpy.mock.calls.filter((call) => {
      const url = String(call[0] ?? '');
      return url.includes('identity.xero.com');
    });
    expect(xeroFetches).toHaveLength(0);

    // Assert success path response shape.
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      was_inactive: true,
      connection: { id: 'conn-1', tenant_name: 'Test Org' },
    });

    fetchSpy.mockRestore();
  });
});
