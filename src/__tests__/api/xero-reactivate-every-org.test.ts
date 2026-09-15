/**
 * POST /api/Xero/reactivate — every org that needs it (15 Sep 2026).
 *
 * The route revived ONE row: `order('updated_at', desc).limit(1).single()` under
 * one id form. Every refresh and sync bumps updated_at, so for a multi-org
 * business it revived whichever org was written last — and when that row was
 * live it answered "already active" while a sibling stayed switched off. A failed
 * read of xero_connections told the user to connect Xero (404).
 *
 * Through the exported POST (withSchema wrapper included).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockRouteHandlerFrom = vi.fn()
const mockAdminFrom = vi.fn()
const mockGetValidAccessToken = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockRouteHandlerFrom,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  captureMessage: vi.fn(),
}))

interface Row {
  id: string
  business_id: string
  tenant_id: string | null
  tenant_name: string | null
  is_active: boolean | null
  include_in_consolidation: boolean | null
  expires_at: string | null
  updated_at: string | null
  created_at: string | null
}

const IICT = 'biz-iict'
const OWNER = 'user-owner'

const row = (over: Partial<Row>): Row => ({
  id: 'conn-x',
  business_id: IICT,
  tenant_id: 't-x',
  tenant_name: 'Org',
  is_active: true,
  include_in_consolidation: true,
  expires_at: '2026-09-15T04:30:00.000Z',
  updated_at: '2026-09-15T04:01:00.000Z',
  created_at: '2026-05-30T01:46:29.451Z',
  ...over,
})

/**
 * IICT Limited is live and — the trap — the most recently written row. Two
 * siblings are switched off.
 */
const iictWithTwoDead = (): Row[] => [
  row({ id: '09cad39a', tenant_id: 't-limited', tenant_name: 'IICT Group Limited', updated_at: '2026-09-15T05:00:00.000Z' }),
  row({ id: '4bd37c02', tenant_id: 't-pty', tenant_name: 'IICT Group Pty Ltd', is_active: false, updated_at: '2026-09-10T16:11:00.000Z' }),
  row({ id: 'f9c98d7f', tenant_id: 't-aust', tenant_name: 'IICT (Aust) Pty Ltd', is_active: false, updated_at: '2026-09-11T02:00:00.000Z' }),
]

interface World {
  rows: Row[]
  readError?: { message: string }
  profiles?: { id: string; business_id: string }[]
  failUpdateFor?: string[]
  tokenResults?: Record<string, unknown>
  business?: { id: string; owner_id: string; assigned_coach_id: string | null } | null
}

let updates: { id: string; payload: Record<string, unknown> }[] = []

function configure(user: { id: string } | null, w: World) {
  updates = []
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
  mockRouteHandlerFrom.mockImplementation((table: string) => {
    if (table === 'system_roles') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    }
    throw new Error(`route client: unconfigured table "${table}"`)
  })
  mockGetValidAccessToken.mockImplementation(
    async ({ id }: { id: string }) => w.tokenResults?.[id] ?? { success: true, accessToken: 'fresh' },
  )

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'businesses') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: w.business === undefined ? { id: IICT, owner_id: OWNER, assigned_coach_id: null } : w.business,
          error: null,
        }),
      }
      return chain
    }
    if (table === 'business_profiles') {
      let col = ''
      let val = ''
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: string) => {
          col = c
          val = v
          return chain
        },
        maybeSingle: async () => ({
          data: (w.profiles ?? []).find((p) => (p as Record<string, string>)[col] === val) ?? null,
          error: null,
        }),
      }
      return chain
    }
    if (table === 'xero_connections') {
      let mode: 'read' | 'update' = 'read'
      let payload: Record<string, unknown> = {}
      let inCol = ''
      let inVals: string[] = []
      let eqVal = ''
      const chain: any = {
        select: () => chain,
        update: (p: Record<string, unknown>) => {
          mode = 'update'
          payload = p
          return chain
        },
        in: (c: string, v: string[]) => {
          inCol = c
          inVals = v
          return chain
        },
        eq: (_c: string, v: string) => {
          eqVal = v
          return chain
        },
        order: () => chain,
        then: (resolve: any, reject: any) => {
          let result: unknown
          if (mode === 'update') {
            updates.push({ id: eqVal, payload })
            result = { error: (w.failUpdateFor ?? []).includes(eqVal) ? { message: 'write failed' } : null }
          } else if (inCol === 'business_id') {
            result = w.readError
              ? { data: null, error: w.readError }
              : { data: w.rows.filter((r) => inVals.includes(r.business_id)), error: null }
          } else {
            result = {
              data: w.rows
                .filter((r) => inVals.includes(r.id))
                .map((r) => ({ id: r.id, tenant_name: r.tenant_name, expires_at: '2026-09-15T06:00:00.000Z' })),
              error: null,
            }
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return chain
    }
    throw new Error(`admin client: unconfigured table "${table}"`)
  })
}

