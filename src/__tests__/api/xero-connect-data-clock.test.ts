/**
 * GET /api/Xero/callback and POST /api/Xero/complete-connection end to end: the
 * exported handlers, with only Xero (fetch) and Supabase stubbed at their I/O
 * boundaries. The Supabase stub holds its tables in memory and applies every
 * write, so each test ends by classifying the business from the rows the route
 * left behind — what the coach pill, /cfo and /api/Xero/status would show.
 *
 * The defect this pins: both connect routes ran an "initial sync" that was not
 * one. They asked Xero for api.xro/2.0/BankSummary (not a Xero endpoint) and,
 * in the callback, a current-month P&L; wrote a financial_metrics row (the
 * callback's P&L columns zero when the P&L was refused); then stamped
 * xero_connections.last_synced_at = now on EVERY connection of the business,
 * whatever Xero answered. That column is the data clock
 * classifyBusinessConnections reads, so connecting one org made its siblings
 * read fresh for 48 hours — IICT Group Pty Ltd has refused every sync since
 * 10 Sep 2026 — and a brand-new org skipped pending_first_sync. Only a real
 * per-tenant sync success (sync-orchestrator.ts) may move the clock.
 *
 * The fake sync ran after the response, un-awaited, so every test lets the
 * event loop drain before it looks at what was written.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSignedOAuthState, encrypt } from '@/lib/utils/encryption'
import {
  classifyBusinessConnections,
  type XeroConnectionStatusRow,
  type XeroSyncClock,
} from '@/lib/xero/connection-status'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

type Row = Record<string, unknown>

type Write = {
  table: string
  op: 'insert' | 'upsert' | 'update' | 'delete'
  payload?: unknown
  filters: string[]
}

/**
 * An in-memory Supabase for the calls these routes make: select / insert /
 * upsert (onConflict honoured) / update / delete, filtered by eq, in and the
 * `col.eq.val,col.eq.val` form of or. New rows get the column defaults the
 * checks below depend on: an id, created_at = now and, for xero_connections,
 * last_synced_at = null.
 */
function fakeSupabase(seed: Record<string, Row[]>) {
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]))
  const writes: Write[] = []
  let seq = 0
  const rowsOf = (table: string): Row[] => {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table)!
  }

  function from(table: string) {
    let op: 'select' | Write['op'] = 'select'
    let payload: unknown
    let conflictColumns: string[] = []
    const predicates: Array<(row: Row) => boolean> = []
    const filters: string[] = []
    const matches = (row: Row) => predicates.every((p) => p(row))

    const execute = (): { data: Row[]; error: null } => {
      const rows = rowsOf(table)
      if (op === 'select') return { data: rows.filter(matches).map((r) => ({ ...r })), error: null }
      writes.push({ table, op, payload, filters })
      if (op === 'update') {
        const hit = rows.filter(matches)
        for (const r of hit) Object.assign(r, payload)
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      if (op === 'delete') {
        tables.set(table, rows.filter((r) => !matches(r)))
        return { data: rows.filter(matches), error: null }
      }
      const written: Row[] = []
      for (const p of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
        const existing =
          op === 'upsert' && conflictColumns.length > 0
            ? rows.find((r) => conflictColumns.every((c) => r[c] === p[c]))
            : undefined
        if (existing) {
          Object.assign(existing, p)
          written.push({ ...existing })
        } else {
          const created: Row = {
            id: `${table}-${++seq}`,
            created_at: new Date().toISOString(),
            ...(table === 'xero_connections' ? { last_synced_at: null } : {}),
            ...p,
          }
          rows.push(created)
          written.push({ ...created })
        }
      }
      return { data: written, error: null }
    }

    const first = async () => {
      const r = execute()
      return { ...r, data: r.data[0] ?? null }
    }
    const builder: any = {
      // After a write, select only asks for the written rows back.
      select: () => builder,
      insert: (p: unknown) => {
        op = 'insert'
        payload = p
        return builder
      },
      upsert: (p: unknown, opts?: { onConflict?: string }) => {
        op = 'upsert'
        payload = p
        conflictColumns = opts?.onConflict ? opts.onConflict.split(',').map((c) => c.trim()) : []
        return builder
      },
      update: (p: unknown) => {
        op = 'update'
        payload = p
        return builder
      },
      delete: () => {
        op = 'delete'
        return builder
      },
      eq: (col: string, val: unknown) => {
        predicates.push((r) => r[col] === val)
        filters.push(`${col}=${val}`)
        return builder
      },
      in: (col: string, vals: unknown[]) => {
        predicates.push((r) => vals.includes(r[col]))
        filters.push(`${col} in (${vals.join(',')})`)
        return builder
      },
      or: (expr: string) => {
        const alternatives = expr.split(',').map((part) => {
          const [col, , val] = part.split('.')
          return (r: Row) => String(r[col!]) === val
        })
        predicates.push((r) => alternatives.some((a) => a(r)))
        filters.push(`or(${expr})`)
        return builder
      },
      order: () => builder,
      limit: () => builder,
      single: first,
      maybeSingle: first,
      then: (resolve: any, reject: any) => Promise.resolve().then(execute).then(resolve, reject),
    }
    return builder
  }

  return {
    from,
    writes,
    rows: (table: string) => rowsOf(table).map((r) => ({ ...r })),
    row: (table: string, id: string) => rowsOf(table).find((r) => r.id === id),
  }
}

