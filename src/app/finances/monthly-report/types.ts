// Monthly Report Types

export type ReportTab = 'report' | 'full-year' | 'trends' | 'charts' | 'subscriptions' | 'wages' | 'cashflow' | 'balance-sheet' | 'balance-sheet-consolidated' | 'cashflow-consolidated' | 'external-data' | 'mapping' | 'history' | 'consolidated'

export type ReportStatus = 'draft' | 'final'

export type ReportCategory =
  | 'Revenue'
  | 'Cost of Sales'
  | 'Operating Expenses'
  | 'Other Income'
  | 'Other Expenses'

export const REPORT_CATEGORIES: ReportCategory[] = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses',
]

// ============================================
// Report Settings
// ============================================

export interface ReportSections {
  revenue_detail: boolean
  cogs_detail: boolean
  opex_detail: boolean
  payroll_detail: boolean
  subscription_detail: boolean
  balance_sheet: boolean
  cashflow: boolean
  trend_charts: boolean
  /** WD.7 — opt-in: sync also mirrors the cash-basis P&L (paymentsOnly=true).
   *  Doubles the per-month Xero P&L requests for this business, so off by
   *  default; the Cash-vs-Accruals page needs it on plus one sync cycle. */
  cash_basis?: boolean
  // Chart toggles
  chart_cash_runway: boolean
  chart_cumulative_net_cash: boolean
  chart_working_capital_gap: boolean
  chart_revenue_vs_expenses: boolean
  chart_revenue_breakdown: boolean
  chart_variance_heatmap: boolean
  chart_budget_burn_rate: boolean
  chart_break_even: boolean
  chart_team_cost_pct: boolean
  chart_cost_per_employee: boolean
  chart_subscription_creep: boolean
}

// WD.3 — a standing "refer to …" commentary bullet rendered under the
// Budget-vs-Actual statement every month, regardless of variance triggers.
// Printed "label | Refer to <refer_to>", first in the commentary list.
export interface StandingCommentaryLine {
  label: string
  refer_to: string
  /**
   * The pack page the line points at, when refer_to is not that page's name
   * ("summary page" → "Contractor Analysis"). Only the in-pack check reads it.
   */
  target?: string
  /**
   * The accounts the line speaks for, by name or code, when the label is not
   * the account's own name ("Wages & Salaries" → "Employ - Wages & Salaries").
   * A claimed account prints the standing line in place of its supplier list.
   * The label always claims the account it names exactly.
   */
  accounts?: string[]
}

