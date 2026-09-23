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
 *     7. status=connected when the token is fresh and the data is current
 *     8. status=auth_stale when no token has been granted in >12h
 *     9. status=dead when is_active=false
 *     10. status=none when no xero_connections row
 *
 *   Dual-ID resolution + active-preferred:
 *     11. Connection under business_profiles.id maps to canonical businesses.id
 *     12. A live row supersedes a dead row for the SAME Xero org
 *
 *   Multi-org businesses (15 Sep 2026 — worst org wins, whatever the row order):
 *     13. One of three orgs stale reads data_stale and names that org
 *     14. A dead org with no live row makes the business dead
 *         14b. ...without hiding a sibling that also needs attention
 *         14c. ...unless it was retired on purpose (off AND excluded from consolidation)
 *     15. A failed xero_connections read is a 500, never a fleet of 'none'
 *     16. A failed sync_jobs lookup is unknown, never green
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRouteHandlerFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

// ─── Module mocks (declared before importing the route) ────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockRouteHandlerFrom,
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
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
  tenant_id?: string;
  tenant_name?: string | null;
  include_in_consolidation?: boolean | null;
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
  connectionsError?: { message: string };
  syncJobsError?: { message: string };
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
    if (table === 'business_users') {
      // Second-owner RBAC (canManageIntegrations rollout, c383b70): the route now also
      // grants studios where the caller holds an ACTIVE owner/admin business_users row.
      // These fixtures model sole-owner studios, so the membership set is empty — the
      // pre-rollout behaviour. The chain is .select().eq().eq().in().in() → thenable.
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    }
    if (table === 'xero_connections') {
      // Rows come back in FIXTURE order whatever .order() the route asks for:
      // the classification must not depend on it, and tests feed the same rows
      // in different orders to prove that.
      let ids: string[] = [];
      const chain: any = {
        select: () => chain,
        in: (_col: string, v: string[]) => {
          ids = v;
          return chain;
        },
        order: () => chain,
        then: (resolve: any) =>
          Promise.resolve(
            opts.connectionsError
              ? { data: null, error: opts.connectionsError }
              : {
                  data: connections
                    .filter((c) => ids.includes(c.business_id))
                    // These fixtures are about STATES, not about identifiers.
                    // Default the two columns the classifier needs for keying so
                    // each case still asserts the thing it was written to assert
                    // — a missing tenant_id now legitimately yields 'unknown',
                    // and without this every case would collapse to that one
                    // answer regardless of the state it set up.
                    .map((c: any) => ({
                      tenant_id: `t-${c.id}`,
                      created_at: isoFromNow(-30 * 24 * HOUR),
                      ...c,
                    })),
                  error: null,
                },
          ).then(resolve),
      };
      return chain;
    }
    throw new Error(`configureAdmin: unconfigured table "${table}"`);
  });

  // The data clock (last_xero_sync_by_tenant). These fixtures set freshness
  // through xero_connections.last_synced_at, so the sync_jobs side contributes
  // nothing and the fold reduces to the column — but the lookup must still
  // succeed, because a FAILED lookup now (correctly) classifies as 'unknown'
  // rather than quietly reading as "nobody has synced".
  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn !== 'last_xero_sync_by_tenant') throw new Error(`configureAdmin: unexpected rpc "${fn}"`);
    return opts.syncJobsError ? { data: null, error: opts.syncJobsError } : { data: {}, error: null };
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
  mockAdminRpc.mockReset();
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
  it('Test 7 — status=connected when token fresh and data current', async () => {
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
    expect(body.results[0].status).toBe('connected');
    expect(body.results[0].connection_id).toBe('conn-1');
  });

  describe('audience — which DATA threshold applies', () => {
    // Same row, three requests. 60h since the last sync: past the coach's 48h,
    // inside the owner's 72h.
    const sixtyHoursStale = {
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: [
        {
          id: 'conn-1',
          business_id: 'biz-1',
          is_active: true,
          last_synced_at: isoFromNow(-60 * HOUR),
          updated_at: isoFromNow(-1 * HOUR),
          expires_at: isoFromNow(20 * 60 * 1000),
        },
      ],
    };

    const call = async (qs: string) => {
      configureAuth({ id: 'owner-1' });
      configureAdmin(sixtyHoursStale);
      const { GET } = await import('@/app/api/Xero/connection-health/route');
      const res = await GET(
        new NextRequest(`http://localhost/api/Xero/connection-health?business_ids[]=biz-1${qs}`, {
          method: 'GET',
        }),
      );
      return (await res.json()).results[0].status;
    };

    it('the coach sees data_stale at 60h (48h threshold)', async () => {
      expect(await call('&audience=coach')).toBe('data_stale');
    });

    it('the owner still sees connected at 60h (72h threshold)', async () => {
      // Deliberate: the coach is told first so they can raise it, rather than
      // the franchisee opening their own page to a warning nobody has looked at.
      expect(await call('&audience=owner')).toBe('connected');
    });

    it('an absent or unrecognised audience falls back to the STRICTER threshold', async () => {
      // If we cannot tell who is asking, warn earlier rather than later.
      expect(await call('')).toBe('data_stale');
      expect(await call('&audience=nonsense')).toBe('data_stale');
    });
  });

  it('Test 8 — status=auth_stale when Xero has not granted a token in >12h', async () => {
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
    expect(body.results[0].status).toBe('auth_stale');
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
      last_sync_at: null,
      expires_at: null,
      connection_id: null,
      tenant_name: null,
      status_scope: null,
      more_orgs_needing_attention: 0,
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
    expect(body.results[0].status).toBe('connected');
    expect(body.results[0].connection_id).toBe('conn-legacy');
  });

  // POLICY CHANGE, 15 Sep 2026. This fixture used to give the dead and live rows
  // DIFFERENT orgs and expect 'connected' — any live row anywhere excused a
  // dead one. That is how a refused org hid inside a multi-org business, so the
  // different-org shape now reads dead (Test 14). Supersession is per org:
  // only a live row for the SAME tenant sets a dead row aside.
  it('Test 12 — a live row supersedes a dead row for the same Xero org, however recently the dead one was stamped', async () => {
    const deadRecent: FakeConnection = {
      // Old dead row with the most recent updated_at (would win on order alone)
      id: 'conn-dead-recent',
      business_id: 'biz-1',
      tenant_id: 't-shared',
      is_active: false,
      last_synced_at: isoFromNow(-30 * 60 * 1000),
      updated_at: isoFromNow(-30 * 60 * 1000),
      expires_at: isoFromNow(-2 * HOUR),
    };
    const active: FakeConnection = {
      // The reconnect of the SAME org, under the other id form
      id: 'conn-active',
      business_id: 'prof-1',
      tenant_id: 't-shared',
      is_active: true,
      last_synced_at: isoFromNow(-2 * HOUR),
      updated_at: isoFromNow(-1 * HOUR),
      expires_at: isoFromNow(2 * HOUR),
    };
    for (const connections of [[deadRecent, active], [active, deadRecent]]) {
      configureAuth({ id: 'owner-1' });
      configureAdmin({
        businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
        profiles: [{ id: 'prof-1', business_id: 'biz-1' }],
        connections,
      });
      const { GET } = await import('@/app/api/Xero/connection-health/route');
      const res = await GET(makeReq(['biz-1']));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results[0].status).toBe('connected');
      expect(body.results[0].connection_id).toBe('conn-active');
    }
  });
});

