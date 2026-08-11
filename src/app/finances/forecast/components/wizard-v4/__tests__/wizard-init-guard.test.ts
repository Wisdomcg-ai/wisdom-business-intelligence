/**
 * Phase A (CFO-only clients) — regression tests for the wizard's
 * restored-draft skip-guard.
 *
 * The trap this guards against: a localStorage draft cached by a session
 * whose Xero seed failed has priorYear set (or team members) but EMPTY
 * revenue/cogs/opex line arrays. The old guard treated that draft as
 * "already initialized", skipped the full API init, and the operator
 * generated 0-line forecasts forever after (Dragon Roofing 2026-04/2026-08,
 * Efficient Living 2026-07).
 */
import { describe, it, expect } from 'vitest'
import { hasUsablePLLineData } from '../wizard-init-guard'

describe('hasUsablePLLineData', () => {
  it('poisoned draft: priorYear-only shape (all line arrays empty) must NOT skip init', () => {
    expect(
      hasUsablePLLineData({ revenueLines: [], cogsLines: [], opexLines: [] }),
    ).toBe(false)
  })

  it('missing arrays (fresh state) must NOT skip init', () => {
    expect(hasUsablePLLineData({})).toBe(false)
    expect(
      hasUsablePLLineData({ revenueLines: null, cogsLines: null, opexLines: null }),
    ).toBe(false)
  })

  it('draft with revenue lines skips init (operator work preserved)', () => {
    expect(
      hasUsablePLLineData({ revenueLines: [{ id: 'r1' }], cogsLines: [], opexLines: [] }),
    ).toBe(true)
  })

  it('draft with only COGS lines skips init', () => {
    expect(
      hasUsablePLLineData({ revenueLines: [], cogsLines: [{ id: 'c1' }], opexLines: [] }),
    ).toBe(true)
  })

  it('draft with only OpEx lines skips init', () => {
    expect(
      hasUsablePLLineData({ revenueLines: [], cogsLines: [], opexLines: [{ id: 'o1' }] }),
    ).toBe(true)
  })
})
