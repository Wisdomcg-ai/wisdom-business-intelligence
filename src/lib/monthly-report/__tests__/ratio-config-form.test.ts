/**
 * The Ratio Analysis settings panel's form ⇄ config mapping.
 *
 * The reference case is Urban Road's "COGS Tables" page, exactly as it is to be
 * stored: the panel must be able to produce it from a blank page, and opening
 * the panel on it and pressing Apply must write it back byte for byte.
 */
import { describe, it, expect } from 'vitest'
import { parseRatioAnalysisConfig } from '../ratio-table'
import {
  addRatio,
  configFromForm,
  describeReason,
  emptyRatioPageForm,
  filterAccounts,
  formFromWidget,
  hasUnrecognised,
  moveRatio,
  otherAverages,
  ratioCount,
  removeRatio,
  setPageAverage,
  setRatioNoAverages,
  toggleAccount,
  updateOperand,
  updateRatio,
  validateRatioForm,
  withAverage,
  withoutUnrecognised,
  MAX_RATIOS,
  type RatioPageForm,
} from '../ratio-config-form'
import { URBAN_ROAD_CONFIG, URBAN_ROAD_TITLE } from './ratio-config-fixture'

function applied(form: RatioPageForm) {
  const verdict = validateRatioForm(form)
  if (!verdict.ok) throw new Error(`expected a valid form, got: ${verdict.reason}`)
  return verdict
}

describe('Urban Road — the reference config', () => {
  it('opening the panel on it and pressing Apply writes it back byte-identical', () => {
    const { form, notes } = formFromWidget(URBAN_ROAD_CONFIG, URBAN_ROAD_TITLE)
    expect(notes).toEqual([])
    const first = applied(form)
    expect(first.config).toEqual(URBAN_ROAD_CONFIG)
    expect(JSON.stringify(first.config)).toBe(JSON.stringify(URBAN_ROAD_CONFIG))
    expect(first.titleOverride).toBe(URBAN_ROAD_TITLE)

    // …and again from what was written: a second open/Apply changes nothing.
    const second = applied(formFromWidget(first.config, first.titleOverride).form)
    expect(JSON.stringify(second.config)).toBe(JSON.stringify(first.config))
    expect(second.titleOverride).toBe(URBAN_ROAD_TITLE)
  })

  it('is built from a blank page by the panel’s own edits, exactly', () => {
    let f = emptyRatioPageForm()
    // A blank page is not appliable: ratio 1 has no name and nothing on top.
    expect(validateRatioForm(f).ok).toBe(false)

    f = { ...f, title: 'COGS Tables' }
    // The page defaults (3 months, 6- and 3-month averages, amounts on) are
    // already what Urban Road wants; nothing to tick.
    f = updateRatio(f, 0, { label: 'Freight % Income' })
    f = toggleAccount(f, 0, 'numerator', '55000', true)
    f = updateOperand(f, 0, 'numerator', { label: 'Freight to Customer' })
    // The bottom line of a new ratio starts as Total Income.

    f = addRatio(f)
    f = updateRatio(f, 1, { label: "Poster's COGS % of Poster's Income" })
    f = toggleAccount(f, 1, 'numerator', '51150', true)
    f = updateOperand(f, 1, 'numerator', { label: "Poster's COGS" })
    f = updateOperand(f, 1, 'denominator', { mode: 'accounts' })
    f = toggleAccount(f, 1, 'denominator', '41700', true)
    f = updateOperand(f, 1, 'denominator', { label: "Poster's Income" })
    f = setRatioNoAverages(f, 1, true)

    const out = applied(f)
    expect(JSON.stringify(out.config)).toBe(JSON.stringify(URBAN_ROAD_CONFIG))
    expect(out.titleOverride).toBe('COGS Tables')
    // And it is a config the PDF accepts.
    expect(parseRatioAnalysisConfig(out.config).ok).toBe(true)
  })
})

