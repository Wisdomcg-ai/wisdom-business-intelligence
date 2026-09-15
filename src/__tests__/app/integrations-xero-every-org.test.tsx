/**
 * /integrations — the Xero card shows every org with its own state (15 Sep 2026).
 *
 * The page used to read the active xero_connections rows itself: a disconnected
 * org vanished from the list, every listed org got a green tick however old its
 * numbers, "last sync" read a column that does not exist (last_sync_at), and a
 * failed read rendered "Not Connected" with a Connect button. It now renders the
 * /api/Xero/status answer — the same classification as the coach pill and /cfo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { XeroStatusOrg, XeroStatusResponse } from '@/lib/xero/business-status-view'

vi.mock('next/navigation', () => ({
  usePathname: () => '/integrations',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-owner' } } }) },
  }),
}))

vi.mock('@/hooks/useBusinessContext', () => ({
  useBusinessContext: () => ({ activeBusiness: { id: 'biz-iict' }, currentUser: { role: 'client' }, isLoading: false }),
}))

vi.mock('@/lib/business/resolveBusinessId', () => ({
  resolveBusinessId: async () => ({ businessId: 'biz-iict' }),
}))

import IntegrationsPage from '@/app/integrations/page'

const orgView = (over: Partial<XeroStatusOrg>): XeroStatusOrg => ({
  connection_id: 'c',
  tenant_id: 't',
  tenant_name: 'Org',
  status: 'connected',
  last_sync_at: '2026-09-15T04:01:03.185Z',
  last_refresh_at: '2026-09-15T04:00:24.145Z',
  ...over,
})

const iict = (over: Partial<XeroStatusResponse> = {}): XeroStatusResponse => ({
  status: 'data_stale',
  status_scope: 'IICT Group Pty Ltd',
  more_orgs_needing_attention: 0,
  last_sync_at: '2026-09-10T16:11:11.681Z',
  orgs: [
    orgView({ connection_id: '4bd37c02', tenant_name: 'IICT Group Pty Ltd', status: 'data_stale', last_sync_at: '2026-09-10T16:11:11.681Z' }),
    orgView({ connection_id: 'f9c98d7f', tenant_name: 'IICT (Aust) Pty Ltd' }),
    orgView({ connection_id: '09cad39a', tenant_name: 'IICT Group Limited' }),
  ],
  retired_orgs: [],
  connected: true,
  expired: false,
  needsReconnect: false,
  connection: null,
  ...over,
})

function stubStatus(response: { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status })),
  )
}

async function xeroCard() {
  const heading = await screen.findByRole('heading', { name: 'Xero' })
  const card = heading.closest('div.rounded-xl') as HTMLElement
  expect(card).toBeTruthy()
  return within(card)
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/integrations — Xero, every org', () => {
  it('THE REGRESSION TEST: IICT lists every org with its own state, and names the one that needs attention', async () => {
    stubStatus({ status: 200, body: iict() })
    render(<IntegrationsPage />)
    const card = await xeroCard()

    expect(card.getByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(card.getByText('Needs attention')).toBeTruthy()
    expect(card.getByText('Organisations (3)')).toBeTruthy()
    expect(card.getByText('IICT Group Pty Ltd')).toBeTruthy()
    expect(card.getByText(/^Not updated since /)).toBeTruthy()
    expect(card.getAllByText(/^Synced /)).toHaveLength(2)
    // A stale org no longer earns the same green badge as a healthy one.
    expect(card.queryByText('Connected')).toBeNull()
    expect(card.getByText('Sync Now')).toBeTruthy()
  })

  it('a disconnected org is listed — it used to vanish — with the reconnect action', async () => {
    stubStatus({
      status: 200,
      body: iict({
        status: 'dead',
        status_scope: 'IICT (Aust) Pty Ltd',
        more_orgs_needing_attention: 1,
        expired: true,
        needsReconnect: true,
        orgs: [
          orgView({ tenant_name: 'IICT (Aust) Pty Ltd', status: 'dead' }),
          orgView({ tenant_name: 'IICT Group Pty Ltd', status: 'data_stale', last_sync_at: '2026-09-10T16:11:11.681Z' }),
          orgView({ tenant_name: 'IICT Group Limited' }),
        ],
      }),
    })
    render(<IntegrationsPage />)
    const card = await xeroCard()

    expect(card.getByText('IICT (Aust) Pty Ltd: Xero disconnected (+1 more org needs attention)')).toBeTruthy()
    expect(card.getByText('Disconnected — reconnect')).toBeTruthy()
    expect(card.getByText('Reconnect Xero')).toBeTruthy()
    // Siblings still sync.
    expect(card.getByText('Sync Now')).toBeTruthy()
  })

  it('a healthy business keeps the green Connected badge and names each org', async () => {
    stubStatus({
      status: 200,
      body: iict({
        status: 'connected',
        status_scope: null,
        orgs: [orgView({ tenant_name: 'Dragon Roofing Pty Ltd' }), orgView({ tenant_name: 'EASY HAIL CLAIM PTY LTD' })],
      }),
    })
    render(<IntegrationsPage />)
    const card = await xeroCard()

    expect(card.getByText('Connected')).toBeTruthy()
    expect(card.getByText('Dragon Roofing Pty Ltd')).toBeTruthy()
    expect(card.getByText('EASY HAIL CLAIM PTY LTD')).toBeTruthy()
    expect(card.getByText('Add Another Organisation')).toBeTruthy()
  })

  it('an org an admin renamed on the consolidation page is listed by that name', async () => {
    stubStatus({
      status: 200,
      body: iict({ status: 'connected', status_scope: null, orgs: [orgView({ tenant_name: 'IICT GROUP LIMITED', display_name: 'IICT Hong Kong' })] }),
    })
    render(<IntegrationsPage />)
    const card = await xeroCard()
    expect(card.getByText('IICT Hong Kong')).toBeTruthy()
    expect(card.queryByText('IICT GROUP LIMITED')).toBeNull()
  })

  it('an org retired on purpose is shown apart as switched off', async () => {
    stubStatus({
      status: 200,
      body: iict({ status: 'connected', status_scope: null, orgs: [orgView({ tenant_name: 'IICT Group Limited' })], retired_orgs: [orgView({ tenant_name: 'Old Entity Pty Ltd', status: 'dead' })] }),
    })
    render(<IntegrationsPage />)
    const card = await xeroCard()
    expect(card.getByText('Old Entity Pty Ltd')).toBeTruthy()
    expect(card.getByText('Switched off')).toBeTruthy()
  })

  it('a failed check says so and offers nothing that assumes an answer — no Connect, no Disconnect All', async () => {
    stubStatus({ status: 500, body: { error: 'Could not check the Xero connection' } })
    render(<IntegrationsPage />)
    const card = await xeroCard()

    expect(card.getByText(/Couldn't check your Xero connection just now/)).toBeTruthy()
    expect(card.getByText('Try again')).toBeTruthy()
    expect(card.queryByText('Not Connected')).toBeNull()
    expect(card.queryByText(/^Connect Xero$/)).toBeNull()
    expect(card.queryByText('Disconnect All')).toBeNull()
    expect(card.queryByText('Connected')).toBeNull()
  })

  it('genuinely no Xero: Not Connected, with Connect', async () => {
    stubStatus({ status: 200, body: iict({ status: 'none', status_scope: null, orgs: [], connected: false }) })
    render(<IntegrationsPage />)
    const card = await xeroCard()

    expect(card.getByText('Not Connected')).toBeTruthy()
    expect(card.getByText('Connect Xero')).toBeTruthy()
  })
})
