import jsPDF from 'jspdf'
import autoTable, { __createTable, __drawTable, type Row, type UserOptions } from 'jspdf-autotable'
import * as Sentry from '@sentry/nextjs'
import type { GeneratedReport, ReportSection, ReportLine, MonthlyReportSettings, ReportSections, VarianceCommentary, FullYearReport, FullYearLine, FullYearMonthData, SubscriptionDetailData, WagesDetailData } from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { buildPackCashflowRows, type PackCashflowRow } from '@/lib/monthly-report/pack-cashflow-rows'
import { packCashflowChartData, packCashflowAxis, stackPackCashflowBars, PACK_CASHFLOW_SERIES, PACK_CASHFLOW_BANK } from '@/lib/monthly-report/pack-cashflow-chart'
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
  packBurnRateLabels,
} from '../components/charts/BudgetBurnRateChart'
import {
  transformAnalysisChartData,
  analysisChartAxis,
  analysisChartLegend,
  type AnalysisChartSection,
} from '../components/charts/analysis-chart-data'
import { LOGO_COVER, LOGO_CORNER, LOGO_COVER_SIZE, LOGO_CORNER_SIZE } from './pack-logo'
import {
  resolvePackLogo,
  fitLogo,
  PACK_LOGO_COVER_BOX,
  PACK_LOGO_CORNER_BOX,
  type PackLogoSetting,
} from '@/lib/monthly-report/pack-logo-setting'
import { formatPackPreparedOn, type PackPreparedOn } from '@/lib/monthly-report/pack-prepared-on'
import { pagesWithContent } from '../utils/layout-pages'
import { resolveSectionFilter, sectionTableTitle, showsVariancePercent } from './section-table-config'
import { pickStandingCommentaryHost } from '../utils/standing-commentary'
import {
  buildCommentaryBlock,
  resolveCommentaryPlacement,
  type CommentaryCapIgnored,
  type CommentaryGap,
  COMMENTARY_CATEGORIES,
  DEFAULT_COMMENTARY_PLACEMENT,
  type CommentaryBullet,
  type CommentaryPlacement,
} from './commentary-placement'
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
import { calculateBoundingBox, normalizeLayoutPlacements, isFullRowWidget } from '../utils/grid-helpers'
import { WIDGET_METHOD_MAP } from './widget-renderer'
import { assessBalanceSheetForPdf, type BalanceSheetPdfSources } from '../utils/balance-sheet-pdf'
import { packStatementYardstick, packWagesYardstick, packWagesEmployeeYardstick, noBudgetNote } from '../utils/budget-yardstick'
import { groupExpenseLines, withoutHeadingEcho } from '@/lib/monthly-report/expense-groups'
import { groupFullYearLines } from '@/lib/monthly-report/full-year-groups'
import type { ContractorRollup } from '@/lib/monthly-report/contractor-rollup'
import { buildContractorSheetModel, longMonthLabel, parseContractorPageConfig, sheetMonthHeading, type ContractorPageConfig, type SheetCell } from '@/lib/monthly-report/contractor-page'
import { applyPayrollRoster, runTotal, type PayrollGrid, type RosteredPayroll } from '@/lib/monthly-report/payroll-grid'
import { parsePayrollGridConfig, type PayrollGridConfig } from '@/lib/monthly-report/payroll-grid-config'
import {
  parseRatioAnalysisConfig,
  buildRatioTable,
  formatRatioCell,
  monthLabel,
  type AccountActuals,
  type RatioRow,
} from '@/lib/monthly-report/ratio-table'
import { withoutSilentLines, withoutSilentFullYearLines } from '@/lib/monthly-report/empty-lines'
import {
  GROUP_SHADE,
  BAND,
  BAND_LIGHT,
  BAND_SUB,
  BAND_SUB_TEXT,
  BAND_TEXT,
  TEXT,
  periodBandRow,
  type BandGroup,
  SECTION_TEXT,
  RULE_STRONG,
  paintNegatives,
  packTableStyles,
  statementColumns,
  statementTableStyles,
  BUDGET_SHADE,
  BUDGET_SHADE_STRONG,
  TOTAL_RULE,
  INDENT_MM,
  NEGATIVE,
  shortPeriodMonth,
  packMonthYear,
  packMoney,
  type RGB,
} from './pack-style'
import { moneyFlowRows, parseMoneyFlowConfig } from '@/lib/monthly-report/money-flow-rows'
import { executiveSummaryRows, marginRow, sectionDetailRows, type SummaryFigures } from './statement-rows'
import {
  hasForecastBudget,
  forwardSeriesAbsentNote,
  VALUE_ABSENT,
} from '../utils/full-year-approved'
import {
  fullYearBasis,
  fullYearCell,
  fullYearProjected,
  fullYearAnnualYardstick,
  fullYearVariance,
  deriveFullYearOperatingProfit,
  fullYearSectionLabel,
  fullYearMonthLabel,
  fullYearPeriodLabel,
  fullYearBasisNote,
} from '../utils/full-year-basis'
import { closingRowsBreak, keepWithNextStarts, lastPageWidowBreak, tablePageStarts } from '../utils/full-year-page-break'
import type { BalanceSheetCompare, BalanceSheetData } from '../types'
import { bsAmountText, bsPercentText } from '@/lib/monthly-report/balance-sheet-rows'
import {
  parseSubscriptionPageConfig,
  buildSubscriptionPageModel,
  sheetMonthLabel,
  subscriptionDetailOnBasis,
  subscriptionDetailOnTotalBudget,
  varianceFill,
} from '@/lib/monthly-report/subscription-page'

