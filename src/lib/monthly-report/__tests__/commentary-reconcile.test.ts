/**
 * The account names and figures are Urban Road's August 2026 snapshot, which
 * carried 23 commentary rows of which 21 had a variance of exactly $0.
 */
import { describe, it, expect } from 'vitest'
import { applyCoachNote, reconcileCommentary } from '../commentary-reconcile'
import type { VarianceCommentary } from '@/app/finances/monthly-report/types'

const entry = (over: Partial<VarianceCommentary[string]> = {}): VarianceCommentary[string] => ({
  vendor_summary: [],
  coach_note: '',
  is_edited: false,
  ...over,
})

describe('reconcileCommentary', () => {
  it('drops an account that no longer triggers', () => {
    // Freight to Customer triggered against the old forecast and has sat in the
    // map ever since, printing "$0 over budget" on a line where actual and
    // budget are both 50,924.95.
    const existing: VarianceCommentary = {
      'Freight to Customer': entry({ vendor_summary: [{ vendor_name: 'Sendle', amount: 4200 }] as never }),
      'Contractors excl. Artists': entry(),
    }
    const fresh: VarianceCommentary = { 'Contractors excl. Artists': entry() }

    expect(Object.keys(reconcileCommentary(fresh, existing))).toEqual(['Contractors excl. Artists'])
  })

  it('clears every row when nothing triggers this month', () => {
    const existing: VarianceCommentary = { Posters: entry(), 'Office Expenses': entry() }
    expect(reconcileCommentary({}, existing)).toEqual({})
  })

  it('keeps a coach note in a month when nothing triggers at all', () => {
    // The page's no-trigger path now goes through here. It used to clear the
    // map outright, taking the notes with it — and a note that REPLACES the
    // draft is the whole bullet.
    const existing: VarianceCommentary = { Posters: entry({ coach_note: 'No PMI invoice yet.' }), 'Office Expenses': entry() }
    expect(reconcileCommentary({}, existing)).toEqual({
      Posters: { vendor_summary: [], coach_note: 'No PMI invoice yet.', is_edited: true, detail_tab_ref: null },
    })
  })

  it('puts the coach note back on an account that still triggers', () => {
    const existing: VarianceCommentary = {
      'IT Costs Software': entry({ coach_note: 'Two Figma seats we no longer use.', is_edited: true }),
    }
    const fresh: VarianceCommentary = {
      'IT Costs Software': entry({
        vendor_summary: [{ vendor_name: 'Figma', amount: 1180 }] as never,
        draft_note: 'IT Costs Software $14,726 — Figma $1,180…',
      }),
    }
    const out = reconcileCommentary(fresh, existing)
    expect(out['IT Costs Software'].coach_note).toBe('Two Figma seats we no longer use.')
    expect(out['IT Costs Software'].is_edited).toBe(true)
    // The generated half is the FRESH one, not the one that was stored.
    expect(out['IT Costs Software'].draft_note).toBe('IT Costs Software $14,726 — Figma $1,180…')
  })

  it('keeps a coach note whose account stopped triggering, without its stale facts', () => {
    // A budget revision can take an account under threshold after a coach has
    // written about it. Deleting their sentence would be worse than the bug.
    const existing: VarianceCommentary = {
      'Freight to Customer': entry({
        coach_note: 'Rate rise from 1 July — renegotiate at renewal.',
        is_edited: true,
        vendor_summary: [{ vendor_name: 'Sendle', amount: 4200 }] as never,
        draft_note: 'Freight to Customer $50,925 — Sendle $4,200…',
      }),
    }
    const out = reconcileCommentary({}, existing)
    expect(out['Freight to Customer'].coach_note).toBe('Rate rise from 1 July — renegotiate at renewal.')
    // The vendor list and the draft describe a variance that is no longer there.
    expect(out['Freight to Customer'].vendor_summary).toEqual([])
    expect(out['Freight to Customer'].draft_note).toBeUndefined()
  })

  it('treats a whitespace-only note as no note', () => {
    const existing: VarianceCommentary = { Posters: entry({ coach_note: '   \n ' }) }
    expect(reconcileCommentary({}, existing)).toEqual({})
  })

  it('survives no existing commentary at all', () => {
    const fresh: VarianceCommentary = { 'Contractors excl. Artists': entry() }
    expect(reconcileCommentary(fresh, undefined)).toEqual(fresh)
  })
})

describe('applyCoachNote', () => {
  it('keeps the draft, its halves, its warnings and its trigger when the coach types', () => {
    // Employ - Staff Amenities, August: the draft names the merchants; Calxa's
    // pack prints Matt's words for them instead.
    const prev: VarianceCommentary = {
      'Employ - Staff Amenities': entry({
        trigger_reason: 'expense_over_budget_dollar',
        draft_note: 'Alcotraz ($918), Food ($323) - 0.2% of income against a 0.1% driver',
        draft_facts: 'Alcotraz ($918), Food ($323)',
        draft_clause: '0.2% of income against a 0.1% driver',
        draft_warnings: [],
        detail_tab_ref: null,
      }),
      Rugs: entry({ draft_note: 'Unitex International ($326)' }),
    }
    const next = applyCoachNote(prev, 'Employ - Staff Amenities', 'Team event ($918), staff food and amenities ($323)')
    expect(next['Employ - Staff Amenities']).toEqual({
      ...prev['Employ - Staff Amenities'],
      coach_note: 'Team event ($918), staff food and amenities ($323)',
      is_edited: true,
    })
    expect(next.Rugs).toBe(prev.Rugs)
  })

  it('a note on an account with no row yet starts one', () => {
    expect(applyCoachNote(undefined, 'Posters', 'No PMI invoice yet.')).toEqual({
      Posters: { vendor_summary: [], coach_note: 'No PMI invoice yet.', is_edited: true },
    })
  })
})
