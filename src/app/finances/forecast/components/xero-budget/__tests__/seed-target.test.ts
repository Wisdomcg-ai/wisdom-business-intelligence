/**
 * Distinct Directions, 8 Sep 2026: the "Start from Xero budget" control never
 * appeared in the selector footer. Its target test was `assumptions == null`,
 * and the column defaults to `{}` — across the fleet's 39 forecasts not one
 * was null, so the control was unreachable for every client that already had
 * a forecast (24 empty shells across 17 clients).
 */
import { describe, it, expect } from 'vitest'
import { hasNoWizardData, pickSeedTarget } from '../seed-target'

const v = (id: string, assumptions: unknown, is_active = false) => ({
  id,
  name: `Forecast ${id}`,
  is_active,
  assumptions,
})

describe('hasNoWizardData', () => {
  it('treats an empty object as empty — the state every fleet forecast was in', () => {
    expect(hasNoWizardData({})).toBe(true)
  })

  it('treats null and undefined as empty', () => {
    expect(hasNoWizardData(null)).toBe(true)
    expect(hasNoWizardData(undefined)).toBe(true)
  })

  it('a version carrying wizard data is not empty', () => {
    expect(hasNoWizardData({ revenue: { streams: [] } })).toBe(false)
    expect(hasNoWizardData({ goals: { year1: { revenue: 1 } } })).toBe(false)
  })

  it('an object with any key at all counts as data, even a falsy value', () => {
    expect(hasNoWizardData({ team: null })).toBe(false)
  })

  it('tolerates the shapes a bad row could hold', () => {
    expect(hasNoWizardData([])).toBe(true)
    expect(hasNoWizardData([1])).toBe(false)
    expect(hasNoWizardData('')).toBe(true)
    expect(hasNoWizardData(0)).toBe(true)
  })
})

describe('pickSeedTarget', () => {
  it("finds Distinct Directions' empty shell", () => {
    const target = pickSeedTarget([v('dd', {})])
    expect(target?.id).toBe('dd')
  })

  it('prefers the active version when several are empty', () => {
    const target = pickSeedTarget([v('a', {}), v('b', {}, true), v('c', null)])
    expect(target?.id).toBe('b')
  })

  it('falls back to any empty version when the active one has data', () => {
    const target = pickSeedTarget([v('live', { revenue: {} }, true), v('copy', {})])
    expect(target?.id).toBe('copy')
  })

  it('returns null when every version already carries wizard data', () => {
    expect(pickSeedTarget([v('a', { goals: {} }, true), v('b', { team: {} })])).toBeNull()
  })

  it('returns null for an empty list — the no-forecasts empty state handles that', () => {
    expect(pickSeedTarget([])).toBeNull()
  })
})
