// Phase 42 Plan 42-00 Task 0.2 — Wave 0 test scaffold for usePDFLayout.
// Filled in by Plan 42-05 when D-17 wires onSaveSuccess into the settings
// save path.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePDFLayout } from '../usePDFLayout'
import type { MonthlyReportSettings } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const fetchMock = vi.fn()

function makeSettings(): MonthlyReportSettings {
  return {
    business_id: 'biz-1',
    sections: {
      revenue_detail: true,
      cogs_detail: true,
      opex_detail: true,
      payroll_detail: false,
      subscription_detail: false,
      balance_sheet: false,
      cashflow: false,
      trend_charts: false,
    } as MonthlyReportSettings['sections'],
    show_prior_year: true,
    show_ytd: true,
    show_unspent_budget: true,
    show_budget_next_month: false,
    show_budget_annual_total: false,
    budget_forecast_id: null,
    subscription_account_codes: [],
    wages_account_names: [],
    pdf_layout: null,
  } as MonthlyReportSettings
}

function makeLayout(): PDFLayout {
  return {
    pages: [],
  } as unknown as PDFLayout
}

describe('usePDFLayout (Phase 42 D-17)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // D-17: settings-save path also fires the pill refresh callback
  it('D-17: saveLayout calls onSaveSuccess after 2xx response', async () => {
    const settings = makeSettings()
    const onSettingsChange = vi.fn()
    const onSaveSuccess = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, settings: { ...settings, pdf_layout: makeLayout() } }),
    } as unknown as Response)

    const { result } = renderHook(() =>
      usePDFLayout('biz-1', settings, onSettingsChange, '2026-04', onSaveSuccess),
    )

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.saveLayout(makeLayout())
    })

    expect(ok).toBe(true)
    expect(onSaveSuccess).toHaveBeenCalledTimes(1)
    expect(onSettingsChange).toHaveBeenCalledTimes(1)
  })

  it('D-17: saveLayout does NOT call onSaveSuccess on 500 response', async () => {
    const settings = makeSettings()
    const onSettingsChange = vi.fn()
    const onSaveSuccess = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    } as unknown as Response)

    const { result } = renderHook(() =>
      usePDFLayout('biz-1', settings, onSettingsChange, '2026-04', onSaveSuccess),
    )

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.saveLayout(makeLayout())
    })

    expect(ok).toBe(false)
    expect(onSaveSuccess).not.toHaveBeenCalled()
    expect(onSettingsChange).not.toHaveBeenCalled()
  })

  it('D-17: clearLayout calls onSaveSuccess after 2xx', async () => {
    const settings = makeSettings()
    const onSettingsChange = vi.fn()
    const onSaveSuccess = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, settings: { ...settings, pdf_layout: null } }),
    } as unknown as Response)

    const { result } = renderHook(() =>
      usePDFLayout('biz-1', settings, onSettingsChange, '2026-04', onSaveSuccess),
    )

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.clearLayout()
    })

    expect(ok).toBe(true)
    expect(onSaveSuccess).toHaveBeenCalledTimes(1)
  })
})
