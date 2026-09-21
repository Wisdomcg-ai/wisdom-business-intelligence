import { vi } from 'vitest'

/**
 * Make Date.prototype.toISOString behave as it does in Sydney (AEST, UTC+10)
 * whatever timezone the test runner is in: a Date at local midnight reports
 * the PREVIOUS day. CI runs in UTC, where `toISOString().slice(0, 10)` happens
 * to give the local date — which hid the plan-period bug (B2) for months.
 */
export function simulateSydneyToISOString() {
  const realToISOString = Date.prototype.toISOString
  return vi.spyOn(Date.prototype, 'toISOString').mockImplementation(function (this: Date) {
    const localAsUtc = Date.UTC(
      this.getFullYear(), this.getMonth(), this.getDate(),
      this.getHours(), this.getMinutes(), this.getSeconds(), this.getMilliseconds(),
    )
    return realToISOString.call(new Date(localAsUtc - 10 * 60 * 60 * 1000))
  })
}
