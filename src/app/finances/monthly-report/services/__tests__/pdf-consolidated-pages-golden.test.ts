/**
 * The per-entity page, the subscriptions sheet and the contractor page print,
 * byte for byte, what they printed before P7 gave them placement options
 * (IICT-23, DRG-09, DRG-14, DRG-17, DRG-29, DRG-30, IICT-35).
 *
 * The digests were taken from the service BEFORE those options existed
 * (feat/multi-client-pack-wave-1 a67a86eb), over every page's content stream:
 * the legacy page order with a consolidated report, and a layout placing each
 * page with no config (the sheet on its 'calxa' layout, as Urban Road's is, and
 * with no title override). They must not move — a placement nobody has
 * configured prints what it always printed.
 */
import { createHash } from 'crypto'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import type { ConsolidatedReportVM } from '../../utils/consolidated-rows'
import { detail as urbanRoadSubscriptions, LABELS } from '@/lib/monthly-report/__tests__/urban-road-subscriptions-fixture'
import { contractorDetail } from '@/lib/monthly-report/__tests__/urban-road-contractors-fixture'
import { rollUpContractors } from '@/lib/monthly-report/contractor-rollup'

const preparedOn = { at: '2026-09-11T20:14:47.289Z', basis: 'finalised' as const }

const months = (aug: number, jul = 0) => ({ '2026-07': jul, '2026-08': aug })

/** Two AUD orgs with per-tenant budgets, a dormant row and an elimination. */
export function goldenConsolidated(): ConsolidatedReportVM {
  const universe: Array<[string, string, number, number]> = [
    ['revenue', 'Sales - Insurance', 673_764.84, 0],
    ['revenue', 'Sales - Management Services', 0, 151_658.84],
    ['cogs', 'Tradies Contractors', 472_604, 0],
    ['opex', 'Legal expenses', 1_459, 2_076],
    ['opex', 'Lease of Vehicles', 0, 0],
    ['other_income', 'Interest Income', 9.22, 0],
  ]
  const line = (type: string, name: string, v: number) => ({ account_type: type, account_name: name, monthly_values: months(v) })
  return {
    business: { id: 'drg', name: 'Dragon Roofing', presentation_currency: 'AUD' },
    byTenant: [
      { connection_id: 'c1', tenant_id: 't1', display_name: 'Dragon Roofing Pty Ltd', display_order: 1, functional_currency: 'AUD', lines: universe.map(([t, n, a]) => line(t, n, a)), budgetLines: universe.map(([t, n, a]) => line(t, n, Math.round(a * 0.9))) },
      { connection_id: 'c2', tenant_id: 't2', display_name: 'EASY HAIL CLAIM PTY LTD', display_order: 2, functional_currency: 'AUD', lines: universe.map(([t, n, , b]) => line(t, n, b)), budgetLines: universe.map(([t, n, , b]) => line(t, n, Math.round(b * 1.1))) },
    ],
    eliminations: [{ rule_id: 'r1', rule_description: 'Referral fee', account_type: 'opex', account_name: 'Legal expenses', amount: -100, source_tenant_id: 't2', source_amount: 100 }],
    consolidated: {
      lines: universe.map(([t, n, a, b]) => line(t, n, a + b + (n === 'Legal expenses' ? -100 : 0))),
      budgetLines: universe.map(([t, n, a, b]) => line(t, n, Math.round(a * 0.9) + Math.round(b * 1.1))),
    },
    fx_context: { rates_used: {}, missing_rates: [] },
    diagnostics: { tenants_loaded: 2, total_lines_processed: 12, eliminations_applied_count: 1, eliminations_total_amount: 100, processing_ms: 1, tenants_with_budget: 2, tenants_without_budget: [], budget_mode: 'per_tenant' },
  }
}

/** sha256 over every page's content stream, in page order. */
function digest(doc: any): string {
  const pages: string[] = []
  for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) pages.push((doc.internal.pages[p] as string[]).join('\n'))
  return createHash('sha256').update(pages.join('\n<page>\n')).digest('hex')
}

const render = (options: Record<string, unknown>) =>
  digest(new MonthlyReportPDFService(fixtureReport(), { preparedOn, entityName: 'Dragon Roofing & Easy Hail', ...options } as never).generate())

const place = (type: string, config?: Record<string, unknown>, orientation: 'portrait' | 'landscape' = 'landscape'): PDFLayout => ({
  version: 1,
  pages: [{ id: 'p1', orientation, widgets: [{ id: 'w', type: type as never, col: 0, row: 0, colSpan: 3, rowSpan: 3, ...(config ? { config } : {}) }] }],
})

const GOLDEN = {
  consolidatedDefaultOrder: '25b3b7a504f87c41a7e068e54dc45002715906cec968d9b2f0def5619a596e07',
  consolidatedPlaced: '50c637c7f65662b86a79bee571a1a09f80e3bc44b483bfade02f076f5de1dbdd',
  subscriptionSheetPlaced: '098a56adb4da00abd5fcbb78654e721adca19f98e9b5d220bbb0817b25e0c7ad',
  subscriptionStandardPlaced: 'be77d04e70e87a0164cad96fb884ba2d94cad6bdc5ca50325775c8ca96569afc',
  contractorPlaced: '8d189a98348ad3894bd42b2e91f6bfd8ab014e11d3a1d4e03514888904ee81f9',
}

describe('pages nobody has configured print exactly what they printed before P7', () => {
  it('the per-entity page, in the legacy page order and placed with no config', () => {
    expect(render({ consolidated: goldenConsolidated() })).toBe(GOLDEN.consolidatedDefaultOrder)
    expect(render({ consolidated: goldenConsolidated(), pdfLayout: place('consolidated_pl') })).toBe(GOLDEN.consolidatedPlaced)
  })

  it('the subscriptions sheet and the standard subscription page', () => {
    const subscriptionDetail = urbanRoadSubscriptions()
    expect(render({ subscriptionDetail, pdfLayout: place('subscription_detail', { layout: 'calxa', labels: LABELS }, 'portrait') })).toBe(GOLDEN.subscriptionSheetPlaced)
    expect(render({ subscriptionDetail, pdfLayout: place('subscription_detail', undefined, 'portrait') })).toBe(GOLDEN.subscriptionStandardPlaced)
  })

  it('the contractor page', () => {
    const report = contractorDetail()
    expect(render({ contractorDetail: rollUpContractors(report), contractorDetailReport: report, pdfLayout: place('contractor_detail', undefined, 'portrait') })).toBe(GOLDEN.contractorPlaced)
  })
})
