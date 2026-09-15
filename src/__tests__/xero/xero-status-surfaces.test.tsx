/**
 * The pages that show one business's Xero connection, rendered from the
 * /api/Xero/status answer (15 Sep 2026).
 *
 * Before: the monthly-report banner and the forecast panel said "Connected to
 * Xero: <one org> · Last synced <that org's time>". For IICT Group that org was
 * IICT Group Limited, synced today, while IICT Group Pty Ltd had not synced in
 * five days. The forecast pages also rendered a failed status check as "Not
 * connected to Xero", and the cashflow tab told a business it could not check to
 * go and connect Xero.
 *
 * The banner and panel take the business status as their ONLY source of
 * "connected" — there is no connection-row fallback left to turn green.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { XeroStatusOrg, XeroStatusResponse } from '@/lib/xero/business-status-view'

vi.mock('next/navigation', () => ({
  usePathname: () => '/finances/monthly-report',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/app/finances/forecast/hooks/useCashflowForecast', () => ({
  useCashflowForecast: () => ({
    data: null,
    assumptions: {},
    dataQuality: 'verified',
    isLoading: false,
    isSyncing: false,
    saveAssumptions: () => {},
    syncFromXero: () => {},
    updateAssumption: () => {},
  }),
}))
vi.mock('@/app/finances/forecast/components/CashflowAssumptionsPanel', () => ({ default: () => null }))
vi.mock('@/app/finances/forecast/components/CashflowForecastTable', () => ({ default: () => null }))
vi.mock('@/app/finances/forecast/components/CashflowForecastChart', () => ({ default: () => null }))

import XeroConnectionBanner from '@/app/finances/monthly-report/components/XeroConnectionBanner'
import XeroConnectionPanel from '@/app/finances/forecast/components/XeroConnectionPanel'
import CashflowForecastTab from '@/app/finances/forecast/components/CashflowForecastTab'

const noop = () => {}

const orgView = (over: Partial<XeroStatusOrg>): XeroStatusOrg => ({
  connection_id: 'c',
  tenant_id: 't',
  tenant_name: 'Org',
  status: 'connected',
  last_sync_at: '2026-09-15T04:01:03.185Z',
  last_refresh_at: '2026-09-15T04:00:24.145Z',
  ...over,
})

const iict = (): XeroStatusResponse => ({
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
  can_manage: true,
  connected: true,
  expired: false,
  needsReconnect: false,
  connection: { id: '4bd37c02', tenant_name: 'IICT Group Pty Ltd', is_active: true, last_synced_at: '2026-09-10T16:11:11.681Z', expires_at: null },
})

const dragon = (): XeroStatusResponse => ({
  ...iict(),
  status: 'connected',
  status_scope: null,
  orgs: [orgView({ tenant_name: 'Dragon Roofing Pty Ltd' }), orgView({ tenant_name: 'EASY HAIL CLAIM PTY LTD' })],
})

const easyHailDead = (): XeroStatusResponse => ({
  ...dragon(),
  status: 'dead',
  status_scope: 'EASY HAIL CLAIM PTY LTD',
  expired: true,
  needsReconnect: true,
  orgs: [orgView({ tenant_name: 'EASY HAIL CLAIM PTY LTD', status: 'dead' }), orgView({ tenant_name: 'Dragon Roofing Pty Ltd' })],
})

/** Headline unknown; a sibling stopped refreshing behind it. */
const unknownOverAuthStale = (): XeroStatusResponse => ({
  ...iict(),
  status: 'unknown',
  status_scope: 'Blank Pty Ltd',
  more_orgs_needing_attention: 1,
  needsReconnect: true,
  orgs: [orgView({ tenant_name: 'Blank Pty Ltd', status: 'unknown' }), orgView({ tenant_name: 'Stale Pty Ltd', status: 'auth_stale' })],
})

const none = (): XeroStatusResponse => ({ ...iict(), status: 'none', status_scope: null, orgs: [], connected: false, connection: null })

