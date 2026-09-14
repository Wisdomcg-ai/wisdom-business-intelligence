/**
 * The cash pages on cash model v2, rendered on Urban Road's real ledger and
 * read back off the PDF: each month says whether it is Actual or Budget, the
 * basis says which half is the bank's, and a model that cannot be built prints
 * why instead of falling out of the pack — or back to v1.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns } from './pdf-pack-fixture'
import { buildPackCashModel } from '@/lib/monthly-report/pack-cash-model'
import { buildPackCashflowForecast, packCashflowBasisFor } from '@/lib/monthly-report/pack-cashflow'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from '@/lib/monthly-report/__tests__/urban-road-full-year-fixture'
import { UR_ACCOUNTS, UR_BANK_IDS, UR_BS_ROWS, UR_CREDIT_CARD_IDS, UR_PAY_RUNS, UR_PL_ROWS } from '@/lib/monthly-report/__tests__/urban-road-ledger-fixture'
import { urbanRoadCashModel } from '@/lib/monthly-report/__tests__/urban-road-cash-model-config'
import type { FinancialForecast } from '@/app/finances/forecast/types'

function pagesOf(options: Record<string, unknown>): string[][] {
  const report = fixtureReport()
  report.settings = { ...report.settings, expense_group_order: UR_EXPENSE_GROUP_ORDER }
  const doc: any = new MonthlyReportPDFService(report, { businessName: 'Urban Road', ...options } as any).generate()
  const pages: string[][] = []
  for (let i = 1; i <= doc.getNumberOfPages(); i++) pages.push(textRuns(doc, i).map((r) => r.replace(/\\([()\\])/g, '$1')))
  return pages
}

const cashPages = (pages: string[][]) => pages.filter((runs) => runs.some((r) => r.startsWith('Cashflow Forecast')) || runs.includes('Bank at End') || runs.includes('Liability'))

describe('cash pages — cash model v2', () => {
  const model = buildPackCashModel({
    fullYear: urbanRoadFullYear(),
    reportMonth: '2026-08',
    config: urbanRoadCashModel(),
    inputs: {
      bsRows: UR_BS_ROWS, plRows: UR_PL_ROWS, accounts: UR_ACCOUNTS, payRuns: UR_PAY_RUNS,
      bankAccountIds: UR_BANK_IDS, creditCardAccountIds: UR_CREDIT_CARD_IDS, fiscalYearStart: 7,
    },
  })
  if (model.status !== 'ready') throw new Error(model.reason)
  const pages = pagesOf({ cashflowForecast: model.cashflow, cashflowBasis: packCashflowBasisFor(urbanRoadFullYear(), '2026-08', model.cashflow) })
  const table = cashPages(pages).filter((runs) => runs.includes('Total'))

  it('labels every month column Actual or Budget on every table page', () => {
    expect(table.length).toBeGreaterThan(0)
    for (const runs of table) {
      expect(runs.filter((r) => r === 'Actual')).toHaveLength(2)
      expect(runs.filter((r) => r === 'Budget')).toHaveLength(10)
    }
  })

  it('prints August\'s Net Movement as the money-flow page\'s (31,708) and September opening on 117,725', () => {
    const all = table.flat()
    expect(all).toContain('(31,708)')
    expect(all).toContain('117,725')
  })

  it('prints the v2 basis — actual cash, apportioned rows — not v1\'s "cash timing estimated"', () => {
    const text = cashPages(pages).flat().join(' ')
    expect(text).toContain('actual cash from the bank and balance sheet')
    expect(text).not.toContain('cash timing estimated')
  })
})

describe('cash pages — v1 unchanged', () => {
  it('a cashflow without a cash model prints one header row, no Actual/Budget labels', () => {
    const fullYear = urbanRoadFullYear()
    const cf = buildPackCashflowForecast({
      fullYear, reportMonth: '2026-08',
      forecast: { id: 'f', business_id: 'b', user_id: 'u', name: 'FY2027', fiscal_year: 2027, year_type: 'FY', actual_start_month: '2026-07', actual_end_month: '2026-08', forecast_start_month: '2026-09', forecast_end_month: '2027-06' } as FinancialForecast,
      forecastLines: [], savedAssumptions: null, opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    const table = cashPages(pagesOf({ cashflowForecast: cf, cashflowBasis: packCashflowBasisFor(fullYear, '2026-08', cf) })).filter((runs) => runs.includes('Total'))
    expect(table.length).toBe(3)
    for (const runs of table) {
      expect(runs).not.toContain('Actual')
      expect(runs).not.toContain('Budget')
    }
  })
})

describe('cash pages — a cash model that could not be built', () => {
  it('prints the page and the reason, never v1 and never nothing', () => {
    const pages = pagesOf({ cashflowReason: 'Jul 2026: The stored balance sheet for 2026-06 doesn\'t balance (off by 5000)' })
    const cash = pages.filter((runs) => runs.some((r) => r.startsWith('Cashflow Forecast')))
    expect(cash).toHaveLength(1)
    const text = cash[0].join(' ')
    expect(text).toContain('The cashflow is not available for this month')
    expect(text).toContain('off by 5000')
    expect(text).not.toContain('Bank at Beginning')
  })

  it('a layout placing both the chart and the table prints the reason once, not twice', () => {
    const pdfLayout = {
      version: 1,
      pages: [
        { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
        { id: 'p2', orientation: 'landscape', widgets: [{ id: 'chart', type: 'chart_cashflow_forecast', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
        { id: 'p3', orientation: 'landscape', widgets: [{ id: 'table', type: 'cashflow_forecast_table', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
      ],
    }
    const pages = pagesOf({ pdfLayout, cashflowReason: 'the debtors account 905e1394-typo is not on the balance sheet' })
    const reasons = pages.filter((runs) => runs.join(' ').includes('The cashflow is not available for this month'))
    expect(reasons).toHaveLength(1)
    // And no blank page where the chart would have been: the summary and the reason.
    expect(pages).toHaveLength(2)
  })

  it('a placed table or chart widget with only a reason still counts as having something to print', () => {
    const svc: any = new MonthlyReportPDFService(fixtureReport(), { cashflowReason: 'x' } as any)
    expect(svc.hasDataForWidget('cashflow_forecast_table')).toBe(true)
    expect(svc.hasDataForWidget('chart_cashflow_forecast')).toBe(true)
    expect(svc.hasDataForWidget('chart_cash_runway')).toBe(false)
  })
})
