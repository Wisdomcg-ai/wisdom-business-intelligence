/**
 * Step 1's forecast duration must survive reopening the wizard.
 *
 * Reported 15 Aug (Dragon Roofing): "Step 1 keeps defaulting back to 3 years
 * even after I have chosen 1 year."
 *
 * The save was fine — Dragon's row carries `forecast_duration: 1`. The READ was
 * missing: `buildAssumptions` never emits `forecastDuration`, and the wizard's
 * mount path never called `setForecastDuration`, so a reopened forecast fell
 * back to the `createInitialState` default of 3. It only appeared to stick while
 * a localStorage draft happened to carry it; once that draft was absent — or
 * discarded by the draft-identity guard — the default won every time.
 *
 * These tests pin the contract the fix relies on: the duration is settable while
 * the operator is still on Step 1, and refuses once locked. Restoring must
 * therefore happen during init, before any navigation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear()
})

const fresh = (biz: string) => renderHook(() => useForecastWizard(2026, biz, true))

describe('the default that caused the report', () => {
  it('a brand-new wizard starts at 3 years', () => {
    const { result } = fresh('biz-default')
    expect(result.current.state.forecastDuration).toBe(3)
    expect(result.current.state.durationLocked).toBe(false)
  })
})

describe('restoring a saved duration during init', () => {
  it('applies a stored 1-year duration while Step 1 is still open', () => {
    const { result } = fresh('biz-restore')
    // What the mount path now does with loadedForecast.forecast_duration.
    act(() => { result.current.actions.setForecastDuration(1) })
    expect(result.current.state.forecastDuration).toBe(1)
  })

  it('resets activeYear when it would exceed the restored duration', () => {
    const { result } = fresh('biz-activeyear')
    act(() => { result.current.actions.setForecastDuration(3) })
    act(() => { result.current.actions.setActiveYear(3) })
    expect(result.current.state.activeYear).toBe(3)

    act(() => { result.current.actions.setForecastDuration(1) })
    // Year 3 cannot survive a 1-year forecast.
    expect(result.current.state.activeYear).toBe(1)
  })
})

describe('why the restore must happen BEFORE navigation', () => {
  it('locks the duration once the operator leaves Step 1', () => {
    const { result } = fresh('biz-lock')
    expect(result.current.state.currentStep).toBe(1)

    act(() => { result.current.actions.nextStep() })
    expect(result.current.state.durationLocked).toBe(true)
  })

  it('refuses to change the duration once locked — hence init-time restore', () => {
    const { result } = fresh('biz-locked-refuse')
    act(() => { result.current.actions.setForecastDuration(1) })
    act(() => { result.current.actions.nextStep() })

    act(() => { result.current.actions.setForecastDuration(3) })
    // Still 1: the lock held, which is why the fix restores during init.
    expect(result.current.state.forecastDuration).toBe(1)
  })
})

describe('a 1-year forecast skips the multi-year step', () => {
  it('steps over Step 8 (Growth Plan) when there is only one year', () => {
    const { result } = fresh('biz-skip')
    act(() => { result.current.actions.setForecastDuration(1) })
    act(() => { result.current.actions.goToStep(7) })
    act(() => { result.current.actions.nextStep() })
    // Step 8 compares multiple years; with one year it has nothing to show.
    expect(result.current.state.currentStep).toBe(9)
  })

  it('keeps Step 8 for a multi-year forecast', () => {
    const { result } = fresh('biz-keep')
    act(() => { result.current.actions.setForecastDuration(3) })
    act(() => { result.current.actions.goToStep(7) })
    act(() => { result.current.actions.nextStep() })
    expect(result.current.state.currentStep).toBe(8)
  })
})

/**
 * The RESTORED-draft path — the case #374 missed.
 *
 * #374 restored the saved duration via `setForecastDuration`, which refuses once
 * `durationLocked` is true. A restored localStorage draft carries
 * durationLocked: true (the operator had left Step 1 in the earlier session), so
 * the restore silently no-opped on exactly the path most reopens take. Step 1
 * kept showing 3 years even though the row said 1.
 *
 * `hydrateForecastDuration` restores persisted truth regardless of the lock —
 * the lock exists to stop an OPERATOR changing it mid-build, not to block
 * re-loading what was already saved.
 */
describe('hydrating a saved duration onto a LOCKED (restored) draft', () => {
  it('applies the saved duration even when durationLocked is true', () => {
    const { result } = fresh('biz-hydrate-locked')
    act(() => { result.current.actions.nextStep() }) // leaves Step 1 → locks
    expect(result.current.state.durationLocked).toBe(true)

    // setForecastDuration is refused here — that is the #374 bug.
    act(() => { result.current.actions.setForecastDuration(1) })
    expect(result.current.state.forecastDuration).toBe(3)

    // hydrate restores the saved value regardless.
    act(() => { result.current.actions.hydrateForecastDuration(1) })
    expect(result.current.state.forecastDuration).toBe(1)
  })

  it('keeps the lock intact — hydrating is not an unlock', () => {
    const { result } = fresh('biz-hydrate-keeps-lock')
    act(() => { result.current.actions.nextStep() })
    act(() => { result.current.actions.hydrateForecastDuration(1) })
    expect(result.current.state.durationLocked).toBe(true)
  })

  it('clamps activeYear that the restored duration cannot support', () => {
    const { result } = fresh('biz-hydrate-activeyear')
    act(() => { result.current.actions.setActiveYear(3) })
    act(() => { result.current.actions.nextStep() })
    act(() => { result.current.actions.hydrateForecastDuration(1) })
    expect(result.current.state.forecastDuration).toBe(1)
    expect(result.current.state.activeYear).toBe(1)
  })
})