describe('averages', () => {
  it('unticking then re-ticking 3 restores [6, 3], widest first', () => {
    expect(withAverage([6, 3], 3, false)).toEqual([6])
    expect(withAverage([6], 3, true)).toEqual([6, 3])
    expect(withAverage([6, 3], 12, true)).toEqual([12, 6, 3])
    expect(withAverage([], 6, true)).toEqual([6])
    expect(withAverage([6, 3], 6, true)).toEqual([6, 3])
  })

  it('a stored order the coach did not touch is kept', () => {
    const config = { ...URBAN_ROAD_CONFIG, trailing_averages: [3, 6] }
    expect(applied(formFromWidget(config, undefined).form).config.trailing_averages).toEqual([3, 6])
  })

  it('a hand-written window with no checkbox survives Apply, and survives ticking another', () => {
    const config = { ...URBAN_ROAD_CONFIG, trailing_averages: [9] }
    const { form } = formFromWidget(config, undefined)
    expect(otherAverages(form.trailing)).toEqual([9])
    expect(applied(form).config.trailing_averages).toEqual([9])
    expect(applied(setPageAverage(form, 6, true)).config.trailing_averages).toEqual([9, 6])
    expect(applied(setPageAverage(form, 12, true)).config.trailing_averages).toEqual([12, 9])
  })

  it('per ratio: absent inherits, [] is none, and a hand-written list is kept', () => {
    const { form } = formFromWidget(URBAN_ROAD_CONFIG, undefined)
    expect(form.ratios[0].trailing).toBeUndefined()
    expect(form.ratios[1].trailing).toEqual([])

    const none = applied(setRatioNoAverages(form, 0, true)).config as typeof URBAN_ROAD_CONFIG
    expect(none.ratios[0]).toHaveProperty('trailing_averages', [])
    const inherit = applied(setRatioNoAverages(form, 1, false)).config as typeof URBAN_ROAD_CONFIG
    expect(inherit.ratios[1]).not.toHaveProperty('trailing_averages')

    const own = { ...URBAN_ROAD_CONFIG, ratios: [{ ...URBAN_ROAD_CONFIG.ratios[0], trailing_averages: [9] }] }
    expect((applied(formFromWidget(own, undefined).form).config as typeof own).ratios[0].trailing_averages).toEqual([9])
  })
})

describe('the round-trip rule', () => {
  it('writes the three page defaults explicitly — the values parse was already filling in', () => {
    const sparse = { ratios: [{ label: 'Freight % Income', numerator: { accounts: ['55000'] }, denominator: { total: 'income' } }] }
    const out = applied(formFromWidget(sparse, undefined).form).config
    expect(out).toEqual({ months_shown: 3, trailing_averages: [6, 3], show_amounts: true, ...sparse })
    // Same page either way.
    const a = parseRatioAnalysisConfig(sparse)
    const b = parseRatioAnalysisConfig(out)
    expect(a.ok && b.ok && a.config).toEqual(b.ok && b.config)
  })

  it('a code no longer in the chart is kept, never dropped', () => {
    const gone = { ...URBAN_ROAD_CONFIG, ratios: [{ ...URBAN_ROAD_CONFIG.ratios[0], numerator: { accounts: ['55000', '59999'] } }] }
    const out = applied(formFromWidget(gone, undefined).form).config as typeof gone
    expect(out.ratios[0].numerator.accounts).toEqual(['55000', '59999'])
  })

  it('blank display names and a blank title are omitted, not stored as empty strings', () => {
    let f = formFromWidget(URBAN_ROAD_CONFIG, '').form
    f = updateOperand(f, 0, 'numerator', { label: '   ' })
    const out = applied(f)
    expect(out.titleOverride).toBeUndefined()
    expect((out.config as typeof URBAN_ROAD_CONFIG).ratios[0].numerator).toEqual({ accounts: ['55000'] })
  })

  it('switching a line between accounts and a total writes only one of them, and keeps the other in hand', () => {
    let f = formFromWidget(URBAN_ROAD_CONFIG, undefined).form
    f = updateOperand(f, 0, 'numerator', { mode: 'total', total: 'cost_of_sales' })
    expect((applied(f).config as any).ratios[0].numerator).toEqual({ total: 'cost_of_sales', label: 'Freight to Customer' })
    f = updateOperand(f, 0, 'numerator', { mode: 'accounts' })
    expect((applied(f).config as any).ratios[0].numerator).toEqual({ accounts: ['55000'], label: 'Freight to Customer' })
  })

  it('keys the panel does not model are carried through — and parse, not the panel, refuses them', () => {
    const future = { ...URBAN_ROAD_CONFIG, footnote: 'x', ratios: [{ ...URBAN_ROAD_CONFIG.ratios[0], colour: 'red' }] }
    const { form } = formFromWidget(future, undefined)
    expect(hasUnrecognised(form)).toBe(true)
    const config = configFromForm(form)
    expect(config).toMatchObject({ footnote: 'x', ratios: [{ colour: 'red' }] })
    const verdict = validateRatioForm(form)
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.reason).toBe((parseRatioAnalysisConfig(config) as { reason: string }).reason)
    // Removing them is a deliberate act, and then it applies.
    expect(validateRatioForm(withoutUnrecognised(form)).ok).toBe(true)
  })

  it('a value of the wrong type is reset with a note, never silently', () => {
    const { form, notes } = formFromWidget({ months_shown: 'three', ratios: 'x' }, undefined)
    expect(form.monthsShown).toBe(3)
    expect(form.ratios).toHaveLength(1)
    expect(notes).toHaveLength(2)
  })

  it('a freshly placed widget (no config) opens as a blank page with one ratio', () => {
    const { form, notes } = formFromWidget(undefined, undefined)
    expect(notes).toEqual([])
    expect(form.ratios).toHaveLength(1)
    expect(configFromForm(form)).toEqual({
      months_shown: 3,
      trailing_averages: [6, 3],
      show_amounts: true,
      ratios: [{ label: '', numerator: { accounts: [] }, denominator: { total: 'income' } }],
    })
  })
})

