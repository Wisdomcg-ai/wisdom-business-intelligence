/**
 * The settings panel's budget-source option. It was disabled unless there was
 * exactly one locked version, so Dragon Roofing & Easy Hail (one version per
 * organisation) and IICT could never be switched onto the budgets they are
 * held to (DRG-03).
 */
import { describe, it, expect } from 'vitest'
import { budgetVersionChoice } from '../budget-version-choice'

const version = (over: Partial<Parameters<typeof budgetVersionChoice>[0][number]> = {}) => ({
  id: 'v1', label: 'FY27 Budget', effective_from: '2026-07', months_covered: 12, fiscal_year: 2027, tenant_id: null, source: 'manual',
  ...over,
})

describe('budgetVersionChoice', () => {
  it('offers nothing to switch to when nothing is imported', () => {
    expect(budgetVersionChoice([])).toMatchObject({ selectable: false, note: 'No budget imported for this business yet.' })
  })

  it("keeps a single Xero import's words", () => {
    const choice = budgetVersionChoice([version({ source: 'xero', label: 'FY27' })])
    expect(choice).toMatchObject({ selectable: true, label: 'Xero budget — FY27 · effective 2026-07 · 12 of 12 months', note: null })
  })

  it('offers one version per organisation, and names them', () => {
    const choice = budgetVersionChoice(
      [version({ id: 'a', tenant_id: 'drg' }), version({ id: 'b', tenant_id: 'ehc' })],
      { drg: 'Dragon Roofing Pty Ltd', ehc: 'Easy Hail Claim Pty Ltd' },
    )
    expect(choice.selectable).toBe(true)
    expect(choice.label).toBe('Approved budget — 2 versions')
    expect(choice.note).toBe('One per Xero organisation: Dragon Roofing Pty Ltd, Easy Hail Claim Pty Ltd. The report sums them in AUD.')
  })

  it('a later revision of one organisation is ordinary', () => {
    const choice = budgetVersionChoice([version({ id: 'a', tenant_id: 'drg' }), version({ id: 'b', tenant_id: 'drg', effective_from: '2026-11' })])
    expect(choice.selectable).toBe(true)
  })

  it('two versions of one organisation from the same month are what nothing can choose between', () => {
    const choice = budgetVersionChoice(
      [version({ id: 'a', tenant_id: 'drg' }), version({ id: 'b', tenant_id: 'drg' })],
      { drg: 'Dragon Roofing Pty Ltd' },
    )
    expect(choice).toMatchObject({
      selectable: false,
      tone: 'warning',
      note: 'Two approved budgets take effect from 2026-07 for Dragon Roofing Pty Ltd, so the report cannot choose between them.',
    })
  })
})
