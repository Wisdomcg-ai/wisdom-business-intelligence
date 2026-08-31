/**
 * WD.2 — section-scoped table config resolution.
 *
 * The judgement worth pinning: anything unrecognised falls back to the FULL
 * statement (null), never to an empty table — a mis-typed config must not
 * produce a blank page in a client's pack.
 */
import { describe, it, expect } from 'vitest'
import { resolveSectionFilter, sectionTableTitle } from '../section-table-config'

describe('resolveSectionFilter', () => {
  it('shorthand matches the analysis charts vocabulary', () => {
    expect(resolveSectionFilter({ section: 'income' })).toEqual(['Revenue'])
    expect(resolveSectionFilter({ section: 'cogs' })).toEqual(['Cost of Sales'])
    expect(resolveSectionFilter({ section: 'expense' })).toEqual(['Operating Expenses'])
  })

  it('explicit category lists pass through, invalid entries dropped', () => {
    expect(resolveSectionFilter({ sections: ['Revenue', 'Other Income'] })).toEqual([
      'Revenue',
      'Other Income',
    ])
    expect(resolveSectionFilter({ sections: ['Revenue', 'Not A Section', 42] })).toEqual([
      'Revenue',
    ])
  })

  it('unrecognised or empty configs mean the FULL statement, never an empty table', () => {
    expect(resolveSectionFilter(undefined)).toBeNull()
    expect(resolveSectionFilter({})).toBeNull()
    expect(resolveSectionFilter({ section: 'not-a-thing' })).toBeNull()
    expect(resolveSectionFilter({ sections: [] })).toBeNull()
    expect(resolveSectionFilter({ sections: ['Nope'] })).toBeNull()
  })
})

describe('sectionTableTitle', () => {
  it('single sections get their Calxa-style names', () => {
    expect(sectionTableTitle(['Revenue'])).toBe('Income Analysis')
    expect(sectionTableTitle(['Cost of Sales'])).toBe('COGS Analysis')
    expect(sectionTableTitle(['Operating Expenses'])).toBe('Expenses Analysis')
  })

  it('multi-section filters join their names', () => {
    expect(sectionTableTitle(['Revenue', 'Other Income'])).toBe(
      'Income Analysis + Other Income Analysis',
    )
  })

  it('null filter keeps the default full-statement title', () => {
    expect(sectionTableTitle(null)).toBeNull()
  })
})
