/**
 * Every client already printing a payroll page or an external-data page gets
 * the same page, byte for byte, now that both widgets have placement options
 * (P10: roster areas, per-employee month columns, pay shading, a roster budget
 * basis, fortnightly rosters, trend tables, declared rows, derived measures and
 * notes — DD-19, DD-20, IICT-40, DRG-37, IICT-15, IICT-16, DD-22, DRG-38).
 *
 * The digests were taken from the service BEFORE those options existed
 * (feat/multi-client-pack-wave-1 a67a86eb, on 16 September 2026), over every
 * page's content stream: Urban Road's Payroll Report as its placement is saved
 * today, the grid page with no config, the page a config it cannot read prints,
 * the reason page, and the external-data page placed with no config, narrowed
 * to one series, and in the default page order. A placement nobody has
 * configured, or one whose new keys all hold their defaults, must not move.
 *
 * Every render pins `preparedOn`, because the default page order draws the
 * cover and the cover prints "Prepared on <date>". Captured unpinned, these
 * digests only held on the day of capture: the file went red on 17 September
 * 2026 and stayed red, having passed CI on #557-#560 only because all four
 * merged on the 16th. The pinned date is the capture date, so the digests below
 * are the originals, unregenerated — they still assert what they were taken to
 * assert. Same fix, same reason as pdf-presentation-options-golden.
 */
import { createHash } from 'crypto'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import type { ExternalMetricSeriesData } from '../../types'
import { buildPayrollGrid, type PayslipRow } from '@/lib/monthly-report/payroll-grid'

const JUL = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']
const AUG = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']
const STAFF: [string, string, number, string][] = [
  ['457cf25d', 'Deborah Leydon', 2500, '2018-01-22'],
  ['2c50063e', 'Andrea Shinners', 2500, '2020-03-05'],
  ['a1534c56', 'Lara Powell', 1923.08, '2022-05-09'],
  ['28cf67bf', 'Cheryl Henderson', 1538.46, '2025-06-09'],
  ['c8c1153c', 'Suzanne  Atkin', 1442.31, '2020-03-01'],
  ['d2224afe', 'Thomas  White', 600, '2018-02-12'],
]
const PAYSLIPS: PayslipRow[] = [...JUL, ...AUG].flatMap((d) =>
  STAFF.map(([id, name, wages]) => ({ employee_id: id, employee_name: name, payment_date: d, wages, super_amount: wages * 0.12 })))
const GRID = buildPayrollGrid(
  PAYSLIPS,
  STAFF.map(([employee_id, , , start_date]) => ({ employee_id, start_date })),
  ['2026-07', '2026-08'],
  { '2026-07': 42015, '2026-08': 52519 },
)

/** Urban Road's saved placement. */
const URBAN_ROAD = {
  layout: 'calxa',
  window: 'fy_to_date',
  months: 3,
  difference_fills: true,
  roster: [
    { name: 'Andrea Shinners', employee_id: '2c50063e', standard_units: 38, weekly_salary: 2500 },
    { name: 'Deborah Leydon', employee_id: '457cf25d', standard_units: 38, weekly_salary: 2500 },
    { name: 'Suzanne Atkin', employee_id: 'c8c1153c', standard_units: 38, weekly_salary: 1442.31 },
    { name: 'Lara Powell', employee_id: 'a1534c56', standard_units: 38, weekly_salary: 1923.08 },
    { name: 'Thomas White', employee_id: 'd2224afe', standard_units: 20, weekly_salary: 600 },
    { name: 'Cheryl Henderson', employee_id: '28cf67bf', standard_units: 38, weekly_salary: 1538.46 },
  ],
}

/** The keys P10 added, each at its default: what Apply stores for a coach who changed nothing is none of them, but a hand-typed default must print the same. */
const P10_DEFAULTS = {
  budget_basis: 'approved',
  earlier_months: 'dash',
  salary_period: 'week',
  employee_month_columns: false,
  pay_fills: false,
  fill_tolerance: 1,
  standard_units_column: true,
  notes: [],
}

const SERIES: ExternalMetricSeriesData[] = [
  {
    id: 's1',
    series_key: 'orders',
    display_name: 'Orders by channel',
    dimension_label: 'Channel',
    measures: [
      { key: 'orders', label: 'Orders', format: 'number' },
      { key: 'revenue', label: 'Revenue', format: 'currency' },
    ],
    values: [
      { dimension_value: 'Shopify', measure_key: 'orders', scenario: 'actual', value: 120 },
      { dimension_value: 'Shopify', measure_key: 'revenue', scenario: 'actual', value: 18250 },
      { dimension_value: 'Shopify', measure_key: 'revenue', scenario: 'budget', value: 17000 },
      { dimension_value: 'Amazon', measure_key: 'orders', scenario: 'actual', value: 44 },
      { dimension_value: 'Amazon', measure_key: 'revenue', scenario: 'actual', value: 5120.5 },
    ],
    tie: null,
  },
  {
    id: 's2',
    series_key: 'hours',
    display_name: 'Contractor hours',
    dimension_label: 'Member',
    measures: [{ key: 'hours', label: 'Hours', format: 'hours' }],
    values: [
      { dimension_value: 'Krisna', measure_key: 'hours', scenario: 'actual', value: 208 },
      { dimension_value: 'Alpha', measure_key: 'hours', scenario: 'actual', value: 167.5 },
    ],
    tie: { series_total: 375.5, account_actual: 380, account_name: 'Virtual Contractors', delta: 4.5, within_tolerance: false, comparable: true },
  },
]

