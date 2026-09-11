import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as Sentry from '@sentry/nextjs'
import type { GeneratedReport, ReportSection, ReportLine, MonthlyReportSettings, ReportSections, VarianceCommentary, FullYearReport, SubscriptionDetailData, WagesDetailData } from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { transformCashflowToChartData, CASHFLOW_CHART_COLORS, CASHFLOW_CHART_SERIES } from '@/app/finances/forecast/utils/cashflow-chart-data'
import { transformRevenueBreakdownData } from '../components/charts/RevenueBreakdownChart'
import { transformBreakEvenData } from '../components/charts/BreakEvenChart'
import { transformRevenueVsExpensesData } from '../components/charts/RevenueVsExpensesTrendChart'
import {
  transformVarianceHeatmapData,
  heatmapTitle,
  heatmapUnavailableReason,
  HEATMAP_SUBTITLE,
  HEATMAP_UNAVAILABLE_TITLE,
} from '../components/charts/VarianceHeatmapChart'
import {
  transformBurnRateData,
  burnRateYardstick,
  burnRateSubtitle,
} from '../components/charts/BudgetBurnRateChart'
import { transformAnalysisChartData, type AnalysisChartSection } from '../components/charts/analysis-chart-data'
import { LOGO_COVER, LOGO_CORNER, LOGO_COVER_SIZE, LOGO_CORNER_SIZE } from './pack-logo'
import { pagesWithContent } from '../utils/layout-pages'
import { resolveSectionFilter, sectionTableTitle } from './section-table-config'
import { annotateStandingLines, pickStandingCommentaryHost } from '../utils/standing-commentary'
import { buildConsolidatedRows } from '../utils/consolidated-rows'
import { transformCashRunwayData } from '../components/charts/CashRunwayChart'
import { transformCumulativeNetCashData } from '../components/charts/CumulativeNetCashChart'
import { transformWorkingCapitalData } from '../components/charts/WorkingCapitalGapChart'
import { transformTeamCostData } from '../components/charts/TeamCostPctChart'
import { transformCostPerEmployeeData } from '../components/charts/CostPerEmployeeChart'
import { transformSubscriptionCreepData } from '../components/charts/SubscriptionCreepChart'
import { CHART_COLORS, getHeatmapColor } from '../components/charts/chart-colors'
import type { PDFLayout, WidgetType, WidgetBoundingBox } from '../types/pdf-layout'
import { GRID_CONFIG } from '../types/pdf-layout'
import { calculateBoundingBox, normalizeLayoutPlacements } from '../utils/grid-helpers'
import { WIDGET_METHOD_MAP } from './widget-renderer'
import { assessBalanceSheetForPdf, type BalanceSheetPdfSources } from '../utils/balance-sheet-pdf'
import { statementYardstick, wagesYardstick, wagesEmployeeYardstick, noBudgetNote } from '../utils/budget-yardstick'
import { groupExpenseLines } from '@/lib/monthly-report/expense-groups'
import type { ContractorRollup } from '@/lib/monthly-report/contractor-rollup'
import type { PayrollGrid } from '@/lib/monthly-report/payroll-grid'
import { withoutSilentLines, withoutSilentFullYearLines } from '@/lib/monthly-report/empty-lines'
import { GROUP_SHADE, BAND_LIGHT, periodBandRow, type BandGroup, SECTION_TEXT, RULE_STRONG, paintNegatives, packTableStyles } from './pack-style'
import {
  hasApprovedBudget,
  formatApprovedAnnual,
  hasForecastBudget,
  formatForecastValue,
  forecastAbsentNote,
  forwardSeriesAbsentNote,
  VALUE_ABSENT,
} from '../utils/full-year-approved'
import type { BalanceSheetCompare, BalanceSheetData } from '../types'

interface PDFOptions {
  commentary?: VarianceCommentary
  fullYearReport?: FullYearReport
  subscriptionDetail?: SubscriptionDetailData
  /** The Contractor Analysis page's rows, already rolled up (see contractor-rollup). */
  contractorDetail?: ContractorRollup
  /** The two-month payroll grid (see payroll-grid). */
  payrollGrid?: PayrollGrid
  wagesDetail?: WagesDetailData
  cashflowForecast?: CashflowForecastData
  /** WE.1b — external-metrics series with this month's values (entered data). */
  externalMetrics?: import('../types').ExternalMetricSeriesData[]
  /** WC.5 — entity name on the cover page. */
  businessName?: string
  /** WD.8 — the month's written memo (snapshot coach_notes). */
  memo?: string
  /** WD.4 — the month's funds flow (Where Did Our Money Go). */
  moneyFlow?: import('@/lib/monthly-report/money-flow').MoneyFlow
  /** WD.6 — the consolidated report (per-entity columns) for consolidation parents. */
  consolidated?: import('../utils/consolidated-rows').ConsolidatedReportVM
  /**
   * WG.1 — the balance sheet, keyed by comparison mode. Two entries because
   * the endpoint answers one comparison at a time; a placed widget reads the
   * one its config.compare names. An entry with `data: null` still carries a
   * `reason`, and the page prints that reason instead of the table.
   */
  balanceSheets?: BalanceSheetPdfSources
  /** WF.4 — true when this month's budget was back-filled from actuals: the
   *  cover must say so, because a ~0% variance is an echo, not performance. */
  budgetBackfilled?: boolean
  sections?: ReportSections
  pdfLayout?: import('../types/pdf-layout').PDFLayout | null
}

// A4 dimensions in mm
/**
 * Where content starts down the page.
 *
 * Higher than the left/right margin on purpose: the corner mark is drawn at
 * 10mm and is about 9mm tall, so a table that began at the margin ran straight
 * through it — which is exactly what happened on the CONTINUATION pages, where
 * there is no title to push the table down and the column headers landed under
 * the logo.
 */
const CONTENT_TOP = 22

const A4_SHORT = 210
const A4_LONG = 297

// Variance cell tint colors
/** Unfavourable figures. Calxa's red — the only colour it spends on a number. */
const TEXT_NEGATIVE: [number, number, number] = [192, 0, 0]

// =====================================================================
// Phase 71-07 (S4) — Variance polarity helper
// =====================================================================
// Track variance polarity in raw data; tint decision reads structured
// metadata (`_polarity`) instead of brittle string parsing of formatted
// display text. Backward-compat string fallback preserved so legacy code
// paths that still emit plain strings continue to tint correctly during
// rollout.
//
// LOCK: this helper MUST live in this file (no sibling helper module) so
// the PDF service class can call it directly without import cycles and the
// vitest spec can import it via a single named export from this module.
//
// See `.planning/phases/71-.../71-07-PLAN.md` for the full design.

export type VariancePolarity = 'positive' | 'negative' | 'neutral'

export function decideTintColor(
  polarity: VariancePolarity | undefined,
  displayText: string,
): 'red' | 'green' | 'none' {
  const text = String(displayText || '')
  // Zero is always neutral regardless of polarity metadata.
  //
  // The old test was a list of literals — '$0', '($0)', '+0.0%' — and the pack
  // stopped printing dollar signs, so a variance of -$0.004 came through as the
  // string '0' with negative polarity and printed in red. A red nought is the
  // clearest possible sign that a page is coloured by machinery rather than by
  // meaning. Test the DIGITS instead: if nothing but zeros survives, there is
  // no variance to have a polarity about.
  if (!text || text === '—') return 'none'
  const digits = text.replace(/[^0-9]/g, '')
  if (digits === '' || /^0+$/.test(digits)) return 'none'
  // Prefer explicit polarity metadata when available.
  if (polarity === 'negative') return 'red'
  if (polarity === 'positive') return 'green'
  if (polarity === 'neutral') return 'none'
  // Backward-compat: fall back to string parsing when polarity is missing
  // (older code paths still building plain strings).
  if (text.startsWith('(') || text.startsWith('-')) return 'red'
  if (text.startsWith('$') || text.startsWith('+')) return 'green'
  return 'none'
}

/**
 * The pack's palette, read off the Calxa pack it replaces.
 *
 * Calxa spends no colour on furniture. Its header bands are a muted
 * grey-lavender, its section headings are grey text on near-white, its
 * subtotals are bold black on a light grey, and the ONLY colour in the whole
 * 27 pages is a red negative in parentheses. There is no green: a favourable
 * variance is simply a number that is not red.
 *
 * Ours had navy headers, cornflower-blue subtotal bands, an orange band on the
 * Subscriptions page and a green-vs-red tint behind every variance cell on the
 * three most-read pages — four columns of pastel on every row of a
 * fourteen-column table, which is most of what "hard to read" meant.
 *
 * These names are kept (NAVY is referenced in ~30 places) so the whole pack
 * moves at once and no page is left in the old language.
 */
/** Header bands and grand-total rows. Dark enough to carry white text. */
const NAVY: [number, number, number] = [120, 116, 130]
/** Subtotal rows — Gross Profit, section totals. Bold black on light grey. */
const GP_BLUE: [number, number, number] = [232, 232, 236]
/** The lighter companion, for a second tier of subtotal. */
const OP_BLUE: [number, number, number] = [244, 244, 246]

export class MonthlyReportPDFService {
  private doc: jsPDF
  private report: GeneratedReport
  private options: PDFOptions
  private pageWidth: number
  private pageHeight: number
  private margin: number = 15
  private yPosition: number = 15
  private skipNextAddPage: boolean = false
  /**
   * The layout being rendered right now, or null on the legacy page order.
   * Set by generateFromLayout and cleared when it throws, because the fallback
   * runs the hard-coded order and must not be reasoned about as if the layout
   * were still in force.
   */
  private activeLayout: PDFLayout | null = null
  /** Memoised — see standingHostWidgetId. `undefined` = not computed yet. */
  private standingHostId: string | null | undefined = undefined

  constructor(report: GeneratedReport, options?: PDFOptions) {
    // Start portrait — first page is executive summary
    this.doc = new jsPDF('portrait', 'mm', 'a4')
    this.report = report
    this.options = options || {}
    this.pageWidth = A4_SHORT
    this.pageHeight = A4_LONG
  }

  generate(): jsPDF {
    // If a custom layout is provided, use the layout-driven renderer
    if (this.options.pdfLayout && Array.isArray(this.options.pdfLayout.pages) && this.options.pdfLayout.pages.length > 0) {
      // Validate that at least one page has widgets
      const hasWidgets = this.options.pdfLayout.pages.some(
        p => Array.isArray(p.widgets) && p.widgets.length > 0
      )
      if (hasWidgets) {
        try {
          return this.generateFromLayout(this.options.pdfLayout)
        } catch (err) {
          // This fallback is silent by construction: it discards the layout,
          // rebuilds the doc, and runs the hard-coded legacy page order. The
          // coach gets a complete, plausible PDF in the WRONG order and is
          // told nothing — one bad widget and a pack ships that nobody knows
          // is off-spec. Keep the fallback (a PDF beats no PDF), but never let
          // it be the only record that it happened.
          Sentry.captureException(err, {
            tags: { invariant: 'pdf-layout-fallback' },
            extra: {
              context: '[PDF] Layout-driven generation failed — fell back to the legacy page order',
              reportMonth: this.report?.report_month,
              pageCount: this.options.pdfLayout?.pages?.length,
            },
          } as any)
          console.error('[PDF] Layout-driven generation failed, falling back to default:', err)
          // Reset the doc for default generation. The layout is no longer in
          // force, and anything that reads it — the standing-commentary host,
          // for one — must go back to the legacy answer.
          this.activeLayout = null
          this.standingHostId = undefined
          this.doc = new jsPDF('portrait', 'mm', 'a4')
          this.pageWidth = A4_SHORT
          this.pageHeight = A4_LONG
          this.margin = 15
          this.yPosition = 15
        }
      }
    }

    const sec = this.options.sections

    // WC.5 — cover first. The constructor already made page 1; the cover
    // draws on it and the executive summary moves to its own page.
    this.addCoverPage()
    this.addPage('portrait')
    this.addExecutiveSummary()
    // WD.8 — the memo sits right behind the executive summary, where the
    // Calxa packs put the written page.
    if ((this.options.memo ?? '').trim() !== '') {
      this.addMemoPage()
    }
    this.addBudgetVsActualDetail()
    if (this.report.settings.show_ytd) {
      this.addYTDSummary()
    }
    if (this.options.subscriptionDetail && this.options.subscriptionDetail.accounts.length > 0) {
      this.addSubscriptionDetailPage()
    }
    if (this.options.wagesDetail && this.options.wagesDetail.accounts.length > 0) {
      this.addWagesDetailPage()
    }
    // WE.1b — the entered external-data inserts, one page per series with
    // values (the Calxa packs give each insert its own page).
    for (const series of this.options.externalMetrics ?? []) {
      if (series.values.length > 0) this.addExternalMetricPage(series)
    }
    // WD.4 — Where Did Our Money Go. Default flow only when the derivation
    // proved itself; an explicitly-placed widget shows the honest reason card.
    if (this.options.moneyFlow?.comparable) {
      this.addMoneyFlowPage()
    }
    // WD.6 — per-entity consolidated P&L for consolidation parents.
    if (this.options.consolidated && this.options.consolidated.byTenant.length > 0) {
      this.addConsolidatedPLPage()
    }
    if (this.options.cashflowForecast && this.options.cashflowForecast.months.length > 0) {
      this.addCashflowForecastPage()
      this.addCashflowForecastChartPage()
    }
    if (this.options.fullYearReport) {
      this.addFullYearProjection()
    }

    // WG.1 — the two balance sheets (Calxa pages 19-22), in the position
    // generateDefaultLayout gives them: after the full-year projection.
    //
    // They were reachable ONLY from a hand-written layout. generate() is what
    // runs whenever pdf_layout is null — which is every client today, Urban
    // Road included — and it never called addBalanceSheetPage, while page.tsx
    // fired two live Xero balance-sheet round-trips the moment
    // sections.balance_sheet was on. Urban Road, Just Digital Signage and
    // Precision paid for the fetches and got no pages. Nobody should have to
    // hand-write a layout to get a page their settings say is on.
    //
    // Gated on the flag alone, not on the sheets having loaded: an export that
    // did not fetch them prints the page and says why, which is the same three
    // states the widget path has.
    if (sec?.balance_sheet) {
      this.addBalanceSheetPage('mom')
      this.addBalanceSheetPage('yoy')
    }

    // WD.1 — the Calxa Actual/Budget/Last-Year analysis charts (Income, COGS,
    // Expenses). The web Trends tab has computed this shape since Phase 27;
    // the PDF never carried it. Rides the trend_charts flag like the tab does.
    if ((sec?.trend_charts ?? true) && this.options.fullYearReport) {
      this.addAnalysisChartPage('income')
      this.addAnalysisChartPage('cogs')
      this.addAnalysisChartPage('expense')
    }

    // Chart pages — gated by sections flags AND data availability
    if (sec?.chart_revenue_breakdown) {
      this.addRevenueBreakdownChartPage()
    }
    if (sec?.chart_break_even && this.options.fullYearReport) {
      this.addBreakEvenChartPage()
    }
    if (sec?.chart_revenue_vs_expenses && this.options.fullYearReport) {
      this.addRevenueVsExpensesTrendChartPage()
    }
    if (sec?.chart_variance_heatmap && this.options.fullYearReport) {
      this.addVarianceHeatmapPage()
    }
    if (sec?.chart_budget_burn_rate) {
      this.addBudgetBurnRateChartPage()
    }
    if (sec?.chart_cash_runway && this.options.cashflowForecast) {
      this.addCashRunwayChartPage()
    }
    if (sec?.chart_cumulative_net_cash && this.options.cashflowForecast) {
      this.addCumulativeNetCashChartPage()
    }
    if (sec?.chart_working_capital_gap && this.options.cashflowForecast) {
      this.addWorkingCapitalGapChartPage()
    }
    if (sec?.chart_team_cost_pct && this.options.fullYearReport) {
      this.addTeamCostPctChartPage()
    }
    if (sec?.chart_cost_per_employee && this.options.wagesDetail) {
      this.addCostPerEmployeeChartPage()
    }
    if (sec?.chart_subscription_creep && this.options.subscriptionDetail) {
      this.addSubscriptionCreepChartPage()
    }

    this.addAllFooters()
    return this.doc
  }

  /** Add a new page with the specified orientation and update dimensions */
  private addPage(orientation: 'portrait' | 'landscape'): void {
    if (this.skipNextAddPage) {
      this.skipNextAddPage = false
      return
    }
    this.doc.addPage('a4', orientation)
    if (orientation === 'landscape') {
      this.pageWidth = A4_LONG
      this.pageHeight = A4_SHORT
    } else {
      this.pageWidth = A4_SHORT
      this.pageHeight = A4_LONG
    }
    this.yPosition = CONTENT_TOP
  }

  // =====================================================================
  // Cover page (WC.5) — entity, month, basis, prepared-on, draft/final
  // =====================================================================
  // Draws on the CURRENT page: page 1 in the default flow, the widget's page
  // in the layout flow. The status line is the honest one — a report behind
  // the reconciliation gate says PROVISIONAL here and is watermarked on every
  // page (addAllFooters), instead of exporting indistinguishable from final.
  private addCoverPage(): void {
    const { report } = this
    const centerX = this.pageWidth / 2
    let y = this.pageHeight * 0.32

    // The mark, above the name. A cover with no mark on it is the one page a
    // client is certain to look at and the one that says least.
    try {
      const w = 46
      const h = (LOGO_COVER_SIZE.h / LOGO_COVER_SIZE.w) * w
      this.doc.addImage(LOGO_COVER, 'PNG', centerX - w / 2, y - h - 14, w, h)
    } catch {
      // A pack without its logo is still a pack. Never the other way round.
    }

    this.doc.setFontSize(24)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text(this.options.businessName || 'Monthly Report', centerX, y, { align: 'center' })
    y += 12

    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(90, 90, 90)
    this.doc.text('Monthly Management Report', centerX, y, { align: 'center' })
    y += 14

    this.doc.setFontSize(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(0, 0, 0)
    this.doc.text(this.formatMonth(report.report_month), centerX, y, { align: 'center' })
    y += 7

    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(90, 90, 90)
    this.doc.text(`Financial Year ${report.fiscal_year}`, centerX, y, { align: 'center' })
    y += 16

    this.doc.setDrawColor(200, 200, 200)
    this.doc.line(centerX - 30, y, centerX + 30, y)
    y += 12

    this.doc.setFontSize(9)
    // Basis is accruals until WD.7 ships a cash-basis pack; say so explicitly
    // rather than leaving the reader to guess.
    this.doc.text('Basis: Accruals', centerX, y, { align: 'center' })
    y += 6
    this.doc.text(`Prepared ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`, centerX, y, { align: 'center' })
    y += 12

    if (report.is_draft) {
      const n = report.unreconciled_count ?? 0
      this.doc.setFontSize(11)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(185, 28, 28) // red-700
      const label = n > 0
        ? `PROVISIONAL — ${n} unreconciled transaction${n === 1 ? '' : 's'}`
        : 'PROVISIONAL — DRAFT'
      this.doc.text(label, centerX, y, { align: 'center' })
    } else {
      this.doc.setFontSize(10)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(22, 101, 52) // green-800
      this.doc.text('Final', centerX, y, { align: 'center' })
    }

    // WF.4 — budget provenance. A back-filled budget makes every variance an
    // echo of the actuals; the pack must say so where the reader starts.
    if (this.options.budgetBackfilled) {
      y += 8
      this.doc.setFontSize(9)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(146, 64, 14) // amber-800
      this.doc.text(
        'Budget for this month was back-filled from actuals — variance columns are not a measure of performance.',
        centerX, y, { align: 'center' },
      )
    }
    this.doc.setTextColor(0, 0, 0)
  }

  renderCoverPage(): void {
    // Layout path — the widget's page already exists; draw directly.
    this.addCoverPage()
  }

  // =====================================================================
  // Memo (WD.8) — the month's written page
  // =====================================================================
  private addMemoPage(): void {
    const memo = (this.options.memo ?? '').trim()
    this.addPage('portrait')

    this.drawPageTitle(`Memo — ${this.formatMonth(this.report.report_month)}`)
    this.yPosition += 4
    this.doc.setDrawColor(200, 200, 200)
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition)
    this.yPosition += 8

    // Paragraph-preserving flow with page breaks. splitTextToSize wraps each
    // paragraph to the text column; a blank source line becomes paragraph
    // spacing rather than an empty rendered line.
    this.doc.setFontSize(10.5)
    this.doc.setFont('helvetica', 'normal')
    const maxWidth = this.pageWidth - this.margin * 2
    const lineHeight = 5.5
    for (const para of memo.split(/\n/)) {
      if (para.trim() === '') {
        this.yPosition += lineHeight * 0.6
        continue
      }
      const lines: string[] = this.doc.splitTextToSize(para, maxWidth)
      for (const l of lines) {
        if (this.yPosition > this.pageHeight - this.margin - 10) {
          this.addPage('portrait')
        }
        this.doc.text(l, this.margin, this.yPosition)
        this.yPosition += lineHeight
      }
      this.yPosition += lineHeight * 0.4
    }
  }

