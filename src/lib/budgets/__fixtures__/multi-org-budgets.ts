/**
 * Two consolidation parents on the budget store, as test data.
 *
 * DRAGON ROOFING & EASY HAIL — two AUD organisations, one approved FY27
 * version per organisation, shaped like Calxa's "FY27 Budget" (edited per org
 * in Calxa Budget Tools, dragon-ehc-monthly-report SKILL.md:19, 136-147).
 *
 *   - August actuals are the mirror as synced 15 Sep 2026, per organisation
 *     (audit work-dragon/compute-lines.out.txt): consolidated income 873,832.40,
 *     cost of sales 743,917.09, expenses 176,473.88, net profit (46,558.57).
 *   - August budgets are Calxa's August column, account by account (Dragon p9,
 *     p11-12: income 1,000,000, cost of sales 582,727, expenses 231,529, net
 *     profit 185,744), split between the two organisations the way Calxa's
 *     Current Year Budget page prints each organisation's own row (p18-20: the
 *     two Virtual Contractors rows, 22,000 and 11,000; the two Facebook Adverts
 *     rows, 22,800 and 3,200).
 *   - The other months follow Calxa's income targets (Jul 1,230,584, Aug-Nov
 *     1,000,000, Dec-Jan 500,000, Feb-Apr 600,000, May-Jun 800,000 — SKILL.md:19),
 *     every line scaled by the same factor. Only the August column and the
 *     income row's year are Calxa's figures; the rest of the year is shape.
 *   - Codes are the organisations' own (compute-lines.out.txt xero_accounts),
 *     including the codes the two organisations share for different accounts:
 *     477 is Dragon's "Wages and Salaries - Admin" and Easy Hail's "Wages and
 *     Salaries", 510 is Easy Hail's "Consultants" and Dragon's "Stripe Fees",
 *     401 Dragon's "Accounting" and Easy Hail's "Advertising", 430 Easy Hail's
 *     "Canvassing - Lead" and Dragon's "HR Costs". Codes marked `// illustrative`
 *     were not in the audit's output.
 *
 * IICT GROUP — three organisations (IICT (Aust) Pty Ltd AUD, IICT Group
 * Limited HKD, IICT Group Pty Ltd AUD), one business-level AUD version: Calxa's
 * IGP version "Updated 14-07-2023" as the import leaves it after the preview's
 * choices — 210 Membership income GST free mapped to 200, 221 Commissions
 * Received GST Free mapped to 220, 429 General Expenses kept budget-only
 * (decision 1; IICT-06, IICT-22). August budget is Calxa p2: income 314,012,
 * cost of sales 67,149, expenses 216,727, net profit 30,136.
 */

export const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
] as const

/** Calxa's FY27 consolidated income targets, as a multiple of August. */
const TARGET_FACTOR: Record<string, number> = {
  '2026-07': 1.230584, '2026-08': 1, '2026-09': 1, '2026-10': 1, '2026-11': 1,
  '2026-12': 0.5, '2027-01': 0.5, '2027-02': 0.6, '2027-03': 0.6, '2027-04': 0.6,
  '2027-05': 0.8, '2027-06': 0.8,
}

// ─── Dragon Roofing & Easy Hail ──────────────────────────────────────────────

export const DRAGON = 'c7df2983-5711-4959-8ec8-a48030d62666'
export const DRAGON_PROFILE = 'dragon-profile'
export const DRG = 'tenant-dragon'
export const EHC = 'tenant-easy-hail'

type Bucket = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
const CATEGORY: Record<Bucket, string> = {
  revenue: 'Revenue', cogs: 'Cost of Sales', opex: 'Operating Expenses',
  other_income: 'Other Income', other_expense: 'Other Expenses',
}

