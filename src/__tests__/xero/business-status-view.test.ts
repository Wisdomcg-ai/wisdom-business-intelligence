/**
 * The page-side reader of /api/Xero/status: one way to tell an answer from a
 * failed check, and one vocabulary for every surface (banner, forecast panel,
 * integrations page, keepalive).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  describeXeroStatus,
  fetchXeroBusinessStatus,
  parseXeroStatusResponse,
  xeroOrgNames,
  type XeroStatusOrg,
  type XeroStatusResponse,
} from '@/lib/xero/business-status-view'

const orgView = (over: Partial<XeroStatusOrg>): XeroStatusOrg => ({
  connection_id: 'c',
  tenant_id: 't',
  tenant_name: 'Org',
  status: 'connected',
  last_sync_at: '2026-09-15T04:00:00.000Z',
  last_refresh_at: '2026-09-15T04:00:00.000Z',
  ...over,
})

const status = (over: Partial<XeroStatusResponse>): XeroStatusResponse => ({
  status: 'connected',
  status_scope: null,
  more_orgs_needing_attention: 0,
  last_sync_at: '2026-09-15T04:00:00.000Z',
  orgs: [orgView({})],
  retired_orgs: [],
  connected: true,
  expired: false,
  needsReconnect: false,
  connection: null,
  ...over,
})

/** IICT Group on 15 Sep 2026: Pty Ltd five days old, siblings current. */
const iict = () =>
  status({
    status: 'data_stale',
    status_scope: 'IICT Group Pty Ltd',
    last_sync_at: '2026-09-10T16:11:11.681Z',
    orgs: [
      orgView({ tenant_name: 'IICT Group Pty Ltd', status: 'data_stale', last_sync_at: '2026-09-10T16:11:11.681Z' }),
      orgView({ tenant_name: 'IICT Group Limited' }),
      orgView({ tenant_name: 'IICT (Aust) Pty Ltd' }),
    ],
  })

const fmt = (iso: string) => `<${iso.slice(0, 10)}>`

describe('parseXeroStatusResponse — an answer, or not', () => {
  it('accepts a status answer', () => {
    expect(parseXeroStatusResponse(iict())?.status).toBe('data_stale')
  })

  it('a 200 carrying an error body is not an answer', () => {
    expect(parseXeroStatusResponse({ error: 'Internal server error' })).toBeNull()
  })

  it('the pre-multi-org shape (connected + connection, no status) is not an answer — it named one org', () => {
    expect(parseXeroStatusResponse({ connected: true, connection: { tenant_name: 'IICT Group Limited' } })).toBeNull()
  })

  it('an unrecognised status, or orgs that are not classified, is not an answer', () => {
    expect(parseXeroStatusResponse({ ...iict(), status: 'fine' })).toBeNull()
    expect(parseXeroStatusResponse({ ...iict(), orgs: [{ tenant_name: 'x' }] })).toBeNull()
    expect(parseXeroStatusResponse(null)).toBeNull()
    expect(parseXeroStatusResponse('connected')).toBeNull()
  })

  it('fills the optional lists and counts rather than trusting them', () => {
    const { retired_orgs: _r, more_orgs_needing_attention: _m, ...bare } = iict()
    const parsed = parseXeroStatusResponse(bare)
    expect(parsed?.retired_orgs).toEqual([])
    expect(parsed?.more_orgs_needing_attention).toBe(0)
  })
})