describe('GET /api/Xero/connection-health — multi-org businesses', () => {
  // IICT Group, 15 Sep 2026: three orgs, one failing every sync since 10 Sep
  // while its token refreshes. The route used to classify whichever row was
  // written last, so this business flipped between connected and data_stale.
  const iictRows: FakeConnection[] = [
    {
      id: 'conn-aust',
      business_id: 'biz-iict',
      tenant_id: 't-aust',
      tenant_name: 'IICT (Aust) Pty Ltd',
      is_active: true,
      last_synced_at: isoFromNow(-3 * HOUR),
      updated_at: isoFromNow(-1 * 60_000),
      expires_at: isoFromNow(25 * 60_000),
    },
    {
      id: 'conn-pty',
      business_id: 'biz-iict',
      tenant_id: 't-pty',
      tenant_name: 'IICT Group Pty Ltd',
      is_active: true,
      last_synced_at: isoFromNow(-106 * HOUR),
      updated_at: isoFromNow(-2 * 60_000),
      expires_at: isoFromNow(25 * 60_000),
    },
    {
      id: 'conn-hk',
      business_id: 'biz-iict',
      tenant_id: 't-hk',
      tenant_name: 'IICT Group Limited',
      is_active: true,
      last_synced_at: isoFromNow(-3 * HOUR),
      updated_at: isoFromNow(-3 * 60_000),
      expires_at: isoFromNow(25 * 60_000),
    },
  ];

  const fetchOne = async (connections: FakeConnection[], businessId = 'biz-iict') => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: businessId, owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections,
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq([businessId]));
    expect(res.status).toBe(200);
    return (await res.json()).results[0];
  };

  it('Test 13 — one org of three stale reads data_stale and names that org, in any row order', async () => {
    const first = await fetchOne(iictRows);
    expect(first).toMatchObject({
      status: 'data_stale',
      tenant_name: 'IICT Group Pty Ltd',
      status_scope: 'IICT Group Pty Ltd',
      connection_id: 'conn-pty',
      more_orgs_needing_attention: 0,
    });
    const orders = [
      [iictRows[1], iictRows[0], iictRows[2]],
      [iictRows[2], iictRows[0], iictRows[1]],
      [...iictRows].reverse(),
    ];
    for (const order of orders) {
      expect(await fetchOne(order)).toEqual(first);
    }
  });

  it('Test 14 — a dead org with no live row makes the business dead, named', async () => {
    const result = await fetchOne(
      [
        { ...iictRows[0], business_id: 'biz-dragon', tenant_name: 'Dragon Roofing Pty Ltd' },
        { ...iictRows[2], business_id: 'biz-dragon', tenant_name: 'EASY HAIL CLAIM PTY LTD', is_active: false },
      ],
      'biz-dragon',
    );
    expect(result).toMatchObject({ status: 'dead', status_scope: 'EASY HAIL CLAIM PTY LTD' });
  });

  it('Test 14b — the disconnected org does not hide a sibling that also needs attention', async () => {
    const result = await fetchOne(
      [
        { ...iictRows[0], business_id: 'biz-x', is_active: false },
        { ...iictRows[1], business_id: 'biz-x' }, // 106h stale
        { ...iictRows[2], business_id: 'biz-x' },
      ],
      'biz-x',
    );
    expect(result).toMatchObject({ status: 'dead', status_scope: 'IICT (Aust) Pty Ltd', more_orgs_needing_attention: 1 });
  });

  it('Test 14c — an org retired on purpose (off AND excluded from consolidation) no longer holds the business red', async () => {
    const result = await fetchOne(
      [
        { ...iictRows[0], business_id: 'biz-y' },
        { ...iictRows[2], business_id: 'biz-y', is_active: false, include_in_consolidation: false },
      ],
      'biz-y',
    );
    expect(result).toMatchObject({ status: 'connected', status_scope: null, more_orgs_needing_attention: 0 });
  });

  it('Test 16 — a failed sync_jobs lookup is unknown for every org, never green', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-iict', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connections: iictRows,
      syncJobsError: { message: 'statement timeout' },
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-iict']));
    expect(res.status).toBe(200);
    expect((await res.json()).results[0]).toMatchObject({ status: 'unknown', status_scope: null });
  });

  it('Test 15 — a failed xero_connections read is a 500, not every business reading "No Xero"', async () => {
    configureAuth({ id: 'owner-1' });
    configureAdmin({
      businesses: [{ id: 'biz-1', owner_id: 'owner-1', assigned_coach_id: null }],
      profiles: [],
      connectionsError: { message: 'connection reset' },
    });
    const { GET } = await import('@/app/api/Xero/connection-health/route');
    const res = await GET(makeReq(['biz-1']));
    expect(res.status).toBe(500);
    expect((await res.json()).results).toBeUndefined();
  });
});