/** [tenant, code, name, type, August actual] */
const DRAGON_AUG_ACTUALS: Array<[string, string, string, Bucket, number]> = [
  [DRG, '270', 'Interest Income', 'revenue', 9.22], // illustrative code
  [DRG, '200.1', 'Sales - Insurance', 'revenue', 673_764.84],
  [DRG, '200.6', 'Sales - Metal Restoration', 'revenue', 15_911.18],
  [DRG, '200.2', 'Sales - Tile Repairs', 'revenue', 5_311.0],
  [DRG, '200.3', 'Sales - Tile Restoration', 'revenue', 25_813.67],
  [DRG, 'BT009', 'Electrical', 'cogs', 54_018.49],
  [DRG, '370', 'Engineers and Consultants', 'cogs', 33_078.04],
  [DRG, 'BT014', 'Metal - Roofing Materials', 'cogs', 75_998.18],
  [DRG, '330', 'Paint - Roofing Materials', 'cogs', 1_860.11],
  [DRG, 'BT011', 'QBCC - Home Warranty', 'cogs', 6_153.2],
  [DRG, 'BT012', 'Rubbish Removal', 'cogs', 10_402.39],
  [DRG, '300', 'Safety Rail / Edge Protection', 'cogs', 44_352.5],
  [DRG, '481', 'Sales Commission Sales Contractors', 'cogs', 10_079.92],
  [DRG, '350', 'Tradies Contractors', 'cogs', 472_604.0],
  [DRG, '401', 'Accounting', 'opex', 540.0],
  [DRG, '404', 'Bank Fees', 'opex', 662.66],
  [DRG, '400.12', 'Facebook Adverts', 'opex', 32_614.55],
  [DRG, '400.14', 'Google SEO', 'opex', 2_545.45],
  [DRG, '433', 'Insurance (433)', 'opex', 242.93],
  [DRG, '437', 'Interest Expense', 'opex', 59.87],
  [DRG, '441', 'Legal expenses', 'opex', 1_459.0],
  [DRG, '443', 'Licences and Fees', 'opex', 1_250.91], // illustrative code
  [DRG, '400.8', 'Marketing', 'opex', 9_932.91],
  [DRG, '449.1', 'Motor Vehicle Expenses', 'opex', 901.82], // illustrative code
  [DRG, '448', 'MV - Mini Cooper S - Fuel', 'opex', 1_196.05],
  [DRG, '433.1', 'MV - Rego and Insurance', 'opex', 477.43],
  [DRG, '453', 'Office Expenses', 'opex', 362.6],
  [DRG, '479', 'Recruitment Costs', 'opex', 154.99], // illustrative code
  [DRG, '469', 'Rent', 'opex', 313.64],
  [DRG, '1093', 'Staff Bonus and Incentives', 'opex', 1_460.0],
  [DRG, '485', 'Subscriptions', 'opex', 4_729.08],
  [DRG, '478', 'Superannuation - Admin', 'opex', 3_261.08],
  [DRG, '489', 'Telephone & Internet', 'opex', 108.18],
  [DRG, '451', 'Tolls and Parking', 'opex', 182.48],
  [DRG, '2300', 'Virtual Contractors', 'opex', 15_558.76],
  [DRG, '477', 'Wages and Salaries - Admin', 'opex', 27_175.72],
  [EHC, '201', 'Sales - Management Services', 'revenue', 151_658.84],
  [EHC, '202', 'Sales - Referral Fee', 'revenue', 1_363.65],
  [EHC, '481', 'Sales Commission Sales Contractors', 'cogs', 35_370.26],
  [EHC, '404', 'Bank Fees', 'opex', 158.32],
  [EHC, '430', 'Canvassing - Lead', 'opex', 3_675.0],
  [EHC, '510', 'Consultants', 'opex', 49_462.53],
  [EHC, '412', 'Consulting & Accounting', 'opex', 205.0],
  [EHC, '427.1', 'Filing Fees ASIC', 'opex', 329.0], // illustrative code
  [EHC, '441', 'Legal expenses', 'opex', 2_076.0],
  [EHC, '402', 'Marketing', 'opex', 175.7],
  [EHC, '485', 'Subscriptions', 'opex', 1_786.0],
  [EHC, '508', 'Virtual Contractors', 'opex', 13_416.22],
]