/** sha256 over every page's content stream, in page order. */
function digest(doc: any): string {
  const pages: string[] = []
  for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) pages.push((doc.internal.pages[p] as string[]).join('\n'))
  return createHash('sha256').update(pages.join('\n<page>\n')).digest('hex')
}

function payrollLayout(config?: unknown): PDFLayout {
  return {
    version: 1,
    pages: [{
      id: 'p1', orientation: 'landscape',
      widgets: [{ id: 'pay', type: 'payroll_grid', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: config as Record<string, unknown> | undefined }],
    }],
  }
}

function externalLayout(config?: unknown): PDFLayout {
  return {
    version: 1,
    pages: [{
      id: 'p1', orientation: 'portrait',
      widgets: [{ id: 'ext', type: 'external_metric', col: 0, row: 0, colSpan: 2, rowSpan: 3, config: config as Record<string, unknown> | undefined }],
    }],
  }
}

/** The day the digests were captured, so "Prepared on" is not the day the test runs. */
const preparedOn = { at: '2026-09-16T01:22:18.913Z', basis: 'finalised' as const }

const render = (options: Record<string, unknown>) =>
  digest(new MonthlyReportPDFService(fixtureReport(), { preparedOn, ...options } as never).generate())

const GOLDEN = {
  urbanRoad: '856ed153ff01aeda41c8856b1d0f608b3d3ecafcfcc05bd0215e4caba8cc96f5',
  gridNoConfig: '6aea3c928d80774c8a8465b5a9fc1d4e515347dcf118ca9ea7905230649da6a3',
  unreadable: 'bd3a6a33774804f601099ffe03383e63ccf7f71b11918279958eb60333a4f46b',
  reason: '6b2d00d65c9b470a979e8a97fcd51853a84134cdb373d04f14d3ea5b0c9d04f7',
  externalNoConfig: '2d2414b3c191f9fee09b9693e29b181935f0015f0bc035ce223ca9d41a008296',
  externalOneSeries: 'df2cc4479b0ee4332fe3ba1f942ed80bbd728fdb206ea8e45c76839c7271fee5',
  externalDefaultOrder: '44dcc6dea31f6e4195847683fbeade57c65307c7220abfb91d9f277df9dcd935',
}

describe('a payroll page nobody has configured for P10 prints what it printed', () => {
  it("Urban Road's saved Payroll Report", () => {
    expect(render({ pdfLayout: payrollLayout(URBAN_ROAD), payrollGrid: GRID })).toBe(GOLDEN.urbanRoad)
  })

  it('…and with every new key written out at its default', () => {
    expect(render({ pdfLayout: payrollLayout({ ...URBAN_ROAD, ...P10_DEFAULTS }), payrollGrid: GRID })).toBe(GOLDEN.urbanRoad)
  })

  it('the grid page with no config, and with the new keys at their defaults', () => {
    expect(render({ pdfLayout: payrollLayout(undefined), payrollGrid: GRID })).toBe(GOLDEN.gridNoConfig)
    expect(render({ pdfLayout: payrollLayout(P10_DEFAULTS), payrollGrid: GRID })).toBe(GOLDEN.gridNoConfig)
  })

  it('a config it cannot read, and the reason page', () => {
    expect(render({ pdfLayout: payrollLayout({ layout: 'calxa', rooster: [] }), payrollGrid: GRID })).toBe(GOLDEN.unreadable)
    expect(render({ pdfLayout: payrollLayout(URBAN_ROAD), payrollGridReason: 'no payslips synced for this period' })).toBe(GOLDEN.reason)
  })
})

describe('an external-data page nobody has configured prints what it printed', () => {
  it('placed with no config: every series with values, one page each', () => {
    expect(render({ pdfLayout: externalLayout(undefined), externalMetrics: SERIES })).toBe(GOLDEN.externalNoConfig)
  })

  it('narrowed to one series — alone, and with the new keys at their defaults', () => {
    expect(render({ pdfLayout: externalLayout({ series_key: 'hours' }), externalMetrics: SERIES })).toBe(GOLDEN.externalOneSeries)
    expect(render({
      pdfLayout: externalLayout({ series_key: 'hours', layout: 'month', months: 6, rows: [], derived_measures: [], notes: [] }),
      externalMetrics: SERIES,
    })).toBe(GOLDEN.externalOneSeries)
  })

  it('the default page order', () => {
    expect(render({ externalMetrics: SERIES })).toBe(GOLDEN.externalDefaultOrder)
  })
})
