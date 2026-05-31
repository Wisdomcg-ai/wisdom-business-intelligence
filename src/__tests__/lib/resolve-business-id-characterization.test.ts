/**
 * Characterization lock for the role-AWARE canonical business-ID resolver layer
 * ahead of the planned refactor. These tests pin TODAY's exact behavior so the
 * refactor cannot silently regress it — they are change-detectors, not a spec.
 *
 * Two modules are covered:
 *   1. `src/lib/business/resolveBusinessId.ts`     — role-aware canonical resolver
 *   2. `src/lib/business/resolveXeroBusinessId.ts` — Xero connection id resolver
 *
 * Both take the Supabase client as an injectable parameter, so (mirroring the
 * sibling `resolve-business-profile-ids.test.ts`) we model only the tables each
 * resolver touches with a small `makeClient(...)` fake. No live DB, no
 * network — pure/mocked.
 */

import { describe, it, expect, vi } from 'vitest'
import { resolveBusinessId } from '@/lib/business/resolveBusinessId'
import { resolveXeroBusinessId } from '@/lib/business/resolveXeroBusinessId'

// ───────────────────────────────────────────────────────────────────────────
// Fake Supabase for resolveBusinessId.
//   Models `business_users` (.eq user_id, .eq status, .maybeSingle) and
//   `businesses` (.eq owner_id, .maybeSingle) — all this resolver touches.
// ───────────────────────────────────────────────────────────────────────────

type BusinessUserRow = { user_id: string; business_id: string; status: string }
type BusinessRow = { id: string; owner_id: string }

function makeRoleClient(opts: {
  businessUsers?: BusinessUserRow[]
  businesses?: BusinessRow[]
}) {
  const businessUsers = opts.businessUsers ?? []
  const businesses = opts.businesses ?? []

  const client = {
    from: (table: string) => {
      const filters: Record<string, string> = {}
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: string) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => {
          if (table === 'business_users') {
            const match = businessUsers.find(
              (r) => r.user_id === filters['user_id'] && r.status === filters['status']
            )
            return { data: match ? { business_id: match.business_id } : null, error: null }
          }
          if (table === 'businesses') {
            const match = businesses.find((r) => r.owner_id === filters['owner_id'])
            return { data: match ? { id: match.id } : null, error: null }
          }
          throw new Error(`unexpected table queried: ${table}`)
        },
      }
      return chain
    },
  }
  return client
}