/** July income, for the Full Year page's Jul Actuals column (compute-lines.out.txt; Calxa p18 1,232,129). */
const DRAGON_JUL_INCOME: Record<string, number> = {
  [`${DRG}|200.1`]: 950_933.04,
  [`${DRG}|200.2`]: 27_955.81,
  [`${DRG}|200.3`]: 8_887.75,
  [`${DRG}|200.6`]: 28_243.86,
  [`${EHC}|201`]: 214_562.95,
  [`${EHC}|202`]: 1_545.47,
}

/**
 * [tenant, code, name, type, August budget]. Calxa's August budget, per
 * organisation. The income lines are Calxa's September column (p18), which is
 * also its August total of 1,000,000.
 */
const DRAGON_AUG_BUDGET: Array<[string, string, string, Bucket, number]> = [
  // Income — 1,000,000
  [DRG, '200.1', 'Sales - Insurance', 'revenue', 673_565],
  [DRG, '200.2', 'Sales - Tile Repairs', 'revenue', 57_264],
  [DRG, '200.3', 'Sales - Tile Restoration', 'revenue', 60_440],
  [DRG, '200.6', 'Sales - Metal Restoration', 'revenue', 5_133],
  [EHC, '200', 'Sales - Deposit', 'revenue', 74_144],
  [EHC, '201', 'Sales - Management Services', 'revenue', 128_638],
  [EHC, '202', 'Sales - Referral Fee', 'revenue', 816],
  // Cost of sales — 582,727
  [DRG, '310.1', 'Work Equipment Or Tools', 'cogs', 626], // illustrative code
  [DRG, '300', 'Safety Rail / Edge Protection', 'cogs', 36_343],
  [DRG, '330', 'Paint - Roofing Materials', 'cogs', 16_221],
  [DRG, '350', 'Tradies Contractors', 'cogs', 356_283],
  [DRG, '351', 'Warranty Claim Expense', 'cogs', 12_167],
  [DRG, '370', 'Engineers and Consultants', 'cogs', 8_292],
  [EHC, '481', 'Sales Commission Sales Contractors', 'cogs', 57_288],
  [DRG, 'BT009', 'Electrical', 'cogs', 9_572],
  [DRG, 'BT011', 'QBCC - Home Warranty', 'cogs', 7_540],
  [DRG, 'BT012', 'Rubbish Removal', 'cogs', 8_184],
  [DRG, 'BT014', 'Metal - Roofing Materials', 'cogs', 70_211],
  // Expenses — 231,529
  [DRG, '1093', 'Staff Bonus and Incentives', 'opex', 20_000],
  [DRG, '2300', 'Virtual Contractors', 'opex', 22_000],
  [EHC, '508', 'Virtual Contractors', 'opex', 11_000],
  [EHC, '477', 'Wages and Salaries', 'opex', 12_000],
  [DRG, '477', 'Wages and Salaries - Admin', 'opex', 26_023],
  [DRG, '478', 'Superannuation - Admin', 'opex', 3_123],
  [DRG, '448', 'MV - Mini Cooper S - Fuel', 'opex', 90],
  [DRG, '451', 'Tolls and Parking', 'opex', 46],
  [DRG, '1000', 'Lease of Vehicles', 'opex', 1_500],
  [DRG, '4540', 'Work Business Trip - Others', 'opex', 2_400],
  [EHC, '495', 'Work Business Trip - Director', 'opex', 360],
  [EHC, '510', 'Consultants', 'opex', 52_000],
  [DRG, '1921', 'Business Coaching', 'opex', 4_500],
  [DRG, '401', 'Accounting', 'opex', 700],
  [DRG, '441', 'Legal expenses', 'opex', 2_300],
  [DRG, '485', 'Subscriptions', 'opex', 7_206],
  [DRG, '400.8', 'Marketing', 'opex', 45],
  [EHC, '402', 'Marketing', 'opex', 4_000],
  [DRG, '400.14', 'Google SEO', 'opex', 1_818],
  [DRG, '400.15', 'Direct Mail', 'opex', 3_400], // illustrative code
  [DRG, '400.16', 'Hi Pages', 'opex', 1_500], // illustrative code
  [EHC, '488', 'Appointment Setting', 'opex', 2_430],
  [DRG, '400.12', 'Facebook Adverts', 'opex', 22_800],
  [EHC, '401.1', 'Facebook Adverts', 'opex', 3_200],
  [EHC, '430', 'Canvassing - Lead', 'opex', 20_000],
  [DRG, '469', 'Rent', 'opex', 315],
  [DRG, '404', 'Bank Fees', 'opex', 550],
  [DRG, '404.2', 'Square Fees', 'opex', 70], // illustrative code
  [DRG, '443', 'Licences and Fees', 'opex', 263],
  [DRG, '460', 'Gifts - Clients and Staff', 'opex', 225], // illustrative code
  [DRG, '433', 'Insurance (433)', 'opex', 126],
  [DRG, '478.5', 'Workcover', 'opex', 1_600], // illustrative code
  [DRG, '437', 'Interest Expense', 'opex', 600],
  [DRG, '453', 'Office Expenses', 'opex', 900],
  [DRG, '479', 'Recruitment Costs', 'opex', 1_519],
  [DRG, '482', 'Staff Training', 'opex', 350], // illustrative code
  [DRG, '483', 'Staff Amenities/Meeting', 'opex', 100], // illustrative code
  [DRG, '997', 'Referral Fee - Easy Hail', 'opex', 470],
]