interface PDFOptions {
  commentary?: VarianceCommentary
  fullYearReport?: FullYearReport
  subscriptionDetail?: SubscriptionDetailData
  /**
   * Which months on the cash page are actuals and which are budget. Printed
   * under the cash table and in the box under the chart, because a reader
   * cannot otherwise tell which half of the row is history — and a projection
   * of a month that has already happened is exactly the defect this page had.
   */
  cashflowBasis?: string | null
  /** The Contractor Analysis page's rows, already rolled up (see contractor-rollup). */
  contractorDetail?: ContractorRollup
  /**
   * Why there are no contractor rows, when the export tried to load them and
   * could not, or found none. Absent when nothing was asked for (no contractor
   * accounts configured) — then the page is dropped, as #508 drops any page
   * with nothing to say. Present, it is printed on the page.
   */
  contractorDetailReason?: string
  /**
   * The route's answer the rollup was made from, with its month window — what
   * a contractor_detail placement on the 'calxa' layout sets out (see
   * contractor-page). Without it that placement prints the standard page.
   */
  contractorDetailReport?: SubscriptionDetailData
  /** The two-month payroll grid (see payroll-grid). */
  payrollGrid?: PayrollGrid
  /** Why there is no payroll grid, on the same terms as contractorDetailReason. */
  payrollGridReason?: string
  /**
   * Per-account monthly actuals for every placed Ratio Analysis page, fetched
   * once for all of them. `data: null` carries the reason — a multi-org
   * business, a failed load — and the page prints it.
   */
  accountActuals?: { data: AccountActuals | null; reason?: string }
  wagesDetail?: WagesDetailData
  cashflowForecast?: CashflowForecastData
  /**
   * Why a business on cash model v2 has no cashflow (a refused month, terms
   * that could not be derived, unreadable settings). The cash pages print it
   * rather than dropping out of the pack — the cf-page-silently-dropped
   * defect — and never fall back to the v1 pages in its place.
   */
  cashflowReason?: string
  /** WE.1b — external-metrics series with this month's values (entered data). */
  externalMetrics?: import('../types').ExternalMetricSeriesData[]
  /** WC.5 — the app's display name for the business ("Urban Road"). */
  businessName?: string
  /**
   * The legal entity ("Urban Road Pty Ltd") for the cover and every page
   * title — see pack-entity-name. Falls back to businessName when absent.
   */
  entityName?: string | null
  /** WD.8 — the month's written memo (snapshot coach_notes). */
  memo?: string
  /**
   * When the report was settled — finalised, or approved for sending — for the
   * cover's "Prepared on". Null or absent: the export date (see pack-prepared-on).
   */
  preparedOn?: PackPreparedOn | null
  /** The business's pack mark (monthly_report_settings.pack_logo). Absent: the WisdomBI lockup. */
  packLogo?: PackLogoSetting | null
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

/**
 * A commentary heading as a page title: "COMMENTARY" becomes "Commentary", the
 * way every other title in the pack is cased. A heading the coach typed in
 * mixed case is theirs and prints as typed.
 */
function titleCaseHeading(heading: string): string {
  if (heading !== heading.toUpperCase()) return heading
  return heading.toLowerCase().replace(/(^|\s)([a-z])/g, (_, pre: string, c: string) => `${pre}${c.toUpperCase()}`)
}

// A4 dimensions in mm
/**
 * Where content starts down the page under the WisdomBI lockup.
 *
 * Higher than the left/right margin on purpose: the lockup is drawn at 9mm and
 * is about 9mm tall, so a table that began at the margin ran straight through
 * it — which is exactly what happened on the CONTINUATION pages, where there is
 * no title to push the table down and the column headers landed under the logo.
 *
 * A custom mark reaches much further down (Calxa's 22mm square runs from 11.5mm
 * to 33.5mm), so the page asks contentTop() rather than reading this directly.
 * The title's own position stays measured off this: Calxa sets the title beside
 * its mark, not under it.
 */
const CONTENT_TOP = 22
/** Where running text starts on a continuation page (no title): a table's run-on header sits at 10mm; a text baseline under it. */
const CONTINUATION_TEXT_TOP = 14
/**
 * Clear space under a custom corner mark, in mm. Two measures, because the
 * page's y means two things: a table's TOP edge (2mm, which is where Calxa's
 * tables sit under its mark — 33.5mm to 35.6mm), and a line of text's BASELINE,
 * whose capitals rise another 2.5-3mm above it at 10-12pt.
 */
const CORNER_MARK_GAP = 2
const CORNER_MARK_BASELINE_GAP = 5

const A4_SHORT = 210
const A4_LONG = 297

// Variance cell tint colors
/** Unfavourable figures. Calxa's red — the only colour it spends on a number. See pack-style NEGATIVE. */
const TEXT_NEGATIVE: [number, number, number] = [NEGATIVE[0], NEGATIVE[1], NEGATIVE[2]]

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

/** A business's own pack mark, decoded enough to size it. */
type CustomMark = { image: string; format: 'PNG' | 'JPEG'; px: { w: number; h: number } }

/**
 * The one line a draft carries, on the cover under "Prepared on" — or null.
 *
 * Calxa's words, from the March 2026 Urban Road pack: "There are still one
 * unreconciled transactions when this report is generated." Kept, with the
 * number agreeing ("There is still 1 unreconciled transaction"), as Matt asked
 * for correct spelling over Calxa's slips. Printed whenever the count is
 * above zero, draft or not: it is a fact about the books the reader is owed,
 * and a final report carrying one is what pre-flight flags.
 *
 * A draft with nothing unreconciled — held back for some other reason — gets a
 * neutral line of our own, because Calxa never printed one: its packs were
 * finished before they were exported.
 */
export function draftCoverLine(report: Pick<GeneratedReport, 'is_draft' | 'unreconciled_count'>): string | null {
  const n = report.unreconciled_count ?? 0
  if (n > 0) {
    return n === 1
      ? 'There is still 1 unreconciled transaction when this report is generated.'
      : `There are still ${n} unreconciled transactions when this report is generated.`
  }
  return report.is_draft ? 'Draft — figures may change' : null
}

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
// The subscriptions sheet's two variance fills, sampled off Urban Road's
// August 2026 Calxa p13 (rasterised at 72dpi). Page-local: no other page fills
// a variance cell.
const SHEET_VARIANCE_GREEN: [number, number, number] = [183, 225, 205]
const SHEET_VARIANCE_RED: [number, number, number] = [244, 199, 195]
/** The lighter companion, for a second tier of subtotal. */
const OP_BLUE: [number, number, number] = [244, 244, 246]
/**
 * The payroll page's Difference fills, when its placement asks for them
 * (difference_fills). Pale, so the figure is read and not the block, and so
 * red text still shows on the over-budget one.
 */
const PAYROLL_UNDER_FILL: RGB = [222, 241, 231]
const PAYROLL_OVER_FILL: RGB = [251, 226, 226]

/**
 * The one tone the cash pages have that no other page does, sampled off Urban
 * Road's August 2026 Calxa pack (pages 22-25): the cyan under Bank at
 * Beginning / Bank at End, and the darker cell where they cross the Total
 * column. The band, shades and red are the shared pack-style values.
 */
const CF_BANK: RGB = [156, 227, 255]
const CF_BANK_TOTAL: RGB = [143, 214, 242]

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
  /**
   * Accounts a commentary block should have commented on and printed nothing
   * for, by the widget that drew the block (null = the legacy statement).
   * See CommentaryGap. Filled by generate().
   */
  readonly commentaryGaps: (CommentaryGap & { widgetId: string | null })[] = []
  /**
   * Accounts whose bullet printed the stored draft although the block set a
   * vendor_cap on them. See CommentaryCapIgnored. Filled by generate().
   */
  readonly commentaryCapsIgnored: (CommentaryCapIgnored & { widgetId: string | null })[] = []
  /**
   * Pages a renderer opened (or titled), as opposed to the ones autoTable adds
   * when a table runs on. Calxa puts its corner mark only on the first page of
   * a table: on the run-on pages the repeated header sits at the top of the
   * sheet, and our mark was painted straight over it (the band over Unspent on
   * Urban Road's expense page 11). addAllFooters reads this.
   */
  private openedPages = new Set<number>([1])
  /** The page the cover was drawn on — it carries no page number. */
  private coverPage: number | null = null
  /** The custom mark, once read — see customMark. `undefined` = not read yet. */
  private customMarkCache: CustomMark | null | undefined = undefined
  /**
   * Pages whose top title has been drawn in the Calxa position. A custom mark
   * leaves content starting at contentTop(), which a page that has just been
   * titled can also be sitting at; without this a second title on the same page
   * would be set over the first instead of below it.
   */
  private topTitledPages = new Set<number>()
  /**
   * Layout pages where a placed widget sits where the corner mark would go (a
   * KPI card in the top-right grid cell). addAllFooters leaves the mark off
   * them: the card is content the coach placed, the mark is chrome.
   */
  private cornerClaimedPages = new Set<number>()

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
          this.openedPages = new Set([1])
          this.coverPage = null
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
    // Landscape, as Calxa sets its summary: nine figure columns do not fit a
    // portrait page at a size anyone can read.
    this.addPage('landscape')
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
    } else if (this.options.cashflowReason) {
      this.addCashflowForecastPage()
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
    this.openedPages.add(this.doc.getNumberOfPages())
    if (orientation === 'landscape') {
      this.pageWidth = A4_LONG
      this.pageHeight = A4_SHORT
    } else {
      this.pageWidth = A4_SHORT
      this.pageHeight = A4_LONG
    }
    this.yPosition = this.contentTop()
  }

  // =====================================================================
  // Cover page (WC.5) — Calxa's cover, page 1
  // =====================================================================
  // Draws on the CURRENT page: page 1 in the default flow, the widget's page
  // in the layout flow.
  //
  // Transcribed from Urban Road's August 2026 Calxa cover, measured with
  // pdftotext -bbox: the mark centred near the top; "Monthly Report" at 30pt
  // regular; the entity in bold at the same size; "(Accruals basis)" small
  // beneath it; the month in bold; "Prepared on …" alone at the bottom left.
  // Nothing else. Ours was a WisdomBI cover (WC.5) — the display name in grey,
  // "Monthly Management Report", a financial-year line, a divider, and a green
  // "Final" — and it was the one page of the pack that looked nothing like the
  // one the client has received every month.
  //
  // A draft says so once, in one plain line under the date, as Calxa does
  // (draftCoverLine) — not a red PROVISIONAL, a DRAFT watermark and a footer on
  // every page, which Matt took out of the pack on 14 Sep 2026.
  private addCoverPage(): void {
    const { report } = this
    const centerX = this.pageWidth / 2
    this.coverPage = this.doc.getNumberOfPages()
    // The positions are Calxa's, in mm down a portrait sheet. A layout may put
    // the cover on a landscape page (cover_page allows a full row there), where
    // "Prepared on" at 245mm fell past the 210mm sheet and silently vanished;
    // scaling by the sheet's height keeps the same composition on either.
    const down = (mm: number) => mm * (this.pageHeight / A4_LONG)

    // The mark, centred, about 36mm across with its top 25mm down, where
    // Calxa's sits. A cover with no mark on it is the one page a client is
    // certain to look at and the one that says least.
    try {
      const custom = this.customMark()
      if (custom) {
        // The business's own mark, in Calxa's box — see PACK_LOGO_COVER_BOX.
        const { w, h } = fitLogo(custom.px.w, custom.px.h, PACK_LOGO_COVER_BOX.size)
        this.doc.addImage(custom.image, custom.format, centerX - w / 2, down(PACK_LOGO_COVER_BOX.top), w, h)
      } else {
        const w = 46
        const h = (LOGO_COVER_SIZE.h / LOGO_COVER_SIZE.w) * w
        this.doc.addImage(LOGO_COVER, 'PNG', centerX - w / 2, down(25), w, h)
      }
    } catch {
      // A pack without its logo is still a pack. Never the other way round.
    }

    this.doc.setTextColor(0, 0, 0)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(30)
    this.doc.text('Monthly Report', centerX, down(89), { align: 'center' })

    // The legal entity, as Xero names it. A long name gets a second line
    // rather than running off a portrait page.
    const entity = this.packEntityName() || 'Monthly Report'
    this.doc.setFont('helvetica', 'bold')
    const nameLines: string[] = this.doc.splitTextToSize(entity, this.pageWidth - this.margin * 2)
    let y = down(132.5) - (nameLines.length - 1) * 11.5
    for (const l of nameLines) {
      this.doc.text(l, centerX, y, { align: 'center' })
      y += 11.5
    }
    y -= 11.5

    // Basis is accruals until WD.7 ships a cash-basis pack.
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(7)
    this.doc.text('(Accruals basis)', centerX, y + 6.5, { align: 'center' })

    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(22)
    this.doc.text(this.formatMonth(report.report_month), centerX, down(162.5), { align: 'center' })

    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(10)
    // The day the report was settled when it has been (finalised, or approved
    // for sending); the export date for a draft, or when that could not be read.
    this.doc.text(`Prepared on ${formatPackPreparedOn(this.options.preparedOn)}`, this.margin, down(245))

    const draftLine = draftCoverLine(report)
    if (draftLine) this.doc.text(draftLine, this.margin, down(245) + 5.5)

    const statusY = down(180)

    // WF.4 — budget provenance. A back-filled budget makes every variance an
    // echo of the actuals; the pack must say so where the reader starts.
    if (this.options.budgetBackfilled) {
      this.doc.setFontSize(9)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(146, 64, 14) // amber-800
      this.doc.text(
        'Budget for this month was back-filled from actuals — variance columns are not a measure of performance.',
        centerX, statusY, { align: 'center' },
      )
    }
    this.doc.setTextColor(0, 0, 0)
  }

  /** The entity every title names — the legal name when the export found one. */
  private packEntityName(): string {
    return (this.options.entityName ?? '').trim() || (this.options.businessName ?? '').trim()
  }

  /**
   * The business's own mark, when it has chosen one and it can be drawn; null
   * for the WisdomBI lockup. Read once per pack: the cover and every corner ask.
   *
   * A chosen mark that cannot be drawn falls back to the lockup and says so in
   * Sentry — the pack still goes out, but a logo the coach did not choose is a
   * substitution someone should hear about.
   */
  private customMark(): CustomMark | null {
    if (this.customMarkCache !== undefined) return this.customMarkCache
    const logo = resolvePackLogo(this.options.packLogo)
    let problem: string | null = logo.kind === 'wisdombi' ? logo.problem : null
    let mark: CustomMark | null = null
    if (logo.kind === 'custom') {
      try {
        const props = this.doc.getImageProperties(logo.image)
        if (props.width > 0 && props.height > 0) {
          mark = { image: logo.image, format: logo.format, px: { w: props.width, h: props.height } }
        } else {
          problem = 'the custom logo has no pixel size'
        }
      } catch (err) {
        problem = `the custom logo could not be decoded: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    if (problem) {
      Sentry.captureMessage('[PDF] pack logo setting unusable — printed the WisdomBI lockup instead', {
        level: 'warning',
        tags: { invariant: 'pack-logo-unusable' },
        extra: { problem, businessId: this.report?.business_id, reportMonth: this.report?.report_month },
      } as any)
    }
    this.customMarkCache = mark
    return mark
  }

  /**
   * Where content may start on a page that carries the corner mark: under the
   * mark when it is a custom one, CONTENT_TOP under the lockup (which ends
   * above it). A 22mm square ends at 33.5mm, so a memo or a commentary that
   * runs onto a fresh page began 11mm inside it. A baseline, so it leaves room
   * for the first line's capitals — see CORNER_MARK_BASELINE_GAP.
   */
  private contentTop(): number {
    const bottom = this.customMarkBottom()
    return bottom === null ? CONTENT_TOP : Math.max(CONTENT_TOP, bottom + CORNER_MARK_BASELINE_GAP)
  }

  /** How far down the page a custom corner mark reaches, in mm; null under the lockup. */
  private customMarkBottom(): number | null {
    const custom = this.customMark()
    if (!custom) return null
    return PACK_LOGO_CORNER_BOX.top + fitLogo(custom.px.w, custom.px.h, PACK_LOGO_CORNER_BOX.size).h
  }

  /** Where the corner mark is drawn on a page of this width, in mm. */
  private cornerMarkBox(pageWidth: number): { x: number; y: number; w: number; h: number } {
    const custom = this.customMark()
    if (custom) {
      const { w, h } = fitLogo(custom.px.w, custom.px.h, PACK_LOGO_CORNER_BOX.size)
      return { x: pageWidth - PACK_LOGO_CORNER_BOX.right - w, y: PACK_LOGO_CORNER_BOX.top, w, h }
    }
    const w = 17
    return { x: pageWidth - this.margin - w, y: 9, w, h: (LOGO_CORNER_SIZE.h / LOGO_CORNER_SIZE.w) * w }
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
  // Where Did Our Money Go (WD.4, PORTRAIT) — Calxa page 26
  // =====================================================================
  // One table, Calxa's: Opening | Closing | Movement, the Movement column on
  // its faint ground, four grey section headings (the P&L summary, where the
  // money came from, where it went, the bank accounts), a bold Total closing
  // each, and Net Movement last. Ours was a sentence ("Your bank moved from
  // 265,685 to 210,185 — down 55,500"), a teal table and a red one ranked by
  // amount and cut at twelve rows, and a grey proof note — a funds-flow card,
  // not the page the client has read every month.
  //
  // The rows, their totals and the last line are decided in
  // lib/monthly-report/money-flow-rows (config.last_line picks the last
  // line); this method decides only how they look. The measurements are
  // Calxa's, off Urban Road's August 2026 p26 with pdftotext -bbox and a
  // 200dpi raster: a 4.4mm band over a 4.55mm column-label row, a 6mm section
  // heading at 12pt grey bold, 7.75pt rows on a 3.6mm pitch shaded every
  // second row from each heading, a 72mm label column and three of 36mm.
  private addMoneyFlowPage(config?: Record<string, unknown>): void {
    const flow = this.options.moneyFlow!
    this.addPage('portrait')

    // "Where Did Our Money Go? — Urban Road Pty Ltd" over a bare "AUG 2026",
    // as the balance sheet heads its page.
    const period = packMonthYear(this.report.report_month)
    this.drawPageTitle(`Where Did Our Money Go? — ${period}`, { monthPrefix: false })

    if (!flow.comparable) {
      // The honest card: the page can't prove itself this month, and says why.
      this.drawReasonCard(`This page couldn't be verified this month: ${flow.reason ?? 'insufficient data'}`)
      return
    }

    // Not thrown: generateFromLayout's catch prints "Render error", and this
    // config is typed by hand in SQL — the reason is the only way a typo shows.
    const parsed = parseMoneyFlowConfig(config)
    if (!parsed.ok) {
      this.drawReasonCard(`This page could not be built — its configuration is not valid: ${parsed.reason}.`)
      return
    }

    // Calxa's band starts directly under the period line; drawPageTitle leaves
    // the 8mm the statement pages want under theirs.
    this.yPosition -= 7

    const { rows, notes } = moneyFlowRows(flow, parsed.config)
    const money = (v: number | null) => (v === null ? '' : packMoney(v))
    const body = rows.map((r) => {
      switch (r.type) {
        case 'section': return [r.label, '', '', '']
        case 'line': return [r.label, money(r.opening), money(r.closing), money(r.movement)]
        default: return [r.label, '', '', money(r.movement)]
      }
    })

    // Every second row from each heading is shaded; the heading resets it and
    // so does Net Movement, which Calxa sets on white after the bank's Total.
    const zebra: boolean[] = []
    let n = 0
    for (const r of rows) {
      if (r.type === 'section' || r.type === 'last') n = 0
      zebra.push(r.type !== 'section' && n % 2 === 1)
      if (r.type !== 'section') n++
    }
    const ZEBRA: RGB = [...BAND_SUB]

    const width = this.pageWidth - this.margin * 2
    const figureWidth = 36
    const labelWidth = width - figureWidth * 3

    // At a 1.0 line-height factor a 7.75pt row is the height its padding says;
    // restored in `finally` so no later page inherits the tighter leading.
    const savedLineHeight = this.doc.getLineHeightFactor()
    this.doc.setLineHeightFactor(1)
    try {
      autoTable(this.doc, {
        startY: this.yPosition,
        head: [
          [
            { content: '', styles: { fillColor: [...BAND] } },
            { content: `Opening ${period}`, styles: { fillColor: [...BAND] } },
            { content: `Closing ${period}`, styles: { fillColor: [...BAND] } },
            { content: 'Movement', styles: { fillColor: [...BAND_LIGHT] } },
          ],
          [
            { content: '', styles: { fillColor: [...BAND_SUB] } },
            { content: '', styles: { fillColor: [...BAND_SUB] } },
            { content: '', styles: { fillColor: [...BAND_SUB] } },
            { content: 'Actuals', styles: { fillColor: [...BUDGET_SHADE_STRONG] } },
          ],
        ],
        body,
        theme: 'plain',
        showHead: 'everyPage',
        styles: {
          font: 'helvetica',
          fontSize: 7.75,
          textColor: [0, 0, 0],
          valign: 'bottom',
          overflow: 'ellipsize',
          lineWidth: 0,
          cellPadding: { top: 0.43, right: 0.5, bottom: 0.43, left: 1.1 },
        },
        headStyles: { fontStyle: 'normal', fontSize: 10, textColor: [0, 0, 0], halign: 'right' },
        columnStyles: {
          0: { cellWidth: labelWidth, halign: 'left' },
          1: { cellWidth: figureWidth, halign: 'right' },
          2: { cellWidth: figureWidth, halign: 'right' },
          3: { cellWidth: figureWidth, halign: 'right' },
        },
        // A continuation page has no title and no corner mark, so its repeated
        // header sits 10mm down, as on the balance sheet's run-on page.
        margin: { top: 10, left: this.margin, right: this.margin, bottom: 16 },
        didParseCell: (data) => {
          const col = data.column.index
          const style = data.cell.styles
          if (data.section === 'head') {
            style.minCellHeight = data.row.index === 0 ? 4.4 : 4.55
            style.cellPadding = { top: 0.2, right: 0.5, bottom: 0.25, left: 1.1 }
            return
          }

          const row = rows[data.row.index]
          const shaded = zebra[data.row.index]
          // The Movement column on its own ground the full height of the
          // table, one step darker where a shaded row crosses it.
          if (col === 3) style.fillColor = shaded ? [...BUDGET_SHADE_STRONG] : [...BUDGET_SHADE]
          else if (shaded) style.fillColor = ZEBRA

          if (row?.type === 'section') {
            if (col === 0) {
              style.textColor = [...SECTION_TEXT]
              style.fontStyle = 'bold'
              style.fontSize = 12
            }
            style.cellPadding = { top: 2.4, right: 0.5, bottom: 1.0, left: 1.1 }
          } else if (row?.type === 'total' || row?.type === 'last') {
            // Bold, with the light rule under the row that closes each block.
            style.fontStyle = 'bold'
            style.lineWidth = { top: 0, right: 0, bottom: 0.5, left: 0 }
            style.lineColor = [...TOTAL_RULE]
            // Net Movement stands a line-gap clear of the bank's Total, as on p26.
            if (row.type === 'last') style.cellPadding = { top: 1.6, right: 0.5, bottom: 0.43, left: 1.1 }
          }

          // Red for a bracketed figure, bold rows included — the only colour
          // the page spends.
          if (col > 0 && String(data.cell.raw ?? '').startsWith('(')) style.textColor = [...NEGATIVE]
        },
      })
    } finally {
      this.doc.setLineHeightFactor(savedLineHeight)
    }

    // These are the notes that say the page does not reconcile, so they must
    // not be the part that runs off the paper: a table ending near the foot of
    // its page sends them to a new one, clear of the same 16mm the table keeps.
    let y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 5
    for (const note of notes) {
      if (y + this.noteHeight(note) > this.pageHeight - 16) {
        this.addPage('portrait')
        y = this.yPosition
      }
      y = this.drawNote(note, y) + 1
    }
  }

  /** config.last_line, config.summary_codes — see parseMoneyFlowConfig. */
  renderMoneyFlow(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    this.renderWithSkipPage(() => this.addMoneyFlowPage(widget?.config), box)
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
  // /api/Xero/balance-sheet — or, for a finalised month, the copy frozen into
  // its snapshot — in the order the route emits them: flat Asset, Liability,
  // Net Assets, Equity, as Calxa prints them. Ordering, labels, which class an
  // account sits in, which rows show and the variance sign
  // convention are NOT re-derived here — they are decided once, in
  // lib/monthly-report/balance-sheet-rows.ts, because BalanceSheetTab renders
  // the same array and a PDF page that disagrees with the tab above it is the
  // defect this widget was written to avoid. This file decides only how the
  // rows LOOK.
  private addBalanceSheetPage(compare: BalanceSheetCompare): void {
    const verdict = assessBalanceSheetForPdf(this.options.balanceSheets?.[compare], compare)
    this.addPage('portrait')

    // Calxa heads both pages identically — "Balance Sheet — Urban Road Pty Ltd"
    // over a bare "AUG 2026" — and lets the column band say which comparison
    // it is. Both lines go through the pack's shared title, the period without
    // the statements' "MONTH:" prefix, which this page does not carry.
    this.drawPageTitle(`Balance Sheet — ${packMonthYear(this.report.report_month)}`, { monthPrefix: false })
    // Only the band and the table move up 1.5mm (4.4pt) — the title and the
    // period line stay where drawPageTitle puts every page's, so this page's
    // title still sits about 1.5pt below Calxa's. The 1.5mm under the title is
    // what keeps Urban Road's prior-month comparison on one page.
    this.yPosition -= 1.5

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

    // No footnote under the table (decision 18). Calxa's page has none, and
    // the one this printed — "Sourced from Xero · Negatives shown in (brackets)
    // · % Variance is N/A…" — explained conventions the rest of the pack uses
    // without comment, in grey type a reader skips.
    this.renderBalanceSheetTable(verdict.data)
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

  /** The height drawNote will take for `message` at its default size, to break a page before it. */
  private noteHeight(message: string, fontSize = 7.5): number {
    const saved = this.doc.getFontSize()
    this.doc.setFontSize(fontSize)
    this.doc.setFont('helvetica', 'normal')
    const lines: string[] = this.doc.splitTextToSize(message, this.pageWidth - this.margin * 2)
    const lineHeight = (fontSize * 1.15) / (this.doc as any).internal.scaleFactor
    this.doc.setFontSize(saved)
    return lines.length * lineHeight + 1.5
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

  private renderBalanceSheetTable(bs: BalanceSheetData): void {
    // autoTable can't see row semantics, so carry them alongside: didParseCell
    // reads this by row index rather than sniffing the rendered label text.
    const rows = bs.rows

    const body = rows.map((r) => {
      if (r.type === 'section_header') return [r.label, '', '', '', '']
      return [
        r.label,
        bsAmountText(r.current),
        bsAmountText(r.prior),
        bsAmountText(r.variance),
        bsPercentText(r.variance_pct),
      ]
    })

    // Calxa's balance sheet, measured off Urban Road's August 2026 pack (p19):
    // a 6.7mm band over a 4.5mm column-label row, both Actuals columns on a
    // faint grey ground the full height of the table, no gridlines, labels
    // about 9pt against 7pt figures, and a 3.5mm row pitch — which is what
    // puts sixty-odd rows on one page. Ours was a boxed grid at 5.3-6.8mm a
    // row, and the prior-month sheet ran to two pages where Calxa's fits one.
    // The greys and the red are pack-style's: sampled off p19 they came out
    // the statement pages' exact values (Calxa's own content stream sets
    // every negative in pure 1 0 0), so the page keeps no palette of its own.
    const width = this.pageWidth - this.margin * 2
    const labelWidth = 85
    const figureWidth = (width - labelWidth) / 4

    // autoTable sizes a row from the document's line-height factor (1.15 by
    // default). At 1.0 a 8.5pt label is the height Calxa sets it; restored in
    // `finally` so no later page inherits the tighter leading.
    const savedLineHeight = this.doc.getLineHeightFactor()
    this.doc.setLineHeightFactor(1)
    try {
      autoTable(this.doc, {
        startY: this.yPosition,
        head: [
          [
            { content: '', styles: { fillColor: [...BAND] } },
            { content: bs.current_label, styles: { fillColor: [...BAND_LIGHT] } },
            { content: bs.prior_label || '—', colSpan: 3, styles: { fillColor: [...BAND] } },
          ],
          [
            { content: '', styles: { fillColor: [...BAND_SUB] } },
            { content: 'Actuals', styles: { fillColor: [...BUDGET_SHADE_STRONG] } },
            { content: 'Actuals', styles: { fillColor: [...BUDGET_SHADE_STRONG] } },
            { content: 'Variance', styles: { fillColor: [...BAND_SUB] } },
            { content: '% Variance', styles: { fillColor: [...BAND_SUB] } },
          ],
        ],
        body,
        theme: 'plain',
        showHead: 'everyPage',
        styles: {
          font: 'helvetica',
          textColor: [26, 26, 26],
          valign: 'bottom',
          overflow: 'ellipsize',
          lineWidth: 0,
          cellPadding: { top: 0.3, right: 1.5, bottom: 0.3, left: 1.5 },
        },
        headStyles: { fontStyle: 'normal', fontSize: 8.5, textColor: [26, 26, 26], halign: 'right' },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: labelWidth, halign: 'left' },
          1: { cellWidth: figureWidth, halign: 'right' },
          2: { cellWidth: figureWidth, halign: 'right' },
          3: { cellWidth: figureWidth, halign: 'right' },
          4: { cellWidth: figureWidth, halign: 'right' },
        },
        // The continuation page has no title and no corner mark (addAllFooters
        // draws it only on pages a title opened), so its repeated header sits
        // 10mm down, as on Calxa p21 and the statement tables' run-on pages.
        margin: { top: 10, left: this.margin, right: this.margin, bottom: 16 },
        didParseCell: (data) => {
          const col = data.column.index
          if (data.section === 'head') {
            if (data.row.index === 0) {
              // The period band: current period over its own column, the
              // comparison period centred across the three it governs.
              data.cell.styles.halign = col === 0 ? 'left' : 'center'
              data.cell.styles.fontSize = 9.5
              data.cell.styles.minCellHeight = 6.7
              data.cell.styles.valign = 'middle'
            } else {
              data.cell.styles.minCellHeight = 4.5
            }
            return
          }

          const row = rows[data.row.index]
          const style = data.cell.styles

          // Both Actuals columns sit on the faint ground, as in Calxa — the
          // eye reads the two balances as a pair and the variances as derived.
          if (col === 1 || col === 2) style.fillColor = [...BUDGET_SHADE]

          if (row?.type === 'section_header') {
            // A class heading (Asset, Liability, Equity) — the only heading
            // level the sheet has since it stopped carrying Xero's groups.
            style.textColor = [...SECTION_TEXT]
            style.fontStyle = 'bold'
            style.fontSize = 8.5
            // The breathing room Calxa leaves under a total's rule.
            style.cellPadding = { top: 1.2, right: 1.5, bottom: 0.3, left: 1.5 }
          } else if (row?.type === 'line_item') {
            if (col === 0) {
              style.fontSize = 8.5
              style.cellPadding = { top: 0.3, right: 1.5, bottom: 0.3, left: 7 }
            }
          } else if (row?.type === 'subtotal' || row?.type === 'net_assets') {
            // Total Asset / Total Liability / Net Assets / Total Equity: bold,
            // with the thin grey rule under the row that closes each block.
            style.fontStyle = 'bold'
            if (col === 0) style.fontSize = 9
            style.lineWidth = { top: 0, right: 0, bottom: 0.5, left: 0 }
            style.lineColor = [...TOTAL_RULE]
            style.cellPadding = {
              top: row.type === 'net_assets' ? 0.8 : 0.3,
              right: 1.5,
              bottom: 0.6,
              left: 1.5,
            }
          }

          // Red for a bracketed figure — the only colour Calxa spends on this
          // page, % Variance included. '—' is never red. 'N/A' takes the colour
          // of the variance beside it: Calxa p20 prints Shopify loan 2's
          // "(89,418) N/A" with both red and Latitude Gem Visa's "3,910 N/A"
          // with both black, so a new liability reads unfavourable all the way
          // across, not just in the one column that had a number to bracket.
          const text = String(data.cell.raw ?? '')
          const varianceText = body[data.row.index]?.[3] ?? ''
          if (col > 0 && text.startsWith('(')) style.textColor = [...NEGATIVE]
          else if (col === 4 && text === 'N/A' && varianceText.startsWith('(')) style.textColor = [...NEGATIVE]
        },
      })
    } finally {
      this.doc.setLineHeightFactor(savedLineHeight)
    }
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
  // Actual vs Budget summary — Calxa page 2 (LANDSCAPE)
  // =====================================================================
  // Calxa's page, row for row: a grey heading and a bold total per section,
  // Gross / Operating / Net Profit between them, then Additional Information —
  // the two margins run across every column, not the month's actual margin in
  // a box of its own. No grid, no filled profit rows, bold only where a total
  // is; the budget columns shaded down the page. See statement-rows for the
  // rows and pack-style for the measurements.
  private addExecutiveSummary(): void {
    const { report } = this
    const settings = report.settings

    // "FY2027" used to sit on its own line under the title, labelling a band
    // that said "YTD FY2027". The band now names its months, so the line said
    // nothing the page does not.
    this.drawPageTitle(`Actual vs Budget — ${this.formatMonth(report.report_month)}`)

    // Calxa's words over the money — "Budgets", "YTD Budget" — for every
    // client. See packStatementYardstick for why the pack no longer needs
    // "Approved Budget" to tell two yardsticks apart.
    const yardstick = packStatementYardstick()
    const hasYtd = settings.show_ytd
    const hasUnspent = settings.show_unspent_budget
    const hasNextMonth = settings.show_budget_next_month
    const hasAnnual = settings.show_budget_annual_total
    const cols = statementColumns({
      reportMonth: report.report_month,
      fiscalYear: report.fiscal_year,
      budgetLabel: yardstick.columnLabel,
      ytdBudgetLabel: yardstick.ytdColumnLabel,
      showYtd: hasYtd,
      showUnspent: hasUnspent,
      showNextMonth: hasNextMonth,
      showAnnual: hasAnnual,
      showPriorYear: false,
      showVariancePercent: false,
    })

    // Same three states as the rows on pages 4/6/10 and as ReportSummaryCards,
    // which suppresses its Budget line entirely when there is no budget. This
    // page is the one a client reads first.
    const figureCells = (f: SummaryFigures): string[] => {
      const r = [this.budgetCell(f.budget), this.fmtCurrency(f.actual), this.hasBudget ? this.fmtVariance(f.variance) : VALUE_ABSENT]
      if (hasYtd) r.push(this.budgetCell(f.ytdBudget), this.fmtCurrency(f.ytdActual), this.hasBudget ? this.fmtVariance(f.ytdVariance) : VALUE_ABSENT)
      if (hasUnspent) r.push(this.budgetCell(f.unspent))
      if (hasNextMonth) r.push(this.budgetCell(f.nextMonth))
      if (hasAnnual) r.push(this.budgetCell(f.annual))
      return r
    }

    type Kind = 'heading' | 'total' | 'profit' | 'info-heading' | 'info' | 'info-last'
    const kinds: Kind[] = []
    const body: string[][] = []
    const blanks = () => Array.from({ length: cols.figureCount }, () => '')

    const rows = executiveSummaryRows(report)
    for (const row of rows) {
      if (row.kind === 'heading') {
        body.push([row.label, ...blanks()])
      } else {
        body.push([row.label, ...figureCells(row.figures)])
      }
      kinds.push(row.kind)
    }

    // ── Additional Information ──
    // Rows of the same table, so each margin sits under the column it
    // describes. The separate 80mm table it used to be could not promise that.
    const income = rows.find((r) => r.kind === 'total' && r.label === 'Total Income')
    const grossProfit = rows.find((r) => r.kind === 'profit' && r.key === 'gp')
    const netProfit = rows.find((r) => r.kind === 'profit' && r.key === 'np')
    if (income?.kind === 'total' && grossProfit?.kind === 'profit' && netProfit?.kind === 'profit') {
      const marginCells = (profit: SummaryFigures): string[] => {
        const m = marginRow(profit, income.figures)
        // A margin of a budget is a budget figure: no budget, no margin.
        const b = (text: string) => (this.hasBudget ? text : VALUE_ABSENT)
        const r = [b(m.budget), m.actual, b(m.variance)]
        if (hasYtd) r.push(b(m.ytdBudget), m.ytdActual, b(m.ytdVariance))
        if (hasUnspent) r.push(b(m.unspent))
        if (hasNextMonth) r.push(b(m.nextMonth))
        if (hasAnnual) r.push(b(m.annual))
        return r
      }
      body.push(['Additional Information', ...blanks()])
      kinds.push('info-heading')
      body.push(['Gross Profit Margin', ...marginCells(grossProfit.figures)])
      kinds.push('info')
      body.push(['Net Profit Margin', ...marginCells(netProfit.figures)])
      kinds.push('info-last')
    }

    // The one sentence this page can still owe the reader is why the budget
    // columns are empty. The provenance sentence that used to follow it ("Every
    // budget figure on this page is the approved budget…") is gone from the
    // pack: Calxa has nothing between the title and the table, and Matt
    // accepted taking it out on 14 Sep 2026.
    this.drawNoBudgetNotice()

    // Calxa's proportions on a landscape page. A layout that still places the
    // summary portrait gets the same table at a size its 180mm can carry,
    // instead of the landscape one squeezed until its headers drop to 6pt.
    const wide = this.pageWidth > A4_SHORT
    const fontSize = wide ? 10 : 7
    const tableWidth = this.pageWidth - this.margin * 2
    const labelWidth = wide ? 62.5 : 36
    const figureWidth = (tableWidth - labelWidth) / cols.figureCount
    const columnStyles: Record<number, Record<string, unknown>> = {
      0: { cellWidth: labelWidth, halign: 'left', overflow: 'ellipsize' },
    }
    for (let i = 1; i <= cols.figureCount; i++) columnStyles[i] = { cellWidth: figureWidth, halign: 'right' }
    const ruleBelow = (width: number) => ({
      lineWidth: { top: 0, right: 0, bottom: width, left: 0 },
      lineColor: [...TOTAL_RULE] as RGB,
    })

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [
        periodBandRow(cols.band, { fontSize: wide ? 12 : 8, fontStyle: 'normal', minCellHeight: wide ? 9.2 : 6.5 }),
        cols.labels.map((label) => ({ content: label, styles: { minCellHeight: wide ? 9.5 : 7 } })),
      ],
      body,
      ...statementTableStyles(fontSize),
      tableWidth,
      columnStyles: columnStyles as never,
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') {
          if (data.row.index === 1 && cols.budgetCols.includes(col)) data.cell.styles.fillColor = [...BUDGET_SHADE_STRONG] as RGB
          return
        }
        if (data.section !== 'body') return
        const kind = kinds[data.row.index]
        const pad = (top: number, bottom: number) => {
          data.cell.styles.cellPadding = { top, bottom, left: 1.1, right: 0.6 }
        }
        const isInfo = kind === 'info' || kind === 'info-last' || kind === 'info-heading'
        if (!isInfo && cols.budgetCols.includes(col)) data.cell.styles.fillColor = [...BUDGET_SHADE] as RGB

        switch (kind) {
          case 'heading':
            if (col === 0) {
              data.cell.styles.textColor = [...SECTION_TEXT] as RGB
              data.cell.styles.fontSize = fontSize + 1
            }
            data.cell.styles.fontStyle = 'bold'
            pad(1.1, 0.2)
            break
          case 'total':
            data.cell.styles.fontStyle = 'bold'
            Object.assign(data.cell.styles, ruleBelow(0.5))
            pad(0.4, 1.2)
            break
          case 'profit':
            data.cell.styles.fontStyle = 'bold'
            Object.assign(data.cell.styles, ruleBelow(0.5))
            pad(1.2, 1.2)
            break
          case 'info-heading':
            if (col === 0) {
              data.cell.styles.textColor = [...SECTION_TEXT] as RGB
              data.cell.styles.fontSize = fontSize + 2
              data.cell.styles.overflow = 'visible'
            }
            data.cell.styles.fontStyle = 'bold'
            pad(5, 1.5)
            break
          case 'info':
            pad(0.4, 0.4)
            break
          case 'info-last':
            pad(0.4, 0.4)
            data.cell.styles.fillColor = [242, 242, 242] as RGB
            Object.assign(data.cell.styles, ruleBelow(0.9))
            break
        }

        // Unfavourable in red — the variances and an overspent Unspent Budget,
        // as Calxa colours them (it printed Other Income's (169) Unspent red;
        // ours was black, because only the variance columns were checked). The
        // margins stay black: "(6)" there is a difference of two percentages,
        // not a result that went wrong.
        if (!isInfo) paintNegatives(data as never)
      },
    })
    this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 6
  }

  // =====================================================================
  // Actual vs Budget detail — Calxa pages 4, 6 and 10-11 (LANDSCAPE)
  // =====================================================================
  private addBudgetVsActualDetail(
    sectionFilter?: import('../types').ReportCategory[] | null,
    widgetId?: string,
    placement: { titleOverride?: string; variancePercent?: boolean; commentary?: CommentaryPlacement } = {},
  ): void {
    // WD.2 — an optional section scope turns the full statement into the
    // Calxa-style per-section table (income, COGS, expenses). Filtered
    // tables show lines + subtotals only: Gross Profit and Net Profit are
    // statement-level rows and would be misleading footing a partial table.
    const filter = sectionFilter ?? null
    this.addPage('landscape')

    const settings = this.report.settings

    const title = placement.titleOverride?.trim() || sectionTableTitle(filter) || 'Budget vs Actual Detail'
    this.drawPageTitle(`${title} — ${this.formatMonth(this.report.report_month)}`)

    // Pack pages 4, 6 and 10, under Calxa's column words — see
    // packStatementYardstick.
    const yardstick = packStatementYardstick()
    this.drawNoBudgetNotice()

    const variancePercent = placement.variancePercent ?? true
    const cols = statementColumns({
      reportMonth: this.report.report_month,
      fiscalYear: this.report.fiscal_year,
      budgetLabel: yardstick.columnLabel,
      ytdBudgetLabel: yardstick.ytdColumnLabel,
      showYtd: settings.show_ytd,
      showUnspent: settings.show_unspent_budget,
      showNextMonth: settings.show_budget_next_month,
      showAnnual: settings.show_budget_annual_total,
      showPriorYear: settings.show_prior_year,
      showVariancePercent: variancePercent,
    })
    // The DOLLAR variance only is tinted. The percentage beside it carries no
    // second fact. See paintNegatives.
    const varianceCols = cols.varianceCols

    const tableData: any[] = []

    // Section names are LABELS, not warnings. The pack used emerald for Revenue,
    // red for Cost of Sales and amber for Operating Expenses — saturated
    // full-width bands that read as alarms, and they consumed the one colour the
    // page actually needs, which is red for an unfavourable figure. Calxa gives
    // the section a quiet grey heading and spends its red on the numbers.

    // What each body row is, for the styling pass — section heading, group
    // (carrying its subtotal), account line and its indent, or a total.
    type Kind = 'section' | 'group' | 'line' | 'total' | 'profit'
    const kinds: Kind[] = []
    const indents: number[] = []
    const push = (row: any[], kind: Kind, indent = 0) => {
      tableData.push(row)
      kinds.push(kind)
      indents.push(indent)
    }
    const lineRow = (line: ReportLine) => this.buildLineRow(line, settings, { variancePercent })
    /**
     * Commentary is a BLOCK under the table, not rows inside it.
     *
     * It used to be full-width amber strips wedged between the account lines,
     * which broke the statement in half wherever an account had something to
     * say. Calxa keeps its statement intact and puts the prose beneath it under
     * a "COMMENTARY" heading, as bullets — bold account name, then the facts.
     *
     * Which accounts, in what order, under what heading and on which page is the
     * placement's call — see commentary-placement.
     */
    const commentaryPlacement = placement.commentary ?? DEFAULT_COMMENTARY_PLACEMENT
    const commentaryLines: ReportLine[] = []

    const sectionsToRender = filter
      ? this.report.sections.filter((s) => filter.includes(s.category))
      : this.report.sections

    for (const section of sectionsToRender) {
      // A Xero chart of accounts accumulates, and every dormant account was
      // printing a full row of zeros — sectionDetailRows leaves them out, and
      // puts the group's figures on its heading row the way the reference pack
      // does. A client that has grouped nothing gets the flat list it had.
      for (const row of sectionDetailRows(section, settings.expense_group_order)) {
        if (row.kind === 'section') {
          push([row.label, ...Array.from({ length: cols.figureCount }, () => '')], 'section')
        } else if (row.kind === 'line') {
          push(lineRow(row.line), 'line', row.indent)
        } else {
          const cells = lineRow(row.line)
          cells[0] = row.label
          push(cells, row.kind, row.kind === 'group' ? 1 : 0)
        }
      }

      // Commentary — WD.3 house bullet format: bold Account | then suppliers
      // largest-first, then the coach's prose. The lines are gathered here in
      // statement order; buildCommentaryBlock decides which of them print.
      //
      // The facts come from the generated draft, not from re-joining
      // vendor_summary here. The draft is already converted out of foreign
      // currency, capped at three suppliers with a stated remainder, and renders
      // credits as "less X credit" — none of which a join can do. Re-joining is
      // what turned Contractors excl. Artists (16 vendors) and IT Costs Software
      // (19) into a wall of 6.5pt text.
      if (this.options.commentary && COMMENTARY_CATEGORIES.includes(section.category)) {
        commentaryLines.push(...section.lines)
      }

      // Gross Profit after COGS — statement view only
      if (!filter && section.category === 'Cost of Sales') {
        const gpRow = lineRow(this.report.gross_profit_row)
        gpRow[0] = 'Gross Profit'
        push(gpRow, 'profit')
      }
    }

    // Net Profit — statement view only
    if (!filter) {
      const npRow = lineRow(this.report.net_profit_row)
      npRow[0] = 'Net Profit'
      push(npRow, 'profit')
    }

    // Calxa's nine figure columns at 10pt, with its 62.5mm label column, on a
    // landscape page. A pack that keeps the percentage or prior-year columns
    // has up to twelve, and they cannot all carry 10pt across 267mm, so that
    // table steps down. A layout that places the table PORTRAIT gets the
    // summary page's portrait proportions (see addExecutiveSummary): the
    // landscape ones on 180mm broke "279,320" over two lines, "279,32" above
    // "0", which reads as two wrong numbers.
    const wide = this.pageWidth > A4_SHORT
    const calxaWidth = wide && cols.figureCount <= 9
    const tableWidth = this.pageWidth - this.margin * 2
    const labelWidth = calxaWidth ? 62.5 : wide ? 50 : 38
    const figureWidth = (tableWidth - labelWidth) / cols.figureCount
    // A figure is never split. The type steps down, half a point at a time,
    // until the widest figure in the table fits its column — "(3,655,906)" in
    // a twelve-column portrait table needs about 6pt — and the column is
    // 'visible' rather than 'linebreak', so a figure that still does not fit
    // at the floor runs into its neighbour's padding instead of onto a second
    // line.
    const figureTexts = tableData.flatMap((row) =>
      row.slice(1).map((cell: any) => String(cell !== null && typeof cell === 'object' ? cell.content ?? '' : cell ?? '')))
    const fontSize = this.fitFigureFontSize(figureTexts, figureWidth - 1.7, calxaWidth ? 10 : wide ? 8 : 7, 5.5)
    const columnStyles: Record<number, Record<string, unknown>> = {
      // One line per account, cut with an ellipsis the way Calxa cuts
      // "Employ - Workers' Compensat...". Wrapping put a second line under
      // every long name and a page onto the expense table.
      0: { cellWidth: labelWidth, halign: 'left', overflow: 'ellipsize' },
    }
    for (let i = 1; i <= cols.figureCount; i++) {
      columnStyles[i] = { cellWidth: figureWidth, halign: 'right', overflow: 'visible' }
    }

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [
        periodBandRow(cols.band, { fontSize: calxaWidth ? 12 : wide ? 9 : 8, fontStyle: 'normal', minCellHeight: calxaWidth ? 9.2 : wide ? 7 : 6.5 }),
        cols.labels.map((label) => ({ content: label, styles: { minCellHeight: calxaWidth ? 9.5 : wide ? 8 : 7 } })),
      ],
      body: tableData,
      // Calxa's grain: no vertical rules, no rule between accounts, a rule
      // under each total, the budget columns shaded. 'grid' drew a border round
      // all fourteen columns of every row, which is what made this page read as
      // a spreadsheet dump rather than a statement.
      ...statementTableStyles(fontSize),
      tableWidth,
      columnStyles: columnStyles as never,
      // Run-on pages carry no title and no corner mark (addAllFooters), so the
      // repeated header starts near the top of the sheet as Calxa's does; the
      // bottom stops clear of the page number.
      margin: { left: this.margin, right: this.margin, top: 10, bottom: 20 },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') {
          if (data.row.index === 1 && cols.budgetCols.includes(col)) data.cell.styles.fillColor = [...BUDGET_SHADE_STRONG] as RGB
          return
        }
        if (data.section !== 'body') return
        const kind = kinds[data.row.index]
        const isBudget = cols.budgetCols.includes(col)
        if (col > 0) data.cell.styles.halign = 'right'
        if (isBudget) data.cell.styles.fillColor = [...BUDGET_SHADE] as RGB

        if (col === 0) {
          const base = 1.1
          data.cell.styles.cellPadding = {
            top: fontSize >= 10 ? 0.5 : 0.4,
            bottom: fontSize >= 10 ? 0.5 : 0.4,
            right: 0.6,
            left: base + INDENT_MM[(indents[data.row.index] ?? 0) as 0 | 1 | 2],
          }
        }

        if (kind === 'section') {
          if (col === 0) {
            data.cell.styles.textColor = [...SECTION_TEXT] as RGB
            data.cell.styles.fontSize = fontSize + 1
          }
          data.cell.styles.fontStyle = 'bold'
        } else if (kind === 'group') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = isBudget ? ([...BUDGET_SHADE_STRONG] as RGB) : ([...GROUP_SHADE] as RGB)
        } else if (kind === 'total' || kind === 'profit') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.35, left: 0 }
          data.cell.styles.lineColor = [...TOTAL_RULE] as RGB
        }

        // A parenthesised figure is unfavourable, wherever it lands — a
        // negative budget (Sales Discounts) and an overspent Unspent Budget
        // included, as Calxa colours them.
        paintNegatives(data as never)
        if (kind === 'line' && varianceCols.includes(col)) {
          this.applyVarianceTint(data)
        }
      },
    })

    if (commentaryPlacement.placement === 'none') return

    // WD.3 — standing "refer to …" lines, in exactly ONE commentary block in
    // the pack, first in its list. Which one is standingHostWidgetId's call;
    // under the Calxa page order there is no unfiltered statement to host them
    // and they used to vanish. A line whose target page is not in this pack
    // prints flagged (visible, never silent).
    const standingHost = this.standingHostWidgetId()
    const hostsStanding = standingHost === null ? !filter : widgetId === standingHost
    const { bullets, uncommented, capIgnored } = buildCommentaryBlock({
      lines: commentaryLines,
      commentary: this.options.commentary,
      placement: commentaryPlacement,
      standing: hostsStanding ? this.report.settings.standing_commentary ?? [] : [],
      packPageLabels: hostsStanding ? this.packPageLabels() : [],
    })
    // Never printed — a client pack does not carry "we could not draft this".
    // Kept for whoever renders the pack to report (the preview harness).
    for (const gap of uncommented) this.commentaryGaps.push({ widgetId: widgetId ?? null, ...gap })
    for (const ignored of capIgnored) this.commentaryCapsIgnored.push({ widgetId: widgetId ?? null, ...ignored })
    if (bullets.length === 0) return

    if (commentaryPlacement.placement === 'separate_page') {
      // Calxa's page 7: the COGS commentary on a portrait page of its own,
      // straight after the table it explains. Its heading becomes the page's
      // title, so the block under it does not repeat it.
      this.addPage('portrait')
      this.drawPageTitle(`${titleCaseHeading(commentaryPlacement.heading)} — ${this.formatMonth(this.report.report_month)}`)
      this.drawCommentaryBlock(bullets, {
        placement: commentaryPlacement,
        orientation: 'portrait',
        startY: this.yPosition,
        showHeading: false,
        defaultSize: 10,
      })
      return
    }
    this.drawCommentaryBlock(bullets, {
      placement: commentaryPlacement,
      orientation: this.pageWidth > A4_SHORT ? 'landscape' : 'portrait',
    })
  }

  // =====================================================================
  // YTD Detail (PORTRAIT — fewer columns)
  // =====================================================================
  private addYTDSummary(): void {
    this.addPage('portrait')

    this.drawPageTitle(`YTD Detail — FY${this.report.fiscal_year}`)

    const settings = this.report.settings
    const ytdYardstick = packStatementYardstick()
    // No provenance note (see addExecutiveSummary); only the reason an empty
    // budget column is empty.
    this.drawNoBudgetNotice()
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

    // A table placed with its commentary switched off cannot host the lines:
    // they would go down with its bullets.
    const tables = (this.activeLayout?.pages ?? [])
      .flatMap((page) => (Array.isArray(page.widgets) ? page.widgets : []))
      .filter((w) => w.type === 'budget_vs_actual' && resolveCommentaryPlacement(w.config).placement !== 'none')
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
    // The contractor and payroll-grid pages postdate this list, so a standing
    // line pointing at either was flagged "not in this pack" while the page
    // was two sheets away.
    if (this.options.contractorDetail) labels.push('Contractor Analysis', 'Contractor Summary', 'Contractors', 'Contractors Payment Summary')
    if (this.options.payrollGrid) labels.push('Payroll', 'Payroll Summary')
    if (this.options.accountActuals) {
      for (const w of (this.activeLayout?.pages ?? []).flatMap((p) => (Array.isArray(p.widgets) ? p.widgets : []))) {
        if (w.type === 'ratio_analysis') labels.push((w.titleOverride ?? '').trim() || 'Ratio Analysis')
      }
    }
    if (this.options.cashflowForecast) labels.push('Cashflow Forecast', 'Cashflow')
    if (this.options.fullYearReport) {
      labels.push('Full Year Projection', 'Full Year')
      // The name the page is printed under on the approved basis — the name the
      // client reads, and so the name a standing line will refer to.
      if (fullYearBasis(this.options.fullYearReport) === 'approved_budget') labels.push('Current Year Budget')
    }
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
  private addSubscriptionDetailPage(widget?: import('../types/pdf-layout').LayoutWidget): void {
    const report = this.options.subscriptionDetail!
    const parsed = parseSubscriptionPageConfig(widget?.config)
    if (parsed.config.layout === 'calxa') {
      this.addSubscriptionSheetPage(report, parsed.config)
      return
    }
    // The gross document amounts unless the placement asked for net: 'gross'
    // hands back the report itself, so a page with no config is unchanged. And
    // the total budget it printed before the budget store, unless the placement
    // asked for the approved one (the standard page has no Unallocated row to
    // reconcile its vendor budgets to that).
    const onTotal = subscriptionDetailOnTotalBudget(report, parsed.config.total_budget === 'approved' ? 'approved' : 'pre_budget_store')
    const { detail, notes: basisNotes } = subscriptionDetailOnBasis(onTotal.detail, parsed.config.basis)
    this.addPage('portrait')

    this.drawPageTitle(`Subscription Analysis — ${this.formatMonth(this.report.report_month)}`)
    // A typo in the placement's settings must not cost the client the page,
    // nor quietly print a different one: the standard page, and why.
    if (!parsed.ok) {
      this.drawNote(`This page's settings could not be read (${parsed.reason}), so it is shown in the standard layout.`, undefined, { fontSize: 7.5, color: [146, 64, 14] })
      this.yPosition += 2
    }

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
      // No budget in force is not a $0 budget and a whole-month overrun.
      const noBudget = account.total_budget_source === 'none'
      tableData.push([
        { content: `Subtotal — ${account.account_name}`, styles: { fontStyle: 'bold' } },
        { content: this.fmtCurrency(account.total_prior_month), styles: { fontStyle: 'bold' } },
        { content: noBudget ? '—' : this.fmtCurrency(account.total_budget), styles: { fontStyle: 'bold' } },
        { content: this.fmtCurrency(account.total_actual), styles: { fontStyle: 'bold' } },
        { content: noBudget ? '—' : this.fmtVariance(account.total_variance), styles: { fontStyle: 'bold' } },
      ])
      currentBodyIdx++
    }

    specialRowIndices.add(currentBodyIdx)
    const gtStyle = { fontStyle: 'bold' as const, fillColor: NAVY as number[], textColor: [255, 255, 255] as number[] }
    const noGrandBudget = detail.accounts.length > 0 && detail.accounts.every((a) => a.total_budget_source === 'none')
    tableData.push([
      { content: 'Grand Total', styles: gtStyle },
      { content: this.fmtCurrency(detail.grand_total.prior_month), styles: gtStyle },
      { content: noGrandBudget ? '—' : this.fmtCurrency(detail.grand_total.budget), styles: gtStyle },
      { content: this.fmtCurrency(detail.grand_total.actual), styles: gtStyle },
      { content: noGrandBudget ? '—' : this.fmtVariance(detail.grand_total.variance), styles: gtStyle },
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

    const noBudgetNotes = [...onTotal.notes, ...basisNotes]
    if (noBudgetNotes.length > 0) {
      this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 5
      for (const note of noBudgetNotes) {
        this.yPosition = this.drawNote(note, undefined, { fontSize: 7.5, color: [120, 120, 120] }) + 1.5
      }
    }
  }

  /**
   * The subscriptions sheet (Calxa p13), in the pack's own type: one table,
   * the vendors alphabetically, Unallocated, one TOTAL. The rows and every
   * figure on them come from buildSubscriptionPageModel; this method only
   * sets them out.
   *
   * The variance cells are filled green or red, as the client's sheet fills
   * them — the one departure from the pack's figures-not-furniture rule, taken
   * on the recommendation that this page read as the sheet the client already
   * knows. The fill carries the verdict, so the figure beside it stays black
   * rather than red on red; the brackets still say which way it went.
   */
  private addSubscriptionSheetPage(
    detail: SubscriptionDetailData,
    config: import('@/lib/monthly-report/subscription-page').SubscriptionPageConfig,
  ): void {
    this.addPage('portrait')
    const model = buildSubscriptionPageModel(detail, config)
    this.drawPageTitle(`${model.title} — ${this.formatMonth(this.report.report_month)}`)

    const reportMonth = detail.report_month || this.report.report_month
    const kinds = model.rows.map((r) => r.kind)
    const noBudget = model.rows.map((r) => !!r.no_budget)
    const body = model.rows.map((r) => [
      r.label,
      this.fmtCurrency(r.prior_month),
      r.no_budget ? '—' : this.fmtCurrency(r.budget),
      this.fmtCurrency(r.actual),
      r.no_budget ? '—' : this.fmtVariance(r.variance),
    ])
    const variances = model.rows.map((r) => r.variance)

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Name', 'Last Month', 'Budget', sheetMonthLabel(reportMonth), 'Variance']],
      body,
      ...packTableStyles(9),
      columnStyles: { 0: { cellWidth: 60 } },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') {
          data.cell.styles.halign = col === 0 ? 'left' : 'center'
          return
        }
        if (data.section !== 'body') return
        if (col > 0) data.cell.styles.halign = 'right'
        const kind = kinds[data.row.index]
        // The yardstick column, shaded down the table as the statements shade
        // theirs (the sheet uses peach; the pack's budget shade is grey).
        if (col === 2) data.cell.styles.fillColor = [...BUDGET_SHADE] as RGB
        if (kind === 'unallocated') {
          data.cell.styles.fontStyle = 'italic'
          data.cell.styles.textColor = [90, 90, 90]
        }
        if (kind === 'subtotal' || kind === 'total') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [...(col === 2 ? BUDGET_SHADE_STRONG : GROUP_SHADE)] as RGB
          data.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 }
          data.cell.styles.lineColor = [...RULE_STRONG] as RGB
        }
        // A dash is not a verdict: no fill, green or red.
        if (col === 4 && !noBudget[data.row.index]) {
          data.cell.styles.fillColor = [...(varianceFill(variances[data.row.index]) === 'unfavourable' ? SHEET_VARIANCE_RED : SHEET_VARIANCE_GREEN)] as RGB
        }
      },
    })

    this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 5
    for (const note of model.notes) {
      this.yPosition = this.drawNote(note, undefined, { fontSize: 7.5, color: [120, 120, 120] }) + 1.5
    }
  }

  // =====================================================================
  // Wages Analysis (PORTRAIT — few columns)
  // =====================================================================
  private addWagesDetailPage(): void {
    const detail = this.options.wagesDetail!
    this.addPage('portrait')

    this.drawPageTitle(`Wages Analysis — ${this.formatMonth(this.report.report_month)}`)

    // Availability and the absent reason come from the resolution the ROUTE
    // used, as on the browser tab; the provenance sentence does not reach the
    // pack (packWagesYardstick). A dash column still says why it is a dash.
    const yardstick = packWagesYardstick(detail.budget_provenance)
    if (yardstick.absentNote) this.drawReasonCard(yardstick.absentNote)

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
      const empYardstick = packWagesEmployeeYardstick(
        detail.budget_provenance,
        detail.employee_plan_available ?? true,
      )
      if (empYardstick.absentNote) this.drawReasonCard(empYardstick.absentNote)

      const empHeaders = ['Employee', 'Total Paid', empYardstick.columnLabel, 'Var ($)']
      const empData = detail.employees.map(e => [
        e.name,
        this.fmtCurrency(e.actual_total),
        empYardstick.available ? this.fmtCurrency(e.budget_total) : '—',
        empYardstick.available ? this.fmtVariance(e.variance) : '—',
      ])

      const options = (bodyStyles: UserOptions['bodyStyles']): UserOptions => ({
        startY: this.yPosition,
        head: [empHeaders],
        body: empData,
        theme: 'grid',
        headStyles: { fillColor: [107, 114, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles,
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { left: this.margin, right: this.margin },
        didParseCell: (data) => {
          // Variance tinting for employee var column
          if (data.section === 'body' && data.column.index === 3) {
            this.applyVarianceTint(data)
          }
        },
      })
      this.drawEmployeeTable(options)
    }
  }

  /**
   * The Wages Analysis employee table, with no name left alone on a page.
   *
   * JDS's April roster ran one row past the foot of the page, and the next
   * page printed the repeated header and "Katrina Liddell 2,893" — nothing
   * else. Measured first (full-year-page-break), then:
   *   - a table whose last page carries three rows or more draws as it is;
   *   - one that overflows by a row or two draws at a tighter row pitch when
   *     that fits it on one page fewer — the roster stays on the page with its
   *     accounts, which is what the page is for;
   *   - otherwise the last break moves back so the last page carries three.
   * Every name prints either way; only where the page breaks moves.
   */
  private drawEmployeeTable(options: (bodyStyles: UserOptions['bodyStyles']) => UserOptions): void {
    const measure = (bodyStyles: UserOptions['bodyStyles']) => {
      const table = __createTable(this.doc, options(bodyStyles))
      const headHeight = table.getHeadHeight(table.columns)
      const margin = table.settings.margin
      const heights = table.body.map((row) => row.height)
      const flow = {
        firstY: this.yPosition + headHeight,
        continuationY: margin.top + headHeight,
        bottom: this.pageHeight - margin.bottom,
      }
      return { table, heights, flow, starts: tablePageStarts(heights, flow) }
    }

    const standard = measure({ fontSize: 8 })
    const breakAt = lastPageWidowBreak(standard.heights, standard.flow)
    if (breakAt === null) {
      __drawTable(this.doc, standard.table)
      return
    }

    const lastPageRows = standard.heights.length - standard.starts[standard.starts.length - 1]
    if (lastPageRows <= 2) {
      const tight = measure({ fontSize: 8, cellPadding: { top: 1.1, bottom: 1.1, left: 1.76, right: 1.76 } })
      if (tight.starts.length < standard.starts.length) {
        __drawTable(this.doc, tight.table)
        return
      }
    }

    // Table's body and settings are typed readonly; drawTable reads both afresh.
    const run = standard.table as unknown as { body: Row[]; settings: { pageBreak: 'auto' | 'avoid' | 'always' } }
    const rows = standard.table.body
    run.body = rows.slice(0, breakAt)
    __drawTable(this.doc, standard.table)
    run.body = rows.slice(breakAt)
    run.settings.pageBreak = 'always'
    __drawTable(this.doc, standard.table)
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
  //
  // Calxa's pages 23-25, measured off the August 2026 pack: a 57.5mm label
  // column, twelve 15.5mm months and a 24mm Total across 267mm; a grey band
  // header; 8.5pt labels over 7.5pt figures at a 3.6mm pitch; no grid. Every
  // payment reads as a bracketed red negative, Bank at Beginning and Bank at
  // End sit on cyan, expense groups on a pale band carrying their subtotal.
  // The rows themselves — order, signs, labels, the Total — are
  // buildPackCashflowRows'; this method only draws them.
  private addCashflowForecastPage(): void {
    if (!this.options.cashflowForecast) {
      this.addCashflowReasonPage()
      return
    }
    const cf = this.options.cashflowForecast
    this.addPage('landscape')
    this.drawPageTitle(`Cashflow Forecast — ${this.cashflowPeriod(cf)}`)

    const rows = buildPackCashflowRows(
      cf,
      this.report.settings.expense_group_order ?? this.options.fullYearReport?.expense_group_order ?? null,
    )
    // Every cell a nought, opening bank included: JDS's backdated April pack
    // printed three pages of them with nothing to say why, which reads as a
    // business that moved no cash. The chart page already said it in words;
    // this page says the same, over the basis. A figure that could not be
    // computed prints a dash, not a nought, so it keeps the table.
    const figures = rows.flatMap((row) => (row.kind === 'heading' ? [] : [...row.values, row.total ?? 0]))
    if (figures.length > 0 && figures.every((v) => this.fmtCashflow(v) === '0')) {
      this.drawReasonCard(
        'There is no cash movement to show: every figure on this page is $0, bank balance included. Check the months the basis below covers against the months in the title before sending.',
      )
      const basis = (this.options.cashflowBasis ?? '').trim()
      if (basis) this.drawNote(basis, undefined, { fontSize: 9, color: [125, 125, 125] })
      return
    }
    const headers = ['', ...cf.months.map((m) => m.monthLabel), 'Total']
    const totalCol = headers.length - 1

    const tableWidth = this.pageWidth - this.margin * 2
    const labelWidth = tableWidth * (57.5 / 267)
    const totalWidth = tableWidth * (24 / 267)
    const monthWidth = (tableWidth - labelWidth - totalWidth) / Math.max(1, cf.months.length)
    const columnStyles: Record<number, { cellWidth: number }> = { 0: { cellWidth: labelWidth }, [totalCol]: { cellWidth: totalWidth } }
    for (let i = 1; i < totalCol; i++) columnStyles[i] = { cellWidth: monthWidth }

    const padLeft = (indent: 0 | 1 | 2) => 1.1 + indent * 4.4
    const body = rows.map((row) => {
      const label = { content: row.label, _row: row }
      if (row.kind === 'heading') {
        return [label, ...headers.slice(1).map(() => ({ content: '', _row: row }))]
      }
      return [
        label,
        ...row.values.map((v) => ({ content: this.fmtCashflow(v), _row: row })),
        { content: this.fmtCashflow(row.total ?? 0), _row: row },
      ]
    })

    // Cash model v2 prints actual months beside budget months, as the Full
    // Year page does, so each column says which it is. A v1 cashflow keeps its
    // one header row.
    const head: string[][] = [headers]
    if (cf.cash_model) {
      head.push(['', ...cf.months.map((m) => (m.source === 'actual' ? 'Actual' : 'Budget')), ''])
    }

    const options: UserOptions = {
      startY: this.yPosition,
      head,
      body,
      theme: 'plain',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      // A continuation page starts near the top, header first, as Calxa's do.
      margin: { left: this.margin, right: this.margin, top: 10, bottom: 18 },
      columnStyles,
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        textColor: [0, 0, 0],
        // Calxa's rows are 10.2pt (3.6mm) apart, read off pp23-25 with
        // pdftotext -bbox. autoTable sizes a row as the label's 8.5pt × 1.15
        // plus its padding, which put ours 11.76pt apart: fifteen percent
        // looser, and four fewer rows a page than Calxa's. No vertical padding
        // and a 3.6mm floor lands on Calxa's pitch.
        cellPadding: { top: 0, right: 0.8, bottom: 0, left: 1.1 },
        minCellHeight: 3.6,
        lineWidth: 0,
        valign: 'middle',
        overflow: 'ellipsize',
      },
      headStyles: {
        fillColor: [...BAND] as RGB,
        textColor: [0, 0, 0],
        fontStyle: 'normal',
        fontSize: 8.5,
        halign: 'right',
        minCellHeight: 6.5,
      },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') {
          if (col === totalCol) data.cell.styles.fillColor = [...BAND_LIGHT] as RGB
          if (data.row.index === 1) {
            data.cell.styles.fontSize = 6.5
            data.cell.styles.minCellHeight = 3.6
            data.cell.styles.textColor = [110, 110, 110]
          }
          return
        }
        const row = (data.cell.raw as { _row?: PackCashflowRow })?._row
        if (!row) return
        const s = data.cell.styles
        s.fontStyle = row.kind === 'line' ? 'normal' : row.kind === 'unreconciled' ? 'italic' : 'bold'
        if (col === 0) {
          s.halign = 'left'
          s.fontSize = row.kind === 'heading' ? 10.5 : 8.5
          s.cellPadding = { top: 0, right: 0.8, bottom: 0, left: padLeft(row.indent) }
          if (row.kind === 'heading') s.textColor = [...SECTION_TEXT] as RGB
        } else {
          s.halign = 'right'
          if (String(data.cell.text.join('')).startsWith('(')) s.textColor = [...NEGATIVE] as RGB
        }
        // The Total column is shaded down the table, one step darker where
        // it crosses a banded row.
        if (row.kind === 'bank') {
          s.fillColor = [...(col === totalCol ? CF_BANK_TOTAL : CF_BANK)] as RGB
        } else if (row.kind === 'group') {
          s.fillColor = [...(col === totalCol ? BUDGET_SHADE_STRONG : GROUP_SHADE)] as RGB
        } else if (col === totalCol) {
          s.fillColor = [...GROUP_SHADE] as RGB
        }
        // Rules under the opening bank and each subtotal, none between
        // accounts: Calxa's grain, and what lets the table fit three pages.
        if (row.label === 'Bank at Beginning' || row.kind === 'subtotal') {
          s.lineWidth = { top: 0, right: 0, bottom: 0.35, left: 0 }
          s.lineColor = [...TOTAL_RULE] as RGB
        }
      },
    }

    // Measured first, drawn in one run per page, so no page ends on a section
    // heading or a group row whose accounts are on the next — autoTable has no
    // keep-with-next, and a group row at a page foot reads as a figure with
    // nothing under it. One measured table keeps the columns identical across
    // the runs; each later run starts a page and repeats the header, as
    // autoTable's own continuation does.
    const table = __createTable(this.doc, options)
    const headHeight = table.getHeadHeight(table.columns)
    const margin = table.settings.margin
    const bodyRows = table.body
    const starts = keepWithNextStarts(
      bodyRows.map((r) => r.height),
      bodyRows.map((r) => {
        const kind = (r.raw as { _row?: PackCashflowRow }[] | undefined)?.[0]?._row?.kind
        return kind === 'heading' || kind === 'group'
      }),
      {
        firstY: this.yPosition + headHeight,
        continuationY: margin.top + headHeight,
        bottom: this.pageHeight - margin.bottom,
      },
    )
    // Table's body and settings are typed readonly; drawTable reads both afresh.
    const run = table as unknown as { body: Row[]; settings: { pageBreak: 'auto' | 'avoid' | 'always' } }
    const pageFirsts = [0, ...starts]
    pageFirsts.forEach((from, i) => {
      run.body = bodyRows.slice(from, pageFirsts[i + 1] ?? bodyRows.length)
      if (i > 0) run.settings.pageBreak = 'always'
      __drawTable(this.doc, table)
    })

    // What the figures rest on, under the table rather than above it: the
    // header of a cash table is its months, and Calxa's carries nothing else.
    // Still printed, because it is the only place a reader learns the opening
    // could not be read, or that the banked months' cash is timed, not banked.
    let y = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 5
    const notes: { text: string; rgb: [number, number, number] }[] = []
    const basis = (this.options.cashflowBasis ?? '').trim()
    if (basis) notes.push({ text: basis, rgb: [120, 120, 120] })
    if (cf.lowest_bank_balance < 0) {
      const monthLabel = cf.months.find((m) => m.month === cf.lowest_bank_month)?.monthLabel || cf.lowest_bank_month
      notes.push({ text: `Bank balance goes below zero in ${monthLabel} (${this.fmtCashflow(cf.lowest_bank_balance)})`, rgb: NEGATIVE })
    }
    for (const note of notes) {
      this.doc.setFontSize(8)
      this.doc.setFont('helvetica', note.rgb === NEGATIVE ? 'bold' : 'normal')
      const lines: string[] = this.doc.splitTextToSize(note.text, tableWidth)
      const height = lines.length * 3.6
      if (y + height > this.pageHeight - 18) {
        this.doc.addPage('a4', 'landscape')
        y = 15
      }
      this.doc.setTextColor(note.rgb[0], note.rgb[1], note.rgb[2])
      this.doc.text(lines, this.margin, y)
      y += height + 1.5
    }
    this.doc.setTextColor(0, 0, 0)
    this.doc.setFont('helvetica', 'normal')
    this.yPosition = y
  }

  /** A cash-model-v2 business with no cashflow: the page, its title and why. */
  private addCashflowReasonPage(): void {
    const reason = (this.options.cashflowReason ?? '').trim()
    if (!reason) return
    this.addPage('landscape')
    this.drawPageTitle(`Cashflow Forecast — ${this.formatMonth(this.report.report_month)}`)
    this.drawReasonCard(`The cashflow is not available for this month: ${reason.replace(/\.$/, '')}.`)
  }

  /** 'Jul 2026 - Jun 2027': the months the cash pages cover. */
  private cashflowPeriod(cf: CashflowForecastData): string {
    const first = cf.months[0]?.monthLabel ?? ''
    const last = cf.months[cf.months.length - 1]?.monthLabel ?? ''
    return first === last ? first : `${first} - ${last}`
  }

  // =====================================================================
  // Cashflow Forecast Chart (LANDSCAPE — stacked bar chart + bank line)
  // =====================================================================
  //
  // Calxa's page 22: nine legend entries in its order, stacked cash bars (money
  // in above zero, money out below), a grey Bank At End line, a plain en-AU
  // axis on whole steps, and the basis in a dashed box under the plot.
  private addCashflowForecastChartPage(): void {
    if (!this.options.cashflowForecast) {
      this.addCashflowReasonPage()
      return
    }
    const cf = this.options.cashflowForecast
    const points = packCashflowChartData(cf)
    this.addPage('landscape')
    this.drawPageTitle(`Cashflow Forecast — ${this.cashflowPeriod(cf)}`)

    // A figure the engine could not compute is a dash in the table. Here it
    // would be a NaN coordinate, and jsPDF throws on those, taking the whole
    // pack with it. Not charted, and said, since a bar or a bank point drawn
    // without it would be a figure nobody computed.
    const uncomputed = points.some((p) => !Number.isFinite(p.bankAtEnd) || Object.values(p.values).some((v) => !Number.isFinite(v)))
    if (uncomputed) {
      this.drawReasonCard(
        'This chart is not drawn: some figures behind it could not be computed. The dashes in the table show which months.',
      )
      return
    }

    const rough = packCashflowAxis(points, 1)
    const step = this.calculateTickStep(Math.max(1, rough.max - rough.min))
    const { min, max } = packCashflowAxis(points, step)
    const range = max - min
    // Every bar and the bank line at $0. This page used to draw its legend and
    // stop, which printed as a chart that failed to load. Said in words, with
    // the basis beneath: a backdated report month over a forecast picked for
    // the current year is how JDS's April pack got here, and the basis line is
    // where a reader sees the months do not match.
    if (range <= 0) {
      this.drawReasonCard(
        'There is no cash movement to chart: every month on this page is $0, bank balance included. Check the months the basis below covers against the months in the title before sending.',
      )
      const basis = (this.options.cashflowBasis ?? '').trim()
      if (basis) this.drawNote(basis, undefined, { fontSize: 9, color: [125, 125, 125] })
      return
    }

    // The labels sit right-aligned 2.3mm off the plot, so the gutter is the
    // widest label plus that gap, and the widest label's first character lands
    // no further left than the margin. 14.7mm is Calxa's measurement for Urban
    // Road's "-800,000" and stays the floor; Dragon's "-1,500,000" printed
    // into the margin at that width, and an eight-figure swing ran past it.
    const ticks = Math.round(range / step)
    const tickLabels = Array.from({ length: ticks + 1 }, (_, i) => Math.round(min + i * step).toLocaleString('en-AU'))
    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'normal')
    const widestLabel = Math.max(...tickLabels.map((label) => this.doc.getTextWidth(label)))
    const chartLeft = this.margin + Math.max(14.7, widestLabel + 2.3)
    const chartRight = this.pageWidth - this.margin
    const chartWidth = chartRight - chartLeft

    // Legend, centred over the plot.
    const legendY = this.yPosition + 8
    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'normal')
    const legend = [
      ...PACK_CASHFLOW_SERIES.map((s) => ({ label: s.label, rgb: s.rgb, line: false })),
      { label: PACK_CASHFLOW_BANK.label, rgb: PACK_CASHFLOW_BANK.rgb, line: true },
    ]
    const itemGap = 7
    const itemWidths = legend.map((item) => 4 + this.doc.getTextWidth(item.label))
    const legendWidth = itemWidths.reduce((s, w) => s + w, 0) + itemGap * (legend.length - 1)
    let legendX = chartLeft + Math.max(0, (chartWidth - legendWidth) / 2)
    legend.forEach((item, i) => {
      const [r, g, b] = item.rgb
      if (item.line) {
        this.doc.setDrawColor(r, g, b)
        this.doc.setLineWidth(0.4)
        this.doc.line(legendX - 0.5, legendY - 1, legendX + 3, legendY - 1)
        this.doc.setFillColor(r, g, b)
        this.doc.circle(legendX + 1.25, legendY - 1, 0.9, 'F')
      } else {
        this.doc.setFillColor(r, g, b)
        this.doc.rect(legendX, legendY - 2.25, 2.5, 2.5, 'F')
      }
      this.doc.setTextColor(40, 40, 40)
      this.doc.text(item.label, legendX + 4, legendY)
      legendX += itemWidths[i] + itemGap
    })

    const chartTop = legendY + 6.5
    const chartHeight = 100
    const chartBottom = chartTop + chartHeight

    const yFor = (v: number) => chartTop + ((max - v) / range) * chartHeight

    // Gridlines and labels on whole steps, a minor tick at each quarter.
    this.doc.setFontSize(8)
    this.doc.setTextColor(64, 64, 64)
    for (let i = 0; i <= ticks; i++) {
      const tick = min + i * step
      const y = yFor(tick)
      this.doc.setDrawColor(211, 211, 211)
      this.doc.setLineWidth(0.25)
      this.doc.line(chartLeft, y, chartRight, y)
      this.doc.text(tickLabels[i], chartLeft - 2.3, y + 1, { align: 'right' })
      if (i < ticks) {
        this.doc.setDrawColor(160, 160, 160)
        this.doc.setLineWidth(0.15)
        for (let q = 1; q < 4; q++) {
          const yq = yFor(tick + (step * q) / 4)
          this.doc.line(chartLeft - 0.9, yq, chartLeft, yq)
        }
      }
    }

    const slot = chartWidth / Math.max(1, points.length)
    const barWidth = slot * 0.6
    const bank: { x: number; y: number }[] = []
    points.forEach((p, i) => {
      const cx = chartLeft + (i + 0.5) * slot
      for (const bar of stackPackCashflowBars(p)) {
        const rgb = PACK_CASHFLOW_SERIES.find((s) => s.key === bar.key)!.rgb
        const top = yFor(Math.max(bar.from, bar.to))
        const height = yFor(Math.min(bar.from, bar.to)) - top
        this.doc.setFillColor(rgb[0], rgb[1], rgb[2])
        this.doc.rect(cx - barWidth / 2, top, barWidth, height, 'F')
      }
      bank.push({ x: cx, y: yFor(p.bankAtEnd) })
      this.doc.setDrawColor(160, 160, 160)
      this.doc.setLineWidth(0.15)
      this.doc.line(cx, chartBottom, cx, chartBottom + 0.9)
      this.doc.setFontSize(8)
      this.doc.setTextColor(64, 64, 64)
      this.doc.text(p.monthLabel, cx, chartBottom + 4.5, { align: 'center' })
    })

    const [br, bg, bb] = PACK_CASHFLOW_BANK.rgb
    this.doc.setDrawColor(br, bg, bb)
    this.doc.setLineWidth(0.45)
    for (let i = 0; i < bank.length - 1; i++) {
      this.doc.line(bank[i].x, bank[i].y, bank[i + 1].x, bank[i + 1].y)
    }
    this.doc.setFillColor(br, bg, bb)
    for (const p of bank) this.doc.circle(p.x, p.y, 1.4, 'F')

    this.doc.setDrawColor(200, 200, 200)
    this.doc.setLineWidth(0.3)
    this.doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'S')

    // The basis, in Calxa's dashed box. Its "Using actuals up to Aug 2026"
    // would be untrue here — the banked months are the P&L with estimated
    // timing — so the box carries the sentence that says what the bars are.
    const basis = (this.options.cashflowBasis ?? '').trim()
    if (basis) {
      const boxLeft = this.margin
      const boxWidth = this.pageWidth - this.margin * 2
      this.doc.setFontSize(9)
      const lines: string[] = this.doc.splitTextToSize(basis, boxWidth - 3)
      const boxTop = chartBottom + 13.4
      const boxHeight = 3 + lines.length * 4
      const anyDoc = this.doc as any
      if (typeof anyDoc.setLineDashPattern === 'function') anyDoc.setLineDashPattern([0.8, 0.8], 0)
      this.doc.setDrawColor(215, 215, 215)
      this.doc.setLineWidth(0.25)
      this.doc.rect(boxLeft, boxTop, boxWidth, boxHeight, 'S')
      if (typeof anyDoc.setLineDashPattern === 'function') anyDoc.setLineDashPattern([], 0)
      this.doc.setTextColor(125, 125, 125)
      this.doc.text(lines, boxLeft + 1.5, boxTop + 4.6)
      this.yPosition = boxTop + boxHeight + 4
    } else {
      this.yPosition = chartBottom + 10
    }
    this.doc.setTextColor(0, 0, 0)
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

  /**
   * Whole dollars, negatives in brackets, and zero as "0" — Calxa's cash
   * table prints a month with nothing in it as a nought, not a dash. Rounded
   * before the sign test, so -0.4 is "0" and not "(0)".
   *
   * A figure the engine could not compute (NaN, Infinity) prints as a dash:
   * a nought would pass it off as a month with genuinely no cash.
   */
  private fmtCashflow(value: number): string {
    if (!Number.isFinite(value)) return '—'
    const rounded = Math.round(value)
    if (rounded === 0) return '0'
    const formatted = Math.abs(rounded).toLocaleString('en-AU')
    return rounded < 0 ? `(${formatted})` : formatted
  }

  // =====================================================================
  // Full Year Projection / Current Year Budget (LANDSCAPE) — Calxa pages 16-18
  // =====================================================================
  /**
   * Twelve months and a Projected Total, one P&L down the side.
   *
   * Calxa's "Current Year Budget" page, read off Urban Road's August pack: a
   * blank label column, "Jul 2026" … "Jun 2027", "Projected Total"; a second
   * header row saying which months are actuals; Income, Cost of Sales, Gross
   * Profit, Expense (each group ONE row carrying its own subtotal, its accounts
   * indented beneath), Operating Profit, Other Income, Net Profit. Ours was an
   * eighteen-column projection-vs-forecast variance report in a full grid, its
   * future months filled from the wizard forecast rather than the approved
   * budget — see full-year-basis for what that cost.
   *
   * `config.show_variance` puts the annual yardstick and a variance on the
   * right, measured against the same basis as the months. Absent, it follows
   * the basis: off on the approved basis, because Calxa's Current Year Budget
   * page has none; on for a client on the forecast, which is what every one of
   * them printed before this page was rebuilt — and most of them have no
   * layout row, so a default is the only setting the legacy flow can read.
   */
  private addFullYearProjection(config?: Record<string, unknown>, titleOverride?: string): void {
    const fy = this.options.fullYearReport!
    this.addPage('landscape')

    const basis = fullYearBasis(fy)
    const onApproved = basis === 'approved_budget'
    // The forecast path's third state: no forecast for the year means its
    // month cells are a mark, not 0. Irrelevant on the approved basis.
    const showForecast = onApproved || hasForecastBudget(fy)
    const showVariance = typeof config?.show_variance === 'boolean' ? config.show_variance : !onApproved

    // "Current Year Budget" only when the budget is what the page shows. A
    // client on the forecast gets the page under the name that is true of it.
    const subject = (titleOverride ?? '').trim() || (onApproved ? 'Current Year Budget' : 'Full Year Projection')
    this.drawPageTitle(`${subject} — ${fullYearPeriodLabel(fy)}`)

    // Calxa prints no note under the title — the second header row says where
    // actuals stop. What survives is the one sentence a reader would otherwise
    // get wrong: no figure behind the unclosed months, or a client on the
    // budget store whose page is showing the forecast instead. Never on the
    // approved basis, where the title and the months already say it.
    // Either signal counts for the store: the settings say the client is on
    // it, the report says the monthly pages resolved a version this page did not.
    const onBudgetStore = this.report.settings.budget_source === 'budget_version' || this.report.budget_source === 'budget_version'
    const basisNote = fullYearBasisNote(fy, onBudgetStore)
    if (basisNote) {
      this.drawNote(basisNote, undefined, { fontSize: 8, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    // ── Page-local look ──────────────────────────────────────────────────
    // Sizes are held here rather than in statementTableStyles: this table's
    // grain (fourteen columns, two header tiers, a shaded ACTUALS block rather
    // than a budget block) is its own. The colours are pack-style's, sampled
    // off the same Calxa pack — its rule, group row and crossing shade are the
    // statement pages' values, not near misses of them.
    // 7.5pt on 0.25mm padding is Calxa's row: 3.5mm, forty-five accounts a page.
    const FONT = 7.5
    const PAD = { top: 0.25, right: 1.5, bottom: 0.25, left: 1.5 }
    /** The rule under a total and a profit row — light, and heavier than a hairline. */
    const RULE_TOTAL: RGB = TOTAL_RULE
    /** A group heading row, and the darker cells where it crosses the shaded columns. */
    const GROUP_ROW: RGB = GROUP_SHADE
    const GROUP_ROW_SHADED: RGB = BUDGET_SHADE_STRONG
    /** The figures of Gross Profit, Operating Profit and Net Profit — the same ground as the actuals columns, as on Calxa p16. */
    const PROFIT_FILL: RGB = GROUP_SHADE
    const INDENT_ACCOUNT = 5
    const INDENT_GROUP_ACCOUNT = 9.5

    const months = fy.gross_profit.months
    const MONTH0 = 1
    const PROJECTED = MONTH0 + months.length
    // Closed months and the Projected Total sit on a faint ground, as Calxa
    // sets them, so the eye can tell history from plan without a rule between.
    const shadedCols = new Set<number>([
      ...months.flatMap((md, i) => (md.source === 'actual' ? [MONTH0 + i] : [])),
      PROJECTED,
    ])

    // "Budget", not Calxa's "Forecast", on the approved basis: in this app the
    // forecast is a different number — the wizard's — and Urban Road's differs
    // from the budget by $34k a month in wages. The title already says Budget.
    const futureLabel = onApproved ? 'Budget' : 'Forecast'
    const head = [
      [
        { content: '', styles: { fillColor: [...BAND] as RGB } },
        ...months.map((md) => ({
          content: fullYearMonthLabel(md.month),
          styles: { fillColor: [...(md.source === 'actual' ? BAND_LIGHT : BAND)] as RGB },
        })),
        { content: 'Projected\nTotal', styles: { fillColor: [...BAND_LIGHT] as RGB } },
        ...(showVariance
          ? [onApproved ? 'Budget' : 'Forecast', 'Var ($)', 'Var (%)'].map((content) => ({
              content,
              styles: { fillColor: [...BAND_LIGHT] as RGB },
            }))
          : []),
      ],
      [
        { content: '', styles: {} },
        ...months.map((md) => ({ content: md.source === 'actual' ? 'Actuals' : futureLabel, styles: {} })),
        { content: '', styles: { fillColor: [...BAND_LIGHT] as RGB } },
        ...(showVariance ? [0, 1, 2].map(() => ({ content: '', styles: { fillColor: [...BAND_LIGHT] as RGB } })) : []),
      ],
    ]

    type RowKind = 'section' | 'account' | 'group-account' | 'group' | 'total' | 'profit'
    const body: string[][] = []
    const kinds: RowKind[] = []

    // A figure on this basis. Only an unclosed month on a forecast page with no
    // forecast prints the mark; a closed month is an actual whatever the basis.
    const monthText = (md: FullYearMonthData) => md.source === 'actual' || showForecast
      ? this.fmtCurrency(fullYearCell(md, basis))
      : VALUE_ABSENT
    const figures = (line: FullYearLine): string[] => {
      const cells = [
        ...line.months.map(monthText),
        // The sum of the months printed beside it, whichever basis they are.
        this.fmtCurrency(fullYearProjected(line, basis)),
      ]
      if (showVariance) {
        const v = fullYearVariance(line, basis)
        cells.push(
          showForecast ? this.fmtCurrency(fullYearAnnualYardstick(line, basis)) : VALUE_ABSENT,
          showForecast ? this.fmtVariance(v.amount) : VALUE_ABSENT,
          showForecast && v.percent !== null ? this.fmtPct(v.percent) : VALUE_ABSENT,
        )
      }
      return cells
    }
    const blank = () => figures(fy.gross_profit).map(() => '')
    const push = (kind: RowKind, label: string, cells: string[]) => {
      body.push([label, ...cells])
      kinds.push(kind)
    }

    // The heading order the Actual vs Budget page of this pack uses — the
    // report's own settings — so the two pages list the groups identically.
    const groupOrder = this.report.settings.expense_group_order ?? fy.expense_group_order ?? null
    const operatingProfit = deriveFullYearOperatingProfit(fy)
    // The first of the rows that close the statement — the expense total, or
    // the last section total without one — which the page break keeps
    // together (full-year-page-break).
    let expenseTotalAt: number | null = null
    let lastTotalAt: number | null = null

    for (const section of fy.sections) {
      const label = fullYearSectionLabel(section.category)
      // Empty cells rather than a spanning one, so the shaded columns run
      // unbroken through the heading as they do on Calxa's page.
      push('section', label, blank())

      // Same membership and heading order as the Actual vs Budget page. Each
      // group is ONE row — its name and its subtotal — with its accounts
      // indented beneath, and no trailing "Total <group>": Calxa's layout, and
      // nine rows shorter for Urban Road.
      // A lone group named as the heading is not printed again (withoutHeadingEcho).
      const groups = groupFullYearLines(withoutSilentFullYearLines(section.lines, basis), groupOrder, section.category)
      for (const g of withoutHeadingEcho(groups, label)) {
        if (g.name && g.subtotal) push('group', g.name, figures(g.subtotal))
        for (const line of g.lines) push(g.name ? 'group-account' : 'account', line.account_name, figures(line))
      }

      if (section.category === 'Operating Expenses') expenseTotalAt = body.length
      lastTotalAt = body.length
      push('total', `Total ${label}`, figures(section.subtotal))

      if (section.category === 'Cost of Sales') push('profit', 'Gross Profit', figures(fy.gross_profit))
      if (section.category === 'Operating Expenses' && operatingProfit) {
        push('profit', 'Operating Profit', figures(operatingProfit))
      }
    }
    push('profit', 'Net Profit', figures(fy.net_profit))

    const options: UserOptions = {
      startY: this.yPosition,
      head,
      body,
      theme: 'plain',
      styles: {
        fontSize: FONT,
        cellPadding: PAD,
        textColor: [...TEXT] as RGB,
        lineWidth: 0,
        overflow: 'linebreak',
        halign: 'right',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [...BAND_SUB] as RGB,
        textColor: [...BAND_TEXT] as RGB,
        fontStyle: 'normal',
        valign: 'bottom',
      },
      bodyStyles: { fillColor: [255, 255, 255] as RGB },
      columnStyles: showVariance
        ? { 0: { cellWidth: 44 }, [PROJECTED]: { cellWidth: 17 } }
        : { 0: { cellWidth: 56 }, [PROJECTED]: { cellWidth: 20 } },
      // Continuation pages carry no title and, since addAllFooters draws the
      // corner mark only on pages a title opened, no logo either — so the
      // repeated header starts near the top of the sheet, 10mm, where Calxa's
      // p17-18 put it and where the statement tables' run-on pages put theirs.
      margin: { top: 10, left: this.margin, right: this.margin },
      rowPageBreak: 'avoid',
      didParseCell: (data) => {
        const col = data.column.index
        const s = data.cell.styles
        if (data.section === 'head') {
          if (data.row.index === 0) {
            // Three more columns take the width "Aug 2026" needs at 8pt, and
            // autoTable wraps the months it squeezes most — a ragged header
            // with only Jul and Jun on one line. 7pt keeps every month whole.
            s.fontSize = showVariance ? 7 : 8
          } else {
            s.fontSize = 5.5
            s.textColor = [...BAND_SUB_TEXT] as RGB
            s.cellPadding = { top: 0.2, right: 1.5, bottom: 0.6, left: 1.5 }
          }
          return
        }
        if (data.section !== 'body') return

        const kind = kinds[data.row.index]
        if (shadedCols.has(col)) s.fillColor = [...GROUP_SHADE] as RGB

        if (col === 0) {
          s.halign = 'left'
          // One line per row, like Calxa's "Employ - Workers' Compensat...":
          // a wrapped name makes one double-height row in a table of forty.
          s.overflow = 'ellipsize'
        }

        switch (kind) {
          case 'section':
            if (col === 0) {
              s.fontSize = 9.5
              s.fontStyle = 'bold'
              s.textColor = [...SECTION_TEXT] as RGB
              s.cellPadding = { ...PAD, top: 1.6 }
            }
            break
          case 'account':
            if (col === 0) s.cellPadding = { ...PAD, left: INDENT_ACCOUNT }
            break
          case 'group-account':
            if (col === 0) s.cellPadding = { ...PAD, left: INDENT_GROUP_ACCOUNT }
            break
          case 'group':
            s.fontStyle = 'bold'
            s.fillColor = [...(shadedCols.has(col) ? GROUP_ROW_SHADED : GROUP_ROW)] as RGB
            if (col === 0) s.cellPadding = { ...PAD, left: INDENT_ACCOUNT }
            break
          case 'total':
            s.fontStyle = 'bold'
            s.lineWidth = { top: 0, right: 0, bottom: 0.5, left: 0 }
            s.lineColor = [...RULE_TOTAL] as RGB
            break
          case 'profit':
            s.fontStyle = 'bold'
            s.lineWidth = { top: 0, right: 0, bottom: 0.5, left: 0 }
            s.lineColor = [...RULE_TOTAL] as RGB
            s.cellPadding = { ...PAD, top: 1.4, bottom: 0.9 }
            s.fillColor = col === 0 ? ([255, 255, 255] as RGB) : ([...PROFIT_FILL] as RGB)
            break
        }

        // Red parentheses for a negative figure. fmtPct signs a percentage
        // rather than bracketing it, so the ratio beside a variance stays black.
        const text = (data.cell.text ?? []).join('')
        if (col > 0 && text.startsWith('(') && text.endsWith(')')) {
          s.textColor = [...TEXT_NEGATIVE] as RGB
        }
      },
    }

    // Measured first, drawn second, so the break can be moved before the
    // closing rows rather than wherever the account count lands — Dragon's
    // page ended on a sheet holding Net Profit alone. One measured table drawn
    // in two runs keeps the column widths identical across the break; the
    // second run starts a page and repeats the header exactly as autoTable's
    // own continuation does.
    const table = __createTable(this.doc, options)
    const headHeight = table.getHeadHeight(table.columns)
    const margin = table.settings.margin
    const closingStart = expenseTotalAt ?? lastTotalAt
    const breakAt = closingStart === null
      ? null
      : closingRowsBreak(table.body.map((row) => row.height), closingStart, {
          firstY: this.yPosition + headHeight,
          continuationY: margin.top + headHeight,
          bottom: this.pageHeight - margin.bottom,
        })
    if (breakAt === null) {
      __drawTable(this.doc, table)
      return
    }
    // Table's body and settings are typed readonly; drawTable reads both afresh.
    const run = table as unknown as { body: Row[]; settings: { pageBreak: 'auto' | 'avoid' | 'always' } }
    const rows = table.body
    run.body = rows.slice(0, breakAt)
    __drawTable(this.doc, table)
    run.body = rows.slice(breakAt)
    run.settings.pageBreak = 'always'
    __drawTable(this.doc, table)
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

    // Named off the report's own budget_source, from the chart component. The
    // subtitle used to say "each annual budget" for every client — including
    // the ten whose tab says the bar is a forecast. The pack's words, not the
    // tab's: a budget-store client's statement pages head that budget
    // "Budgets", and this page must not rename it "Approved Budget".
    const pctElapsed = data[0]?.pctElapsed || 0
    const labels = packBurnRateLabels(this.report, pctElapsed)
    this.drawPageTitle(labels.title)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(labels.subtitle, this.margin, this.yPosition)
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
        this.openedPages.add(this.doc.getNumberOfPages())
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
      this.yPosition = this.contentTop()

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

        const box = this.clearOfCornerMark(widget, calculateBoundingBox(widget, page.orientation))
        this.renderWidget(widget, box)
      }
    }

    this.addAllFooters()
    return this.doc
  }

  /**
   * A placed widget's box, adjusted so the corner mark and the widget do not
   * share ink.
   *
   * The grid's top row starts at 15mm. A full-row widget there spans the whole
   * sheet, so under a custom mark (down to 33.5mm) it starts at contentTop()
   * instead — a titled one sets its title beside the mark either way, and an
   * untitled one (the consolidated statement) would otherwise print its header
   * under it. A smaller widget in the top-right cell (a KPI card) cannot move
   * 20mm without leaving its cell, so its page goes without the mark.
   */
  private clearOfCornerMark(widget: import('../types/pdf-layout').LayoutWidget, box: WidgetBoundingBox): WidgetBoundingBox {
    const mark = this.cornerMarkBox(this.pageWidth)
    const overlaps = box.x < mark.x + mark.w && box.x + box.w > mark.x && box.y < mark.y + mark.h && box.y + box.h > mark.y
    if (!overlaps) return box
    if (!isFullRowWidget(widget.type)) {
      this.cornerClaimedPages.add(this.doc.getNumberOfPages())
      return box
    }
    const top = this.contentTop()
    return box.y >= top ? box : { ...box, y: top, h: box.h - (top - box.y) }
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
        return !!this.options.cashflowForecast
      case 'chart_cashflow_forecast':
      case 'cashflow_forecast_table':
        return !!this.options.cashflowForecast || !!this.options.cashflowReason
      case 'subscription_detail':
      case 'chart_subscription_creep':
        return !!this.options.subscriptionDetail
      case 'wages_detail':
      case 'chart_cost_per_employee':
        return !!this.options.wagesDetail
      case 'contractor_detail':
        // Explicit, not the default. The renderer draws nothing without rows,
        // and the default `true` kept the page anyway: a pack that went to a
        // client with page 9 blank but for the logo and the page number, where
        // the contractor load had failed. Rows, or a reason to print instead;
        // neither means nothing was asked for, and the page goes.
        return (this.options.contractorDetail?.contractors.length ?? 0) > 0 || !!this.options.contractorDetailReason
      case 'payroll_grid':
        // Same defect, same rule — the grid returns early without employees
        // or run dates.
        return this.hasPayrollGridRows() || !!this.options.payrollGridReason
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
      case 'ratio_analysis':
        // Always "available", and deliberately explicit rather than left to
        // the default. Since #508 pagesWithContent drops a page whose widgets
        // all report no data, so THIS line decides whether the page exists at
        // all. A placed ratio page that cannot be produced — bad config, a
        // multi-org business, a load that failed — must print that reason, not
        // vanish from the pack and not show a grey box.
        return true
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

  /**
   * The largest type size, from `preferred` down to `floor` in half points, at
   * which every figure fits `width` mm on one line. Measured in bold, the
   * weight the totals print in, so the widest row decides.
   */
  private fitFigureFontSize(figures: readonly string[], width: number, preferred: number, floor: number): number {
    const saved = { size: this.doc.getFontSize(), font: this.doc.getFont() }
    this.doc.setFont('helvetica', 'bold')
    let size = preferred
    try {
      for (; size > floor; size -= 0.5) {
        this.doc.setFontSize(size)
        if (figures.every((t) => this.doc.getTextWidth(t) <= width)) break
      }
    } finally {
      this.doc.setFont(saved.font.fontName, saved.font.fontStyle)
      this.doc.setFontSize(saved.size)
    }
    return Math.max(size, floor)
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
    this.renderWithSkipPage(() => this.addBudgetVsActualDetail(filter, widget?.id, {
      titleOverride: widget?.titleOverride,
      variancePercent: showsVariancePercent(widget?.config),
      commentary: resolveCommentaryPlacement(widget?.config),
    }), box)
  }

  renderYTDSummary(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addYTDSummary, box)
  }

  renderFullYearProjection(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    // widget.config.show_variance and the title override are this placement's
    // own (WC.1); the legacy page order calls the page with neither.
    this.renderWithSkipPage(() => this.addFullYearProjection(widget?.config, widget?.titleOverride), box)
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
  private addContractorDetailPage(widget?: import('../types/pdf-layout').LayoutWidget): void {
    const detail = this.options.contractorDetail
    const parsed = parseContractorPageConfig(widget?.config)
    const calxa = parsed.config.layout === 'calxa'
    const title = calxa ? 'Contractors Payment Summary' : 'Contractor Analysis'
    if (!detail || detail.contractors.length === 0) {
      // hasDataForWidget only lets an empty page this far with a reason, and
      // the page is already open: printing nothing is the blank page.
      if (!this.options.contractorDetailReason) return
      this.addPage(calxa ? 'landscape' : 'portrait')
      this.drawPageTitle(`${title} — ${this.formatMonth(this.report.report_month)}`)
      this.drawReasonCard(`${title} is not available for this month: ${this.options.contractorDetailReason}.`)
      return
    }
    if (calxa && this.options.contractorDetailReport) {
      this.addContractorSheetPage(this.options.contractorDetailReport, parsed.config)
      return
    }
    this.addPage('portrait')
    this.drawPageTitle(`Contractor Analysis — ${this.formatMonth(this.report.report_month)}`)
    // A typo in the placement's settings must not cost the client the page,
    // nor quietly print a different one: the standard page, and why.
    if (!parsed.ok) {
      this.drawNote(`This page's settings could not be read (${parsed.reason}), so it is shown in the standard layout.`, undefined, { fontSize: 7.5, color: [146, 64, 14] })
      this.yPosition += 2
    } else if (calxa) {
      this.drawNote('The Contractors Payment Summary needs the contractor figures month by month, which this export did not load, so it is shown in the standard layout.', undefined, { fontSize: 7.5, color: [146, 64, 14] })
      this.yPosition += 2
    }
    // Rows with a reason are a partial crawl: an org that was not read has
    // contractors who are not in them, and the totals would pass for the month.
    if (this.options.contractorDetailReason) {
      this.drawNote(`These figures may be incomplete: ${this.options.contractorDetailReason}.`, undefined, { fontSize: 7.5, color: [146, 64, 14] })
      this.yPosition += 2
    }

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

  /**
   * The Contractors Payment Summary (Calxa p14) in the pack's own type: every
   * contractor across the window with TOTAL, Budget and the variances under
   * them, and beside it the report month by department. The rows and every
   * figure on them come from buildContractorSheetModel; this only sets them out.
   *
   * Side by side on a landscape page, as the sheet is. A portrait placement
   * (the page's orientation is the layout's) gets the same two tables one
   * above the other rather than two columns of wrapped names.
   *
   * The variance cells are filled green or red, as the subscriptions sheet's
   * are (decision #10), and the figure stays black on the fill — the brackets
   * still say which way it went.
   */
  private addContractorSheetPage(report: SubscriptionDetailData, config: ContractorPageConfig): void {
    this.addPage('landscape')
    const model = buildContractorSheetModel(report, config)
    this.drawPageTitle(`${model.title} — ${this.formatMonth(this.report.report_month)}`)
    if (this.options.contractorDetailReason) {
      this.drawNote(`These figures may be incomplete: ${this.options.contractorDetailReason}.`, undefined, { fontSize: 7.5, color: [146, 64, 14] })
      this.yPosition += 2
    }

    const cell = (v: SheetCell) => (v === undefined ? '' : v === null ? '—' : this.fmtCurrency(v))
    const varianceCell = (v: SheetCell) => (v === undefined ? '' : v === null ? '—' : this.fmtVariance(v))
    const percentCell = (v: SheetCell) => {
      if (v === undefined) return ''
      if (v === null) return '—'
      const text = `${Math.abs(v).toFixed(2)}%`
      return Math.round(v * 100) < 0 ? `(${text})` : text
    }
    const fillFor = (v: SheetCell): RGB | null =>
      typeof v === 'number' ? [...(varianceFill(v) === 'unfavourable' ? SHEET_VARIANCE_RED : SHEET_VARIANCE_GREEN)] as RGB : null

    const sideBySide = this.pageWidth >= A4_LONG - 1
    const usable = this.pageWidth - this.margin * 2
    const gap = 6
    // Width shared in proportion to the columns each table carries: a name and
    // a category are worth about two and a half figures.
    const leftUnits = 5 + 1 + model.months.length
    const rightUnits = 5 + 3
    const leftWidth = sideBySide ? ((usable - gap) * leftUnits) / (leftUnits + rightUnits) : usable
    const startPage = this.doc.getNumberOfPages()
    const startY = this.yPosition
    const reportIndex = model.months.indexOf(this.report.report_month)

    // Calxa's row pitch (about 4.6mm, measured off p14) rather than the
    // statements' 5.6mm: at the statements' pitch the department table, with
    // its seven subtotals, runs a Grand Total onto a page of its own.
    const base = packTableStyles(7)
    const sheetStyles = { ...base, styles: { ...base.styles, cellPadding: { top: 0.8, right: 1.6, bottom: 0.8, left: 1.6 } } }

    const headStyle = (col: number, figuresFrom: number) => (data: any) => {
      data.cell.styles.halign = data.column.index < figuresFrom ? 'left' : 'center'
      if (data.column.index === col) data.cell.styles.fontStyle = 'bold'
    }

    // ── Every contractor across the window ──
    const kinds = model.rows.map((r) => r.kind)
    autoTable(this.doc, {
      startY,
      head: [['Name of Contractor', 'Category', 'Budget', ...model.months.map(sheetMonthHeading)]],
      body: model.rows.map((r) => {
        const figures = r.kind === 'variance' ? r.months.map(varianceCell) : r.kind === 'variance_percent' ? r.months.map(percentCell) : r.months.map(cell)
        return [r.label, r.category, cell(r.budget), ...figures]
      }),
      ...sheetStyles,
      columnStyles: { 0: { cellWidth: leftWidth * 0.3 }, 1: { cellWidth: leftWidth * 0.2 } },
      margin: { left: this.margin, right: this.pageWidth - this.margin - leftWidth },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') { headStyle(3 + reportIndex, 2)(data); return }
        if (data.section !== 'body') return
        if (col >= 2) data.cell.styles.halign = 'right'
        const row = model.rows[data.row.index]
        const kind = kinds[data.row.index]
        // The report month, bold down the table, as the sheet sets it.
        if (col === 3 + reportIndex) data.cell.styles.fontStyle = 'bold'
        if (col === 2) data.cell.styles.fillColor = [...BUDGET_SHADE] as RGB
        if (kind === 'unallocated') {
          data.cell.styles.fontStyle = 'italic'
          data.cell.styles.textColor = [90, 90, 90]
        }
        if (kind === 'total' || kind === 'budget') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [...(col === 2 ? BUDGET_SHADE_STRONG : GROUP_SHADE)] as RGB
        }
        if (kind === 'total') {
          data.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 }
          data.cell.styles.lineColor = [...RULE_STRONG] as RGB
        }
        if (kind === 'variance' || kind === 'variance_percent') {
          data.cell.styles.fontStyle = 'bold'
          const fill = col >= 3 ? fillFor(row.months[col - 3]) : null
          if (fill) data.cell.styles.fillColor = fill
        }
      },
    })
    // The page the table ENDED on, not the document's page count: a later
    // table can end on an earlier page than the document now runs to.
    const leftEndPage = this.doc.getCurrentPageInfo().pageNumber
    const leftFinalY = (this.doc as any).lastAutoTable?.finalY ?? startY

    // ── The report month by department ──
    if (sideBySide) {
      // Back to the page the first table started on: a long first table that
      // ran onto a second page must not push this one off its own.
      this.doc.setPage(startPage)
    }
    const pivotKinds = model.pivot.map((r) => r.kind)
    autoTable(this.doc, {
      startY: sideBySide ? startY : leftFinalY + 8,
      head: [['Category', 'Name of Contractor', 'Budget', longMonthLabel(this.report.report_month), 'Variance']],
      // A subtotal's label spans the name column, as the sheet's does:
      // "Sales/Commercial Total" does not fit the category column alone.
      body: model.pivot.map((r) => (r.kind === 'subtotal' || r.kind === 'grand_total'
        ? [{ content: r.category, colSpan: 2 }, cell(r.budget), cell(r.actual), varianceCell(r.variance)]
        : [r.category, r.name, cell(r.budget), cell(r.actual), varianceCell(r.variance)])),
      ...sheetStyles,
      columnStyles: sideBySide
        ? { 0: { cellWidth: (usable - leftWidth - gap) * 0.26 }, 1: { cellWidth: (usable - leftWidth - gap) * 0.38 } }
        : { 0: { cellWidth: 48 }, 1: { cellWidth: 56 } },
      margin: sideBySide ? { left: this.margin + leftWidth + gap, right: this.margin } : { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        const col = data.column.index
        if (data.section === 'head') { headStyle(3, 2)(data); return }
        if (data.section !== 'body') return
        if (col >= 2) data.cell.styles.halign = 'right'
        const row = model.pivot[data.row.index]
        const kind = pivotKinds[data.row.index]
        if (col === 2) data.cell.styles.fillColor = [...BUDGET_SHADE] as RGB
        if (col === 3) data.cell.styles.fontStyle = 'bold'
        if (kind === 'unallocated') {
          data.cell.styles.fontStyle = 'italic'
          data.cell.styles.textColor = [90, 90, 90]
        }
        if (kind === 'subtotal' || kind === 'grand_total') {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [...(col === 2 ? BUDGET_SHADE_STRONG : GROUP_SHADE)] as RGB
          data.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 }
          data.cell.styles.lineColor = [...RULE_STRONG] as RGB
        }
        if (col === 4) {
          const fill = fillFor(row.variance)
          if (fill) data.cell.styles.fillColor = fill
        }
      },
    })
    // Side by side, the department table runs on onto the pages the first one
    // already opened (autoTable moves to the next page when one exists, and
    // only adds a page past the last), so both continue on the same page. The
    // department table can end a page before the first table does; counted as
    // the document's pages, its end was put on the first table's last page at
    // its own depth, and the notes under it went over onto a page of their own.
    const rightEndPage = this.doc.getCurrentPageInfo().pageNumber
    const rightFinalY = (this.doc as any).lastAutoTable?.finalY ?? startY

    // Notes under whichever table ends lower, on the last page either reached.
    const lastPage = Math.max(leftEndPage, rightEndPage)
    this.doc.setPage(lastPage)
    const bottom = sideBySide
      ? Math.max(leftEndPage === lastPage ? leftFinalY : 0, rightEndPage === lastPage ? rightFinalY : 0)
      : rightFinalY
    this.yPosition = bottom + 5
    // Notes that would run into the footer go over the page, not off it —
    // onto a run-on page, bare as the commentary's is: no corner mark, which
    // would sit over a note starting at the top of the sheet.
    const needed = model.notes.reduce((t, note) => t + this.noteHeight(note) + 1.5, 0)
    // In the sheet's own orientation (a portrait placement stacks the tables,
    // and its last page must not turn sideways), and guarded on the page count
    // as the commentary's run-on is: addPage can be a no-op inside a layout
    // widget's first draw, and the page it did not open is the titled one.
    if (model.notes.length > 0 && this.yPosition + needed > this.pageHeight - 14) {
      const before = this.doc.getNumberOfPages()
      this.addPage(sideBySide ? 'landscape' : 'portrait')
      if (this.doc.getNumberOfPages() > before) {
        this.openedPages.delete(this.doc.getNumberOfPages())
        this.yPosition = CONTINUATION_TEXT_TOP
      }
    }
    for (const note of model.notes) {
      this.yPosition = this.drawNote(note, undefined, { fontSize: 7.5, color: [120, 120, 120] }) + 1.5
    }
  }

  /** "2026-08" → "2026-07". */
  private priorMonthOf(month: string): string {
    const [y, m] = month.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  renderSubscriptionDetail(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    this.renderWithSkipPage(() => this.addSubscriptionDetailPage(widget), box)
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
   *
   * The placement's config (payroll-grid-config) picks the layout and carries
   * the roster. With none, this is the page as it always printed.
   */
  private hasPayrollGridRows(): boolean {
    const grid = this.options.payrollGrid
    return !!grid && grid.employees.length > 0 && grid.run_dates.length > 0
  }

  private addPayrollGridPage(widget?: import('../types/pdf-layout').LayoutWidget): void {
    const grid = this.options.payrollGrid
    const parsed = parsePayrollGridConfig(widget?.config)
    if (!grid || !this.hasPayrollGridRows()) {
      if (!this.options.payrollGridReason) return
      this.addPage('landscape')
      this.drawPageTitle(parsed.config.layout === 'calxa'
        ? `Payroll Report — ${this.formatMonth(this.report.report_month)}`
        : `Payroll — ${this.formatMonth(this.report.report_month)}`)
      this.drawReasonCard(`The payroll grid is not available for this month: ${this.options.payrollGridReason}.`)
      return
    }
    const rostered = applyPayrollRoster(grid, parsed.config.roster)
    // Only a config that read cleanly can ask for the Calxa page: one that
    // failed comes back as the defaults, so it prints this page, with its reason.
    if (parsed.config.layout === 'calxa') {
      this.addPayrollReportPage(grid, rostered, parsed.config)
      return
    }

    this.addPage('landscape')
    this.drawPageTitle(`Payroll — ${this.formatMonth(this.report.report_month)}`)
    if (!parsed.ok) this.drawWarningCard(`This page's settings could not be read (${parsed.reason}), so it prints its default layout.`)

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

    const body: any[] = rostered.employees.map((e) => [
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
    this.drawNotOnRosterNote(rostered)
  }

  /**
   * Calxa's Payroll Report, in the pack's own style.
   *
   * The structure is the sheet's: Standard Units and Weekly Salary (Budget)
   * beside each name, one column per pay run under its month, then a Total per
   * run, the month's total merged across its runs, and the Budget and
   * Difference merged the same way — so each month's figures sit under the runs
   * that make them, and no month column repeats them down the side. The look
   * is the pack's: plain figures, the band over the period, the budget column
   * shaded, red parentheses for an overrun.
   *
   * Every figure is the grid's. The roster adds the two standing columns and
   * the order, nothing else: a Total is what the payslips paid, whatever the
   * roster says a salary should be.
   */
  private addPayrollReportPage(grid: PayrollGrid, rostered: RosteredPayroll, config: PayrollGridConfig): void {
    this.addPage('landscape')
    // "Last 2 Months" in August, the way Calxa heads it. A one-month window
    // (July, on a year-to-date window) names its month instead — "Last 1
    // Months" is not a sentence.
    const period = grid.months.length === 1
      ? this.formatMonth(grid.months[0].month)
      : `Last ${grid.months.length} Months`
    this.drawPageTitle(`Payroll Report — ${period}`)

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    // Calxa's own date forms: "6-Jul" over a run, "5-Mar-2020" for a start.
    const runLabel = (iso: string) => `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}`
    const startLabel = (iso: string | null) => (iso ? `${runLabel(iso)}-${iso.slice(0, 4)}` : '—')
    const unitsText = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-AU', { maximumFractionDigits: 2 }))

    // One column per run, grouped by month. A month in the window with no run
    // at all keeps one dashed column: its Budget and Difference still have to
    // print somewhere, and a budgeted month nobody was paid in is a finding,
    // not a gap to close up.
    const groups = grid.months.map((m) => ({ month: m, dates: m.run_dates.length > 0 ? m.run_dates : [null] }))
    const runCols: (string | null)[] = groups.flatMap((g) => g.dates)
    const LEAD = 4

    const head: any[] = [
      [
        ...['Employee', 'Start Date', 'Standard Units', 'Weekly Salary (Budget)'].map((label, i) => ({
          content: label,
          rowSpan: 2,
          styles: {
            halign: i === 0 ? ('left' as const) : ('center' as const),
            valign: 'bottom' as const,
            ...(i === 3 ? { fillColor: [...BUDGET_SHADE_STRONG] as RGB } : {}),
          },
        })),
        ...periodBandRow(
          groups.map((g, i): BandGroup => ({
            label: packMonthYear(g.month.month),
            colSpan: g.dates.length,
            tone: i % 2 === 0 ? 'light' : 'dark',
          })),
        ),
      ],
      runCols.map((d) => ({ content: d ? runLabel(d) : 'No runs', styles: { halign: 'center' as const } })),
    ]

    const body: any[] = rostered.employees.map((e) => [
      e.name,
      startLabel(e.start_date),
      unitsText(e.standard_units),
      e.weekly_salary === null ? '—' : this.fmtCurrency(e.weekly_salary),
      ...runCols.map((d) => (d === null || e.cells[d] === null || e.cells[d] === undefined ? '—' : this.fmtCurrency(e.cells[d] as number))),
    ])
    const employeeRows = body.length

    const merged = (content: string, colSpan: number, extra: Record<string, unknown> = {}) =>
      ({ content, colSpan, styles: { halign: 'center' as const, ...extra } })

    // Total: each run's total, then each month's beneath its runs. The Weekly
    // Salary (Budget) total stands beside both and the Budget row, as Calxa's
    // does — it is the week the budget was built from.
    body.push([
      { content: 'Total', colSpan: 3, rowSpan: 2, styles: { valign: 'middle' as const } },
      {
        content: rostered.weekly_salary_total === null ? '—' : this.fmtCurrency(rostered.weekly_salary_total),
        rowSpan: 3,
        styles: { valign: 'middle' as const, halign: 'right' as const },
      },
      ...runCols.map((d) => (d === null ? '—' : this.fmtCurrency(runTotal(grid, d)))),
    ])
    body.push(groups.map((g) => merged(this.fmtCurrency(g.month.total), g.dates.length)))
    body.push([
      { content: 'Budget', colSpan: 3 },
      ...groups.map((g) => merged(g.month.budget === null ? '—' : this.fmtCurrency(g.month.budget), g.dates.length)),
    ])
    const fills = config.difference_fills
    body.push([
      { content: 'Difference', colSpan: 3 },
      '',
      ...groups.map((g) => {
        const diff = g.month.difference
        return merged(
          diff === null ? '—' : this.fmtVariance(diff),
          g.dates.length,
          fills && diff !== null ? { fillColor: [...(Math.round(diff) < 0 ? PAYROLL_OVER_FILL : PAYROLL_UNDER_FILL)] } : {},
        )
      }),
    ])

    // Nine runs set at 9pt, the size the reference prints at. A quarter's
    // thirteen drop to 7pt so "10,504" still fits its column on one line.
    const fontSize = runCols.length <= 10 ? 9 : 7
    autoTable(this.doc, {
      startY: this.yPosition,
      head,
      body,
      ...packTableStyles(fontSize),
      columnStyles: {
        0: { cellWidth: 40, halign: 'left' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 17, halign: 'center' },
        3: { cellWidth: 21, halign: 'right' },
      },
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const col = data.column.index
        const row = data.row.index
        const inTotals = row >= employeeRows
        const ownFill = (data.cell.raw as { styles?: { fillColor?: unknown } } | null)?.styles?.fillColor
        // Figures right, as every table in the pack sets them — except the
        // month cells merged across their runs, which centre under them.
        if (col >= LEAD && (!inTotals || row === employeeRows)) data.cell.styles.halign = 'right'
        if (col === 3) data.cell.styles.fillColor = [...(inTotals ? BUDGET_SHADE_STRONG : BUDGET_SHADE)] as RGB
        if (inTotals) {
          data.cell.styles.fontStyle = 'bold'
          if (col !== 3 && !ownFill) data.cell.styles.fillColor = [...GROUP_SHADE] as RGB
          // The rule over the block, the one a statement's total carries.
          if (row === employeeRows) {
            data.cell.styles.lineWidth = { top: 0.35, right: 0, bottom: 0, left: 0 }
            data.cell.styles.lineColor = [...TOTAL_RULE] as RGB
          }
        }
        paintNegatives(data as never)
      },
    })

    this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 6
    if (rostered.employees.some((e) => e.standard_units === null || e.weekly_salary === null)) {
      this.drawNote(
        'A dash under Standard Units or Weekly Salary (Budget) is a figure not yet entered on this page\'s roster.',
        undefined,
        { fontSize: 7.5, color: [120, 120, 120] },
      )
    }
    this.drawNotOnRosterNote(rostered)
  }

  /**
   * Somebody was paid who is not on the roster — a new starter, or a name
   * retyped in Xero. They are on the page, because the Total includes them,
   * but after the roster and without its figures, and the coach should know why.
   */
  private drawNotOnRosterNote(rostered: RosteredPayroll): void {
    if (rostered.not_on_roster.length === 0) return
    this.drawNote(
      `Not on this page's roster, so listed last: ${rostered.not_on_roster.join(', ')}.`,
      undefined,
      { fontSize: 7.5, color: [120, 120, 120] },
    )
  }

  // =====================================================================
  // Ratio Analysis (PORTRAIT) — Urban Road's "COGS Tables", generalised
  // =====================================================================
  /**
   * One block per configured ratio: the two dollar rows (when show_amounts),
   * the percentage, then a row per trailing average. Newest month on the left,
   * as the reference pack sets it out.
   *
   * Every rule — what empties a cell, what an average means — is in
   * ratio-table.ts. This method only lays the result out, and never swallows a
   * reason: a bad config, an unavailable ledger and an empty cell each end up
   * as a sentence on the page.
   */
  private addRatioAnalysisPage(widget?: import('../types/pdf-layout').LayoutWidget): void {
    this.addPage('portrait')
    const heading = (widget?.titleOverride ?? '').trim() || 'Ratio Analysis'
    this.drawPageTitle(`${heading} — ${this.formatMonth(this.report.report_month)}`)

    // Not thrown: generateFromLayout's catch prints "Render error", which tells
    // the coach nothing about the typo that caused it.
    const raw = widget?.config as { ratios?: unknown } | undefined
    if (!raw || raw.ratios === undefined) {
      // A freshly placed page has no config at all. That is not a fault, and
      // Zod's "expected array, received undefined" reads as one.
      this.drawReasonCard('No ratios have been set up for this page yet, so there is nothing to show.')
      return
    }
    const parsed = parseRatioAnalysisConfig(widget?.config)
    if (!parsed.ok) {
      this.drawReasonCard(`This page could not be built — its configuration is not valid: ${parsed.reason}.`)
      return
    }
    const source = this.options.accountActuals
    if (!source || !source.data) {
      const reason = source?.reason ?? 'the account figures were not loaded for this export'
      this.drawReasonCard(`Ratio analysis is not available for this month: ${reason}.`)
      return
    }

    const config = parsed.config
    // table_style 'grid' — the reference sheet's look, sampled off Calxa p8
    // rasterised at 288dpi: #D9D9D9 cell lines, #CCCCCC month headers, a black
    // rule above each percentage. Page-local because nothing else in the pack
    // is a spreadsheet: Calxa pastes this one in, and its greys are Excel's,
    // not the report's band and shade.
    const RATIO_SHEET = {
      fontSize: 9,
      rowHeight: 5.56,
      labelWidth: 81,
      minLabelWidth: 60,
      monthWidth: 22.2,
      gridLine: [217, 217, 217] as [number, number, number],
      headFill: [204, 204, 204] as [number, number, number],
      ruleWidth: 0.26,
    }
    for (const ratio of config.ratios) {
      const t = buildRatioTable(source.data, ratio, this.report.report_month, config)

      // A block needs room for its heading, a few rows and its notes; starting
      // one in the last few centimetres splits the heading from its table.
      if (this.yPosition > this.pageHeight - 60) {
        this.doc.addPage('a4', 'portrait')
        this.yPosition = this.contentTop()
        // A page of tables with no heading is unidentifiable once the pack is
        // printed or a page is forwarded on its own.
        this.drawPageTitle(`${heading} (continued) — ${this.formatMonth(this.report.report_month)}`)
      }

      if (config.block_headings) {
        this.doc.setFont('helvetica', 'bold')
        this.doc.setFontSize(9)
        this.doc.setTextColor(26, 26, 26)
        this.doc.text(t.label.toUpperCase(), this.margin, this.yPosition)
        this.doc.setTextColor(0, 0, 0)
        this.yPosition += 4
      }

      // The sheet leaves an empty grid row above each average block, which is
      // what separates one window from the next once there are no fills.
      const grid = config.table_style === 'grid'
      const kinds: (RatioRow['kind'] | 'spacer')[] = []
      const body: string[][] = []
      for (const row of t.rows) {
        if (grid && row.kind === 'heading') {
          kinds.push('spacer')
          body.push(['', ...t.months.map(() => '')])
        }
        kinds.push(row.kind)
        body.push([row.label, ...(row.kind === 'heading' ? t.months.map(() => '') : row.cells.map((cell) => formatRatioCell(row, cell)))])
      }

      const columns = t.months.length
      if (grid) {
        // Measured off the reference sheet (Calxa p8, a US Letter page read at
        // 1pt = 1pt): 9pt type on a 5.56mm row, an 81mm label column and 22.2mm
        // months. With six months those widths would run off a portrait page,
        // so the months keep their width and the label column gives way first.
        const monthW = Math.min(RATIO_SHEET.monthWidth, (this.pageWidth - this.margin * 2 - RATIO_SHEET.minLabelWidth) / columns)
        const labelW = Math.min(RATIO_SHEET.labelWidth, this.pageWidth - this.margin * 2 - monthW * columns)
        autoTable(this.doc, {
          startY: this.yPosition,
          head: [['', ...t.months.map(monthLabel)]],
          body,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: RATIO_SHEET.fontSize,
            cellPadding: { top: 0.95, right: 0.8, bottom: 0.95, left: 1.1 },
            minCellHeight: RATIO_SHEET.rowHeight,
            valign: 'middle',
            textColor: [0, 0, 0],
            fillColor: [255, 255, 255],
            lineColor: [...RATIO_SHEET.gridLine],
            lineWidth: 0.2,
            overflow: 'linebreak',
          },
          headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
          columnStyles: Object.fromEntries([
            [0, { cellWidth: labelW }],
            ...t.months.map((_, i) => [i + 1, { cellWidth: monthW }]),
          ]),
          tableWidth: labelW + monthW * columns,
          margin: { left: this.margin, right: this.margin },
          didParseCell: (data) => {
            if (data.section === 'head') {
              // Only the month cells are grey; the label column's header is left white.
              if (data.column.index > 0) data.cell.styles.fillColor = [...RATIO_SHEET.headFill]
              return
            }
            if (data.section !== 'body') return
            if (data.column.index > 0) data.cell.styles.halign = 'right'
            const kind = kinds[data.row.index]
            if (kind === 'heading') data.cell.styles.fontStyle = 'bold'
            // The sheet sets the ratio's own row in regular type with bold
            // figures; averaged under a window heading, label and figures are
            // both bold. The one-row '6-month avg %' form stays regular.
            if (kind === 'ratio' && data.column.index > 0) data.cell.styles.fontStyle = 'bold'
            if (kind === 'average' && config.average_blocks) data.cell.styles.fontStyle = 'bold'
            paintNegatives(data as never)
          },
          didDrawCell: (data) => {
            // The black rule the sheet draws above each percentage, across the
            // figures only. autoTable has one line colour per cell, so it is
            // drawn over the grid rather than set as a border.
            if (data.section !== 'body' || data.column.index === 0) return
            const kind = kinds[data.row.index]
            if (kind !== 'ratio' && kind !== 'average') return
            this.doc.setDrawColor(0, 0, 0)
            this.doc.setLineWidth(RATIO_SHEET.ruleWidth)
            this.doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y)
          },
        })
        this.doc.setDrawColor(0, 0, 0)
        this.doc.setLineWidth(0.2)
      } else {
        autoTable(this.doc, {
          startY: this.yPosition,
          head: [['', ...t.months.map(monthLabel)]],
          body,
          ...packTableStyles(8),
          columnStyles: { 0: { cellWidth: 70 } },
          margin: { left: this.margin, right: this.margin },
          didParseCell: (data) => {
            if (data.column.index > 0) data.cell.styles.halign = 'right'
            if (data.section !== 'body') return
            const kind = kinds[data.row.index]
            if (kind === 'ratio') {
              data.cell.styles.fontStyle = 'bold'
              data.cell.styles.fillColor = GP_BLUE
            } else if (kind === 'heading') {
              data.cell.styles.fontStyle = 'bold'
            } else if (kind === 'average' || kind === 'average_numerator' || kind === 'average_denominator') {
              data.cell.styles.fillColor = GROUP_SHADE
            }
            paintNegatives(data as never)
          },
        })
      }
      this.yPosition = ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 4

      const notes: string[] = []
      if (t.reasons.length > 0) {
        // A dash with no reason is the page's least honest state — it reads as
        // "we forgot". Every distinct cause is named once.
        notes.push(`Dashes: ${t.reasons.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join('. ')}.`)
      }
      if (t.averages.length > 0) {
        // Said because a reader who checks will otherwise conclude the page is
        // wrong: the averaged dollars do not divide into the averaged percent,
        // and are not meant to.
        notes.push(
          'Average % is the mean of the monthly percentages over the months ending in each column, not the averaged dollars divided.',
        )
      }
      for (const n of notes) {
        this.drawNote(n, undefined, { fontSize: 7.5, color: [120, 120, 120] })
      }
      this.yPosition += 6
    }
  }

  renderRatioAnalysis(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    this.renderWithSkipPage(() => this.addRatioAnalysisPage(widget), box)
  }

  renderContractorDetail(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    this.renderWithSkipPage(() => this.addContractorDetailPage(widget), box)
  }

  renderPayrollGrid(box: WidgetBoundingBox, widget?: import('../types/pdf-layout').LayoutWidget): void {
    // The layout and the roster are this placement's own (payroll-grid-config).
    this.renderWithSkipPage(() => this.addPayrollGridPage(widget), box)
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
   * The middle series is the approved budget for a client on the budget store
   * and the forecast for everyone else (see analysis-chart-data). Its legend
   * entry says Calxa's "Budgets" for both, because the Budget-vs-Actual table
   * this page sits above heads the same figures "Budgets" (Matt's column-names
   * decision, 14 Sep 2026): one word for the one yardstick the pack holds.
   */
  private addAnalysisChartPage(section: AnalysisChartSection, titleOverride?: string): void {
    const fy = this.options.fullYearReport
    if (!fy) return
    const data = transformAnalysisChartData(fy, section)
    if (!data) return
    this.addPage('landscape')

    // The house header, as every other page has it: "Income Analysis | YTD —
    // Urban Road Pty Ltd" with the months in grey capitals beneath. The chart
    // drew its own 14pt bold "Income Analysis | FY2027" — no client name, a
    // fiscal year the reader has to translate into months — and a sentence
    // subtitle repeating what the legend already says.
    this.drawPageTitle(`${titleOverride ?? data.title} | YTD — ${data.period}`)

    // With no yardstick at all the page is still worth printing — actuals
    // against last year is a real comparison — but the reader has to be told
    // that the missing middle bar is an absence and not a run of zeros.
    if (data.budgetAbsentNote) {
      this.drawNote(data.budgetAbsentNote, undefined, { fontSize: 9, color: [146, 96, 20] })
      this.yPosition += 1.5
    }

    // Everything below is measured off pages 3, 5 and 9 of Urban Road's August
    // 2026 Calxa pack (pdftocairo -svg; 1pt = 0.3528mm): the legend 3.1mm under
    // the period line, the plot frame 5.4mm under the legend and 89.7mm tall,
    // 8pt labels, 0.75pt grey-200 rules. The colours are Calxa's own fills, read
    // from the vector data rather than sampled off a raster — the budget bar
    // was a saturated amber beside Calxa's soft yellow.
    //
    // The middle series drops out entirely when there is none, rather than a
    // legend entry standing over an empty column.
    const labels = analysisChartLegend(data)
    const SERIES: Array<{ label: string; rgb: [number, number, number] }> = [
      { label: labels[0], rgb: [96, 226, 148] },
      ...(data.budgetLabel ? [{ label: labels[1], rgb: [255, 213, 113] as [number, number, number] }] : []),
      { label: labels[labels.length - 1], rgb: [88, 176, 227] },
    ]
    const LABEL_RGB: [number, number, number] = [40, 40, 40]
    const RULE_GREY = 200
    const RULE_WIDTH = 0.265
    // Put back at the end: jsPDF opens the next page at the width last set,
    // and the reason and warning cards stroke their borders without setting one.
    const lineWidthBefore = this.doc.getLineWidth()

    // Legend — centred on the page, not hung off the left margin. Each swatch
    // has a darker inner edge: Calxa strokes it in the series colour at 60%,
    // 35% opaque, which lands at about 86% of the fill.
    const legendY = this.yPosition + 3.1
    const SWATCH = 3.7
    const SWATCH_TO_TEXT = 4.97
    const ENTRY_GAP = 8.55
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(8)
    const entryWidths = SERIES.map((sr) => SWATCH_TO_TEXT + this.doc.getTextWidth(sr.label))
    const legendWidth = entryWidths.reduce((a, b) => a + b, 0) + ENTRY_GAP * (SERIES.length - 1)
    let legendX = (this.pageWidth - legendWidth) / 2
    this.doc.setLineWidth(RULE_WIDTH)
    SERIES.forEach((sr, i) => {
      const top = legendY - 2.55
      this.doc.setFillColor(...sr.rgb)
      this.doc.rect(legendX, top, SWATCH, SWATCH, 'F')
      this.doc.setDrawColor(...(sr.rgb.map((c) => Math.round(c * 0.86)) as [number, number, number]))
      const inset = RULE_WIDTH / 2
      this.doc.rect(legendX + inset, top + inset, SWATCH - RULE_WIDTH, SWATCH - RULE_WIDTH, 'S')
      this.doc.setTextColor(...LABEL_RGB)
      this.doc.text(sr.label, legendX + SWATCH_TO_TEXT, legendY)
      legendX += entryWidths[i] + ENTRY_GAP
    })

    const plotLeft = this.margin + 13.76
    const plotRight = this.pageWidth - this.margin - 1.36
    const plotTop = legendY + 5.38
    const plotHeight = Math.min(89.7, this.pageHeight - plotTop - 25)
    const plotBottom = plotTop + plotHeight
    const plotWidth = plotRight - plotLeft

    // Negative months (rebate-heavy COGS, contra revenue) get room below zero.
    const minRaw = Math.min(0, ...data.months.flatMap((m) => [m.actual ?? 0, m.budget ?? 0, m.priorYear]))
    const axis = analysisChartAxis(minRaw, data.maxValue)
    const yFor = (v: number) => plotTop + ((axis.max - v) / (axis.max - axis.min)) * plotHeight

    // Gridlines and their values, with a long tick at each on the left edge
    // and two short ones between. The old grid was grey-240 at 0.15mm, which
    // printed as nothing at all.
    this.doc.setDrawColor(RULE_GREY, RULE_GREY, RULE_GREY)
    this.doc.setTextColor(...LABEL_RGB)
    for (const tick of axis.ticks) {
      const y = yFor(tick)
      this.doc.line(plotLeft, y, plotRight, y)
      this.doc.line(plotLeft - 1.32, y, plotLeft, y)
      // A plain en-AU figure, as Calxa's axis prints it — not fmtCurrency,
      // whose statement conventions would bracket a negative gridline.
      this.doc.text(Math.round(tick).toLocaleString('en-AU'), plotLeft - 2.97, y + 1.02, { align: 'right' })
    }
    for (let i = -1; i < axis.ticks.length; i++) {
      for (const third of [1, 2]) {
        const v = axis.ticks[0] + (i + third / 3) * axis.step
        if (v > axis.min && v < axis.max) this.doc.line(plotLeft - 0.53, yFor(v), plotLeft, yFor(v))
      }
    }

    // Bars: each a fifth of its month's slot with a hairline of white between
    // them, the group centred on the month.
    const slot = plotWidth / data.months.length
    const barWidth = slot * 0.2
    const groupWidth = barWidth * SERIES.length + RULE_WIDTH * (SERIES.length - 1)
    const zeroY = yFor(0)
    data.months.forEach((m, i) => {
      const slotLeft = plotLeft + i * slot
      const groupLeft = slotLeft + (slot - groupWidth) / 2
      const values: Array<number | null> = data.budgetLabel
        ? [m.actual, m.budget, m.priorYear]
        : [m.actual, m.priorYear]
      values.forEach((v, si) => {
        if (v === null || v === 0) return
        const x = groupLeft + si * (barWidth + RULE_WIDTH)
        const yTop = v >= 0 ? yFor(v) : zeroY
        const h = Math.abs(yFor(v) - zeroY)
        if (h < 0.1) return
        this.doc.setFillColor(...SERIES[si].rgb)
        this.doc.rect(x, yTop, barWidth, h, 'F')
      })

      // "Sep 2026" under the slot's centre, over a long tick there and four
      // short ones across the slot.
      this.doc.text(m.label, slotLeft + slot / 2, plotBottom + 4.77, { align: 'center' })
      for (let k = 0; k < 5; k++) {
        const x = slotLeft + ((k + 0.5) * slot) / 5
        this.doc.line(x, plotBottom, x, plotBottom + (k === 2 ? 1.32 : 0.53))
      }
    })

    // The frame last, so a bar's foot cannot paint over the bottom rule.
    this.doc.rect(plotLeft, plotTop, plotWidth, plotHeight, 'S')

    this.doc.setTextColor(0, 0, 0)
    this.doc.setDrawColor(0, 0, 0)
    this.doc.setLineWidth(lineWidthBefore)
    this.yPosition = plotBottom + 10
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
  private drawCommentaryBlock(
    items: readonly CommentaryBullet[],
    opts: {
      placement: CommentaryPlacement
      orientation: 'portrait' | 'landscape'
      /** Where the block starts; under the last table when absent. */
      startY?: number
      showHeading?: boolean
      /** The body size when the placement names none. */
      defaultSize?: number
    },
  ): void {
    if (items.length === 0) return
    let y = opts.startY ?? ((this.doc as any).lastAutoTable?.finalY ?? this.yPosition) + 8
    const left = this.margin
    // 8pt with a 4.2mm line is the block as it has always printed; a larger
    // size keeps the same proportions, so a 10pt page is not a cramped 8pt one.
    const size = opts.placement.bodySize ?? opts.defaultSize ?? 8
    const scale = size / 8
    const lineHeight = 4.2 * scale
    const bulletIndent = 4 * scale
    const available = this.pageWidth - this.margin * 2 - bulletIndent

    // A block that runs on is a continuation, as a table's run-on page is: no
    // corner mark and no title, bullets from near the top. Calxa's page 12 is
    // the expense COMMENTS carried over, and it is bare. (Guarded on the page
    // count: addPage can be a no-op inside a layout widget's first draw.)
    const newPageIfNeeded = (needed: number) => {
      if (y + needed > this.pageHeight - this.margin - 10) {
        const before = this.doc.getNumberOfPages()
        this.addPage(opts.orientation)
        if (this.doc.getNumberOfPages() > before) {
          this.openedPages.delete(this.doc.getNumberOfPages())
          y = CONTINUATION_TEXT_TOP
        } else {
          y = this.yPosition
        }
      }
    }

    // Each bullet's label and wrapped lines, measured before anything is drawn:
    // the heading needs the first bullet's height, not a guess at it.
    const laidOut = items.map((item) => {
      // The account in bold, the pipe in the body's weight. A bold Helvetica
      // pipe beside a bold name reads as a capital I ("Rugs I Unitex").
      this.doc.setFont('helvetica', 'bold')
      this.doc.setFontSize(size)
      const label = `${item.account} `
      const accountWidth = this.doc.getTextWidth(label)
      this.doc.setFont('helvetica', 'normal')
      const pipe = '| '
      const labelWidth = accountWidth + this.doc.getTextWidth(pipe)

      // The first line shares its row with the bold label, so it gets less
      // width than the ones that wrap under it.
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
      return { item, label, accountWidth, pipe, labelWidth, lines }
    })

    // The room a bullet asks for before it starts: all of its lines, so it is
    // not split — unless it is taller than a whole run-on page, when it must
    // split anyway and asks for two lines (asking for the whole of it would
    // open a page it still could not fit, and leave that page empty).
    const pageRoom = this.pageHeight - this.margin - 10 - CONTINUATION_TEXT_TOP - 5.5 * scale
    const keepTogether = (lines: readonly string[]) => {
      const whole = lineHeight * Math.max(lines.length, 1) + 2
      return whole <= pageRoom ? whole : lineHeight * 2 + 2
    }

    // The heading keeps with its WHOLE first bullet. Checked on its own,
    // "COMMENTS" fitted at the foot of the expense table's last page and every
    // bullet under it went over; checked with one line of the first bullet, a
    // bullet of four lines (a coach note in replace mode) still went over alone.
    if (opts.showHeading !== false) {
      newPageIfNeeded(Math.max(10, 5.5 * scale + (laidOut[0] ? keepTogether(laidOut[0].lines) : lineHeight + 2)))
      this.doc.setFont('helvetica', 'bold')
      this.doc.setFontSize(size + 1)
      this.doc.setTextColor(26, 26, 26)
      this.doc.text(opts.placement.heading, left, y)
      if (opts.placement.headingUnderline) {
        // Calxa's "COMMENTS" is underlined; jsPDF has no underline style, so
        // the rule is drawn under the heading's own width.
        this.doc.setDrawColor(26, 26, 26)
        this.doc.setLineWidth(0.25)
        this.doc.line(left, y + 0.8, left + this.doc.getTextWidth(opts.placement.heading), y + 0.8)
      }
      y += 5.5 * scale
    }

    for (const { item, label, accountWidth, pipe, labelWidth, lines } of laidOut) {
      newPageIfNeeded(keepTogether(lines))
      // The heading set its own size; each bullet is drawn at the body's.
      this.doc.setFontSize(size)
      this.doc.setTextColor(60, 60, 60)
      this.doc.text('•', left, y)
      this.doc.setFont('helvetica', 'bold')
      this.doc.setTextColor(26, 26, 26)
      this.doc.text(label, left + bulletIndent, y)
      this.doc.setFont('helvetica', 'normal')
      this.doc.text(pipe, left + bulletIndent + accountWidth, y)
      if (item.flagged) this.doc.setTextColor(...TEXT_NEGATIVE)
      else this.doc.setTextColor(55, 55, 55)
      this.doc.text(lines[0] ?? '', left + bulletIndent + labelWidth, y)
      for (const extra of lines.slice(1)) {
        y += lineHeight
        newPageIfNeeded(lineHeight)
        this.doc.text(extra, left + bulletIndent, y)
      }
      y += lineHeight + 1 * scale
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
   *
   * `monthPrefix: false` prints a month bare ("AUG 2026"): Calxa's balance
   * sheet heads its page that way, at the same size and position as the
   * statements' "MONTH: AUG 2026". It goes through here rather than being
   * drawn by the page, which put it under the 24pt title.
   */
  private drawPageTitle(heading: string, opts: { monthPrefix?: boolean } = {}): void {
    const cut = heading.lastIndexOf(' — ')
    const subject = cut > 0 ? heading.slice(0, cut) : heading
    const period = cut > 0 ? shortPeriodMonth(heading.slice(cut + 3)) : null
    const periodLine = (p: string) => (opts.monthPrefix === false ? p.toUpperCase() : this.periodLine(p))
    const client = this.packEntityName()
    const text = client ? `${subject} — ${client}` : subject
    this.openedPages.add(this.doc.getNumberOfPages())

    // A title that opens a page is set the way Calxa sets it: 24pt, its
    // baseline 18.7mm down, the period line 12pt at 27.6mm, the table 8mm
    // under that — measured off the August pack. A long title wraps inside
    // Calxa's 166mm title block rather than running under the corner mark.
    //
    // A title further down a page — the second chart on a shared chart page —
    // keeps the old compact size: 24pt in an 86mm box is a headline, not a label.
    const page = this.doc.getNumberOfPages()
    const atTop = this.yPosition <= this.contentTop() && this.margin <= 15.5 && !this.topTitledPages.has(page)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(26, 26, 26)
    if (atTop) {
      this.doc.setFontSize(24)
      const width = Math.min(166, this.pageWidth - this.margin * 2 - 28)
      const lines: string[] = this.doc.splitTextToSize(text, width)
      let y = CONTENT_TOP - 3.3
      lines.forEach((line, i) => this.doc.text(line, this.margin, y + i * 9.7))
      y += (lines.length - 1) * 9.7
      if (period) {
        this.doc.setFontSize(12)
        this.doc.setTextColor(125, 125, 125)
        this.doc.text(periodLine(period), this.margin, y + 8.9)
        y += 8.9
      }
      // Never above a custom corner mark's bottom edge: the title sits beside
      // the mark, but the full-width table under a title with no period line
      // would start at 28.7mm, inside it. A table under a period line already
      // starts at 35.6mm, where Calxa's does, and does not move.
      const markBottom = this.customMarkBottom()
      this.yPosition = Math.max(y + (period ? 8 : 10), markBottom === null ? 0 : markBottom + CORNER_MARK_GAP)
      this.topTitledPages.add(page)
    } else {
      this.doc.setFontSize(17)
      this.doc.text(text, this.margin, this.yPosition)
      this.yPosition += 5.5
      if (period) {
        this.doc.setFontSize(9)
        this.doc.setTextColor(125, 125, 125)
        this.doc.text(periodLine(period), this.margin, this.yPosition)
        this.yPosition += 3
      }
      this.yPosition += 6
    }

    this.doc.setTextColor(0, 0, 0)
    this.doc.setFontSize(10)
  }

  /**
   * "MONTH: AUG 2026" for a month, the period verbatim for anything else (a
   * fiscal year, a date range) — labelling "FY2027" as a month is worse than
   * not labelling it.
   */
  private periodLine(period: string): string {
    const isMonth = /^[A-Za-z]{3,9} \d{4}$/.test(period)
    return (isMonth ? `MONTH: ${period}` : period).toUpperCase()
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

  private buildLineRow(
    line: ReportLine,
    settings: MonthlyReportSettings,
    opts: { variancePercent?: boolean } = {},
  ): any[] {
    const pct = opts.variancePercent ?? true
    const row: any[] = [
      // No "(budget only)" suffix. The row already says it — a budget and a
      // nought beside it — and Calxa prints Bank Revaluations and General
      // Expenses by name alone. The suffix pushed long names onto two lines.
      line.account_name,
      this.budgetCell(line.budget),
      this.fmtCurrency(line.actual),
      // Phase 71-07 (S4): tag variance cells with structured polarity so
      // `applyVarianceTint` no longer depends on parsing formatted text.
      this.varianceCell(line.variance_amount),
    ]
    if (pct) row.push(this.variancePctCell(line.variance_percent, line.budget))
    if (settings.show_ytd) {
      row.push(
        this.budgetCell(line.ytd_budget),
        this.fmtCurrency(line.ytd_actual),
        this.varianceCell(line.ytd_variance_amount),
      )
      if (pct) row.push(this.variancePctCell(line.ytd_variance_percent, line.ytd_budget))
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

      // No DRAFT watermark and no PROVISIONAL footer. WC.5 stamped both on
      // every page of a draft; Matt chose Calxa's single plain line on the
      // cover instead (14 Sep 2026) — see draftCoverLine.

      // The corner mark, on every page a renderer opened except the cover —
      // which carries the full lockup already. Not on the pages autoTable adds
      // when a table runs on: Calxa leaves those bare, and ours sat on top of
      // the repeated header band.
      //
      // Nor on a layout page where a placed widget holds that corner — see
      // clearOfCornerMark.
      const isCover = i === this.coverPage
      if (!isCover && i > 1 && this.openedPages.has(i) && !this.cornerClaimedPages.has(i)) {
        try {
          const custom = this.customMark()
          const { x, y, w, h } = this.cornerMarkBox(pw)
          if (custom) this.doc.addImage(custom.image, custom.format, x, y, w, h)
          else this.doc.addImage(LOGO_CORNER, 'PNG', x, y, w, h)
        } catch {
          // See addCoverPage.
        }
      }

      this.doc.setFontSize(10)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(128, 128, 128)
      // "Page 7 of 27", right-aligned, and nothing else. The tool that built
      // the pack and the date it was built are the client's least interesting
      // facts; Calxa puts neither on the page, and the export's own cover
      // states the preparation date once. 10pt, as Calxa sets it — 10mm up rather
      // than Calxa's 14, because the long tables elsewhere in the pack run to
      // 15mm from the bottom and the number must not sit on their last row.
      //
      // Not on the cover. Calxa's cover has no number, and its page 2 still
      // reads "Page 2 of 26": the cover counts, it just is not labelled.
      if (!isCover) this.doc.text(`Page ${i} of ${totalPages}`, pw - 15, ph - 10, { align: 'right' })
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
    // Signed on the figure PRINTED, as bsPercentText does: -0.02 printed as
    // "-0.0%" beside a variance of 0, a direction on a number that is not
    // there. `=== 0` is true of -0 too, so a rounded -0 cannot keep its minus.
    const rounded = Math.round(value * 10) / 10
    if (rounded === 0) return '0.0%'
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`
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
