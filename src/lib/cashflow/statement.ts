/**
 * Cashflow Statement builder — Phase 28.4
 *
 * Produces an AASB 107 / IAS 7 compliant Cashflow Statement (indirect method)
 * from actual data: P&L + balance sheet month-over-month movements + classifications.
 *
 * Sections:
 * - Operating Activities: Net Profit + non-cash add-backs + movement in operating BS items
 * - Investing Activities: Fixed asset purchases/sales, long-term investments
 * - Financing Activities: Loan drawdowns/repayments, equity movements, dividends
 *
 * Reconciles: Net change in cash = Closing cash - Opening cash
 */

export type ListType = 'Operating' | 'Investing' | 'Financing' | 'NonCash' | 'Unassigned'

export interface StatementClassification {
  xero_account_id: string
  account_code: string | null
  account_name: string
  account_type: string | null   // Asset | Liability | Equity
  list_type: ListType
}

export interface BalanceSheetSnapshot {
  /** month key "YYYY-MM" */
  month: string
  /** xero_account_id → balance as of month end */
  balancesByAccount: Record<string, number>
  /** total of all bank accounts at month end */
  bankTotal: number
}

export interface StatementLineItem {
  label: string
  account_code: string | null
  account_name: string
  movement: number      // signed: positive = inflow, negative = outflow
  list_type: ListType
}

export interface CashflowStatement {
  period: { from: string; to: string }

  /** Sum of monthly net profits from the P&L for the period */
  net_profit: number

  /** Non-cash add-backs (depreciation, amortisation) */
  noncash_addbacks: number
  noncash_lines: StatementLineItem[]

  /** Operating working capital movements */
  operating_movements: StatementLineItem[]

  /** Total cash from operating activities */
  net_cash_from_operating: number

  investing_movements: StatementLineItem[]
  net_cash_from_investing: number

  financing_movements: StatementLineItem[]
  net_cash_from_financing: number

  /** Net change in cash (operating + investing + financing) */
  net_change_in_cash: number

  /** Opening bank balance at start of period */
  opening_cash: number

  /** Closing bank balance at end of period */
  closing_cash: number

  /** True when (closing - opening) reconciles to (op + inv + fin) within $0.01 */
  reconciles: boolean

  /** How many accounts are in the Unassigned list — warn when > 0 */
  unassigned_accounts: number
}

/**
 * Sign convention for balance sheet movements, per AASB 107:
 *
 * Operating (Asset):    Asset ↑ = cash OUTFLOW  (sign: -)
 * Operating (Liability): Liability ↑ = cash INFLOW (sign: +)
 * Investing (Asset):    Asset ↑ = cash OUTFLOW  (sign: -)  (e.g., buying fixed assets)
 * Investing (Liability): rare — handled as outflow if debit balance
 * Financing (Asset):    rare
 * Financing (Liability): Liability ↑ = cash INFLOW (loan drawdown)
 * Financing (Equity):   Equity ↑ = cash INFLOW (capital raise)
 */
function movementSign(accountType: string | null | undefined, listType: ListType): 1 | -1 {
  const t = (accountType ?? '').toLowerCase()

  // Operating working capital
  if (listType === 'Operating') {
    if (t.includes('asset')) return -1    // asset ↑ = outflow
    if (t.includes('liab') || t.includes('equity')) return +1  // liability ↑ = inflow
    return +1  // default
  }

  // Investing: asset purchase = outflow
  if (listType === 'Investing') {
    if (t.includes('asset')) return -1
    if (t.includes('liab') || t.includes('equity')) return +1
    return -1
  }

  // Financing: loan drawdown = inflow, repayment = outflow
  if (listType === 'Financing') {
    if (t.includes('liab') || t.includes('equity')) return +1
    if (t.includes('asset')) return -1
    return +1
  }

  return +1
}

/**
 * Auto-classify a balance sheet account based on its Xero type.
 * Coach can override via the classification UI.
 */
