/**
 * CHARACTERIZATION TESTS — app-layer access matrix for verifyBusinessAccess
 * (src/lib/utils/verify-business-access.ts).
 *
 * The helper decides whether a user BELONGS to a business: owner, assigned coach,
 * an ACTIVE business_users member (any role), or a super_admin. It does not decide
 * what they may do there — routes that are owner / coach / super_admin only keep
 * their own role check.
 *
 * It accepts an id in EITHER id-space: a businesses.id, or a business_profiles.id
 * that resolves to its parent businesses.id. Every business-scoped fact — owner,
 * coach, membership — lives on the parent business: business_users.business_id
 * references businesses(id), so no membership row can be keyed on a profile id.
 *
 * The Supabase double honours every filter value (see
 * src/__tests__/helpers/filter-aware-supabase.ts). The previous fake answered the
 * business_users read with the same row whatever business_id it was asked for,
 * so "[team member × business_profiles.id] ⇒ true" passed while production
 * refused every active team member for a profile id: the helper filtered
 * business_users on the raw input. Prod on 15 Sep 2026 had 9 active members who
 * are neither owner nor assigned coach — 3 admin, 3 member, 3 owner-role
 * co-owners — every one keyed on a businesses.id, as the FK requires.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createFilterAwareSupabase,
  type FilterAwareSupabase,
  type Row,
} from '@/__tests__/helpers/filter-aware-supabase'

let db: FilterAwareSupabase

// The helper builds its service-role client at module load; route every query
// to the current test's double.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => db.from(table) }),
}))

vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER = 'user-abc'
const OTHER_USER = 'someone-else'

// Business A, in both id-spaces.
const BUSINESS_ID = 'biz-a'
const PROFILE_ID = 'profile-a'
// Business B — another tenant.
const OTHER_BUSINESS_ID = 'biz-b'
const OTHER_PROFILE_ID = 'profile-b'

const ID_SPACES = [
  ['businesses.id', BUSINESS_ID],
  ['business_profiles.id', PROFILE_ID],
] as const

function seed(tables: { businesses?: Row[]; business_users?: Row[]; system_roles?: Row[]; business_profiles?: Row[] } = {}) {
  db = createFilterAwareSupabase({
    businesses: tables.businesses ?? [
      { id: BUSINESS_ID, owner_id: 'owner-a', assigned_coach_id: 'coach-a' },
      { id: OTHER_BUSINESS_ID, owner_id: 'owner-b', assigned_coach_id: 'coach-b' },
    ],
    business_profiles: tables.business_profiles ?? [
      { id: PROFILE_ID, business_id: BUSINESS_ID },
      { id: OTHER_PROFILE_ID, business_id: OTHER_BUSINESS_ID },
    ],
    business_users: tables.business_users ?? [],
    system_roles: tables.system_roles ?? [],
  })
}

function member(over: Row = {}): Row {
  return { id: 'membership-1', business_id: BUSINESS_ID, user_id: USER, role: 'member', status: 'active', ...over }
}

beforeEach(() => {
  captureException.mockClear()
  seed()
})

// ─── Access matrix: role × id-space ──────────────────────────────────────────

describe('verifyBusinessAccess — who belongs, in either id-space', () => {
  describe.each(ID_SPACES)('given a %s', (_space, id) => {
    it('grants the owner', async () => {
      seed({
        businesses: [{ id: BUSINESS_ID, owner_id: USER, assigned_coach_id: 'coach-a' }],
      })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(true)
    })

    it('grants the assigned coach', async () => {
      seed({
        businesses: [{ id: BUSINESS_ID, owner_id: 'owner-a', assigned_coach_id: USER }],
      })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(true)
    })

    it.each(['admin', 'member', 'owner', 'viewer'])(
      'grants an active team member with the %s role',
      async (role) => {
        seed({ business_users: [member({ role })] })
        await expect(verifyBusinessAccess(USER, id)).resolves.toBe(true)
      },
    )

    it('grants a super_admin', async () => {
      seed({ system_roles: [{ user_id: USER, role: 'super_admin' }] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(true)
    })

    // C-34: only an ACTIVE membership grants.
    it.each(['pending', 'inactive'])('refuses a %s team member', async (status) => {
      seed({ business_users: [member({ status })] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })

    it('refuses an active member of ANOTHER business', async () => {
      seed({ business_users: [member({ business_id: OTHER_BUSINESS_ID })] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })

    it("refuses a user when the business's membership belongs to someone else", async () => {
      seed({ business_users: [member({ user_id: OTHER_USER })] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })

    it('refuses a user who is owner and coach of another business only', async () => {
      seed({
        businesses: [
          { id: BUSINESS_ID, owner_id: 'owner-a', assigned_coach_id: 'coach-a' },
          { id: OTHER_BUSINESS_ID, owner_id: USER, assigned_coach_id: USER },
        ],
      })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })

    it.each(['coach', 'client'])('refuses a non-super_admin system role (%s)', async (role) => {
      seed({ system_roles: [{ user_id: USER, role }] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })

    it("refuses when the super_admin row is someone else's", async () => {
      seed({ system_roles: [{ user_id: OTHER_USER, role: 'super_admin' }] })
      await expect(verifyBusinessAccess(USER, id)).resolves.toBe(false)
    })
  })
})

// ─── The membership read names the parent business ───────────────────────────

describe('verifyBusinessAccess — membership is checked on the businesses.id', () => {
  it('a business_profiles.id is resolved to its parent before business_users is read', async () => {
    seed({ business_users: [member()] })

    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true)

    const membershipReads = db.reads.filter((r) => r.table === 'business_users')
    expect(membershipReads).toHaveLength(1)
    expect(membershipReads[0].filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'business_id', value: BUSINESS_ID },
        { op: 'eq', column: 'user_id', value: USER },
        { op: 'eq', column: 'status', value: 'active' },
      ]),
    )
    expect(membershipReads[0].filters).not.toContainEqual({ op: 'eq', column: 'business_id', value: PROFILE_ID })
  })

  it("a member of business A is refused business B's profile id (no cross-tenant bridge)", async () => {
    seed({ business_users: [member()] })
    await expect(verifyBusinessAccess(USER, OTHER_PROFILE_ID)).resolves.toBe(false)
  })

  it('a businesses.id is checked as given', async () => {
    seed({ business_users: [member()] })

    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(true)

    const membershipReads = db.reads.filter((r) => r.table === 'business_users')
    expect(membershipReads[0].filters).toContainEqual({ op: 'eq', column: 'business_id', value: BUSINESS_ID })
    // A businesses.id never needs the profile lookup.
    expect(db.reads.some((r) => r.table === 'business_profiles')).toBe(false)
  })
})

// ─── Ids that resolve to no business ─────────────────────────────────────────

describe('verifyBusinessAccess — unresolvable ids', () => {
  it('refuses an id in neither table', async () => {
    seed({ business_users: [member()] })
    await expect(verifyBusinessAccess(USER, 'orphan-id')).resolves.toBe(false)
  })

  it('refuses a profile with no parent business', async () => {
    seed({
      business_profiles: [{ id: PROFILE_ID, business_id: null }],
      business_users: [member()],
    })
    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(false)
  })

  it('still grants a super_admin for an id in neither table', async () => {
    seed({ system_roles: [{ user_id: USER, role: 'super_admin' }] })
    await expect(verifyBusinessAccess(USER, 'orphan-id')).resolves.toBe(true)
  })
})

// ─── A failed lookup refuses, and says so ────────────────────────────────────

describe('verifyBusinessAccess — lookup failures fail closed and are surfaced', () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => consoleError.mockRestore())

  function expectSurfaced(table: string) {
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: `${table} is unavailable` }),
      expect.objectContaining({ tags: expect.objectContaining({ dual_id_surface: expect.stringContaining(table) }) }),
    )
  }

  it('a failed businesses read refuses the owner (could not check) and is surfaced', async () => {
    seed({ businesses: [{ id: BUSINESS_ID, owner_id: USER, assigned_coach_id: 'coach-a' }] })
    db.failTable('businesses')
    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(false)
    expectSurfaced('businesses')
  })

  it('a failed businesses read does not refuse a member the profile still resolves', async () => {
    seed({ business_users: [member()] })
    db.failTable('businesses')
    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(true)
    expectSurfaced('businesses')
  })

  it('a failed business_profiles read refuses a member holding a profile id and is surfaced', async () => {
    seed({ business_users: [member()] })
    db.failTable('business_profiles')
    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(false)
    expectSurfaced('business_profiles')
  })

  it('a failed business_users read refuses the member and is surfaced', async () => {
    seed({ business_users: [member()] })
    db.failTable('business_users')
    await expect(verifyBusinessAccess(USER, PROFILE_ID)).resolves.toBe(false)
    expectSurfaced('business_users')
  })

  it('a failed system_roles read refuses a super_admin and is surfaced', async () => {
    seed({ system_roles: [{ user_id: USER, role: 'super_admin' }] })
    db.failTable('system_roles')
    await expect(verifyBusinessAccess(USER, BUSINESS_ID)).resolves.toBe(false)
    expectSurfaced('system_roles')
  })
})
