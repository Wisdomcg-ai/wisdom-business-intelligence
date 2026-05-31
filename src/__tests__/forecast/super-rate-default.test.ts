import { describe, it, expect } from 'vitest'
import { SUPERANNUATION } from '@/app/finances/forecast/constants'

/**
 * R36 — the default Superannuation Guarantee rate used for forecasting must be
 * the current statutory AU SG rate (12% = 0.12), NOT the superseded FY2024-25
 * rate (11.5% = 0.115). The cashflow-settings API default (route.ts) reads from
 * SUPERANNUATION.DEFAULT_RATE, so this invariant guards the single source of
 * truth that feeds it.
 */
describe('Superannuation Guarantee default rate', () => {
  it('defaults to the current statutory 12% (0.12)', () => {
    expect(SUPERANNUATION.DEFAULT_RATE).toBe(0.12)
  })

  it('keeps the historical FY2024-25 rate available but distinct (0.115)', () => {
    expect(SUPERANNUATION.RATE_2024_25).toBe(0.115)
    expect(SUPERANNUATION.RATE_2025_26).toBe(0.12)
    // The default must track the current rate, never the superseded one.
    expect(SUPERANNUATION.DEFAULT_RATE).not.toBe(SUPERANNUATION.RATE_2024_25)
  })
})