export function autoClassify(xeroType: string | null | undefined): ListType {
  const t = (xeroType ?? '').toUpperCase()
  if (t === 'BANK') return 'Unassigned'  // Bank doesn't appear in statement lines — it's the opening/closing
  if (t === 'CURRENT' || t === 'CURRLIAB' || t === 'PREPAYMENT') return 'Operating'
  if (t === 'FIXED' || t === 'NONCURRENT' || t === 'INVENTORY') return 'Investing'
  if (t === 'TERMLIAB' || t === 'LIABILITY') return 'Financing'
  if (t === 'EQUITY') return 'Financing'
  if (t === 'DEPRECIATN' || t === 'AMORTISATION') return 'NonCash'
  return 'Unassigned'
}

/**
 * Build an AASB 107 Cashflow Statement from actual data.
 *
 * @param period                 { from, to } as YYYY-MM
 * @param netProfitTotal         total net profit from P&L for period (Revenue - Expenses)
 * @param depreciationAddback    total depreciation expense for period (added back)
 * @param balancesByMonth        balance sheet snapshots keyed by month
 * @param classifications        per-account list_type assignments
 * @returns                      CashflowStatement
 */
export function buildCashflowStatement(args: {
  period: { from: string; to: string }
  netProfitTotal: number
  depreciationAddback: number
  balancesByMonth: Record<string, BalanceSheetSnapshot>
  classifications: StatementClassification[]
}): CashflowStatement {
  const { period, netProfitTotal, depreciationAddback, balancesByMonth, classifications } = args

  const fromSnap = balancesByMonth[period.from]
  const toSnap = balancesByMonth[period.to]
  const openingCash = fromSnap?.bankTotal ?? 0
  const closingCash = toSnap?.bankTotal ?? 0
  const netChangeInCash = closingCash - openingCash

  // For each classified account, compute opening vs closing balance delta.
  const operatingLines: StatementLineItem[] = []
  const investingLines: StatementLineItem[] = []
  const financingLines: StatementLineItem[] = []
  const noncashLines: StatementLineItem[] = []

  let unassignedCount = 0

  for (const c of classifications) {
    if (c.list_type === 'Unassigned') {
      unassignedCount += 1
      continue
    }

    const opening = fromSnap?.balancesByAccount[c.xero_account_id] ?? 0
    const closing = toSnap?.balancesByAccount[c.xero_account_id] ?? 0
    const rawDelta = closing - opening
    if (Math.abs(rawDelta) < 0.01) continue

    const sign = movementSign(c.account_type, c.list_type)
    const movement = rawDelta * sign

    const item: StatementLineItem = {
      label: c.account_code ? `${c.account_code} ${c.account_name}` : c.account_name,
      account_code: c.account_code,
      account_name: c.account_name,
      movement: Math.round(movement * 100) / 100,
      list_type: c.list_type,
    }

    if (c.list_type === 'Operating') operatingLines.push(item)
    else if (c.list_type === 'Investing') investingLines.push(item)
    else if (c.list_type === 'Financing') financingLines.push(item)
    else if (c.list_type === 'NonCash') noncashLines.push(item)
  }

  const sumLines = (lines: StatementLineItem[]) =>
    lines.reduce((s, l) => s + l.movement, 0)

  const operatingMovementsTotal = sumLines(operatingLines)
  const netCashFromOperating =
    Math.round((netProfitTotal + depreciationAddback + operatingMovementsTotal) * 100) / 100
  const netCashFromInvesting = Math.round(sumLines(investingLines) * 100) / 100
  const netCashFromFinancing = Math.round(sumLines(financingLines) * 100) / 100

  const computed = netCashFromOperating + netCashFromInvesting + netCashFromFinancing
  const reconciles = Math.abs(computed - netChangeInCash) < 0.01

  return {
    period,
    net_profit: Math.round(netProfitTotal * 100) / 100,
    noncash_addbacks: Math.round(depreciationAddback * 100) / 100,
    noncash_lines: noncashLines,
    operating_movements: operatingLines,
    net_cash_from_operating: netCashFromOperating,
    investing_movements: investingLines,
    net_cash_from_investing: netCashFromInvesting,
    financing_movements: financingLines,
    net_cash_from_financing: netCashFromFinancing,
    net_change_in_cash: Math.round(netChangeInCash * 100) / 100,
    opening_cash: Math.round(openingCash * 100) / 100,
    closing_cash: Math.round(closingCash * 100) / 100,
    reconciles,
    unassigned_accounts: unassignedCount,
  }
}