export interface MonthlyReportSettings {
  id?: string
  business_id: string
  sections: ReportSections
  show_prior_year: boolean
  show_ytd: boolean
  show_unspent_budget: boolean
  show_budget_next_month: boolean
  show_budget_annual_total: boolean
  budget_forecast_id?: string | null
  /**
   * Where the budget column comes from. Absent on the 19 businesses with no
   * settings row, so read it positively — `=== 'budget_version'`.
   */
  budget_source?: 'forecast' | 'budget_version'
  subscription_account_codes?: string[]
  /**
   * Xero account codes whose vendor detail feeds the Contractor Analysis page
   * (Urban Road: 61400). Empty/absent = the page is not part of this pack.
   */
  contractor_account_codes?: string[] | null
  /**
   * Xero AccountIDs the pack counts as bank — Where Did Our Money Go and the
   * cashflow's opening balance (see opening-bank, parseBankAccountIds).
   * Empty/absent = every asset account in the balance sheet's Bank section.
   */
  bank_account_ids?: string[] | null
  /**
   * The pack's cashflow model v2 switch and settings (cash-model-config).
   * Absent/null or enabled: false = the v1 cashflow pages, as every client
   * printed before. Read raw; parseCashModelConfig decides what it means.
   */
  cash_model?: unknown
  wages_account_names?: string[]
  pdf_layout?: import('./types/pdf-layout').PDFLayout | null
  /** WD.3 — standing commentary bullets; null/undefined = none. */
  standing_commentary?: StandingCommentaryLine[] | null
  /**
   * The order the expense group headings run in. Membership lives on
   * `account_mappings.report_subcategory`; this is the coach's editorial
   * choice, which matches no property of the accounts. Null/absent = the
   * expense pages stay a flat list, which is what every client that has not
   * opted in gets.
   */
  expense_group_order?: string[] | null
  /**
   * The pack's mark: the WisdomBI lockup (absent / 'wisdombi') or the
   * business's own image. See lib/monthly-report/pack-logo-setting.
   */
  pack_logo?: import('@/lib/monthly-report/pack-logo-setting').PackLogoSetting | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Report Templates (Phase 23)
// ============================================

export interface TemplateColumnSettings {
  show_prior_year: boolean
  show_ytd: boolean
  show_unspent_budget: boolean
  show_budget_next_month: boolean
  show_budget_annual_total: boolean
}

export interface ReportTemplate {
  id: string
  business_id: string
  name: string
  is_default: boolean
  sections: ReportSections
  column_settings: TemplateColumnSettings
  budget_forecast_id?: string | null
  subscription_account_codes?: string[]
  wages_account_names?: string[]
  /** WC.3 — optional saved PDF page layout. null/undefined = this template
   *  does not manage the layout; applying it leaves the business's layout
   *  untouched. */
  pdf_layout?: import('./types/pdf-layout').PDFLayout | null
  created_at?: string
  updated_at?: string
}

export const DEFAULT_SECTIONS: ReportSections = {
  revenue_detail: true,
  cogs_detail: true,
  opex_detail: true,
  payroll_detail: false,
  subscription_detail: false,
  balance_sheet: false,
  cashflow: false,
  trend_charts: true,
  cash_basis: false,
  // P&L charts ON by default
  chart_revenue_vs_expenses: true,
  chart_revenue_breakdown: true,
  chart_variance_heatmap: true,
  chart_budget_burn_rate: true,
  chart_break_even: true,
  // Data-dependent charts OFF by default
  chart_cash_runway: false,
  chart_cumulative_net_cash: false,
  chart_working_capital_gap: false,
  chart_team_cost_pct: false,
  chart_cost_per_employee: false,
  chart_subscription_creep: false,
}

// ============================================
// Account Mappings
// ============================================

export interface AccountMapping {
  id?: string
  business_id: string
  xero_account_code?: string | null
  xero_account_name: string
  xero_account_type?: string | null
  report_category: ReportCategory
  report_subcategory?: string | null
  is_auto_mapped: boolean
  is_confirmed: boolean
  mapped_by?: string | null
  mapped_at?: string | null
  forecast_pl_line_id?: string | null
  forecast_pl_line_name?: string | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Report Data
// ============================================

export interface ReportLine {
  account_name: string
  xero_account_name?: string | null
  is_budget_only: boolean
  // Monthly
  actual: number
  budget: number
  variance_amount: number
  variance_percent: number
  // YTD
  ytd_actual: number
  ytd_budget: number
  ytd_variance_amount: number
  ytd_variance_percent: number
  // Extra columns (Calxa-style)
  unspent_budget: number
  budget_next_month: number
  budget_annual_total: number
  // Prior year
  prior_year: number | null
  /**
   * The expense group this account belongs to ("Employment Expense", "Bank and
   * Other Fees", …), from `account_mappings.report_subcategory`.
   *
   * Calxa gathers 49 expense accounts under nine headings with a subtotal each;
   * ours printed them as one flat alphabetical list, which is why the expense
   * pages read as a ledger export. Null on every client that has not grouped
   * its chart yet — and a null group renders exactly as today, so nothing
   * changes for anyone until a coach opts in.
   */
  group?: string | null
  /**
   * The account's Xero code, and ONLY a Xero code — null when the line has no
   * code this business's Xero data vouches for (a forecast wizard's
   * 'opex-28' or 'SYS-TEAM-WAGES' is not one). Drives statement order: the
   * pack lists accounts by code, compared as text. Absent on snapshots saved
   * before it existed. See src/lib/monthly-report/statement-order.ts.
   */
  account_code?: string | null
}

export interface ReportSection {
  category: ReportCategory
  lines: ReportLine[]
  subtotal: ReportLine
}

export interface ReportSummary {
  revenue: { actual: number; budget: number; variance: number; variance_percent: number }
  cogs: { actual: number; budget: number; variance: number; variance_percent: number }
  gross_profit: { actual: number; budget: number; variance: number; gp_percent: number }
  opex: { actual: number; budget: number; variance: number; variance_percent: number }
  net_profit: { actual: number; budget: number; variance: number; np_percent: number }
  // WA.1 — Other Income/Expenses removed from GP and opex; Operating Profit is
  // a real line. Optional because snapshots saved before the restructure lack
  // them — consumers must render conditionally.
  operating_profit?: { actual: number; budget: number; variance: number; op_percent: number }
  other_income?: { actual: number; budget: number; variance: number; variance_percent: number }
  other_expenses?: { actual: number; budget: number; variance: number; variance_percent: number }
}

export interface GeneratedReport {
  business_id: string
  report_month: string
  fiscal_year: number
  settings: MonthlyReportSettings
  sections: ReportSection[]
  summary: ReportSummary
  gross_profit_row: ReportLine
  /** WA.1 — GP − Operating Expenses. Optional: pre-restructure snapshots lack it. */
  operating_profit_row?: ReportLine
  net_profit_row: ReportLine
  is_draft: boolean
  unreconciled_count: number
  has_budget: boolean
  budget_forecast_name?: string
  /**
   * What the budget column on THIS report actually is — emitted by the route
   * from the resolver, not copied from settings, because a client switched to
   * the budget store whose version will not resolve has budget_source
   * 'budget_version' in settings and no budget at all here.
   *
   * Anything that puts the word "Budget" in front of a reader has to consult
   * it. One pack now shows an approved budget and a forecast side by side on
   * the Full Year page, so an unqualified "Budget" elsewhere in the same pack
   * names neither of them.
   */
  budget_source?: 'forecast' | 'budget_version' | 'none'
  /** budget_versions.id when budget_source is 'budget_version'. */
  budget_version_id?: string | null
  /**
   * Why there is no budget, when the client is on the budget store — emitted by
   * generate/route.ts straight off the resolver. Undefined on a snapshot frozen
   * before the field existed, and null on the forecast path (the resolver only
   * explains itself for a budget-store client).
   *
   * Anything that shows a reader an empty budget column has to say why: a
   * column of dashes with nothing explaining it gets read as "we budgeted
   * nothing", which is a different and false claim.
   */
  no_budget_reason?: import('@/lib/budgets/resolve-budget').NoBudgetReason | null
  /**
   * True when this report was produced by `/api/monthly-report/consolidated`
   * (i.e. the underlying business is a consolidation parent). Enables
   * consolidation-specific UI affordances — e.g. the "Consolidated budget
   * not yet supported" info note in BudgetVsActualTable's header, and
   * blocking the snapshot path (Phase 35 will ship consolidated snapshots).
   */
  is_consolidation?: boolean
  /**
   * The exchange rates the consolidation behind THESE figures had no rate for
   * (its fx_context.missing_rates), recorded at Generate and saved with the
   * snapshot. Pre-flight refuses export on it (IICT-04). It is the report's
   * own: the page's per-entity consolidated report can be another month's or
   * another generation's, and is never loaded for a client. Undefined on a
   * report saved before the field existed, and on a single-entity report.
   */
  consolidation_fx?: { missing_rates: Array<{ currency_pair: string; period: string }> }
}

// ============================================
// Report Snapshots
// ============================================

export interface ReportSnapshot {
  id?: string
  business_id: string
  report_month: string
  fiscal_year: number
  status: ReportStatus
  is_draft: boolean
  unreconciled_count: number
  report_data: GeneratedReport
  summary: ReportSummary
  coach_notes?: string | null
  commentary?: Record<string, string> | null
  generated_by?: string | null
  generated_at?: string
  pdf_exported_at?: string | null
  created_at?: string
  updated_at?: string
}

// ============================================
// Reconciliation
// ============================================

export interface ReconciliationStatus {
  unreconciled_count: number
  unreconciled_total: number
  has_more: boolean
  /** Per-account attribution of the unreconciled count (accounts with items
   *  only; org-prefixed for multi-org businesses). Xero's reconcile badge is
   *  per account, so this names where a nonzero count actually lives. */
  bank_accounts: { name: string; count: number; total: number }[]
  /** Which population the count measures. 'account_transactions' = recorded
   *  transactions never matched to a statement line; uncoded bank-feed lines
   *  (Xero's reconcile badge) are INVISIBLE to that count. */
  source?: 'account_transactions' | 'statement_lines'
  is_clean: boolean
  /**
   * FLEET-04 (26 Aug 2026): true when one or more connected Xero orgs could not
   * be checked (no connection, expired token, or a failed BankTransactions
   * call). The count is then INCOMPLETE and `is_clean` is forced false — a
   * check that did not run is not a clean bill of health. Multi-org businesses
   * (Dragon, IICT) previously always hit this path silently and were shown a
   * green "All transactions reconciled" tick.
   */
  check_failed?: boolean
  orgs_checked?: number
  orgs_total?: number
  failure_reason?: string
  no_connection?: boolean
}

// ============================================
// Forecast reference types (for budget linking)
// ============================================

export interface ForecastOption {
  id: string
  name: string
  fiscal_year: number
  forecast_type: string
  is_active: boolean
}

export interface ForecastPLLine {
  id: string
  account_name: string
  category: string
  forecast_months: Record<string, number>
}

// ============================================
// Full Year Projection
// ============================================

export interface FullYearMonthData {
  month: string           // 'YYYY-MM'
  actual: number
  /**
   * The FORECAST for this month — "where will we land". Kept as `budget`
   * because that is what the API has always called it; renaming it here would
   * only move the confusion, and the approved budget now sits beside it under
   * its own name.
   */
  budget: number
  /**
   * The APPROVED budget for this month, out of budget_versions/budget_lines —
   * "what were we held to". Null, never 0, when the client is not on the budget
   * store or the store could not answer: a zero in a budget column reads as a
   * deliberate decision to spend nothing, and every variance measured off it
   * comes out favourable. An account the budget genuinely does not mention is a
   * real 0 and the route sends 0 for it — the two cases are not the same.
   */
  approved_budget: number | null
  prior_year: number      // actual value from same month one year earlier (Phase 26)
  source: 'actual' | 'forecast'
}

export interface FullYearLine {
  account_name: string
  category: string
  months: FullYearMonthData[]    // 12 entries
  projected_total: number        // actuals + remaining forecast
  annual_budget: number          // full year FORECAST total
  /** Full year APPROVED total; null on the same terms as approved_budget. */
  approved_annual_budget: number | null
  variance_amount: number        // projection vs FORECAST, not vs the approved budget
  variance_percent: number
  /** Real Xero code or null, on the same terms as ReportLine.account_code. */
  account_code?: string | null
  /**
   * The expense group heading this account prints under, on the same terms as
   * ReportLine.group and from the same reader (mappingGroup in
   * lib/monthly-report/expense-groups), so the Full Year page and the Actual vs
   * Budget page of one pack group every account identically. Absent on a
   * payload built before the route emitted it, which renders as a flat list.
   */
  group?: string | null
}

export interface FullYearSection {
  category: string
  lines: FullYearLine[]
  subtotal: FullYearLine
}

export interface FullYearReport {
  business_id: string
  fiscal_year: number
  last_actual_month: string      // most recent month with actuals
  sections: FullYearSection[]
  gross_profit: FullYearLine
  net_profit: FullYearLine
  /**
   * The label of the budget version the approved column came from, so the page
   * can name its yardstick instead of printing an anonymous second money
   * column. Null whenever there is no approved budget.
   */
  approved_budget_label?: string | null
  /**
   * The months ('YYYY-MM') the resolved approved budget has rows for, or null
   * when there is no approved budget. A month outside it is not a budget of 0 —
   * the version simply does not reach it — and the Full Year page must not
   * print it as one (approvedBudgetGaps). Optional: older snapshots lack it.
   */
  approved_months_covered?: string[] | null
  /**
   * Did an active forecast exist for this fiscal year at all?
   *
   * False is not "the forecast is zero" — it is "there is no forecast", and the
   * Forecast and variance columns must render a mark rather than a number.
   * Optional because a snapshot frozen before the route emitted it carries no
   * value; hasForecastBudget reads the evidence in that case.
   */
  forecast_available?: boolean
  /**
   * The coach's heading order, copied from monthly_report_settings. A FALLBACK
   * only: the renderers prefer the monthly report's own settings, which is what
   * the Actual vs Budget page in the same pack reads. Null/absent = headings
   * sort A-Z, exactly as they would there.
   */
  expense_group_order?: string[] | null
}

// ============================================
// Trend Charts
// ============================================

export interface TrendDataPoint {
  month: string
  monthLabel: string             // 'Jul', 'Aug', etc.
  revenue_actual: number
  revenue_budget: number
  revenue_prior_year: number     // Phase 26
  cogs_actual: number
  cogs_budget: number
  cogs_prior_year: number        // Phase 26
  opex_actual: number
  opex_budget: number
  opex_prior_year: number        // Phase 26
  gp_percent: number
  np_percent: number
  gp_percent_budget: number
  np_percent_budget: number
}

// ============================================
// Variance Commentary
// ============================================

export interface VendorTransaction {
  date: string
  vendor: string          // Clean vendor name for this specific transaction
  context: string | null  // Additional detail only when it adds value (e.g. invoice description)
  amount: number
  type: 'invoice' | 'bank' | 'credit_note'
}

export interface VendorSummary {
  vendor: string
  amount: number
  transactions?: VendorTransaction[]
}

/**
 * Phase 71-04 (S1) — TriggerReason names WHY a commentary row appeared.
 * Defined inline (rather than imported from utils/commentary-triggers) so the
 * types.ts module has no runtime dependency on a UI util.
 */
export type CommentaryTriggerReason =
  | 'expense_over_budget_dollar'
  | 'revenue_under_budget_dollar'
  | 'revenue_under_budget_percent'
  | 'expense_favourable_significant'
  | 'bs_movement_dollar'
  | 'bs_movement_percent'
  // Triggered nothing, but moved, in a section whose commentary lists every
  // account that did (see commentary-placement coverage).
  | 'account_activity'

export interface VarianceCommentaryEntry {
  vendor_summary: VendorSummary[]  // Grouped by vendor, sorted by amount desc
  coach_note: string               // Editable coach note (can override or supplement)
  is_edited: boolean
  detail_tab_ref?: 'subscriptions' | 'wages' | null
  // Phase 71-04 (S1): why this commentary row was surfaced. Optional for
  // backward-compat with pre-71-04 snapshots that lack the field.
  trigger_reason?: CommentaryTriggerReason
  /**
   * The generated facts: suppliers largest-first (converted, capped, credits
   * named) and the ratio clause. Rebuilt from scratch on every generate, which
   * is why it is separate from `coach_note` — facts that recompute cannot go
   * stale, and prose that is never overwritten cannot be lost.
   */
  draft_note?: string
  /**
   * The two halves of draft_note, stored apart so a placement can print the
   * supplier list without the ratio clause. Absent on commentary drafted before
   * they existed; such an entry prints draft_note whole.
   */
  draft_facts?: string
  draft_clause?: string | null
  /**
   * Coach-only. A document that could not be converted out of its currency, or
   * a vendor list that sums past its own account. When this is non-empty the
   * draft is NOT printed: the pack would be quoting a list we already know to
   * be wrong.
   */
  draft_warnings?: string[]
}

export interface VarianceCommentary {
  [accountName: string]: VarianceCommentaryEntry
}

// ============================================
// Subscription Analysis (Phase 4)
// ============================================

export interface SubscriptionVendorLine {
  vendor_name: string
  vendor_key: string
  /** The gross document amounts (GST included where charged), as every page has always quoted them. */
  prior_month_actual: number
  actual: number
  budget: number
  variance: number
  /**
   * The same vendor in the P&L's money — net of GST, in the organisation's
   * currency — for a placement that opts in (subscription-page `basis`).
   * Variance is still against `budget`, the gross vendor budget. Absent on the
   * stored history (the harness) and on responses from before it existed.
   */
  statement?: { prior_month_actual: number; actual: number; variance: number; months?: Record<string, number> }
  /**
   * The vendor month by month, gross, over the window the caller asked for
   * (`months` on the route; the Contractors Payment Summary's three) — a month
   * with nothing posted is 0. Absent when no window was asked for: the page has
   * always been two months, and those are prior_month_actual and actual.
   */
  months?: Record<string, number>
  /**
   * Number of current-month bank-transaction lines that contributed to `actual`.
   * Zero means the vendor surfaced solely from `subscription_budgets` backfill
   * (Phase 71-05 / S2) and the UI should render a "not billed this month" badge.
   */
  transaction_count: number
  /**
   * The department this vendor belongs to, from `subscription_budgets.category`.
   * Only the Contractor Analysis page reads it; subscriptions leave it null.
   */
  category?: string | null
}

export interface SubscriptionAccountGroup {
  account_code: string
  account_name: string
  vendors: SubscriptionVendorLine[]
  total_prior_month: number
  total_actual: number
  total_budget: number
  total_variance: number
  /**
   * Where total_budget came from: the approved budget (budget-store clients),
   * the forecast line, or — neither having one — the sum of the vendor budgets.
   * 'none' is a budget-store client with no version in force: total_budget is
   * 0 and total_budget_absent says why. Absent on responses cached before it
   * existed.
   */
  total_budget_source?: 'approved_budget' | 'forecast' | 'vendor_sum' | 'none'
  /** Why there is no budget, when total_budget_source is 'none' ("no approved budget version is locked for FY2027"). */
  total_budget_absent?: string
  /**
   * A budget-store client only: the TOTAL budget this page printed before the
   * store — the forecast line, else the vendor budgets — with its variance
   * against total_actual. The standard layout prints it unless its placement
   * asks for the approved budget (subscription-page `total_budget`), so moving
   * a client onto the store does not move this page unasked.
   */
  pre_budget_store_total?: { budget: number; variance: number; source: 'forecast' | 'vendor_sum' }
  /** Lines left out of every vendor's `statement` figure because they could not be stated in the organisation's currency (the gross figures include them). */
  unconverted?: SubscriptionUnconvertedLine[]
  /** The account over the window the caller asked for. Absent when none was. */
  window?: SubscriptionAccountWindow
}

/**
 * One account month by month, for a page that prints more than this month and
 * last (the Contractors Payment Summary).
 */
export interface SubscriptionAccountWindow {
  /** Oldest first, ending at the report month. */
  months: string[]
  /** The ledger's figure for the account (xero_pl_lines), or the vendor rows added up when the ledger has no row for it — see actual_source. */
  actual: Record<string, number>
  actual_source: 'ledger' | 'vendor_sum'
  /**
   * The account's budget for each month, on the yardstick total_budget uses —
   * the approved budget for a budget-store client, the forecast otherwise.
   * Null is "no budget for this month", never $0: June 2026 is FY2026, and
   * Urban Road has no approved budget for FY2026. budget_absent says why.
   */
  budget: Record<string, number | null>
  budget_absent?: Record<string, string>
}

export interface SubscriptionUnconvertedLine {
  vendor_name: string
  /** Signed, in the document's own currency. */
  amount: number
  source_currency: string | null
  /** True for the report month, false for the month before. */
  is_current: boolean
  /** Set only for a month further back than the month before (a window month): is_current is false and does not name it. */
  month?: string
  reason: string
}

export interface SubscriptionLeakageLine {
  vendor_key: string
  vendor_name: string
  actual: number
  expected: number
  delta: number
}

/** Phase 3 (18 Aug 2026): the three subscription-leakage classes a coach acts
 *  on, computed server-side from the same vendor rows the table shows. */
export interface SubscriptionLeakageSummary {
  new_unbudgeted: SubscriptionLeakageLine[]
  price_rises: SubscriptionLeakageLine[]
  lapsed_still_budgeted: SubscriptionLeakageLine[]
  totals: { new_unbudgeted: number; price_rises: number; lapsed_still_budgeted: number }
}

export interface SubscriptionDetailData {
  accounts: SubscriptionAccountGroup[]
  grand_total: { prior_month: number; actual: number; budget: number; variance: number }
  report_month: string
  /** Optional: absent on cached/legacy responses. */
  leakage?: SubscriptionLeakageSummary
  /**
   * Whether every connected org was read, whole, for both months. False when
   * there is no Xero connection, an org's token was unavailable, or a fetch
   * came back short — then an empty `accounts` is NOT "nothing was spent", and
   * incomplete_reason says what was not read. Absent on responses from before
   * it existed, and from a payload file: unknown, not complete.
   */
  complete?: boolean
  incomplete_reason?: string
  /**
   * Present when no vendor row could be given a `statement` figure in ONE
   * currency: the business's orgs keep their books in different currencies
   * (or several orgs and one records none — null in `currencies`). Each org's
   * lines are in its own currency and the rows add orgs together, so the gross
   * figures mix currencies too. A page asking for net states this instead of
   * printing vendor figures.
   */
  statement_unavailable?: { reason: 'mixed_currencies'; currencies: (string | null)[] }
  /** A budget-store client only: grand_total.budget as it was before the store (see pre_budget_store_total). */
  pre_budget_store_grand_budget?: number
}

// ============================================
// Wages Analysis (Phase 4)
// ============================================

export interface WagesAccountLine {
  account_name: string
  actual: number
  budget: number
  variance: number
  variance_percent: number
}

export interface WagesPayRunEntry {
  date: string
  period_start: string
  period_end: string
  gross_earnings: number
  tax: number
  super_amount: number
  net_pay: number
}

export interface WagesEmployeeLine {
  name: string
  position: string
  category: string
  employment_type?: string
  pay_frequency: string
  budget_per_period: number
  actual_total: number
  budget_total: number
  pay_runs: WagesPayRunEntry[]
  variance: number
  variance_percent: number
  /** 'roster': on the Payroll Report roster with a weekly salary, and not paid this month. */
  source: 'xero' | 'forecast' | 'both' | 'roster'
  /**
   * The Payroll Report roster gives this employee no weekly salary, so there
   * is no budget to measure them against: budget_total and variance are 0 and
   * every surface prints a dash. Only ever set on a roster-budgeted page.
   */
  budget_missing?: boolean
}

// WE.1b — one external-metrics series as the GET route returns it, threaded
// into the PDF so the entered inserts (Lumary clinic income, Hubstaff hours…)
// render as report pages. Shape mirrors /api/monthly-report/external-metrics.
export interface ExternalMetricSeriesData {
  id: string
  series_key: string
  display_name: string
  dimension_label: string
  measures: { key: string; label: string; format?: string }[]
  reconciles_to_account_name?: string | null
  reconcile_measure_key?: string | null
  values: { dimension_value: string; measure_key: string; scenario: 'actual' | 'budget'; value: number }[]
  tie?: {
    series_total: number
    account_actual: number
    account_name: string
    delta: number
    within_tolerance: boolean
    comparable: boolean
  } | null
}

/**
 * What produced a budget column on a page that resolves its own budget.
 *
 * The wages page reads a budget of its own rather than slicing the report's, so
 * it carries the resolver's three fields back with the figures. Everything a
 * reader is told about that column is derived from THIS, never from settings —
 * a client switched to the budget store whose version will not resolve has
 * budget_source='budget_version' in settings and no budget at all on the page.
 */
export interface BudgetProvenance {
  source: 'budget_version' | 'forecast' | 'none'
  /** The version's label / the forecast's name. */
  label?: string | null
  /** Why there is no budget, when the client is on the budget store. */
  reason?: import('@/lib/budgets/resolve-budget').NoBudgetReason | null
  /** Names the fiscal year in the absent sentence. */
  fiscal_year?: number | string | null
}

export interface WagesDetailData {
  accounts: WagesAccountLine[]
  /**
   * What the account-level Budget column on this page IS. The page resolves its
   * own budget — it is not a slice of the report's — so it carries its own
   * provenance back rather than letting the surface guess from settings.
   *
   * Optional: a response cached before this field existed has none, and is
   * rendered with exactly the words it carried then (see wagesYardstick).
   */
  budget_provenance?: BudgetProvenance
  /**
   * Is there a per-employee plan for this month at all? A forecast has one;
   * the approved budget is not split by employee, so a budget-store client
   * has one only when its Payroll Report roster supplies weekly salaries
   * (employee_roster). False: the per-employee Budget and Variance columns are
   * dashes rather than $0 against a full actual.
   *
   * Optional for the same reason budget_provenance is.
   */
  employee_plan_available?: boolean
  /**
   * Present only when the per-employee Budget came — or was meant to come —
   * from the Payroll Report roster's weekly salaries: no forecast employee
   * plan applied, and a roster gives someone a weekly salary.
   *
   * 'applied'      budgets are weekly salary × this month's pay runs, and a
   *                rostered employee who was not paid keeps a row and their
   *                budget. `missing` names the paid employees the roster gives
   *                no weekly salary; `unchecked` the unpaid ones with a weekly
   *                salary but no Xero employee record to say whether they were
   *                employed. When either is not empty, employee_totals.budget
   *                covers only the rest and is not printed as the team's budget.
   * 'unavailable'  the month's pay runs could not be counted in weeks without
   *                guessing; `reason` says why.
   */
  employee_roster?:
    | { status: 'applied'; missing: string[]; unchecked: string[] }
    | { status: 'unavailable'; reason: import('@/lib/monthly-report/wages-roster-budget').RosterBudgetUnavailableReason }
  employees: WagesEmployeeLine[]
  employee_totals: { actual: number; budget: number; variance: number }
  grand_total: { actual: number; budget: number; variance: number }
  payroll_available: boolean
  pay_run_dates: string[]
  /** WB.4 — five-Friday detection: more pay runs than the calendar's typical
   *  month is a budget-phasing note, not an overspend. Optional: older cached
   *  responses lack it. */
  phasing?: {
    pay_runs_in_month: number
    typical_runs: number
    calendar_type: string
    extra_run: boolean
  } | null
  /** WB.5 — PAY-TIES (warning-only): Σ payslip gross(+super when the account
   *  list includes a super account) vs the configured P&L wage accounts. */
  ties?: {
    payroll_gross: number
    payroll_super: number
    payroll_side: number
    accounts_actual: number
    includes_super_account: boolean
    delta: number
    within_tolerance: boolean
    comparable: boolean
  } | null
}

// ============================================
// Balance Sheet (Phase 27)
// ============================================

export type BalanceSheetRowType = 'section_header' | 'line_item' | 'subtotal' | 'net_assets'

export interface BalanceSheetRow {
  type: BalanceSheetRowType
  label: string
  current: number | null   // Current period actuals
  prior: number | null     // Prior period actuals
  variance: number | null  // current - prior
  variance_pct: number | null  // null = N/A (prior is 0)
  /**
   * Headings and totals only. 0 is a class (Asset, Total Liability, Net
   * Assets, Equity); 1 is a group inside one (Bank, Total Current Assets).
   * The page styles the two apart. Absent on rows built before it existed —
   * readers treat absent as 0.
   */
  depth?: 0 | 1
}

export type BalanceSheetCompare = 'yoy' | 'mom'

export interface BalanceSheetData {
  business_id: string
  report_date: string        // last day of report month, YYYY-MM-DD
  compare: BalanceSheetCompare
  current_label: string      // e.g. "Mar 2026"
  prior_label: string        // e.g. "Mar 2025"
  rows: BalanceSheetRow[]
  balances: boolean          // true if Total Asset - Total Liability === Total Equity
}

