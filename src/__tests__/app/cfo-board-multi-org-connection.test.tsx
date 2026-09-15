/**
 * /cfo board — what a multi-org business's connection problem READS like.
 *
 * The route tests pin the payload; this pins the words Matt sees. A row names
 * the org behind the status ("IICT Group Pty Ltd: No fresh data"), counts any
 * other org that also needs attention, and the expanded row lists every org —
 * with the way out for a disconnected one, since nothing in the app can delete
 * one org of several.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import CfoBoardPage from '@/app/cfo/page'

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

type Org = { tenant_name: string | null; status: string; needs_attention: boolean; retired: boolean; last_sync_at: string | null }

function boardClient(id: string, name: string, connection: {
  status: string
  tenant_count: number
  status_scope: string | null
  more_orgs_needing_attention: number
  orgs: Org[]
}) {
  const needs = ['dead', 'unknown', 'auth_stale', 'data_stale'].includes(connection.status)
  return {
    business_id: id,
    business_name: name,
    section: needs ? 'blocked' : 'in_progress',
    stage: 'none',
    cycle: { generated_at: null, approved_at: null, sent_at: null, discussed_at: null, status: null },
    due_day: null,
    due_date: null,
    days_overdue: null,
    connection: {
      ...connection,
      needs_attention: needs,
      last_sync_at: null,
      tenant_names: connection.orgs.filter(o => !o.retired).map(o => o.tenant_name),
    },
    recon: {
      state: 'unknown', totalCount: 0, totalValue: null, currency: null, mixedCurrencies: false, source: null,
      months: [], byAccount: [], checkedAt: null, checkedTenants: 0, erroredTenants: 0, tenantCount: connection.tenant_count,
    },
    dashboard_capture: null,
    readiness: {
      state: 'ready', blocking: 0, blocking_prior: 0, blocking_current: 0, possibly_blocking: 0,
      by_account: [], ignored: [], uncaptured_tenants: 0, captured_at: ago(HOUR), capture_age_days: 0,
    },
    recon_ignored_accounts: [],
    bookkeeper: { name: null, email: null },
  }
}

const clients = [
  boardClient('biz-iict', 'IICT Group', {
    status: 'data_stale',
    tenant_count: 3,
    status_scope: 'IICT Group Pty Ltd',
    more_orgs_needing_attention: 0,
    orgs: [
      { tenant_name: 'IICT Group Pty Ltd', status: 'data_stale', needs_attention: true, retired: false, last_sync_at: ago(106 * HOUR) },
      { tenant_name: 'IICT (Aust) Pty Ltd', status: 'connected', needs_attention: false, retired: false, last_sync_at: ago(3 * HOUR) },
      { tenant_name: 'IICT Group Limited', status: 'connected', needs_attention: false, retired: false, last_sync_at: ago(3 * HOUR) },
    ],
  }),
  boardClient('biz-dragon', 'Dragon Roofing', {
    status: 'dead',
    tenant_count: 2,
    status_scope: 'EASY HAIL CLAIM PTY LTD',
    more_orgs_needing_attention: 1,
    orgs: [
      { tenant_name: 'EASY HAIL CLAIM PTY LTD', status: 'dead', needs_attention: true, retired: false, last_sync_at: ago(40 * HOUR) },
      { tenant_name: 'Dragon Roofing Pty Ltd', status: 'auth_stale', needs_attention: true, retired: false, last_sync_at: ago(2 * HOUR) },
      { tenant_name: 'Dragon Holdings', status: 'connected', needs_attention: false, retired: false, last_sync_at: ago(2 * HOUR) },
      { tenant_name: 'Wound Up Pty Ltd', status: 'dead', needs_attention: false, retired: true, last_sync_at: null },
    ],
  }),
  boardClient('biz-solo', 'Solo Co', {
    status: 'connected',
    tenant_count: 1,
    status_scope: null,
    more_orgs_needing_attention: 0,
    orgs: [{ tenant_name: 'Solo Co Pty Ltd', status: 'connected', needs_attention: false, retired: false, last_sync_at: ago(HOUR) }],
  }),
]

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const month = new URL(String(input), 'http://localhost').searchParams.get('month')
    return {
      ok: true,
      status: 200,
      json: async () => ({
        month,
        clients,
        hidden: [],
        stats: { overdue: 0, blocked: 2, in_progress: 1, sent: 0, discussed: 0 },
        recon_round: null,
      }),
    } as Response
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const rowFor = async (businessName: string) => (await screen.findByText(businessName)).closest('tr') as HTMLTableRowElement

describe('/cfo board — multi-org connection wording', () => {
  it('names the one org of three behind "No fresh data", and lists every org when expanded', async () => {
    render(<CfoBoardPage />)
    const row = await rowFor('IICT Group')
    expect(within(row).getAllByText('IICT Group Pty Ltd: No fresh data').length).toBeGreaterThan(0)

    fireEvent.click(within(row).getByText('IICT Group'))
    const list = (await screen.findByText('Xero orgs')).parentElement as HTMLElement
    const lines = within(list).getAllByRole('listitem').map(li => li.textContent)
    expect(lines[0]).toMatch(/^IICT Group Pty Ltd — No fresh data · last sync 4 d ago$/)
    expect(lines.slice(1)).toEqual([
      'IICT (Aust) Pty Ltd — Xero OK · last sync 3 h ago',
      'IICT Group Limited — Xero OK · last sync 3 h ago',
    ])
    // Nothing is disconnected here, so no retire hint.
    expect(within(list).queryByRole('link', { name: /consolidation settings/i })).toBeNull()
  })

  it('counts the other org needing attention, marks a retired org, and offers the way out', async () => {
    render(<CfoBoardPage />)
    const row = await rowFor('Dragon Roofing')
    expect(
      within(row).getAllByText('EASY HAIL CLAIM PTY LTD: Xero disconnected (+1 more org needs attention)').length,
    ).toBeGreaterThan(0)

    fireEvent.click(within(row).getByText('Dragon Roofing'))
    const list = (await screen.findByText('Xero orgs')).parentElement as HTMLElement
    const items = within(list).getAllByRole('listitem')
    expect(items.map(li => li.textContent?.split(' · ')[0])).toEqual([
      'EASY HAIL CLAIM PTY LTD — Xero disconnected',
      'Dragon Roofing Pty Ltd — Auth stale',
      'Dragon Holdings — Xero OK',
      'Wound Up Pty Ltd — retired',
    ])
    expect(items[1].className).toMatch(/text-red-/)
    expect(items[3].className).not.toMatch(/text-red-/)
    expect(within(list).getByRole('link', { name: /consolidation settings/i }).getAttribute('href'))
      .toBe('/admin/consolidation/biz-dragon')
  })

  it('a single-org business gets no org list — the row already says it all', async () => {
    render(<CfoBoardPage />)
    const row = await rowFor('Solo Co')
    fireEvent.click(within(row).getByText('Solo Co'))
    await screen.findByText(/cycle$/)
    expect(screen.queryByText('Xero orgs')).toBeNull()
  })
})
