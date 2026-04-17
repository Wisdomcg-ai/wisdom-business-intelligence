/**
 * Calxa-style Cashflow Forecast Engine
 *
 * Converts an accrual P&L forecast into a cash-timing budget showing
 * when money actually hits the bank. Handles DSO/DPO timing, GST gross-up,
 * BAS payments, superannuation, PAYG withholding & instalments, loans, and stock.
 */

import type {
  PLLine,
  PayrollSummary,
  CashflowAssumptions,
  CashflowForecastMonth,
  CashflowLine,
  CashflowExpenseGroup,
  CashflowForecastData,
  FinancialForecast,
} from '@/app/finances/forecast/types'

// ============================================================================
// Expense Group Classification
// ============================================================================

const EXPENSE_GROUP_KEYWORDS: Record<string, string[]> = {
  'Employment Expense': ['wage', 'salary', 'payroll', 'super', 'worker', 'staff', 'employ'],
  'Travel & Accommodation': ['travel', 'airfare', 'accom', 'vehicle', 'fuel', 'motor', 'parking'],
  'Professional Expense': ['accounting', 'legal', 'consulting', 'professional', 'bookkeep'],
  'IT Hardware and Software': ['software', 'hosting', 'it cost', 'computer', 'internet', 'phone', 'website', 'app design'],
  'Marketing and Advertising': ['marketing', 'advertising', 'promotion', 'media', 'digital ad', 'affiliate'],
  'Occupancy Expense': ['rent', 'lease', 'office', 'utilit', 'electric', 'cleaning', 'storage', 'outgoing'],
  'Bank and Other Fees': ['bank', 'merchant', 'stripe', 'payment process', 'credit card interest', 'paypal'],
  'Other Operating Expenses': [],
}

const GST_EXEMPT_KEYWORDS = [
  'wage', 'salary', 'super', 'payg', 'worker', 'insurance',
  'bank interest', 'depreciation', 'amortisation', 'amortization',
]

function classifyExpenseGroup(accountName: string): string {
  const lower = accountName.toLowerCase()
  for (const [group, keywords] of Object.entries(EXPENSE_GROUP_KEYWORDS)) {
    if (group === 'Other Operating Expenses') continue
    if (keywords.some(kw => lower.includes(kw))) return group
  }
  return 'Other Operating Expenses'
}

function isGSTExemptExpense(accountName: string): boolean {
  const lower = accountName.toLowerCase()
  return GST_EXEMPT_KEYWORDS.some(kw => lower.includes(kw))
}

function isEmploymentExpense(accountName: string): boolean {
  const lower = accountName.toLowerCase()
  return EXPENSE_GROUP_KEYWORDS['Employment Expense'].some(kw => lower.includes(kw))
}

function isBankFee(accountName: string): boolean {
  const lower = accountName.toLowerCase()
  return EXPENSE_GROUP_KEYWORDS['Bank and Other Fees'].some(kw => lower.includes(kw))
}

/**
 * Depreciation and amortisation are non-cash P&L items. They should NOT flow
 * into cashflow outflows. Interim keyword match — Phase 28.2 upgrades to
 * explicit account ID lookup from cashflow_settings.
 */
export function isDepreciationExpense(accountName: string): boolean {
  const lower = accountName.toLowerCase()
  return lower.includes('depreciation') ||
         lower.includes('amortisation') ||
         lower.includes('amortization')
}

// ============================================================================
// DSO/DPO Timing
// ============================================================================

/**
 * Split an amount across months based on DSO/DPO days.
 * Returns array of { offset, portion } where offset 0 = same month.
 *
 * Uses Calxa's bucket-based formula: portions ALWAYS sum to exactly 1.0.
 * Previously could produce >100% allocation for day ranges >30 (e.g. days=45
 * allocated 100% to next month AND 50% to month after = 150% total).
 */
export function getTimingSplit(days: number): { offset: number; portion: number }[] {
  if (days <= 0) return [{ offset: 0, portion: 1 }]

  const bucket = Math.floor(days / 30)
  const fraction = (days % 30) / 30

  const splits: { offset: number; portion: number }[] = []
  const sameBucketPortion = 1 - fraction
  if (sameBucketPortion > 0) splits.push({ offset: bucket, portion: sameBucketPortion })
  if (fraction > 0) splits.push({ offset: bucket + 1, portion: fraction })

  return splits
}

