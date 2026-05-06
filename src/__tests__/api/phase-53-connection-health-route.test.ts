/**
 * Phase 53-05 Task 2 RED:
 *   GET /api/Xero/connection-health endpoint covering:
 *
 *   Auth & input validation:
 *     1. 401 unauthenticated
 *     2. Empty results when no business_ids[] supplied
 *     3. 400 when >200 business_ids[] (sanity cap)
 *
 *   RBAC (defense in depth — endpoint independently re-validates each id):
 *     4. coach sees only assigned businesses
 *     5. owner sees only owned businesses
 *     6. super_admin sees all requested
 *
 *   Status thresholds (12h verified — see Issue B in 53-05-PLAN-CHECK.md):
 *     7. status=verified when last_synced_at within 12h
 *     8. status=stale when last refresh >12h ago and is_active=true
 *     9. status=dead when is_active=false
 *     10. status=none when no xero_connections row
 *
 *   Dual-ID resolution + active-preferred:
 *     11. Connection under business_profiles.id maps to canonical businesses.id
 *     12. Active row preferred over dead row when both exist for same business
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRouteHandlerFrom = vi.fn();
const mockAdminFrom = vi.fn();

// ─── Module mocks (declared before importing the route) ────────────────────

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

function makeReq(businessIds: string[]) {
  const params = businessIds
    .map((id) => `business_ids[]=${encodeURIComponent(id)}`)
    .join('&');
  const url = params
    ? `http://localhost/api/Xero/connection-health?${params}`
    : 'http://localhost/api/Xero/connection-health';
  return new NextRequest(url, { method: 'GET' });
}

interface FakeBusiness {
  id: string;
  owner_id: string | null;
  assigned_coach_id: string | null;
}

interface FakeProfile {
  id: string;
  business_id: string;
}

interface FakeConnection {
  id: string;
  business_id: string;
  is_active: boolean;
  last_synced_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

/**
 * Build the admin-client mock for one test. Configures responses for
 * `businesses`, `business_profiles`, and `xero_connections` tables.
 */
function configureAdmin(opts: {
  businesses?: FakeBusiness[];
  profiles?: FakeProfile[];
  connections?: FakeConnection[];
}) {
  const businesses = opts.businesses ?? [];
  const profiles = opts.profiles ?? [];
  const connections = opts.connections ?? [];

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'businesses') {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => ({
            then: (resolve: any) =>
              Promise.resolve({
                data: businesses.filter((b) => ids.includes(b.id)),
                error: null,
              }).then(resolve),
          }),
        }),
      };
    }
    if (table === 'business_profiles') {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => ({
            then: (resolve: any) =>
              Promise.resolve({
                data: profiles.filter((p) => ids.includes(p.business_id)),
                error: null,
              }).then(resolve),
          }),
        }),
      };
    }
    if (table === 'xero_connections') {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => ({
            order: (_orderCol: string, _opts: any) => ({
              then: (resolve: any) =>
                Promise.resolve({
                  data: connections
                    .filter((c) => ids.includes(c.business_id))
                    // mimic .order('updated_at', { ascending: false })
                    .sort((a, b) =>
                      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
                    ),
                  error: null,
                }).then(resolve),
            }),
          }),
        }),
      };
    }
    throw new Error(`configureAdmin: unconfigured table "${table}"`);
  });
}

/**
 * Set the route-handler-client (auth) supabase. system_roles lookup uses
 * .from('system_roles').select('role').eq().maybeSingle().
 */
function configureAuth(user: { id: string } | null, role?: string) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  mockRouteHandlerFrom.mockImplementation((table: string) => {
    if (table === 'system_roles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              role ? { data: { role }, error: null } : { data: null, error: null },
          }),
        }),
      };
    }
    throw new Error(`configureAuth: unconfigured table "${table}"`);
  });
}

