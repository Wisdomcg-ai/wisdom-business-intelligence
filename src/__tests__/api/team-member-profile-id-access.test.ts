/**
 * An active team member reaches a business route with the id their page holds.
 *
 * verifyBusinessAccess checked business_users on the raw id, and
 * business_users.business_id is businesses-space, so every route handed a
 * business_profiles.id refused every active team member (owner and coach still
 * passed — their check resolved the profile id). These tests go through the
 * exported handlers with the REAL helper; only Supabase is doubled, and the
 * double honours every filter value. Each posts what its real caller posts:
 *
 *   - GET /api/goals/reset-actuals — the annual reset (useStrategicPlanning →
 *     annual-reset-service) sends the business_profiles.id. The 403 made the
 *     rollover silently keep last year's targets instead of seeding FY actuals.
 *   - GET/POST /api/kpis — business_kpis.business_id references
 *     business_profiles(id), so the profile id is the only id this route serves.
 *
 * Pending and inactive members stay refused (C-34), and so does a member of a
 * different business — before any of the business's data is read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createFilterAwareSupabase,
  type FilterAwareSupabase,
  type Row,
} from '@/__tests__/helpers/filter-aware-supabase'

let db: FilterAwareSupabase
let signedInUserId: string

// Both the helper's and the kpis route's module-level service-role clients.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => db.from(table) }),
}))

// The request's auth-bound client — reset-actuals reads through it too.
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: signedInUserId } }, error: null }) },
    from: (table: string) => db.from(table),
  }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import { GET as getResetActuals } from '@/app/api/goals/reset-actuals/route'
import { GET as getKpis, POST as postKpis } from '@/app/api/kpis/route'

// ─── Two tenants, each in both id-spaces ─────────────────────────────────────

const BUSINESS_ID = 'biz-urban-road'
const PROFILE_ID = 'profile-urban-road'
const OTHER_BUSINESS_ID = 'biz-other-client'
const OTHER_PROFILE_ID = 'profile-other-client'

const OWNER = 'user-owner'
const COACH = 'user-coach'
const TEAM_MEMBER = 'user-team-member'

/** FY2026 (July start): twelve months of P&L lines under one business_profiles.id. */
function fyLines(profileId: string, monthly: { revenue: number; cogs: number; opex: number }): Row[] {
  const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const line = (account_name: string, account_type: string, amount: number): Row => ({
    business_id: profileId,
    account_name,
    account_type,
    monthly_values: Object.fromEntries(months.map((m) => [m, amount])),
  })
  return [
    line('Sales', 'revenue', monthly.revenue),
    line('Materials', 'cogs', monthly.cogs),
    line('Rent', 'opex', monthly.opex),
  ]
}

function seed(memberships: Row[]) {
  db = createFilterAwareSupabase({
    businesses: [
      { id: BUSINESS_ID, owner_id: OWNER, assigned_coach_id: COACH },
      { id: OTHER_BUSINESS_ID, owner_id: 'user-other-owner', assigned_coach_id: COACH },
    ],
    business_profiles: [
      { id: PROFILE_ID, business_id: BUSINESS_ID },
      { id: OTHER_PROFILE_ID, business_id: OTHER_BUSINESS_ID },
    ],
    business_users: memberships,
    system_roles: [],
    xero_connections: [],
    xero_pl_lines_wide_compat: [
      ...fyLines(PROFILE_ID, { revenue: 1000, cogs: 400, opex: 100 }),
      ...fyLines(OTHER_PROFILE_ID, { revenue: 90_000, cogs: 0, opex: 0 }),
    ],
    business_kpis: [
      { id: 'kpi-row-1', business_id: PROFILE_ID, kpi_id: 'revenue', name: 'Revenue', created_at: '2026-09-01' },
      { id: 'kpi-row-2', business_id: OTHER_PROFILE_ID, kpi_id: 'leads', name: 'Leads', created_at: '2026-09-02' },
    ],
    activity_log: [],
  })
}

function membership(over: Row = {}): Row {
  return {
    id: 'membership-1',
    business_id: BUSINESS_ID, // businesses-space: business_users.business_id → businesses(id)
    user_id: TEAM_MEMBER,
    role: 'member',
    status: 'active',
    ...over,
  }
}

function resetActualsRequest(businessId: string) {
  return new NextRequest(
    `http://localhost/api/goals/reset-actuals?business_id=${businessId}&fiscal_year=2026&year_start_month=7`,
  )
}