describe('validation is parseRatioAnalysisConfig, reworded', () => {
  it('an invalid form carries parse’s reason verbatim', () => {
    const f = emptyRatioPageForm()
    const verdict = validateRatioForm(f)
    const direct = parseRatioAnalysisConfig(configFromForm(f))
    expect(verdict.ok).toBe(false)
    expect(direct.ok).toBe(false)
    expect(!verdict.ok && verdict.reason).toBe(!direct.ok && direct.reason)
  })

  it('months shown outside 1–6 is refused by the schema, not by the panel', () => {
    const f = { ...formFromWidget(URBAN_ROAD_CONFIG, undefined).form, monthsShown: 9 }
    const verdict = validateRatioForm(f)
    expect(!verdict.ok && verdict.reason).toBe('months_shown: Too big: expected number to be <=6')
    expect(describeReason(!verdict.ok ? verdict.reason : '')).toBe('Months shown can be at most 6')
  })

  it('rewords paths and zod messages for a coach', () => {
    expect(describeReason('ratios.0.label: Too small: expected string to have >=1 characters')).toBe('Ratio 1 — name is blank')
    expect(describeReason('ratios.1.numerator.accounts: Too small: expected array to have >=1 items'))
      .toBe('Ratio 2 — top line — accounts needs at least one')
    expect(describeReason('ratios.0.denominator.accounts.2: not a Xero account code'))
      .toBe('Ratio 1 — bottom line — account 3 not a Xero account code')
    expect(describeReason('ratios.0.numerator.label: Too big: expected string to have <=80 characters'))
      .toBe('Ratio 1 — top line — display name is longer than 80 characters')
    expect(describeReason('Unrecognized key: "footnote"')).toBe('The settings includes a setting this page does not recognise ("footnote")')
    expect(describeReason('ratios: Too small: expected array to have >=1 items')).toBe('Ratios needs at least one')
  })
})

describe('edits', () => {
  it('add stops at four; remove and move keep every other ratio as it was', () => {
    let f = formFromWidget(URBAN_ROAD_CONFIG, undefined).form
    f = addRatio(addRatio(f))
    expect(f.ratios).toHaveLength(MAX_RATIOS)
    expect(addRatio(f)).toBe(f)

    const moved = moveRatio(formFromWidget(URBAN_ROAD_CONFIG, undefined).form, 1, -1)
    const out = applied(moved).config as typeof URBAN_ROAD_CONFIG
    expect(out.ratios.map((r) => r.label)).toEqual(["Poster's COGS % of Poster's Income", 'Freight % Income'])
    expect(out.ratios[0]).toEqual(URBAN_ROAD_CONFIG.ratios[1])
    expect(moveRatio(moved, 0, -1)).toBe(moved)

    const removed = applied(removeRatio(formFromWidget(URBAN_ROAD_CONFIG, undefined).form, 0)).config
    expect(removed.ratios).toEqual([URBAN_ROAD_CONFIG.ratios[1]])
  })

  it('ticking an account twice does not add it twice', () => {
    let f = emptyRatioPageForm()
    f = toggleAccount(f, 0, 'numerator', '55000', true)
    f = toggleAccount(f, 0, 'numerator', '55000', true)
    expect(f.ratios[0].numerator.accounts).toEqual(['55000'])
    f = toggleAccount(f, 0, 'numerator', '55000', false)
    expect(f.ratios[0].numerator.accounts).toEqual([])
  })

  it('account search matches name or code, case-insensitively', () => {
    const accounts = [
      { code: '41700', name: 'Posters (41700)', bucket: 'income' as const },
      { code: '51150', name: 'Posters', bucket: 'cost_of_sales' as const },
      { code: '55000', name: 'Freight to Customer', bucket: 'cost_of_sales' as const },
    ]
    expect(filterAccounts(accounts, 'poster').map((a) => a.code)).toEqual(['41700', '51150'])
    expect(filterAccounts(accounts, '550').map((a) => a.code)).toEqual(['55000'])
    expect(filterAccounts(accounts, '  ')).toHaveLength(3)
  })

  it('ratioCount reads a stored config for the canvas card', () => {
    expect(ratioCount(URBAN_ROAD_CONFIG)).toBe(2)
    expect(ratioCount(undefined)).toBe(0)
    expect(ratioCount({ ratios: 'x' })).toBe(0)
  })
})