describe('fetchXeroBusinessStatus — a failed check is never "not connected"', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubFetch = (impl: (...args: unknown[]) => Promise<unknown>) => {
    const fn = vi.fn(impl)
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('a 200 status answer is ok, and the business id is encoded into the URL', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify(iict()), { status: 200 }))
    const result = await fetchXeroBusinessStatus('biz 1')
    expect(result.ok && result.data.status_scope).toBe('IICT Group Pty Ltd')
    expect(fn.mock.calls[0][0]).toBe('/api/Xero/status?business_id=biz%201')
  })

  it('a 500, a 403, a network failure, non-JSON and a non-answer body are all not-ok', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }))
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })

    stubFetch(async () => new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 }))
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })

    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })

    stubFetch(async () => new Response('<html>504</html>', { status: 200 }))
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })

    stubFetch(async () => new Response(JSON.stringify({ connected: false, connection: null }), { status: 200 }))
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })
  })

  it('a non-2xx is not an answer even when its body looks like one', async () => {
    stubFetch(async () => new Response(JSON.stringify(iict()), { status: 502 }))
    expect(await fetchXeroBusinessStatus('b')).toEqual({ ok: false })
  })

  it('an abort is rethrown — a superseded request is not a failed check', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    await expect(fetchXeroBusinessStatus('b')).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('describeXeroStatus — the same words as the pill and the board', () => {
  it('IICT Group: names the stale org and shows ITS clock — never "Connected to Xero: IICT Group Limited"', () => {
    const copy = describeXeroStatus(iict(), fmt)
    expect(copy).toEqual({
      tone: 'attention',
      title: 'IICT Group Pty Ltd: Xero numbers have not updated recently',
      detail: 'Last synced: <2026-09-10>',
      canSync: true,
    })
  })

  it('a disconnected org counts the other org that also needs attention', () => {
    const copy = describeXeroStatus(
      status({ status: 'dead', status_scope: 'EASY HAIL CLAIM PTY LTD', more_orgs_needing_attention: 1 }),
      fmt,
    )
    expect(copy.tone).toBe('reconnect')
    expect(copy.title).toBe('EASY HAIL CLAIM PTY LTD: Xero disconnected (+1 more org needs attention)')
  })

  it('several orgs counted: "(+2 more orgs need attention)"', () => {
    expect(describeXeroStatus(status({ status: 'dead', more_orgs_needing_attention: 2 }), fmt).title).toBe(
      'Xero disconnected (+2 more orgs need attention)',
    )
  })

  it('connected names every org, up to three, then counts them', () => {
    const two = status({ orgs: [orgView({ tenant_name: 'Dragon Roofing Pty Ltd' }), orgView({ tenant_name: 'EASY HAIL CLAIM PTY LTD' })] })
    expect(describeXeroStatus(two, fmt)).toMatchObject({
      tone: 'ok',
      title: 'Connected to Xero: Dragon Roofing Pty Ltd, EASY HAIL CLAIM PTY LTD',
      detail: 'Last synced: <2026-09-15>',
    })
    const four = status({ orgs: ['A', 'B', 'C', 'D'].map((n) => orgView({ tenant_name: n })) })
    expect(describeXeroStatus(four, fmt).title).toBe('Connected to Xero: 4 organisations')
    expect(xeroOrgNames([orgView({ tenant_name: '  ' })])).toBeNull()
  })

  it('never synced data_stale says so instead of leaving the date blank', () => {
    expect(describeXeroStatus(status({ status: 'data_stale', last_sync_at: null }), fmt).detail).toBe('Never synced')
  })

  it('unknown is never green, and says it is not a confirmation', () => {
    const copy = describeXeroStatus(status({ status: 'unknown', status_scope: 'IICT Group Pty Ltd' }), fmt)
    expect(copy.tone).toBe('unknown')
    expect(copy.title).toBe("IICT Group Pty Ltd: Couldn't check the Xero connection just now")
    expect(copy.detail).toMatch(/not a confirmation/)
  })

  it('pending and auth_stale', () => {
    expect(describeXeroStatus(status({ status: 'pending_first_sync', last_sync_at: null }), fmt)).toMatchObject({
      tone: 'pending',
      detail: 'First sync pending — it runs within a few hours.',
    })
    expect(describeXeroStatus(status({ status: 'auth_stale' }), fmt).tone).toBe('reconnect')
  })

  it('none has no sync; an all-dead business cannot sync', () => {
    expect(describeXeroStatus(status({ status: 'none', orgs: [] }), fmt)).toEqual({
      tone: 'none',
      title: 'Not connected to Xero',
      detail: null,
      canSync: false,
    })
    expect(
      describeXeroStatus(status({ status: 'dead', orgs: [orgView({ status: 'dead' }), orgView({ status: 'dead' })] }), fmt).canSync,
    ).toBe(false)
  })
})