  renderMemo(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addMemoPage, box)
  }

  // =====================================================================
  // Where Did Our Money Go (WD.4, PORTRAIT) — funds flow from two BS dates
  // =====================================================================
  private addMoneyFlowPage(): void {
    const flow = this.options.moneyFlow!
    this.addPage('portrait')

    this.drawPageTitle(`Where Did Our Money Go? — ${this.formatMonth(this.report.report_month)}`)
    this.yPosition += 10

    if (!flow.comparable) {
      // The honest card: the page can't prove itself this month, and says why.
      this.doc.setFillColor(251, 243, 228)
      this.doc.setDrawColor(224, 174, 92)
      this.doc.roundedRect(this.margin, this.yPosition, this.pageWidth - this.margin * 2, 24, 2, 2, 'FD')
      this.doc.setFontSize(10)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(138, 94, 18)
      const msg: string[] = this.doc.splitTextToSize(
        `This page couldn't be verified this month: ${flow.reason ?? 'insufficient data'}`,
        this.pageWidth - this.margin * 2 - 10,
      )
      this.doc.text(msg, this.margin + 5, this.yPosition + 8)
      this.doc.setTextColor(0, 0, 0)
      return
    }

    // Lead sentence — the one line a non-numbers owner reads.
    const up = flow.bank.delta >= 0
    this.doc.setFontSize(11)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(
      `Your bank moved from ${this.fmtCurrency(flow.bank.start)} to ${this.fmtCurrency(flow.bank.end)} — ${up ? 'up' : 'down'} ${this.fmtCurrency(Math.abs(flow.bank.delta))}.`,
      this.margin, this.yPosition,
    )
    this.yPosition += 9

    // Roll the tail up so the page stays readable.
    const TOP_N = 12
    const rollup = (items: typeof flow.sources) => {
      if (items.length <= TOP_N) return items
      const head = items.slice(0, TOP_N)
      const tail = items.slice(TOP_N)
      return [
        ...head,
        { label: `Everything else (${tail.length} smaller movements)`, section: null, amount: Math.round(tail.reduce((s, i) => s + i.amount, 0) * 100) / 100, kind: 'other' },
      ]
    }

    const table = (title: string, items: ReturnType<typeof rollup>, headColor: [number, number, number]) => {
      const total = items.reduce((s, i) => s + i.amount, 0)
      autoTable(this.doc, {
        startY: this.yPosition,
        head: [[title, '']],
        body: [
          ...items.map((i) => [i.label, this.fmtCurrency(i.amount)]),
          [
            { content: 'Total', styles: { fontStyle: 'bold' as const } },
            { content: this.fmtCurrency(Math.round(total * 100) / 100), styles: { fontStyle: 'bold' as const } },
          ],
        ],
        theme: 'grid',
        headStyles: { fillColor: headColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right', cellWidth: 35 } },
        margin: { left: this.margin, right: this.margin },
      })
      this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 8
    }

    table('Where money came from', rollup(flow.sources), [13, 118, 105]) // teal-ish ok
    table('Where it went', rollup(flow.uses), [166, 43, 34]) // deep red

    // The proof line. Residual is zero by construction; if it ever isn't,
    // say so in amber rather than pretending.
    if (Math.abs(flow.continuity_residual) <= 0.01) {
      this.drawNote(
        'These two columns explain the bank movement exactly — they are your balance sheet in motion.',
        undefined,
        { fontSize: 8.5, color: [90, 90, 90] },
      )
    } else {
      this.drawNote(
        `Note: the columns differ from the bank movement by ${this.fmtCurrency(flow.continuity_residual)} — treat this page as indicative this month.`,
        undefined,
        { fontSize: 8.5, color: [146, 64, 14] },
      )
    }
  }

  renderMoneyFlow(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addMoneyFlowPage, box)
  }

  // =====================================================================
  // Consolidated per-entity P&L (WD.6, LANDSCAPE)
  // =====================================================================
  // Mirrors the web ConsolidatedPLTab exactly — both read
  // buildConsolidatedRows, so the PDF can never drift from the tab.
  private addConsolidatedPLPage(): void {
    const vm = this.options.consolidated!
    this.addPage('landscape')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(
      `Actual vs Budget — ${(vm.business.name || 'Consolidation').toUpperCase()} — ${this.formatMonth(this.report.report_month)}`,
      this.margin, this.yPosition,
    )
    this.yPosition += 8

    const { rows, isSingleMode } = buildConsolidatedRows(vm, this.report.report_month)
    const tenants = vm.byTenant
    const hasElims = rows.some(r => r.elim !== 0)

    // Header: Account | per tenant (Actual [Budget, Var]) | [Elim] | Group A/B/Var$/Var%
    const head1: any[] = [{ content: 'Account', rowSpan: 2, styles: { valign: 'bottom' } }]
    const head2: any[] = []
    for (const t of tenants) {
      head1.push({ content: t.display_name, colSpan: isSingleMode ? 1 : 3, styles: { halign: 'center' } })
      head2.push('Actual')
      if (!isSingleMode) head2.push('Budget', 'Var $')
    }
    if (hasElims) {
      head1.push({ content: 'Elim', rowSpan: 2, styles: { valign: 'bottom', halign: 'right' } })
    }
    head1.push({ content: 'Consolidated', colSpan: 4, styles: { halign: 'center' } })
    head2.push('Actual', 'Budget', 'Var $', 'Var %')

    const fmtOrDash = (v: number) => (v === 0 ? '—' : this.fmtCurrency(v))
    const body = rows.map(r => {
      const cells: any[] = [r.accountName]
      for (const cell of r.tenantCells) {
        cells.push(fmtOrDash(cell.actual))
        if (!isSingleMode) {
          cells.push(cell.hasBudget ? fmtOrDash(cell.budget) : '—')
          cells.push(cell.hasBudget ? this.fmtVariance(cell.variance) : '—')
        }
      }
      if (hasElims) cells.push(fmtOrDash(r.elim))
      cells.push(
        fmtOrDash(r.consolidatedActual),
        fmtOrDash(r.consolidatedBudget),
        this.fmtVariance(r.consolidatedVariance),
        r.consolidatedVariancePct === null ? '—' : `${r.consolidatedVariancePct >= 0 ? '+' : ''}${r.consolidatedVariancePct.toFixed(1)}%`,
      )
      return cells
    })

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [head1, head2],
      body,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
      bodyStyles: { fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 42 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
      },
    })

    // FX disclosure — a translated entity's columns are in the presentation
    // currency; say so instead of leaving HKD figures to be misread.
    const translated = tenants.filter(t => t.functional_currency && t.functional_currency !== vm.business.presentation_currency)
    if (translated.length > 0) {
      // One clause per translated entity — IICT has three orgs — so this line
      // grows with the consolidation and has to wrap.
      const y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 5
      this.drawNote(
        `${translated.map(t => `${t.display_name} translated from ${t.functional_currency}`).join(' · ')} — all figures in ${vm.business.presentation_currency} at monthly-average rates.`,
        y,
        { color: [90, 90, 90] },
      )
    }
  }

  renderConsolidatedPL(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addConsolidatedPLPage, box)
  }

  // =====================================================================
  // Balance Sheet (WG.1, PORTRAIT) — Calxa pages 19-22
  // =====================================================================
  // Two placements of ONE widget: config.compare = 'mom' (vs prior month) or
  // 'yoy' (vs same month last year). The rows come straight off
  // /api/Xero/balance-sheet in the order the route emits them, so the page
  // carries whatever section grouping Xero gives — including the sections a
  // client hasn't mapped, which is the "New unmapped Asset / Liability" block
  // Calxa prints. Grouping, subtotal set, ordering and sign conventions are
  // NOT re-derived here: BalanceSheetTab renders the same array the same way,
  // and a PDF page that disagrees with the tab above it is the defect this
  // widget was written to avoid.
  private addBalanceSheetPage(compare: BalanceSheetCompare): void {
    const verdict = assessBalanceSheetForPdf(this.options.balanceSheets?.[compare], compare)
    this.addPage('portrait')

    const heading = compare === 'mom' ? 'vs Prior Month' : 'vs Same Month Last Year'
    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(0, 0, 0)
    this.doc.text(
      `Balance Sheet ${heading} — ${this.formatMonth(this.report.report_month)}`,
      this.margin, this.yPosition,
    )
    this.yPosition += 8

    if (!verdict.ok) {
      // The honest card, same shape as Where Did Our Money Go. Reserved for
      // there being nothing to print at all — Xero refused, the month is empty,
      // the comparison period does not exist. Never a half-table, never a
      // column of zeros: the page says what went wrong and stops.
      this.drawReasonCard(`This page couldn't be produced: ${verdict.reason}.`)
      return
    }

    // A sheet that does not add up — or one whose totals we cannot identify well
    // enough to check — still has figures, and withholding them makes the pack
    // disagree with the tab the coach is looking at, which shows the full table
    // under its banners. State what is wrong above the table and print the
    // table. "Could not check" is a third state alongside the value, not a
    // replacement for it. Both banners the tab can raise come through here, so
    // a sheet 13c out cannot warn the coach and reassure the client.
    if (verdict.warnings.length > 0) this.drawWarningCard(verdict.warnings.join(' '))

    const bs = verdict.data
    this.renderBalanceSheetTable(bs)

    const y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 6
    this.drawNote(
      'Sourced from Xero · Negatives shown in (brackets) · % Variance is N/A when the prior period is zero',
      y,
    )
  }

  /**
   * The amber "couldn't check" card. A page that cannot be produced must still
   * be a page, and must say why in words the owner can act on.
   */
  private drawReasonCard(message: string): void {
    const width = this.pageWidth - this.margin * 2
    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'normal')
    const lines: string[] = this.doc.splitTextToSize(message, width - 10)
    // Height follows the text. It used to be a fixed 26mm, which fits two
    // lines: a longer reason ran out through the bottom of its own box.
    const lineHeight = (this.doc.getFontSize() * 1.15) / (this.doc as any).internal.scaleFactor
    const height = Math.max(26, 10 + lines.length * lineHeight)
    this.doc.setFillColor(251, 243, 228)
    this.doc.setDrawColor(224, 174, 92)
    this.doc.roundedRect(this.margin, this.yPosition, width, height, 2, 2, 'FD')
    this.doc.setTextColor(138, 94, 18)
    this.doc.text(lines, this.margin + 5, this.yPosition + 8)
    this.doc.setTextColor(0, 0, 0)
    this.yPosition += height + 6
  }

  /**
   * The red band that sits ON TOP of a table, for figures that are real but
   * cannot be trusted to add up. Deliberately the same red and the same
   * sentence shape as BalanceSheetTab's banner: the page below it is still the
   * page, and the reader is told what is wrong with it rather than being
   * handed a sentence where the numbers should be.
   */
  private drawWarningCard(message: string): void {
    const width = this.pageWidth - this.margin * 2
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'bold')
    const lines: string[] = this.doc.splitTextToSize(message, width - 10)
    const height = 8 + lines.length * 4.5
    this.doc.setFillColor(254, 242, 242)
    this.doc.setDrawColor(220, 108, 108)
    this.doc.roundedRect(this.margin, this.yPosition, width, height, 2, 2, 'FD')
    this.doc.setTextColor(153, 27, 27)
    this.doc.text(lines, this.margin + 5, this.yPosition + 6)
    this.doc.setTextColor(0, 0, 0)
    this.doc.setFont('helvetica', 'normal')
    this.yPosition += height + 4
  }

  /**
   * A grey note line under a heading or a table — WRAPPED.
   *
   * jsPDF's `text()` does not wrap: a string wider than the page runs off the
   * paper and the overflow is simply not printed. Urban Road's yardstick note
   * is 179 characters on a PORTRAIT page, and the half that got cut was the
   * half naming the yardstick — the reason the note exists. Every note this
   * pack draws goes through here so that cannot happen again.
   *
   * Pass `y` to draw at a computed position (under a table) without moving
   * this.yPosition; the bottom of the block is returned either way, so a
   * caller can put something under it.
   */
  private drawNote(
    message: string,
    y?: number,
    opts?: { fontSize?: number; color?: [number, number, number] },
  ): number {
    const width = this.pageWidth - this.margin * 2
    const [r, g, b] = opts?.color ?? [107, 114, 128]
    this.doc.setFontSize(opts?.fontSize ?? 7.5)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(r, g, b)
    const lines: string[] = this.doc.splitTextToSize(message, width)
    const top = y ?? this.yPosition
    this.doc.text(lines, this.margin, top)
    this.doc.setTextColor(0, 0, 0)
    const lineHeight = (this.doc.getFontSize() * 1.15) / (this.doc as any).internal.scaleFactor
    const bottom = top + lines.length * lineHeight + 1.5
    if (y === undefined) this.yPosition = bottom
    return bottom
  }

  /** Formatting mirrors BalanceSheetTab: no currency symbol, no decimals,
   *  negatives in (brackets). Calxa prints the same. */
  private fmtBsAmount(value: number | null): string {
    if (value === null) return '—'
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return value < 0 ? `(${formatted})` : formatted
  }

  private fmtBsPct(value: number | null): string {
    if (value === null) return 'N/A'
    const formatted = `${Math.round(Math.abs(value))}%`
    return value < 0 ? `(${formatted})` : formatted
  }

  private renderBalanceSheetTable(bs: BalanceSheetData): void {
    // autoTable can't see row semantics, so carry them alongside: didParseCell
    // reads this by row index rather than sniffing the rendered label text.
    const kinds = bs.rows.map(r => r.type)

    const body = bs.rows.map((r) => {
      if (r.type === 'section_header') return [r.label, '', '', '', '']
      return [
        r.label,
        this.fmtBsAmount(r.current),
        this.fmtBsAmount(r.prior),
        this.fmtBsAmount(r.variance),
        this.fmtBsPct(r.variance_pct),
      ]
    })

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [
        ['', bs.current_label, bs.prior_label || '—', 'Variance', '% Variance'],
        ['', 'Actuals', 'Actuals', '', ''],
      ],
      body,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'right' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 70, halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.section === 'head') {
          if (data.column.index === 0) data.cell.styles.halign = 'left'
          if (data.row.index === 1) data.cell.styles.fontStyle = 'normal'
          return
        }
        const kind = kinds[data.row.index]
        if (kind === 'section_header') {
          data.cell.styles.fontStyle = 'italic'
          data.cell.styles.textColor = [150, 150, 150]
        } else if (kind === 'subtotal') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [243, 244, 246]
        } else if (kind === 'net_assets') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = GP_BLUE
        } else if (data.column.index === 0) {
          // Line items sit under their section header, as in the web tab.
          data.cell.styles.cellPadding = { top: 1, right: 2, bottom: 1, left: 4 }
        }
        // Red for genuinely negative figures only — '—' and 'N/A' are neither
        // negative nor zero, and must not be tinted as if they were.
        const text = String(data.cell.raw ?? '')
        if (data.column.index > 0 && text.startsWith('(')) {
          data.cell.styles.textColor = [185, 28, 28]
        }
      },
    })
  }

  /**
   * WG.1 — layout-mode dispatch. config.compare picks the comparison column;
   * a widget with no config (the one syncLayoutWithSettings auto-adds when the
   * balance-sheet section is switched on) is the prior-month page, which is
   * the first of the two in the Calxa pack.
   */
  renderBalanceSheet(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    const compare: BalanceSheetCompare = widget?.config?.compare === 'yoy' ? 'yoy' : 'mom'
    this.renderWithSkipPage(() => this.addBalanceSheetPage(compare), box)
  }

  // =====================================================================
  // Page 1: Executive Summary — Calxa / Urban Roads style (PORTRAIT)
  // =====================================================================
  private addExecutiveSummary(): void {
    const { report } = this
    const monthLabel = this.formatShortMonth(report.report_month)
    const monthLong = this.formatMonth(report.report_month)
    const settings = report.settings

    // Header — left-aligned like every other page in the pack. It was centred,
    // which made page 1 the only page whose eye-line started in the middle.
    this.drawPageTitle(`Actual vs Budget — ${monthLong}`)
    this.doc.setFontSize(8.5)
    this.doc.setTextColor(125, 125, 125)
    this.doc.text(`FY${report.fiscal_year}`, this.margin, this.yPosition - 4)
    this.doc.setTextColor(0, 0, 0)

    // ── Gather data ──
    const s = report.summary
    const gp = report.gross_profit_row
    const np = report.net_profit_row

    const revenueSection = report.sections.find(sec => sec.category === 'Revenue')
    const cogsSection = report.sections.find(sec => sec.category === 'Cost of Sales')
    const opexSection = report.sections.find(sec => sec.category === 'Operating Expenses')
    const otherIncomeSection = report.sections.find(sec => sec.category === 'Other Income')
    const otherExpensesSection = report.sections.find(sec => sec.category === 'Other Expenses')

    // Compute Operating Profit = Gross Profit - Operating Expenses
    const opActual = s.gross_profit.actual - s.opex.actual
    const opBudget = s.gross_profit.budget - s.opex.budget
    const opVariance = s.gross_profit.variance + s.opex.variance

    const opYtdActual = gp.ytd_actual - (opexSection?.subtotal.ytd_actual || 0)
    const opYtdBudget = gp.ytd_budget - (opexSection?.subtotal.ytd_budget || 0)
    const opYtdVariance = gp.ytd_variance_amount + (opexSection?.subtotal.ytd_variance_amount || 0)

    const hasYtd = settings.show_ytd
    const hasUnspent = settings.show_unspent_budget
    const hasNextMonth = settings.show_budget_next_month
    const hasAnnual = settings.show_budget_annual_total

    // ── Build header rows ──
    // The word over the money. For a client on the budget store these columns
    // are the APPROVED budget, and the Full Year page later in the same pack
    // gives "Forecast" to a different number — so an unqualified "Budget" here
    // is two columns a reader can reconcile the wrong way round.
    const yardstick = statementYardstick(report)
    // Two tones, as the reference pack sets them: the PERIOD band carries the
    // weight, the column names underneath sit on near-white. One dark block
    // covering both tiers is what made this header a slab.
    const navyStyle = { fillColor: BAND_LIGHT as number[], textColor: [38, 38, 42] as number[], fontStyle: 'bold' as const, fontSize: 7 }
    const bandStyle = { fillColor: NAVY as number[], textColor: [255, 255, 255] as number[], fontStyle: 'bold' as const, fontSize: 7 }

    const headerRow1: any[] = [
      { content: '', rowSpan: 2, styles: { ...navyStyle, cellWidth: 36 } },
      { content: monthLabel, colSpan: 3, styles: { ...bandStyle, halign: 'center' as const } },
    ]
    if (hasYtd) {
      headerRow1.push({ content: `YTD FY${report.fiscal_year}`, colSpan: 3, styles: { ...bandStyle, halign: 'center' as const } })
    }
    if (hasUnspent) headerRow1.push({ content: 'Unspent\nBudget', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })
    if (hasNextMonth) headerRow1.push({ content: 'Budget\nNext Mth', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })
    if (hasAnnual) headerRow1.push({ content: 'Budget\nAnnual', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })

    const headerRow2: any[] = [
      { content: yardstick.columnLabel, styles: navyStyle },
      { content: 'Actual', styles: navyStyle },
      { content: 'Variance', styles: navyStyle },
    ]
    if (hasYtd) {
      headerRow2.push(
        { content: yardstick.columnLabel, styles: navyStyle },
        { content: 'Actual', styles: navyStyle },
        { content: 'Variance', styles: navyStyle },
      )
    }

    // ── Build body rows ──
    interface SummaryRowData {
      label: string
      budget: number; actual: number; variance: number
      ytdBudget: number; ytdActual: number; ytdVariance: number
      unspent: number; nextMonth: number; annual: number
      style: 'normal' | 'gp' | 'op' | 'np'
    }

    const rows: SummaryRowData[] = []

    // Income
    rows.push({
      label: 'Income',
      budget: s.revenue.budget, actual: s.revenue.actual, variance: s.revenue.variance,
      ytdBudget: revenueSection?.subtotal.ytd_budget || 0,
      ytdActual: revenueSection?.subtotal.ytd_actual || 0,
      ytdVariance: revenueSection?.subtotal.ytd_variance_amount || 0,
      unspent: revenueSection?.subtotal.unspent_budget || 0,
      nextMonth: revenueSection?.subtotal.budget_next_month || 0,
      annual: revenueSection?.subtotal.budget_annual_total || 0,
      style: 'normal',
    })

    // Cost of Sales
    rows.push({
      label: 'Cost of Sales',
      budget: s.cogs.budget, actual: s.cogs.actual, variance: s.cogs.variance,
      ytdBudget: cogsSection?.subtotal.ytd_budget || 0,
      ytdActual: cogsSection?.subtotal.ytd_actual || 0,
      ytdVariance: cogsSection?.subtotal.ytd_variance_amount || 0,
      unspent: cogsSection?.subtotal.unspent_budget || 0,
      nextMonth: cogsSection?.subtotal.budget_next_month || 0,
      annual: cogsSection?.subtotal.budget_annual_total || 0,
      style: 'normal',
    })

    // Gross Profit
    rows.push({
      label: 'Gross Profit',
      budget: s.gross_profit.budget, actual: s.gross_profit.actual, variance: s.gross_profit.variance,
      ytdBudget: gp.ytd_budget, ytdActual: gp.ytd_actual, ytdVariance: gp.ytd_variance_amount,
      unspent: gp.unspent_budget, nextMonth: gp.budget_next_month, annual: gp.budget_annual_total,
      style: 'gp',
    })

    // Expenses (Operating Expenses)
    rows.push({
      label: 'Expenses',
      budget: s.opex.budget, actual: s.opex.actual, variance: s.opex.variance,
      ytdBudget: opexSection?.subtotal.ytd_budget || 0,
      ytdActual: opexSection?.subtotal.ytd_actual || 0,
      ytdVariance: opexSection?.subtotal.ytd_variance_amount || 0,
      unspent: opexSection?.subtotal.unspent_budget || 0,
      nextMonth: opexSection?.subtotal.budget_next_month || 0,
      annual: opexSection?.subtotal.budget_annual_total || 0,
      style: 'normal',
    })

    // Operating Profit
    rows.push({
      label: 'Operating Profit',
      budget: opBudget, actual: opActual, variance: opVariance,
      ytdBudget: opYtdBudget, ytdActual: opYtdActual, ytdVariance: opYtdVariance,
      unspent: (gp.unspent_budget || 0) - (opexSection?.subtotal.unspent_budget || 0),
      nextMonth: (gp.budget_next_month || 0) - (opexSection?.subtotal.budget_next_month || 0),
      annual: (gp.budget_annual_total || 0) - (opexSection?.subtotal.budget_annual_total || 0),
      style: 'op',
    })

    // Other Income (if present)
    if (otherIncomeSection) {
      rows.push({
        label: 'Other Income',
        budget: otherIncomeSection.subtotal.budget,
        actual: otherIncomeSection.subtotal.actual,
        variance: otherIncomeSection.subtotal.variance_amount,
        ytdBudget: otherIncomeSection.subtotal.ytd_budget,
        ytdActual: otherIncomeSection.subtotal.ytd_actual,
        ytdVariance: otherIncomeSection.subtotal.ytd_variance_amount,
        unspent: otherIncomeSection.subtotal.unspent_budget,
        nextMonth: otherIncomeSection.subtotal.budget_next_month,
        annual: otherIncomeSection.subtotal.budget_annual_total,
        style: 'normal',
      })
    }

    // Other Expenses (if present)
    if (otherExpensesSection) {
      rows.push({
        label: 'Other Expenses',
        budget: otherExpensesSection.subtotal.budget,
        actual: otherExpensesSection.subtotal.actual,
        variance: otherExpensesSection.subtotal.variance_amount,
        ytdBudget: otherExpensesSection.subtotal.ytd_budget,
        ytdActual: otherExpensesSection.subtotal.ytd_actual,
        ytdVariance: otherExpensesSection.subtotal.ytd_variance_amount,
        unspent: otherExpensesSection.subtotal.unspent_budget,
        nextMonth: otherExpensesSection.subtotal.budget_next_month,
        annual: otherExpensesSection.subtotal.budget_annual_total,
        style: 'normal',
      })
    }

    // Net Profit
    rows.push({
      label: 'Net Profit',
      budget: s.net_profit.budget, actual: s.net_profit.actual, variance: s.net_profit.variance,
      ytdBudget: np.ytd_budget, ytdActual: np.ytd_actual, ytdVariance: np.ytd_variance_amount,
      unspent: np.unspent_budget, nextMonth: np.budget_next_month, annual: np.budget_annual_total,
      style: 'np',
    })

    // Convert to table data
    // Same three states as the rows on pages 4/6/10 and as ReportSummaryCards,
    // which suppresses its Budget line entirely when there is no budget. This
    // page is the one a client reads first.
    const tableBody: any[][] = rows.map(row => {
      const r: any[] = [
        row.label,
        this.budgetCell(row.budget),
        this.fmtCurrency(row.actual),
        this.hasBudget ? this.fmtVariance(row.variance) : VALUE_ABSENT,
      ]
      if (hasYtd) {
        r.push(
          this.budgetCell(row.ytdBudget),
          this.fmtCurrency(row.ytdActual),
          this.hasBudget ? this.fmtVariance(row.ytdVariance) : VALUE_ABSENT,
        )
      }
      if (hasUnspent) r.push(this.budgetCell(row.unspent))
      if (hasNextMonth) r.push(this.budgetCell(row.nextMonth))
      if (hasAnnual) r.push(this.budgetCell(row.annual))
      return r
    })

    // Determine which column indices are variance columns
    const varianceCols: number[] = [3] // monthly variance
    if (hasYtd) varianceCols.push(6) // YTD variance

    // Names the yardstick for the columns too narrow to rename — Unspent
    // Budget, Budget Next Mth, Budget Annual. Null, and so absent, for every
    // client with only one yardstick in their pack.
    this.drawNoBudgetNotice()
    // ONCE, here, on the first statement page — not on all four.
    //
    // The distinction is real: this pack's budget column is the APPROVED
    // budget and the Full Year page gives that name to something else. But a
    // 179-character sentence repeated on every statement page is a developer
    // explaining himself in a client's pack, and every other page carries the
    // meaning in its column head ("Approved Budget") without the paragraph.
    if (yardstick.note) this.drawNote(yardstick.note)

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headerRow1, headerRow2],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 36 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const rowIdx = data.row.index
        const colIdx = data.column.index
        const rowData = rows[rowIdx]
        if (!rowData) return

        // Right-align all number columns
        if (colIdx > 0) data.cell.styles.halign = 'right'

        // Bold all rows (summary level)
        data.cell.styles.fontStyle = 'bold'

        // Gross Profit row — blue highlight
        if (rowData.style === 'gp') {
          data.cell.styles.fillColor = GP_BLUE
        }

        // Operating Profit row — lighter blue
        if (rowData.style === 'op') {
          data.cell.styles.fillColor = OP_BLUE
        }

        // Net Profit — the pack's most-read row. Calxa gives it bold black on
        // the page's own ground with a rule above, not a reversed dark band:
        // the figure carries the emphasis, not a block of colour behind it.
        if (rowData.style === 'np') {
          data.cell.styles.fillColor = GP_BLUE
          data.cell.styles.textColor = [26, 26, 26]
          data.cell.styles.fontStyle = 'bold'
        }

        // Variance cell tinting (only for normal/income/expense rows)
        if (varianceCols.includes(colIdx) && rowData.style === 'normal') {
          this.applyVarianceTint(data)
        }

        // Unfavourable in red; favourable in plain black. There is no green in
        // the reference pack, and a page that colours the good news as loudly
        // as the bad gives a reader nothing to scan for.
        if (varianceCols.includes(colIdx) && (rowData.style === 'gp' || rowData.style === 'op')) {
          const text = String(data.cell.text || '')
          if (text.startsWith('(')) data.cell.styles.textColor = [...TEXT_NEGATIVE]
        }
      },
    })

    // ── Additional Information ──
    const finalY = (this.doc as any).lastAutoTable?.finalY || this.yPosition + 80
    this.yPosition = finalY + 8

    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Additional Information', this.margin, this.yPosition)
    this.yPosition += 5

    const gpPercent = s.gross_profit.gp_percent
    const npPercent = s.net_profit.np_percent

    const infoData = [
      ['Gross Profit Margin', `${gpPercent.toFixed(1)}%`],
      ['Net Profit Margin', `${npPercent.toFixed(1)}%`],
    ]

    autoTable(this.doc, {
      startY: this.yPosition,
      body: infoData,
      theme: 'grid',
      bodyStyles: { fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'right', cellWidth: 30 },
      },
      margin: { left: this.margin, right: this.margin },
      tableWidth: 80,
    })
  }

  // =====================================================================
  // Page 2+: Budget vs Actual Detail (LANDSCAPE — many columns)
  // =====================================================================
  private addBudgetVsActualDetail(
    sectionFilter?: import('../types').ReportCategory[] | null,
    widgetId?: string,
  ): void {
    // WD.2 — an optional section scope turns the full statement into the
    // Calxa-style per-section table ("Income Analysis | Table" etc.). Filtered
    // tables show lines + subtotals only: Gross Profit and Net Profit are
    // statement-level rows and would be misleading footing a partial table.
    const filter = sectionFilter ?? null
    this.addPage('landscape')

    const settings = this.report.settings

    const title = sectionTableTitle(filter) ?? 'Budget vs Actual Detail'
    this.drawPageTitle(`${title} — ${this.formatMonth(this.report.report_month)}`)

    // These are pack pages 4, 6 and 10 — the most-read pages in it. For a
    // client on the budget store this column IS the approved budget, and the
    // Full Year page at 16 reserves that name for it while giving "Forecast"
    // to something else. Unqualified, the two invite the wrong reconciliation.
    const yardstick = statementYardstick(this.report)
    this.drawNoBudgetNotice()

    const headers: string[] = ['Account', yardstick.columnLabel, 'Actual', 'Var ($)', 'Var (%)']
    // The DOLLAR variance only. The percentage beside it carries no second
    // fact, and colouring both doubled the red on a page that already has
    // fourteen columns. See paintNegatives.
    const varianceCols = [3]
    let nextCol = 5

    if (settings.show_ytd) {
      headers.push(yardstick.ytdColumnLabel, 'YTD Actual', 'YTD Var ($)', 'YTD Var (%)')
      varianceCols.push(nextCol + 2)
      nextCol += 4
    }
    // The period band above the column names — see periodBandRow.
    const band: BandGroup[] = [
      { label: '', colSpan: 1, tone: 'light' },
      { label: this.formatShortMonth(this.report.report_month), colSpan: 4, tone: 'light' },
    ]
    if (settings.show_ytd) {
      band.push({ label: `YTD FY${this.report.fiscal_year}`, colSpan: 4, tone: 'dark' })
    }
    let trailing = 0
    if (settings.show_unspent_budget) { headers.push('Unspent'); nextCol++; trailing++ }
    if (settings.show_budget_next_month) { headers.push('Next Mth'); nextCol++; trailing++ }
    if (settings.show_budget_annual_total) { headers.push('Annual'); nextCol++; trailing++ }
    if (settings.show_prior_year) { headers.push('Prior Yr'); nextCol++; trailing++ }
    if (trailing > 0) band.push({ label: 'Budget', colSpan: trailing, tone: 'light' })

    const tableData: any[] = []

    // Section names are LABELS, not warnings. The pack used emerald for Revenue,
    // red for Cost of Sales and amber for Operating Expenses — saturated
    // full-width bands that read as alarms, and they consumed the one colour the
    // page actually needs, which is red for an unfavourable figure. Calxa gives
    // the section a quiet grey heading over a rule and spends its red on the
    // numbers.

    // Track which body-row indices are section headers, subtotals, GP, NP for tinting logic
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0
    /**
     * Commentary is a BLOCK under the table, not rows inside it.
     *
     * It used to be full-width amber strips wedged between the account lines,
     * which broke the statement in half wherever an account had something to
     * say. Calxa keeps its statement intact and puts the prose beneath it under
     * a "COMMENTARY" heading, as bullets — bold account name, then the facts.
     */
    const commentaryBullets: { account: string; body: string }[] = []

    const sectionsToRender = filter
      ? this.report.sections.filter((s) => filter.includes(s.category))
      : this.report.sections

    for (const section of sectionsToRender) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: section.category,
        colSpan: headers.length,
        styles: {
          fillColor: [255, 255, 255] as [number, number, number],
          textColor: [SECTION_TEXT[0], SECTION_TEXT[1], SECTION_TEXT[2]] as [number, number, number],
          fontStyle: 'bold',
          fontSize: 8,
          lineWidth: { top: 0, right: 0, bottom: 0.3, left: 0 },
          lineColor: [RULE_STRONG[0], RULE_STRONG[1], RULE_STRONG[2]] as [number, number, number],
        },
      }])
      currentBodyIdx++

      // A Xero chart of accounts accumulates, and every dormant account was
      // printing a full row of zeros — three of the pack's most-read pages were
      // mostly Commercial Sales, Furniture Sales and Canvas Jondo at $0/$0/$0.
      // Display only: the lines stay in the payload and the snapshot.
      // Expense accounts print under their group heading with a subtotal each,
      // the way the reference pack does — 49 accounts in one flat alphabetical
      // run is what made this page read as a ledger export. A client that has
      // grouped nothing takes the ungrouped branch and gets exactly the flat
      // list it got before.
      const visible = withoutSilentLines(section.lines)
      for (const g of groupExpenseLines(visible, settings.expense_group_order)) {
        if (g.name) {
          specialRowIndices.add(currentBodyIdx)
          tableData.push([{
            content: g.name,
            colSpan: headers.length,
            styles: {
              fillColor: [GROUP_SHADE[0], GROUP_SHADE[1], GROUP_SHADE[2]] as [number, number, number],
              textColor: [60, 60, 60] as [number, number, number],
              fontStyle: 'bold',
              fontSize: 7.5,
            },
          }])
          currentBodyIdx++
        }
        for (const line of g.lines) {
          tableData.push(this.buildLineRow(line, settings))
          currentBodyIdx++
        }
        if (g.subtotal) {
          specialRowIndices.add(currentBodyIdx)
          const groupRow = this.buildLineRow(g.subtotal, settings)
          groupRow[0] = { content: `Total ${g.name}`, styles: { fontStyle: 'bold' } }
          this.restyleRow(groupRow, { fontStyle: 'bold', fillColor: GROUP_SHADE as never })
          tableData.push(groupRow)
          currentBodyIdx++
        }
      }

      specialRowIndices.add(currentBodyIdx)
      const subtotalRow = this.buildLineRow(section.subtotal, settings)
      subtotalRow[0] = { content: section.subtotal.account_name, styles: { fontStyle: 'bold' } }
      tableData.push(subtotalRow)
      currentBodyIdx++

      // Commentary — WD.3 house bullet format: bold Account | then suppliers
      // largest-first (the route pre-sorts vendor_summary desc), then the
      // coach's prose. One row per line so the account name can actually be
      // bold (autoTable styles are per-cell, not per-substring).
      if (this.options.commentary && ['Cost of Sales', 'Operating Expenses', 'Other Expenses'].includes(section.category)) {
        // An amber row with nothing in it is worse than no row: it asserts that
        // this account was commented on and then says "—". The August pack
        // carried six of them (Art Import, Artist Commissions, Cushions & Decor,
        // Freight to Customer, International Orders, Posters) because the
        // account was TRIGGERED but neither the generated draft nor the coach
        // had written anything for it yet.
        const commentaryLines = section.lines.filter(l => {
          const e = this.options.commentary![l.account_name]
          if (!e) return false
          // A suppressed supplier list is not a reason for the account to
          // disappear from the pack. It used to be: `draft_warnings` fires when
          // the suppliers sum past their own account, which on Urban Road's
          // August was every one of the six accounts genuinely over budget —
          // so the commentary block printed the five accounts with NO suppliers
          // and none of the ones a reader needed. The row now prints and states
          // why the breakdown is missing.
          const hasDraft = !!(e.draft_note ?? '').trim()
          const suppressed = (e.draft_warnings?.length ?? 0) > 0
          return hasDraft || suppressed || !!(e.coach_note ?? '').trim()
        })
        for (const l of commentaryLines) {
          const entry = this.options.commentary![l.account_name]
          // The facts come from the generated draft, not from re-joining
          // vendor_summary here. The draft is already converted out of foreign
          // currency, capped at three suppliers with a stated remainder, and
          // renders credits as "less X credit" — none of which a join can do.
          // Re-joining is what turned Contractors excl. Artists (16 vendors)
          // and IT Costs Software (19) into a wall of 6.5pt text.
          //
          // A draft carrying warnings is suppressed outright: those fire when a
          // line could not be converted or when the suppliers sum past their own
          // account, and a pack must not quote a list we already know is wrong.
          // The coach's prose still prints — it is the half that was never in
          // doubt.
          const vendors = (entry.draft_warnings?.length ?? 0) > 0
            ? 'Supplier detail withheld — the supplier list does not agree with this account this month.'
            : (entry.draft_note ?? '')
          const note = entry.coach_note ? `${vendors ? ' — ' : ''}${entry.coach_note}` : ''
          commentaryBullets.push({ account: l.account_name, body: `${vendors}${note}` })
        }
      }

      // Gross Profit after COGS — statement view only
      if (!filter && section.category === 'Cost of Sales') {
        specialRowIndices.add(currentBodyIdx)
        const gpRow = this.buildLineRow(this.report.gross_profit_row, settings)
        gpRow[0] = { content: 'Gross Profit', styles: { fontStyle: 'bold', fillColor: GP_BLUE } }
        this.restyleRow(gpRow, { fillColor: GP_BLUE, fontStyle: 'bold' })
        tableData.push(gpRow)
        currentBodyIdx++
      }
    }

    // Net Profit — statement view only
    if (!filter) {
    specialRowIndices.add(currentBodyIdx)
    const npRow = this.buildLineRow(this.report.net_profit_row, settings)
    npRow[0] = { content: 'Net Profit', styles: { fontStyle: 'bold', fillColor: GP_BLUE, textColor: [26, 26, 26] } }
    this.restyleRow(npRow, { fillColor: GP_BLUE, textColor: [26, 26, 26], fontStyle: 'bold' })
    tableData.push(npRow)
    }

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [periodBandRow(band), headers],
      body: tableData,
      // Calxa's grain: no vertical rules, a hairline under each row, a quiet
      // grey header. 'grid' drew a border round all fourteen columns of every
      // row, which is what made this page read as a spreadsheet dump rather
      // than a statement.
      ...packTableStyles(7),
      columnStyles: { 0: { cellWidth: 50, halign: 'left' } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // A parenthesised figure is unfavourable, wherever it lands.
        paintNegatives(data as never)
        // Variance tinting for normal data rows
        if (data.section === 'body' && !specialRowIndices.has(data.row.index) && varianceCols.includes(data.column.index)) {
          this.applyVarianceTint(data)
        }
      },
    })

    this.drawCommentaryBlock(commentaryBullets)

    // WD.3 — standing "refer to …" lines, under exactly ONE table in the pack.
    // Which one is standingHostWidgetId's call; under the Calxa page order
    // there is no unfiltered statement to host them and they used to vanish. A
    // line whose target page is not in this pack renders WITH a warning marker
    // (visible, never silent).
    const standingHost = this.standingHostWidgetId()
    if (standingHost === null ? !filter : widgetId === standingHost) {
      const standing = annotateStandingLines(
        this.report.settings.standing_commentary ?? [],
        this.packPageLabels(),
      )
      if (standing.length > 0) {
        let y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 6
        this.doc.setFontSize(8)
        const available = this.pageWidth - this.margin * 2
        for (const line of standing) {
          if (y > this.pageHeight - this.margin - 6) {
            this.addPage('landscape')
            y = this.yPosition
          }
          this.doc.setFont('helvetica', 'bold')
          this.doc.setTextColor(120, 53, 15)
          this.doc.text(line.label, this.margin, y)
          const labelWidth = this.doc.getTextWidth(line.label)
          this.doc.setFont('helvetica', 'normal')
          const suffix = line.in_pack
            ? ` — refer to the ${line.refer_to} page`
            : ` — refer to ${line.refer_to} (page not in this pack)`
          if (!line.in_pack) this.doc.setTextColor(185, 28, 28)
          // Both halves are coach-entered free text (the account name and the
          // page it refers to), so the pair can be wider than the paper. The
          // first fragment sits after the bold label; the rest wraps to the
          // margin instead of running off the edge.
          const suffixLines: string[] = this.doc.splitTextToSize(
            suffix,
            Math.max(20, available - labelWidth),
          )
          this.doc.text(suffixLines[0] ?? '', this.margin + labelWidth, y)
          for (const extra of suffixLines.slice(1)) {
            y += 4.5
            if (y > this.pageHeight - this.margin - 6) {
              this.addPage('landscape')
              y = this.yPosition
            }
            this.doc.text(extra, this.margin, y)
          }
          y += 4.5
        }
        this.doc.setTextColor(0, 0, 0)
      }
    }
  }

  // =====================================================================
  // YTD Detail (PORTRAIT — fewer columns)
  // =====================================================================
  private addYTDSummary(): void {
    this.addPage('portrait')

    this.drawPageTitle(`YTD Detail — FY${this.report.fiscal_year}`)

    const settings = this.report.settings
    const ytdYardstick = statementYardstick(this.report)
    // The note, not just the column head. This page renames its budget column
    // and then pushes 'Unspent' and 'Annual' — budget-derived columns too
    // narrow to rename, which is exactly what the note exists to name. Without
    // it they were the last unqualified budget money in Urban Road's pack.
    this.drawNoBudgetNotice()
    if (ytdYardstick.note) this.drawNote(ytdYardstick.note)
    const headers = ['Account', ytdYardstick.ytdColumnLabel, 'YTD Actual', 'YTD Var ($)', 'YTD Var (%)']
    const varianceCols = [3] // the dollar variance only — see above
    if (settings.show_unspent_budget) headers.push('Unspent')
    if (settings.show_budget_annual_total) headers.push('Annual')

    const tableData: any[] = []
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0

    for (const section of this.report.sections) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: section.category,
        colSpan: headers.length,
        styles: { fillColor: [107, 114, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      }])
      currentBodyIdx++

      for (const line of withoutSilentLines(section.lines)) {
        const row: any[] = [
          line.is_budget_only ? `${line.account_name} (budget only)` : line.account_name,
          this.budgetCell(line.ytd_budget),
          this.fmtCurrency(line.ytd_actual),
          this.varianceCell(line.ytd_variance_amount),
          this.variancePctCell(line.ytd_variance_percent, line.ytd_budget),
        ]
        if (settings.show_unspent_budget) row.push(this.budgetCell(line.unspent_budget))
        if (settings.show_budget_annual_total) row.push(this.budgetCell(line.budget_annual_total))
        tableData.push(row)
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      const st = section.subtotal
      const subtotalRow: any[] = [
        { content: st.account_name, styles: { fontStyle: 'bold' } },
        this.budgetCell(st.ytd_budget),
        this.fmtCurrency(st.ytd_actual),
        this.varianceCell(st.ytd_variance_amount),
        this.variancePctCell(st.ytd_variance_percent, st.ytd_budget),
      ]
      if (settings.show_unspent_budget) subtotalRow.push(this.budgetCell(st.unspent_budget))
      if (settings.show_budget_annual_total) subtotalRow.push(this.budgetCell(st.budget_annual_total))
      tableData.push(subtotalRow)
      currentBodyIdx++
    }

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // Variance tinting for normal data rows
        if (data.section === 'body' && !specialRowIndices.has(data.row.index) && varianceCols.includes(data.column.index)) {
          this.applyVarianceTint(data)
        }
      },
    })

  }

  /**
   * WD.3 — which Budget-vs-Actual table the standing "refer to …" lines belong
   * under, as a widget id (null = the legacy unfiltered statement).
   *
   * The lines used to render only under an UNFILTERED statement. The Calxa page
   * order has no unfiltered page — only the three section-scoped tables at
   * pages 4, 6 and 10 — so Matt's standing lines ("Wages & Salaries | Refer to
   * Payroll Summary Page" and the two "refer to summary page" ones) disappeared
   * from the pack entirely, while Calxa prints them under the expenses table.
   *
   * pickStandingCommentaryHost holds the ordering rule and the reasoning.
   */
  private standingHostWidgetId(): string | null {
    if (this.standingHostId !== undefined) return this.standingHostId

    const tables = (this.activeLayout?.pages ?? [])
      .flatMap((page) => (Array.isArray(page.widgets) ? page.widgets : []))
      .filter((w) => w.type === 'budget_vs_actual')
      .map((w) => ({ id: w.id, filter: resolveSectionFilter(w.config) }))

    // No layout, or a layout with no statement at all: null, and the caller
    // falls back to the legacy flow's single unfiltered call.
    this.standingHostId = pickStandingCommentaryHost(tables)
    return this.standingHostId
  }

  /**
   * WD.3 — the page labels actually in this pack, for the standing-line gate.
   * Derived from what the default flow / data would render, not from wishes.
   */
  private packPageLabels(): string[] {
    const sec = this.options.sections
    const labels = ['Cover', 'Executive Summary', 'Budget vs Actual', 'Actual vs Budget']
    if (this.report.settings.show_ytd) labels.push('YTD Summary')
    if ((this.options.memo ?? '').trim() !== '') labels.push('Memo')
    if (this.options.subscriptionDetail) labels.push('Subscription Analysis', 'Subscriptions')
    if (this.options.wagesDetail) labels.push('Wages Analysis', 'Wages', 'Payroll Analysis', 'Payroll')
    if (this.options.cashflowForecast) labels.push('Cashflow Forecast', 'Cashflow')
    if (this.options.fullYearReport) labels.push('Full Year Projection', 'Full Year')
    if (this.options.moneyFlow?.comparable) labels.push('Where Did Our Money Go', 'Money Flow')
    if ((sec?.trend_charts ?? true) && this.options.fullYearReport) {
      labels.push('Income Analysis', 'COGS Analysis', 'Expense Analysis', 'Trends')
    }
    for (const s of this.options.externalMetrics ?? []) {
      if (s.values.length > 0) labels.push(s.display_name)
    }
    return labels
  }

  // =====================================================================
  // Subscription Analysis (PORTRAIT — 5 narrow columns)
  // =====================================================================
  private addSubscriptionDetailPage(): void {
    const detail = this.options.subscriptionDetail!
    this.addPage('portrait')

    this.drawPageTitle(`Subscription Analysis — ${this.formatMonth(this.report.report_month)}`)

    const reportMonth = detail.report_month || this.report.report_month
    const currentLabel = this.formatShortMonth(reportMonth)
    const priorLabel = this.formatPriorShortMonth(reportMonth)

    const headers = ['Vendor', priorLabel, 'Budget', currentLabel, 'Variance']
    const varianceCols = [4] // Variance column
    const tableData: any[] = []
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0

    for (const account of detail.accounts) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: account.account_name,
        colSpan: 5,
        // The one page the restyle never reached. An orange band here made the
        // Subscription page the most obviously off-brand sheet in the pack.
        styles: { fillColor: GROUP_SHADE, textColor: SECTION_TEXT, fontStyle: 'bold', fontSize: 8 },
      }])
      currentBodyIdx++

      for (const v of account.vendors) {
        const label = (v.budget === 0 && v.actual > 0) ? `${v.vendor_name} *` : v.vendor_name
        tableData.push([
          label,
          v.prior_month_actual !== 0 ? this.fmtCurrency(v.prior_month_actual) : '—',
          v.budget !== 0 ? this.fmtCurrency(v.budget) : '—',
          this.fmtCurrency(v.actual),
          v.budget !== 0 ? this.fmtVariance(v.variance) : '—',
        ])
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      tableData.push([
        { content: `Subtotal — ${account.account_name}`, styles: { fontStyle: 'bold' } },
        { content: this.fmtCurrency(account.total_prior_month), styles: { fontStyle: 'bold' } },
        { content: this.fmtCurrency(account.total_budget), styles: { fontStyle: 'bold' } },
        { content: this.fmtCurrency(account.total_actual), styles: { fontStyle: 'bold' } },
        { content: this.fmtVariance(account.total_variance), styles: { fontStyle: 'bold' } },
      ])
      currentBodyIdx++
    }

    specialRowIndices.add(currentBodyIdx)
    const gtStyle = { fontStyle: 'bold' as const, fillColor: NAVY as number[], textColor: [255, 255, 255] as number[] }
    tableData.push([
      { content: 'Grand Total', styles: gtStyle },
      { content: this.fmtCurrency(detail.grand_total.prior_month), styles: gtStyle },
      { content: this.fmtCurrency(detail.grand_total.budget), styles: gtStyle },
      { content: this.fmtCurrency(detail.grand_total.actual), styles: gtStyle },
      { content: this.fmtVariance(detail.grand_total.variance), styles: gtStyle },
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // Variance tinting for vendor rows
        if (data.section === 'body' && !specialRowIndices.has(data.row.index) && varianceCols.includes(data.column.index)) {
          this.applyVarianceTint(data)
        }
      },
    })
  }

  // =====================================================================
  // Wages Analysis (PORTRAIT — few columns)
  // =====================================================================
  private addWagesDetailPage(): void {
    const detail = this.options.wagesDetail!
    this.addPage('portrait')

    this.drawPageTitle(`Wages Analysis — ${this.formatMonth(this.report.report_month)}`)

    // The word over the money, from the resolution the ROUTE used — the same
    // helper, the same words as the browser tab. This page read
    // forecast_pl_lines unconditionally until the budget moved behind the
    // resolver, so on a budget-store client's pack an unqualified "Budget" here
    // sat four pages from an "Approved Budget" naming a different number for
    // the same account.
    const yardstick = wagesYardstick(detail.budget_provenance)
    if (yardstick.absentNote) this.drawReasonCard(yardstick.absentNote)
    if (yardstick.note) this.drawNote(yardstick.note)

    const headers = ['Account Name', yardstick.columnLabel, 'Actual', 'Var ($)', 'Var (%)']
    const varianceCols = [3, 4]
    const tableData: any[] = []
    // Three states, the tab's: a figure, or a dash with the reason stated
    // above. Never $0 — which on this page reads as "we budget nothing for our
    // team" and turns the whole actual into a favourable variance.
    const budgetCell = (v: number) => (yardstick.available ? this.fmtCurrency(v) : '—')
    const varCell = (v: number) => (yardstick.available ? this.fmtVariance(v) : '—')
    const pctCell = (v: number) => (yardstick.available ? this.fmtPct(v) : '—')

    for (const account of detail.accounts) {
      tableData.push([
        account.account_name,
        budgetCell(account.budget),
        this.fmtCurrency(account.actual),
        varCell(account.variance),
        pctCell(account.variance_percent),
      ])
    }

    const gtVarPct = detail.grand_total.budget > 0
      ? ((detail.grand_total.budget - detail.grand_total.actual) / detail.grand_total.budget * 100)
      : 0
    const grandTotalIdx = tableData.length
    tableData.push([
      { content: 'Grand Total', styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: budgetCell(detail.grand_total.budget), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: this.fmtCurrency(detail.grand_total.actual), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: varCell(detail.grand_total.variance), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: pctCell(gtVarPct), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // Variance tinting for account rows (not grand total)
        if (data.section === 'body' && data.row.index !== grandTotalIdx && varianceCols.includes(data.column.index)) {
          this.applyVarianceTint(data)
        }
      },
    })

    // Employee detail section
    if (detail.employees.length > 0) {
      const finalY = (this.doc as any).lastAutoTable?.finalY || this.yPosition + 40
      this.yPosition = finalY + 10

      this.doc.setFontSize(11)
      this.doc.setFont('helvetica', 'bold')
      this.doc.text('Employee Detail', this.margin, this.yPosition)
      this.yPosition += 6

      // A different object from the table above: only a forecast carries a
      // per-employee plan, and the approved budget is not split by employee.
      const empYardstick = wagesEmployeeYardstick(
        detail.budget_provenance,
        detail.employee_plan_available ?? true,
      )
      if (empYardstick.absentNote) this.drawReasonCard(empYardstick.absentNote)
      if (empYardstick.note) this.drawNote(empYardstick.note)

      const empHeaders = ['Employee', 'Total Paid', empYardstick.columnLabel, 'Var ($)']
      const empData = detail.employees.map(e => [
        e.name,
        this.fmtCurrency(e.actual_total),
        empYardstick.available ? this.fmtCurrency(e.budget_total) : '—',
        empYardstick.available ? this.fmtVariance(e.variance) : '—',
      ])

      autoTable(this.doc, {
        startY: this.yPosition,
        head: [empHeaders],
        body: empData,
        theme: 'grid',
        headStyles: { fillColor: [107, 114, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { left: this.margin, right: this.margin },
        didParseCell: (data) => {
          // Variance tinting for employee var column
          if (data.section === 'body' && data.column.index === 3) {
            this.applyVarianceTint(data)
          }
        },
      })
    }
  }

  // =====================================================================
  // External Metrics (PORTRAIT — WE.1b, the entered non-Xero inserts)
  // =====================================================================
  private addExternalMetricPage(series: import('../types').ExternalMetricSeriesData): void {
    this.addPage('portrait')

    this.drawPageTitle(`${series.display_name} — ${this.formatMonth(this.report.report_month)}`)

    // Only measures that actually carry values render as columns; a measure
    // gets a Budget + Variance pair only when budget values exist for it.
    const byCell = new Map<string, number>()
    const dims = new Set<string>()
    const measuresWithValues = new Set<string>()
    const measuresWithBudget = new Set<string>()
    for (const v of series.values) {
      byCell.set(`${v.dimension_value} ${v.measure_key} ${v.scenario}`, v.value)
      dims.add(v.dimension_value)
      measuresWithValues.add(v.measure_key)
      if (v.scenario === 'budget') measuresWithBudget.add(v.measure_key)
    }
    const measures = series.measures.filter(m => measuresWithValues.has(m.key))
    const rows = [...dims].sort((a, b) => a.localeCompare(b))

    const fmtBy = (format: string | undefined, value: number): string => {
      if (format === 'currency') return this.fmtCurrency(value)
      if (format === 'percent') return `${value.toFixed(1)}%`
      return value.toLocaleString('en-AU', { maximumFractionDigits: 1 })
    }

    // Column plan: dimension + per measure (Actual [, Budget, Var])
    const headers: string[] = [series.dimension_label]
    const columns: { measure: typeof measures[number]; kind: 'actual' | 'budget' | 'variance' }[] = []
    for (const m of measures) {
      const hasBudget = measuresWithBudget.has(m.key)
      headers.push(hasBudget ? `${m.label} Actual` : m.label)
      columns.push({ measure: m, kind: 'actual' })
      if (hasBudget) {
        headers.push(`${m.label} Budget`, 'Var')
        columns.push({ measure: m, kind: 'budget' }, { measure: m, kind: 'variance' })
      }
    }

    const cellValue = (dim: string, m: string, scenario: string): number | null => {
      const v = byCell.get(`${dim} ${m} ${scenario}`)
      return v === undefined ? null : v
    }

    const tableData: any[] = rows.map(dim => [
      dim,
      ...columns.map(({ measure, kind }) => {
        const actual = cellValue(dim, measure.key, 'actual')
        const budget = cellValue(dim, measure.key, 'budget')
        if (kind === 'actual') return actual !== null ? fmtBy(measure.format, actual) : '—'
        if (kind === 'budget') return budget !== null ? fmtBy(measure.format, budget) : '—'
        // Variance renders only when BOTH sides exist — no fake zero.
        return actual !== null && budget !== null ? fmtBy(measure.format, actual - budget) : '—'
      }),
    ])

    // Total row — percent measures don't sum meaningfully, show a dash.
    const totalStyle = { fontStyle: 'bold' as const, fillColor: NAVY as number[], textColor: [255, 255, 255] as number[] }
    tableData.push([
      { content: 'Total', styles: totalStyle },
      ...columns.map(({ measure, kind }) => {
        if (measure.format === 'percent') return { content: '—', styles: totalStyle }
        let sum = 0
        let any = false
        for (const dim of rows) {
          const a = cellValue(dim, measure.key, 'actual')
          const b = cellValue(dim, measure.key, 'budget')
          if (kind === 'actual' && a !== null) { sum += a; any = true }
          if (kind === 'budget' && b !== null) { sum += b; any = true }
          if (kind === 'variance' && a !== null && b !== null) { sum += a - b; any = true }
        }
        return { content: any ? fmtBy(measure.format, sum) : '—', styles: totalStyle }
      }),
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
      },
    })

    // EXT-TIES footnote — three-state: silent when not comparable.
    const tie = series.tie
    if (tie?.comparable) {
      const y = (this.doc as any).lastAutoTable?.finalY ?? this.yPosition
      this.doc.setFontSize(8)
      this.doc.setFont('helvetica', 'normal')
      if (tie.within_tolerance) {
        this.doc.setTextColor(22, 101, 52) // green-800
        this.doc.text(
          `Ties to "${tie.account_name}" in Xero (${this.fmtCurrency(tie.account_actual)}).`,
          this.margin, y + 6,
        )
      } else {
        this.doc.setTextColor(146, 64, 14) // amber-800
        this.doc.text(
          `Entered total ${this.fmtCurrency(tie.series_total)} vs "${tie.account_name}" ${this.fmtCurrency(tie.account_actual)} in Xero — difference ${this.fmtCurrency(Math.abs(tie.delta))}.`,
          this.margin, y + 6,
        )
      }
      this.doc.setTextColor(0, 0, 0)
    }
  }

  // =====================================================================
  // Cashflow Forecast (LANDSCAPE — expanded month-by-month cash budget)
  // =====================================================================
  private addCashflowForecastPage(): void {
    const cf = this.options.cashflowForecast!
    this.addPage('landscape')

    this.drawPageTitle('Cashflow Forecast')
    this.yPosition += 6

    // Alert if bank goes negative
    if (cf.lowest_bank_balance < 0) {
      this.doc.setFontSize(8)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(220, 38, 38)
      const monthLabel = cf.months.find(m => m.month === cf.lowest_bank_month)?.monthLabel || cf.lowest_bank_month
      this.doc.text(
        `Warning: Bank balance goes negative in ${monthLabel} (${this.fmtCashflow(cf.lowest_bank_balance)})`,
        this.margin, this.yPosition
      )
      this.doc.setTextColor(0, 0, 0)
      this.yPosition += 6
    }

    this.doc.setFontSize(7)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(
      `DSO: ${cf.assumptions.dso_days} days | DPO: ${cf.assumptions.dpo_days} days | GST: ${cf.assumptions.gst_registered ? `${cf.assumptions.gst_rate * 100}%` : 'N/A'}`,
      this.margin, this.yPosition
    )
    this.yPosition += 6

    const monthLabels = cf.months.map(m => m.monthLabel)
    const headers = ['', ...monthLabels]
    const fmtC = (v: number) => this.fmtCashflow(v)

    // Collect all unique labels across months for each section
    const allIncomeLabels = new Set<string>()
    const allCOGSLabels = new Set<string>()
    const allExpenseGroups = new Map<string, Set<string>>() // group -> labels
    const allAssetLabels = new Set<string>()
    const allLiabilityLabels = new Set<string>()
    const allOtherIncomeLabels = new Set<string>()

    for (const m of cf.months) {
      for (const l of m.income_lines) allIncomeLabels.add(l.label)
      for (const l of m.cogs_lines) allCOGSLabels.add(l.label)
      for (const g of m.expense_groups) {
        if (!allExpenseGroups.has(g.group)) allExpenseGroups.set(g.group, new Set())
        for (const l of g.lines) allExpenseGroups.get(g.group)!.add(l.label)
      }
      for (const l of m.asset_lines) allAssetLabels.add(l.label)
      for (const l of m.liability_lines) allLiabilityLabels.add(l.label)
      for (const l of m.other_income_lines) allOtherIncomeLabels.add(l.label)
    }

    // Style definitions
    const GRAY_BG: [number, number, number] = [243, 244, 246]
    const SECTION_BG: [number, number, number] = [229, 231, 235]
    const navyS = { fontStyle: 'bold' as const, fillColor: NAVY as number[], textColor: [255, 255, 255] as number[], fontSize: 6 }
    const sectionS = { fontStyle: 'bold' as const, fillColor: SECTION_BG as number[], fontSize: 6 }
    const subtotalS = { fontStyle: 'bold' as const, fillColor: GRAY_BG as number[], fontSize: 6 }
    const groupHeaderS = { fontStyle: 'bold' as const, fontSize: 6 }
    const detailS = { fontSize: 6 }
    const boldS = { fontStyle: 'bold' as const, fontSize: 6 }

    // Helper: build a styled row
    const makeRow = (label: string, values: number[], style: Record<string, any>): any[] => {
      const cells: any[] = [{ content: label, styles: style }]
      for (const v of values) cells.push({ content: fmtC(v), styles: style })
      return cells
    }

    const makeDetailRow = (label: string, values: number[]): any[] => {
      const cells: any[] = [{ content: `    ${label}`, styles: detailS }]
      for (const v of values) cells.push({ content: fmtC(v), styles: detailS })
      return cells
    }

    const getLineValue = (lines: { label: string; value: number }[], label: string) =>
      lines.find(l => l.label === label)?.value || 0

    const tableData: any[][] = []

    // Bank at Beginning
    tableData.push(makeRow('Bank at Beginning', cf.months.map(m => m.bank_at_beginning), navyS))

    // Income section
    tableData.push(makeRow('Income', [], sectionS).slice(0, 1).concat(
      cf.months.map(() => ({ content: '', styles: sectionS }))
    ))
    for (const label of allIncomeLabels) {
      tableData.push(makeDetailRow(label, cf.months.map(m => getLineValue(m.income_lines, label))))
    }
    tableData.push(makeRow('Cash Inflows from Operations', cf.months.map(m => m.cash_inflows), subtotalS))

    // COGS section
    if (allCOGSLabels.size > 0) {
      tableData.push(makeRow('Cost of Sales', [], sectionS).slice(0, 1).concat(
        cf.months.map(() => ({ content: '', styles: sectionS }))
      ))
      for (const label of allCOGSLabels) {
        tableData.push(makeDetailRow(label, cf.months.map(m => getLineValue(m.cogs_lines, label))))
      }
    }

    // Expenses section
    if (allExpenseGroups.size > 0) {
      tableData.push(makeRow('Expenses', [], sectionS).slice(0, 1).concat(
        cf.months.map(() => ({ content: '', styles: sectionS }))
      ))
      for (const [groupName, labels] of allExpenseGroups) {
        // Group header with subtotal values
        tableData.push(makeRow(`  ${groupName}`, cf.months.map(m => {
          const g = m.expense_groups.find(eg => eg.group === groupName)
          return g?.subtotal || 0
        }), groupHeaderS))
        // Individual lines within group
        for (const label of labels) {
          tableData.push(makeDetailRow(label, cf.months.map(m => {
            const g = m.expense_groups.find(eg => eg.group === groupName)
            return g ? getLineValue(g.lines, label) : 0
          })))
        }
      }
    }

    // Cash Outflows
    tableData.push(makeRow('Cash Outflows from Operations', cf.months.map(m => -m.cash_outflows), subtotalS))

    // Assets
    if (allAssetLabels.size > 0) {
      tableData.push(makeRow('Balance Sheet — Assets', [], sectionS).slice(0, 1).concat(
        cf.months.map(() => ({ content: '', styles: sectionS }))
      ))
      for (const label of allAssetLabels) {
        tableData.push(makeDetailRow(label, cf.months.map(m => getLineValue(m.asset_lines, label))))
      }
      tableData.push(makeRow('Movement in Assets', cf.months.map(m => m.movement_in_assets), subtotalS))
    }

    // Liabilities
    if (allLiabilityLabels.size > 0) {
      tableData.push(makeRow('Balance Sheet — Liabilities', [], sectionS).slice(0, 1).concat(
        cf.months.map(() => ({ content: '', styles: sectionS }))
      ))
      for (const label of allLiabilityLabels) {
        tableData.push(makeDetailRow(label, cf.months.map(m => getLineValue(m.liability_lines, label))))
      }
      tableData.push(makeRow('Movement in Liabilities', cf.months.map(m => m.movement_in_liabilities), subtotalS))
    }

    // Other Income
    if (allOtherIncomeLabels.size > 0) {
      tableData.push(makeRow('Other Income', [], sectionS).slice(0, 1).concat(
        cf.months.map(() => ({ content: '', styles: sectionS }))
      ))
      for (const label of allOtherIncomeLabels) {
        tableData.push(makeDetailRow(label, cf.months.map(m => getLineValue(m.other_income_lines, label))))
      }
      tableData.push(makeRow('Other Inflows', cf.months.map(m => m.other_inflows), subtotalS))
    }

    // Net Movement
    tableData.push(makeRow('Net Movement', cf.months.map(m => m.net_movement), boldS))

    // Bank at End — red text if negative
    const bankEndRow: any[] = [{ content: 'Bank at End', styles: navyS }]
    for (const m of cf.months) {
      bankEndRow.push({
        content: fmtC(m.bank_at_end),
        styles: { ...navyS, textColor: m.bank_at_end < 0 ? [248, 113, 113] : [255, 255, 255] },
      })
    }
    tableData.push(bankEndRow)

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 6, halign: 'center' },
      bodyStyles: { fontSize: 6 },
      columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // Red text for negative values in detail rows
        if (data.section === 'body' && data.column.index > 0) {
          const text = typeof data.cell.raw === 'string' ? data.cell.raw : ''
          if (text.startsWith('(')) {
            data.cell.styles.textColor = [220, 38, 38]
          }
        }
      },
    })
  }

  // =====================================================================
  // Cashflow Forecast Chart (LANDSCAPE — stacked bar chart + bank line)
  // =====================================================================
  private addCashflowForecastChartPage(): void {
    const cf = this.options.cashflowForecast!
    const chartData = transformCashflowToChartData(cf)
    this.addPage('landscape')

    // Title
    this.drawPageTitle('Cashflow Forecast')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Monthly Inflows vs Outflows with Bank Balance', this.margin, this.yPosition)
    this.yPosition += 8

    // Legend
    const legendItems = [
      ...CASHFLOW_CHART_SERIES.map(s => ({ label: s.label, color: CASHFLOW_CHART_COLORS[s.key as keyof typeof CASHFLOW_CHART_COLORS].rgb })),
      { label: 'Bank at End', color: CASHFLOW_CHART_COLORS.bankAtEnd.rgb },
    ]
    let legendX = this.margin
    for (const item of legendItems) {
      this.doc.setFillColor(item.color[0], item.color[1], item.color[2])
      this.doc.rect(legendX, this.yPosition - 2.5, 3, 3, 'F')
      this.doc.setFontSize(7)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(0, 0, 0)
      this.doc.text(item.label, legendX + 4.5, this.yPosition)
      legendX += this.doc.getTextWidth(item.label) + 10
    }
    this.yPosition += 8

    // Chart area dimensions
    const chartLeft = this.margin + 18 // room for Y-axis labels
    const chartRight = this.pageWidth - this.margin
    const chartTop = this.yPosition
    const chartHeight = 130
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    // Calculate value range
    const allPositive: number[] = []
    const allNegative: number[] = []
    for (const d of chartData) {
      const posSum = d.income + d.otherIncome
      const negSum = d.costOfSales + d.expenses + d.liabilities // already negative
      allPositive.push(posSum, d.bankAtEnd)
      allNegative.push(negSum, d.bankAtEnd)
    }
    const maxVal = Math.max(0, ...allPositive) * 1.1
    const minVal = Math.min(0, ...allNegative) * 1.1
    const valueRange = maxVal - minVal
    if (valueRange === 0) return

    // Y-coordinate helper
    const yForValue = (v: number): number => {
      return chartTop + ((maxVal - v) / valueRange) * chartHeight
    }

    // Zero line
    const zeroY = yForValue(0)
    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.3)
    this.doc.line(chartLeft, zeroY, chartRight, zeroY)

    // Y-axis grid and labels
    const tickStep = this.calculateTickStep(valueRange)
    this.doc.setFontSize(6)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(107, 114, 128)
    this.doc.setDrawColor(240, 240, 240)
    this.doc.setLineWidth(0.15)

    const firstTick = Math.ceil(minVal / tickStep) * tickStep
    for (let tick = firstTick; tick <= maxVal; tick += tickStep) {
      const y = yForValue(tick)
      if (y < chartTop - 1 || y > chartBottom + 1) continue
      // Grid line
      if (Math.abs(tick) > 0.01) {
        this.doc.line(chartLeft, y, chartRight, y)
      }
      // Label
      this.doc.text(this.fmtAxisLabel(tick), chartLeft - 2, y + 1.5, { align: 'right' })
    }

    // Draw bars and bank line
    const monthCount = chartData.length
    const slotWidth = chartWidth / monthCount
    const barWidth = Math.min(slotWidth * 0.6, 14) // cap bar width

    const bankLinePoints: { x: number; y: number }[] = []

    for (let i = 0; i < monthCount; i++) {
      const d = chartData[i]
      const centerX = chartLeft + (i + 0.5) * slotWidth
      const barX = centerX - barWidth / 2

      // Stack positive bars upward from zero
      let posBase = zeroY
      const positiveSeries: { key: string; value: number; rgb: [number, number, number] }[] = [
        { key: 'income', value: d.income, rgb: CASHFLOW_CHART_COLORS.income.rgb },
        { key: 'otherIncome', value: d.otherIncome, rgb: CASHFLOW_CHART_COLORS.otherIncome.rgb },
      ]
      for (const s of positiveSeries) {
        if (s.value <= 0) continue
        const barH = (s.value / valueRange) * chartHeight
        this.doc.setFillColor(s.rgb[0], s.rgb[1], s.rgb[2])
        this.doc.rect(barX, posBase - barH, barWidth, barH, 'F')
        posBase -= barH
      }

      // Stack negative bars downward from zero
      let negBase = zeroY
      const negativeSeries: { key: string; value: number; rgb: [number, number, number] }[] = [
        { key: 'costOfSales', value: d.costOfSales, rgb: CASHFLOW_CHART_COLORS.costOfSales.rgb },
        { key: 'expenses', value: d.expenses, rgb: CASHFLOW_CHART_COLORS.expenses.rgb },
        { key: 'liabilities', value: d.liabilities, rgb: CASHFLOW_CHART_COLORS.liabilities.rgb },
      ]
      for (const s of negativeSeries) {
        if (s.value >= 0) continue
        const barH = (Math.abs(s.value) / valueRange) * chartHeight
        this.doc.setFillColor(s.rgb[0], s.rgb[1], s.rgb[2])
        this.doc.rect(barX, negBase, barWidth, barH, 'F')
        negBase += barH
      }

      // Bank line point
      bankLinePoints.push({ x: centerX, y: yForValue(d.bankAtEnd) })

      // X-axis label
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(d.monthLabel, centerX, chartBottom + 5, { align: 'center' })
    }

    // Draw bank balance line
    if (bankLinePoints.length > 1) {
      const [r, g, b] = CASHFLOW_CHART_COLORS.bankAtEnd.rgb
      this.doc.setDrawColor(r, g, b)
      this.doc.setLineWidth(0.6)
      for (let i = 0; i < bankLinePoints.length - 1; i++) {
        const p1 = bankLinePoints[i]
        const p2 = bankLinePoints[i + 1]
        this.doc.line(p1.x, p1.y, p2.x, p2.y)
      }
      // Dots
      this.doc.setFillColor(r, g, b)
      for (const p of bankLinePoints) {
        this.doc.circle(p.x, p.y, 1, 'F')
      }
    }

    // Chart border
    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.2)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')
  }

  /** Calculate a reasonable tick step for axis labels */
  private calculateTickStep(range: number): number {
    const rough = range / 6
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
    const residual = rough / magnitude
    if (residual <= 1.5) return magnitude
    if (residual <= 3.5) return 2 * magnitude
    if (residual <= 7.5) return 5 * magnitude
    return 10 * magnitude
  }

  /** Format axis label as compact currency */
  private fmtAxisLabel(value: number): string {
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
    return `${sign}$${abs.toFixed(0)}`
  }

  private fmtCashflow(value: number): string {
    if (Math.abs(value) < 1) return '-'
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return value < 0 ? `(${formatted})` : formatted
  }

  // =====================================================================
  // Full Year Projection (LANDSCAPE — 12 months + summary columns)
  // =====================================================================
  private addFullYearProjection(): void {
    const fy = this.options.fullYearReport!
    this.addPage('landscape')

    this.drawPageTitle(`Full Year Projection — FY${fy.fiscal_year}`)
    this.yPosition += 6

    // The approved budget only earns a column when the budget store actually
    // answered. Same predicate as the browser tab, from the same module, so the
    // pack and the screen can never disagree about whether the yardstick is
    // there — and an approved column is never printed empty, because a blank
    // budget cell is read as zero.
    const showApproved = hasApprovedBudget(fy)

    // Every variance column on this page is projection-vs-FORECAST — the
    // headers say "Var vs Fcst" — so the subtitle must not claim the page is
    // "measured against" the approved version, which is a second yardstick
    // shown beside them and not the one they are computed from. The browser tab
    // states it neutrally; two surfaces of one page do not get to describe it
    // differently.
    const showForecast = hasForecastBudget(fy)

    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'normal')
    const through = `Actuals through ${this.formatMonth(fy.last_actual_month)}`
    const trailer = showForecast ? (showApproved ? ', then forecast' : ', then budget forecast') : ''
    const approvedNote = showApproved
      ? ` · Approved budget: ${fy.approved_budget_label || 'unnamed version'}`
      : ''
    // Wrapped: the approved version's own label rides on the end of this line
    // (Urban Road's is 37 characters), and jsPDF does not wrap — it prints off
    // the edge of the paper and the overflow is simply lost.
    this.drawNote(`${through}${trailer}${approvedNote}`, undefined, { fontSize: 8, color: [0, 0, 0] })
    this.yPosition += 1.5

    // Dashes down two columns with nothing explaining them get an explanation
    // supplied by the reader, and it is usually the wrong one.
    const absentNote = forecastAbsentNote(fy)
    if (absentNote) {
      this.drawNote(absentNote, undefined, { fontSize: 8, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    const monthLabels = fy.gross_profit.months.map(m => {
      const d = new Date(m.month + '-01')
      return d.toLocaleDateString('en-AU', { month: 'short' })
    })

    // With the approved budget beside it, "Budget" stops naming anything in
    // particular, so the prediction becomes "Forecast" and the yardstick takes
    // the name. The variance headings name their referent for the same reason:
    // adjacent to "Approved Budget" they read as a variance to it, and they are
    // still projection-vs-forecast — the route computes them that way and this
    // change deliberately does not restate a single number.
    const headers = showApproved
      ? ['Account', ...monthLabels, 'Projected', 'Forecast', 'Approved Budget', 'Var vs Fcst ($)', 'Var vs Fcst (%)']
      : ['Account', ...monthLabels, 'Projected', 'Budget', 'Var ($)', 'Var (%)']
    // Variance columns are the last two
    const varianceCols = [headers.length - 2, headers.length - 1]
    const tableData: any[] = []
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0

    // Section names are LABELS, not warnings. The pack used emerald for Revenue,
    // red for Cost of Sales and amber for Operating Expenses — saturated
    // full-width bands that read as alarms, and they consumed the one colour the
    // page actually needs, which is red for an unfavourable figure. Calxa gives
    // the section a quiet grey heading over a rule and spends its red on the
    // numbers.

    // A forecast cell, or the absent mark. Only a month that has NOT closed and
    // the forecast-derived totals go through this; actuals are unaffected.
    const fcst = (v: number) => formatForecastValue(v, showForecast, (n) => this.fmtCurrency(n))
    const fcstVar = (v: number) => formatForecastValue(v, showForecast, (n) => this.fmtVariance(n))
    const fcstPct = (v: number) => formatForecastValue(v, showForecast, (n) => this.fmtPct(n))

    for (const section of fy.sections) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: section.category,
        colSpan: headers.length,
        styles: {
          fillColor: [255, 255, 255] as [number, number, number],
          textColor: [SECTION_TEXT[0], SECTION_TEXT[1], SECTION_TEXT[2]] as [number, number, number],
          fontStyle: 'bold',
          fontSize: 6,
          lineWidth: { top: 0, right: 0, bottom: 0.3, left: 0 },
          lineColor: [RULE_STRONG[0], RULE_STRONG[1], RULE_STRONG[2]] as [number, number, number],
        },
      }])
      currentBodyIdx++

      for (const line of withoutSilentFullYearLines(section.lines)) {
        const row: any[] = [line.account_name]
        for (const md of line.months) {
          row.push(md.source === 'actual' ? this.fmtCurrency(md.actual) : fcst(md.budget))
        }
        row.push(this.fmtCurrency(line.projected_total))
        row.push(fcst(line.annual_budget))
        if (showApproved) row.push(formatApprovedAnnual(line, (n) => this.fmtCurrency(n)))
        row.push(fcstVar(line.variance_amount))
        row.push(fcstPct(line.variance_percent))
        tableData.push(row)
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      const st = section.subtotal
      const stRow: any[] = [{ content: st.account_name, styles: { fontStyle: 'bold' } }]
      for (const md of st.months) {
        stRow.push({ content: md.source === 'actual' ? this.fmtCurrency(md.actual) : fcst(md.budget), styles: { fontStyle: 'bold' } })
      }
      stRow.push({ content: this.fmtCurrency(st.projected_total), styles: { fontStyle: 'bold' } })
      stRow.push({ content: fcst(st.annual_budget), styles: { fontStyle: 'bold' } })
      if (showApproved) stRow.push({ content: formatApprovedAnnual(st, (n) => this.fmtCurrency(n)), styles: { fontStyle: 'bold' } })
      stRow.push({ content: fcstVar(st.variance_amount), styles: { fontStyle: 'bold' } })
      stRow.push({ content: fcstPct(st.variance_percent), styles: { fontStyle: 'bold' } })
      tableData.push(stRow)
      currentBodyIdx++

      // GP after COGS
      if (section.category === 'Cost of Sales') {
        specialRowIndices.add(currentBodyIdx)
        const gpLine = fy.gross_profit
        const gpRow: any[] = [{ content: 'Gross Profit', styles: { fontStyle: 'bold', fillColor: GP_BLUE } }]
        for (const md of gpLine.months) {
          gpRow.push({ content: md.source === 'actual' ? this.fmtCurrency(md.actual) : fcst(md.budget), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        }
        gpRow.push({ content: this.fmtCurrency(gpLine.projected_total), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: fcst(gpLine.annual_budget), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        if (showApproved) gpRow.push({ content: formatApprovedAnnual(gpLine, (n) => this.fmtCurrency(n)), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: fcstVar(gpLine.variance_amount), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: fcstPct(gpLine.variance_percent), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        tableData.push(gpRow)
        currentBodyIdx++
      }
    }

    // Net Profit
    specialRowIndices.add(currentBodyIdx)
    const np = fy.net_profit
    const npStyle = { fillColor: NAVY as number[], textColor: [255, 255, 255] as number[], fontStyle: 'bold' as const }
    const npRow: any[] = [{ content: 'Net Profit', styles: npStyle }]
    for (const md of np.months) {
      npRow.push({ content: md.source === 'actual' ? this.fmtCurrency(md.actual) : fcst(md.budget), styles: npStyle })
    }
    npRow.push({ content: this.fmtCurrency(np.projected_total), styles: npStyle })
    npRow.push({ content: fcst(np.annual_budget), styles: npStyle })
    if (showApproved) npRow.push({ content: formatApprovedAnnual(np, (n) => this.fmtCurrency(n)), styles: npStyle })
    npRow.push({ content: fcstVar(np.variance_amount), styles: npStyle })
    npRow.push({ content: fcstPct(np.variance_percent), styles: npStyle })
    tableData.push(npRow)

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 5.5 },
      bodyStyles: { fontSize: 5.5 },
      columnStyles: { 0: { cellWidth: 38 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'right'
        }
        // Variance tinting for normal data rows. Skipped entirely with no
        // forecast: the cells hold a mark, and tinting a mark green would be
        // the same false claim in colour that the number was in figures.
        if (showForecast && data.section === 'body' && !specialRowIndices.has(data.row.index) && varianceCols.includes(data.column.index)) {
          this.applyVarianceTint(data)
        }
      },
    })
  }

  // =====================================================================
  // Chart Pages
  // =====================================================================

  private addRevenueBreakdownChartPage(): void {
    const data = transformRevenueBreakdownData(this.report)
    if (data.length === 0) return
    this.addPage('portrait')

    this.drawPageTitle('Where Your Revenue Goes')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Breakdown of every dollar earned', this.margin, this.yPosition)
    this.yPosition += 12

    const totalValue = data.reduce((sum, d) => sum + d.value, 0)
    if (totalValue <= 0) return

    // Draw donut chart
    const centerX = this.pageWidth / 2
    const centerY = this.yPosition + 55
    const outerRadius = 50
    const innerRadius = 28

    let startAngle = -Math.PI / 2 // Start from top

    for (const slice of data) {
      const sliceAngle = (slice.value / totalValue) * 2 * Math.PI
      const endAngle = startAngle + sliceAngle

      // Parse color from hex
      const hex = slice.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      this.doc.setFillColor(r, g, b)

      // Draw arc segment as a filled polygon
      const points: [number, number][] = []
      const steps = Math.max(20, Math.ceil((sliceAngle / (2 * Math.PI)) * 60))

      // Outer arc
      for (let j = 0; j <= steps; j++) {
        const angle = startAngle + (sliceAngle * j) / steps
        points.push([centerX + outerRadius * Math.cos(angle), centerY + outerRadius * Math.sin(angle)])
      }
      // Inner arc (reverse)
      for (let j = steps; j >= 0; j--) {
        const angle = startAngle + (sliceAngle * j) / steps
        points.push([centerX + innerRadius * Math.cos(angle), centerY + innerRadius * Math.sin(angle)])
      }

      // Draw filled polygon
      if (points.length > 2) {
        const lines: number[][] = points.map(p => [p[0], p[1]])
        this.doc.setLineWidth(0.5)
        this.doc.setDrawColor(255, 255, 255)
        // Move to first point
        let pathStr = `${lines[0][0]} ${lines[0][1]} m`
        for (let j = 1; j < lines.length; j++) {
          pathStr += ` ${lines[j][0]} ${lines[j][1]} l`
        }
        // Use triangle fan approach for filling
        for (let j = 1; j < lines.length - 1; j++) {
          this.doc.triangle(
            lines[0][0], lines[0][1],
            lines[j][0], lines[j][1],
            lines[j + 1][0], lines[j + 1][1],
            'F'
          )
        }
      }

      // Label on the slice
      const midAngle = startAngle + sliceAngle / 2
      const labelRadius = (outerRadius + innerRadius) / 2
      const labelX = centerX + labelRadius * Math.cos(midAngle)
      const labelY = centerY + labelRadius * Math.sin(midAngle)

      if (slice.pctOfRevenue >= 8) {
        this.doc.setFontSize(7)
        this.doc.setFont('helvetica', 'bold')
        this.doc.setTextColor(255, 255, 255)
        this.doc.text(`${slice.pctOfRevenue.toFixed(0)}%`, labelX, labelY + 1, { align: 'center' })
      }

      startAngle = endAngle
    }

    // Legend below chart
    this.yPosition = centerY + outerRadius + 15
    for (const slice of data) {
      const hex = slice.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)

      this.doc.setFillColor(r, g, b)
      this.doc.rect(this.margin, this.yPosition - 2.5, 4, 4, 'F')
      this.doc.setFontSize(9)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(0, 0, 0)
      this.doc.text(`${slice.name} — ${this.fmtAxisLabel(slice.value)} (${slice.pctOfRevenue.toFixed(1)}%)`, this.margin + 7, this.yPosition)
      this.yPosition += 7
    }

    this.doc.setTextColor(0, 0, 0)
  }

  private addBreakEvenChartPage(): void {
    const fy = this.options.fullYearReport!
    const { data, summary, forwardAbsentNote } = transformBreakEvenData(fy)
    if (data.length === 0) return
    this.addPage('landscape')

    this.drawPageTitle('Break-Even Analysis')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Revenue needed to cover all costs each month', this.margin, this.yPosition)
    this.yPosition += 8

    // Same series, same sentence as the browser tab: with no forecast the
    // chart stops at the last closed month rather than drawing revenue and the
    // break-even line falling to zero together.
    if (forwardAbsentNote) {
      this.drawNote(forwardAbsentNote, undefined, { fontSize: 9, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    // KPI row
    const isAbove = summary.marginOfSafety >= 0
    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Break-Even: ${this.fmtAxisLabel(summary.currentMonthBreakEven)}/mo`, this.margin, this.yPosition)
    this.doc.text(`Margin of Safety: ${isAbove ? '+' : ''}${this.fmtAxisLabel(summary.marginOfSafety)} (${summary.marginOfSafetyPct.toFixed(1)}%)`, this.margin + 80, this.yPosition)
    this.doc.text(`Months Profitable: ${summary.monthsAboveBreakEven}/${summary.totalMonths}`, this.margin + 180, this.yPosition)
    this.doc.setFont('helvetica', 'normal')
    this.yPosition += 8

    // Legend
    let legendX = this.margin
    for (const item of [{ label: 'Revenue', color: CHART_COLORS.revenue.rgb }, { label: 'Break-Even', color: CHART_COLORS.negative.rgb }]) {
      this.doc.setFillColor(item.color[0], item.color[1], item.color[2])
      this.doc.rect(legendX, this.yPosition - 2.5, 3, 3, 'F')
      this.doc.setFontSize(7)
      this.doc.setTextColor(0, 0, 0)
      this.doc.text(item.label, legendX + 5, this.yPosition)
      legendX += 40
    }
    this.yPosition += 6

    // Chart area
    const chartLeft = this.margin + 18
    const chartRight = this.pageWidth - this.margin
    const chartTop = this.yPosition
    const chartHeight = 110
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    const allValues = data.flatMap(d => [d.revenue, d.breakEvenRevenue])
    const maxVal = Math.max(0, ...allValues) * 1.15
    const minVal = 0
    const valueRange = maxVal - minVal
    if (valueRange === 0) return

    const yForValue = (v: number) => chartTop + ((maxVal - v) / valueRange) * chartHeight

    // Grid
    this.doc.setDrawColor(240, 240, 240)
    this.doc.setLineWidth(0.15)
    const tickStep = this.calculateTickStep(valueRange)
    this.doc.setFontSize(6)
    this.doc.setTextColor(107, 114, 128)
    for (let tick = 0; tick <= maxVal; tick += tickStep) {
      const y = yForValue(tick)
      if (y < chartTop - 1 || y > chartBottom + 1) continue
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.text(this.fmtAxisLabel(tick), chartLeft - 2, y + 1.5, { align: 'right' })
    }

    // Revenue line (solid with area fill)
    this.drawAreaLine(data.map((d, i) => ({
      x: chartLeft + (i + 0.5) * (chartWidth / data.length),
      y: yForValue(d.revenue),
    })), chartBottom, CHART_COLORS.revenue.rgb, 0.15)

    // Break-even line (dashed)
    this.doc.setDrawColor(CHART_COLORS.negative.rgb[0], CHART_COLORS.negative.rgb[1], CHART_COLORS.negative.rgb[2])
    this.doc.setLineWidth(0.6)
    const bePoints = data.map((d, i) => ({
      x: chartLeft + (i + 0.5) * (chartWidth / data.length),
      y: yForValue(d.breakEvenRevenue),
    }))
    for (let i = 0; i < bePoints.length - 1; i++) {
      // Dashed line segments
      const dx = bePoints[i + 1].x - bePoints[i].x
      const dy = bePoints[i + 1].y - bePoints[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      const dashLen = 2
      const gapLen = 1.5
      let pos = 0
      while (pos < len) {
        const startFrac = pos / len
        const endFrac = Math.min((pos + dashLen) / len, 1)
        this.doc.line(
          bePoints[i].x + dx * startFrac, bePoints[i].y + dy * startFrac,
          bePoints[i].x + dx * endFrac, bePoints[i].y + dy * endFrac,
        )
        pos += dashLen + gapLen
      }
    }

    // X-axis labels
    this.doc.setFontSize(6)
    this.doc.setTextColor(107, 114, 128)
    const slotWidth = chartWidth / data.length
    for (let i = 0; i < data.length; i++) {
      const x = chartLeft + (i + 0.5) * slotWidth
      this.doc.text(data[i].monthLabel, x, chartBottom + 5, { align: 'center' })
    }

    // Border
    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.2)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')
    this.doc.setTextColor(0, 0, 0)
  }

  private addRevenueVsExpensesTrendChartPage(): void {
    const fy = this.options.fullYearReport!
    const data = transformRevenueVsExpensesData(fy)
    if (data.length === 0) return
    this.addPage('landscape')

    this.drawPageTitle('Revenue vs Expenses Trend')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Monthly revenue and total expenses with profit gap', this.margin, this.yPosition)
    this.yPosition += 10

    const rveAbsentNote = forwardSeriesAbsentNote(fy)
    if (rveAbsentNote) {
      this.drawNote(rveAbsentNote, undefined, { fontSize: 9, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    // Legend
    let legendX = this.margin
    for (const item of [{ label: 'Revenue', color: CHART_COLORS.revenue.rgb }, { label: 'Expenses', color: CHART_COLORS.expenses.rgb }]) {
      this.doc.setFillColor(item.color[0], item.color[1], item.color[2])
      this.doc.rect(legendX, this.yPosition - 2.5, 3, 3, 'F')
      this.doc.setFontSize(7)
      this.doc.setTextColor(0, 0, 0)
      this.doc.text(item.label, legendX + 4.5, this.yPosition)
      legendX += this.doc.getTextWidth(item.label) + 12
    }
    this.yPosition += 8

    const chartLeft = this.margin + 18
    const chartRight = this.pageWidth - this.margin
    const chartTop = this.yPosition
    const chartHeight = 120
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    const allValues = data.flatMap(d => [d.revenue, d.expenses])
    const maxVal = Math.max(0, ...allValues) * 1.1
    const valueRange = maxVal
    if (valueRange === 0) return

    const yForValue = (v: number) => chartTop + ((maxVal - v) / valueRange) * chartHeight

    // Y-axis
    const tickStep = this.calculateTickStep(valueRange)
    this.doc.setFontSize(6)
    this.doc.setTextColor(107, 114, 128)
    this.doc.setDrawColor(240, 240, 240)
    this.doc.setLineWidth(0.15)
    for (let tick = 0; tick <= maxVal; tick += tickStep) {
      const y = yForValue(tick)
      if (y < chartTop - 1 || y > chartBottom + 1) continue
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.text(this.fmtAxisLabel(tick), chartLeft - 2, y + 1.5, { align: 'right' })
    }

    const monthCount = data.length
    const slotWidth = chartWidth / monthCount

    // Revenue area
    this.drawAreaLine(data.map((d, i) => ({ x: chartLeft + (i + 0.5) * slotWidth, y: yForValue(d.revenue) })), chartBottom, CHART_COLORS.revenue.rgb, 0.2)
    // Expenses area
    this.drawAreaLine(data.map((d, i) => ({ x: chartLeft + (i + 0.5) * slotWidth, y: yForValue(d.expenses) })), chartBottom, CHART_COLORS.expenses.rgb, 0.2)

    // X-axis labels
    for (let i = 0; i < monthCount; i++) {
      const centerX = chartLeft + (i + 0.5) * slotWidth
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(data[i].monthLabel, centerX, chartBottom + 5, { align: 'center' })
    }

    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.2)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')
    this.doc.setTextColor(0, 0, 0)
  }

  private addVarianceHeatmapPage(): void {
    const fy = this.options.fullYearReport!
    const { cells, categories, months } = transformVarianceHeatmapData(fy)
    if (cells.length === 0) return
    this.addPage('landscape')

    // The heading, the yardstick word and the refusal sentence all come from
    // the chart component, because this page and the browser tab are the same
    // chart. When only the tab learned that a missing forecast cannot be drawn,
    // this page went on printing a five-by-twelve grid of on-track green for a
    // client whose forecast does not exist.
    const unavailable = heatmapUnavailableReason(fy)

    this.drawPageTitle(unavailable ? HEATMAP_UNAVAILABLE_TITLE : heatmapTitle(fy))
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(unavailable ? 'Not available for this month' : HEATMAP_SUBTITLE, this.margin, this.yPosition)
    this.yPosition += 10

    if (unavailable) {
      this.drawReasonCard(unavailable)
      return
    }

    const gridLeft = this.margin + 35
    const gridRight = this.pageWidth - this.margin
    const gridWidth = gridRight - gridLeft
    const cellWidth = gridWidth / months.length
    const cellHeight = 14

    // Month headers
    this.doc.setFontSize(7)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(107, 114, 128)
    for (let i = 0; i < months.length; i++) {
      const x = gridLeft + i * cellWidth + cellWidth / 2
      const d = new Date(months[i] + '-01')
      this.doc.text(d.toLocaleDateString('en-AU', { month: 'short' }), x, this.yPosition, { align: 'center' })
    }
    this.yPosition += 4

    // Rows
    for (const cat of categories) {
      // Category label
      this.doc.setFontSize(7)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(55, 65, 81)
      const shortCat = cat === 'Operating Expenses' ? 'OpEx' : cat === 'Cost of Sales' ? 'COGS' : cat === 'Other Income' ? 'Other Inc' : cat === 'Other Expenses' ? 'Other Exp' : cat
      this.doc.text(shortCat, this.margin, this.yPosition + cellHeight / 2 + 1)

      // Cells
      for (let i = 0; i < months.length; i++) {
        const cell = cells.find(c => c.category === cat && c.month === months[i])
        if (!cell) continue
        const color = getHeatmapColor(cell.variancePct)
        const x = gridLeft + i * cellWidth
        // Cell background (lighten color by blending with white at ~30% opacity)
        const bgR = Math.round(color.rgb[0] * 0.3 + 255 * 0.7)
        const bgG = Math.round(color.rgb[1] * 0.3 + 255 * 0.7)
        const bgB = Math.round(color.rgb[2] * 0.3 + 255 * 0.7)
        this.doc.setFillColor(bgR, bgG, bgB)
        this.doc.rect(x + 1, this.yPosition, cellWidth - 2, cellHeight, 'F')
        // Cell text
        this.doc.setFontSize(7)
        this.doc.setFont('helvetica', 'normal')
        this.doc.setTextColor(55, 65, 81)
        const text = `${cell.variancePct >= 0 ? '+' : ''}${cell.variancePct.toFixed(0)}%`
        this.doc.text(text, x + cellWidth / 2, this.yPosition + cellHeight / 2 + 1.5, { align: 'center' })
      }
      this.yPosition += cellHeight + 2
    }

    this.doc.setTextColor(0, 0, 0)
  }

  private addBudgetBurnRateChartPage(): void {
    const data = transformBurnRateData(this.report)
    if (data.length === 0) return
    this.addPage('portrait')

    // Named off the report's own budget_source, from the chart component, so
    // this page and the Charts tab cannot call one number two things. The
    // subtitle used to say "each annual budget" for every client — including
    // the ten whose tab says the bar is a forecast.
    const pctElapsed = data[0]?.pctElapsed || 0
    this.drawPageTitle(burnRateYardstick(this.report).title)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(burnRateSubtitle(this.report, pctElapsed), this.margin, this.yPosition)
    this.yPosition += 10

    const barLeft = this.margin + 40
    const barRight = this.pageWidth - this.margin - 10
    const barWidth = barRight - barLeft
    const barHeight = 10
    const spacing = 18

    for (const item of data) {
      // Label
      this.doc.setFontSize(8)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(55, 65, 81)
      this.doc.text(item.label, this.margin, this.yPosition + barHeight / 2 + 1.5)

      // Background bar
      this.doc.setFillColor(243, 244, 246)
      this.doc.roundedRect(barLeft, this.yPosition, barWidth, barHeight, 2, 2, 'F')

      // Consumed bar
      const consumedWidth = Math.min(barWidth, (item.pctConsumed / 100) * barWidth)
      const color = item.status === 'over' ? CHART_COLORS.negative.rgb : item.status === 'warning' ? CHART_COLORS.warning.rgb : CHART_COLORS.positive.rgb
      this.doc.setFillColor(color[0], color[1], color[2])
      if (consumedWidth > 0) {
        this.doc.roundedRect(barLeft, this.yPosition, consumedWidth, barHeight, 2, 2, 'F')
      }

      // Elapsed marker
      const markerX = barLeft + (pctElapsed / 100) * barWidth
      this.doc.setDrawColor(107, 114, 128)
      this.doc.setLineWidth(0.4)
      this.doc.setLineDashPattern([1.5, 1.5], 0)
      this.doc.line(markerX, this.yPosition - 1, markerX, this.yPosition + barHeight + 1)
      this.doc.setLineDashPattern([], 0)

      // Percentage text
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(`${item.pctConsumed.toFixed(0)}%`, barRight + 2, this.yPosition + barHeight / 2 + 1.5)

      this.yPosition += spacing
    }

    this.doc.setTextColor(0, 0, 0)
  }

  private addCashRunwayChartPage(): void {
    const cf = this.options.cashflowForecast!
    const data = transformCashRunwayData(cf)
    if (data.length === 0) return
    this.addPage('landscape')

    this.drawPageTitle('Cash Runway')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Weeks of cash remaining based on current outflow rate', this.margin, this.yPosition)
    this.yPosition += 10

    const chartLeft = this.margin + 18
    const chartRight = this.pageWidth - this.margin
    const chartTop = this.yPosition
    const chartHeight = 120
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    const maxVal = Math.max(20, ...data.map(d => d.weeksOfCash)) * 1.1
    const yForValue = (v: number) => chartTop + ((maxVal - v) / maxVal) * chartHeight

    // Grid
    this.doc.setDrawColor(240, 240, 240)
    this.doc.setLineWidth(0.15)
    this.doc.setFontSize(6)
    this.doc.setTextColor(107, 114, 128)
    for (let tick = 0; tick <= maxVal; tick += 4) {
      const y = yForValue(tick)
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.text(`${tick}w`, chartLeft - 2, y + 1.5, { align: 'right' })
    }

    // Reference lines
    this.doc.setDrawColor(...CHART_COLORS.positive.rgb)
    this.doc.setLineWidth(0.3)
    this.doc.setLineDashPattern([3, 3], 0)
    this.doc.line(chartLeft, yForValue(13), chartRight, yForValue(13))
    this.doc.setDrawColor(...CHART_COLORS.warning.rgb)
    this.doc.line(chartLeft, yForValue(8), chartRight, yForValue(8))
    this.doc.setLineDashPattern([], 0)

    // Area
    const points = data.map((d, i) => ({ x: chartLeft + (i + 0.5) * (chartWidth / data.length), y: yForValue(d.weeksOfCash) }))
    this.drawAreaLine(points, chartBottom, CHART_COLORS.positive.rgb, 0.25)

    // Labels
    for (let i = 0; i < data.length; i++) {
      const centerX = chartLeft + (i + 0.5) * (chartWidth / data.length)
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(data[i].monthLabel, centerX, chartBottom + 5, { align: 'center' })
    }

    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.2)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')
    this.doc.setTextColor(0, 0, 0)
  }

  private addCumulativeNetCashChartPage(): void {
    const cf = this.options.cashflowForecast!
    const data = transformCumulativeNetCashData(cf)
    if (data.length === 0) return
    this.addPage('landscape')

    this.drawPageTitle('Cumulative Net Cash')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Running total of net cash movement', this.margin, this.yPosition)
    this.yPosition += 10

    const chartLeft = this.margin + 18
    const chartRight = this.pageWidth - this.margin
    const chartTop = this.yPosition
    const chartHeight = 120
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    const values = data.map(d => d.cumulative)
    const maxVal = Math.max(0, ...values) * 1.1 || 1
    const minVal = Math.min(0, ...values) * 1.1
    const valueRange = maxVal - minVal
    if (valueRange === 0) return

    const yForValue = (v: number) => chartTop + ((maxVal - v) / valueRange) * chartHeight

    // Grid
    const tickStep = this.calculateTickStep(valueRange)
    const firstTick = Math.ceil(minVal / tickStep) * tickStep
    this.doc.setFontSize(6)
    this.doc.setTextColor(107, 114, 128)
    this.doc.setDrawColor(240, 240, 240)
    this.doc.setLineWidth(0.15)
    for (let tick = firstTick; tick <= maxVal; tick += tickStep) {
      const y = yForValue(tick)
      if (y < chartTop - 1 || y > chartBottom + 1) continue
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.text(this.fmtAxisLabel(tick), chartLeft - 2, y + 1.5, { align: 'right' })
    }

    // Zero line
    this.doc.setDrawColor(150, 150, 150)
    this.doc.setLineWidth(0.3)
    this.doc.line(chartLeft, yForValue(0), chartRight, yForValue(0))

    const hasNegative = values.some(v => v < 0)
    const color = hasNegative ? CHART_COLORS.negative.rgb : CHART_COLORS.positive.rgb
    const points = data.map((d, i) => ({ x: chartLeft + (i + 0.5) * (chartWidth / data.length), y: yForValue(d.cumulative) }))
    this.drawAreaLine(points, yForValue(0), color, 0.25)

    for (let i = 0; i < data.length; i++) {
      const centerX = chartLeft + (i + 0.5) * (chartWidth / data.length)
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(data[i].monthLabel, centerX, chartBottom + 5, { align: 'center' })
    }

    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.2)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')
    this.doc.setTextColor(0, 0, 0)
  }

  private addWorkingCapitalGapChartPage(): void {
    const cf = this.options.cashflowForecast!
    const data = transformWorkingCapitalData(cf)
    if (data.length === 0) return
    this.addPage('portrait')

    this.drawPageTitle('Working Capital Gap')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    const gap = data[0]?.gap || 0
    this.doc.text(`DSO ${data[0]?.dsoDays || 0} days vs DPO ${data[0]?.dpoDays || 0} days = ${gap >= 0 ? '+' : ''}${gap} day gap`, this.margin, this.yPosition)
    this.yPosition += 10

    // Simple table for working capital
    const headers = ['Month', 'DSO (days)', 'DPO (days)', 'Gap (days)']
    const tableData = data.map(d => [d.monthLabel, String(d.dsoDays), String(d.dpoDays), String(d.gap)])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') {
          data.cell.styles.halign = 'center'
        }
      },
    })
  }

  private addTeamCostPctChartPage(): void {
    const fy = this.options.fullYearReport!
    const wagesNames = this.report.settings.wages_account_names || []
    const data = transformTeamCostData(fy, wagesNames)
    // The empty-names guard is the one that matters, and only the tab had it.
    // transformTeamCostData matches P&L lines against the configured wages
    // account names; with none configured it still returns twelve rows, every
    // one of them $0 wages and 0.0% of revenue. `data.length === 0` never
    // fires, so the pack printed a page telling a client they spend nothing on
    // their team — from a setting nobody filled in. No client has this chart on
    // with an empty list today; the trap is that turning it on is one click.
    if (data.length === 0 || wagesNames.length === 0) return
    this.addPage('landscape')

    this.drawPageTitle('Team Cost as % of Revenue')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Monthly wages spend vs percentage of revenue', this.margin, this.yPosition)
    this.yPosition += 10

    const teamAbsentNote = forwardSeriesAbsentNote(fy)
    if (teamAbsentNote) {
      this.drawNote(teamAbsentNote, undefined, { fontSize: 9, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    const headers = ['Month', 'Wages', 'Revenue', '% of Revenue']
    const tableData = data.map(d => [
      d.monthLabel,
      this.fmtCurrency(d.wages),
      this.fmtCurrency(d.revenue),
      `${d.pctOfRevenue.toFixed(1)}%`,
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: this.margin, right: this.margin },
    })
  }

  private addCostPerEmployeeChartPage(): void {
    const wd = this.options.wagesDetail!
    const { employees, average } = transformCostPerEmployeeData(wd)
    if (employees.length === 0) return
    this.addPage('portrait')

    this.drawPageTitle('Cost per Employee')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(`Average: ${this.fmtCurrency(average)} per employee`, this.margin, this.yPosition)
    this.yPosition += 10

    const barLeft = this.margin + 45
    const barRight = this.pageWidth - this.margin - 10
    const barWidthMax = barRight - barLeft
    const barHeight = 10
    const spacing = 16
    const maxCost = Math.max(...employees.map(e => e.total))

    for (const emp of employees) {
      // Name
      this.doc.setFontSize(7)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(55, 65, 81)
      this.doc.text(emp.name, this.margin, this.yPosition + barHeight / 2 + 1.5)

      // Background
      this.doc.setFillColor(243, 244, 246)
      this.doc.roundedRect(barLeft, this.yPosition, barWidthMax, barHeight, 2, 2, 'F')

      // Bar
      const w = maxCost > 0 ? (emp.total / maxCost) * barWidthMax : 0
      this.doc.setFillColor(...CHART_COLORS.wages.rgb)
      if (w > 0) this.doc.roundedRect(barLeft, this.yPosition, w, barHeight, 2, 2, 'F')

      // Value
      this.doc.setFontSize(6)
      this.doc.text(this.fmtCurrency(emp.total), barLeft + w + 2, this.yPosition + barHeight / 2 + 1.5)

      this.yPosition += spacing
    }

    // Average marker
    if (maxCost > 0) {
      const avgX = barLeft + (average / maxCost) * barWidthMax
      this.doc.setDrawColor(...CHART_COLORS.negative.rgb)
      this.doc.setLineWidth(0.4)
      this.doc.setLineDashPattern([2, 2], 0)
      const startY = this.yPosition - spacing * employees.length
      this.doc.line(avgX, startY, avgX, this.yPosition - spacing + barHeight + 2)
      this.doc.setLineDashPattern([], 0)
    }

    this.doc.setTextColor(0, 0, 0)
  }

  private addSubscriptionCreepChartPage(): void {
    const sd = this.options.subscriptionDetail!
    const data = transformSubscriptionCreepData(sd)
    if (data.length === 0) return
    this.addPage('portrait')

    this.drawPageTitle('Subscription Creep')
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Top vendors by month-over-month change', this.margin, this.yPosition)
    this.yPosition += 10

    const headers = ['Vendor', 'Prior Month', 'Current Month', 'Change']
    const tableData = data.map(d => [
      d.vendor,
      this.fmtCurrency(d.prior),
      this.fmtCurrency(d.current),
      `${d.change >= 0 ? '+' : ''}${this.fmtCurrency(d.change)}`,
    ])

    const specialRowIndices = new Set<number>()

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (cellData) => {
        // A rise in a subscription is stated in red; a fall is stated plainly.
        // No block of colour behind either — see applyVarianceTint.
        if (cellData.section === 'body' && cellData.column.index === 3) {
          const text = String(cellData.cell.text || '')
          if (text.startsWith('+') && !text.includes('$0')) {
            cellData.cell.styles.textColor = [...TEXT_NEGATIVE]
          }
        }
      },
    })
  }

  /** Helper: draw a filled area beneath a line */
  private drawAreaLine(points: { x: number; y: number }[], baseY: number, color: [number, number, number], opacity: number): void {
    if (points.length < 2) return

    // Draw the line
    this.doc.setDrawColor(color[0], color[1], color[2])
    this.doc.setLineWidth(0.6)
    for (let i = 0; i < points.length - 1; i++) {
      this.doc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
    }

    // Draw dots
    this.doc.setFillColor(color[0], color[1], color[2])
    for (const p of points) {
      this.doc.circle(p.x, p.y, 0.8, 'F')
    }
  }

  // =====================================================================
  // Layout-driven generation
  // =====================================================================

  /**
   * Generate PDF from a custom layout. Each layout page becomes a PDF page
   * with the specified orientation. Widgets are rendered at their grid positions.
   *
   * For single-widget-per-page, the widget fills the full page (matching legacy behavior).
   * For multi-widget pages, each widget is rendered within its bounding box.
   */
  private generateFromLayout(rawLayout: PDFLayout): jsPDF {
    // WC.2 — defensive render-time normalisation: layouts saved before the
    // full-row rule can hold a table in column 2, which renders with a
    // page-wide margin (box.x is used as a symmetric margin by every autoTable
    // call). Snap those in place rather than printing them broken.
    const layout = normalizeLayoutPlacements(rawLayout)
    this.activeLayout = layout
    this.standingHostId = undefined
    let isFirstPage = true

    // A layout says what a client's pack CAN contain; this month says what it
    // does. A page whose every widget has nothing to show is not rendered at
    // all — see pagesWithContent for why that is safe to decide here, and why
    // the balance sheet and money-flow pages are not affected by it.
    const pages = pagesWithContent(layout.pages, (type: WidgetType) => this.hasDataForWidget(type))

    for (const page of pages) {
      if (!Array.isArray(page.widgets) || page.widgets.length === 0) continue

      // Add page (first page is already created by the constructor)
      if (!isFirstPage) {
        this.doc.addPage('a4', page.orientation)
      } else {
        // First page: ensure correct orientation
        if (page.orientation === 'landscape') {
          // Constructor creates portrait — we need to add a landscape page and remove the first blank one
          this.doc.addPage('a4', 'landscape')
          this.doc.deletePage(1)
        }
        isFirstPage = false
      }

      // Always set page dimensions to match this page's orientation
      if (page.orientation === 'landscape') {
        this.pageWidth = A4_LONG
        this.pageHeight = A4_SHORT
      } else {
        this.pageWidth = A4_SHORT
        this.pageHeight = A4_LONG
      }
      this.margin = 15
      this.yPosition = CONTENT_TOP

      // Render each widget on this page
      for (const widget of page.widgets) {
        // Re-assert page dimensions before each widget (in case a previous render changed them)
        if (page.orientation === 'landscape') {
          this.pageWidth = A4_LONG
          this.pageHeight = A4_SHORT
        } else {
          this.pageWidth = A4_SHORT
          this.pageHeight = A4_LONG
        }

        const box = calculateBoundingBox(widget, page.orientation)
        this.renderWidget(widget, box)
      }
    }

    this.addAllFooters()
    return this.doc
  }

  /**
   * Dispatch rendering for a widget type within a bounding box.
   * Falls back to a placeholder if the widget can't be rendered.
   */
  private renderWidget(widget: import('../types/pdf-layout').LayoutWidget, box: WidgetBoundingBox): void {
    const type = widget.type
    const methodName = WIDGET_METHOD_MAP[type]
    if (!methodName) {
      this.renderPlaceholder(type, box)
      return
    }

    // Check data availability
    if (!this.hasDataForWidget(type)) {
      this.renderPlaceholder(type, box, 'Data not available')
      return
    }

    try {
      const method = (this as any)[methodName]
      if (typeof method === 'function') {
        // WC.1 — renderers receive the placed widget as their second argument
        // so a parameterised widget (section-scoped analysis table, external
        // metric series, title override) can read widget.config. Existing
        // renderers take only (box) and ignore it.
        method.call(this, box, widget)
      } else {
        this.renderPlaceholder(type, box)
      }
    } catch (err) {
      console.error(`[PDF] Error rendering widget ${type}:`, err)
      this.renderPlaceholder(type, box, 'Render error')
    }
  }

  private hasDataForWidget(type: WidgetType): boolean {
    switch (type) {
      case 'analysis_chart_income':
      case 'analysis_chart_cogs':
      case 'analysis_chart_expense':
      case 'full_year_projection':
      case 'chart_break_even':
      case 'chart_revenue_vs_expenses':
      case 'chart_variance_heatmap':
      case 'chart_team_cost_pct':
        return !!this.options.fullYearReport
      case 'chart_cash_runway':
      case 'chart_cumulative_net_cash':
      case 'chart_working_capital_gap':
      case 'chart_cashflow_forecast':
      case 'cashflow_forecast_table':
        return !!this.options.cashflowForecast
      case 'subscription_detail':
      case 'chart_subscription_creep':
        return !!this.options.subscriptionDetail
      case 'wages_detail':
      case 'chart_cost_per_employee':
        return !!this.options.wagesDetail
      case 'external_metric':
        return (this.options.externalMetrics ?? []).some(s => s.values.length > 0)
      case 'memo':
        return (this.options.memo ?? '').trim() !== ''
      case 'consolidated_pl':
        return !!this.options.consolidated && this.options.consolidated.byTenant.length > 0
      case 'money_flow':
        // Present even when not comparable — the renderer draws the honest
        // "couldn't check" card with the reason instead of a blank page.
        return !!this.options.moneyFlow
      case 'balance_sheet':
        // Always "available", for the same reason money_flow is: the grey
        // "Data not available" placeholder is the least honest of the three
        // states — it can't say whether Xero refused, whether there is no
        // comparison period, or whether the sheet failed to balance. The
        // renderer names the reason on the page instead. Returning false here
        // would silently swallow all three.
        return true
      default:
        return true
    }
  }

  /**
   * Style a built row's cells without destroying the ones already styled.
   *
   * `buildLineRow` returns a mix: plain strings for ordinary figures, and
   * `{ content, styles }` objects for the cells that carry their own meaning —
   * the dashes a no-budget client gets, and tinted variances. The Gross Profit
   * and Net Profit rows used to wrap EVERY cell as `{ content: cell }`, which
   * turns an already-wrapped cell into `{ content: { content, styles } }` and
   * prints the literal text "[object Object]" where a number belongs. It was
   * doing exactly that on the Gross Profit line of the August pack.
   */
  private restyleRow(row: any[], styles: Record<string, unknown>): void {
    for (let i = 1; i < row.length; i++) {
      const cell = row[i]
      row[i] = cell !== null && typeof cell === 'object'
        ? { ...cell, styles: { ...(cell.styles ?? {}), ...styles } }
        : { content: cell, styles: { ...styles } }
    }
  }

  private renderPlaceholder(type: WidgetType, box: WidgetBoundingBox, message?: string): void {
    this.doc.setDrawColor(200, 200, 200)
    this.doc.setFillColor(248, 248, 248)
    this.doc.roundedRect(box.x, box.y, box.w, box.h, 2, 2, 'FD')

    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(150, 150, 150)
    this.doc.text(
      message || type.replace(/_/g, ' '),
      box.x + box.w / 2,
      box.y + box.h / 2,
      { align: 'center' }
    )
    this.doc.setTextColor(0, 0, 0)
  }

  // ── Public render methods (bounding-box aware) ──
  // These render content within a box. For layout-driven rendering,
  // the box constrains where the content appears on the page.
  // For now, they set margin/yPosition and call the core rendering logic.

  /**
   * Helper: call an existing private add*Page method but skip its internal addPage() call,
   * rendering content at the current margin/yPosition instead.
   */
  private renderWithSkipPage(addMethod: () => void, box: WidgetBoundingBox): void {
    // Save current page dimensions so the internal addPage skip doesn't lose them
    const savedPageWidth = this.pageWidth
    const savedPageHeight = this.pageHeight
    const savedMargin = this.margin

    this.margin = box.x
    this.yPosition = box.y
    this.skipNextAddPage = true
    addMethod.call(this)
    // Reset skipNextAddPage in case the method didn't call addPage
    this.skipNextAddPage = false

    // Restore page dimensions (the internal method may have changed them via addPage calls
    // that weren't skipped, e.g. autoTable overflow pages)
    this.pageWidth = savedPageWidth
    this.pageHeight = savedPageHeight
    this.margin = savedMargin
  }

  renderExecutiveSummary(box: WidgetBoundingBox): void {
    // Executive summary is always page 1, no addPage call
    this.margin = box.x
    this.yPosition = box.y
    this.addExecutiveSummary()
  }

  renderBudgetVsActual(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    // WD.2 — widget.config scopes the table to a section subset (see
    // section-table-config.ts). No config = the full statement, unchanged.
    const filter = resolveSectionFilter(widget?.config)
    this.renderWithSkipPage(() => this.addBudgetVsActualDetail(filter, widget?.id), box)
  }

  renderYTDSummary(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addYTDSummary, box)
  }

  renderFullYearProjection(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addFullYearProjection, box)
  }

  // =====================================================================
  // Contractor Analysis (PORTRAIT) — Calxa page 14
  // =====================================================================
  /**
   * Two tables on one page, the way the sheet this replaces sets them out:
   * every contractor down the side with last month, this month and their
   * budget; then the same rows rolled up by department underneath.
   *
   * The department rollup is the half a coach acts on — "Marketing is $844
   * under, Operations is $315 over" is a sentence about the business, where
   * sixteen individual variances are a list.
   */
  private addContractorDetailPage(): void {
    const detail = this.options.contractorDetail
    if (!detail || detail.contractors.length === 0) return
    this.addPage('portrait')
    this.drawPageTitle(`Contractor Analysis — ${this.formatMonth(this.report.report_month)}`)

    const priorLabel = this.formatShortMonth(this.priorMonthOf(this.report.report_month))
    const monthLabel = this.formatShortMonth(this.report.report_month)

    const body: any[] = detail.contractors.map((c) => [
      c.vendor_name,
      c.category ?? '—',
      this.fmtCurrency(c.prior_month_actual),
      this.fmtCurrency(c.budget),
      this.fmtCurrency(c.actual),
      this.fmtVariance(c.variance),
    ])
    const gt = detail.grand_total
    body.push([
      { content: 'Total', styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: '', styles: { fillColor: GP_BLUE } },
      { content: this.fmtCurrency(gt.prior_month), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: this.fmtCurrency(gt.budget), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: this.fmtCurrency(gt.actual), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: this.fmtVariance(gt.variance), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Contractor', 'Department', priorLabel, 'Budget', monthLabel, 'Variance']],
      body,
      ...packTableStyles(8),
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 30 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index >= 2 && data.section !== 'head') data.cell.styles.halign = 'right'
        paintNegatives(data as never)
      },
    })

    // ── By department ──
    this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 10
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(26, 26, 26)
    this.doc.text('BY DEPARTMENT', this.margin, this.yPosition)
    this.doc.setTextColor(0, 0, 0)
    this.yPosition += 5

    const pivot: any[] = []
    for (const g of detail.categories) {
      for (const c of g.contractors) {
        pivot.push([g.name ?? '—', c.vendor_name, this.fmtCurrency(c.budget), this.fmtCurrency(c.actual), this.fmtVariance(c.variance)])
      }
      // An uncategorised run gets no subtotal — a total under no heading is a
      // number a reader cannot name.
      if (!g.name) continue
      pivot.push([
        { content: `Total ${g.name}`, styles: { fontStyle: 'bold', fillColor: GROUP_SHADE } },
        { content: '', styles: { fillColor: GROUP_SHADE } },
        { content: this.fmtCurrency(g.subtotal.budget), styles: { fontStyle: 'bold', fillColor: GROUP_SHADE } },
        { content: this.fmtCurrency(g.subtotal.actual), styles: { fontStyle: 'bold', fillColor: GROUP_SHADE } },
        { content: this.fmtVariance(g.subtotal.variance), styles: { fontStyle: 'bold', fillColor: GROUP_SHADE } },
      ])
    }
    pivot.push([
      { content: 'Grand Total', styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: '', styles: { fillColor: GP_BLUE } },
      { content: this.fmtCurrency(gt.budget), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: this.fmtCurrency(gt.actual), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: this.fmtVariance(gt.variance), styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Department', 'Contractor', 'Budget', monthLabel, 'Variance']],
      body: pivot,
      ...packTableStyles(8),
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 44 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index >= 2 && data.section !== 'head') data.cell.styles.halign = 'right'
        paintNegatives(data as never)
      },
    })
  }

  /** "2026-08" → "2026-07". */
  private priorMonthOf(month: string): string {
    const [y, m] = month.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  renderSubscriptionDetail(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addSubscriptionDetailPage, box)
  }

  // =====================================================================
  // Payroll grid (LANDSCAPE) — Calxa page 15
  // =====================================================================
  /**
   * Every employee against every pay run, two months across, with the wages
   * budget and the difference beneath.
   *
   * The month bands matter more than they look: four columns under July and
   * five under August is the whole reason the wages line moves month to month,
   * and a reader who cannot see the run count reads a 25% rise as overspend.
   */
  private addPayrollGridPage(): void {
    const grid = this.options.payrollGrid
    if (!grid || grid.employees.length === 0 || grid.run_dates.length === 0) return
    this.addPage('landscape')
    this.drawPageTitle(`Payroll — ${this.formatMonth(this.report.report_month)}`)

    const dayLabel = (iso: string): string => {
      const [, m, d] = iso.split('-').map(Number)
      return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}`
    }

    // Tier 1: the month over its own run dates. Tier 2: the dates.
    const band: BandGroup[] = [{ label: '', colSpan: 3, tone: 'light' }]
    for (const [i, m] of grid.months.entries()) {
      if (m.run_dates.length === 0) continue
      band.push({
        label: `${this.formatShortMonth(m.month)} · ${m.run_dates.length} run${m.run_dates.length === 1 ? '' : 's'}`,
        colSpan: m.run_dates.length,
        tone: i % 2 === 0 ? 'light' : 'dark',
      })
    }
    band.push({ label: 'Month', colSpan: grid.months.length, tone: 'light' })

    const headers = [
      'Employee', 'Started', 'Weekly',
      ...grid.run_dates.map(dayLabel),
      ...grid.months.map((m) => this.formatShortMonth(m.month)),
    ]

    const body: any[] = grid.employees.map((e) => [
      e.name,
      e.start_date ? dayLabel(e.start_date) + ' ' + e.start_date.slice(0, 4) : '—',
      e.weekly === null ? '—' : this.fmtCurrency(e.weekly),
      ...grid.run_dates.map((d) => (e.cells[d] === null || e.cells[d] === undefined ? '—' : this.fmtCurrency(e.cells[d] as number))),
      ...grid.months.map((m) =>
        this.fmtCurrency(m.run_dates.reduce((t, d) => t + (e.cells[d] ?? 0), 0))),
    ])

    const bold = (content: string) => ({ content, styles: { fontStyle: 'bold' as const, fillColor: GROUP_SHADE } })
    body.push([
      bold('Total'), bold(''), bold(''),
      ...grid.run_dates.map((d) =>
        bold(this.fmtCurrency(grid.employees.reduce((t, e) => t + (e.cells[d] ?? 0), 0)))),
      ...grid.months.map((m) => bold(this.fmtCurrency(m.total))),
    ])
    body.push([
      bold('Budget'), bold(''), bold(''),
      ...grid.run_dates.map(() => bold('')),
      ...grid.months.map((m) => bold(m.budget === null ? '—' : this.fmtCurrency(m.budget))),
    ])
    body.push([
      { content: 'Difference', styles: { fontStyle: 'bold', fillColor: GP_BLUE } },
      { content: '', styles: { fillColor: GP_BLUE } },
      { content: '', styles: { fillColor: GP_BLUE } },
      ...grid.run_dates.map(() => ({ content: '', styles: { fillColor: GP_BLUE } })),
      ...grid.months.map((m) => ({
        content: m.difference === null ? '—' : this.fmtVariance(m.difference),
        styles: { fontStyle: 'bold', fillColor: GP_BLUE },
      })),
    ])

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [periodBandRow(band), headers],
      body,
      ...packTableStyles(7),
      columnStyles: { 0: { cellWidth: 38, halign: 'left' }, 1: { cellWidth: 20 }, 2: { cellWidth: 18 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.column.index > 0 && data.section !== 'head') data.cell.styles.halign = 'right'
        paintNegatives(data as never)
      },
    })

    // Under the table, not over it: drawNote writes at yPosition, which
    // autoTable does not advance for you.
    this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 6
    this.drawNote(
      'Paid amounts are Xero payslips, one column per pay run. “Weekly” is stated only where every run in the window paid the same.',
      undefined,
      { fontSize: 7.5, color: [120, 120, 120] },
    )
  }

  renderContractorDetail(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addContractorDetailPage, box)
  }

  renderPayrollGrid(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addPayrollGridPage, box)
  }

  renderWagesDetail(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addWagesDetailPage, box)
  }

  renderExternalMetric(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    // WE.1b — default: every active series with values for the month, one page
    // each. config.series_key narrows a placement to a single series so a
    // layout can give each insert its own positioned page.
    const seriesKey = typeof widget?.config?.series_key === 'string' ? widget.config.series_key : undefined
    const all = (this.options.externalMetrics ?? []).filter(s => s.values.length > 0)
    const list = seriesKey ? all.filter(s => s.series_key === seriesKey) : all
    if (list.length === 0) {
      // hasDataForWidget passed on SOME series, but the config narrowed to one
      // with no data — say so rather than rendering a blank page.
      this.renderPlaceholder('external_metric', box, seriesKey ? `No data for series '${seriesKey}' this month` : 'No external data for this month')
      return
    }
    this.renderWithSkipPage(() => {
      for (const series of list) this.addExternalMetricPage(series)
    }, box)
  }

  renderCashflowForecastTable(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addCashflowForecastPage, box)
  }

  renderCashflowForecastChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addCashflowForecastChartPage, box)
  }

  renderRevenueBreakdownChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addRevenueBreakdownChartPage, box)
  }

  renderBreakEvenChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addBreakEvenChartPage, box)
  }

  renderRevenueVsExpensesChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addRevenueVsExpensesTrendChartPage, box)
  }

  renderVarianceHeatmap(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addVarianceHeatmapPage, box)
  }

  renderBudgetBurnRateChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addBudgetBurnRateChartPage, box)
  }

  renderCashRunwayChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addCashRunwayChartPage, box)
  }

  renderCumulativeNetCashChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addCumulativeNetCashChartPage, box)
  }

  renderWorkingCapitalGapChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addWorkingCapitalGapChartPage, box)
  }

  renderTeamCostPctChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addTeamCostPctChartPage, box)
  }

  renderCostPerEmployeeChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addCostPerEmployeeChartPage, box)
  }

  renderSubscriptionCreepChart(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addSubscriptionCreepChartPage, box)
  }

  /**
   * WD.1 — layout-mode dispatch for the analysis chart. Section comes from the
   * widget TYPE, with widget.config.section as the WC.1 override; titleOverride
   * flows through addAnalysisChartPage.
   */
  renderAnalysisChart(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    const fromConfig = widget?.config?.section
    const fromType: AnalysisChartSection =
      widget?.type === 'analysis_chart_cogs' ? 'cogs'
      : widget?.type === 'analysis_chart_expense' ? 'expense'
      : 'income'
    const section: AnalysisChartSection =
      fromConfig === 'income' || fromConfig === 'cogs' || fromConfig === 'expense'
        ? fromConfig
        : fromType
    this.renderWithSkipPage(() => this.addAnalysisChartPage(section, widget?.titleOverride), box)
  }

  /**
   * WD.1 — one landscape page of 12 monthly bar groups: Actual, the yardstick,
   * Last-Year Actual. Actual bars stop at the last completed month (null
   * months draw no bar, not a zero bar); the other two run all 12 — matching
   * the Calxa chart this replaces.
   *
   * The middle series names itself. It is the approved budget for a client on
   * the budget store and the forecast for everyone else (see
   * analysis-chart-data), and this page sits directly above a Budget-vs-Actual
   * table measured against the same thing — a legend saying "Budget" over the
   * forecast, one page above a table holding the client to the approved
   * budget, is two yardsticks under one word.
   */
  private addAnalysisChartPage(section: AnalysisChartSection, titleOverride?: string): void {
    const fy = this.options.fullYearReport
    if (!fy) return
    const data = transformAnalysisChartData(fy, section)
    if (!data) return
    this.addPage('landscape')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(0, 0, 0)
    this.doc.text(`${titleOverride ?? data.title} | FY${fy.fiscal_year}`, this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(107, 114, 128)
    this.doc.text(
      data.budgetLabel ? `Actuals vs ${data.budgetLabel} vs Last Year` : 'Actuals vs Last Year',
      this.margin, this.yPosition,
    )
    this.yPosition += 8

    // With no yardstick at all the page is still worth printing — actuals
    // against last year is a real comparison — but the reader has to be told
    // that the missing middle bar is an absence and not a run of zeros.
    if (data.budgetAbsentNote) {
      this.drawNote(data.budgetAbsentNote, undefined, { fontSize: 9, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    // Legend — the middle entry drops out entirely when there is no series,
    // rather than standing over an empty column.
    const SERIES: Array<{ label: string; rgb: [number, number, number] }> = [
      { label: 'Actuals', rgb: [109, 212, 143] },
      ...(data.budgetLabel ? [{ label: data.budgetLabel, rgb: [251, 191, 36] as [number, number, number] }] : []),
      { label: 'Last Year', rgb: [102, 184, 238] },
    ]
    let legendX = this.margin
    for (const sSeries of SERIES) {
      this.doc.setFillColor(...sSeries.rgb)
      this.doc.rect(legendX, this.yPosition - 2.5, 3.5, 3.5, 'F')
      this.doc.setFontSize(7)
      this.doc.setTextColor(55, 65, 81)
      this.doc.text(sSeries.label, legendX + 5, this.yPosition + 0.5)
      legendX += 5 + this.doc.getTextWidth(sSeries.label) + 8
    }
    this.yPosition += 6

    const chartLeft = this.margin + 16
    const chartRight = this.pageWidth - this.margin - 2
    const chartTop = this.yPosition
    const chartHeight = Math.min(112, this.pageHeight - chartTop - this.margin - 12)
    const chartBottom = chartTop + chartHeight
    const chartWidth = chartRight - chartLeft

    // Negative months (rebate-heavy COGS, contra revenue) get a floor.
    const minRaw = Math.min(0, ...data.months.flatMap((m) => [m.actual ?? 0, m.budget ?? 0, m.priorYear]))
    const maxVal = data.maxValue * 1.08
    const minVal = minRaw * 1.08
    const range = maxVal - minVal || 1
    const yFor = (v: number) => chartTop + ((maxVal - v) / range) * chartHeight

    // Grid + axis labels (~5 ticks on rounded steps)
    const rawStep = range / 5
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const step = Math.ceil(rawStep / mag) * mag
    this.doc.setLineWidth(0.15)
    this.doc.setFontSize(6)
    for (let tick = Math.ceil(minVal / step) * step; tick <= maxVal; tick += step) {
      const y = yFor(tick)
      this.doc.setDrawColor(tick === 0 ? 209 : 240, tick === 0 ? 213 : 240, tick === 0 ? 219 : 240)
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(this.fmtCurrency(tick), chartLeft - 2, y + 1.5, { align: 'right' })
    }

    // Bars: 12 groups × the series that exist
    const groupWidth = chartWidth / data.months.length
    const barWidth = Math.min(6, (groupWidth * 0.72) / SERIES.length)
    const zeroY = yFor(0)
    data.months.forEach((m, i) => {
      const groupLeft = chartLeft + i * groupWidth + (groupWidth - barWidth * SERIES.length) / 2
      const values: Array<number | null> = data.budgetLabel
        ? [m.actual, m.budget, m.priorYear]
        : [m.actual, m.priorYear]
      values.forEach((v, si) => {
        if (v === null || v === 0) return
        const x = groupLeft + si * barWidth
        const yTop = v >= 0 ? yFor(v) : zeroY
        const h = Math.abs(yFor(v) - zeroY)
        if (h < 0.1) return
        this.doc.setFillColor(...SERIES[si].rgb)
        this.doc.rect(x, yTop, barWidth - 0.7, h, 'F')
      })
      this.doc.setFontSize(6)
      this.doc.setTextColor(107, 114, 128)
      this.doc.text(m.label, chartLeft + (i + 0.5) * groupWidth, chartBottom + 4.5, { align: 'center' })
    })

    this.doc.setTextColor(0, 0, 0)
    this.yPosition = chartBottom + 10
  }

  // ── KPI Card Renderers ──

  renderKPIRevenue(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Revenue', s.revenue.actual, s.revenue.variance, s.revenue.budget, [16, 185, 129])
  }

  renderKPIGrossProfit(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Gross Profit', s.gross_profit.actual, s.gross_profit.variance, s.gross_profit.budget, [59, 130, 246])
  }

  renderKPINetProfit(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Net Profit', s.net_profit.actual, s.net_profit.variance, s.net_profit.budget, [139, 92, 246])
  }

  private renderKPICard(
    box: WidgetBoundingBox,
    label: string,
    value: number,
    variance: number,
    budget: number,
    color: [number, number, number]
  ): void {
    // Background
    this.doc.setFillColor(color[0], color[1], color[2])
    this.doc.roundedRect(box.x, box.y, box.w, box.h, 3, 3, 'F')

    // Label
    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(255, 255, 255)
    this.doc.text(label, box.x + box.w / 2, box.y + box.h * 0.3, { align: 'center' })

    // Value
    this.doc.setFontSize(18)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(this.fmtCurrency(value), box.x + box.w / 2, box.y + box.h * 0.55, { align: 'center' })

    // Variance — only when there is something to be a variance TO.
    //
    // ReportSummaryCards wraps the same line in `hasBudget` and returns null
    // for a $0 budget, with the reason in its own comment: "a $0 budget used to
    // render '(+0.0%)', which reads as 'on budget'". This card wrote the
    // variance and the literal words "vs budget" unconditionally, so a client
    // with no budget would have been told their whole actual was a favourable
    // variance against one. Latent — no saved layout places a kpi_* widget
    // today — and it is the same one-click trap as the team-cost page.
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    if (this.hasBudget && budget !== 0) {
      const varText = variance >= 0 ? `+${this.fmtCurrency(variance)} vs budget` : `${this.fmtCurrency(variance)} vs budget`
      this.doc.text(varText, box.x + box.w / 2, box.y + box.h * 0.75, { align: 'center' })
    }

    this.doc.setTextColor(0, 0, 0)
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  /**
   * The commentary block, the way the reference pack sets it.
   *
   * A heading in small caps, then one bullet per account: the account name in
   * bold, a pipe, and the facts. Black on white — the amber strips this
   * replaces were the loudest thing on a page whose job is to be read, and they
   * sat INSIDE the statement, splitting it wherever an account had a note.
   *
   * Wraps across pages: a client with twenty commented accounts gets a second
   * page, not a block running off the bottom.
   */
  private drawCommentaryBlock(items: readonly { account: string; body: string }[]): void {
    if (items.length === 0) return
    let y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 8
    const left = this.margin
    const bulletIndent = 4
    const available = this.pageWidth - this.margin * 2 - bulletIndent

    const newPageIfNeeded = (needed: number) => {
      if (y + needed > this.pageHeight - this.margin - 10) {
        this.addPage('landscape')
        y = this.yPosition
      }
    }

    newPageIfNeeded(10)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(9)
    this.doc.setTextColor(26, 26, 26)
    this.doc.text('COMMENTARY', left, y)
    y += 5.5

    for (const item of items) {
      this.doc.setFont('helvetica', 'bold')
      this.doc.setFontSize(8)
      const label = `${item.account} | `
      const labelWidth = this.doc.getTextWidth(label)

      // The first line shares its row with the bold label, so it gets less
      // width than the ones that wrap under it.
      this.doc.setFont('helvetica', 'normal')
      const firstWidth = available - labelWidth
      const words = item.body.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        const limit = lines.length === 0 ? firstWidth : available
        if (this.doc.getTextWidth(candidate) > limit && current) {
          lines.push(current)
          current = word
        } else {
          current = candidate
        }
      }
      if (current) lines.push(current)

      newPageIfNeeded(4.2 * Math.max(lines.length, 1) + 2)
      this.doc.setTextColor(60, 60, 60)
      this.doc.text('•', left, y)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(26, 26, 26)
      this.doc.text(label, left + bulletIndent, y)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(55, 55, 55)
      this.doc.text(lines[0] ?? '', left + bulletIndent + labelWidth, y)
      for (const extra of lines.slice(1)) {
        y += 4.2
        newPageIfNeeded(4.2)
        this.doc.text(extra, left + bulletIndent, y)
      }
      y += 5.2
    }
    this.doc.setTextColor(0, 0, 0)
    this.yPosition = y
  }

  /**
   * A page's title block, in the pack's voice.
   *
   * Calxa heads every page the same way: the page's subject and the client's
   * name on one large, LIGHT-weight line, and the period under it in small grey
   * capitals. Ours were 14pt bold with the period welded into the same string —
   * so a reader scanning the pack had to read the whole heading to find out
   * which month they were looking at, and every page shouted at the same
   * volume as the figures below it.
   *
   * Callers still pass one string ("Wages Analysis — August 2026"); the split
   * happens here so twenty call sites did not each have to learn the rule.
   */
  private drawPageTitle(heading: string): void {
    const cut = heading.lastIndexOf(' — ')
    const subject = cut > 0 ? heading.slice(0, cut) : heading
    const period = cut > 0 ? heading.slice(cut + 3) : null
    const client = (this.options.businessName ?? '').trim()

    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(17)
    this.doc.setTextColor(26, 26, 26)
    this.doc.text(client ? `${subject} — ${client}` : subject, this.margin, this.yPosition)
    this.yPosition += 5.5

    if (period) {
      // "MONTH: AUG 2026" for a month, the period verbatim for anything else
      // (a fiscal year, a date range) — labelling "FY2027" as a month is worse
      // than not labelling it.
      const isMonth = /^[A-Za-z]{3,9} \d{4}$/.test(period)
      this.doc.setFontSize(9)
      this.doc.setTextColor(125, 125, 125)
      this.doc.text((isMonth ? `MONTH: ${period}` : period).toUpperCase(), this.margin, this.yPosition)
      this.yPosition += 3
    }

    this.doc.setTextColor(0, 0, 0)
    this.doc.setFontSize(10)
    this.yPosition += 6
  }

  /**
   * Apply green/red cell background tint based on variance polarity.
   *
   * Phase 71-07 (S4): polarity is sourced from structured cell metadata
   * (`data.cell.raw._polarity`) attached upstream by `buildLineRow`. When
   * the metadata is absent (legacy code paths), `decideTintColor` falls
   * back to parsing the formatted display text so existing call sites
   * continue to work.
   */
  private applyVarianceTint(data: any): void {
    const polarity = data?.cell?.raw?._polarity as VariancePolarity | undefined
    const text = String(data?.cell?.text || '')
    // See paintNegatives: the ratio is not coloured, only the figure.
    if (text.trim().endsWith('%')) return
    const color = decideTintColor(polarity, text)
    // The polarity is worth saying; a coloured BLOCK behind it is not. Calxa
    // states an unfavourable figure in red parentheses and says nothing at all
    // about a favourable one, which is why its pages read as a report and a
    // page with four tinted columns per row reads as a heat map.
    if (color === 'red') data.cell.styles.textColor = [...TEXT_NEGATIVE]
  }

  /**
   * Compute the polarity bucket for a numeric variance value.
   * Phase 71-07 (S4) — emitted alongside the formatted display string so
   * `applyVarianceTint` can decide colour from structured metadata.
   */
  private polarityOf(value: number): VariancePolarity {
    if (value < 0) return 'negative'
    if (value > 0) return 'positive'
    return 'neutral'
  }

  // ── Three states for budget-derived cells ────────────────────────────────
  //
  // The browser tab has had these since WA.3; the PDF printed
  // `fmtCurrency(line.budget)` and `fmtVariance(line.variance_amount)`
  // unconditionally. So the coach's screen dashed every budget cell under an
  // amber "no budget" banner while the pack the client received showed the same
  // month as $0 budget with the whole actual as a variance — favourable, on
  // every line, for the three clients whose report resolves no budget.
  //
  // Same rule as the tab, deliberately: no budget at all dashes every
  // budget-derived cell; inside a budgeted report a single $0-budget line keeps
  // its dollar variance (an unbudgeted expense IS a real variance, and the
  // Calxa packs show it) and drops the divide-by-zero percentage that reads as
  // "on budget".
  private get hasBudget(): boolean {
    return this.report.has_budget !== false
  }

  private budgetCell(value: number): string {
    return this.hasBudget ? this.fmtCurrency(value) : VALUE_ABSENT
  }

  private varianceCell(value: number): any {
    if (!this.hasBudget) return VALUE_ABSENT
    return { content: this.fmtVariance(value), _polarity: this.polarityOf(value) }
  }

  private variancePctCell(value: number, base: number): any {
    if (!this.hasBudget || base === 0) return VALUE_ABSENT
    return { content: this.fmtPct(value), _polarity: this.polarityOf(value) }
  }

  /**
   * The amber card that says WHY the budget columns are dashes.
   *
   * `report.no_budget_reason` has been emitted by generate/route.ts since the
   * budget store shipped and has had no consumers at all: the pack showed a
   * wall of dashes and left the reader to supply their own explanation, which
   * is usually "the system is broken" or "we budgeted nothing". Drawn at the
   * top of each statement page, where the tab puts its banner.
   */
  private drawNoBudgetNotice(): void {
    const note = noBudgetNote(this.report)
    if (note) this.drawReasonCard(note)
  }

  private buildLineRow(line: ReportLine, settings: MonthlyReportSettings): any[] {
    const row: any[] = [
      line.is_budget_only ? `${line.account_name} (budget only)` : line.account_name,
      this.budgetCell(line.budget),
      this.fmtCurrency(line.actual),
      // Phase 71-07 (S4): tag variance cells with structured polarity so
      // `applyVarianceTint` no longer depends on parsing formatted text.
      this.varianceCell(line.variance_amount),
      this.variancePctCell(line.variance_percent, line.budget),
    ]
    if (settings.show_ytd) {
      row.push(
        this.budgetCell(line.ytd_budget),
        this.fmtCurrency(line.ytd_actual),
        this.varianceCell(line.ytd_variance_amount),
        this.variancePctCell(line.ytd_variance_percent, line.ytd_budget),
      )
    }
    if (settings.show_unspent_budget) row.push(this.budgetCell(line.unspent_budget))
    if (settings.show_budget_next_month) row.push(this.budgetCell(line.budget_next_month))
    if (settings.show_budget_annual_total) row.push(this.budgetCell(line.budget_annual_total))
    if (settings.show_prior_year) row.push(line.prior_year !== null ? this.fmtCurrency(line.prior_year) : VALUE_ABSENT)
    return row
  }

  /** Add page footers to every page at the end */
  private addAllFooters(): void {
    const totalPages = (this.doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i)
      const pw = this.doc.internal.pageSize.getWidth()
      const ph = this.doc.internal.pageSize.getHeight()

      // WC.5 — a provisional report is watermarked on EVERY page. Before this,
      // a draft export was indistinguishable from a final one the moment it
      // left the app (the reconciliation gate's whole point, dropped at the
      // last step).
      if (this.report.is_draft) {
        this.doc.setFontSize(80)
        this.doc.setFont('helvetica', 'bold')
        let stamped = false
        try {
          const anyDoc = this.doc as any
          if (typeof anyDoc.saveGraphicsState === 'function' && typeof anyDoc.GState === 'function') {
            anyDoc.saveGraphicsState()
            anyDoc.setGState(new anyDoc.GState({ opacity: 0.08 }))
            this.doc.setTextColor(150, 30, 30)
            this.doc.text('DRAFT', pw / 2, ph / 2, { align: 'center', angle: 35 })
            anyDoc.restoreGraphicsState()
            stamped = true
          }
        } catch {
          // fall through to the opaque-but-faint fallback below
        }
        if (!stamped) {
          this.doc.setTextColor(246, 226, 226)
          this.doc.text('DRAFT', pw / 2, ph / 2, { align: 'center', angle: 35 })
        }
      }

      // The corner mark, on every page but the cover — which carries the full
      // lockup already, and would otherwise wear both.
      if (i > 1) {
        try {
          const w = 17
          const h = (LOGO_CORNER_SIZE.h / LOGO_CORNER_SIZE.w) * w
          this.doc.addImage(LOGO_CORNER, 'PNG', pw - this.margin - w, 9, w, h)
        } catch {
          // See addCoverPage.
        }
      }

      this.doc.setFontSize(7)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(150, 150, 150)
      // "Page 7 of 27", right-aligned, and nothing else. The tool that built
      // the pack and the date it was built are the client's least interesting
      // facts; Calxa puts neither on the page, and the export's own cover
      // states the preparation date once.
      this.doc.text(`Page ${i} of ${totalPages}`, pw - this.margin, ph - 8, { align: 'right' })
      if (this.report.is_draft) {
        this.doc.setTextColor(185, 28, 28)
        this.doc.text('PROVISIONAL', this.margin, ph - 8, { align: 'left' })
      }
    }
    this.doc.setTextColor(0, 0, 0)
  }

  /**
   * A figure, the way a management pack prints one.
   *
   * No currency symbol, and negatives in parentheses rather than with a minus.
   * A statement states its currency once — repeating "$" three hundred times is
   * what turns a fourteen-column table into a wall, and "-$6,122" is not the
   * accounting convention that a reader of these packs has read all their life.
   * en-AU, not en-US: this is an Australian practice.
   */
  private fmtCurrency(value: number): string {
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    // Rounded before the sign test: -0.4 must not print as "(0)", a
    // parenthesised nothing that reads as an unfavourable result.
    return Math.round(value) < 0 ? `(${formatted})` : formatted
  }

  /** Format variance with parentheses for unfavorable (negative) values */
  private fmtVariance(value: number): string {
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    if (Math.round(value) < 0) return `(${formatted})`
    return formatted
  }

  private fmtPct(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  private formatMonth(monthKey: string): string {
    const date = new Date(monthKey + '-01')
    return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  }

  private formatShortMonth(monthKey: string): string {
    if (!monthKey) return 'Actual'
    const d = new Date(monthKey + '-01')
    const month = d.toLocaleDateString('en-AU', { month: 'short' })
    const year = d.getFullYear().toString().slice(-2)
    return `${month} ${year}`
  }

  private formatPriorShortMonth(monthKey: string): string {
    if (!monthKey) return 'Last Month'
    const [y, m] = monthKey.split('-').map(Number)
    const priorDate = new Date(y, m - 2, 1)
    const month = priorDate.toLocaleDateString('en-AU', { month: 'short' })
    const year = priorDate.getFullYear().toString().slice(-2)
    return `${month} ${year}`
  }
}
