/**
 * Seed provenance survives the wizard round-trip.
 *
 * The seed writes `assumptions.seedSource`; the wizard used to rebuild the
 * assumptions from its own state on every autosave and drop it (Urban Road,
 * 7 Sep 2026), so the banners keyed on it vanished after the first edit.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'
import type { ForecastSeedSource } from '@/lib/services/xero-budget-seed-service'

const SRC: ForecastSeedSource = {
  kind: 'xero_budget',
  tenantId: 't-1',
  orgName: 'Urban Road Pty Ltd',
  functionalCurrency: 'AUD',
  budgetId: 'b-1',
  budgetName: 'Overall Budget',
  budgetType: 'OVERALL',
  budgetUpdatedAt: '2026-08-12T22:26:28.783Z',
  seededAt: '2026-09-06T22:32:09.404Z',
  coverage: { firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY: 12, monthsFilled: 0 },
  teamCostBudgetTotal: 990_492.78,
  unclassifiedCount: 0,
}

describe('wizard seedSource', () => {
  it('starts empty and is absent from the export', () => {
    const { result } = renderHook(() => useForecastWizard(2026, 'biz-seed-src-1', true))
    expect(result.current.state.seedSource ?? null).toBeNull()
    expect('seedSource' in result.current.actions.buildAssumptions()).toBe(false)
  })

  it('setSeedSource lands in state and the export carries it verbatim', () => {
    const { result } = renderHook(() => useForecastWizard(2026, 'biz-seed-src-2', true))
    act(() => { result.current.actions.setSeedSource(SRC) })
    expect(result.current.state.seedSource).toEqual(SRC)
    expect(result.current.actions.buildAssumptions().seedSource).toEqual(SRC)
  })

  it('setSeedSource(null) clears it again', () => {
    const { result } = renderHook(() => useForecastWizard(2026, 'biz-seed-src-3', true))
    act(() => { result.current.actions.setSeedSource(SRC) })
    act(() => { result.current.actions.setSeedSource(null) })
    expect(result.current.state.seedSource).toBeNull()
    expect('seedSource' in result.current.actions.buildAssumptions()).toBe(false)
  })
})
