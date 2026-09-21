/**
 * The monthly report's Xero banner, driven through useXeroConnection exactly as
 * the page wires it: fetch → hook state → banner. The component tests hand the
 * banner a status directly; this pins the hook's side of the contract.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { XeroStatusOrg, XeroStatusResponse } from '@/lib/xero/business-status-view'

vi.mock('next/navigation', () => ({
  usePathname: () => '/finances/monthly-report',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { useXeroConnection } from '@/app/finances/monthly-report/hooks/useXeroConnection'
import XeroConnectionBanner from '@/app/finances/monthly-report/components/XeroConnectionBanner'

function MonthlyReportXero({ businessId }: { businessId: string }) {
  const xero = useXeroConnection(businessId)
  return (
    <XeroConnectionBanner
      status={xero.xeroStatus}
      isExpired={xero.isExpired}
      checkFailed={xero.checkFailed}
      isLoading={xero.isLoading}
      isSyncing={xero.isSyncing}
      onConnect={xero.handleConnect}
      onSync={xero.handleSync}
      onManage={xero.handleManage}
    />
  )
}

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
    orgView({ tenant_name: 'IICT Group Pty Ltd', status: 'data_stale', last_sync_at: '2026-09-10T16:11:11.681Z' }),
    orgView({ tenant_name: 'IICT Group Limited' }),
  ],
  retired_orgs: [],
  can_manage: true,
  connected: true,
  expired: false,
  needsReconnect: false,
  connection: { id: 'c', tenant_name: 'IICT Group Pty Ltd', is_active: true, last_synced_at: '2026-09-10T16:11:11.681Z', expires_at: null },
  ...over,
})

type Reply = { status: number; body: unknown } | Error

function stubFetch(routes: { status: Reply[]; sync?: Reply }) {
  const statusQueue = [...routes.status]
  const fn = vi.fn(async (url: string) => {
    const reply = url.startsWith('/api/Xero/status') ? statusQueue.shift() : routes.sync
    if (!reply) throw new Error(`unexpected fetch ${url}`)
    if (reply instanceof Error) throw reply
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('monthly report — useXeroConnection → banner', () => {
  it('checks first, then names the stale org — never a green "Connected to Xero"', async () => {
    stubFetch({ status: [{ status: 200, body: iict() }] })
    render(<MonthlyReportXero businessId="biz-iict" />)

    expect(screen.getByText('Checking Xero connection...')).toBeTruthy()
    expect(await screen.findByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
  })

  it('a 500 is "couldn’t check", not "Not connected to Xero"', async () => {
    stubFetch({ status: [{ status: 500, body: { error: 'Could not check the Xero connection' } }] })
    render(<MonthlyReportXero businessId="biz-iict" />)

    expect(await screen.findByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
  })

  it('a network failure is "couldn’t check" too', async () => {
    stubFetch({ status: [new TypeError('Failed to fetch')] })
    render(<MonthlyReportXero businessId="biz-iict" />)
    expect(await screen.findByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
  })

  it('after a sync the banner re-asks the status route instead of stamping "synced just now"', async () => {
    const fn = stubFetch({
      status: [
        { status: 200, body: iict() },
        { status: 200, body: iict({ status: 'connected', status_scope: null, orgs: [orgView({ tenant_name: 'IICT Group Pty Ltd' }), orgView({ tenant_name: 'IICT Group Limited' })] }) },
      ],
      sync: { status: 200, body: { success: true, accounts_synced: 40, months_synced: 12 } },
    })
    render(<MonthlyReportXero businessId="biz-iict" />)

    fireEvent.click(await screen.findByText('Sync P&L Data'))
    expect(await screen.findByText('Connected to Xero: IICT Group Pty Ltd, IICT Group Limited')).toBeTruthy()
    expect(fn.mock.calls.filter(([url]) => String(url).startsWith('/api/Xero/status'))).toHaveLength(2)
  })
})
