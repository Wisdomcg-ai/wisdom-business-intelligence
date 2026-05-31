import { describe, it, expect } from 'vitest'
import { validateKPITarget } from '@/lib/kpi/utils/validators'

/**
 * R28 — validateKPITarget must not divide by zero.
 *
 * percentChange = ((target - current) / current) * 100 produces Infinity (or
 * NaN when target is also 0) when `current === 0`, which previously leaked into
 * the warning thresholds (a phantom "more than 300% higher" warning, or no
 * warning at all). The guard returns a clear, finite result instead.
 */
describe('validateKPITarget', () => {
  it('does not emit Infinity-driven warnings when current is 0 and target is positive', () => {
    const result = validateKPITarget(0, 100, 'number')

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toBeDefined()
    // The undefined-percentage warning fires...
    expect(result.warnings).toContain(
      'Current value is 0 — percentage change to the target is undefined',
    )
    // ...and the misleading percent-threshold warning does NOT.
    expect(result.warnings).not.toContain(
      'Target is more than 300% higher than current value - very ambitious!',
    )
  })

  it('flags current=0 + target=0 as no change (no NaN swallow)', () => {
    const result = validateKPITarget(0, 0, 'number')

    expect(result.isValid).toBe(true)
    expect(result.warnings).toContain('Target equals the current value (both are 0)')
  })

  it('still computes percentage warnings normally for non-zero current', () => {
    // 100 → 500 = +400% → ambitious warning.
    const ambitious = validateKPITarget(100, 500, 'number')
    expect(ambitious.isValid).toBe(true)
    expect(ambitious.warnings).toContain(
      'Target is more than 300% higher than current value - very ambitious!',
    )

    // 100 → 40 = -60% → significantly-lower warning.
    const lower = validateKPITarget(100, 40, 'number')
    expect(lower.warnings).toContain('Target is significantly lower than current value')

    // 100 → 100.5 = +0.5% → very-close warning.
    const close = validateKPITarget(100, 100.5, 'number')
    expect(close.warnings).toContain(
      'Target is very close to current value (less than 1% change)',
    )
  })

  it('returns invalid (not a divide-by-zero result) when an input value is invalid', () => {
    // Percentage unit rejects values > 100, so target=150 is invalid and we
    // never reach the percent-change math.
    const result = validateKPITarget(0, 150, 'percentage')
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Target value is invalid')
  })
})
