/**
 * Real-RLS row-visibility harness (Phase A test-net, Stream 5).
 *
 * Purpose
 * -------
 * Every existing access test mocks `verifyBusinessAccess` / the Supabase client,
 * so NO test exercises the *actual* Postgres Row-Level-Security path. This harness
 * closes that gap: it provisions real auth users, signs them in to obtain genuine
 * `authenticated` JWTs, and runs queries through PostgREST so the production RLS
 * functions (`auth_get_accessible_business_ids()`, `auth_can_access_business()`,
 * `auth_is_super_admin()`) evaluate against a real `auth.uid()`.
 *
 * Why real JWTs and not `SET LOCAL ROLE` / `pg`
 * ---------------------------------------------
 * The repo has no `pg` driver — all live-DB tests use `@supabase/supabase-js`.
 * Rather than add a dependency, we mint real user sessions: this is *higher*
 * fidelity than `SET ROLE` because it drives the same GoTrue → JWT → PostgREST
 * → SECURITY DEFINER chain that production uses. The user's `access_token` (a JWT
 * issued by GoTrue) goes in the `Authorization: Bearer` header; the publishable
 * (anon) key goes in `apikey`. PostgREST then runs the request as role
 * `authenticated` with `request.jwt.claims.sub = <user id>`, which is exactly
 * what `auth.uid()` reads.
 *
 * Transaction isolation
 * ---------------------
 * supabase-js cannot wrap requests in a single BEGIN/ROLLBACK (each PostgREST
 * call is its own implicit transaction). Instead the harness tracks everything it
 * creates (users + seeded rows) and tears it down in `cleanup()`. Deterministic
 * fixture IDs + idempotent upserts keep concurrent/re-runs safe.
 *
 * Skip behaviour mirrors the migration-test convention: `skipIfNoLiveDb()` short-
 * circuits every test when env points at the CI placeholder host, so CI stays
 * green and the suite only truly runs on a Supabase preview branch with real env.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

/**
 * True when no live Supabase project is reachable (CI placeholder env). The RLS
 * harness additionally needs a publishable/anon key (to mint user sessions), so
 * it gates on that too — a service key alone is not enough here.
 */
export function skipIfNoLiveRls(): boolean {
  return (
    !SUPABASE_URL ||
    SUPABASE_URL.includes('placeholder.supabase.co') ||
    !SERVICE_KEY ||
    !PUBLISHABLE_KEY
  )
}

/** Service-role client — bypasses RLS, used for all setup/teardown. */
export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Build a PostgREST client that runs every request AS the given user. The user's
 * GoTrue access token (a JWT) is pinned into the Authorization header; the
 * publishable key is the apikey. This is the production RLS path.
 */
function makeUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** A provisioned, signed-in test identity. */
export interface TestIdentity {
  userId: string
  email: string
  /** Client whose every request executes as this user under RLS. */
  client: SupabaseClient
}

/**
 * Deterministic-but-unique fixture IDs for the harness. The business + profile
 * are shared across a suite; users are unique per provision so concurrent runs
 * never collide on auth email uniqueness.
 */
export const RLS_TEST_BUSINESS_ID = '00000000-0000-4000-8000-0000000a0001'
export const RLS_TEST_BUSINESS_PROFILE_ID = '00000000-0000-4000-8000-0000000a0002'
const RLS_TEST_TAG = '__rls-harness-fixture__'

/**
 * Tracks every object the harness creates so a single `cleanup()` reverses the
 * whole world. Pass the SAME instance to every helper in a suite.
 */
export class RlsWorld {
  readonly admin: SupabaseClient
  private readonly userIds: string[] = []
  /** rows seeded into arbitrary tables: [table, idColumn, idValue] */
  private readonly seededRows: Array<[string, string, string]> = []

  constructor(admin: SupabaseClient = getAdminClient()) {
    this.admin = admin
  }

  /**
   * Seed the shared business + linked business_profile. `business_profiles.business_id`
   * points back at the business so the helper's join-branch (5th UNION arm) can
   * resolve the profile id-space from a business-level role.
   */
  async seedBusiness(): Promise<{ businessId: string; profileId: string }> {
    const { error: bErr } = await this.admin
      .from('businesses')
      .upsert({ id: RLS_TEST_BUSINESS_ID, name: RLS_TEST_TAG }, { onConflict: 'id' })
    if (bErr) throw new Error(`seedBusiness(businesses): ${bErr.message}`)

    const { error: bpErr } = await this.admin
      .from('business_profiles')
      .upsert(
        {
          id: RLS_TEST_BUSINESS_PROFILE_ID,
          business_id: RLS_TEST_BUSINESS_ID,
          company_name: RLS_TEST_TAG,
        },
        { onConflict: 'id' },
      )
    if (bpErr) throw new Error(`seedBusiness(business_profiles): ${bpErr.message}`)

    return { businessId: RLS_TEST_BUSINESS_ID, profileId: RLS_TEST_BUSINESS_PROFILE_ID }
  }

