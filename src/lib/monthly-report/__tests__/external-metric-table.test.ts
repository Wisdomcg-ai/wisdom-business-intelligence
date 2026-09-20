/**
 * The external-data page's model (P10: IICT-15, IICT-16, DD-22, DRG-38):
 * an N-month trend with the newest month on the left, a declared row order,
 * subtotal rows that carry the budget, derived measures, and notes.
 *
 * IICT's HubSpot pages are the shape: p3's eight months in Calxa's own order,
 * and p4's August against a budget that sits only on the subtotals — where the
 * widget's old Total row, a sum of every row, would have double-counted.
 */
import { describe, it, expect } from 'vitest'
import { parseExternalMetricConfig, isDefaultExternalMetricConfig, externalMetricWindowForLayout } from '../external-metric-config'
import { buildExternalMetricTable } from '../external-metric-table'
import {
  HUBSPOT_MONTH_CONFIG,
  HUBSPOT_SERIES,
  HUBSPOT_TREND_CONFIG,
  HUBSPOT_VALUES,
} from './fixtures/iict-hubspot-2026'

const config = (raw: unknown) => {
  const parsed = parseExternalMetricConfig(raw)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.config
}
const build = (raw: unknown, series = HUBSPOT_SERIES, month = '2026-08') => {
  const table = buildExternalMetricTable(series as never, config(raw), month)
  if (!table.ok) throw new Error(table.reason)
  return table.table
}
const cell = (table: ReturnType<typeof build>, row: string, measure: string, month = '2026-08') =>
  table.rows.find((r) => r.key === row)!.cells[measure]?.[month]

describe('parseExternalMetricConfig', () => {
  it('with no config, is the page as it always printed: this month, every row, alphabetical', () => {
    const parsed = parseExternalMetricConfig(undefined)
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.config).toEqual({ layout: 'month', months: 6, rows: [], derived_measures: [], notes: [] })
    expect(isDefaultExternalMetricConfig(config({}))).toBe(true)
    expect(isDefaultExternalMetricConfig(config({ series_key: 'hubspot_memberships' }))).toBe(true)
    expect(isDefaultExternalMetricConfig(config(HUBSPOT_TREND_CONFIG))).toBe(false)
  })

  it('names what is wrong instead of printing a page built on a typo', () => {
    const unknownRow = parseExternalMetricConfig({ rows: [{ subtotal: 'Total New Members', of: ['Nobody'] }] })
    expect(unknownRow.ok).toBe(false)
    expect(unknownRow.ok ? '' : unknownRow.reason).toContain('Nobody')
    // A subtotal may only add rows declared above it, or it would add a row twice.
    const forward = parseExternalMetricConfig({
      rows: [{ subtotal: 'Total', of: ['B'] }, { dimension: 'B' }],
    })
    expect(forward.ok).toBe(false)
    const dupe = parseExternalMetricConfig({ rows: [{ dimension: 'A' }, { dimension: 'A' }] })
    expect(dupe.ok).toBe(false)
    const badMonths = parseExternalMetricConfig({ layout: 'trend', months: 36 })
    expect(badMonths.ok).toBe(false)
  })

  it('loads the widest trend any placement asks for, and one month when none is placed', () => {
    expect(externalMetricWindowForLayout([], '2026-08')).toBe(1)
    expect(externalMetricWindowForLayout([{ type: 'external_metric' }], '2026-08')).toBe(1)
    expect(externalMetricWindowForLayout([{ type: 'external_metric', config: HUBSPOT_TREND_CONFIG }, { type: 'memo' }], '2026-08')).toBe(8)
    // A config that does not parse loads the month, and its page prints the reason.
    expect(externalMetricWindowForLayout([{ type: 'external_metric', config: { layout: 'trend', months: 'eight' } }], '2026-08')).toBe(1)
  })
})

