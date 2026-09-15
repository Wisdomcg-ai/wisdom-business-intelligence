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
  last_sync_at: new Date().toISOString(),
  last_refresh_at: new Date().toISOString(),
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

describe('monthly-report banner — the whole business, not one org', () => {
  const base = {
    xeroConnection: null,
    isExpired: false,
    isLoading: false,
    isSyncing: false,
    onConnect: noop,
    onSync: noop,
    onManage: noop,
  }

  it('THE REGRESSION TEST: IICT names the stale org and never reads "Connected to Xero: IICT Group Limited"', () => {
    render(<XeroConnectionBanner {...base} xeroConnection={iict().connection} status={iict()} />)
    expect(screen.getByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    // The org's data may come back with a sync, so the action stays.
    expect(screen.getByText('Sync P&L Data')).toBeTruthy()
  })

  it('a multi-org business that is fully connected names every org', () => {
    render(<XeroConnectionBanner {...base} status={dragon()} />)
    expect(screen.getByText('Connected to Xero: Dragon Roofing Pty Ltd, EASY HAIL CLAIM PTY LTD')).toBeTruthy()
  })

  it('one disconnected org asks for a reconnect, naming it — not "Connect Xero" as if there were no Xero', () => {
    render(<XeroConnectionBanner {...base} status={easyHailDead()} />)
    expect(screen.getByText('EASY HAIL CLAIM PTY LTD: Xero disconnected')).toBeTruthy()
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
  })

  it('an unknown status is never green and never "not connected"', () => {
    render(<XeroConnectionBanner {...base} status={{ ...iict(), status: 'unknown' }} />)
    expect(screen.getByText(/Couldn't check the Xero connection just now/)).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    expect(screen.queryByText(/Not connected to Xero/)).toBeNull()
    expect(screen.queryByText(/^Connect Xero$/)).toBeNull()
  })

  it('genuinely no Xero still says so, with the Connect action', () => {
    render(<XeroConnectionBanner {...base} status={{ ...iict(), status: 'none', status_scope: null, orgs: [], connected: false, connection: null }} />)
    expect(screen.getByText('Not connected to Xero')).toBeTruthy()
    expect(screen.getByText('Connect Xero')).toBeTruthy()
  })

  it('a sync Xero just refused still shows the expired state over an older status', () => {
    render(<XeroConnectionBanner {...base} isExpired status={dragon()} />)
    expect(screen.getByText('Xero Connection Expired')).toBeTruthy()
  })
})

describe('forecast panel — the same answer, and a failed check is not "not connected"', () => {
  const base = {
    xeroConnection: null,
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

  it('IICT names the stale org and keeps the sync action', () => {
    render(<XeroConnectionPanel {...base} xeroConnection={iict().connection} status={iict()} />)
    expect(screen.getByText('IICT Group Pty Ltd: Xero numbers have not updated recently')).toBeTruthy()
    expect(screen.queryByText(/Connected to Xero/)).toBeNull()
    expect(screen.getByText('Sync from Xero')).toBeTruthy()
  })

  it('a disconnected org gets the reconnect panel, named', () => {
    render(<XeroConnectionPanel {...base} status={easyHailDead()} />)
    expect(screen.getByText('EASY HAIL CLAIM PTY LTD: Xero disconnected')).toBeTruthy()
    expect(screen.getByText('Reconnect Xero')).toBeTruthy()
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
