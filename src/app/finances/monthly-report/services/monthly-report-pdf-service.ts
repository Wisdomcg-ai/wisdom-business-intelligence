import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { GeneratedReport, ReportSection, ReportLine, MonthlyReportSettings, ReportSections, VarianceCommentary, FullYearReport, SubscriptionDetailData, WagesDetailData } from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import { transformCashflowToChartData, CASHFLOW_CHART_COLORS, CASHFLOW_CHART_SERIES } from '@/app/finances/forecast/utils/cashflow-chart-data'
import { transformRevenueBreakdownData } from '../components/charts/RevenueBreakdownChart'
import { transformBreakEvenData } from '../components/charts/BreakEvenChart'
import { transformRevenueVsExpensesData } from '../components/charts/RevenueVsExpensesTrendChart'
import { transformVarianceHeatmapData } from '../components/charts/VarianceHeatmapChart'
import { transformBurnRateData } from '../components/charts/BudgetBurnRateChart'
import { transformCashRunwayData } from '../components/charts/CashRunwayChart'
import { transformCumulativeNetCashData } from '../components/charts/CumulativeNetCashChart'
import { transformWorkingCapitalData } from '../components/charts/WorkingCapitalGapChart'
import { transformTeamCostData } from '../components/charts/TeamCostPctChart'
import { transformCostPerEmployeeData } from '../components/charts/CostPerEmployeeChart'
import { transformSubscriptionCreepData } from '../components/charts/SubscriptionCreepChart'
import { CHART_COLORS, getHeatmapColor } from '../components/charts/chart-colors'
import type { PDFLayout, WidgetType, WidgetBoundingBox } from '../types/pdf-layout'
import { GRID_CONFIG } from '../types/pdf-layout'
import { calculateBoundingBox } from '../utils/grid-helpers'
import { WIDGET_METHOD_MAP } from './widget-renderer'

interface PDFOptions {
  commentary?: VarianceCommentary
  fullYearReport?: FullYearReport
  subscriptionDetail?: SubscriptionDetailData
  wagesDetail?: WagesDetailData
  cashflowForecast?: CashflowForecastData
  sections?: ReportSections
  pdfLayout?: import('../types/pdf-layout').PDFLayout | null
}

// A4 dimensions in mm
const A4_SHORT = 210
const A4_LONG = 297

// Variance cell tint colors
const TINT_GREEN: [number, number, number] = [240, 253, 244]
const TINT_RED: [number, number, number] = [254, 242, 242]

// Row highlight colors
const NAVY: [number, number, number] = [30, 41, 59]
const GP_BLUE: [number, number, number] = [219, 234, 254]
const OP_BLUE: [number, number, number] = [235, 245, 255]