describe("IICT's HubSpot trend — Calxa p3", () => {
  const table = () => build(HUBSPOT_TREND_CONFIG)

  it('runs eight months with the newest on the left', () => {
    expect(table().months).toEqual(['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'])
  })

  it("keeps Calxa's row order, not the alphabet", () => {
    expect(table().rows.map((r) => r.label)).toEqual([
      'New Members / Subscribe (AU & NZ)',
      'New Members / Subscribe (Outside AU & NZ)',
      'Total New Members',
      'Renew Members (AU & NZ)',
      'Renew Members (Outside AU & NZ)',
      'Upgrade Members',
      'Downgrade Members',
      'Total Renewing members',
      'Total Members',
      'Avg. Membership Rate',
    ])
    expect(table().rows.map((r) => r.kind)).toEqual(
      ['dimension', 'dimension', 'subtotal', 'dimension', 'dimension', 'dimension', 'dimension', 'subtotal', 'subtotal', 'line'])
  })

  it('adds each subtotal from its own rows, in every month', () => {
    const t = table()
    expect(cell(t, 'Total New Members', 'members')!.actual).toBe(278)
    expect(cell(t, 'Total Renewing members', 'members')!.actual).toBe(882)
    expect(cell(t, 'Total Members', 'members')!.actual).toBe(1160)
    expect(cell(t, 'Total Members', 'revenue')!.actual).toBe(243091)
    // January, at the other end of the page.
    expect(cell(t, 'Total Members', 'members', '2026-01')!.actual).toBe(928)
    expect(cell(t, 'Total Members', 'revenue', '2026-01')!.actual).toBe(194250)
    expect(cell(t, 'Total Renewing members', 'revenue', '2026-06')!.actual).toBe(237670)
  })

  it('the Avg. Membership Rate line is the subtotal divided, not an average of averages', () => {
    const t = table()
    expect(cell(t, 'Avg. Membership Rate', 'revenue')!.actual).toBeCloseTo(243091 / 1160, 6)
    expect(cell(t, 'Avg. Membership Rate', 'revenue', '2026-06')!.actual).toBeCloseTo(290331 / 1417, 6)
    // It belongs under the dollars only: the member columns leave it blank.
    expect(t.rows.find((r) => r.key === 'Avg. Membership Rate')!.under).toBe('revenue')
    expect(cell(t, 'Avg. Membership Rate', 'members')).toBeUndefined()
  })

  it('carries the page notes', () => {
    expect(build(HUBSPOT_TREND_CONFIG).notes).toEqual([])
    expect(config(HUBSPOT_TREND_CONFIG).notes[0]).toContain('insurance premiums')
  })
})

describe("IICT's Forecast vs HubSpot — Calxa p4", () => {
  const table = () => build(HUBSPOT_MONTH_CONFIG)

  it('is one month, and the budget sits on the subtotals only', () => {
    const t = table()
    expect(t.months).toEqual(['2026-08'])
    expect(cell(t, 'Total New Members', 'members')).toEqual({ actual: 278, budget: 181 })
    expect(cell(t, 'New Members / Subscribe (AU & NZ)', 'members')).toEqual({ actual: 220, budget: null })
    expect(cell(t, 'Total Renewing members', 'revenue')).toEqual({ actual: 191299, budget: 176820 })
  })

  it('adds the budget of a subtotal made of subtotals — Total Members 1,023 and $214,830', () => {
    const t = table()
    expect(cell(t, 'Total Members', 'members')).toEqual({ actual: 1160, budget: 1023 })
    expect(cell(t, 'Total Members', 'revenue')).toEqual({ actual: 243091, budget: 214830 })
  })

  it('the budgeted average rate is the budget divided — $210, the variance Calxa leaves blank is $28,261', () => {
    const t = table()
    const rate = cell(t, 'Avg. Membership Rate', 'revenue')!
    expect(rate.budget).toBeCloseTo(214830 / 1023, 6)
    expect(Math.round(rate.budget as number)).toBe(210)
    expect(Math.round(rate.actual as number)).toBe(210)
    const members = cell(t, 'Total Members', 'revenue')!
    expect(Math.round((members.actual as number) - (members.budget as number))).toBe(28261)
  })
})

