/**
 * Export is refused when the client is held to an approved budget and the
 * report on screen is not measured against one — but the two ways that happens
 * need different sentences. A stale generate is fixed by regenerating; a budget
 * the resolver REFUSED (an organisation with no version in force, a month with
 * no exchange rate — a multi-organisation business, DRG-03) is not, and
 * "Regenerate before exporting" sends the coach round a loop.
 */
import { describe, it, expect } from 'vitest'
import { exportBudgetSourceRefusal } from '../budget-yardstick'

const report = (over: Record<string, unknown> = {}) => ({
  budget_source: 'budget_version' as const, no_budget_reason: null, no_budget_detail: null, fiscal_year: 2027, ...over,
}) as any

describe('exportBudgetSourceRefusal', () => {
  it('lets an approved-budget report through, and every forecast client', () => {
    expect(exportBudgetSourceRefusal('budget_version', report())).toBeNull()
    expect(exportBudgetSourceRefusal('forecast', report({ budget_source: 'forecast' }))).toBeNull()
    expect(exportBudgetSourceRefusal(undefined, report({ budget_source: undefined }))).toBeNull()
  })

  it('tells a coach whose report is still on the forecast to regenerate', () => {
    expect(exportBudgetSourceRefusal('budget_version', report({ budget_source: 'forecast' })))
      .toBe('This report was measured against the forecast, not the approved budget. Regenerate before exporting.')
  })

  it('names what the resolver refused instead, because regenerating will not fix it', () => {
    expect(exportBudgetSourceRefusal('budget_version', report({
      budget_source: 'none',
      no_budget_reason: 'tenant_without_budget',
      no_budget_detail: 'Easy Hail Claim Pty Ltd has no approved FY2027 budget in force for Aug 2026',
    }))).toBe(
      'This client is held to an approved budget, and this report has none: Easy Hail Claim Pty Ltd has no approved FY2027 budget in force for Aug 2026. '
      + 'Fix that and generate the report again before exporting.',
    )
  })

  it('falls back to the reason when there is no detail', () => {
    expect(exportBudgetSourceRefusal('budget_version', report({ budget_source: 'none', no_budget_reason: 'no_version_in_force' })))
      .toContain('no approved budget version is locked for FY2027')
  })
})
