/**
 * Phase 53-01 Task 1 RED:
 *   ALL 10 tests fail on HEAD because src/app/api/Xero/disconnect/route.ts
 *   does not yet export POST. Becomes GREEN in Task 2 once the route ships.
 *
 * Coverage:
 *   - Auth (401 anon)
 *   - Validation (400 missing business_id)
 *   - Lookup (404 unknown business)
 *   - RBAC (403 non-owner non-coach non-superadmin)
 *   - Dual-ID delete from both input directions (businesses.id, business_profiles.id)
 *   - Single-ID delete when no business_profiles mirror exists
 *   - deleted_count=0 → success:false soft-failure
 *   - Super-admin override
 *   - DELETE error → 500
 *
 * The load-bearing assertion is the .in('business_id', X) capture in
 * Tests 5, 6, and 9 — proving the dual-ID delete actually fires both
 * forms (the JDS 2026-05-05 bug). See 53-RESEARCH.md §3.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRouteHandlerFrom = vi.fn();
const mockAdminFrom = vi.fn();

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/Xero/disconnect', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Builds a chainable Supabase admin-client stub. Each test composes per-table
 * behaviour by passing the rows that .maybeSingle() / .select() should resolve
 * to, plus a deleteCapture() callback that receives the .in() arg array — this
 * is how Tests 5, 6, 9 prove the dual-ID delete shape.
 */
type TableSpec = {
  maybeSingle?: () => Promise<{ data: any }>;
  // For the xero_connections.delete().in().select() chain
  delete?: {
    inCapture?: (column: string, ids: string[]) => void;
    result: { data?: any[]; error?: { message: string } };
  };
};

function buildAdminFrom(specs: Record<string, TableSpec>) {
  return (table: string) => {
    const spec = specs[table];
    if (!spec) {
      throw new Error(`buildAdminFrom: unconfigured table "${table}"`);
    }

    // Read path: .from(table).select(...).eq(...).maybeSingle()
    // (eq may chain twice depending on the lookup; both routes funnel to maybeSingle)
    const readChain: any = {
      select: () => readChain,
      eq: () => readChain,
      maybeSingle: spec.maybeSingle ?? (async () => ({ data: null })),
    };

    // Delete path: .from('xero_connections').delete().in(col, ids).select(...)
    if (table === 'xero_connections' && spec.delete) {
      return {
        ...readChain,
        delete: () => ({
          in: (column: string, ids: string[]) => {
            spec.delete!.inCapture?.(column, ids);
            return {
              select: async () => spec.delete!.result,
            };
          },
        }),
      };
    }

    return readChain;
  };
}