const readsOf = (table: string) => db.reads.filter((r) => r.table === table)

beforeEach(() => {
  signedInUserId = TEAM_MEMBER
  seed([membership()])
})

// ─── GET /api/goals/reset-actuals ────────────────────────────────────────────

describe('GET /api/goals/reset-actuals — the annual reset posts a business_profiles.id', () => {
  it.each(['member', 'admin'])(
    'an active %s gets the FY actuals the reset seeds the plan from',
    async (role) => {
      seed([membership({ role })])

      const res = await getResetActuals(resetActualsRequest(PROFILE_ID))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        usable: true,
        months_covered: 12,
        // Their business's year only: 12 × 1000 revenue, − 12 × 400 COGS, − 12 × 100 rent.
        actuals: { revenue: 12_000, gross_profit: 7_200, net_profit: 6_000 },
      })
    },
  )

  it('still serves the owner, as before', async () => {
    signedInUserId = OWNER
    const res = await getResetActuals(resetActualsRequest(PROFILE_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).actuals.revenue).toBe(12_000)
  })

  it.each(['pending', 'inactive'])(
    'refuses a %s member before any P&L is read',
    async (status) => {
      seed([membership({ status })])

      const res = await getResetActuals(resetActualsRequest(PROFILE_ID))

      expect(res.status).toBe(403)
      expect(readsOf('xero_pl_lines_wide_compat')).toHaveLength(0)
    },
  )

  it("refuses an active member of another business this business's profile id", async () => {
    seed([membership({ business_id: OTHER_BUSINESS_ID })])

    const res = await getResetActuals(resetActualsRequest(PROFILE_ID))

    expect(res.status).toBe(403)
    expect(readsOf('xero_pl_lines_wide_compat')).toHaveLength(0)
  })

  it('checks the membership on the parent businesses.id, not the posted profile id', async () => {
    await getResetActuals(resetActualsRequest(PROFILE_ID))

    const membershipReads = readsOf('business_users')
    expect(membershipReads.length).toBeGreaterThan(0)
    for (const read of membershipReads) {
      expect(read.filters).toContainEqual({ op: 'eq', column: 'business_id', value: BUSINESS_ID })
    }
  })
})

// ─── /api/kpis ───────────────────────────────────────────────────────────────

describe('/api/kpis — a profile-keyed route', () => {
  it("GET: an active member holding the profile id gets that business's KPIs, and only those", async () => {
    const res = await getKpis(new NextRequest(`http://localhost/api/kpis?businessId=${PROFILE_ID}`))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kpis.map((k: Row) => k.kpi_id)).toEqual(['revenue'])
  })

  it.each(['pending', 'inactive'])('GET: refuses a %s member', async (status) => {
    seed([membership({ status })])

    const res = await getKpis(new NextRequest(`http://localhost/api/kpis?businessId=${PROFILE_ID}`))

    expect(res.status).toBe(403)
    expect(readsOf('business_kpis')).toHaveLength(0)
  })

  it("GET: refuses a member of another business this business's profile id", async () => {
    seed([membership({ business_id: OTHER_BUSINESS_ID })])

    const res = await getKpis(new NextRequest(`http://localhost/api/kpis?businessId=${PROFILE_ID}`))

    expect(res.status).toBe(403)
  })

  function postKpisRequest(businessId: string) {
    return new NextRequest('http://localhost/api/kpis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        businessId,
        kpis: [{ kpi_id: 'gross-margin', name: 'Gross margin', category: 'finance', frequency: 'monthly', unit: '%' }],
      }),
    })
  }

  it('POST: a pending member writes nothing', async () => {
    seed([membership({ status: 'pending' })])

    const res = await postKpis(postKpisRequest(PROFILE_ID))

    expect(res.status).toBe(403)
    expect(db.writes).toHaveLength(0)
  })

  it("POST: an active member's save touches only their own business's KPIs", async () => {
    const res = await postKpis(postKpisRequest(PROFILE_ID))

    expect(res.status).toBe(200)
    expect(db.tables.business_kpis.map((k) => [k.business_id, k.kpi_id])).toEqual([
      // 'revenue' was deselected, so the save prunes it — and only it.
      [OTHER_PROFILE_ID, 'leads'],
      [PROFILE_ID, 'gross-margin'],
    ])
  })
})
