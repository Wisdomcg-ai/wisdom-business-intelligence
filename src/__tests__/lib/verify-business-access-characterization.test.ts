/**
 * CHARACTERIZATION TESTS — Stream 2: app-layer access matrix for
 * verifyBusinessAccess (src/lib/utils/verify-business-access.ts).
 *
 * These are golden-master / change-detector tests that PIN CURRENT BEHAVIOR
 * ahead of a risky refactor of the app-layer access-check function. They are
 * NOT a spec — where the current code has a latent bug, the test locks the
 * buggy behavior on purpose (and flags it in a comment), so the refactor can be
 * proven behavior-preserving and the bug fixed deliberately.
 *
 * Source under test drives these `.from(...)` calls, in order:
 *   1. businesses        .select('owner_id, assigned_coach_id').eq('id', businessId).maybeSingle()
 *        → owner_id === userId || assigned_coach_id === userId  ⇒ true
 *   2. (only if business row was NOT found / null)
 *      business_profiles  .select('id, business_id').eq('id', businessId).maybeSingle()
 *      then businesses    .select(...).eq('id', profile.business_id).maybeSingle()
 *        → owner_id === userId || assigned_coach_id === userId  ⇒ true   (dual-ID)
 *   3. business_users    .select('id').eq('business_id', businessId).eq('user_id', userId).maybeSingle()
 *        → any row ⇒ true   (NO status filter — see CHARACTERIZATION note below)
 *   4. system_roles      .select('role').eq('user_id', userId).maybeSingle()
 *        → role === 'super_admin' ⇒ true, else false
 *
 * The module-level `supabaseAdmin` client is created via
 * `createClient(...)` from `@supabase/supabase-js` and is NOT injectable, so we
 * vi.mock('@supabase/supabase-js') and drive each query's result. The fake-
 * builder pattern (per-table chained `.select().eq().maybeSingle()`) is copied
 * from src/__tests__/xero/employees-route.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Configurable Supabase fake ──────────────────────────────────────────────
//
// Tests set `tableResponses` to control what each table returns. For the
// `businesses` table the response is a function of the `id` filter value (so we
// can return different rows for a direct businesses.id lookup vs. the dual-ID
// businesses lookup keyed by profile.business_id). All other tables return a
// fixed `{ data }`.
//
// Shape of `tableResponses`:
//   businesses:        (idArg: string) => any        // row or null
//   business_profiles: any                           // row or null
//   business_users:    any                           // row or null
//   system_roles:      any                           // row or null

type BusinessesResolver = (idArg: string) => any;

interface TableResponses {
  businesses?: BusinessesResolver;
  business_profiles?: any;
  business_users?: any;
  system_roles?: any;
}

let tableResponses: TableResponses = {};

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string): any => {
    const ctx: any = { _table: table, _eq: {} as Record<string, unknown> };
    ctx.select = () => ctx;
    ctx.eq = (col: string, val: unknown) => {
      ctx._eq[col] = val;
      return ctx;
    };
    ctx.maybeSingle = async () => {
      if (table === 'businesses') {
        const resolver = tableResponses.businesses;
        const idArg = ctx._eq['id'] as string;
        return { data: resolver ? resolver(idArg) : null, error: null };
      }
      if (table === 'business_profiles') {
        return { data: tableResponses.business_profiles ?? null, error: null };
      }
      if (table === 'business_users') {
        return { data: tableResponses.business_users ?? null, error: null };
      }
      if (table === 'system_roles') {
        return { data: tableResponses.system_roles ?? null, error: null };
      }
      return { data: null, error: null };
    };
    return ctx;
  };
  return {
    createClient: () => ({ from: builder }),
  };
});

// keys helper is imported by the source for the (mocked-away) client key.
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}));

// Import AFTER mocks are registered.
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER = 'user-abc';
const OTHER_USER = 'someone-else';

// id-space input A: a businesses.id value (direct match on businesses table)
const BUSINESS_ID = 'biz-direct-1';
// id-space input B: a business_profiles.id value that resolves (dual-ID) to a
// different businesses.id via business_profiles.business_id.
const PROFILE_ID = 'profile-1';
const RESOLVED_BUSINESS_ID = 'biz-resolved-1';

beforeEach(() => {
  // Default: nothing matches anywhere → denied. Each test opts in.
  tableResponses = {
    businesses: () => null,
    business_profiles: null,
    business_users: null,
    system_roles: null,
  };
});

// ─── 4×2 MATRIX ──────────────────────────────────────────────────────────────
// Rows: 4 access roles. Cols: 2 id-space inputs (businesses.id, business_profiles.id).

describe('verifyBusinessAccess — 4×2 access matrix (characterization)', () => {
  // ── ROLE 1: client/owner via businesses.owner_id ──────────────────────────

  it('[owner × businesses.id] owner direct match on businesses.id ⇒ true', async () => {
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: USER, assigned_coach_id: 'coach-x' }
        : null;

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });

  it('[owner × business_profiles.id] owner via dual-ID resolution ⇒ true', async () => {
    // businesses.id lookup on the PROFILE_ID misses (null) → triggers the
    // business_profiles branch → resolves to RESOLVED_BUSINESS_ID where the
    // user is the owner.
    tableResponses.business_profiles = {
      id: PROFILE_ID,
      business_id: RESOLVED_BUSINESS_ID,
    };
    tableResponses.businesses = (id) =>
      id === RESOLVED_BUSINESS_ID
        ? { owner_id: USER, assigned_coach_id: 'coach-x' }
        : null; // direct lookup on PROFILE_ID returns null

    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true);
  });

  // ── ROLE 2: coach via businesses.assigned_coach_id ────────────────────────

  it('[coach × businesses.id] coach direct match on businesses.id ⇒ true', async () => {
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: USER }
        : null;

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });

  it('[coach × business_profiles.id] coach via dual-ID resolution ⇒ true', async () => {
    tableResponses.business_profiles = {
      id: PROFILE_ID,
      business_id: RESOLVED_BUSINESS_ID,
    };
    tableResponses.businesses = (id) =>
      id === RESOLVED_BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: USER }
        : null;

    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true);
  });

  // ── ROLE 3: team member via business_users membership ─────────────────────

  it('[team member × businesses.id] business_users membership ⇒ true', async () => {
    // No owner/coach match; businesses row exists but user is neither owner nor
    // coach. Membership row present.
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: 'coach-x' }
        : null;
    tableResponses.business_users = { id: 'membership-1' };

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });

  it('[team member × business_profiles.id] membership checked against the input id ⇒ true', async () => {
    // CURRENT behavior: the business_users membership check runs against the
    // ORIGINAL `businessId` argument (the profile id), NOT the dual-ID-resolved
    // businesses.id. We pin that: a membership keyed to the input id grants.
    // Here the businesses-direct lookup misses, the business_profiles branch
    // resolves but the resolved business has no owner/coach match, then the
    // membership row grants access.
    tableResponses.business_profiles = {
      id: PROFILE_ID,
      business_id: RESOLVED_BUSINESS_ID,
    };
    tableResponses.businesses = (id) =>
      id === RESOLVED_BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: 'coach-x' }
        : null;
    tableResponses.business_users = { id: 'membership-2' };

    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true);
  });

  // ── ROLE 4: super_admin via system_roles ──────────────────────────────────

  it('[super_admin × businesses.id] system_roles super_admin grant ⇒ true', async () => {
    // No business match, no membership; only the system_roles super_admin row.
    tableResponses.businesses = () => null;
    tableResponses.system_roles = { role: 'super_admin' };

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });

  it('[super_admin × business_profiles.id] super_admin grant regardless of id space ⇒ true', async () => {
    // system_roles is keyed only by user_id (no business scoping), so the input
    // id space is irrelevant. Pin that a super_admin is granted even for a bare
    // profile id with no resolvable business.
    tableResponses.business_profiles = null; // profile lookup misses too
    tableResponses.businesses = () => null;
    tableResponses.system_roles = { role: 'super_admin' };

    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true);
  });
});

// ─── NEGATIVES & latent-bug pinning ──────────────────────────────────────────

describe('verifyBusinessAccess — negatives & latent-bug characterization', () => {
  it('[orphan businesses.id] nothing matches anywhere ⇒ false', async () => {
    // beforeEach already sets everything to null/no-match.
    await expect(verifyBusinessAccess(USER, 'orphan-id')).resolves.toBe(false);
  });

  it('[orphan business_profiles.id] profile lookup also misses ⇒ false', async () => {
    tableResponses.business_profiles = null;
    await expect(verifyBusinessAccess(USER, 'orphan-profile-id')).resolves.toBe(false);
  });

  it('non-matching user with valid business (owner/coach are other users, no membership, not super_admin) ⇒ false', async () => {
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: OTHER_USER, assigned_coach_id: 'coach-x' }
        : null;
    tableResponses.business_users = null;
    tableResponses.system_roles = { role: 'member' }; // not super_admin

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(false);
  });

  it('non-super_admin system role ⇒ false (only the literal "super_admin" grants)', async () => {
    tableResponses.businesses = () => null;
    tableResponses.system_roles = { role: 'admin' }; // close but not super_admin

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(false);
  });

  // CHARACTERIZATION: pins current no-status-filter behavior — flagged for R16/C-34
  //
  // Confirmed against the source (lines 48-57): the business_users query is
  //   .from('business_users').select('id').eq('business_id', businessId).eq('user_id', userId).maybeSingle()
  // It selects ONLY `id` and filters ONLY on business_id + user_id. There is NO
  // `.eq('status', ...)` / `.in('status', ...)` / `.is('deactivated_at', null)`
  // predicate. Therefore ANY membership row — including a deactivated or pending
  // member — grants access. This is a latent bug. We lock the buggy behavior so
  // the upcoming refactor is provably behavior-preserving; the fix (adding a
  // status filter) should be made deliberately and will flip these assertions.
  it('LATENT BUG: deactivated team member still GRANTS (no status filter) ⇒ true', async () => {
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: 'coach-x' }
        : null;
    // A membership row exists but is deactivated. The source's query returns it
    // regardless of status because it never filters on status. Whatever extra
    // fields the row carries, the source only reads truthiness of the row.
    tableResponses.business_users = {
      id: 'membership-deactivated',
      status: 'deactivated',
      deactivated_at: '2025-01-01T00:00:00Z',
    };

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });

  it('LATENT BUG: pending team member still GRANTS (no status filter) ⇒ true', async () => {
    tableResponses.businesses = (id) =>
      id === BUSINESS_ID
        ? { owner_id: 'owner-y', assigned_coach_id: 'coach-x' }
        : null;
    tableResponses.business_users = {
      id: 'membership-pending',
      status: 'pending',
    };

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true);
  });
});