// ============================================================================
// BAS & Super Quarter Logic
// ============================================================================

/**
 * Returns the month (1-12) when a quarterly BAS/GST payment is due.
 * Q3 (Jan-Mar) → paid April (4)
 * Q4 (Apr-Jun) → paid July (7)
 * Q1 (Jul-Sep) → paid October (10)
 * Q2 (Oct-Dec) → paid February (2)
 */
function getBASPaymentMonth(accrualMonth: number): number {
  if (accrualMonth >= 1 && accrualMonth <= 3) return 4   // Q3 → April
  if (accrualMonth >= 4 && accrualMonth <= 6) return 7   // Q4 → July
  if (accrualMonth >= 7 && accrualMonth <= 9) return 10  // Q1 → October
  return 2                                                // Q2 → February
}

/**
 * Returns the quarter end month for a given month.
 */
function getQuarterEndMonth(month: number): number {
  if (month >= 1 && month <= 3) return 3
  if (month >= 4 && month <= 6) return 6
  if (month >= 7 && month <= 9) return 9
  return 12
}

/**
 * Super quarterly due months:
 * Q3 (Jan-Mar) → paid April (4)
 * Q4 (Apr-Jun) → paid July (7)
 * Q1 (Jul-Sep) → paid October (10)
 * Q2 (Oct-Dec) → paid January (1)
 */
function getSuperPaymentMonth(accrualMonth: number): number {
  if (accrualMonth >= 1 && accrualMonth <= 3) return 4
  if (accrualMonth >= 4 && accrualMonth <= 6) return 7
  if (accrualMonth >= 7 && accrualMonth <= 9) return 10
  return 1  // Q2 → January
}

/**
 * Check if a month is a BAS payment month (quarterly)
 */
function isBASPaymentMonth(month: number): boolean {
  return [2, 4, 7, 10].includes(month)
}

function isSuperPaymentMonth(month: number): boolean {
  return [1, 4, 7, 10].includes(month)
}

// ============================================================================
// Month Label Helper
// ============================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

// ============================================================================
// PlannedSpend Preprocessing
// ============================================================================

interface PlannedSpendCashItem { label: string; amount: number }

/**
 * Convert PlannedSpend items into month-keyed cash flow entries.
 * - Outright asset purchases → single cash out in purchase month (asset line)
 * - Financed items → monthly repayment over term (liability line)
 * - Leased items → monthly payment over term (liability line)
 * - One-off/monthly spends without asset → added to OpEx cash payments
 */
function preprocessPlannedSpends(
  items: PlannedSpendItem[],
  allMonths: string[],
  forecast: FinancialForecast,
): {
  assets: Record<string, PlannedSpendCashItem[]>
  liabilities: Record<string, PlannedSpendCashItem[]>
} {
  const assets: Record<string, PlannedSpendCashItem[]> = {}
  const liabilities: Record<string, PlannedSpendCashItem[]> = {}

  for (const mk of allMonths) {
    assets[mk] = []
    liabilities[mk] = []
  }

  if (items.length === 0) return { assets, liabilities }

  // Determine the fiscal year start from the forecast period
  const fyStartMonth = forecast.forecast_start_month || allMonths[0]

  for (const item of items) {
    // Convert fiscal month index (1-12) to a month key
    const purchaseMonthKey = fiscalMonthToKey(item.month, fyStartMonth)
    const purchaseIdx = allMonths.indexOf(purchaseMonthKey)
    if (purchaseIdx < 0) continue // Outside forecast range

    if (item.paymentMethod === 'outright') {
      // Single cash outflow in purchase month
      if (assets[purchaseMonthKey]) {
        assets[purchaseMonthKey].push({ label: item.description, amount: item.amount })
      }
    } else if (item.paymentMethod === 'finance' && item.financeMonthlyPayment && item.financeTerm) {
      // Monthly finance repayments starting from purchase month
      for (let m = 0; m < item.financeTerm; m++) {
        const targetIdx = purchaseIdx + m
        if (targetIdx >= allMonths.length) break
        const mk = allMonths[targetIdx]
        if (liabilities[mk]) {
          liabilities[mk].push({ label: `Finance: ${item.description}`, amount: item.financeMonthlyPayment })
        }
      }
    } else if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment && item.leaseTerm) {
      // Monthly lease payments starting from purchase month
      for (let m = 0; m < item.leaseTerm; m++) {
        const targetIdx = purchaseIdx + m
        if (targetIdx >= allMonths.length) break
        const mk = allMonths[targetIdx]
        if (liabilities[mk]) {
          liabilities[mk].push({ label: `Lease: ${item.description}`, amount: item.leaseMonthlyPayment })
        }
      }
    }
  }

  return { assets, liabilities }
}

