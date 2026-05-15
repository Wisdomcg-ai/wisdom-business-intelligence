/**
 * Unit tests for requireSectionPermission helper.
 *
 * Covers every allow/deny path documented in 65-01-PLAN.md:
 *   allow: owner | admin | coach | super_admin | permission_granted
 *   deny:  permission_denied | not_a_member
 *
 * Also pins the canonical section-key spelling ('finances', not 'financials')
 * per the decision locked in 65-01-SECTION-KEY-VERIFICATION.md.
 *
 * Uses a lightweight chainable Supabase mock — no real DB calls.
 */

import { describe, it, expect, vi } from 'vitest'
import { requireSectionPermission } from '../requireSectionPermission'

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-aaa-111'
const BUSINESS_ID = 'biz-bbb-222'
const SECTION_KEY = 'finances'

// ─── Minimal chainable Supabase mock factory ──────────────────────────────────
//
// The helper calls these query chains:
//   supabase.from('businesses').select('owner_id').eq('id', ...).maybeSingle()
//   supabase.from('business_users').select('role, status').eq('business_id',...).eq('user_id',...).maybeSingle()
//   supabase.from('businesses').select('assigned_coach_id').eq('id',...).maybeSingle()
//   supabase.from('system_roles').select('role').eq('user_id',...).eq('role','super_admin').maybeSingle()
//   supabase.from('business_users').select('role, status, section_permissions').eq('business_id',...).eq('user_id',...).maybeSingle()
//
// Each call to from(table) returns a chain that resolves to `responses[table]`.
// If multiple calls to the same table are needed (e.g., two different selects),
// supply `responses` as an array and the factory pops them in order.

type QueryResponse = { data: unknown; error: unknown }

function buildChain(response: () => QueryResponse): object {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.neq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => Promise.resolve(response()))
  chain.single = vi.fn(() => Promise.resolve(response()))
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(response()).then(resolve, reject)
  return chain
}

/**
 * Build a mock supabase client that maps table names → responses.
 *
 * `tableResponses` maps table name to an array of responses.
 * Each call to `from(table)` pops the first response from the array.
 * If only one response is supplied it is reused indefinitely.
 */