let database: ReturnType<typeof fakeSupabase>

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => database.from(table) }),
}))

const OWNER = 'owner-user-1'

/** Who the browser is logged in as when Xero redirects back. Reset to OWNER in beforeEach. */
let sessionUserId: string | null = OWNER

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUserId ? { id: sessionUserId } : null }, error: null }),
    },
  }),
}))

// ─── The business ───────────────────────────────────────────────────────────

const NOW = '2026-09-16T01:00:00.000Z'
/** businesses.id — xero_connections.business_id's id-space, and what the connect links send. */
const BIZ = '5b1f7a52-0c1d-4f1e-9a53-3d6b1c2e9f01'
const PROFILE = '9e0d2c4b-7a61-4c3e-8f25-6a1b0d3c5e02'

const TENANT_TRADING = 'a1111111-1111-4111-8111-000000000001'
const TENANT_REFUSED = 'b2222222-2222-4222-8222-000000000002'
const TENANT_NEW_A = 'c3333333-3333-4333-8333-000000000003'
const TENANT_NEW_B = 'd4444444-4444-4444-8444-000000000004'

/** A healthy org: token granted 10 minutes ago, synced by the 22:00 UTC cron. */
const TRADING_ROW: Row = {
  id: 'conn-trading',
  business_id: BIZ,
  tenant_id: TENANT_TRADING,
  tenant_name: 'Trading Org Pty Ltd',
  is_active: true,
  include_in_consolidation: true,
  last_synced_at: '2026-09-15T22:10:00.000Z',
  expires_at: '2026-09-16T01:20:00.000Z',
  created_at: '2026-03-02T00:00:00.000Z',
  updated_at: null,
}

/**
 * The IICT Group Pty Ltd shape: Xero still grants its tokens but has refused
 * every sync since 10 Sep 2026, so its last successful sync is that morning.
 */
const REFUSED_ROW: Row = {
  id: 'conn-refused',
  business_id: BIZ,
  tenant_id: TENANT_REFUSED,
  tenant_name: 'Refused Org Pty Ltd',
  is_active: true,
  include_in_consolidation: true,
  last_synced_at: '2026-09-10T04:05:00.000Z',
  expires_at: '2026-09-16T01:15:00.000Z',
  created_at: '2026-03-02T00:00:00.000Z',
  updated_at: null,
}

/** The sync_jobs clock: each tenant's last successful sync, agreeing with the rows. */
const SYNC_CLOCK: XeroSyncClock = {
  ok: true,
  byTenant: new Map([
    [TENANT_TRADING, Date.parse(TRADING_ROW.last_synced_at as string)],
    [TENANT_REFUSED, Date.parse(REFUSED_ROW.last_synced_at as string)],
  ]),
}

function businessWith(connections: Row[]): Record<string, Row[]> {
  return {
    businesses: [{ id: BIZ, owner_id: OWNER, assigned_coach_id: null }],
    business_profiles: [{ id: PROFILE, business_id: BIZ }],
    xero_connections: connections,
  }
}

