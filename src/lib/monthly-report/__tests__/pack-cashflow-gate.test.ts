/**
 * sections.cashflow and the layout decide whether a pack carries the cashflow
 * — and therefore whether the export builds one at all.
 *
 * Fleet on 16 Sep 2026 (monthly_report_settings): the flag is off for Armstrong
 * & Co, Attaquer, Digital Bond, Dragon Roofing, IICT Group, Sydney Pressed
 * Metal and Wisdom BI (IICT's duplicate), none of which has a saved layout, so
 * each got the v1 cashflow pages whenever its forecast produced months. On for
 * Distinct Directions, Envisage, Just Digital Signage, Precision and Urban Road
 * (whose saved layout places both cash pages).
 */
import { describe, it, expect } from 'vitest'
import { packLoadsCashflow, packPrintsCashflowPages, layoutInForce } from '../pack-cashflow-gate'
import { DEFAULT_SECTIONS } from '@/app/finances/monthly-report/types'
import type { PDFLayout, WidgetType } from '@/app/finances/monthly-report/types/pdf-layout'

const layoutWith = (...types: WidgetType[]): PDFLayout => ({
  version: 1,
  pages: [{ id: 'p1', orientation: 'landscape', widgets: types.map((type, i) => ({ id: `w${i}`, type, col: 0, row: i, colSpan: 3, rowSpan: 1 })) }],
})

describe('the legacy page order reads the flag', () => {
  it('off (Dragon, IICT): no pages and nothing to load', () => {
    const sections = { ...DEFAULT_SECTIONS, cashflow: false }
    expect(packPrintsCashflowPages(sections, null)).toBe(false)
    expect(packLoadsCashflow(sections, null)).toBe(false)
  })

  it('on (Distinct Directions): pages, and loaded', () => {
    const sections = { ...DEFAULT_SECTIONS, cashflow: true }
    expect(packPrintsCashflowPages(sections, null)).toBe(true)
    expect(packLoadsCashflow(sections, null)).toBe(true)
  })

  it('no settings at all is off', () => {
    expect(packPrintsCashflowPages(undefined, undefined)).toBe(false)
    expect(packLoadsCashflow(null, null)).toBe(false)
  })

  it('a cash chart flag loads the cashflow without opening the cash pages', () => {
    const sections = { ...DEFAULT_SECTIONS, cashflow: false, chart_working_capital_gap: true }
    expect(packPrintsCashflowPages(sections, null)).toBe(false)
    expect(packLoadsCashflow(sections, null)).toBe(true)
  })

  it('a layout with no widgets is not in force (Envisage stores empty pages) — the flag decides', () => {
    const empty: PDFLayout = { version: 1, pages: [{ id: 'p1', orientation: 'portrait', widgets: [] }] }
    expect(layoutInForce(empty)).toBe(false)
    expect(packPrintsCashflowPages({ ...DEFAULT_SECTIONS, cashflow: true }, empty)).toBe(true)
  })
})

describe('a saved layout decides by placement', () => {
  it('placing the table or the chart is opting in, with the flag off', () => {
    const sections = { ...DEFAULT_SECTIONS, cashflow: false }
    expect(packPrintsCashflowPages(sections, layoutWith('executive_summary', 'cashflow_forecast_table'))).toBe(true)
    expect(packPrintsCashflowPages(sections, layoutWith('chart_cashflow_forecast'))).toBe(true)
    expect(packLoadsCashflow(sections, layoutWith('chart_cashflow_forecast'))).toBe(true)
  })

  it('a layout that places neither prints none, with the flag on (Urban Road keeps its pages by placing them)', () => {
    const sections = { ...DEFAULT_SECTIONS, cashflow: true }
    expect(packPrintsCashflowPages(sections, layoutWith('executive_summary', 'money_flow'))).toBe(false)
    expect(packLoadsCashflow(sections, layoutWith('executive_summary', 'money_flow'))).toBe(false)
    expect(packPrintsCashflowPages(sections, layoutWith('chart_cashflow_forecast', 'cashflow_forecast_table', 'money_flow'))).toBe(true)
  })

  it('a placed cash chart loads the cashflow but is not a cash page', () => {
    const layout = layoutWith('executive_summary', 'chart_cash_runway')
    expect(packPrintsCashflowPages({ ...DEFAULT_SECTIONS, cashflow: false }, layout)).toBe(false)
    expect(packLoadsCashflow({ ...DEFAULT_SECTIONS, cashflow: false }, layout)).toBe(true)
  })
})