function buildMockSupabase(
  tableResponses: Record<string, QueryResponse | QueryResponse[]>
): any {
  const queues: Record<string, QueryResponse[]> = {}
  for (const [table, val] of Object.entries(tableResponses)) {
    queues[table] = Array.isArray(val) ? [...val] : [val]
  }

  return {
    from: vi.fn((table: string) => {
      const queue = queues[table]
      if (!queue || queue.length === 0) {
        // Default: no row found, no error
        return buildChain(() => ({ data: null, error: null }))
      }
      // Pop from front; if only one left keep it for subsequent calls
      const next = queue.length === 1 ? queue[0] : queue.shift()!
      return buildChain(() => next)
    }),
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('requireSectionPermission', () => {
  // ── Test 1: allow — owner ──────────────────────────────────────────────────
  it('returns allow:true reason:owner when user is the business owner', async () => {
    const supabase = buildMockSupabase({
      // First businesses query: owner check
      businesses: { data: { owner_id: USER_ID }, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('owner')
    }
  })

  // ── Test 2: allow — admin ──────────────────────────────────────────────────
  it('returns allow:true reason:admin when user has business_users row with role=admin status=active', async () => {
    const supabase = buildMockSupabase({
      // Owner check: different owner
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        // Coach check: no coach match
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      // business_users: admin, active
      business_users: { data: { role: 'admin', status: 'active', section_permissions: null }, error: null },
      // system_roles: no super_admin
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('admin')
    }
  })

  // ── Test 3: allow — coach ──────────────────────────────────────────────────
  it('returns allow:true reason:coach when user is the assigned_coach_id', async () => {
    const supabase = buildMockSupabase({
      // Owner check: different owner
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        // Coach check: this user IS the coach
        { data: { assigned_coach_id: USER_ID }, error: null },
      ],
      // business_users — not reached
      business_users: { data: null, error: null },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('coach')
    }
  })

  // ── Test 4: allow — super_admin ────────────────────────────────────────────
  it('returns allow:true reason:super_admin when user has system_roles super_admin row', async () => {
    const supabase = buildMockSupabase({
      // Owner check: not owner
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        // Coach check: not coach
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      // business_users: member, active, but super_admin takes priority
      business_users: { data: { role: 'member', status: 'active', section_permissions: null }, error: null },
      // system_roles: IS super_admin
      system_roles: { data: { role: 'super_admin' }, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('super_admin')
    }
  })

  // ── Test 5: allow — permission_granted (explicit true) ─────────────────────
  it('returns allow:true reason:permission_granted when member has finances=true', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: { role: 'member', status: 'active', section_permissions: { finances: true } },
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('permission_granted')
    }
  })

  // ── Test 6: allow — missing-key default ───────────────────────────────────
  it('returns allow:true reason:permission_granted when finances key is absent in JSONB (least-surprise default)', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: { role: 'member', status: 'active', section_permissions: { business_plan: true } }, // no 'finances' key
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(true)
    if (verdict.allow) {
      expect(verdict.reason).toBe('permission_granted')
    }
  })

  // ── Test 7: deny — permission_denied (explicit false) ─────────────────────
  it('returns allow:false reason:permission_denied when member has finances=false', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: { role: 'member', status: 'active', section_permissions: { finances: false } },
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(false)
    if (!verdict.allow) {
      expect(verdict.reason).toBe('permission_denied')
      expect(verdict.sectionKey).toBe(SECTION_KEY)
    }
  })

  // ── Test 8: deny — not_a_member (no row) ──────────────────────────────────
  it('returns allow:false reason:not_a_member when user has no business_users row and is not owner/coach/super_admin', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: { data: null, error: null },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(false)
    if (!verdict.allow) {
      expect(verdict.reason).toBe('not_a_member')
      expect(verdict.sectionKey).toBe(SECTION_KEY)
    }
  })

  // ── Test 9: deny — not_a_member (status=pending) ──────────────────────────
  it('returns allow:false reason:not_a_member when business_users row has status=pending', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: { role: 'member', status: 'pending', section_permissions: { finances: true } },
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(false)
    if (!verdict.allow) {
      expect(verdict.reason).toBe('not_a_member')
      expect(verdict.sectionKey).toBe(SECTION_KEY)
    }
  })

  // ── Test 10: deny — not_a_member (status=inactive) ────────────────────────
  it('returns allow:false reason:not_a_member when business_users row has status=inactive', async () => {
    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: { role: 'member', status: 'inactive', section_permissions: { finances: true } },
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, SECTION_KEY)

    expect(verdict.allow).toBe(false)
    if (!verdict.allow) {
      expect(verdict.reason).toBe('not_a_member')
      expect(verdict.sectionKey).toBe(SECTION_KEY)
    }
  })

  // ── Test 11: canonical spelling guard ─────────────────────────────────────
  it('treats financials=false as missing finances key → allow (PINS section-key spelling decision — see 65-01-SECTION-KEY-VERIFICATION.md)', async () => {
    // PINS the section-key spelling decision (see 65-01-SECTION-KEY-VERIFICATION.md).
    // A future refactor that flips the helper to check `financials` will break this test.
    const row = { role: 'member', status: 'active', section_permissions: { financials: false } }

    const supabase = buildMockSupabase({
      businesses: [
        { data: { owner_id: 'other-owner' }, error: null },
        { data: { assigned_coach_id: 'other-coach' }, error: null },
      ],
      business_users: {
        data: row,
        error: null,
      },
      system_roles: { data: null, error: null },
    })

    const verdict = await requireSectionPermission(supabase, USER_ID, BUSINESS_ID, 'finances')
    expect(verdict.allow).toBe(true)  // because `finances` key is MISSING, defaults to true
    expect(verdict.reason).toBe('permission_granted')
  })
})
