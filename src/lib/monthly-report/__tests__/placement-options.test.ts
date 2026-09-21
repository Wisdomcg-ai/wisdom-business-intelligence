/**
 * The presentation options a placed cover, summary or money-flow page carries,
 * and the reading of each the PDF applies. Every option's default is the page
 * as it printed before the option existed.
 */
import { describe, it, expect } from 'vitest'
import {
  PLACEMENT_OPTIONS,
  applyPlacementOptions,
  coverReconciliationLine,
  hasPlacementOptions,
  placementOptionsSummary,
  readPlacementOptions,
  summaryMargins,
} from '../placement-options'
import { MONEY_FLOW_BANK_ROWS, MONEY_FLOW_LAST_LINES, MONEY_FLOW_SUMMARY_CODES, parseMoneyFlowConfig } from '../money-flow-rows'
import { parseConsolidatedPLConfig } from '../consolidated-pl-page'
import { parseSubscriptionPageConfig } from '../subscription-page'
import { parseContractorPageConfig } from '../contractor-page'

describe('the readers the PDF applies', () => {
  it("a cover prints the report's own line unless it asks for the badge", () => {
    expect(coverReconciliationLine(undefined)).toBe('standard')
    expect(coverReconciliationLine({})).toBe('standard')
    expect(coverReconciliationLine({ reconciliation_line: 'xero_badge' })).toBe('xero_badge')
    // Anything else is the old line — a cover has nowhere to print a config error.
    expect(coverReconciliationLine({ reconciliation_line: 'Xero_Badge' })).toBe('standard')
  })

  it('a summary prints both margins unless it asks for fewer', () => {
    expect(summaryMargins(undefined)).toBe('both')
    expect(summaryMargins({ margins: 'net_only' })).toBe('net_only')
    expect(summaryMargins({ margins: 'none' })).toBe('none')
    expect(summaryMargins({ margins: 'gross' })).toBe('both')
  })
})

