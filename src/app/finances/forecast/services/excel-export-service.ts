import ExcelJS from 'exceljs'
import type { FinancialForecast, PLLine, ForecastEmployee, ForecastScenario } from '../types'

/**
 * Excel Export Service
 * Generates formatted Excel workbook with forecast data
 */

interface ExportData {
  forecast: FinancialForecast
  plLines: PLLine[]
  payrollEmployees: ForecastEmployee[]
  activeScenario?: ForecastScenario
}

export class ExcelExportService {
  private workbook: ExcelJS.Workbook
  private data: ExportData

  constructor(data: ExportData) {
    this.workbook = new ExcelJS.Workbook()
    this.data = data

    this.workbook.creator = 'Business Coaching Platform'
    this.workbook.created = new Date()
    this.workbook.modified = new Date()
  }

  /**
   * Generate complete Excel workbook
   */
  async generate(): Promise<Buffer> {
    // Create all worksheets
    this.createExecutiveSummarySheet()
    this.createAssumptionsSheet()
    this.createPLForecastSheet()
    this.createPayrollSheet()
    this.createVarianceSheet()

    // Generate buffer
    const buffer = await this.workbook.xlsx.writeBuffer()
    return buffer as unknown as Buffer
  }

  /**
   * Executive Summary Sheet
   */
  private createExecutiveSummarySheet(): void {
    const sheet = this.workbook.addWorksheet('Executive Summary', {
      views: [{ state: 'frozen', ySplit: 3 }]
    })

    const { forecast } = this.data

    // Title
    sheet.mergeCells('A1:D1')
    sheet.getCell('A1').value = `Financial Forecast - ${forecast.name || 'Business'}`
    sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF1F2937' } }
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 30

    // Metadata
    sheet.getCell('A2').value = 'Fiscal Year:'
    sheet.getCell('B2').value = forecast.fiscal_year
    sheet.getCell('C2').value = 'Currency:'
    sheet.getCell('D2').value = forecast.currency || 'AUD'

    sheet.getCell('A3').value = 'Period:'
    sheet.getCell('B3').value = `${new Date(forecast.forecast_start_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(forecast.forecast_end_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    sheet.getCell('C3').value = 'Created:'
    sheet.getCell('D3').value = new Date(forecast.created_at || new Date()).toLocaleDateString()

    // Key Metrics
    let row = 5
    sheet.getCell(`A${row}`).value = 'KEY METRICS'
    sheet.getCell(`A${row}`).font = { size: 14, bold: true }
    sheet.getCell(`A${row}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    }
    sheet.mergeCells(`A${row}:D${row}`)
    row++

