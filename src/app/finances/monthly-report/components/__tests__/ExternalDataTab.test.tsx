/**
 * WE.1b — External Data tab house rules, rendered.
 *
 *   - a failed fetch is NOT an empty state (fail-open UI rule): error card
 *     with retry, never the "create a series" invite
 *   - EXT-TIES banner three-state: tie / break / NOTHING when not comparable
 *   - client role never sees the create-series affordance
 *   - save rejects are surfaced by name
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ExternalDataTab from '../ExternalDataTab'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function series(overrides: Record<string, any> = {}) {
  return {
    id: 'series-1',
    series_key: 'ndis_revenue',
    display_name: 'NDIS Revenue',
    dimension_label: 'Service line',
    measures: [{ key: 'revenue', label: 'Revenue', format: 'currency' }],
    reconciles_to_account_name: 'NDIS Revenue',
    reconcile_measure_key: 'revenue',
    values: [
      { dimension_value: 'NDIS Core', measure_key: 'revenue', scenario: 'actual', value: 30000 },
    ],
    tie: null,
    ...overrides,
  }
}

function okResponse(seriesList: any[]) {
  return { ok: true, json: async () => ({ success: true, period_month: '2026-07', series: seriesList }) }
}

const props = { businessId: 'biz-1', periodMonth: '2026-07', canManage: true }

describe('WE.1b — fail-open rule', () => {
  it('a failed fetch renders the error card with retry — NEVER the empty-state invite', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load external data/)).toBeTruthy()
    })
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.queryByText(/No external data series yet/)).toBeNull()
    expect(screen.queryByText(/New data series/)).toBeNull()
  })

  it('a non-ok response renders the server error, not an empty state', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) })
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeTruthy()
    })
    expect(screen.queryByText(/No external data series yet/)).toBeNull()
  })

  it('a genuinely empty list IS the empty state', async () => {
    mockFetch.mockResolvedValue(okResponse([]))
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText(/No external data series yet/)).toBeTruthy()
    })
  })
})

describe('WE.1b — EXT-TIES banner three-state', () => {
  it('tie within tolerance → green banner naming the account', async () => {
    mockFetch.mockResolvedValue(okResponse([series({
      tie: { series_total: 42150.5, account_actual: 42151, account_name: 'NDIS Revenue', delta: 0.5, within_tolerance: true, comparable: true },
    })]))
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText(/Ties to/)).toBeTruthy()
    })
  })

  it('break outside tolerance → amber difference banner', async () => {
    mockFetch.mockResolvedValue(okResponse([series({
      tie: { series_total: 42150.5, account_actual: 43000, account_name: 'NDIS Revenue', delta: 849.5, within_tolerance: false, comparable: true },
    })]))
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText(/difference \$849\.50/)).toBeTruthy()
    })
  })

  it('not comparable → NO banner at all (no fake tick, no fake break)', async () => {
    mockFetch.mockResolvedValue(okResponse([series({
      tie: { series_total: 30000, account_actual: 0, account_name: 'NDIS Revenue', delta: -30000, within_tolerance: false, comparable: false },
    })]))
    render(<ExternalDataTab {...props} />)
    await waitFor(() => {
      expect(screen.getByText('NDIS Revenue')).toBeTruthy() // card rendered
    })
    expect(screen.queryByText(/Ties to/)).toBeNull()
    expect(screen.queryByText(/difference/)).toBeNull()
  })
})

describe('WE.1b — role gating', () => {
  it('canManage=false hides the create-series affordance', async () => {
    mockFetch.mockResolvedValue(okResponse([]))
    render(<ExternalDataTab {...props} canManage={false} />)
    await waitFor(() => {
      expect(screen.getByText(/No external data series yet/)).toBeTruthy()
    })
    expect(screen.queryByText('New data series')).toBeNull()
    expect(screen.getByText(/coach hasn/)).toBeTruthy()
  })
})