describe('the panel', () => {
  it('offers the pages that carry options, and no other', () => {
    expect(hasPlacementOptions('cover_page')).toBe(true)
    expect(hasPlacementOptions('executive_summary')).toBe(true)
    expect(hasPlacementOptions('money_flow')).toBe(true)
    // P7's pages: the per-entity P&L, the subscriptions sheet, the contractors.
    expect(hasPlacementOptions('consolidated_pl')).toBe(true)
    expect(hasPlacementOptions('subscription_detail')).toBe(true)
    expect(hasPlacementOptions('contractor_detail')).toBe(true)
    expect(hasPlacementOptions('ratio_analysis')).toBe(false)
    expect(hasPlacementOptions('budget_vs_actual')).toBe(false)
  })

  it("offers exactly the values each P7 page's own strict rule accepts", () => {
    const pages = {
      consolidated_pl: (config: Record<string, unknown>) => parseConsolidatedPLConfig({ layout: 'calxa', ...config }).ok,
      subscription_detail: (config: Record<string, unknown>) => parseSubscriptionPageConfig({ layout: 'calxa', ...config }).ok,
      contractor_detail: (config: Record<string, unknown>) => parseContractorPageConfig(config).ok,
    } as const
    for (const [type, accepts] of Object.entries(pages)) {
      for (const option of PLACEMENT_OPTIONS[type as keyof typeof pages].options) {
        for (const choice of option.choices) {
          expect(accepts({ [option.key]: choice.value }), `${type}.${option.key}=${choice.value}`).toBe(true)
        }
      }
    }
  })

  it('stores only what a coach changed, and keeps the settings the panel does not show', () => {
    // The sheet's labels and total_budget are typed by hand; Apply keeps them.
    const stored = { layout: 'calxa', total_budget: 'approved', labels: { anthropic: 'Claude' } }
    expect(applyPlacementOptions('subscription_detail', stored, { layout: 'calxa', entity_columns: 'actuals' }))
      .toEqual({ total_budget: 'approved', labels: { anthropic: 'Claude' }, layout: 'calxa', entity_columns: 'actuals' })
    // Back to the page it was: nothing of the panel's is stored.
    expect(applyPlacementOptions('subscription_detail', stored, { layout: 'accounts', entity_columns: 'none' }))
      .toEqual({ total_budget: 'approved', labels: { anthropic: 'Claude' } })
    expect(placementOptionsSummary('consolidated_pl', { layout: 'calxa', section: 'income', columns: 'actuals' }))
      .toBe('Calxa P&L Comparison · Income only · Actuals only')
    expect(placementOptionsSummary('consolidated_pl', {})).toBe('Standard')
  })

  it("offers exactly the money-flow values the page's own strict rule accepts", () => {
    const lists: Record<string, readonly string[]> = {
      last_line: MONEY_FLOW_LAST_LINES,
      summary_codes: MONEY_FLOW_SUMMARY_CODES,
      bank_rows: MONEY_FLOW_BANK_ROWS,
    }
    expect(PLACEMENT_OPTIONS.money_flow.options.map((o) => o.key)).toEqual(Object.keys(lists))
    for (const option of PLACEMENT_OPTIONS.money_flow.options) {
      expect(option.choices.map((c) => c.value)).toEqual([...lists[option.key]])
      expect(option.default).toBe(lists[option.key][0])
      for (const choice of option.choices) {
        expect(parseMoneyFlowConfig({ [option.key]: choice.value }).ok, `${option.key}=${choice.value}`).toBe(true)
      }
      expect(parseMoneyFlowConfig({ [option.key]: 'not-a-choice' }).ok).toBe(false)
    }
  })

  it('reads a stored config into the choices, naming what it cannot show', () => {
    expect(readPlacementOptions('money_flow', undefined)).toEqual({
      values: { last_line: 'reconciliation', summary_codes: 'plain', bank_rows: 'all' },
      unrecognised: [],
      invalid: [],
    })
    const read = readPlacementOptions('money_flow', { last_line: 'surplus', lastLine: 'surplus', summary_codes: 'numbers' })
    expect(read.values).toEqual({ last_line: 'surplus', summary_codes: 'plain', bank_rows: 'all' })
    expect(read.unrecognised).toEqual(['lastLine'])
    expect(read.invalid).toEqual(['summary_codes'])
  })

  it('stores only what differs from the default, and keeps keys it does not own unless told', () => {
    expect(applyPlacementOptions('executive_summary', undefined, { margins: 'both' })).toEqual({})
    expect(applyPlacementOptions('executive_summary', { margins: 'none' }, { margins: 'both' })).toEqual({})
    expect(applyPlacementOptions('executive_summary', {}, { margins: 'net_only' })).toEqual({ margins: 'net_only' })
    expect(applyPlacementOptions('cover_page', { note: 'x' }, { reconciliation_line: 'xero_badge' }))
      .toEqual({ note: 'x', reconciliation_line: 'xero_badge' })
    expect(applyPlacementOptions('cover_page', { note: 'x' }, { reconciliation_line: 'xero_badge' }, { dropUnrecognised: true }))
      .toEqual({ reconciliation_line: 'xero_badge' })
    // A choice the panel does not offer is never written.
    expect(applyPlacementOptions('money_flow', {}, { last_line: 'Surplus', bank_rows: 'moved' })).toEqual({ bank_rows: 'moved' })
    // An invalid stored value the panel could not show is replaced, not kept.
    expect(applyPlacementOptions('money_flow', { summary_codes: 'numbers' }, { summary_codes: 'plain' })).toEqual({})
  })

  it("the canvas line names what is set, or says it is the page's usual", () => {
    expect(placementOptionsSummary('cover_page', undefined)).toBe('Standard')
    expect(placementOptionsSummary('cover_page', { reconciliation_line: 'xero_badge' })).toBe('Reconciliation from the Xero badge')
    expect(placementOptionsSummary('executive_summary', { margins: 'none' })).toBe('No margins')
    expect(placementOptionsSummary('money_flow', { last_line: 'surplus', bank_rows: 'moved' })).toBe('Last line repeats the surplus · Moved bank accounts only')
    // The page prints a configuration error for these, so the canvas says so first.
    expect(placementOptionsSummary('money_flow', { lastLine: 'surplus' })).toBe('Settings need attention')
    expect(placementOptionsSummary('money_flow', { last_line: 'Surplus' })).toBe('Settings need attention')
    // A cover reads leniently: a stray key changes nothing it prints.
    expect(placementOptionsSummary('cover_page', { note: 'x' })).toBe('Standard')
  })
})