describe('what the page will not do quietly', () => {
  it('names a measure the series does not have, rather than printing an empty column', () => {
    const bad = buildExternalMetricTable(HUBSPOT_SERIES as never, config({ measures: ['members', 'seats'] }), '2026-08')
    expect(bad.ok).toBe(false)
    expect(bad.ok ? '' : bad.reason).toContain('seats')
    const badDerived = buildExternalMetricTable(HUBSPOT_SERIES as never, config({
      derived_measures: [{ key: 'rate', label: 'Rate', op: 'divide', left: 'revenue', right: 'headcount' }],
    }), '2026-08')
    expect(badDerived.ok ? '' : (badDerived as { reason: string }).reason).toContain('headcount')
  })

  it('says when a stored row is not on the page, so nothing entered disappears in silence', () => {
    const t = build({ rows: [{ dimension: 'Upgrade Members' }] })
    expect(t.notes.join(' ')).toContain('Entered this month but not on this page: Downgrade Members')
  })

  it('a subtotal is the sum of its rows: an actual entered against it is not printed, and the page says so', () => {
    const series = {
      ...HUBSPOT_SERIES,
      values: [
        ...HUBSPOT_SERIES.values,
        { period_month: '2026-08', dimension_value: 'Total New Members', measure_key: 'members', scenario: 'actual', value: 999 },
      ],
    }
    const t = build(HUBSPOT_MONTH_CONFIG, series as never)
    expect(cell(t, 'Total New Members', 'members')!.actual).toBe(278)
    expect(t.notes.join(' ')).toContain('Total New Members')
  })

  it('says when only this month was loaded, rather than printing seven blank months as fact', () => {
    const monthOnly = { ...HUBSPOT_SERIES, history: undefined }
    const t = build(HUBSPOT_TREND_CONFIG, monthOnly as never)
    expect(cell(t, 'Total Members', 'members')!.actual).toBe(1160)
    expect(cell(t, 'Total Members', 'members', '2026-07')).toEqual({ actual: null, budget: null })
    expect(t.notes.join(' ')).toContain('Only this month’s figures were loaded')
  })

  it('a month with nothing entered is a dash, never a zero', () => {
    const t = build({ ...HUBSPOT_TREND_CONFIG, months: 10 })
    expect(t.months).toHaveLength(10)
    expect(cell(t, 'Total Members', 'members', '2025-11')).toEqual({ actual: null, budget: null })
    expect(cell(t, 'New Members / Subscribe (AU & NZ)', 'members', '2025-11')).toEqual({ actual: null, budget: null })
  })

  it('divides by nothing rather than printing a rate of zero', () => {
    const series = { ...HUBSPOT_SERIES, values: [], history: [] }
    const t = build(HUBSPOT_MONTH_CONFIG, series as never)
    expect(cell(t, 'Avg. Membership Rate', 'revenue')).toEqual({ actual: null, budget: null })
  })
})

describe('a trend with no declared rows', () => {
  it('is every stored row, alphabetical, with a Total that sums them — the page as it prints today, month by month', () => {
    const actualsOnly = { ...HUBSPOT_SERIES, history: HUBSPOT_VALUES, values: HUBSPOT_VALUES.filter((v) => v.period_month === '2026-08') }
    const t = build({ layout: 'trend', months: 3 }, actualsOnly as never)
    expect(t.months).toEqual(['2026-08', '2026-07', '2026-06'])
    expect(t.rows.map((r) => r.label)).toEqual([
      'Downgrade Members',
      'New Members / Subscribe (AU & NZ)',
      'New Members / Subscribe (Outside AU & NZ)',
      'Renew Members (AU & NZ)',
      'Renew Members (Outside AU & NZ)',
      'Upgrade Members',
      'Total',
    ])
    expect(cell(t, 'Total', 'members')!.actual).toBe(1160)
    expect(cell(t, 'Total', 'members', '2026-07')!.actual).toBe(1191)
    expect(t.notes).toEqual([])
  })
})