function buildRouteHandlerFrom(role: string | null) {
  // The route's cookie-session client is only used to look up system_roles for
  // the super_admin check (everything else uses the admin client).
  return (table: string) => {
    if (table === 'system_roles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (role ? { data: { role } } : { data: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    };
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/Xero/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
  });

  it('Test 1 — returns 401 when no user session', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
    // Plan-check F3: explicit assertion that the admin client is never touched
    // when the caller is unauthenticated.
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('Test 2 — returns 400 when business_id missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/business_id is required/i);
  });

  it('Test 3 — returns 404 when business unknown (neither businesses nor business_profiles match)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: { maybeSingle: async () => ({ data: null }) },
        business_profiles: { maybeSingle: async () => ({ data: null }) },
      })
    );

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'unknown-id' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/business not found/i);
  });

  it('Test 4 — returns 403 when caller is neither owner nor coach nor super_admin', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'someone-else', assigned_coach_id: 'another' },
          }),
        },
        business_profiles: { maybeSingle: async () => ({ data: { id: 'profile-1' } }) },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/access denied/i);
  });

  it('Test 5 — issues a dual-ID delete when input is businesses.id', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });

    let capturedColumn = '';
    let capturedIds: string[] = [];

    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'u-1', assigned_coach_id: null },
          }),
        },
        business_profiles: {
          maybeSingle: async () => ({ data: { id: 'profile-1' } }),
        },
        xero_connections: {
          delete: {
            inCapture: (column, ids) => {
              capturedColumn = column;
              capturedIds = ids;
            },
            result: {
              data: [
                { id: 'c1', business_id: 'biz-1', tenant_id: 't1', is_active: true },
                { id: 'c2', business_id: 'profile-1', tenant_id: 't1', is_active: false },
              ],
            },
          },
        },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted_count).toBe(2);
    // Load-bearing dual-ID assertion
    expect(capturedColumn).toBe('business_id');
    expect(new Set(capturedIds)).toEqual(new Set(['biz-1', 'profile-1']));
    expect(new Set(body.deleted_ids)).toEqual(new Set(['biz-1', 'profile-1']));
  });

  it('Test 6 — issues a dual-ID delete when input is business_profiles.id (caller is the assigned coach)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'coach-1' } }, error: null });

    let capturedIds: string[] = [];

    // The route flow: try businesses.eq(id, 'profile-1') → null;
    //                 then business_profiles.eq(id, 'profile-1') → {business_id:'biz-1'};
    //                 then businesses.eq(id, 'biz-1') → {owner:'someone-else', coach:'coach-1'}.
    let businessesCallCount = 0;
    let businessProfilesCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'businesses') {
        businessesCallCount++;
        const isFirstLookup = businessesCallCount === 1;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                isFirstLookup
                  ? { data: null }
                  : {
                      data: {
                        id: 'biz-1',
                        owner_id: 'someone-else',
                        assigned_coach_id: 'coach-1',
                      },
                    },
            }),
          }),
        };
      }
      if (table === 'business_profiles') {
        businessProfilesCallCount++;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'profile-1', business_id: 'biz-1' },
              }),
            }),
          }),
        };
      }
      if (table === 'xero_connections') {
        return {
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              capturedIds = ids;
              return {
                select: async () => ({
                  data: [{ id: 'c1', business_id: 'biz-1', tenant_id: 't1', is_active: true }],
                }),
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'profile-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(new Set(capturedIds)).toEqual(new Set(['biz-1', 'profile-1']));
    expect(businessProfilesCallCount).toBeGreaterThanOrEqual(1);
  });

  it('Test 7 — returns success:false with deleted_count=0 when no rows match', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'u-1', assigned_coach_id: null },
          }),
        },
        business_profiles: {
          maybeSingle: async () => ({ data: { id: 'profile-1' } }),
        },
        xero_connections: {
          delete: { result: { data: [] } },
        },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('nothing_to_delete');
    expect(body.deleted_count).toBe(0);
    expect(new Set(body.ids_checked)).toEqual(new Set(['biz-1', 'profile-1']));
  });

  it('Test 8 — allows super_admin caller even without owner/coach link', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } }, error: null });
    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'someone', assigned_coach_id: 'another' },
          }),
        },
        business_profiles: { maybeSingle: async () => ({ data: { id: 'profile-1' } }) },
        xero_connections: {
          delete: {
            result: {
              data: [{ id: 'c1', business_id: 'biz-1', tenant_id: 't1', is_active: true }],
            },
          },
        },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom('super_admin'));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted_count).toBe(1);
  });

  it('Test 9 — single-ID delete when only canonical ID has a row (no business_profiles mirror)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });

    let capturedIds: string[] = [];

    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'u-1', assigned_coach_id: null },
          }),
        },
        business_profiles: { maybeSingle: async () => ({ data: null }) }, // no mirror
        xero_connections: {
          delete: {
            inCapture: (_col, ids) => {
              capturedIds = ids;
            },
            result: {
              data: [{ id: 'c1', business_id: 'biz-1', tenant_id: 't1', is_active: true }],
            },
          },
        },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(capturedIds).toEqual(['biz-1']); // single-element, deduped
    expect(body.deleted_count).toBe(1);
  });

  it('Test 10 — returns 500 with error message when DELETE fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminFrom.mockImplementation(
      buildAdminFrom({
        businesses: {
          maybeSingle: async () => ({
            data: { id: 'biz-1', owner_id: 'u-1', assigned_coach_id: null },
          }),
        },
        business_profiles: { maybeSingle: async () => ({ data: { id: 'profile-1' } }) },
        xero_connections: {
          delete: { result: { error: { message: 'fk_violation' } } },
        },
      })
    );
    mockRouteHandlerFrom.mockImplementation(buildRouteHandlerFrom(null));

    const { POST } = await import('@/app/api/Xero/disconnect/route');
    const res = await POST(makeReq({ business_id: 'biz-1' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('delete_failed');
    expect(body.message).toMatch(/fk_violation/);
  });
});