function healthOf(clock: XeroSyncClock = SYNC_CLOCK) {
  return classifyBusinessConnections(database.rows('xero_connections') as unknown as XeroConnectionStatusRow[], clock)
}

// ─── Xero ───────────────────────────────────────────────────────────────────

const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const ORGANISATION_URL = 'https://api.xero.com/api.xro/2.0/Organisation'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Xero for a consent covering `tenants`. The token exchange, the connections
 * list and /Organisation answer; everything else is refused — BankSummary is
 * 404 because api.xro/2.0/BankSummary does not exist, and every report is 403,
 * as it is for the refused org.
 */
function xero(tenants: Array<{ tenantId: string; tenantName: string }>, calls: string[]) {
  return (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url === TOKEN_URL) {
      return jsonResponse({
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_in: 1800,
        token_type: 'Bearer',
        scope: 'openid profile email accounting.reports.read offline_access',
      })
    }
    if (url === CONNECTIONS_URL) return jsonResponse(tenants.map((t) => ({ ...t, tenantType: 'ORGANISATION' })))
    if (url === ORGANISATION_URL) {
      return jsonResponse({ Organisations: [{ Timezone: 'AUSEASTERNSTANDARDTIME', CountryCode: 'AU', BaseCurrency: 'AUD' }] })
    }
    if (url.includes('BankSummary')) return jsonResponse({ Message: 'The resource you are looking for cannot be found' }, 404)
    return jsonResponse({ Title: 'Forbidden', Detail: 'AuthorizationUnsuccessful' }, 403)
  }) as typeof fetch
}

// ─── What was written ───────────────────────────────────────────────────────

/** Every xero_connections write that carried last_synced_at, with its filters. */
function clockWrites() {
  return database.writes
    .filter((w) => w.table === 'xero_connections')
    .filter((w) =>
      (Array.isArray(w.payload) ? w.payload : [w.payload]).some(
        (p) => p !== null && typeof p === 'object' && 'last_synced_at' in p,
      ),
    )
    .map((w) => ({ op: w.op, filters: w.filters }))
}

function financialMetricsWrites() {
  return database.writes.filter((w) => w.table === 'financial_metrics')
}

/** Let anything a route left running after its response finish. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

// ─── The routes ─────────────────────────────────────────────────────────────

/**
 * Xero redirecting the browser back after consent, with the state /api/Xero/auth
 * signed. `stateUserId` is who started the connect (null = a state minted before
 * S4 added user_id); defaults to the owner, who is also the logged-in session.
 */
async function xeroRedirectsBack(opts: { businessId: string; returnTo: string; stateUserId?: string | null }) {
  const { GET } = await import('@/app/api/Xero/callback/route')
  const stateUserId = opts.stateUserId === undefined ? OWNER : opts.stateUserId
  const state = createSignedOAuthState({
    business_id: opts.businessId,
    ...(stateUserId ? { user_id: stateUserId } : {}),
    return_to: opts.returnTo,
    timestamp: Date.now(),
  })
  const url = `http://localhost/api/Xero/callback?code=auth-code-1&state=${encodeURIComponent(state)}`
  const res = await (GET as unknown as (req: Request) => Promise<Response>)(new NextRequest(url))
  await settle()
  return res
}

