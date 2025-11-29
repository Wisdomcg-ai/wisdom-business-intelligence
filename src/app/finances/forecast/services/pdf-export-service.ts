import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { FinancialForecast, PLLine, ForecastScenario } from '../types'

/**
 * PDF Export Service
 * Generates professional PDF reports for financial forecasts
 */

interface ExportData {
  forecast: FinancialForecast
  plLines: PLLine[]
  activeScenario?: ForecastScenario
}

export class PDFExportService {
  private doc: jsPDF
  private data: ExportData
  private pageWidth: number
  private pageHeight: number
  private margin: number = 20
  private yPosition: number = 20

  constructor(data: ExportData) {
    this.doc = new jsPDF('portrait', 'mm', 'a4')
    this.data = data
    this.pageWidth = this.doc.internal.pageSize.getWidth()
    this.pageHeight = this.doc.internal.pageSize.getHeight()
  }

  /**
   * Generate complete PDF
   */
  generate(): jsPDF {
    this.addExecutiveSummary()
    this.addDetailedPL()
    this.addAssumptions()

    return this.doc
  }

  /**
   * Executive Summary (Page 1)
   */
  private addExecutiveSummary(): void {
    const { forecast } = this.data

    // Header with business name
    this.doc.setFontSize(20)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Financial Forecast', this.pageWidth / 2, this.yPosition, { align: 'center' })
    this.yPosition += 8

    this.doc.setFontSize(14)
    this.doc.text(forecast.business_name || 'Business', this.pageWidth / 2, this.yPosition, { align: 'center' })
    this.yPosition += 12

    // Metadata
    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'normal')
    const metadata = [
      `Fiscal Year: ${forecast.fiscal_year}`,
      `Period: ${new Date(forecast.forecast_start_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(forecast.forecast_end_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      `Currency: ${forecast.currency || 'AUD'}`,
      `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    ]

    metadata.forEach(line => {
      this.doc.text(line, this.pageWidth / 2, this.yPosition, { align: 'center' })
      this.yPosition += 5
    })

    this.yPosition += 5