export const DRAGON_VERSION_DRG = 'bv-fy27-dragon'
export const DRAGON_VERSION_EHC = 'bv-fy27-easy-hail'

function yearOf(august: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of FY_MONTHS) out[m] = Math.round(august * TARGET_FACTOR[m] * 100) / 100
  return out
}

function budgetLineRows(
  versionByTenant: Record<string, string>,
  businessId: string,
  lines: Array<[string | null, string, string, Bucket, number]>,
  months: (august: number) => Record<string, number> = yearOf,
) {
  const rows: any[] = []
  for (const [tenant, code, name, type, august] of lines) {
    for (const [month, amount] of Object.entries(months(august))) {
      if (amount === 0) continue
      rows.push({
        id: `bl-${rows.length + 1}`,
        budget_version_id: versionByTenant[tenant ?? ''],
        business_id: businessId,
        tenant_id: tenant,
        account_code: code,
        account_name: name,
        category: CATEGORY[type],
        account_type: type,
        month,
        amount,
      })
    }
  }
  return rows
}

export const DRAGON_SETTINGS = {
  id: 'b726e14d-3eb0-4027-88fa-07cde5fbba7d',
  business_id: DRAGON,
  sections: { cashflow: false, cogs_detail: true, opex_detail: true, revenue_detail: true, subscription_detail: true },
  show_prior_year: false,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  subscription_account_codes: ['485'],
  wages_account_names: [],
  pdf_layout: null,
  standing_commentary: null,
  budget_source: 'budget_version',
  expense_group_order: null,
}

/** In-memory tables, loosely typed so a test can reshape a row. */
export type MemoryTables = Record<string, any[]>