export class MonthlyReportPDFService {
  private doc: jsPDF
  private report: GeneratedReport
  private options: PDFOptions
  private pageWidth: number
  private pageHeight: number
  private margin: number = 15
  private yPosition: number = 15
  private skipNextAddPage: boolean = false

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
          console.error('[PDF] Layout-driven generation failed, falling back to default:', err)
          // Reset the doc for default generation
          this.doc = new jsPDF('portrait', 'mm', 'a4')
          this.pageWidth = A4_SHORT
          this.pageHeight = A4_LONG
          this.margin = 15
          this.yPosition = 15
        }
      }
    }

    const sec = this.options.sections

    this.addExecutiveSummary()
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
    if (this.options.cashflowForecast && this.options.cashflowForecast.months.length > 0) {
      this.addCashflowForecastPage()
      this.addCashflowForecastChartPage()
    }
    if (this.options.fullYearReport) {
      this.addFullYearProjection()
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
    this.yPosition = this.margin
  }

  // =====================================================================
  // Page 1: Executive Summary — Calxa / Urban Roads style (PORTRAIT)
  // =====================================================================
  private addExecutiveSummary(): void {
    const { report } = this
    const monthLabel = this.formatShortMonth(report.report_month)
    const monthLong = this.formatMonth(report.report_month)
    const settings = report.settings

    // Header
    this.doc.setFontSize(18)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Actual vs Budget', this.pageWidth / 2, this.yPosition, { align: 'center' })
    this.yPosition += 7

    this.doc.setFontSize(11)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(`MONTH: ${monthLong.toUpperCase()}`, this.pageWidth / 2, this.yPosition, { align: 'center' })
    this.yPosition += 5

    this.doc.setFontSize(9)
    this.doc.text(`FY${report.fiscal_year}`, this.pageWidth / 2, this.yPosition, { align: 'center' })
    this.yPosition += 8

    // Separator
    this.doc.setDrawColor(200, 200, 200)
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition)
    this.yPosition += 6

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
    const navyStyle = { fillColor: NAVY as number[], textColor: [255, 255, 255] as number[], fontStyle: 'bold' as const, fontSize: 7 }

    const headerRow1: any[] = [
      { content: '', rowSpan: 2, styles: { ...navyStyle, cellWidth: 36 } },
      { content: monthLabel, colSpan: 3, styles: { ...navyStyle, halign: 'center' as const } },
    ]
    if (hasYtd) {
      headerRow1.push({ content: `YTD FY${report.fiscal_year}`, colSpan: 3, styles: { ...navyStyle, halign: 'center' as const } })
    }
    if (hasUnspent) headerRow1.push({ content: 'Unspent\nBudget', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })
    if (hasNextMonth) headerRow1.push({ content: 'Budget\nNext Mth', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })
    if (hasAnnual) headerRow1.push({ content: 'Budget\nAnnual', rowSpan: 2, styles: { ...navyStyle, halign: 'center' as const, fontSize: 6 } })

    const headerRow2: any[] = [
      { content: 'Budget', styles: navyStyle },
      { content: 'Actual', styles: navyStyle },
      { content: 'Variance', styles: navyStyle },
    ]
    if (hasYtd) {
      headerRow2.push(
        { content: 'Budget', styles: navyStyle },
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
    const tableBody: any[][] = rows.map(row => {
      const r: any[] = [
        row.label,
        this.fmtCurrency(row.budget),
        this.fmtCurrency(row.actual),
        this.fmtVariance(row.variance),
      ]
      if (hasYtd) {
        r.push(
          this.fmtCurrency(row.ytdBudget),
          this.fmtCurrency(row.ytdActual),
          this.fmtVariance(row.ytdVariance),
        )
      }
      if (hasUnspent) r.push(this.fmtCurrency(row.unspent))
      if (hasNextMonth) r.push(this.fmtCurrency(row.nextMonth))
      if (hasAnnual) r.push(this.fmtCurrency(row.annual))
      return r
    })

    // Determine which column indices are variance columns
    const varianceCols: number[] = [3] // monthly variance
    if (hasYtd) varianceCols.push(6) // YTD variance

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

        // Net Profit row — dark navy
        if (rowData.style === 'np') {
          data.cell.styles.fillColor = NAVY
          data.cell.styles.textColor = [255, 255, 255]
        }

        // Variance cell tinting (only for normal/income/expense rows)
        if (varianceCols.includes(colIdx) && rowData.style === 'normal') {
          this.applyVarianceTint(data)
        }

        // Variance text color for highlighted rows (GP, OP)
        if (varianceCols.includes(colIdx) && (rowData.style === 'gp' || rowData.style === 'op')) {
          const text = String(data.cell.text || '')
          if (text.startsWith('(')) {
            data.cell.styles.textColor = [185, 28, 28]
          } else if (text !== '$0' && text !== '') {
            data.cell.styles.textColor = [21, 128, 61]
          }
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
  private addBudgetVsActualDetail(): void {
    this.addPage('landscape')

    const settings = this.report.settings

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Budget vs Actual Detail — ${this.formatMonth(this.report.report_month)}`, this.margin, this.yPosition)
    this.yPosition += 8

    const headers: string[] = ['Account', 'Budget', 'Actual', 'Var ($)', 'Var (%)']
    const varianceCols = [3, 4] // Var ($) and Var (%)
    let nextCol = 5

    if (settings.show_ytd) {
      headers.push('YTD Budget', 'YTD Actual', 'YTD Var ($)', 'YTD Var (%)')
      varianceCols.push(nextCol + 2, nextCol + 3)
      nextCol += 4
    }
    if (settings.show_unspent_budget) { headers.push('Unspent'); nextCol++ }
    if (settings.show_budget_next_month) { headers.push('Next Mth'); nextCol++ }
    if (settings.show_budget_annual_total) { headers.push('Annual'); nextCol++ }
    if (settings.show_prior_year) { headers.push('Prior Yr'); nextCol++ }

    const tableData: any[] = []

    const sectionColors: Record<string, number[]> = {
      'Revenue': [16, 185, 129],
      'Cost of Sales': [239, 68, 68],
      'Operating Expenses': [245, 158, 11],
      'Other Income': [59, 130, 246],
      'Other Expenses': [107, 114, 128],
    }

    // Track which body-row indices are section headers, subtotals, GP, NP for tinting logic
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0

    for (const section of this.report.sections) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: section.category,
        colSpan: headers.length,
        styles: {
          fillColor: sectionColors[section.category] || [107, 114, 128],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
      }])
      currentBodyIdx++

      for (const line of section.lines) {
        tableData.push(this.buildLineRow(line, settings))
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      const subtotalRow = this.buildLineRow(section.subtotal, settings)
      subtotalRow[0] = { content: section.subtotal.account_name, styles: { fontStyle: 'bold' } }
      tableData.push(subtotalRow)
      currentBodyIdx++

      // Commentary
      if (this.options.commentary && ['Cost of Sales', 'Operating Expenses', 'Other Expenses'].includes(section.category)) {
        const sectionCommentary = section.lines
          .filter(l => this.options.commentary![l.account_name])
          .map(l => {
            const entry = this.options.commentary![l.account_name]
            const vendors = (entry.vendor_summary || [])
              .map(v => `${v.vendor} ($${v.amount.toLocaleString()})`)
              .join(', ')
            const note = entry.coach_note ? ` — ${entry.coach_note}` : ''
            return `${l.account_name}${vendors ? ' | ' + vendors : ''}${note}`
          })
        if (sectionCommentary.length > 0) {
          specialRowIndices.add(currentBodyIdx)
          tableData.push([{
            content: sectionCommentary.join('\n'),
            colSpan: headers.length,
            styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15], fontSize: 6, cellPadding: 3 },
          }])
          currentBodyIdx++
        }
      }

      // Gross Profit after COGS
      if (section.category === 'Cost of Sales') {
        specialRowIndices.add(currentBodyIdx)
        const gpRow = this.buildLineRow(this.report.gross_profit_row, settings)
        gpRow[0] = { content: 'Gross Profit', styles: { fontStyle: 'bold', fillColor: GP_BLUE } }
        for (let i = 1; i < gpRow.length; i++) {
          gpRow[i] = { content: gpRow[i], styles: { fillColor: GP_BLUE, fontStyle: 'bold' } }
        }
        tableData.push(gpRow)
        currentBodyIdx++
      }
    }

    // Net Profit
    specialRowIndices.add(currentBodyIdx)
    const npRow = this.buildLineRow(this.report.net_profit_row, settings)
    npRow[0] = { content: 'Net Profit', styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } }
    for (let i = 1; i < npRow.length; i++) {
      npRow[i] = { content: npRow[i], styles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' } }
    }
    tableData.push(npRow)

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: { 0: { cellWidth: 50 } },
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

  // =====================================================================
  // YTD Detail (PORTRAIT — fewer columns)
  // =====================================================================
  private addYTDSummary(): void {
    this.addPage('portrait')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`YTD Detail — FY${this.report.fiscal_year}`, this.margin, this.yPosition)
    this.yPosition += 8

    const settings = this.report.settings
    const headers = ['Account', 'YTD Budget', 'YTD Actual', 'YTD Var ($)', 'YTD Var (%)']
    const varianceCols = [3, 4]
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

      for (const line of section.lines) {
        const row: any[] = [
          line.is_budget_only ? `${line.account_name} (budget only)` : line.account_name,
          this.fmtCurrency(line.ytd_budget),
          this.fmtCurrency(line.ytd_actual),
          this.fmtVariance(line.ytd_variance_amount),
          this.fmtPct(line.ytd_variance_percent),
        ]
        if (settings.show_unspent_budget) row.push(this.fmtCurrency(line.unspent_budget))
        if (settings.show_budget_annual_total) row.push(this.fmtCurrency(line.budget_annual_total))
        tableData.push(row)
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      const st = section.subtotal
      const subtotalRow: any[] = [
        { content: st.account_name, styles: { fontStyle: 'bold' } },
        this.fmtCurrency(st.ytd_budget),
        this.fmtCurrency(st.ytd_actual),
        this.fmtVariance(st.ytd_variance_amount),
        this.fmtPct(st.ytd_variance_percent),
      ]
      if (settings.show_unspent_budget) subtotalRow.push(this.fmtCurrency(st.unspent_budget))
      if (settings.show_budget_annual_total) subtotalRow.push(this.fmtCurrency(st.budget_annual_total))
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

  // =====================================================================
  // Subscription Analysis (PORTRAIT — 5 narrow columns)
  // =====================================================================
  private addSubscriptionDetailPage(): void {
    const detail = this.options.subscriptionDetail!
    this.addPage('portrait')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Subscription Analysis — ${this.formatMonth(this.report.report_month)}`, this.margin, this.yPosition)
    this.yPosition += 8

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
        styles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', fontSize: 8 },
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Wages Analysis — ${this.formatMonth(this.report.report_month)}`, this.margin, this.yPosition)
    this.yPosition += 8

    const headers = ['Account Name', 'Budget', 'Actual', 'Var ($)', 'Var (%)']
    const varianceCols = [3, 4]
    const tableData: any[] = []

    for (const account of detail.accounts) {
      tableData.push([
        account.account_name,
        this.fmtCurrency(account.budget),
        this.fmtCurrency(account.actual),
        this.fmtVariance(account.variance),
        this.fmtPct(account.variance_percent),
      ])
    }

    const gtVarPct = detail.grand_total.budget > 0
      ? ((detail.grand_total.budget - detail.grand_total.actual) / detail.grand_total.budget * 100)
      : 0
    const grandTotalIdx = tableData.length
    tableData.push([
      { content: 'Grand Total', styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: this.fmtCurrency(detail.grand_total.budget), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: this.fmtCurrency(detail.grand_total.actual), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: this.fmtVariance(detail.grand_total.variance), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
      { content: this.fmtPct(gtVarPct), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
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

      const empHeaders = ['Employee', 'Total Paid', 'Budget', 'Var ($)']
      const empData = detail.employees.map(e => [
        e.name,
        this.fmtCurrency(e.actual_total),
        this.fmtCurrency(e.budget_total),
        this.fmtVariance(e.variance),
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
  // Cashflow Forecast (LANDSCAPE — expanded month-by-month cash budget)
  // =====================================================================
  private addCashflowForecastPage(): void {
    const cf = this.options.cashflowForecast!
    this.addPage('landscape')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Cashflow Forecast', this.margin, this.yPosition)
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
    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Cashflow Forecast', this.margin, this.yPosition)
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Full Year Projection — FY${fy.fiscal_year}`, this.margin, this.yPosition)
    this.yPosition += 6

    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(
      `Actuals through ${this.formatMonth(fy.last_actual_month)}, then budget forecast`,
      this.margin, this.yPosition
    )
    this.yPosition += 6

    const monthLabels = fy.gross_profit.months.map(m => {
      const d = new Date(m.month + '-01')
      return d.toLocaleDateString('en-AU', { month: 'short' })
    })

    const headers = ['Account', ...monthLabels, 'Projected', 'Budget', 'Var ($)', 'Var (%)']
    // Variance columns are the last two
    const varianceCols = [headers.length - 2, headers.length - 1]
    const tableData: any[] = []
    const specialRowIndices = new Set<number>()
    let currentBodyIdx = 0

    const sectionColors: Record<string, number[]> = {
      'Revenue': [16, 185, 129],
      'Cost of Sales': [239, 68, 68],
      'Operating Expenses': [245, 158, 11],
      'Other Income': [59, 130, 246],
      'Other Expenses': [107, 114, 128],
    }

    for (const section of fy.sections) {
      specialRowIndices.add(currentBodyIdx)
      tableData.push([{
        content: section.category,
        colSpan: headers.length,
        styles: {
          fillColor: sectionColors[section.category] || [107, 114, 128],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 6,
        },
      }])
      currentBodyIdx++

      for (const line of section.lines) {
        const row: any[] = [line.account_name]
        for (const md of line.months) {
          row.push(this.fmtCurrency(md.source === 'actual' ? md.actual : md.budget))
        }
        row.push(this.fmtCurrency(line.projected_total))
        row.push(this.fmtCurrency(line.annual_budget))
        row.push(this.fmtVariance(line.variance_amount))
        row.push(this.fmtPct(line.variance_percent))
        tableData.push(row)
        currentBodyIdx++
      }

      specialRowIndices.add(currentBodyIdx)
      const st = section.subtotal
      const stRow: any[] = [{ content: st.account_name, styles: { fontStyle: 'bold' } }]
      for (const md of st.months) {
        stRow.push({ content: this.fmtCurrency(md.source === 'actual' ? md.actual : md.budget), styles: { fontStyle: 'bold' } })
      }
      stRow.push({ content: this.fmtCurrency(st.projected_total), styles: { fontStyle: 'bold' } })
      stRow.push({ content: this.fmtCurrency(st.annual_budget), styles: { fontStyle: 'bold' } })
      stRow.push({ content: this.fmtVariance(st.variance_amount), styles: { fontStyle: 'bold' } })
      stRow.push({ content: this.fmtPct(st.variance_percent), styles: { fontStyle: 'bold' } })
      tableData.push(stRow)
      currentBodyIdx++

      // GP after COGS
      if (section.category === 'Cost of Sales') {
        specialRowIndices.add(currentBodyIdx)
        const gpLine = fy.gross_profit
        const gpRow: any[] = [{ content: 'Gross Profit', styles: { fontStyle: 'bold', fillColor: GP_BLUE } }]
        for (const md of gpLine.months) {
          gpRow.push({ content: this.fmtCurrency(md.source === 'actual' ? md.actual : md.budget), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        }
        gpRow.push({ content: this.fmtCurrency(gpLine.projected_total), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: this.fmtCurrency(gpLine.annual_budget), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: this.fmtVariance(gpLine.variance_amount), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
        gpRow.push({ content: this.fmtPct(gpLine.variance_percent), styles: { fillColor: GP_BLUE, fontStyle: 'bold' } })
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
      npRow.push({ content: this.fmtCurrency(md.source === 'actual' ? md.actual : md.budget), styles: npStyle })
    }
    npRow.push({ content: this.fmtCurrency(np.projected_total), styles: npStyle })
    npRow.push({ content: this.fmtCurrency(np.annual_budget), styles: npStyle })
    npRow.push({ content: this.fmtVariance(np.variance_amount), styles: npStyle })
    npRow.push({ content: this.fmtPct(np.variance_percent), styles: npStyle })
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
        // Variance tinting for normal data rows
        if (data.section === 'body' && !specialRowIndices.has(data.row.index) && varianceCols.includes(data.column.index)) {
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Where Your Revenue Goes', this.margin, this.yPosition)
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
    const { data, summary } = transformBreakEvenData(fy)
    if (data.length === 0) return
    this.addPage('landscape')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Break-Even Analysis', this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Revenue needed to cover all costs each month', this.margin, this.yPosition)
    this.yPosition += 8

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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Revenue vs Expenses Trend', this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Monthly revenue and total expenses with profit gap', this.margin, this.yPosition)
    this.yPosition += 10

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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Budget Variance Heatmap', this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Green = favorable, Red = unfavorable variance by category and month', this.margin, this.yPosition)
    this.yPosition += 10

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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Budget Burn Rate', this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    const pctElapsed = data[0]?.pctElapsed || 0
    this.doc.text(`How much of each annual budget has been spent (${pctElapsed.toFixed(0)}% of FY elapsed)`, this.margin, this.yPosition)
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Cash Runway', this.margin, this.yPosition)
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Cumulative Net Cash', this.margin, this.yPosition)
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Working Capital Gap', this.margin, this.yPosition)
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
    if (data.length === 0) return
    this.addPage('landscape')

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Team Cost as % of Revenue', this.margin, this.yPosition)
    this.yPosition += 5
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text('Monthly wages spend vs percentage of revenue', this.margin, this.yPosition)
    this.yPosition += 10

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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Cost per Employee', this.margin, this.yPosition)
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

    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Subscription Creep', this.margin, this.yPosition)
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
        // Change column tinting
        if (cellData.section === 'body' && cellData.column.index === 3) {
          const text = String(cellData.cell.text || '')
          if (text.startsWith('+') && !text.includes('$0')) {
            cellData.cell.styles.fillColor = [...TINT_RED]
          } else if (text.startsWith('-')) {
            cellData.cell.styles.fillColor = [...TINT_GREEN]
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
  private generateFromLayout(layout: PDFLayout): jsPDF {
    let isFirstPage = true

    for (const page of layout.pages) {
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
      this.yPosition = this.margin

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
        this.renderWidget(widget.type, box)
      }
    }

    this.addAllFooters()
    return this.doc
  }

  /**
   * Dispatch rendering for a widget type within a bounding box.
   * Falls back to a placeholder if the widget can't be rendered.
   */
  private renderWidget(type: WidgetType, box: WidgetBoundingBox): void {
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
        method.call(this, box)
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
      default:
        return true
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

  renderBudgetVsActual(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addBudgetVsActualDetail, box)
  }

  renderYTDSummary(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addYTDSummary, box)
  }

  renderFullYearProjection(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addFullYearProjection, box)
  }

  renderSubscriptionDetail(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addSubscriptionDetailPage, box)
  }

  renderWagesDetail(box: WidgetBoundingBox): void {
    this.renderWithSkipPage(this.addWagesDetailPage, box)
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

  // ── KPI Card Renderers ──

  renderKPIRevenue(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Revenue', s.revenue.actual, s.revenue.variance, [16, 185, 129])
  }

  renderKPIGrossProfit(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Gross Profit', s.gross_profit.actual, s.gross_profit.variance, [59, 130, 246])
  }

  renderKPINetProfit(box: WidgetBoundingBox): void {
    const s = this.report.summary
    this.renderKPICard(box, 'Net Profit', s.net_profit.actual, s.net_profit.variance, [139, 92, 246])
  }

  private renderKPICard(
    box: WidgetBoundingBox,
    label: string,
    value: number,
    variance: number,
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

    // Variance
    this.doc.setFontSize(9)
    this.doc.setFont('helvetica', 'normal')
    const varText = variance >= 0 ? `+${this.fmtCurrency(variance)} vs budget` : `${this.fmtCurrency(variance)} vs budget`
    this.doc.text(varText, box.x + box.w / 2, box.y + box.h * 0.75, { align: 'center' })

    this.doc.setTextColor(0, 0, 0)
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  /** Apply green/red cell background tint based on variance value */
  private applyVarianceTint(data: any): void {
    const text = String(data.cell.text || '')
    if (!text || text === '—' || text === '$0' || text === '($0)' || text === '+0.0%') return
    if (text.startsWith('(') || text.startsWith('-')) {
      data.cell.styles.fillColor = [...TINT_RED]
    } else if (text.startsWith('$') || text.startsWith('+')) {
      data.cell.styles.fillColor = [...TINT_GREEN]
    }
  }

  private buildLineRow(line: ReportLine, settings: MonthlyReportSettings): any[] {
    const row: any[] = [
      line.is_budget_only ? `${line.account_name} (budget only)` : line.account_name,
      this.fmtCurrency(line.budget),
      this.fmtCurrency(line.actual),
      this.fmtVariance(line.variance_amount),
      this.fmtPct(line.variance_percent),
    ]
    if (settings.show_ytd) {
      row.push(
        this.fmtCurrency(line.ytd_budget),
        this.fmtCurrency(line.ytd_actual),
        this.fmtVariance(line.ytd_variance_amount),
        this.fmtPct(line.ytd_variance_percent)
      )
    }
    if (settings.show_unspent_budget) row.push(this.fmtCurrency(line.unspent_budget))
    if (settings.show_budget_next_month) row.push(this.fmtCurrency(line.budget_next_month))
    if (settings.show_budget_annual_total) row.push(this.fmtCurrency(line.budget_annual_total))
    if (settings.show_prior_year) row.push(line.prior_year !== null ? this.fmtCurrency(line.prior_year) : '—')
    return row
  }

  /** Add page footers to every page at the end */
  private addAllFooters(): void {
    const totalPages = (this.doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i)
      const pw = this.doc.internal.pageSize.getWidth()
      const ph = this.doc.internal.pageSize.getHeight()
      this.doc.setFontSize(7)
      this.doc.setFont('helvetica', 'normal')
      this.doc.setTextColor(150, 150, 150)
      this.doc.text(
        `Generated by Business Coaching Platform | ${new Date().toLocaleDateString('en-AU')} | Page ${i} of ${totalPages}`,
        pw / 2,
        ph - 8,
        { align: 'center' }
      )
    }
    this.doc.setTextColor(0, 0, 0)
  }

  private fmtCurrency(value: number): string {
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return value < 0 ? `-$${formatted}` : `$${formatted}`
  }

  /** Format variance with parentheses for unfavorable (negative) values */
  private fmtVariance(value: number): string {
    const abs = Math.abs(value)
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    if (value < 0) return `($${formatted})`
    return `$${formatted}`
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
