/**
 * DRG-28 — "over budget by more than $500" means more than $500.
 *
 * The house rule, in every client's monthly-report skill: comment on each
 * cost line whose actual − budget > 500 ("≤$500 overs are not noted"). The
 * trigger fired at variance_amount ≤ −500, so a line exactly $500 over was
 * commented on. Compared in whole cents, so floating-point residue neither
 * pushes an exact $500 over the line (1,500.10 − 1,000.10 is 499.9999…) nor
 * keeps a real $500.01 under it.
 */
import { describe, it, expect } from 'vitest'
import { collectCommentaryTriggers } from '../commentary-triggers'
import { fixtureReport, line } from '../../services/__tests__/pdf-pack-fixture'
import type { GeneratedReport } from '../../types'

/** One Operating Expenses line at this actual and budget (expense sign: budget − actual). */
function report(actual: number, budget: number): GeneratedReport {
  const base = fixtureReport()
  return {
    ...base,
    sections: [{ category: 'Operating Expenses', lines: [line('Subscriptions', actual, budget)], subtotal: line('Total Operating Expenses', actual, budget) }],
  }
}

const fires = (actual: number, budget: number) =>
  collectCommentaryTriggers(report(actual, budget)).expense_lines.map((l) => l.account_name)

describe('the expense over-budget trigger', () => {
  it('does not fire on a line exactly $500 over', () => {
    expect(fires(1_500, 1_000)).toEqual([])
  })

  it('fires a cent past $500', () => {
    expect(fires(1_500.01, 1_000)).toEqual(['Subscriptions'])
  })

  it('reads the variance in whole cents', () => {
    // 1,000.10 − 1,500.10 is −499.9999999999999 in floating point.
    expect(fires(1_500.1, 1_000.1)).toEqual([])
    // −500.0000000000001 is still exactly $500 at the precision a pack prints.
    const r = report(0, 0)
    r.sections[0].lines[0].variance_amount = -500.0000000000001
    expect(collectCommentaryTriggers(r).expense_lines).toEqual([])
  })

  it('still fires on a real overspend, as before', () => {
    expect(fires(7_206 + 1_786, 7_206)).toEqual(['Subscriptions'])
  })
})
