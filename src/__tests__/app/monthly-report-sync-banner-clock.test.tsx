/**
 * The monthly-report banner's "Last synced" line must come from the server,
 * never from the act of pressing Sync.
 *
 * useXeroConnection.handleSync used to do this after any 2xx:
 *
 *     setXeroConnection(prev => ({ ...prev, last_synced_at: new Date()... }))
 *
 * XeroConnectionBanner renders that value as "Last synced: <time>". So a sync
 * whose P&L failed — every org errored, or the single-flight guard refused a
 * second concurrent run and no P&L ran at all — still repainted the banner to
 * "synced just now", over figures that had not moved. That is the client-side
 * twin of the database stamp deleted from the sync route: a clock moved by
 * asking, not by data arriving.
 *
 * `xero_connections.last_synced_at` has exactly one writer (syncBusinessXeroPL,
 * per tenant, on that tenant's own success), so the hook re-reads
 * /api/Xero/status after a sync instead of predicting it.
 *
 * Also pinned here: the toast read `data.months_synced`, a field no response
 * has ever carried (the route returns `months_fetched`), so every successful
 * sync announced "across undefined months".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const BUSINESS_ID = '22222222-2222-4222-8222-222222222222'

/** The clock the orchestrator last wrote — well before this test runs. */
const SERVER_CLOCK = '2026-09-14T03:15:00.000Z'

const toastCalls: { level: string; message: string }[] = []
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastCalls.push({ level: 'success', message: m }),
    error: (m: string) => toastCalls.push({ level: 'error', message: m }),
    warning: (m: string) => toastCalls.push({ level: 'warning', message: m }),
    info: (m: string) => toastCalls.push({ level: 'info', message: m }),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/finances/monthly-report',
}))

/** What POST /api/monthly-report/sync-xero answers for the case under test. */
let syncResponse: Record<string, unknown>
/** The clock /api/Xero/status reports — the server's own, never `now`. */
let serverClock: string | null
let statusReads = 0

beforeEach(() => {
  toastCalls.length = 0
  statusReads = 0
  serverClock = SERVER_CLOCK
  syncResponse = {
    success: true,
    pl_status: 'success',
    tenants_synced: 1,
    tenants_total: 1,
    accounts_synced: 42,
    months_fetched: 12,
    months_failed: 0,
  }

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/Xero/status')) {
      statusReads++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          connected: true,
          connection: {
            id: 'conn-a',
            tenant_name: 'Org A',
            is_active: true,
            last_synced_at: serverClock,
            expires_at: '2026-12-01T00:00:00.000Z',
          },
        }),
      } as unknown as Response
    }
    if (url.includes('/api/monthly-report/sync-xero') && init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => syncResponse,
      } as unknown as Response
    }
    throw new Error(`[test] unexpected fetch: ${url}`)
  })
})

async function mountHook() {
  const { useXeroConnection } = await import(
    '@/app/finances/monthly-report/hooks/useXeroConnection'
  )
  const view = renderHook(() => useXeroConnection(BUSINESS_ID))
  await waitFor(() => expect(view.result.current.isLoading).toBe(false))
  return view
}

describe('useXeroConnection — pressing Sync never moves the banner clock by itself', () => {
  it('leaves "Last synced" where the server has it when the P&L did not land', async () => {
    syncResponse = {
      success: false,
      pl_status: 'error',
      error: 'All 1 tenants errored',
      tenants_synced: 1,
      tenants_total: 1,
      accounts_synced: 0,
      months_fetched: 0,
      months_failed: 0,
    }

    const { result } = await mountHook()
    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.handleSync()
    })

    expect(returned).toBe(false)
    // The regression pin. Before the fix this read as "a moment ago".
    expect(result.current.xeroConnection?.last_synced_at).toBe(SERVER_CLOCK)
    expect(toastCalls).toEqual([
      { level: 'error', message: 'All 1 tenants errored' },
    ])
  })

  it('leaves it alone when a concurrent sync meant no P&L ran at all', async () => {
    syncResponse = {
      success: false,
      pl_status: 'error',
      error: 'Another sync for this business is already in progress (within 15-minute staleness window).',
      tenants_synced: 1,
      tenants_total: 1,
      accounts_synced: 0,
      months_fetched: 0,
      months_failed: 0,
    }

    const { result } = await mountHook()
    await act(async () => {
      await result.current.handleSync()
    })

    expect(result.current.xeroConnection?.last_synced_at).toBe(SERVER_CLOCK)
    expect(toastCalls[0].level).toBe('error')
    expect(toastCalls[0].message).toContain('already in progress')
  })

  it('adopts the clock the SERVER wrote after a sync that landed — not "now"', async () => {
    const afterSync = '2026-09-16T10:00:00.000Z'
    const { result } = await mountHook()
    // The orchestrator stamps the connection during the sync; the status route
    // is where the hook learns the new value.
    serverClock = afterSync

    await act(async () => {
      await result.current.handleSync()
    })

    expect(result.current.xeroConnection?.last_synced_at).toBe(afterSync)
    // Re-read rather than predicted: mount + post-sync.
    expect(statusReads).toBe(2)
  })

  it('names the months it actually fetched — the toast used to say "undefined"', async () => {
    const { result } = await mountHook()
    await act(async () => {
      await result.current.handleSync()
    })

    expect(toastCalls).toEqual([
      { level: 'success', message: 'Synced 42 accounts across 12 months' },
    ])
    expect(toastCalls[0].message).not.toContain('undefined')
  })

  it('a partial sync is not announced as a clean one', async () => {
    syncResponse = {
      success: true,
      pl_status: 'partial',
      tenants_synced: 2,
      tenants_total: 2,
      accounts_synced: 21,
      months_fetched: 12,
      months_failed: 0,
      errors: [{ tenant_id: 'org-b', error: 'P&L orchestrator: 1 tenant(s) errored' }],
    }

    const { result } = await mountHook()
    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.handleSync()
    })

    // Still true: something landed, so the page keeps its post-sync work.
    expect(returned).toBe(true)
    expect(toastCalls).toEqual([
      { level: 'warning', message: 'Synced 21 accounts across 12 months — some data did not sync' },
    ])
  })

  it('a P&L that landed while the balance sheet lost months is not a clean sync either', async () => {
    syncResponse = {
      success: true,
      pl_status: 'success',
      tenants_synced: 1,
      tenants_total: 1,
      accounts_synced: 42,
      months_fetched: 12,
      months_failed: 1,
      errors: [
        { tenant_id: 'org-a', error: 'month 2026-08 missing from stored balance sheet (fetch 429)' },
      ],
    }

    const { result } = await mountHook()
    await act(async () => {
      await result.current.handleSync()
    })

    expect(toastCalls[0].level).toBe('warning')
    expect(toastCalls[0].message).toContain('some data did not sync')
  })
})