/**
 * Convert a fiscal month index (1-12) to a YYYY-MM key based on the forecast start.
 */
function fiscalMonthToKey(fiscalMonth: number, fyStartMonthKey: string): string {
  const [startYear, startMonth] = fyStartMonthKey.split('-').map(Number)
  // fiscalMonth 1 = first month of FY, fiscalMonth 12 = last month
  const offset = fiscalMonth - 1
  let calMonth = startMonth + offset
  let calYear = startYear
  while (calMonth > 12) { calMonth -= 12; calYear++ }
  return `${calYear}-${String(calMonth).padStart(2, '0')}`
}

// ============================================================================
// Main Engine
// ============================================================================

/** PlannedSpend item from the forecast wizard (Step 7) */
interface PlannedSpendItem {
  id: string
  description: string
  amount: number
  month: number // 1-12 fiscal month index
  spendType: 'asset' | 'one-off' | 'monthly'
  paymentMethod: 'outright' | 'finance' | 'lease'
  financeTerm?: number
  financeRate?: number
  financeMonthlyPayment?: number
  leaseTerm?: number
  leaseMonthlyPayment?: number
  usefulLifeYears?: number
  annualDepreciation?: number
}

export function generateCashflowForecast(
  plLines: PLLine[],
  payrollSummary: PayrollSummary | null,
  assumptions: CashflowAssumptions,
  forecast: FinancialForecast,
  plannedSpends: PlannedSpendItem[] = [],
): CashflowForecastData {
  // Build ordered list of all months in the forecast
  const allMonths = buildMonthList(forecast)

  // Pre-process PlannedSpend items into month-keyed cash flows
  const plannedSpendByMonth = preprocessPlannedSpends(plannedSpends, allMonths, forecast)

  // Classify P&L lines
  const revenueLines = plLines.filter(l => l.category === 'Revenue')
  const cogsLines = plLines.filter(l => l.category === 'Cost of Sales')
  const opexLines = plLines.filter(l => l.category === 'Operating Expenses')
  const otherIncomeLines = plLines.filter(l => l.category === 'Other Income')

  const gstRate = assumptions.gst_registered ? assumptions.gst_rate : 0
  const dsoSplit = getTimingSplit(assumptions.dso_days)
  const dpoSplit = getTimingSplit(assumptions.dpo_days)

  // Pre-compute timing-adjusted cash amounts for each month
  // We need a buffer of months before and after for DSO/DPO spill
  const monthCount = allMonths.length

  // Track accrued liabilities for quarterly payment
  let accruedGST = assumptions.opening_gst_liability
  let accruedPAYGWH = assumptions.opening_payg_wh_liability
  let accruedPAYGInstalment = assumptions.opening_payg_instalment_liability
  let accruedSuper = assumptions.opening_super_liability

  // Track loan balances
  const loanBalances = assumptions.loans.map(l => l.balance)

  // Build cash receipts/payments arrays with timing offsets
  // For each P&L month, spread across cash months
  const cashReceipts: Record<string, { label: string; amount: number }[]> = {}
  const cashCOGSPayments: Record<string, { label: string; amount: number }[]> = {}
  const cashOpExPayments: Record<string, { label: string; amount: number; group: string }[]> = {}

  // Initialize all months
  for (const mk of allMonths) {
    cashReceipts[mk] = []
    cashCOGSPayments[mk] = []
    cashOpExPayments[mk] = []
  }

  // Opening debtors/creditors are already-outstanding balances from before the
  // forecast period. They should be collected/paid in month 0 (not delayed by
  // DSO/DPO, since DSO/DPO applies to NEW sales/purchases during the forecast).
  if (assumptions.opening_trade_debtors > 0 && allMonths.length > 0) {
    const debtorGross = assumptions.opening_trade_debtors // Already GST-inclusive from BS
    cashReceipts[allMonths[0]].push({
      label: 'Opening Debtors Collected',
      amount: debtorGross,
    })
  }

  if (assumptions.opening_trade_creditors > 0 && allMonths.length > 0) {
    const creditorGross = assumptions.opening_trade_creditors // Already GST-inclusive from BS
    cashCOGSPayments[allMonths[0]].push({
      label: 'Opening Creditors Paid',
      amount: creditorGross,
    })
  }

  // Spread revenue across months with DSO timing
  for (const line of revenueLines) {
    for (let i = 0; i < monthCount; i++) {
      const mk = allMonths[i]
      const accrualAmount = getLineValue(line, mk, forecast)
      if (accrualAmount === 0) continue

      const gstInclusive = accrualAmount * (1 + gstRate)

      for (const split of dsoSplit) {
        const targetIdx = i + split.offset
        if (targetIdx < monthCount) {
          cashReceipts[allMonths[targetIdx]].push({
            label: line.account_name,
            amount: gstInclusive * split.portion,
          })
        }
      }

      // First-month spillover: in steady state, month 0 receives DSO-delayed
      // collections from pre-forecast sales. Opening debtors is the BS receivable
      // balance; this spillover represents the normal flow of prior-month revenue
      // landing in month 0 (they are additive, not duplicates).
      if (i === 0) {
        for (const split of dsoSplit) {
          if (split.offset > 0) {
            cashReceipts[allMonths[0]].push({
              label: line.account_name,
              amount: gstInclusive * split.portion,
            })
          }
        }
      }
    }
  }

  // Spread COGS across months with DPO timing
  for (const line of cogsLines) {
    for (let i = 0; i < monthCount; i++) {
      const mk = allMonths[i]
      const accrualAmount = Math.abs(getLineValue(line, mk, forecast))
      if (accrualAmount === 0) continue

      const gstInclusive = accrualAmount * (1 + gstRate)

      for (const split of dpoSplit) {
        const targetIdx = i + split.offset
        if (targetIdx < monthCount) {
          cashCOGSPayments[allMonths[targetIdx]].push({
            label: line.account_name,
            amount: gstInclusive * split.portion,
          })
        }
      }

      // First-month spillover for COGS (same logic as revenue)
      if (i === 0) {
        for (const split of dpoSplit) {
          if (split.offset > 0) {
            cashCOGSPayments[allMonths[0]].push({
              label: line.account_name,
              amount: gstInclusive * split.portion,
            })
          }
        }
      }
    }
  }

  // OpEx is paid in the month accrued (Calxa Rule 7 — no DPO on OpEx).
  // Exceptions preserved: skip employment if payroll summary handles it;
  // skip depreciation/amortisation entirely (non-cash items).
  // Per-account overrides for delayed OpEx come in Phase 28.3 via Type 3 profiles.
  for (const line of opexLines) {
    // Skip employment lines if payroll summary handles them
    if (payrollSummary && isEmploymentExpense(line.account_name)) continue

    // Skip non-cash items (depreciation, amortisation) — they're P&L-only,
    // they shouldn't appear as cash outflows
    if (isDepreciationExpense(line.account_name)) continue

    const group = classifyExpenseGroup(line.account_name)

    for (let i = 0; i < monthCount; i++) {
      const mk = allMonths[i]
      const accrualAmount = Math.abs(getLineValue(line, mk, forecast))
      if (accrualAmount === 0) continue

      // GST treatment
      let cashAmount: number
      if (isGSTExemptExpense(line.account_name)) {
        cashAmount = accrualAmount // No GST
      } else {
        cashAmount = accrualAmount * (1 + gstRate * assumptions.gst_applicable_expense_pct)
      }

      // OpEx paid immediately in accrual month (per Calxa Rule 7)
      cashOpExPayments[mk].push({ label: line.account_name, amount: cashAmount, group })
    }
  }

  // Build monthly cashflow data
  const months: CashflowForecastMonth[] = []
  let bankBalance = assumptions.opening_bank_balance

  for (let i = 0; i < monthCount; i++) {
    const mk = allMonths[i]
    const [yearNum, monthNum] = mk.split('-').map(Number)
    const isActual = isActualMonth(mk, forecast)

    const bankAtBeginning = bankBalance

    // ---- Income (cash receipts) ----
    const incomeByLabel = aggregateByLabel(cashReceipts[mk] || [])
    const incomeLines: CashflowLine[] = Object.entries(incomeByLabel)
      .filter(([, v]) => Math.abs(v) >= 0.01)
      .map(([label, value]) => ({ label, value: round2(value) }))
    const cashInflows = round2(incomeLines.reduce((sum, l) => sum + l.value, 0))

    // ---- COGS (cash payments) ----
    const cogsByLabel = aggregateByLabel(cashCOGSPayments[mk] || [])
    const cogsLinesOut: CashflowLine[] = Object.entries(cogsByLabel)
      .filter(([, v]) => Math.abs(v) >= 0.01)
      .map(([label, value]) => ({ label, value: round2(value) }))

    // ---- Expenses (OpEx) ----
    const expenseGroupMap: Record<string, { label: string; amount: number }[]> = {}
    let totalExpenseCash = 0

    // Add payroll wages (gross, no GST, no DPO — paid same month)
    if (payrollSummary) {
      const grossWagesAdmin = Math.abs(payrollSummary.wages_admin_monthly?.[mk] || 0)
      const grossWagesCOGS = Math.abs(payrollSummary.wages_cogs_monthly?.[mk] || 0)
      const totalGrossWages = grossWagesAdmin + grossWagesCOGS
      if (totalGrossWages > 0) {
        const group = 'Employment Expense'
        if (!expenseGroupMap[group]) expenseGroupMap[group] = []
        expenseGroupMap[group].push({ label: 'Gross Wages', amount: totalGrossWages })
        totalExpenseCash += totalGrossWages
      }
    }

    // Read pre-computed OpEx cash payments for this month
    for (const item of cashOpExPayments[mk] || []) {
      if (!expenseGroupMap[item.group]) expenseGroupMap[item.group] = []
      expenseGroupMap[item.group].push({ label: item.label, amount: item.amount })
      totalExpenseCash += item.amount
    }

    // Build expense groups
    const expenseGroups: CashflowExpenseGroup[] = []
    const groupOrder = Object.keys(EXPENSE_GROUP_KEYWORDS)
    for (const groupName of groupOrder) {
      const items = expenseGroupMap[groupName]
      if (!items || items.length === 0) continue
      const grouped = aggregateByLabel(items)
      const lines: CashflowLine[] = Object.entries(grouped)
        .filter(([, v]) => Math.abs(v) >= 0.01)
        .map(([label, value]) => ({ label, value: round2(value) }))
      if (lines.length === 0) continue
      expenseGroups.push({
        group: groupName,
        lines,
        subtotal: round2(lines.reduce((sum, l) => sum + l.value, 0)),
      })
    }

    // Total cash outflows = COGS + expenses
    const totalCOGS = round2(cogsLinesOut.reduce((sum, l) => sum + l.value, 0))
    const cashOutflows = round2(totalCOGS + totalExpenseCash)

    // ---- GST tracking ----
    let monthGSTCollected = 0
    let monthGSTPaid = 0

    if (assumptions.gst_registered && gstRate > 0) {
      // GST collected on income
      monthGSTCollected = cashInflows * (gstRate / (1 + gstRate))

      // GST paid on COGS
      monthGSTPaid += totalCOGS * (gstRate / (1 + gstRate))

      // GST paid on applicable OpEx
      for (const group of expenseGroups) {
        for (const line of group.lines) {
          if (!isGSTExemptExpense(line.label)) {
            monthGSTPaid += line.value * (gstRate * assumptions.gst_applicable_expense_pct / (1 + gstRate * assumptions.gst_applicable_expense_pct))
          }
        }
      }

      accruedGST += (monthGSTCollected - monthGSTPaid)
    }

    // Accrue PAYG WH from payroll
    if (payrollSummary) {
      accruedPAYGWH += Math.abs(payrollSummary.payg_monthly?.[mk] || 0)
      accruedSuper += Math.abs(payrollSummary.superannuation_monthly?.[mk] || 0)
    }

    // Accrue PAYG Instalment (quarterly)
    if (assumptions.payg_instalment_frequency !== 'none' && assumptions.payg_instalment_amount > 0) {
      // Accrue monthly (1/3 of quarterly amount)
      accruedPAYGInstalment += assumptions.payg_instalment_amount / 3
    }

    // ---- Balance Sheet — Assets ----
    const assetLines: CashflowLine[] = []
    const stockChange = assumptions.planned_stock_changes[mk] || 0
    if (stockChange !== 0) {
      // GST applies to stock purchases
      const stockCash = stockChange > 0 ? stockChange * (1 + gstRate) : stockChange
      assetLines.push({ label: 'Stock on Hand', value: round2(-stockCash) }) // Outflow = negative
      if (stockChange > 0 && gstRate > 0) {
        monthGSTPaid += stockChange * gstRate
      }
    }

    // PlannedSpend — asset purchases (outright payments)
    const psAssets = plannedSpendByMonth.assets[mk] || []
    for (const ps of psAssets) {
      const gstInclusive = ps.amount * (1 + gstRate)
      assetLines.push({ label: `Asset: ${ps.label}`, value: round2(-gstInclusive) })
      if (gstRate > 0) monthGSTPaid += ps.amount * gstRate
    }

    const movementInAssets = round2(assetLines.reduce((sum, l) => sum + l.value, 0))

    // ---- Balance Sheet — Liabilities ----
    const liabilityLines: CashflowLine[] = []

    // GST/BAS Payment
    if (assumptions.gst_registered) {
      let gstPayment = 0
      if (assumptions.gst_reporting_frequency === 'quarterly' && isBASPaymentMonth(monthNum)) {
        gstPayment = accruedGST
        accruedGST = 0
      } else if (assumptions.gst_reporting_frequency === 'monthly') {
        // Monthly reporters pay 21st of following month — model as next month
        // For simplicity, we pay the prior month's GST this month
        if (i > 0) {
          gstPayment = monthGSTCollected - monthGSTPaid
          // Already tracked in accruedGST, reset
        }
        gstPayment = accruedGST
        accruedGST = 0
      }
      if (Math.abs(gstPayment) >= 0.01) {
        liabilityLines.push({ label: 'GST / BAS Payment', value: round2(-gstPayment) })
      }
    }

    // PAYG Withholding
    let paygWHPayment = 0
    if (assumptions.payg_wh_reporting_frequency === 'quarterly' && isBASPaymentMonth(monthNum)) {
      paygWHPayment = accruedPAYGWH
      accruedPAYGWH = 0
    } else if (assumptions.payg_wh_reporting_frequency === 'monthly') {
      paygWHPayment = accruedPAYGWH
      accruedPAYGWH = 0
    }
    if (Math.abs(paygWHPayment) >= 0.01) {
      liabilityLines.push({ label: 'PAYG Withholding', value: round2(-paygWHPayment) })
    }

    // PAYG Instalments
    if (assumptions.payg_instalment_frequency === 'quarterly' && isBASPaymentMonth(monthNum)) {
      if (Math.abs(accruedPAYGInstalment) >= 0.01) {
        liabilityLines.push({ label: 'PAYG Instalments', value: round2(-accruedPAYGInstalment) })
        accruedPAYGInstalment = 0
      }
    }

    // Superannuation
    let superPayment = 0
    if (assumptions.super_payment_frequency === 'quarterly' && isSuperPaymentMonth(monthNum)) {
      superPayment = accruedSuper
      accruedSuper = 0
    } else if (assumptions.super_payment_frequency === 'monthly') {
      superPayment = accruedSuper
      accruedSuper = 0
    }
    if (Math.abs(superPayment) >= 0.01) {
      liabilityLines.push({ label: 'Superannuation', value: round2(-superPayment) })
    }

    // Loan Repayments
    for (let lIdx = 0; lIdx < assumptions.loans.length; lIdx++) {
      const loan = assumptions.loans[lIdx]
      const balance = loanBalances[lIdx]
      if (balance <= 0) continue

      let monthlyPayment: number
      if (loan.is_interest_only) {
        monthlyPayment = balance * (loan.interest_rate / 12)
      } else {
        monthlyPayment = Math.min(loan.monthly_repayment, balance + balance * (loan.interest_rate / 12))
        // Reduce balance by principal portion
        const interestPortion = balance * (loan.interest_rate / 12)
        const principalPortion = monthlyPayment - interestPortion
        loanBalances[lIdx] = Math.max(0, balance - principalPortion)
      }

      if (monthlyPayment > 0) {
        liabilityLines.push({ label: `Loan: ${loan.name}`, value: round2(-monthlyPayment) })
      }
    }

    // PlannedSpend — finance repayments and lease payments
    const psLiabilities = plannedSpendByMonth.liabilities[mk] || []
    for (const ps of psLiabilities) {
      liabilityLines.push({ label: ps.label, value: round2(-ps.amount) })
    }

    const movementInLiabilities = round2(liabilityLines.reduce((sum, l) => sum + l.value, 0))

    // ---- Other Income ----
    const otherIncLines: CashflowLine[] = []
    for (const line of otherIncomeLines) {
      const val = getLineValue(line, mk, forecast)
      if (Math.abs(val) >= 0.01) {
        otherIncLines.push({ label: line.account_name, value: round2(val) })
      }
    }
    const otherInflows = round2(otherIncLines.reduce((sum, l) => sum + l.value, 0))

    // ---- Net Movement & Bank at End ----
    const netMovement = round2(cashInflows - cashOutflows + movementInAssets + movementInLiabilities + otherInflows)
    const bankAtEnd = round2(bankAtBeginning + netMovement)

    bankBalance = bankAtEnd

    months.push({
      month: mk,
      monthLabel: formatMonthLabel(mk),
      source: isActual ? 'actual' : 'forecast',
      bank_at_beginning: round2(bankAtBeginning),
      income_lines: incomeLines,
      cash_inflows: cashInflows,
      cogs_lines: cogsLinesOut,
      expense_groups: expenseGroups,
      cash_outflows: cashOutflows,
      asset_lines: assetLines,
      movement_in_assets: movementInAssets,
      liability_lines: liabilityLines,
      movement_in_liabilities: movementInLiabilities,
      other_income_lines: otherIncLines,
      other_inflows: otherInflows,
      net_movement: netMovement,
      bank_at_end: bankAtEnd,
    })
  }

  // Build totals column
  const totals = buildTotals(months)

  // Find lowest bank balance
  let lowestBalance = Infinity
  let lowestMonth = ''
  for (const m of months) {
    if (m.bank_at_end < lowestBalance) {
      lowestBalance = m.bank_at_end
      lowestMonth = m.month
    }
  }

  return {
    forecast_id: forecast.id || '',
    assumptions,
    months,
    totals,
    lowest_bank_balance: lowestBalance === Infinity ? 0 : round2(lowestBalance),
    lowest_bank_month: lowestMonth,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function getLineValue(line: PLLine, monthKey: string, forecast: FinancialForecast): number {
  // Check actual months first, then forecast months
  if (line.actual_months?.[monthKey] !== undefined && line.actual_months[monthKey] !== 0) {
    return line.actual_months[monthKey]
  }
  if (line.forecast_months?.[monthKey] !== undefined) {
    return line.forecast_months[monthKey]
  }
  return 0
}

function isActualMonth(monthKey: string, forecast: FinancialForecast): boolean {
  return monthKey >= forecast.actual_start_month && monthKey <= forecast.actual_end_month
}

function buildMonthList(forecast: FinancialForecast): string[] {
  const months: string[] = []
  const start = forecast.actual_start_month
  const end = forecast.forecast_end_month

  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)

  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  return months
}

function aggregateByLabel(items: { label: string; amount: number }[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of items) {
    result[item.label] = (result[item.label] || 0) + item.amount
  }
  return result
}

function buildTotals(months: CashflowForecastMonth[]): CashflowForecastMonth {
  if (months.length === 0) {
    return {
      month: 'total',
      monthLabel: 'Total',
      source: 'forecast',
      bank_at_beginning: 0,
      income_lines: [],
      cash_inflows: 0,
      cogs_lines: [],
      expense_groups: [],
      cash_outflows: 0,
      asset_lines: [],
      movement_in_assets: 0,
      liability_lines: [],
      movement_in_liabilities: 0,
      other_income_lines: [],
      other_inflows: 0,
      net_movement: 0,
      bank_at_end: 0,
    }
  }

  // Aggregate all line values across months
  const incomeAgg: Record<string, number> = {}
  const cogsAgg: Record<string, number> = {}
  const expenseGroupAgg: Record<string, Record<string, number>> = {}
  const assetAgg: Record<string, number> = {}
  const liabilityAgg: Record<string, number> = {}
  const otherIncomeAgg: Record<string, number> = {}

  let totalInflows = 0
  let totalOutflows = 0
  let totalAssets = 0
  let totalLiabilities = 0
  let totalOtherInflows = 0

  for (const m of months) {
    for (const l of m.income_lines) {
      incomeAgg[l.label] = (incomeAgg[l.label] || 0) + l.value
    }
    for (const l of m.cogs_lines) {
      cogsAgg[l.label] = (cogsAgg[l.label] || 0) + l.value
    }
    for (const g of m.expense_groups) {
      if (!expenseGroupAgg[g.group]) expenseGroupAgg[g.group] = {}
      for (const l of g.lines) {
        expenseGroupAgg[g.group][l.label] = (expenseGroupAgg[g.group][l.label] || 0) + l.value
      }
    }
    for (const l of m.asset_lines) {
      assetAgg[l.label] = (assetAgg[l.label] || 0) + l.value
    }
    for (const l of m.liability_lines) {
      liabilityAgg[l.label] = (liabilityAgg[l.label] || 0) + l.value
    }
    for (const l of m.other_income_lines) {
      otherIncomeAgg[l.label] = (otherIncomeAgg[l.label] || 0) + l.value
    }

    totalInflows += m.cash_inflows
    totalOutflows += m.cash_outflows
    totalAssets += m.movement_in_assets
    totalLiabilities += m.movement_in_liabilities
    totalOtherInflows += m.other_inflows
  }

  const incomeLines = Object.entries(incomeAgg).map(([label, value]) => ({ label, value: round2(value) }))
  const cogsLines = Object.entries(cogsAgg).map(([label, value]) => ({ label, value: round2(value) }))
  const assetLines = Object.entries(assetAgg).map(([label, value]) => ({ label, value: round2(value) }))
  const liabilityLines = Object.entries(liabilityAgg).map(([label, value]) => ({ label, value: round2(value) }))
  const otherIncomeLines = Object.entries(otherIncomeAgg).map(([label, value]) => ({ label, value: round2(value) }))

  const expenseGroups: CashflowExpenseGroup[] = []
  for (const [group, agg] of Object.entries(expenseGroupAgg)) {
    const lines = Object.entries(agg).map(([label, value]) => ({ label, value: round2(value) }))
    expenseGroups.push({
      group,
      lines,
      subtotal: round2(lines.reduce((sum, l) => sum + l.value, 0)),
    })
  }

  return {
    month: 'total',
    monthLabel: 'Total',
    source: 'forecast',
    bank_at_beginning: round2(months[0].bank_at_beginning),
    income_lines: incomeLines,
    cash_inflows: round2(totalInflows),
    cogs_lines: cogsLines,
    expense_groups: expenseGroups,
    cash_outflows: round2(totalOutflows),
    asset_lines: assetLines,
    movement_in_assets: round2(totalAssets),
    liability_lines: liabilityLines,
    movement_in_liabilities: round2(totalLiabilities),
    other_income_lines: otherIncomeLines,
    other_inflows: round2(totalOtherInflows),
    net_movement: round2(months[months.length - 1].bank_at_end - months[0].bank_at_beginning),
    bank_at_end: round2(months[months.length - 1].bank_at_end),
  }
}

// ============================================================================
// Default Assumptions
// ============================================================================

export function getDefaultCashflowAssumptions(): CashflowAssumptions {
  return {
    dso_days: 30,
    dso_auto_calculated: false,
    dpo_days: 30,
    dpo_auto_calculated: false,
    gst_registered: true,
    gst_rate: 0.10,
    gst_reporting_frequency: 'quarterly',
    gst_applicable_expense_pct: 0.80,
    super_payment_frequency: 'quarterly',
    payg_wh_reporting_frequency: 'monthly',
    payg_instalment_amount: 0,
    payg_instalment_frequency: 'quarterly',
    opening_bank_balance: 0,
    opening_trade_debtors: 0,
    opening_trade_creditors: 0,
    opening_gst_liability: 0,
    opening_payg_wh_liability: 0,
    opening_payg_instalment_liability: 0,
    opening_super_liability: 0,
    opening_stock: 0,
    planned_stock_changes: {},
    loans: [],
    balance_date: '',
  }
}
