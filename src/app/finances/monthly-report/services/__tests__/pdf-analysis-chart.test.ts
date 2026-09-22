/**
 * The Income / COGS / Expenses analysis charts, as the pack draws them.
 *
 * Calxa's pages 3, 5 and 9 carry the house header ("Income Analysis | YTD —
 * Urban Road Pty Ltd" over a grey period line), a centred section-prefixed
 * legend, gridlines on round steps and "Sep 2026" month labels. Ours drew a
 * 14pt bold "Income Analysis | FY2027" with a sentence subtitle, "Actuals /
 * Approved Budget / Last Year" hung off the left margin, a 200,000 step on both
 * Income and COGS, and "Sept".
 *
 * The figures are Urban Road's FY2027 full-year report as full-year-load built
 * it on 14 Sep 2026, section subtotals only (the chart reads nothing else).
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining } from './pdf-pack-fixture'
import type { FullYearLine, FullYearReport, ReportSections } from '../../types'

const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

/** [actual (Jul and Aug only), approved budget, last year] per FY month. */
const URBAN_ROAD: Record<string, { category: string; actual: [number, number]; budget: number[]; lastYear: number[] }> = {
  income: {
    category: 'Revenue',
    actual: [495_217.03, 527_561.8],
    budget: [450_000, 450_000, 450_000, 450_000, 800_000, 450_000, 450_000, 450_000, 450_000, 450_000, 450_001, 600_000],
    lastYear: [440_140.07, 541_983.91, 506_295.74, 570_621.92, 785_261.26, 394_035.37, 478_745.39, 398_350.79, 430_796.94, 419_494.5, 508_134.18, 569_002.79],
  },
  cogs: {
    category: 'Cost of Sales',
    actual: [317_611.8, 232_736.92],
    budget: [264_697, 264_697, 279_697, 271_297, 476_852, 279_697, 271_297, 263_957, 263_143, 262_247, 276_262, 357_702],
    lastYear: [376_808.45, 335_440.03, 340_187.91, 377_415.26, 488_262.21, 282_443.12, 287_637.18, 263_144.58, 249_621.99, 244_917.81, 280_150.99, 355_148.65],
  },
  expense: {
    category: 'Operating Expenses',
    actual: [163_595.84, 162_234.55],
    budget: [153_316, 163_783, 155_047, 162_392, 182_656, 154_692, 158_660, 152_660, 167_808, 158_315, 167_389, 164_848],
    lastYear: [273_794.29, 200_538.59, 185_014.75, 183_425.76, 192_625.52, 197_902.02, 173_577.66, 156_073.69, 180_741.86, 143_290.21, 132_640.39, 159_242.38],
  },
}

function urbanRoadFullYear(): FullYearReport {
  const subtotal = (key: string): FullYearLine => {
    const s = URBAN_ROAD[key]
    return {
      account_name: `Total ${s.category}`,
      category: s.category,
      months: FY_MONTHS.map((month, i) => ({
        month,
        actual: i < 2 ? s.actual[i] : 0,
        budget: s.budget[i],
        approved_budget: s.budget[i],
        prior_year: s.lastYear[i],
        source: i < 2 ? ('actual' as const) : ('forecast' as const),
      })),
      projected_total: 0,
      annual_budget: s.budget.reduce((a, b) => a + b, 0),
      approved_annual_budget: s.budget.reduce((a, b) => a + b, 0),
      variance_amount: 0,
      variance_percent: 0,
    }
  }
  const sections = Object.keys(URBAN_ROAD).map((key) => ({
    category: URBAN_ROAD[key].category,
    lines: [subtotal(key)],
    subtotal: subtotal(key),
  }))
  return {
    business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    sections,
    gross_profit: subtotal('income'),
    net_profit: subtotal('income'),
    forecast_available: true,
  } as FullYearReport
}

function renderCharts(fy: FullYearReport = urbanRoadFullYear()) {
  const report = fixtureReport()
  report.settings = { ...report.settings, sections: { ...report.settings.sections, trend_charts: true } }
  const doc: any = new MonthlyReportPDFService(report, {
    fullYearReport: fy,
    businessName: 'Urban Road Pty Ltd',
  }).generate()
  const runsOn = (legendEntry: string) => {
    const page = pageContaining(doc, legendEntry)
    expect(page, `a page carries "${legendEntry}"`).toBeGreaterThan(0)
    return textRuns(doc, page)
  }
  return { doc, runsOn }
}