  /** Create a confirmed auth user and return a client that runs AS that user. */
  async provisionUser(): Promise<TestIdentity> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const email = `rls-harness-${suffix}@example.com`
    const password = `Rls-${suffix}-Pwd!`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data?.user?.id) {
      throw new Error(`provisionUser(create): ${error?.message ?? 'no user'}`)
    }
    const userId = data.user.id
    this.userIds.push(userId)

    // Sign in via the publishable key to mint a real authenticated JWT.
    const signInClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: session, error: signInErr } =
      await signInClient.auth.signInWithPassword({ email, password })
    const accessToken = session?.session?.access_token
    if (signInErr || !accessToken) {
      throw new Error(`provisionUser(signIn): ${signInErr?.message ?? 'no token'}`)
    }

    return { userId, email, client: makeUserClient(accessToken) }
  }

  // --- role wiring (all via service role, RLS bypassed) -------------------

  /** Make `userId` the OWNER of the shared business (businesses.owner_id). */
  async makeOwner(userId: string): Promise<void> {
    const { error } = await this.admin
      .from('businesses')
      .update({ owner_id: userId })
      .eq('id', RLS_TEST_BUSINESS_ID)
    if (error) throw new Error(`makeOwner: ${error.message}`)
  }

  /** Make `userId` the assigned COACH (businesses.assigned_coach_id). */
  async makeCoach(userId: string): Promise<void> {
    const { error } = await this.admin
      .from('businesses')
      .update({ assigned_coach_id: userId })
      .eq('id', RLS_TEST_BUSINESS_ID)
    if (error) throw new Error(`makeCoach: ${error.message}`)
  }

  /**
   * Add `userId` as a TEAM MEMBER. Defaults to the access-granting state
   * (status='active'); pass status='pending'/'inactive' to characterise the
   * negative paths the helper's `status = 'active'` filter is meant to exclude.
   */
  async addTeamMember(
    userId: string,
    status: 'active' | 'pending' | 'inactive' = 'active',
    role: 'admin' | 'member' = 'member',
  ): Promise<void> {
    const { data, error } = await this.admin
      .from('business_users')
      .insert({ business_id: RLS_TEST_BUSINESS_ID, user_id: userId, status, role })
      .select('id')
      .single()
    if (error) throw new Error(`addTeamMember: ${error.message}`)
    if (data?.id) this.seededRows.push(['business_users', 'id', String(data.id)])
  }

  /** Grant `userId` the platform-wide super_admin system role. */
  async makeSuperAdmin(userId: string): Promise<void> {
    const { data, error } = await this.admin
      .from('system_roles')
      .insert({ user_id: userId, role: 'super_admin' })
      .select('id')
      .single()
    if (error) throw new Error(`makeSuperAdmin: ${error.message}`)
    if (data?.id) this.seededRows.push(['system_roles', 'id', String(data.id)])
  }

  /** Remember an externally-seeded row so cleanup() removes it. */
  trackRow(table: string, idColumn: string, idValue: string): void {
    this.seededRows.push([table, idColumn, idValue])
  }

  /** Reverse everything this world created (rows first, then users). */
  async cleanup(): Promise<void> {
    for (const [table, idColumn, idValue] of this.seededRows.reverse()) {
      await this.admin.from(table).delete().eq(idColumn, idValue)
    }
    // Reset role columns on the shared business so re-runs start clean.
    await this.admin
      .from('businesses')
      .update({ owner_id: null, assigned_coach_id: null })
      .eq('id', RLS_TEST_BUSINESS_ID)
    for (const userId of this.userIds) {
      await this.admin.auth.admin.deleteUser(userId).catch(() => {})
    }
  }
}

/**
 * Ask the DB, AS the given user, whether it can access `businessId`. Calls the
 * production SECURITY DEFINER decision function via PostgREST RPC. Returns the
 * boolean the policy layer would see from `auth_can_access_business(...)`.
 */
export async function canAccess(
  identity: TestIdentity,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await identity.client.rpc('auth_can_access_business', {
    check_business_id: businessId,
  })
  if (error) throw new Error(`canAccess RPC (${businessId}): ${error.message}`)
  return data === true
}

/**
 * Ask the DB, AS the given user, whether it is a super_admin. Mirrors the
 * `auth_is_super_admin()` short-circuit that every `rls_access` policy ORs in
 * ahead of the per-business check.
 */
export async function isSuperAdmin(identity: TestIdentity): Promise<boolean> {
  const { data, error } = await identity.client.rpc('auth_is_super_admin')
  if (error) throw new Error(`isSuperAdmin RPC: ${error.message}`)
  return data === true
}