/** The select-org page posting the orgs picked from a multi-org consent. */
async function selectOrgs(body: { pending_id: string; tenant_ids: string[] }) {
  const { POST } = await import('@/app/api/Xero/complete-connection/route')
  const req = new NextRequest('http://localhost/api/Xero/complete-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await (POST as unknown as (req: Request) => Promise<Response>)(req)
  const json = await res.json()
  await settle()
  return { status: res.status, json }
}

beforeEach(() => {
  sessionUserId = OWNER
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  vi.resetModules()
  // 64 hex chars: a raw AES-256 key, so encrypt() skips the slow PBKDF2 derivation.
  vi.stubEnv('APP_SECRET_KEY', 'ab'.repeat(32))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('GET /api/Xero/callback — a one-org consent', () => {
  it("reconnecting one org of a two-org business moves no data clock: the refused sibling still reads data_stale", async () => {
    database = fakeSupabase(businessWith([TRADING_ROW, REFUSED_ROW]))
    expect(healthOf()).toMatchObject({ status: 'data_stale', statusScope: 'Refused Org Pty Ltd' })
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(
      xero([{ tenantId: TENANT_TRADING, tenantName: 'Trading Org Pty Ltd' }], calls),
    )

    // The reconnect link on the coach dashboard's Xero pill.
    const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: '/coach/dashboard' })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/coach/dashboard?success=connected&syncing=true')

    // The reconnect landed: the org Xero returned has its new token and base currency.
    expect(database.row('xero_connections', 'conn-trading')).toMatchObject({
      is_active: true,
      expires_at: '2026-09-16T01:30:00.000Z',
      functional_currency: 'AUD',
      last_synced_at: TRADING_ROW.last_synced_at,
    })

    // No clock moved, and the sibling was not touched at all.
    expect(clockWrites()).toEqual([])
    expect(database.row('xero_connections', 'conn-refused')).toEqual(REFUSED_ROW)
    // No financial_metrics row, and Xero was asked only what connecting needs.
    expect(financialMetricsWrites()).toEqual([])
    expect(calls).toEqual([TOKEN_URL, CONNECTIONS_URL, ORGANISATION_URL])

    expect(healthOf()).toMatchObject({ status: 'data_stale', statusScope: 'Refused Org Pty Ltd' })
  })

  it('a brand-new org reads pending_first_sync until a real sync lands — never connected', async () => {
    database = fakeSupabase(businessWith([]))
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero([{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }], calls))

    // The forecast page's connect button: its ?syncing=true runs the real first sync.
    const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: '/finances/forecast' })

    expect(res.headers.get('location')).toBe('http://localhost/finances/forecast?success=connected&syncing=true')
    expect(database.rows('xero_connections')).toEqual([
      expect.objectContaining({
        business_id: BIZ,
        tenant_id: TENANT_NEW_A,
        is_active: true,
        created_at: NOW,
        last_synced_at: null,
      }),
    ])
    expect(clockWrites()).toEqual([])
    expect(financialMetricsWrites()).toEqual([])
    expect(calls).toEqual([TOKEN_URL, CONNECTIONS_URL, ORGANISATION_URL])

    expect(healthOf({ ok: true, byTenant: new Map() }).status).toBe('pending_first_sync')
  })
})

describe('POST /api/Xero/complete-connection — orgs picked from a multi-org consent', () => {
  it('two new orgs beside a refused one: both read pending_first_sync, the refused org still data_stale', async () => {
    database = fakeSupabase({
      ...businessWith([REFUSED_ROW]),
      pending_xero_connections: [
        {
          id: 'pending-1',
          business_id: BIZ,
          user_id: OWNER,
          // One grant covers every org in the consent: the same token pair for each.
          encrypted_access_token: encrypt('access-shared'),
          encrypted_refresh_token: encrypt('refresh-shared'),
          token_expires_at: '2026-09-16T01:28:00.000Z',
          tenants: [
            { tenantId: TENANT_NEW_A, tenantName: 'New Org A' },
            { tenantId: TENANT_NEW_B, tenantName: 'New Org B' },
            { tenantId: TENANT_REFUSED, tenantName: 'Refused Org Pty Ltd' },
          ],
          return_to: '/finances/forecast',
          created_at: '2026-09-16T00:58:00.000Z',
        },
      ],
    })
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero([], calls))

    const { status, json } = await selectOrgs({ pending_id: 'pending-1', tenant_ids: [TENANT_NEW_A, TENANT_NEW_B] })

    expect(status).toBe(200)
    expect(json).toEqual({
      success: true,
      tenant_count: 2,
      tenant_names: ['New Org A', 'New Org B'],
      redirect_to: '/finances/forecast?success=connected&syncing=true',
    })

    // Both orgs saved under businesses.id, and the pending consent consumed.
    expect(
      database
        .rows('xero_connections')
        .map((r) => [r.tenant_name, r.business_id, r.last_synced_at])
        .sort(),
    ).toEqual([
      ['New Org A', BIZ, null],
      ['New Org B', BIZ, null],
      ['Refused Org Pty Ltd', BIZ, REFUSED_ROW.last_synced_at],
    ])
    expect(database.rows('pending_xero_connections')).toEqual([])

    expect(clockWrites()).toEqual([])
    expect(database.row('xero_connections', 'conn-refused')).toEqual(REFUSED_ROW)
    expect(financialMetricsWrites()).toEqual([])
    // Saving a connection asks Xero nothing.
    expect(calls).toEqual([])

    const health = healthOf()
    expect(health).toMatchObject({ status: 'data_stale', statusScope: 'Refused Org Pty Ltd' })
    expect(health.orgs.map((o) => [o.tenantName, o.status])).toEqual([
      ['Refused Org Pty Ltd', 'data_stale'],
      ['New Org A', 'pending_first_sync'],
      ['New Org B', 'pending_first_sync'],
    ])
  })
})