describe('analysis chart pages — the Calxa look', () => {
  it('heads the page with the house title and the months in capitals, not a bold FY title', () => {
    const { runsOn } = renderCharts()
    const runs = runsOn('Income LastYear Actuals')
    // The whole title, client name included, wrapped inside the 166mm title
    // block exactly where Calxa's p3 wraps it: "Ltd" alone on the second line.
    // jsPDF writes the em dash as its WinAnsi byte, 0x97, which is what the
    // content stream holds.
    const at = runs.indexOf('Income Analysis | YTD \u0097 Urban Road Pty')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(runs[at + 1]).toBe('Ltd')
    expect(runs).toContain('JUL 2026 - JUN 2027')
    expect(runs.some((r) => r.includes('FY2027'))).toBe(false)
    expect(runs.some((r) => r.startsWith('Actuals vs'))).toBe(false)
  })

  it('prints the section-prefixed legend on each of the three pages, in Calxa\'s "Budgets"', () => {
    // An approved-budget client (the fixture's series is the approved budget):
    // Calxa's p3/p5/p9 legend reads "Income Budgets", and so does ours since
    // the column-names decision — never "Approved Budget" on a chart.
    const { runsOn, doc } = renderCharts()
    expect(runsOn('Income Actuals')).toEqual(
      expect.arrayContaining(['Income Actuals', 'Income Budgets', 'Income LastYear Actuals']),
    )
    const cogs = runsOn('Cost of Sales LastYear Actuals')
    expect(cogs).toEqual(expect.arrayContaining(['Cost of Sales Actuals', 'Cost of Sales Budgets']))
    expect(cogs.some((r) => r.startsWith('COGS Analysis | YTD'))).toBe(true)
    expect(runsOn('Expense LastYear Actuals')).toContain('Expense Budgets')
    expect(pageContaining(doc, 'Approved Budget')).toBe(-1)
  })

  it("labels the value axis on Calxa's steps: 100,000 / 50,000 / 30,000", () => {
    const { runsOn } = renderCharts()
    const income = runsOn('Income LastYear Actuals')
    expect(income).toEqual(expect.arrayContaining(['0', '100,000', '200,000', '800,000']))
    expect(income).not.toContain('900,000')
    expect(income).not.toContain('-0')

    const cogs = runsOn('Cost of Sales LastYear Actuals')
    expect(cogs).toEqual(expect.arrayContaining(['50,000', '450,000', '500,000']))
    expect(cogs).not.toContain('550,000')

    const expense = runsOn('Expense LastYear Actuals')
    expect(expense).toEqual(expect.arrayContaining(['30,000', '270,000', '300,000']))
    expect(expense).not.toContain('330,000')
  })

  it('draws each bar to its figure against the gridlines it is read by', () => {
    // The labels can be right while the bars are not: the renderer's geometry
    // was rewritten with the axis, and a bar scaled to the old frame would
    // still sit under correct gridline figures. Read both off the content
    // stream, in PDF points (y up).
    const { doc } = renderCharts()
    const ops: string[] = doc.internal.pages[pageContaining(doc, 'Income LastYear Actuals')].join('\n').split('\n')

    // Gridlines: a moveto and a lineto at the same height, across the plot.
    const grid: number[] = []
    // Filled rectangles whose foot sits on a gridline are the bars; the legend
    // swatches float above the plot.
    const rects: Array<{ x: number; top: number; foot: number }> = []
    ops.forEach((op, i) => {
      const m = /^([\d.]+) ([\d.]+) m$/.exec(op)
      const l = /^([\d.]+) ([\d.]+) l$/.exec(ops[i + 1] ?? '')
      if (m && l && m[2] === l[2] && Number(l[1]) - Number(m[1]) > 500) grid.push(Number(m[2]))
      const re = /^([\d.]+) ([\d.]+) ([\d.]+) (-?[\d.]+) re$/.exec(op)
      if (re && ops[i + 1] === 'f') rects.push({ x: Number(re[1]), top: Number(re[2]), foot: Number(re[2]) + Number(re[4]) })
    })
    grid.sort((a, b) => a - b)
    // 0 … 800,000 on 100,000 steps.
    expect(grid).toHaveLength(9)
    const zero = grid[0]
    const perDollar = (grid[8] - zero) / 800_000

    const bars = rects.filter((r) => Math.abs(r.foot - zero) < 1e-6).sort((a, b) => a.x - b.x)
    // Jul and Aug carry three bars, the ten months without actuals two each.
    expect(bars).toHaveLength(3 * 2 + 2 * 10)

    // November's approved budget, the tallest bar, tops out on the 800,000 rule.
    const nov = bars[3 * 2 + 2 * 2]
    expect(Math.max(...bars.map((b) => b.top))).toBe(nov.top)
    expect(nov.top).toBeCloseTo(grid[8], 6)
    // August's actual and last July's, each at its own figure on that scale.
    expect(bars[3].top).toBeCloseTo(zero + 527_561.8 * perDollar, 6)
    expect(bars[2].top).toBeCloseTo(zero + 440_140.07 * perDollar, 6)
  })

  it('hands the next page the line width it found', () => {
    // jsPDF opens every page at the width last set, and the reason card, the
    // warning card, the placeholder and the cover all stroke without setting
    // one. In a layout they can follow this page, and would have drawn their
    // borders at the chart's 0.265mm rule.
    const { doc: withCharts } = renderCharts()
    // The pages ride options.sections, where an absent flag reads as on.
    const withoutCharts: any = new MonthlyReportPDFService(fixtureReport(), {
      fullYearReport: urbanRoadFullYear(),
      businessName: 'Urban Road Pty Ltd',
      sections: { trend_charts: false } as ReportSections,
    }).generate()
    expect(pageContaining(withoutCharts, 'Income LastYear Actuals')).toBe(-1)
    expect(withCharts.getLineWidth()).toBe(withoutCharts.getLineWidth())
  })

  it('labels every month with its year, and September as "Sep"', () => {
    const { runsOn } = renderCharts()
    const runs = runsOn('Income LastYear Actuals')
    expect(runs).toEqual(expect.arrayContaining(['Jul 2026', 'Sep 2026', 'Dec 2026', 'Jan 2027', 'Jun 2027']))
    expect(runs.some((r) => r.startsWith('Sept'))).toBe(false)
  })

  it('drops the middle legend entry, and says why, when there is no yardstick', () => {
    const fy = urbanRoadFullYear()
    fy.forecast_available = false
    for (const l of [...fy.sections.map((s) => s.subtotal), fy.net_profit]) {
      l.approved_annual_budget = null
      for (const m of l.months) {
        m.budget = 0
        m.approved_budget = null
      }
    }
    const { runsOn } = renderCharts(fy)
    const runs = runsOn('Income LastYear Actuals')
    expect(runs).toContain('Income Actuals')
    expect(runs.filter((r) => r.includes('Budget'))).toEqual([])
    expect(runs.join(' ')).toContain('No forecast exists for FY2027')
  })
})