export function dragonState(overrides: { budgetSource?: 'forecast' | 'budget_version' } = {}): MemoryTables {
  const actuals = new Map<string, any>()
  for (const [tenant, code, name, type, aug] of DRAGON_AUG_ACTUALS) {
    actuals.set(`${tenant}|${code}`, {
      business_id: DRAGON_PROFILE,
      tenant_id: tenant,
      account_name: name,
      account_code: code,
      account_type: type,
      section: CATEGORY[type],
      monthly_values: {
        ...(DRAGON_JUL_INCOME[`${tenant}|${code}`] ? { '2026-07': DRAGON_JUL_INCOME[`${tenant}|${code}`] } : {}),
        '2026-08': aug,
      },
    })
  }
  return {
    businesses: [{ id: DRAGON, name: 'Dragon Roofing', consolidation_budget_mode: 'single' }],
    business_profiles: [{ id: DRAGON_PROFILE, business_id: DRAGON, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-drg', business_id: DRAGON, tenant_id: DRG, tenant_name: 'Dragon Roofing Pty Ltd', display_name: 'Dragon Roofing Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-ehc', business_id: DRAGON, tenant_id: EHC, tenant_name: 'EASY HAIL CLAIM PTY LTD', display_name: 'Easy Hail Claim Pty Ltd', display_order: 2, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [...actuals.values()],
    fx_rates: [],
    // The active FY2027 forecast is still there, and on 'forecast' it is the
    // budget: 7b90633d's August, the figures the audit printed (DRG-03).
    financial_forecasts: [{ id: 'fc-7b90633d', business_id: DRAGON_PROFILE, tenant_id: null, fiscal_year: 2027, is_active: true, deleted_at: null, updated_at: '2026-08-23T01:14:20Z' }],
    forecast_pl_lines: [
      { forecast_id: 'fc-7b90633d', account_name: 'Sales - Insurance', account_type: 'revenue', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-08': 503_748 } },
      { forecast_id: 'fc-7b90633d', account_name: 'Tradies Contractors', account_type: 'cogs', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-08': 300_707 } },
      { forecast_id: 'fc-7b90633d', account_name: 'Wages & Salaries', account_type: 'opex', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-08': 30_323.5 } },
    ],
    budget_versions: [
      { id: DRAGON_VERSION_DRG, business_id: DRAGON, tenant_id: DRG, fiscal_year: 2027, source: 'manual', currency: 'AUD', label: 'FY27 Budget', version_number: 1, effective_from: '2026-07', locked_at: '2026-09-16T00:00:00Z', months_covered: 12 },
      { id: DRAGON_VERSION_EHC, business_id: DRAGON, tenant_id: EHC, fiscal_year: 2027, source: 'manual', currency: 'AUD', label: 'FY27 Budget', version_number: 1, effective_from: '2026-07', locked_at: '2026-09-16T00:00:00Z', months_covered: 12 },
    ],
    budget_lines: budgetLineRows({ [DRG]: DRAGON_VERSION_DRG, [EHC]: DRAGON_VERSION_EHC }, DRAGON, DRAGON_AUG_BUDGET),
    account_mappings: [
      // A confirmed mapping from the forecast era: the wizard's "Wages & Salaries"
      // line onto Dragon's admin wages. The budget store's lines carry the
      // account's own code and name, so it has nothing to decide here.
      { business_id: DRAGON, xero_account_name: 'Wages and Salaries - Admin', xero_account_code: '477', forecast_pl_line_name: 'Wages & Salaries', report_category: 'Operating Expenses' },
    ],
    consolidation_elimination_rules: [],
    monthly_report_settings: [{ ...DRAGON_SETTINGS, budget_source: overrides.budgetSource ?? 'budget_version' }],
  }
}

// ─── IICT Group ──────────────────────────────────────────────────────────────

export const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'
export const IICT_PROFILE = 'iict-profile'
export const IAP = 'tenant-iap'
export const IGL = 'tenant-igl'
export const IGP = 'tenant-igp'
export const IICT_VERSION = 'bv-iict-updated-14-07-2023'

/** Calxa's implied HKD/AUD monthly averages (P4): Jul 0.183094, Aug 0.179536. */
export const HKD_AUD_AVERAGE: Record<string, number> = { '2026-07': 0.183094, '2026-08': 0.179536 }

export const IICT_SETTINGS = {
  id: 'settings-iict',
  business_id: IICT,
  sections: { revenue_detail: true, cogs_detail: true, opex_detail: true, subscription_detail: true },
  show_prior_year: false,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'budget_version',
  subscription_account_codes: ['418'],
  standing_commentary: null,
  expense_group_order: null,
  pdf_layout: null,
}

/** [code, name, type, August budget] — Calxa p2's August, business-level, AUD. */
const IICT_AUG_BUDGET: Array<[string, string, Bucket, number]> = [
  ['200', 'Membership income', 'revenue', 214_829.6], // the sheet's 210, mapped in the preview
  ['212', 'Membership Discounts', 'revenue', -3_807.4], // illustrative code
  ['220', 'Commissions Received', 'revenue', 102_989.8], // the sheet's 221, mapped in the preview
  ['310', 'Cost of Goods Sold', 'cogs', 67_149],
  ['312', 'Offshore Virtual Assistants', 'opex', 140_000],
  ['418', 'Dues & Subscriptions', 'opex', 14_839],
  ['477', 'Wages and Salaries', 'opex', 46_888],
  ['429', 'General Expenses', 'opex', 15_000], // budget-only: no organisation's Xero has 429
]

export function iictState(opts: {
  /** Every FY month's rate by default; pass the months to leave out. */
  omitRateMonths?: readonly string[]
  versionCurrency?: string | null
} = {}): MemoryTables {
  const omit = new Set(opts.omitRateMonths ?? [])
  return {
    businesses: [{ id: IICT, name: 'IICT Group Consolidated', consolidation_budget_mode: 'single' }],
    business_profiles: [{ id: IICT_PROFILE, business_id: IICT, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-iap', business_id: IICT, tenant_id: IAP, tenant_name: 'IICT (Aust) Pty Ltd', display_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-igl', business_id: IICT, tenant_id: IGL, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 2, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
      { id: 'c-igp', business_id: IICT, tenant_id: IGP, tenant_name: 'IICT Group Pty Ltd', display_name: 'IICT Group Pty Ltd', display_order: 3, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Commissions Received', account_code: '220', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-08': 32_454.82 } },
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Cost of Goods Sold', account_code: '310', account_type: 'cogs', section: 'Cost of Sales', monthly_values: { '2026-08': 104_077.07 } },
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Offshore Virtual Assistants', account_code: '312', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-08': 3_080 } },
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Dues & Subscriptions', account_code: '418', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-08': 15_647.59 } },
      // HKD, as IICT Group Limited's Xero holds it (v2-pl: Aug 1,628,444.86).
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-08': 1_628_444.86 } },
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Offshore Virtual Assistants', account_code: '312', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-08': 136_495.58 } },
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Dues & Subscriptions', account_code: '418', account_type: 'opex', section: 'Operating Expenses', monthly_values: { '2026-08': 4_213.13 } },
      { business_id: IICT_PROFILE, tenant_id: IGP, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-08': 61.71 } },
      // IGP's own 210 exists in its Xero (IICT-06 verdict), with no FY2027 movement.
      { business_id: IICT_PROFILE, tenant_id: IGP, account_name: 'Membership income GST free', account_code: '210', account_type: 'revenue', section: 'Revenue', monthly_values: { '2025-08': 150 } },
    ],
    fx_rates: FY_MONTHS.filter((m) => !omit.has(m)).map((m) => ({
      currency_pair: 'HKD/AUD',
      rate_type: 'monthly_average',
      period: `${m}-01`,
      rate: HKD_AUD_AVERAGE[m] ?? 0.18,
      source: 'oxr',
    })),
    // Both FY2027 forecasts are inactive (IICT-09): neither is a budget.
    financial_forecasts: [{ id: 'fc-88199866', business_id: IICT_PROFILE, tenant_id: null, fiscal_year: 2027, is_active: false, deleted_at: null, updated_at: '2026-08-23T00:24:50Z' }],
    forecast_pl_lines: [
      { forecast_id: 'fc-88199866', account_name: 'Wages and Salaries', account_type: 'opex', account_class: null, category: null, actual_months: {}, forecast_months: { '2026-08': 83_592 } },
    ],
    budget_versions: [
      { id: IICT_VERSION, business_id: IICT, tenant_id: null, fiscal_year: 2027, source: 'manual', currency: opts.versionCurrency === undefined ? 'AUD' : opts.versionCurrency, label: 'Updated 14-07-2023', version_number: 1, effective_from: '2026-07', locked_at: '2026-09-16T00:00:00Z', months_covered: 12 },
    ],
    budget_lines: budgetLineRows(
      { '': IICT_VERSION },
      IICT,
      IICT_AUG_BUDGET.map(([code, name, type, aug]) => [null, code, name, type, aug] as [null, string, string, Bucket, number]),
      // Calxa's own year is not proportional to August; August and a flat year is enough here.
      (aug) => Object.fromEntries(FY_MONTHS.map((m) => [m, aug])),
    ),
    account_mappings: [],
    consolidation_elimination_rules: [],
    monthly_report_settings: [IICT_SETTINGS],
  }
}

