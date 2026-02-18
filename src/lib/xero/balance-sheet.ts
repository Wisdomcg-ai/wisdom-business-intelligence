/**
 * Shared Xero Balance Sheet utilities.
 * Extracted from monthly-report/cashflow route for reuse across cashflow forecast and monthly report.
 */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function parseNumber(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/,/g, '').replace(/[()]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return 0
  if (value.includes('(') && value.includes(')')) return -num
  return num
}

export function classifyBSAccount(section: string, name: string): string {
  const lower = (section + ' ' + name).toLowerCase()

  // Cash & bank
  if (lower.includes('bank') || lower.includes('cash') || lower.includes('petty') ||
      lower.includes('savings') || lower.includes('checking') || lower.includes('cheque')) {
    return 'cash'
  }

  // Receivables
  if (lower.includes('receivable') || lower.includes('debtors') || lower.includes('trade and other receivable')) {
    return 'receivable'
  }

  // Payables
  if (lower.includes('payable') || lower.includes('creditors') || lower.includes('trade and other payable') ||
      lower.includes('accrued') || lower.includes('gst') || lower.includes('tax')) {
    return 'payable'
  }

  // Stock / Inventory
  if (lower.includes('stock') || lower.includes('inventory') || lower.includes('work in progress')) {
    return 'stock'
  }

  // Fixed assets
  if (lower.includes('asset') || lower.includes('property') || lower.includes('equipment') ||
      lower.includes('vehicle') || lower.includes('depreciation') || lower.includes('plant')) {
    return 'fixed_asset'
  }

  // Loans / borrowings
  if (lower.includes('loan') || lower.includes('borrow') || lower.includes('mortgage') ||
      lower.includes('lease liabilit') || lower.includes('hire purchase')) {
    return 'loan'
  }

  // Superannuation payable
  if (lower.includes('super') && lower.includes('payable')) {
    return 'super_payable'
  }

  // PAYG Withholding
  if (lower.includes('payg') && (lower.includes('withhold') || lower.includes('payroll'))) {
    return 'payg_wh'
  }

  // Equity
  if (lower.includes('equity') || lower.includes('retained') || lower.includes('capital') ||
      lower.includes('drawing') || lower.includes('distribution') || lower.includes('owner')) {
    return 'equity'
  }

  // Current liability (other)
  if (section.toLowerCase().includes('liabilit')) return 'other_liability'

  // Current asset (other)
  if (section.toLowerCase().includes('asset')) return 'other_asset'

  return 'other'
}

export function parseBalanceSheetRows(
  rows: any[]
): Map<string, { name: string; type: string; class: string; value: number }> {
  const accounts = new Map<string, { name: string; type: string; class: string; value: number }>()
  let currentSection = ''

  for (const row of rows) {
    if (row.RowType === 'Section') {
      currentSection = row.Title || ''
      for (const subRow of (row.Rows || [])) {
        if (subRow.RowType === 'Row' && subRow.Cells?.length >= 2) {
          const name = subRow.Cells[0]?.Value || ''
          const value = parseNumber(subRow.Cells[1]?.Value)
          if (name && name !== '' && !name.startsWith('Total')) {
            accounts.set(name, { name, type: currentSection, class: classifyBSAccount(currentSection, name), value })
          }
        }
      }
    }
  }

  return accounts
}

/**
 * Fetch Xero Balance Sheet at a given date.
 * Returns parsed account balances grouped by class.
 */
export async function fetchBalanceSheet(
  accessToken: string,
  tenantId: string,
  date: string,
): Promise<Map<string, { name: string; type: string; class: string; value: number }> | null> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${date}`

  let retries = 0
  while (retries < 3) {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    })

    if (res.status === 429) {
      await sleep(10000)
      retries++
      continue
    }

    if (!res.ok) {
      console.error('[BalanceSheet] API error:', res.status)
      return null
    }

    const data = await res.json()
    const report = data.Reports?.[0]
    if (!report?.Rows) return null

    return parseBalanceSheetRows(report.Rows)
  }

  return null
}
