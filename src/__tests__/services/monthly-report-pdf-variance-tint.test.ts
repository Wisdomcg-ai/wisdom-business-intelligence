/**
 * Phase 71-07 — S4 PDF variance polarity refactor
 *
 * Regression tests for `decideTintColor`, the pure helper extracted from
 * `MonthlyReportPDFService.applyVarianceTint`. The helper must drive tint
 * decisions from structured polarity metadata (`'positive' | 'negative' |
 * 'neutral'`) instead of brittle string parsing of formatted display text.
 *
 * Lock: the helper lives in the same module as the PDF service (no sibling
 * helper file) — imported as a named export from
 * `monthly-report-pdf-service.ts`.
 */

import { describe, it, expect } from 'vitest'

import { decideTintColor } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'

describe('decideTintColor — Phase 71-07 S4 polarity-driven tinting', () => {
  // -------------------------------------------------------------------
  // Polarity-driven path (the bug fix — independent of display format)
  // -------------------------------------------------------------------

  it('Test 1: negative polarity + paren-formatted text → red', () => {
    expect(decideTintColor('negative', '$(500)')).toBe('red')
  })

  it('Test 2: negative polarity + minus-sign-formatted text → red (the bug fix)', () => {
    // Current legacy impl would NOT tint this (text starts with "-$", not "(")
    // depending on parsing order; the polarity path makes it deterministic.
    expect(decideTintColor('negative', '-$500')).toBe('red')
  })

  it('Test 3: positive polarity + plain-dollar text → green', () => {
    expect(decideTintColor('positive', '$500')).toBe('green')
  })

  it('Test 4: positive polarity + signed text → green', () => {
    expect(decideTintColor('positive', '+$500')).toBe('green')
  })

  it('Test 5: neutral polarity + zero text → none', () => {
    expect(decideTintColor('neutral', '$0')).toBe('none')
  })

  // -------------------------------------------------------------------
  // Backward-compat fallback (polarity undefined — legacy callers)
  // -------------------------------------------------------------------

  it('Test 6: undefined polarity + paren-zero text → none (zero is no-tint)', () => {
    expect(decideTintColor(undefined, '($0)')).toBe('none')
  })

  it('Test 7: undefined polarity + paren-formatted negative → red (legacy string fallback)', () => {
    // Without polarity metadata, we MUST fall back to string parsing so
    // older code paths still tint correctly during rollout.
    expect(decideTintColor(undefined, '($500)')).toBe('red')
  })

  it('Test 8: undefined polarity + plain-dollar text → green (legacy string fallback)', () => {
    expect(decideTintColor(undefined, '$500')).toBe('green')
  })
})