/**
 * A service-role Supabase client over in-memory tables. Honours the filters
 * the resolvers use — .eq/.in/.is/.not('col','is',null)/.gt/.order/.range/.limit —
 * because resolution IS a sequence of filters, and a harness that ignored
 * `.not()` would let an unlocked version resolve for the wrong reason.
 */
/**
 * The xero_pl_lines rows xero_pl_lines_wide_compat is built from: one per account
 * per month, accruals, not deleted. Readers that page by id (readAllRows) read the
 * table, because the view is a GROUP BY with no key to page by.
 */
function plLinesFromWide(wide: any[]): any[] {
  const rows: any[] = []
  for (const w of wide) {
    for (const [month, amount] of Object.entries((w.monthly_values ?? {}) as Record<string, number>)) {
      rows.push({
        id: `pl-${String(rows.length + 1).padStart(6, '0')}`,
        business_id: w.business_id,
        tenant_id: w.tenant_id,
        account_code: w.account_code,
        account_name: w.account_name,
        account_type: w.account_type,
        period_month: `${month}-01`,
        amount,
        basis: 'accruals',
        deleted_at: null,
      })
    }
  }
  return rows
}

export function memorySupabase(tables: Record<string, any[]>) {
  type Filter = [string, unknown, 'eq' | 'neq' | 'in' | 'is' | 'not-is' | 'gt']
  const build = (table: string, filters: Filter[] = [], order: { col: string; asc: boolean } | null = null): any => {
    const run = () => {
      // A test that gives only the view still has the table it is built from,
      // derived here at read time so a row a test reshapes after setup is the
      // same row in both. A test that sets xero_pl_lines itself keeps its own.
      const source = table === 'xero_pl_lines' && !tables.xero_pl_lines
        ? plLinesFromWide(tables.xero_pl_lines_wide_compat ?? [])
        : (tables[table] ?? [])
      let rows = source.filter((r) =>
        filters.every(([col, val, op]) => {
          const cell = r[col]
          if (op === 'eq') return cell === val
          if (op === 'neq') return cell !== val
          if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(cell)
          if (op === 'is') return val === null ? cell === null || cell === undefined : cell === val
          // readAllRows' keyset cursor: the page after the last id read. A NULL
          // cell is never greater than anything, as in Postgres.
          if (op === 'gt') return cell !== null && cell !== undefined && (cell as any) > (val as any)
          return val === null ? cell !== null && cell !== undefined : cell !== val
        }),
      )
      if (order) {
        const { col, asc } = order
        rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)))
      }
      return rows
    }
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => build(table, [...filters, [c, v, 'eq']], order),
      neq: (c: string, v: unknown) => build(table, [...filters, [c, v, 'neq']], order),
      in: (c: string, v: unknown[]) => build(table, [...filters, [c, v, 'in']], order),
      is: (c: string, v: unknown) => build(table, [...filters, [c, v, 'is']], order),
      not: (c: string, _op: string, v: unknown) => build(table, [...filters, [c, v, 'not-is']], order),
      gt: (c: string, v: unknown) => build(table, [...filters, [c, v, 'gt']], order),
      or: () => q,
      order: (c: string, o?: { ascending?: boolean }) => build(table, filters, { col: c, asc: o?.ascending ?? true }),
      range: (from: number, to: number) => Promise.resolve({ data: run().slice(from, to + 1), error: null }),
      limit: (n: number) => {
        const limited: any = Promise.resolve({ data: run().slice(0, n), error: null })
        limited.maybeSingle = async () => ({ data: run()[0] ?? null, error: null })
        return limited
      },
      single: async () => ({ data: run()[0] ?? null, error: run()[0] ? null : { message: 'not found' } }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: any, reject?: any) => Promise.resolve({ data: run(), error: null, count: run().length }).then(resolve, reject),
    }
    return q
  }
  return { from: (table: string) => build(table) }
}
