/**
 * Package P1 — the pages that must not put a wrong number in front of a client.
 *
 *  - The cashflow pages print only when sections.cashflow is on, or where a
 *    saved layout places them (IICT-52, DD-34, DRG-46).
 *  - Where Did Our Money Go prints its refusal rather than vanishing (DRG-49).
 *  - The per-entity consolidated page refuses, naming the months, when an
 *    entity in another currency has no rate — and never claims a translation
 *    that did not happen (IICT-05).
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText } from './pdf-pack-fixture'
import { DEFAULT_SECTIONS } from '../../types'
import { buildPackCashflowForecast } from '@/lib/monthly-report/pack-cashflow'
import { urbanRoadFullYear } from '@/lib/monthly-report/__tests__/urban-road-full-year-fixture'
import type { FinancialForecast } from '@/app/finances/forecast/types'
import type { MoneyFlow } from '@/lib/monthly-report/money-flow'
import type { ConsolidatedReportVM } from '../../utils/consolidated-rows'

const FY2027 = {
  id: 'f', business_id: 'b', user_id: 'u', name: 'FY2027', fiscal_year: 2027, year_type: 'FY',
  actual_start_month: '2026-07', actual_end_month: '2026-08', forecast_start_month: '2026-09', forecast_end_month: '2027-06',
} as FinancialForecast

const cashflow = () => buildPackCashflowForecast({
  fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
  opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
})!

const off = () => ({ ...fixtureReport().settings.sections, cashflow: false })
const on = () => ({ ...fixtureReport().settings.sections, cashflow: true })

const cashflowTitled = (doc: any) => docText(doc).includes('(Cashflow Forecast')

describe('cashflow pages follow sections.cashflow', () => {
  it('the legacy page order prints no cashflow page with the section off, even when one was built', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: off(), cashflowForecast: cashflow() }).generate()
    expect(cashflowTitled(doc)).toBe(false)
  })

  it('nor a cashflow reason page with the section off', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: off(), cashflowReason: 'This business has more than one Xero organisation' }).generate()
    expect(docText(doc)).not.toContain('The cashflow is not available')
  })

  it('prints them when the section is on', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: on(), cashflowForecast: cashflow() }).generate()
    expect(cashflowTitled(doc)).toBe(true)
  })

  it('prints the reason in their place when the section is on and the cashflow was refused', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: on(), cashflowReason: 'This business has more than one Xero organisation' }).generate()
    expect(docText(doc)).toContain('The cashflow is not available for this month')
  })

  it('a saved layout that places the table prints it with the section off — placing it is opting in', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), {
      sections: off(),
      cashflowForecast: cashflow(),
      pdfLayout: {
        version: 1,
        pages: [
          { id: 'p1', orientation: 'portrait', widgets: [{ id: 'w1', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
          { id: 'p2', orientation: 'landscape', widgets: [{ id: 'w2', type: 'cashflow_forecast_table', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
        ],
      },
    }).generate()
    expect(cashflowTitled(doc)).toBe(true)
  })
})

const refusedFlow = (reason: string): MoneyFlow => ({
  comparable: false,
  reason,
  period_month: '2026-08',
  prior_month: '2026-07',
  bank: { start: 0, end: 0, delta: 0 },
  bank_accounts: [],
  bank_basis: 'section',
  unmatched_bank_account_ids: [],
  non_asset_bank_accounts: [],
  summary: null,
  earnings_movement: 0,
  sources: [],
  uses: [],
  unlisted_movement: 0,
  continuity_residual: 0,
})

describe('Where Did Our Money Go says why it is not there', () => {
  it('the legacy page order prints the refusal for a two-organisation business instead of dropping the page', () => {
    const reason = 'This business has multiple Xero organisations — per-entity money flow arrives with the entity columns work.'
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: off(), moneyFlow: refusedFlow(reason) }).generate()
    const text = docText(doc)
    expect(text).toContain('Where Did Our Money Go?')
    expect(text).toContain("This page couldn't be verified this month")
  })

  it('a money flow that never loaded still prints nothing', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), { sections: off() }).generate()
    expect(docText(doc)).not.toContain('Where Did Our Money Go?')
  })
})

function iictVm(missing: Array<{ currency_pair: string; period: string }>): ConsolidatedReportVM {
  const values = (v: number) => ({ '2026-07': v, '2026-08': v })
  return {
    business: { id: 'iict', name: 'IICT Group', presentation_currency: 'AUD' },
    byTenant: [
      { connection_id: 'c1', tenant_id: 't-iap', display_name: 'IICT Australia', display_order: 1, functional_currency: 'AUD', lines: [{ account_type: 'revenue', account_name: 'Membership income', monthly_values: values(32_455) }] },
      { connection_id: 'c2', tenant_id: 't-igl', display_name: 'IICT Group Limited', display_order: 2, functional_currency: 'HKD', lines: [{ account_type: 'revenue', account_name: 'Membership income', monthly_values: values(1_628_445) }] },
    ],
    eliminations: [],
    consolidated: {
      lines: [{ account_type: 'revenue', account_name: 'Membership income', monthly_values: values(1_660_900) }],
      budgetLines: [],
    },
    fx_context: { rates_used: {}, missing_rates: missing },
    diagnostics: {
      tenants_loaded: 2, total_lines_processed: 2, eliminations_applied_count: 0, eliminations_total_amount: 0,
      processing_ms: 1, tenants_with_budget: 0, tenants_without_budget: [],
    },
  }
}

describe('the per-entity consolidated page and exchange rates', () => {
  it('refuses the page and names the months when the HKD entity has no rate, with no "translated" footnote', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), {
      sections: off(),
      consolidated: iictVm([
        { currency_pair: 'HKD/AUD', period: '2026-07' },
        { currency_pair: 'HKD/AUD', period: '2026-08' },
      ]),
    }).generate()
    const text = docText(doc)
    expect(text).toContain('This page is not printed: no HKD/AUD exchange rate is stored for Jul 2026 and Aug 2026')
    expect(text).not.toContain('translated from HKD')
    // The raw Hong Kong dollar figure never reaches the page.
    expect(text).not.toContain('1,628,445')
  })

  it('a missing rate only for a month after the report month does not refuse the page', () => {
    const doc = new MonthlyReportPDFService(fixtureReport(), {
      sections: off(),
      consolidated: iictVm([{ currency_pair: 'HKD/AUD', period: '2026-09' }]),
    }).generate()
    const text = docText(doc)
    expect(text).not.toContain('This page is not printed')
    expect(text).toContain('IICT Group Limited translated from HKD')
  })

  it('prints the table and the footnote when every rate is there', () => {
    const text = docText(new MonthlyReportPDFService(fixtureReport(), { sections: off(), consolidated: iictVm([]) }).generate())
    expect(text).toContain('IICT Group Limited translated from HKD')
  })
})

describe('DEFAULT_SECTIONS keeps the cashflow off', () => {
  it('so a business with no settings row gets no cashflow page', () => {
    expect(DEFAULT_SECTIONS.cashflow).toBe(false)
  })
})