    // Headers
    const headers = ['Metric', 'Goal', 'Forecast', 'Variance']
    headers.forEach((header, idx) => {
      const cell = sheet.getCell(row, idx + 1)
      cell.value = header
      cell.font = { bold: true }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' }
      }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' }
      }
    })
    row++

    // Calculate totals from P&L lines
    const totals = this.calculateTotals()

    // Revenue
    this.addMetricRow(sheet, row++, 'Revenue', forecast.revenue_goal || 0, totals.revenue)

    // Gross Profit
    this.addMetricRow(sheet, row++, 'Gross Profit', forecast.gross_profit_goal || 0, totals.grossProfit)

    // Net Profit
    this.addMetricRow(sheet, row++, 'Net Profit', forecast.net_profit_goal || 0, totals.netProfit)

    // Gross Margin %
    row++
    sheet.getCell(`A${row}`).value = 'Gross Margin %'
    const goalGM = forecast.revenue_goal ? ((forecast.gross_profit_goal || 0) / forecast.revenue_goal * 100) : 0
    const forecastGM = totals.revenue ? (totals.grossProfit / totals.revenue * 100) : 0
    sheet.getCell(`B${row}`).value = goalGM / 100
    sheet.getCell(`B${row}`).numFmt = '0.0%'
    sheet.getCell(`C${row}`).value = forecastGM / 100
    sheet.getCell(`C${row}`).numFmt = '0.0%'
    sheet.getCell(`D${row}`).value = (forecastGM - goalGM) / 100
    sheet.getCell(`D${row}`).numFmt = '0.0%'

    // Net Margin %
    row++
    sheet.getCell(`A${row}`).value = 'Net Margin %'
    const goalNM = forecast.revenue_goal ? ((forecast.net_profit_goal || 0) / forecast.revenue_goal * 100) : 0
    const forecastNM = totals.revenue ? (totals.netProfit / totals.revenue * 100) : 0
    sheet.getCell(`B${row}`).value = goalNM / 100
    sheet.getCell(`B${row}`).numFmt = '0.0%'
    sheet.getCell(`C${row}`).value = forecastNM / 100
    sheet.getCell(`C${row}`).numFmt = '0.0%'
    sheet.getCell(`D${row}`).value = (forecastNM - goalNM) / 100
    sheet.getCell(`D${row}`).numFmt = '0.0%'

    // Key Assumptions
    row += 2
    sheet.getCell(`A${row}`).value = 'KEY ASSUMPTIONS'
    sheet.getCell(`A${row}`).font = { size: 14, bold: true }
    sheet.getCell(`A${row}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    }
    sheet.mergeCells(`A${row}:D${row}`)
    row++

    const assumptions = [
      ['COGS %', `${forecast.cogs_percentage || 0}%`],
      ['Scenario', this.data.activeScenario?.name || 'Baseline']
    ]

    assumptions.forEach(([label, value]) => {
      sheet.getCell(`A${row}`).value = label
      sheet.getCell(`B${row}`).value = value
      row++
    })

    // Column widths
    sheet.getColumn(1).width = 20
    sheet.getColumn(2).width = 15
    sheet.getColumn(3).width = 15
    sheet.getColumn(4).width = 15
  }

  /**
   * Assumptions Sheet
   */
  private createAssumptionsSheet(): void {
    const sheet = this.workbook.addWorksheet('Assumptions')
    const { forecast } = this.data

    // Title
    sheet.getCell('A1').value = 'Forecast Assumptions'
    sheet.getCell('A1').font = { size: 16, bold: true }
    sheet.getRow(1).height = 25

    let row = 3

    // Financial Goals
    sheet.getCell(`A${row}`).value = 'Financial Goals'
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 }
    row++

    const goals = [
      ['Revenue Goal', forecast.revenue_goal],
      ['Gross Profit Goal', forecast.gross_profit_goal],
      ['Net Profit Goal', forecast.net_profit_goal]
    ]

    goals.forEach(([label, value]) => {
      sheet.getCell(`A${row}`).value = label
      sheet.getCell(`B${row}`).value = value || 0
      sheet.getCell(`B${row}`).numFmt = this.getCurrencyFormat()
      row++
    })

    row++

    // Operating Assumptions
    sheet.getCell(`A${row}`).value = 'Operating Assumptions'
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 }
    row++

    const operating: Array<[string, number, string]> = [
      ['COGS Percentage', forecast.cogs_percentage || 0, '0.0%'],
      ['OpEx Variable %', forecast.opex_variable_percentage || 0, '0.0%']
    ]

    operating.forEach(([label, value, format]) => {
      sheet.getCell(`A${row}`).value = label
      sheet.getCell(`B${row}`).value = value / 100
      sheet.getCell(`B${row}`).numFmt = format
      row++
    })

    row++

    // Data Source
    sheet.getCell(`A${row}`).value = 'Data Source'
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 }
    row++

    sheet.getCell(`A${row}`).value = 'Goal Source'
    sheet.getCell(`B${row}`).value = forecast.goal_source || 'Manual Entry'
    row++

    if (forecast.annual_plan_id) {
      sheet.getCell(`A${row}`).value = 'Linked Annual Plan'
      sheet.getCell(`B${row}`).value = forecast.annual_plan_id
      row++
    }

    // Column widths
    sheet.getColumn(1).width = 30
    sheet.getColumn(2).width = 20
  }

  /**
   * P&L Forecast Sheet (main data)
   */
  private createPLForecastSheet(): void {
    const sheet = this.workbook.addWorksheet('P&L Forecast', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    })

    const { forecast, plLines } = this.data

    // Get month columns
    const startDate = new Date(forecast.forecast_start_month)
    const endDate = new Date(forecast.forecast_end_month)
    const months: Date[] = []

    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      months.push(new Date(d))
    }

    // Title
    sheet.mergeCells(1, 1, 1, months.length + 2)
    sheet.getCell(1, 1).value = 'P&L Forecast'
    sheet.getCell(1, 1).font = { size: 14, bold: true }
    sheet.getCell(1, 1).alignment = { horizontal: 'center' }

    // Headers
    let col = 1
    sheet.getCell(2, col++).value = 'Account'

    months.forEach(month => {
      sheet.getCell(2, col).value = month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      sheet.getCell(2, col).font = { bold: true }
      sheet.getCell(2, col).alignment = { horizontal: 'center' }
      sheet.getCell(2, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' }
      }
      col++
    })

    sheet.getCell(2, col).value = 'Total'
    sheet.getCell(2, col).font = { bold: true }
    sheet.getCell(2, col).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    }

    // Group by category
    const grouped = this.groupLinesByCategory(plLines)
    let row = 3

    // Revenue
    if (grouped.Revenue.length > 0) {
      row = this.addCategorySection(sheet, row, 'Revenue', grouped.Revenue, months, 'FF10B981')
    }

    // COGS
    if (grouped['Cost of Sales'].length > 0) {
      row = this.addCategorySection(sheet, row, 'Cost of Sales', grouped['Cost of Sales'], months, 'FFEF4444')
    }

    // Gross Profit
    row = this.addCalculatedRow(sheet, row, 'Gross Profit', months,
      (monthKey) => this.sumCategory(grouped.Revenue, monthKey) - this.sumCategory(grouped['Cost of Sales'], monthKey),
      'FF3B82F6', true)

    // Operating Expenses
    if (grouped['Operating Expenses'].length > 0) {
      row = this.addCategorySection(sheet, row, 'Operating Expenses', grouped['Operating Expenses'], months, 'FFF59E0B')
    }

    // Net Profit
    row = this.addCalculatedRow(sheet, row, 'Net Profit', months,
      (monthKey) => {
        const revenue = this.sumCategory(grouped.Revenue, monthKey)
        const cogs = this.sumCategory(grouped['Cost of Sales'], monthKey)
        const opex = this.sumCategory(grouped['Operating Expenses'], monthKey)
        return revenue - cogs - opex
      },
      'FF8B5CF6', true)

    // Column widths
    sheet.getColumn(1).width = 30
    for (let i = 2; i <= months.length + 2; i++) {
      sheet.getColumn(i).width = 12
    }
  }

  /**
   * Payroll Sheet
   */
  private createPayrollSheet(): void {
    const sheet = this.workbook.addWorksheet('Payroll Detail')
    const { forecast, payrollEmployees } = this.data

    if (!payrollEmployees || payrollEmployees.length === 0) {
      sheet.getCell('A1').value = 'No payroll data available'
      return
    }

    // Title
    sheet.getCell('A1').value = 'Payroll Forecast Detail'
    sheet.getCell('A1').font = { size: 14, bold: true }

    // Get months
    const startDate = new Date(forecast.forecast_start_month)
    const endDate = new Date(forecast.forecast_end_month)
    const months: Date[] = []

    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      months.push(new Date(d))
    }

    // Headers
    let col = 1
    const headers = ['Employee', 'Role', 'Base Salary', ...months.map(m => m.toLocaleDateString('en-US', { month: 'short' })), 'Total']
    headers.forEach(header => {
      sheet.getCell(2, col).value = header
      sheet.getCell(2, col).font = { bold: true }
      sheet.getCell(2, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' }
      }
      col++
    })

    // Data rows
    let row = 3
    payrollEmployees.forEach(employee => {
      col = 1
      sheet.getCell(row, col++).value = employee.employee_name
      sheet.getCell(row, col++).value = employee.position || ''

      sheet.getCell(row, col).value = employee.annual_salary || 0
      sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
      col++

      // Monthly values - calculate from annual salary
      let annualTotal = 0
      const monthlySalary = (employee.annual_salary || 0) / 12
      months.forEach(() => {
        sheet.getCell(row, col).value = monthlySalary
        sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
        annualTotal += monthlySalary
        col++
      })

      // Total
      sheet.getCell(row, col).value = annualTotal
      sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
      sheet.getCell(row, col).font = { bold: true }

      row++
    })

    // Column widths
    sheet.getColumn(1).width = 25
    sheet.getColumn(2).width = 20
    sheet.getColumn(3).width = 12
  }

  /**
   * Variance Analysis Sheet
   */
  private createVarianceSheet(): void {
    const sheet = this.workbook.addWorksheet('Variance Analysis')
    const { forecast } = this.data

    // Title
    sheet.getCell('A1').value = 'Variance Analysis: Goals vs Forecast'
    sheet.getCell('A1').font = { size: 14, bold: true }

    // Headers
    const headers = ['Metric', 'Goal', 'Forecast', 'Variance', 'Variance %']
    headers.forEach((header, idx) => {
      sheet.getCell(3, idx + 1).value = header
      sheet.getCell(3, idx + 1).font = { bold: true }
      sheet.getCell(3, idx + 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' }
      }
    })

    const totals = this.calculateTotals()

    let row = 4

    // Revenue
    this.addVarianceRow(sheet, row++, 'Revenue', forecast.revenue_goal || 0, totals.revenue)

    // Gross Profit
    this.addVarianceRow(sheet, row++, 'Gross Profit', forecast.gross_profit_goal || 0, totals.grossProfit)

    // Net Profit
    this.addVarianceRow(sheet, row++, 'Net Profit', forecast.net_profit_goal || 0, totals.netProfit)

    // Conditional formatting for variance %
    sheet.getColumn(5).eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum > 3 && typeof cell.value === 'number') {
        if (cell.value < -0.05) {
          cell.font = { color: { argb: 'FFDC2626' }, bold: true }
        } else if (cell.value > 0.05) {
          cell.font = { color: { argb: 'FF16A34A' }, bold: true }
        }
      }
    })

    // Column widths
    sheet.getColumn(1).width = 20
    sheet.getColumn(2).width = 15
    sheet.getColumn(3).width = 15
    sheet.getColumn(4).width = 15
    sheet.getColumn(5).width = 12
  }

  // ===== Helper Methods =====

  private addMetricRow(sheet: ExcelJS.Worksheet, row: number, label: string, goal: number, forecast: number): void {
    sheet.getCell(row, 1).value = label

    sheet.getCell(row, 2).value = goal
    sheet.getCell(row, 2).numFmt = this.getCurrencyFormat()

    sheet.getCell(row, 3).value = forecast
    sheet.getCell(row, 3).numFmt = this.getCurrencyFormat()

    const variance = forecast - goal
    sheet.getCell(row, 4).value = variance
    sheet.getCell(row, 4).numFmt = this.getCurrencyFormat()

    // Color code variance
    if (variance < 0) {
      sheet.getCell(row, 4).font = { color: { argb: 'FFDC2626' } }
    } else if (variance > 0) {
      sheet.getCell(row, 4).font = { color: { argb: 'FF16A34A' } }
    }
  }

  private addVarianceRow(sheet: ExcelJS.Worksheet, row: number, label: string, goal: number, forecast: number): void {
    sheet.getCell(row, 1).value = label

    sheet.getCell(row, 2).value = goal
    sheet.getCell(row, 2).numFmt = this.getCurrencyFormat()

    sheet.getCell(row, 3).value = forecast
    sheet.getCell(row, 3).numFmt = this.getCurrencyFormat()

    const variance = forecast - goal
    sheet.getCell(row, 4).value = variance
    sheet.getCell(row, 4).numFmt = this.getCurrencyFormat()

    const variancePct = goal !== 0 ? variance / goal : 0
    sheet.getCell(row, 5).value = variancePct
    sheet.getCell(row, 5).numFmt = '0.0%'
  }

  private addCategorySection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    categoryName: string,
    lines: PLLine[],
    months: Date[],
    headerColor: string
  ): number {
    let row = startRow

    // Category header
    sheet.getCell(row, 1).value = categoryName
    sheet.getCell(row, 1).font = { bold: true, size: 11 }
    sheet.getCell(row, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor }
    }
    sheet.mergeCells(row, 1, row, months.length + 2)
    row++

    // Lines
    lines.forEach(line => {
      let col = 1
      sheet.getCell(row, col++).value = `  ${line.account_name}`

      let lineTotal = 0
      months.forEach(month => {
        const monthKey = this.getMonthKey(month)
        const value = line.forecast_months?.[monthKey] || 0
        sheet.getCell(row, col).value = value
        sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
        lineTotal += value
        col++
      })

      sheet.getCell(row, col).value = lineTotal
      sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
      sheet.getCell(row, col).font = { bold: true }

      row++
    })

    // Subtotal
    sheet.getCell(row, 1).value = `Total ${categoryName}`
    sheet.getCell(row, 1).font = { bold: true }

    let col = 2
    months.forEach(month => {
      const monthKey = this.getMonthKey(month)
      const total = this.sumCategory(lines, monthKey)
      sheet.getCell(row, col).value = total
      sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
      sheet.getCell(row, col).font = { bold: true }
      sheet.getCell(row, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }
      }
      col++
    })

    const categoryTotal = lines.reduce((sum, line) => {
      return sum + Object.values(line.forecast_months || {}).reduce((s, v) => s + (v || 0), 0)
    }, 0)
    sheet.getCell(row, col).value = categoryTotal
    sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
    sheet.getCell(row, col).font = { bold: true }
    sheet.getCell(row, col).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FAFB' }
    }

    row++
    return row
  }

  private addCalculatedRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    label: string,
    months: Date[],
    calculateValue: (monthKey: string) => number,
    bgColor: string,
    isBold: boolean = false
  ): number {
    sheet.getCell(row, 1).value = label
    sheet.getCell(row, 1).font = { bold: isBold, size: 11 }
    sheet.getCell(row, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    }

    let col = 2
    let totalValue = 0

    months.forEach(month => {
      const monthKey = this.getMonthKey(month)
      const value = calculateValue(monthKey)
      sheet.getCell(row, col).value = value
      sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
      sheet.getCell(row, col).font = { bold: isBold }
      sheet.getCell(row, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor }
      }
      totalValue += value
      col++
    })

    sheet.getCell(row, col).value = totalValue
    sheet.getCell(row, col).numFmt = this.getCurrencyFormat()
    sheet.getCell(row, col).font = { bold: true }
    sheet.getCell(row, col).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    }

    row++
    return row
  }

  private calculateTotals() {
    const { plLines } = this.data

    let revenue = 0
    let cogs = 0
    let opex = 0

    plLines.forEach(line => {
      const lineTotal = Object.values(line.forecast_months || {}).reduce((sum, val) => sum + (val || 0), 0)

      if (line.category === 'Revenue') {
        revenue += lineTotal
      } else if (line.category === 'Cost of Sales') {
        cogs += lineTotal
      } else if (line.category === 'Operating Expenses') {
        opex += lineTotal
      }
    })

    return {
      revenue,
      cogs,
      opex,
      grossProfit: revenue - cogs,
      netProfit: revenue - cogs - opex
    }
  }

  private groupLinesByCategory(lines: PLLine[]) {
    return {
      Revenue: lines.filter(l => l.category === 'Revenue'),
      'Cost of Sales': lines.filter(l => l.category === 'Cost of Sales'),
      'Operating Expenses': lines.filter(l => l.category === 'Operating Expenses')
    }
  }

  private sumCategory(lines: PLLine[], monthKey: string): number {
    return lines.reduce((sum, line) => sum + (line.forecast_months?.[monthKey] || 0), 0)
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  private getCurrencyFormat(): string {
    const currency = this.data.forecast.currency || 'AUD'
    const symbols: Record<string, string> = {
      'AUD': '$',
      'USD': '$',
      'NZD': '$',
      'GBP': '£',
      'EUR': '€'
    }
    const symbol = symbols[currency] || '$'
    return `${symbol}#,##0.00`
  }
}