    // Horizontal line
    this.doc.setDrawColor(200, 200, 200)
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition)
    this.yPosition += 10

    // Key Metrics Section
    this.doc.setFontSize(14)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Key Financial Metrics', this.margin, this.yPosition)
    this.yPosition += 8

    // Calculate totals
    const totals = this.calculateTotals()

    // Metrics Table
    const metricsData = [
      ['Revenue', this.formatCurrency(forecast.revenue_goal || 0), this.formatCurrency(totals.revenue), this.formatCurrency(totals.revenue - (forecast.revenue_goal || 0))],
      ['Gross Profit', this.formatCurrency(forecast.gross_profit_goal || 0), this.formatCurrency(totals.grossProfit), this.formatCurrency(totals.grossProfit - (forecast.gross_profit_goal || 0))],
      ['Net Profit', this.formatCurrency(forecast.net_profit_goal || 0), this.formatCurrency(totals.netProfit), this.formatCurrency(totals.netProfit - (forecast.net_profit_goal || 0))]
    ]

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Metric', 'Goal', 'Forecast', 'Variance']],
      body: metricsData,
      theme: 'grid',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const value = metricsData[data.row.index][3]
          if (value.startsWith('-')) {
            data.cell.styles.textColor = [220, 38, 38] // Red
          } else if (value !== this.formatCurrency(0)) {
            data.cell.styles.textColor = [22, 163, 74] // Green
          }
        }
      }
    })

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 10

    // Margin Percentages
    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Margin Analysis', this.margin, this.yPosition)
    this.yPosition += 6

    const goalGrossMargin = forecast.revenue_goal ? ((forecast.gross_profit_goal || 0) / forecast.revenue_goal * 100) : 0
    const forecastGrossMargin = totals.revenue ? (totals.grossProfit / totals.revenue * 100) : 0
    const goalNetMargin = forecast.revenue_goal ? ((forecast.net_profit_goal || 0) / forecast.revenue_goal * 100) : 0
    const forecastNetMargin = totals.revenue ? (totals.netProfit / totals.revenue * 100) : 0

    const marginData = [
      ['Gross Margin', `${goalGrossMargin.toFixed(1)}%`, `${forecastGrossMargin.toFixed(1)}%`, `${(forecastGrossMargin - goalGrossMargin).toFixed(1)}%`],
      ['Net Margin', `${goalNetMargin.toFixed(1)}%`, `${forecastNetMargin.toFixed(1)}%`, `${(forecastNetMargin - goalNetMargin).toFixed(1)}%`]
    ]

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Metric', 'Goal', 'Forecast', 'Variance']],
      body: marginData,
      theme: 'grid',
      headStyles: {
        fillColor: [139, 92, 246],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    })

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 12

    // Key Assumptions
    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Key Assumptions', this.margin, this.yPosition)
    this.yPosition += 6

    this.doc.setFontSize(10)
    this.doc.setFont('helvetica', 'normal')

    const assumptions = [
      `COGS Percentage: ${forecast.cogs_percentage || 0}%`,
      `Growth Rate: ${forecast.growth_rate || 0}%`,
      `Scenario: ${this.data.activeScenario?.name || 'Baseline'}`,
      `Goal Source: ${forecast.goal_source || 'Manual Entry'}`
    ]

    assumptions.forEach(line => {
      this.doc.text(`• ${line}`, this.margin + 5, this.yPosition)
      this.yPosition += 5
    })

    // Footer
    this.addFooter(1)
  }

  /**
   * Detailed P&L (Page 2+)
   */
  private addDetailedPL(): void {
    this.doc.addPage()
    this.yPosition = this.margin

    const { forecast, plLines } = this.data

    // Title
    this.doc.setFontSize(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Detailed P&L Forecast', this.margin, this.yPosition)
    this.yPosition += 10

    // Get quarterly data for better readability
    const quarters = this.getQuarterlyData(forecast, plLines)

    // Group by category
    const grouped = this.groupLinesByCategory(plLines)

    // Prepare table data
    const tableData: any[] = []

    // Revenue Section
    if (grouped.Revenue.length > 0) {
      tableData.push([
        { content: 'Revenue', colSpan: 5, styles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' } }
      ])
      grouped.Revenue.forEach(line => {
        tableData.push([
          `  ${line.account_name}`,
          this.formatCurrency(quarters.Q1.revenue[line.id] || 0),
          this.formatCurrency(quarters.Q2.revenue[line.id] || 0),
          this.formatCurrency(quarters.Q3.revenue[line.id] || 0),
          this.formatCurrency(quarters.Q4.revenue[line.id] || 0)
        ])
      })
      tableData.push([
        { content: 'Total Revenue', styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q1.totalRevenue), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q2.totalRevenue), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q3.totalRevenue), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q4.totalRevenue), styles: { fontStyle: 'bold' } }
      ])
    }

    // COGS Section
    if (grouped['Cost of Sales'].length > 0) {
      tableData.push([
        { content: 'Cost of Sales', colSpan: 5, styles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' } }
      ])
      grouped['Cost of Sales'].forEach(line => {
        tableData.push([
          `  ${line.account_name}`,
          this.formatCurrency(quarters.Q1.cogs[line.id] || 0),
          this.formatCurrency(quarters.Q2.cogs[line.id] || 0),
          this.formatCurrency(quarters.Q3.cogs[line.id] || 0),
          this.formatCurrency(quarters.Q4.cogs[line.id] || 0)
        ])
      })
      tableData.push([
        { content: 'Total COGS', styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q1.totalCOGS), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q2.totalCOGS), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q3.totalCOGS), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q4.totalCOGS), styles: { fontStyle: 'bold' } }
      ])
      tableData.push([
        { content: 'Gross Profit', styles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q1.totalRevenue - quarters.Q1.totalCOGS), styles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q2.totalRevenue - quarters.Q2.totalCOGS), styles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q3.totalRevenue - quarters.Q3.totalCOGS), styles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q4.totalRevenue - quarters.Q4.totalCOGS), styles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' } }
      ])
    }

    // OpEx Section
    if (grouped['Operating Expenses'].length > 0) {
      tableData.push([
        { content: 'Operating Expenses', colSpan: 5, styles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' } }
      ])
      grouped['Operating Expenses'].forEach(line => {
        tableData.push([
          `  ${line.account_name}`,
          this.formatCurrency(quarters.Q1.opex[line.id] || 0),
          this.formatCurrency(quarters.Q2.opex[line.id] || 0),
          this.formatCurrency(quarters.Q3.opex[line.id] || 0),
          this.formatCurrency(quarters.Q4.opex[line.id] || 0)
        ])
      })
      tableData.push([
        { content: 'Total OpEx', styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q1.totalOpEx), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q2.totalOpEx), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q3.totalOpEx), styles: { fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q4.totalOpEx), styles: { fontStyle: 'bold' } }
      ])
      tableData.push([
        { content: 'Net Profit', styles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q1.totalRevenue - quarters.Q1.totalCOGS - quarters.Q1.totalOpEx), styles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q2.totalRevenue - quarters.Q2.totalCOGS - quarters.Q2.totalOpEx), styles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q3.totalRevenue - quarters.Q3.totalCOGS - quarters.Q3.totalOpEx), styles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' } },
        { content: this.formatCurrency(quarters.Q4.totalRevenue - quarters.Q4.totalCOGS - quarters.Q4.totalOpEx), styles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' } }
      ])
    }

    // Render table
    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Account', 'Q1', 'Q2', 'Q3', 'Q4']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [75, 85, 99],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'right', cellWidth: 27 },
        2: { halign: 'right', cellWidth: 27 },
        3: { halign: 'right', cellWidth: 27 },
        4: { halign: 'right', cellWidth: 27 }
      },
      margin: { left: this.margin, right: this.margin }
    })

    this.addFooter(2)
  }

  /**
   * Assumptions Detail (Page 3)
   */
  private addAssumptions(): void {
    this.doc.addPage()
    this.yPosition = this.margin

    const { forecast } = this.data

    // Title
    this.doc.setFontSize(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Forecast Assumptions', this.margin, this.yPosition)
    this.yPosition += 12

    // Financial Goals
    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Financial Goals', this.margin, this.yPosition)
    this.yPosition += 6

    const goalsData = [
      ['Revenue Goal', this.formatCurrency(forecast.revenue_goal || 0)],
      ['Gross Profit Goal', this.formatCurrency(forecast.gross_profit_goal || 0)],
      ['Net Profit Goal', this.formatCurrency(forecast.net_profit_goal || 0)]
    ]

    autoTable(this.doc, {
      startY: this.yPosition,
      body: goalsData,
      theme: 'plain',
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 80 },
        1: { halign: 'right', cellWidth: 60 }
      }
    })

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 10

    // Operating Assumptions
    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text('Operating Assumptions', this.margin, this.yPosition)
    this.yPosition += 6

    const operatingData = [
      ['COGS Percentage', `${forecast.cogs_percentage || 0}%`],
      ['Growth Rate', `${forecast.growth_rate || 0}%`],
      ['Seasonal Adjustment', `${forecast.seasonal_adjustment || 0}%`]
    ]

    autoTable(this.doc, {
      startY: this.yPosition,
      body: operatingData,
      theme: 'plain',
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 80 },
        1: { halign: 'right', cellWidth: 60 }
      }
    })

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 10

    // Scenario Information
    if (this.data.activeScenario) {
      this.doc.setFontSize(12)
      this.doc.setFont('helvetica', 'bold')
      this.doc.text('Active Scenario', this.margin, this.yPosition)
      this.yPosition += 6

      const scenarioData = [
        ['Name', this.data.activeScenario.name],
        ['Revenue Multiplier', `${(this.data.activeScenario.revenue_multiplier * 100).toFixed(0)}%`],
        ['COGS Multiplier', `${(this.data.activeScenario.cogs_multiplier * 100).toFixed(0)}%`],
        ['OpEx Multiplier', `${(this.data.activeScenario.opex_multiplier * 100).toFixed(0)}%`]
      ]

      autoTable(this.doc, {
        startY: this.yPosition,
        body: scenarioData,
        theme: 'plain',
        bodyStyles: {
          fontSize: 10
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 80 },
          1: { halign: 'right', cellWidth: 60 }
        }
      })
    }

    this.addFooter(3)
  }

  // ===== Helper Methods =====

  private addFooter(pageNum: number): void {
    this.doc.setFontSize(8)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setTextColor(150, 150, 150)
    this.doc.text(
      `Page ${pageNum} • Generated by Business Coaching Platform • ${new Date().toLocaleDateString()}`,
      this.pageWidth / 2,
      this.pageHeight - 10,
      { align: 'center' }
    )
    this.doc.setTextColor(0, 0, 0)
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

  private getQuarterlyData(forecast: FinancialForecast, plLines: ForecastPLLine[]) {
    const startDate = new Date(forecast.forecast_start_month)
    const startMonth = startDate.getMonth()
    const startYear = startDate.getFullYear()

    const quarters = {
      Q1: { revenue: {} as Record<string, number>, cogs: {} as Record<string, number>, opex: {} as Record<string, number>, totalRevenue: 0, totalCOGS: 0, totalOpEx: 0 },
      Q2: { revenue: {} as Record<string, number>, cogs: {} as Record<string, number>, opex: {} as Record<string, number>, totalRevenue: 0, totalCOGS: 0, totalOpEx: 0 },
      Q3: { revenue: {} as Record<string, number>, cogs: {} as Record<string, number>, opex: {} as Record<string, number>, totalRevenue: 0, totalCOGS: 0, totalOpEx: 0 },
      Q4: { revenue: {} as Record<string, number>, cogs: {} as Record<string, number>, opex: {} as Record<string, number>, totalRevenue: 0, totalCOGS: 0, totalOpEx: 0 }
    }

    plLines.forEach(line => {
      for (let m = 0; m < 12; m++) {
        const month = (startMonth + m) % 12
        const year = startYear + Math.floor((startMonth + m) / 12)
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
        const value = line.forecast_months?.[monthKey] || 0

        const quarter = Math.floor(m / 3)
        const qKey = `Q${quarter + 1}` as keyof typeof quarters

        if (line.category === 'Revenue') {
          quarters[qKey].revenue[line.id] = (quarters[qKey].revenue[line.id] || 0) + value
          quarters[qKey].totalRevenue += value
        } else if (line.category === 'Cost of Sales') {
          quarters[qKey].cogs[line.id] = (quarters[qKey].cogs[line.id] || 0) + value
          quarters[qKey].totalCOGS += value
        } else if (line.category === 'Operating Expenses') {
          quarters[qKey].opex[line.id] = (quarters[qKey].opex[line.id] || 0) + value
          quarters[qKey].totalOpEx += value
        }
      }
    })

    return quarters
  }

  private groupLinesByCategory(lines: ForecastPLLine[]) {
    return {
      Revenue: lines.filter(l => l.category === 'Revenue'),
      'Cost of Sales': lines.filter(l => l.category === 'Cost of Sales'),
      'Operating Expenses': lines.filter(l => l.category === 'Operating Expenses')
    }
  }

  private formatCurrency(value: number): string {
    const currency = this.data.forecast.currency || 'AUD'
    const symbols: Record<string, string> = {
      'AUD': '$',
      'USD': '$',
      'NZD': '$',
      'GBP': '£',
      'EUR': '€'
    }
    const symbol = symbols[currency] || '$'

    const absValue = Math.abs(value)
    const formatted = absValue.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })

    return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`
  }
}