describe('monthly-report banner — the whole business, not one org', () => {
  const base = {
    status: null,
    isExpired: false,
    isLoading: false,
    isSyncing: false,
    onConnect: noop,
    onSync: noop,
    onManage: noop,
  }

  it('THE REGRESSION TEST: IICT names the stale org and never reads "Connected to Xero: IICT Group Limited"', () => {
    render(<XeroConnectionBanner {...base} status={iict()} />)
    expect(screen.getByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    // The org's data may come back with a sync, so the action stays.
    expect(screen.getByText('Sync P&L Data')).toBeTruthy()
  })

  it('a multi-org business that is fully connected names every org', () => {
    render(<XeroConnectionBanner {...base} status={dragon()} />)
    expect(screen.getByText('Connected to Xero: Dragon Roofing Pty Ltd, EASY HAIL CLAIM PTY LTD')).toBeTruthy()
  })

  it('one disconnected org asks for a reconnect, naming it — and the live org can still be synced', () => {
    render(<XeroConnectionBanner {...base} status={easyHailDead()} />)
    expect(screen.getByText('EASY HAIL CLAIM PTY LTD: Xero disconnected')).toBeTruthy()
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
    expect(screen.getByText('Sync P&L Data')).toBeTruthy()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
  })

  it('every org disconnected: reconnect, and no sync that has nothing to reach', () => {
    render(<XeroConnectionBanner {...base} status={{ ...easyHailDead(), connected: false, orgs: easyHailDead().orgs.map((o) => ({ ...o, status: 'dead' as const })) }} />)
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
    expect(screen.queryByText('Sync P&L Data')).toBeNull()
  })

  it('an unknown status is never green and never "not connected" — and an org that stopped refreshing behind it still gets Reconnect', () => {
    render(<XeroConnectionBanner {...base} status={unknownOverAuthStale()} />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
  })

  it('a team member sees the state but no action they would be refused', () => {
    render(<XeroConnectionBanner {...base} status={{ ...easyHailDead(), can_manage: false }} />)
    expect(screen.getByText('EASY HAIL CLAIM PTY LTD: Xero disconnected')).toBeTruthy()
    expect(screen.getByText('Ask the business owner or your coach to reconnect Xero.')).toBeTruthy()
    expect(screen.queryByText('Reconnect Xero')).toBeNull()
    expect(screen.queryByText('Sync P&L Data')).toBeNull()
  })

  it('genuinely no Xero still says so, with the Connect action — for someone who may connect', () => {
    render(<XeroConnectionBanner {...base} status={none()} />)
    expect(screen.getByText('Not connected to Xero')).toBeTruthy()
    expect(screen.getByText('Connect Xero')).toBeTruthy()
  })

  it('no status at all is "couldn’t check" — there is no connection-row fallback left to turn green', () => {
    render(<XeroConnectionBanner {...base} status={null} />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    expect(screen.getByText('Manage')).toBeTruthy()
  })

  it('a failed re-check outranks a status kept from earlier — it is not shown green', () => {
    render(<XeroConnectionBanner {...base} status={dragon()} checkFailed />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
  })

  it('a sync Xero just refused still shows the expired state over an older status', () => {
    render(<XeroConnectionBanner {...base} isExpired status={dragon()} />)
    expect(screen.getByText('Xero Connection Expired')).toBeTruthy()
  })
})

describe('forecast panel — the same answer, and a failed check is not "not connected"', () => {
  const base = {
    status: null,
    isSaving: false,
    onConnect: noop,
    onDisconnect: noop,
    onSync: noop,
    onClearAndResync: noop,
    onOpenCSVImport: noop,
  }

  it('a failed status check says so, with no Connect button — it used to read "Not connected to Xero"', () => {
    render(<XeroConnectionPanel {...base} checkFailed />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
  })

  it('a failed re-check outranks a status kept from earlier — it is not shown green', () => {
    render(<XeroConnectionPanel {...base} status={dragon()} checkFailed />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
  })

  it('no status at all is "couldn’t check" too', () => {
    render(<XeroConnectionPanel {...base} />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
  })

  it('IICT names the stale org and keeps the sync action', () => {
    render(<XeroConnectionPanel {...base} status={iict()} />)
    expect(screen.getByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    expect(screen.getByText('Sync from Xero')).toBeTruthy()
  })

  it('a disconnected org gets the reconnect panel, named — with Manage and the sync for the live org', () => {
    render(<XeroConnectionPanel {...base} status={easyHailDead()} />)
    expect(screen.getByText('EASY HAIL CLAIM PTY LTD: Xero disconnected')).toBeTruthy()
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
    expect(screen.getByText('Manage')).toBeTruthy()
    expect(screen.getByText('Sync from Xero')).toBeTruthy()
  })

  it('a team member is not offered Reconnect or Connect', () => {
    render(<XeroConnectionPanel {...base} status={{ ...easyHailDead(), can_manage: false }} />)
    expect(screen.queryByText('Reconnect Xero')).toBeNull()
    render(<XeroConnectionPanel {...base} status={{ ...none(), can_manage: false }} />)
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
    expect(screen.getAllByText('Not connected to Xero').length).toBeGreaterThan(0)
  })

  it('a connected multi-org business names every org', () => {
    render(<XeroConnectionPanel {...base} status={dragon()} />)
    expect(screen.getByText('Connected to Xero: Dragon Roofing Pty Ltd, EASY HAIL CLAIM PTY LTD')).toBeTruthy()
  })
})

describe('cashflow tab — a failed check does not tell the user to connect Xero', () => {
  const forecast = { id: 'f1' } as never

  it('genuinely no Xero keeps the instruction', () => {
    render(<CashflowForecastTab forecast={forecast} plLines={[]} businessId="b1" hasXeroConnection={false} />)
    expect(screen.getByText(/Connect Xero to auto-populate opening balances/)).toBeTruthy()
  })

  it('a failed check drops it', () => {
    render(<CashflowForecastTab forecast={forecast} plLines={[]} businessId="b1" hasXeroConnection={false} xeroCheckFailed />)
    expect(screen.queryByText(/Connect Xero to auto-populate opening balances/)).toBeNull()
  })
})