describe('resolveBusinessId — role-aware canonical resolver (characterization)', () => {
  // ── activeBusinessId short-circuit (reason: 'active') ──────────────────────
  it('activeBusinessId set → returns it branded with reason "active", no lookup, for any role', async () => {
    const client = makeRoleClient({})
    for (const role of ['client', 'coach', 'admin'] as const) {
      const res = await resolveBusinessId(client as any, {
        userId: 'user-1',
        role,
        activeBusinessId: 'biz-active-1',
      })
      expect(res.businessId).toBe('biz-active-1')
      expect(res.reason).toBe('active')
    }
  })

  // ── assertNotUserId guard fires on the active path ─────────────────────────
  it('activeBusinessId === userId → throws the INVARIANT VIOLATED guard', async () => {
    const client = makeRoleClient({})
    await expect(
      resolveBusinessId(client as any, {
        userId: 'same-uuid',
        role: 'client',
        activeBusinessId: 'same-uuid',
      })
    ).rejects.toThrow(/INVARIANT VIOLATED: resolved businessId == userId/)
  })

  // ── unauthenticated (reason: 'unauthenticated') ───────────────────────────
  it('no userId and no activeBusinessId → { null, "unauthenticated" }', async () => {
    const client = makeRoleClient({})
    const res = await resolveBusinessId(client as any, {
      userId: null,
      role: 'client',
      activeBusinessId: null,
    })
    expect(res).toEqual({ businessId: null, reason: 'unauthenticated' })
  })

  // ── coach / admin / unknown role → never guesses (reason: 'coach-no-client')
  it('coach with no activeBusiness → { null, "coach-no-client" } (no lookup)', async () => {
    const client = makeRoleClient({
      // Even if the coach owns a business, it must NOT be used.
      businesses: [{ id: 'biz-coach-owned', owner_id: 'coach-1' }],
    })
    const res = await resolveBusinessId(client as any, {
      userId: 'coach-1',
      role: 'coach',
      activeBusinessId: null,
    })
    expect(res).toEqual({ businessId: null, reason: 'coach-no-client' })
  })

  it('admin with no activeBusiness → { null, "coach-no-client" }', async () => {
    const client = makeRoleClient({})
    const res = await resolveBusinessId(client as any, {
      userId: 'admin-1',
      role: 'admin',
      activeBusinessId: null,
    })
    expect(res).toEqual({ businessId: null, reason: 'coach-no-client' })
  })

  it('unknown/null role with userId → falls into the non-client branch: { null, "coach-no-client" }', async () => {
    // CHARACTERIZATION: pins current behavior — any role other than the literal
    // 'client' (including null/undefined) is treated as coach/admin and returns
    // coach-no-client rather than running the owner lookup.
    const client = makeRoleClient({})
    const res = await resolveBusinessId(client as any, {
      userId: 'user-1',
      role: null,
      activeBusinessId: null,
    })
    expect(res).toEqual({ businessId: null, reason: 'coach-no-client' })
  })

  // ── client team path (reason: 'client-team') ──────────────────────────────
  it('client with active business_users row → { business_id branded, "client-team" }', async () => {
    const client = makeRoleClient({
      businessUsers: [{ user_id: 'client-1', business_id: 'biz-team-1', status: 'active' }],
    })
    const res = await resolveBusinessId(client as any, {
      userId: 'client-1',
      role: 'client',
      activeBusinessId: null,
    })
    expect(res.businessId).toBe('biz-team-1')
    expect(res.reason).toBe('client-team')
  })

  it('client whose business_users row is NOT active → team lookup misses, falls through', async () => {
    // CHARACTERIZATION: the status filter is part of the query; an inactive
    // membership is invisible to the resolver and it proceeds to the owner path.
    const client = makeRoleClient({
      businessUsers: [{ user_id: 'client-1', business_id: 'biz-team-1', status: 'inactive' }],
      businesses: [{ id: 'biz-owned-1', owner_id: 'client-1' }],
    })
    const res = await resolveBusinessId(client as any, {
      userId: 'client-1',
      role: 'client',
      activeBusinessId: null,
    })
    expect(res.businessId).toBe('biz-owned-1')
    expect(res.reason).toBe('client-owner')
  })

  // ── client owner path (reason: 'client-owner') ────────────────────────────
  it('client with no team row but an owned business → { id branded, "client-owner" }', async () => {
    const client = makeRoleClient({
      businesses: [{ id: 'biz-owned-2', owner_id: 'client-2' }],
    })
    const res = await resolveBusinessId(client as any, {
      userId: 'client-2',
      role: 'client',
      activeBusinessId: null,
    })
    expect(res.businessId).toBe('biz-owned-2')
    expect(res.reason).toBe('client-owner')
  })

  // ── client with nothing (reason: 'no-business') ───────────────────────────
  it('client with neither team membership nor owned business → { null, "no-business" }', async () => {
    const client = makeRoleClient({})
    const res = await resolveBusinessId(client as any, {
      userId: 'client-3',
      role: 'client',
      activeBusinessId: null,
    })
    expect(res).toEqual({ businessId: null, reason: 'no-business' })
  })

  // ── assertNotUserId guard fires on the client-team path ────────────────────
  it('client-team business_id === userId → throws the INVARIANT VIOLATED guard', async () => {
    const client = makeRoleClient({
      businessUsers: [{ user_id: 'loop-uuid', business_id: 'loop-uuid', status: 'active' }],
    })
    await expect(
      resolveBusinessId(client as any, {
        userId: 'loop-uuid',
        role: 'client',
        activeBusinessId: null,
      })
    ).rejects.toThrow(/INVARIANT VIOLATED/)
  })

  // ── assertNotUserId guard fires on the client-owner path ───────────────────
  it('client-owner business id === userId → throws the INVARIANT VIOLATED guard', async () => {
    const client = makeRoleClient({
      businesses: [{ id: 'loop-uuid-2', owner_id: 'loop-uuid-2' }],
    })
    await expect(
      resolveBusinessId(client as any, {
        userId: 'loop-uuid-2',
        role: 'client',
        activeBusinessId: null,
      })
    ).rejects.toThrow(/INVARIANT VIOLATED/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Fake Supabase for resolveXeroBusinessId.
//   Models `xero_connections` (.eq business_id, .eq is_active, .order, .limit)
//   and `business_profiles` (.eq business_id|id, .maybeSingle). The resolver
//   awaits the builder directly for xero_connections (no maybeSingle), so the
//   chain itself is thenable.
// ───────────────────────────────────────────────────────────────────────────

type XeroConnRow = { id: string; business_id: string; is_active: boolean; created_at: string }
type ProfileRow = { id: string; business_id: string }

function makeXeroClient(opts: {
  xeroConnections?: XeroConnRow[]
  profiles?: ProfileRow[]
}) {
  const xeroConnections = opts.xeroConnections ?? []
  const profiles = opts.profiles ?? []

  const client = {
    from: (table: string) => {
      const filters: Record<string, any> = {}
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: any) => {
          filters[column] = value
          return chain
        },
        order: () => chain,
        limit: () => chain,
        // xero_connections is awaited directly → the builder is thenable.
        then: (resolve: (v: any) => any) => {
          const matches = xeroConnections
            .filter((r) => r.business_id === filters['business_id'] && r.is_active === filters['is_active'])
            // resolver expects newest-first ordering (created_at DESC)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          return resolve({ data: matches, error: null })
        },
        maybeSingle: async () => {
          // business_profiles lookups
          let match: ProfileRow | undefined
          if ('business_id' in filters) {
            match = profiles.find((r) => r.business_id === filters['business_id'])
          } else if ('id' in filters) {
            match = profiles.find((r) => r.id === filters['id'])
          }
          if (!match) return { data: null, error: null }
          // Try 2 selects only `id`; Try 3 selects `id, business_id`. Returning
          // the full row is harmless for the resolver's field access.
          return { data: { id: match.id, business_id: match.business_id }, error: null }
        },
      }
      return chain
    },
  }
  return client
}

describe('resolveXeroBusinessId — Xero connection resolver (characterization)', () => {
  // ── Try 1: direct match on the passed business_id ─────────────────────────
  it('direct active connection on the input id → returns input id + that connection', async () => {
    const client = makeXeroClient({
      xeroConnections: [
        { id: 'conn-1', business_id: 'biz-direct', is_active: true, created_at: '2026-01-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'biz-direct')
    expect(res.connectionBusinessId).toBe('biz-direct')
    expect(res.connection?.id).toBe('conn-1')
  })

  it('Try 1 picks the most-recent connection when several active rows exist', async () => {
    const client = makeXeroClient({
      xeroConnections: [
        { id: 'conn-old', business_id: 'biz-multi', is_active: true, created_at: '2025-01-01' },
        { id: 'conn-new', business_id: 'biz-multi', is_active: true, created_at: '2026-05-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'biz-multi')
    expect(res.connectionBusinessId).toBe('biz-multi')
    expect(res.connection?.id).toBe('conn-new')
  })

  it('inactive-only connections do NOT satisfy Try 1 (is_active filter)', async () => {
    // CHARACTERIZATION: an is_active=false row is invisible; with no profile
    // mapping the resolver falls all the way through to the not-found outcome.
    const client = makeXeroClient({
      xeroConnections: [
        { id: 'conn-dead', business_id: 'biz-inactive', is_active: false, created_at: '2026-01-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'biz-inactive')
    expect(res.connectionBusinessId).toBe('biz-inactive')
    expect(res.connection).toBeNull()
  })

  // ── Try 2: input is businesses.id → map to business_profiles.id ────────────
  it('Try 2: input maps via business_profiles.business_id → connection under profile.id', async () => {
    const client = makeXeroClient({
      profiles: [{ id: 'prof-2', business_id: 'biz-2' }],
      xeroConnections: [
        { id: 'conn-2', business_id: 'prof-2', is_active: true, created_at: '2026-02-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'biz-2')
    expect(res.connectionBusinessId).toBe('prof-2')
    expect(res.connection?.id).toBe('conn-2')
  })

  it('Try 2: profile exists but has NO connection → returns profile.id + null connection (FK compat)', async () => {
    // CHARACTERIZATION: returns the business_profiles.id for new-connection FK
    // compatibility even though no connection exists yet.
    const client = makeXeroClient({
      profiles: [{ id: 'prof-3', business_id: 'biz-3' }],
    })
    const res = await resolveXeroBusinessId(client as any, 'biz-3')
    expect(res.connectionBusinessId).toBe('prof-3')
    expect(res.connection).toBeNull()
  })

  // ── Try 3: input IS business_profiles.id → look under its parent businesses.id
  it('Try 3: input is a profile id → connection found under its parent business_id', async () => {
    // No profile row whose business_id === input (Try 2 misses), but a profile
    // whose id === input exists (Try 3 hits).
    const client = makeXeroClient({
      profiles: [{ id: 'prof-4', business_id: 'biz-4' }],
      xeroConnections: [
        { id: 'conn-4', business_id: 'biz-4', is_active: true, created_at: '2026-03-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'prof-4')
    expect(res.connectionBusinessId).toBe('biz-4')
    expect(res.connection?.id).toBe('conn-4')
  })

  it('Try 3: profile id input but no connection under parent → returns the profile.id + null', async () => {
    // CHARACTERIZATION: when the Try 3 profile row exists but has no connection,
    // it returns bizProfile.id (the input), NOT bizProfile.business_id.
    const client = makeXeroClient({
      profiles: [{ id: 'prof-5', business_id: 'biz-5' }],
    })
    const res = await resolveXeroBusinessId(client as any, 'prof-5')
    expect(res.connectionBusinessId).toBe('prof-5')
    expect(res.connection).toBeNull()
  })

  // ── Orphan / not-found: nothing resolves anywhere ─────────────────────────
  it('orphan id resolving to nothing → echoes the input id + null connection', async () => {
    const client = makeXeroClient({})
    const res = await resolveXeroBusinessId(client as any, 'orphan-xero')
    expect(res.connectionBusinessId).toBe('orphan-xero')
    expect(res.connection).toBeNull()
  })

  // ── user-id negative: a user UUID is just an unresolvable id here ──────────
  it('a user-id-shaped input that matches no table → not-found outcome (echoes input)', async () => {
    // CHARACTERIZATION: unlike resolveBusinessId, this resolver has no user-id
    // guard; an auth UUID simply fails every lookup and is echoed back.
    const client = makeXeroClient({
      profiles: [{ id: 'prof-x', business_id: 'biz-x' }],
      xeroConnections: [
        { id: 'conn-x', business_id: 'biz-x', is_active: true, created_at: '2026-04-01' },
      ],
    })
    const res = await resolveXeroBusinessId(client as any, 'auth-user-uuid')
    expect(res.connectionBusinessId).toBe('auth-user-uuid')
    expect(res.connection).toBeNull()
  })
})
