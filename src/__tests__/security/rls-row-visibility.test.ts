/**
 * Stream 5 — Real-RLS row-visibility characterization (Phase A test-net).
 *
 * Pins the CURRENT production behaviour of the Postgres RLS decision layer for
 * the dual-id access matrix, exercised through genuine `authenticated` JWTs (see
 * `_rls-harness.ts`). This is the only test in the suite that drives the real
 * `auth_get_accessible_business_ids()` / `auth_can_access_business()` /
 * `auth_is_super_admin()` chain — everything else mocks `verifyBusinessAccess`.
 *
 * The 4×2 matrix
 * --------------
 *   roles  : { owner, coach, team-active, super_admin }
 *   inputs : { businesses.id (B), business_profiles.id (BP) }
 *
 * Characterised invariants (current behaviour — change-detector, not a spec):
 *   - owner / coach / team-active  → can access BOTH B and BP id-spaces, because
 *     `auth_get_accessible_business_ids()` UNIONs the profile id via its
 *     businesses⋈business_profiles join arm.
 *   - super_admin → `auth_can_access_business` returns FALSE (the helper is NOT
 *     super-aware); super visibility comes solely from the policy-level
 *     `auth_is_super_admin() OR ...` short-circuit. This split is deliberately
 *     pinned so R-series refactors don't silently merge the two.
 *   - orphan user → false everywhere.
 *   - pending / inactive team member → false (the `status = 'active'` filter).
 *   - unrelated random business id → false.
 *
 * Skips entirely under CI placeholder env (skipIfNoLiveRls). Runs on a Supabase
 * preview branch with real env.
 */
import { describe, it, expect } from 'vitest'
import {
  RlsWorld,
  canAccess,
  isSuperAdmin,
  skipIfNoLiveRls,
} from './_rls-harness'

const TIMEOUT = 30_000

describe('RLS row-visibility matrix (real JWT, live DB)', () => {
  it(
    'owner sees both id-spaces (B and BP)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId, profileId } = await world.seedBusiness()
        const owner = await world.provisionUser()
        await world.makeOwner(owner.userId)

        expect(await canAccess(owner, businessId)).toBe(true)
        expect(await canAccess(owner, profileId)).toBe(true)
        expect(await isSuperAdmin(owner)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'assigned coach sees both id-spaces (B and BP)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId, profileId } = await world.seedBusiness()
        const coach = await world.provisionUser()
        await world.makeCoach(coach.userId)

        expect(await canAccess(coach, businessId)).toBe(true)
        expect(await canAccess(coach, profileId)).toBe(true)
        expect(await isSuperAdmin(coach)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'active team member sees both id-spaces (B and BP)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId, profileId } = await world.seedBusiness()
        const member = await world.provisionUser()
        await world.addTeamMember(member.userId, 'active', 'member')

        expect(await canAccess(member, businessId)).toBe(true)
        expect(await canAccess(member, profileId)).toBe(true)
        expect(await isSuperAdmin(member)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'super_admin: helper denies but is_super_admin grants (the deliberate split)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId, profileId } = await world.seedBusiness()
        const admin = await world.provisionUser()
        await world.makeSuperAdmin(admin.userId)

        // auth_can_access_business is NOT super-aware → false for both spaces.
        expect(await canAccess(admin, businessId)).toBe(false)
        expect(await canAccess(admin, profileId)).toBe(false)
        // Visibility comes from the policy-level super short-circuit instead.
        expect(await isSuperAdmin(admin)).toBe(true)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'orphan user (no relationships) is denied everywhere',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId, profileId } = await world.seedBusiness()
        const orphan = await world.provisionUser()

        expect(await canAccess(orphan, businessId)).toBe(false)
        expect(await canAccess(orphan, profileId)).toBe(false)
        expect(await isSuperAdmin(orphan)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'pending team member is denied (status="active" filter)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId } = await world.seedBusiness()
        const pending = await world.provisionUser()
        await world.addTeamMember(pending.userId, 'pending', 'member')

        expect(await canAccess(pending, businessId)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'inactive team member is denied (status="active" filter)',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        const { businessId } = await world.seedBusiness()
        const inactive = await world.provisionUser()
        await world.addTeamMember(inactive.userId, 'inactive', 'member')

        expect(await canAccess(inactive, businessId)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )

  it(
    'owner is denied access to an unrelated random business id',
    async () => {
      if (skipIfNoLiveRls()) return
      const world = new RlsWorld()
      try {
        await world.seedBusiness()
        const owner = await world.provisionUser()
        await world.makeOwner(owner.userId)

        const unrelated = '00000000-0000-4000-8000-0000000affff'
        expect(await canAccess(owner, unrelated)).toBe(false)
      } finally {
        await world.cleanup()
      }
    },
    TIMEOUT,
  )
})