/**
 * S4 + S2 (22 Sep 2026 system diagnostic). The signed state used to name only
 * the business, so a client could send someone their Xero login link and have
 * that person's orgs saved onto the client's business; and return_to was
 * followed wherever it pointed — an open redirect, and a javascript: link on the
 * org picker. Refusals must happen before Xero is even asked for tokens.
 */
describe('GET /api/Xero/callback — only the person who started the connect can finish it (S4)', () => {
  it("a connect link opened in someone else's session saves nothing and never exchanges the code", async () => {
    database = fakeSupabase(businessWith([]))
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero([{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }], calls))
    sessionUserId = 'matt-super-admin'

    const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: '/integrations' })

    expect(res.headers.get('location')).toBe('http://localhost/integrations?error=session_mismatch')
    expect(calls).toEqual([])
    expect(database.rows('xero_connections')).toEqual([])
    expect(database.rows('pending_xero_connections')).toEqual([])
  })

  it('a state minted before the check (no user_id) is refused', async () => {
    database = fakeSupabase(businessWith([]))
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero([{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }], calls))

    const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: '/integrations', stateUserId: null })

    expect(res.headers.get('location')).toBe('http://localhost/integrations?error=session_mismatch')
    expect(calls).toEqual([])
    expect(database.rows('xero_connections')).toEqual([])
  })

  it('no session at all is refused', async () => {
    database = fakeSupabase(businessWith([]))
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(xero([{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }], calls))
    sessionUserId = null

    const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: '/integrations' })

    expect(res.headers.get('location')).toBe('http://localhost/integrations?error=session_mismatch')
    expect(calls).toEqual([])
  })
})

describe('Xero connect never navigates off-site (S2)', () => {
  for (const hostile of ['https://evil.example/phish', '//evil.example/phish', '/\\evil.example', 'javascript:alert(document.cookie)//']) {
    it(`callback: return_to ${JSON.stringify(hostile)} lands on /integrations`, async () => {
      database = fakeSupabase(businessWith([]))
      vi.spyOn(global, 'fetch').mockImplementation(xero([{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }], []))

      const res = await xeroRedirectsBack({ businessId: BIZ, returnTo: hostile })

      expect(res.headers.get('location')).toBe('http://localhost/integrations?success=connected&syncing=true')
    })
  }

  it('complete-connection: a hostile stored return_to becomes a same-site redirect_to', async () => {
    database = fakeSupabase({
      ...businessWith([]),
      pending_xero_connections: [
        {
          id: 'pending-hostile',
          business_id: BIZ,
          user_id: OWNER,
          encrypted_access_token: encrypt('access-shared'),
          encrypted_refresh_token: encrypt('refresh-shared'),
          token_expires_at: '2026-09-16T01:28:00.000Z',
          tenants: [{ tenantId: TENANT_NEW_A, tenantName: 'New Org A' }],
          return_to: 'javascript:alert(document.cookie)//',
          created_at: '2026-09-16T00:58:00.000Z',
        },
      ],
    })
    vi.spyOn(global, 'fetch').mockImplementation(xero([], []))

    const { status, json } = await selectOrgs({ pending_id: 'pending-hostile', tenant_ids: [TENANT_NEW_A] })

    expect(status).toBe(200)
    expect(json.redirect_to).toBe('/integrations?success=connected&syncing=true')
  })
})
