import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { GeneratedReport, ReportSection, ReportLine, MonthlyReportSettings, VarianceCommentary, FullYearReport, SubscriptionDetailData, WagesDetailData } from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'

interface PDFOptions {
  commentary?: VarianceCommentary
  fullYearReport?: FullYearReport
  subscriptionDetail?: SubscriptionDetailData
  wagesDetail?: WagesDetailData
  cashflowForecast?: CashflowForecastData
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

  constructor(report: GeneratedReport, options?: PDFOptions) {
    // Start portrait — first page is executive summary
    this.doc = new jsPDF('portrait', 'mm', 'a4')
    this.report = report
    this.options = options || {}
    this.pageWidth = A4_SHORT
    this.pageHeight = A4_LONG
  }

  generate(): jsPDF {
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
    }
    if (this.options.fullYearReport) {
      this.addFullYearProjection()
    }
    this.addAllFooters()
    return this.doc
  }

  /** Add a new page with the specified orientation and update dimensions */
  private addPage(orientation: 'portrait' | 'landscape'): void {
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

    // DRAFT watermark
    if (report.is_draft) {
      this.doc.setFontSize(60)
      this.doc.setTextColor(255, 200, 200)
      this.doc.text('DRAFT', this.pageWidth / 2, this.pageHeight / 2, { align: 'center', angle: 30 })
      this.doc.setTextColor(0, 0, 0)
    }

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

    if (this.report.is_draft) {
      this.doc.setFontSize(60)
      this.doc.setTextColor(255, 200, 200)
      this.doc.text('DRAFT', this.pageWidth / 2, this.pageHeight / 2, { align: 'center', angle: 30 })
      this.doc.setTextColor(0, 0, 0)
    }

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