const isoFromNow = (ms: number) => new Date(Date.now() + ms).toISOString();
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  mockGetUser.mockReset();
  mockRouteHandlerFrom.mockReset();
  mockAdminFrom.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/Xero/connection-health — auth & validation', () => {
  it('Test 1 — 401 when unauthenticated', async () => {
    configureAuth(null);
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('Test 2 — returns empty results when no business_ids[] supplied', async () => {
    configureAuth({ id: 'user-1' });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq([]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it('Test 3 — returns 400 when >200 business_ids[] supplied', async () => {
    configureAuth({ id: 'user-1' });
    const tooMany = Array.from({ length: 201 }, (_, i) => `b-${i}`);
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(tooMany));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
  });
});

describe('GET /api/Xero/connection-health — RBAC (defense in depth)', () => {
  it('Test 4 — coach sees only assigned businesses', async () => {
    configureAuth({ id: 'coach-1' });
    configureAdmin({
      businesses: [
        { id: 'biz-1', owner_id: 'owner-x', assigned_coach_id: 'coach-1' }, // assigned
        { id: 'biz-2', owner_id: 'owner-y', assigned_coach_id: 'coach-9' }, // not assigned
        { id: 'biz-3', owner_id: 'owner-z', assigned_coach_id: 'coach-1' }, // assigned
      ],
      profiles: [],
      connections: [],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1', 'biz-2', 'biz-3']));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.results.map((r: any) => r.business_id).sort();
    expect(ids).toEqual(['biz-1', 'biz-3']);
  });

  it('Test 5 — owner sees only owned businesses', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [
        { id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }, // owned
        { id: 'biz-2', owner_id: 'owner-9', assigned_coach_id: null }, // not owned
      ],
      profiles: [],
      connections: [],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1', 'biz-2']));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.results.map((r: any) => r.business_id);
    expect(ids).toEqual(['biz-1']);
  });

  it('Test 6 — super_admin sees all requested business_ids without filter', async () => {
    configureAuth({ id: 'admin-1' }, 'super_admin');
    configureAdmin({
      // Even though super_admin path skips business filter, return empty
      // so the response just maps each requested id to status='none'.
      businesses: [],
      profiles: [],
      connections: [],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1', 'biz-2', 'biz-foreign']));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.results.map((r: any) => r.business_id).sort();
    expect(ids).toEqual(['biz-1', 'biz-2', 'biz-foreign']);
  });
});

describe('GET /api/Xero/connection-health — status thresholds (12h verified, Issue B)', () => {
  it('Test 7 — status=verified when last_synced_at within 12h', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: [
        {
          id: 'conn-1',
          business_id: 'biz-1',
          is_active: true,
          last_synced_at: isoFromNow(-2 * HOUR), // 2h ago
          updated_at: isoFromNow(-2 * HOUR),
          expires_at: isoFromNow(20 * 60 * 1000), // 20min in future (past 30min grace)
        },
      ],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe('verified');
    expect(body.results[0].connection_id).toBe('conn-1');
  });

  it('Test 8 — status=stale when last refresh >12h ago and expires_at past 30min grace', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: [
        {
          id: 'conn-stale',
          business_id: 'biz-1',
          is_active: true,
          last_synced_at: isoFromNow(-3 * 24 * HOUR), // 3 days ago
          updated_at: isoFromNow(-3 * 24 * HOUR),
          expires_at: isoFromNow(-2 * 24 * HOUR), // expired 2 days ago
        },
      ],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe('stale');
  });

  it('Test 9 — status=dead when is_active=false', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: [
        {
          id: 'conn-dead',
          business_id: 'biz-1',
          is_active: false,
          last_synced_at: isoFromNow(-1 * HOUR),
          updated_at: isoFromNow(-1 * HOUR),
          expires_at: isoFromNow(1 * HOUR),
        },
      ],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe('dead');
    expect(body.results[0].connection_id).toBe('conn-dead');
  });

  it('Test 10 — status=none when no xero_connections row', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: [],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toEqual({
      business_id: 'biz-1',
      status: 'none',
      last_refresh_at: null,
      expires_at: null,
      connection_id: null,
    });
  });
});

describe('GET /api/Xero/connection-health — dual-ID resolution + active-preferred', () => {
  it('Test 11 — connection under business_profiles.id maps to canonical businesses.id', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-canonical', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [{ id: 'prof-legacy', business_id: 'biz-canonical' }],
      connections: [
        {
          // Connection row stored against the legacy profile id
          id: 'conn-legacy',
          business_id: 'prof-legacy',
          is_active: true,
          last_synced_at: isoFromNow(-1 * HOUR),
          updated_at: isoFromNow(-1 * HOUR),
          expires_at: isoFromNow(2 * HOUR),
        },
      ],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-canonical']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].business_id).toBe('biz-canonical');
    expect(body.results[0].status).toBe('verified');
    expect(body.results[0].connection_id).toBe('conn-legacy');
  });

  it('Test 12 — active row preferred over dead row when both exist for the same business', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [{ id: 'prof-1', business_id: 'biz-1' }],
      connections: [
        // Old dead row with most recent updated_at (would win on order alone)
        {
          id: 'conn-dead-recent',
          business_id: 'biz-1',
          is_active: false,
          last_synced_at: isoFromNow(-30 * 60 * 1000),
          updated_at: isoFromNow(-30 * 60 * 1000),
          expires_at: isoFromNow(-2 * HOUR),
        },
        // Newer active row but updated_at slightly older
        {
          id: 'conn-active',
          business_id: 'prof-1',
          is_active: true,
          last_synced_at: isoFromNow(-2 * HOUR),
          updated_at: isoFromNow(-1 * HOUR),
          expires_at: isoFromNow(2 * HOUR),
        },
      ],
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe('verified');
    expect(body.results[0].connection_id).toBe('conn-active');
  });
});
