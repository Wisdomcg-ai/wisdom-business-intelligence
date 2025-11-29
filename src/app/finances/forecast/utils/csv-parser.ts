import type { PLLine } from '../types'

export interface ParsedCSVData {
  accounts: Array<{
    accountName: string
    category: string
    months: { [monthKey: string]: number }
  }>
  monthKeys: string[]
  startMonth: string
  endMonth: string
  totalAccounts: number
}

export interface CSVParseResult {
  success: boolean
  data?: ParsedCSVData
  error?: string
}

/**
 * Parse a Xero P&L CSV export into structured data
 * Expected format:
 * Account Name,Category,Jul 2024,Aug 2024,...
 * Sales,Revenue,21250,18500,...
 */
export function parseXeroCSV(csvText: string): CSVParseResult {
  try {
    const lines = csvText.trim().split('\n')

    if (lines.length < 2) {
      return {
        success: false,
        error: 'CSV file is empty or has no data rows'
      }
    }

    // Parse header row
    const headerRow = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''))

    // Validate required columns
    if (!headerRow.includes('Account Name') || !headerRow.includes('Category')) {
      return {
        success: false,
        error: 'CSV must have "Account Name" and "Category" columns'
      }
    }

    // Extract month columns (everything after Category)
    const categoryIndex = headerRow.indexOf('Category')
    const monthHeaders = headerRow.slice(categoryIndex + 1)

    if (monthHeaders.length === 0) {
      return {
        success: false,
        error: 'No month columns found in CSV'
      }
    }

    // Convert month headers to YYYY-MM format
    const monthKeys = parseMonthHeaders(monthHeaders)

    if (monthKeys.length === 0) {
      return {
        success: false,
        error: 'Could not parse month headers. Expected format: "Jan 2024", "Feb 2024", etc.'
      }
    }

    // Parse data rows
    const accounts: ParsedCSVData['accounts'] = []

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim().replace(/['"]/g, ''))

      if (row.length < 2) continue // Skip empty rows

      const accountName = row[0]
      const category = row[1]

      // Skip total/summary rows
      if (accountName.toLowerCase().includes('total') ||
          accountName.toLowerCase().includes('summary') ||
          !accountName) {
        continue
      }

      // Parse month values
      const months: { [monthKey: string]: number } = {}
      const monthValues = row.slice(categoryIndex + 1)

      monthKeys.forEach((monthKey, index) => {
        if (index < monthValues.length) {
          const value = parseFloat(monthValues[index].replace(/[,$]/g, ''))
          months[monthKey] = isNaN(value) ? 0 : Math.abs(value) // Use absolute values
        }
      })

      accounts.push({
        accountName,
        category: mapCategory(category),
        months
      })
    }

    if (accounts.length === 0) {
      return {
        success: false,
        error: 'No valid account data found in CSV'
      }
    }

    return {
      success: true,
      data: {
        accounts,
        monthKeys,
        startMonth: monthKeys[0],
        endMonth: monthKeys[monthKeys.length - 1],
        totalAccounts: accounts.length
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse CSV file'
    }
  }
}

/**
 * Parse month headers like "Jan 2024", "Feb 2024" into "2024-01", "2024-02"
 */
function parseMonthHeaders(headers: string[]): string[] {
  const monthMap: { [key: string]: string } = {
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
    'sep': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12'
  }

  return headers
    .map(header => {
      // Match patterns like "Jan 2024", "January 2024", "Jan-24", "01/2024"
      const match = header.match(/([a-z]+)\s*[-/]?\s*(\d{2,4})/i)

      if (match) {
        const monthName = match[1].toLowerCase()
        let year = match[2]

        // Convert 2-digit year to 4-digit
        if (year.length === 2) {
          const yearNum = parseInt(year)
          year = yearNum > 50 ? `19${year}` : `20${year}`
        }

        const monthNum = monthMap[monthName]
        if (monthNum) {
          return `${year}-${monthNum}`
        }
      }

      return ''
    })
    .filter(m => m !== '')
}

/**
 * Map Xero categories to our system categories
 */
function mapCategory(xeroCategory: string): string {
  const category = xeroCategory.toLowerCase()

  if (category.includes('revenue') || category.includes('income') || category.includes('sales')) {
    return 'Revenue'
  }

  if (category.includes('cost of sales') || category.includes('cogs') || category.includes('cost of goods')) {
    return 'Cost of Sales'
  }

  if (category.includes('expense') || category.includes('operating')) {
    return 'Operating Expenses'
  }

  // Default to Operating Expenses for unknown categories
  return 'Operating Expenses'
}

/**
 * Convert parsed CSV data to PLLine format
 */
export function convertToPLLines(
  parsedData: ParsedCSVData,
  forecastId: string,
  isBaseline: boolean
): PLLine[] {
  return parsedData.accounts.map((account, index) => {
    const plLine: PLLine = {
      forecast_id: forecastId,
      account_name: account.accountName,
      category: account.category as 'Revenue' | 'Cost of Sales' | 'Operating Expenses',
      sort_order: index,
      actual_months: isBaseline ? account.months : {},
      forecast_months: {},
      is_manual: false,
      is_from_xero: false // Marking as manual CSV import
    }

    // If not baseline, these are current year actuals
    if (!isBaseline) {
      plLine.actual_months = account.months
    }

    return plLine
  })
}