async function reactivate(businessId = IICT) {
  const { POST } = await import('@/app/api/Xero/reactivate/route')
  const res = await POST(
    new NextRequest('http://localhost/api/Xero/reactivate', {
      method: 'POST',
      body: JSON.stringify({ business_id: businessId }),
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  return { res, body: await res.json() }
}

const tokenCallIds = () => mockGetValidAccessToken.mock.calls.map(([arg]) => arg.id)
const revivedIds = () => updates.filter((u) => u.payload.is_active === true).map((u) => u.id)

beforeEach(() => {
  mockGetUser.mockReset()
  mockRouteHandlerFrom.mockReset()
  mockAdminFrom.mockReset()
  mockGetValidAccessToken.mockReset()
  mockCaptureException.mockReset()
})

describe('POST /api/Xero/reactivate — every org that needs it', () => {
  it('THE REGRESSION TEST: revives BOTH switched-off orgs, even though the latest-written row is live', async () => {
    configure({ id: OWNER }, { rows: iictWithTwoDead() })
    const { res, body } = await reactivate()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.was_inactive).toBe(true)
    expect(body.message).toBe('2 Xero organisations have been reactivated')
    expect(tokenCallIds().sort()).toEqual(['4bd37c02', 'f9c98d7f'])
    expect(tokenCallIds().map((id) => ({ id }))).toEqual(mockGetValidAccessToken.mock.calls.map(([arg]) => arg))
    expect(revivedIds().sort()).toEqual(['4bd37c02', 'f9c98d7f'])
    expect(body.orgs).toEqual([
      { connection_id: '09cad39a', tenant_name: 'IICT Group Limited', result: 'already_active' },
      { connection_id: '4bd37c02', tenant_name: 'IICT Group Pty Ltd', result: 'reactivated' },
      { connection_id: 'f9c98d7f', tenant_name: 'IICT (Aust) Pty Ltd', result: 'reactivated' },
    ])
  })

  it('every org live: "already active", nothing refreshed, nothing written', async () => {
    configure({ id: OWNER }, { rows: iictWithTwoDead().map((r) => ({ ...r, is_active: true })) })
    const { res, body } = await reactivate()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, was_inactive: false, message: 'Connection is already active' })
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('a dead row superseded by a reconnect of the same org under the other id form is left alone', async () => {
    const profileId = 'prof-iict'
    configure(
      { id: OWNER },
      {
        profiles: [{ id: profileId, business_id: IICT }],
        rows: [
          row({ id: 'april-dead', business_id: profileId, tenant_id: 't-limited', tenant_name: 'IICT Group Limited', is_active: false, expires_at: '2026-05-22T22:33:11.063Z' }),
          row({ id: 'may-live', tenant_id: 't-limited', tenant_name: 'IICT Group Limited' }),
        ],
      },
    )
    const { res, body } = await reactivate()

    expect(res.status).toBe(200)
    expect(body.was_inactive).toBe(false)
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('an org retired on purpose (switched off AND excluded from consolidation) is not switched back on', async () => {
    const rows = iictWithTwoDead()
    rows[1] = { ...rows[1], include_in_consolidation: false }
    rows[2] = { ...rows[2], is_active: true }
    configure({ id: OWNER }, { rows })
    const { res, body } = await reactivate()

    expect(res.status).toBe(200)
    expect(body.was_inactive).toBe(false)
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
    expect(body.orgs.find((o: { connection_id: string }) => o.connection_id === '4bd37c02').result).toBe('retired')
  })

  it('when EVERY org is retired they count after all — the same rule as the status classifier', async () => {
    const rows = iictWithTwoDead().map((r) => ({ ...r, is_active: false, include_in_consolidation: false }))
    configure({ id: OWNER }, { rows })
    const { res } = await reactivate()

    expect(res.status).toBe(200)
    expect(tokenCallIds().sort()).toEqual(['09cad39a', '4bd37c02', 'f9c98d7f'])
  })

  it('two dead rows for one org: only the one Xero last granted a token to is revived', async () => {
    configure(
      { id: OWNER },
      {
        profiles: [{ id: 'prof-iict', business_id: IICT }],
        rows: [
          row({ id: 'older', business_id: 'prof-iict', tenant_id: 't-pty', tenant_name: 'IICT Group Pty Ltd', is_active: false, expires_at: '2026-05-22T22:33:17.040Z', updated_at: '2026-09-14T00:00:00.000Z' }),
          row({ id: 'newer', tenant_id: 't-pty', tenant_name: 'IICT Group Pty Ltd', is_active: false, expires_at: '2026-09-10T16:40:00.000Z', updated_at: '2026-09-10T16:40:00.000Z' }),
        ],
      },
    )
    await reactivate()

    expect(tokenCallIds()).toEqual(['newer'])
    expect(revivedIds()).toEqual(['newer'])
  })

  it('one org, switched off: the single-org response shape is unchanged', async () => {
    configure({ id: OWNER }, { rows: [row({ id: 'solo', tenant_name: 'Solo Pty Ltd', is_active: false })] })
    const { res, body } = await reactivate()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      message: 'Xero connection has been reactivated',
      was_inactive: true,
      connection: { id: 'solo', tenant_name: 'Solo Pty Ltd', expires_at: '2026-09-15T06:00:00.000Z' },
    })
  })
})

describe('POST /api/Xero/reactivate — failures', () => {
  it('no rows at all is a 404 — the one case where "connect Xero" is true', async () => {
    configure({ id: OWNER }, { rows: [] })
    const { res, body } = await reactivate()
    expect(res.status).toBe(404)
    expect(body.error).toBe('no_connection')
  })

  it('a failed xero_connections read is a 500 — it used to be the 404 telling the user to connect Xero', async () => {
    configure({ id: OWNER }, { rows: iictWithTwoDead(), readError: { message: 'connection reset' } })
    const { res, body } = await reactivate()
    expect(res.status).toBe(500)
    expect(body.error).not.toBe('no_connection')
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })

  it('one org refused by Xero, one revived: 401 naming the refused org, and the revived one stays revived', async () => {
    configure(
      { id: OWNER },
      {
        rows: iictWithTwoDead(),
        tokenResults: {
          '4bd37c02': { success: false, error: 'token_expired_permanently', message: 'invalid_grant', shouldDeactivate: true },
        },
      },
    )
    const { res, body } = await reactivate()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('token_expired')
    expect(body.message).toBe('IICT Group Pty Ltd: Refresh token has expired. Please reconnect Xero from the Integrations page.')
    expect(body.was_inactive).toBe(true)
    expect(revivedIds()).toEqual(['f9c98d7f'])
  })

  it('a transient refresh failure is a 500 refresh_failed, not a reconnect instruction', async () => {
    configure(
      { id: OWNER },
      { rows: [row({ id: 'solo', is_active: false })], tokenResults: { solo: { success: false, error: 'network_error', message: 'Failed to reach Xero' } } },
    )
    const { res, body } = await reactivate()
    expect(res.status).toBe(500)
    expect(body).toMatchObject({ success: false, error: 'refresh_failed', message: 'Failed to reach Xero', was_inactive: false })
  })

  it('a failed is_active write is a 500 save_failed, captured with an invariant tag', async () => {
    configure({ id: OWNER }, { rows: [row({ id: 'solo', is_active: false })], failUpdateFor: ['solo'] })
    const { res, body } = await reactivate()

    expect(res.status).toBe(500)
    expect(body.error).toBe('save_failed')
    const tagged = mockCaptureException.mock.calls.find(([, ctx]) => ctx?.tags?.invariant === 'xero_reactivate_flip_failed')
    expect(tagged).toBeTruthy()
  })

  it('401 unauthenticated and 403 for a stranger — nothing refreshed', async () => {
    configure(null, { rows: iictWithTwoDead() })
    expect((await reactivate()).res.status).toBe(401)

    configure({ id: 'user-stranger' }, { rows: iictWithTwoDead() })
    expect((await reactivate()).res.status).toBe(403)
    expect(mockGetValidAccessToken).not.toHaveBeenCalled()
  })
})
