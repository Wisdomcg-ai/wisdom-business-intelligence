/**
 * Dragon Roofing & Easy Hail and IICT Group, as the consolidated route reads
 * them: the in-memory tables, a coach's auth client, and the August 2026
 * ledger lines read off the P&L mirror on 15 Sep 2026 (the audit's
 * compute-lines and v2-pl dumps). Shared by the consolidated page tests.
 *
 * The vi.mock calls stay in each test file (they are hoisted there); this
 * module only builds what they hand back.
 */

type Op = 'eq' | 'in' | 'is'

/** Service-role client over in-memory tables (the consolidated route.test.ts shape). */
export function mockSupabase(rowsByTable: Record<string, any[]>, failing: Record<string, string> = {}) {
  const matchAll = (rows: any[], filters: Array<[string, unknown, Op]>) =>
    rows.filter((r) =>
      filters.every(([col, val, op]) => {
        const cell = r[col]
        if (op === 'eq') return cell === val
        if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(cell)
        return val === null ? cell === null || cell === undefined : cell === val
      }),
    )
  const buildQuery = (table: string, filters: Array<[string, unknown, Op]> = []): any => {
    const error = failing[table] ? { message: failing[table] } : null
    const ex = () => (error ? null : matchAll(rowsByTable[table] ?? [], filters))
    return {
      eq: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'eq']]),
      in: (col: string, val: unknown[]) => buildQuery(table, [...filters, [col, val, 'in']]),
      is: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'is']]),
      order: () => buildQuery(table, filters),
      limit: (n: number) => Promise.resolve({ data: ex()?.slice(0, n) ?? null, error }),
      single: () => Promise.resolve({ data: ex()?.[0] ?? null, error: error ?? (ex()?.[0] ? null : { message: 'not found' }) }),
      maybeSingle: () => Promise.resolve({ data: ex()?.[0] ?? null, error }),
      then: (resolve: any) => Promise.resolve({ data: ex(), error }).then(resolve),
    }
  }
  return { from: (table: string) => ({ select: () => buildQuery(table) }) }
}

function chainable(data: any): any {
  const chain: any = {
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    limit: (n: number) => Promise.resolve({ data: data ? [data].slice(0, n) : [], error: null }),
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: data ? null : { message: 'not found' } }),
    then: (resolve: any) => Promise.resolve({ data: data ? [data] : [], error: null }).then(resolve),
  }
  return chain
}

/** A coach assigned to the business. */
export function coachAuthClient(businessId: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'businesses') return { select: () => chainable({ id: businessId }) }
      if (table === 'system_roles') return { select: () => chainable({ role: 'coach' }) }
      return { select: () => chainable(null) }
    },
  }
}

export const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

const settingsRow = (businessId: string, extra: Record<string, unknown> = {}) => ({
  id: `settings-${businessId}`,
  business_id: businessId,
  sections: { revenue_detail: true, cogs_detail: true, opex_detail: true, subscription_detail: true },
  show_prior_year: false,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'forecast',
  subscription_account_codes: [],
  standing_commentary: null,
  expense_group_order: null,
  pdf_layout: null,
  ...extra,
})

// ─── Dragon Roofing & Easy Hail ──────────────────────────────────────────────

export const DRAGON = 'c7df2983-5711-4959-8ec8-a48030d62666'
export const DRAGON_PROFILE = 'a1657c67-a12f-41e0-a312-ba90180e864b'
export const DRG = '42735fc3-21f2-4668-9783-93ce0f66f481'
export const EHC = '3b67e5b6-780c-4158-831c-82293f34ca04'

/** Calxa p11-12's nine groups, spelling corrected (setup-dragon A08). */
export const DRAGON_GROUP_ORDER = [
  'Employment Expense', 'Motor Vehicle Expense', 'Travel & Accommodation', 'Professional Expense',
  'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense', 'Bank and Other Fees', 'Other Operating Expenses',
]

type Ledger = [name: string, code: string, type: string, aug: number, jul?: number]

/** August 2026 per org, compute-lines.out.txt: every account with money in August. */
const DRAGON_LEDGER: Ledger[] = [
  ['Interest Income', '270', 'revenue', 9.22],
  ['Sales - Insurance', '200.1', 'revenue', 673_764.84, 950_933.04],
  ['Sales - Metal Restoration', '200.6', 'revenue', 15_911.18, 28_243.86],
  ['Sales - Tile Repairs', '200.2', 'revenue', 5_311.0, 27_955.81],
  ['Sales - Tile Restoration', '200.3', 'revenue', 25_813.67, 8_887.75],
  ['Electrical', 'BT009', 'cogs', 54_018.49],
  ['Engineers and Consultants', '370', 'cogs', 33_078.04],
  ['Metal - Roofing Materials', 'BT014', 'cogs', 75_998.18],
  ['Paint - Roofing Materials', '330', 'cogs', 1_860.11],
  ['QBCC - Home Warranty', 'BT011', 'cogs', 6_153.2],
  ['Rubbish Removal', 'BT012', 'cogs', 10_402.39],
  ['Safety Rail / Edge Protection', '300', 'cogs', 44_352.5],
  ['Sales Commission Sales Contractors', '481', 'cogs', 10_079.92],
  ['Tradies Contractors', '350', 'cogs', 472_604.0],
  ['Accounting', '401', 'opex', 540.0],
  ['Bank Fees', '404', 'opex', 662.66],
  ['Facebook Adverts', '400.12', 'opex', 32_614.55],
  ['Google SEO', '400.14', 'opex', 2_545.45],
  ['Insurance (433)', '433', 'opex', 242.93],
  ['Interest Expense', '437', 'opex', 59.87],
  ['Legal expenses', '441', 'opex', 1_459.0],
  ['Licences and Fees', '443', 'opex', 1_250.91],
  ['Marketing', '400.8', 'opex', 9_932.91],
  ['Motor Vehicle Expenses', '449', 'opex', 901.82],
  ['MV - Mini Cooper S - Fuel', '448', 'opex', 1_196.05],
  ['MV - Rego and Insurance', '433.1', 'opex', 477.43],
  ['Office Expenses', '453', 'opex', 362.6],
  ['Recruitment Costs', '1094', 'opex', 154.99],
  ['Rent', '469', 'opex', 313.64],
  ['Staff Bonus and Incentives', '1093', 'opex', 1_460.0],
  ['Subscriptions', '485', 'opex', 4_729.08],
  ['Superannuation - Admin', '478', 'opex', 3_261.08],
  ['Telephone & Internet', '489', 'opex', 108.18],
  ['Tolls and Parking', '451', 'opex', 182.48],
  ['Virtual Contractors', '2300', 'opex', 15_558.76],
  ['Wages and Salaries - Admin', '477', 'opex', 27_175.72],
  // Dormant: no money in the year, the rows Calxa suppresses (DRG-14).
  ['Lease of Vehicles', '1000', 'opex', 0],
  ['Business Coaching', '1921', 'opex', 0],
  ['FBT Employee Contribution', '205', 'other_income', 0],
]

const EASY_HAIL_LEDGER: Ledger[] = [
  ['Sales - Management Services', '201', 'revenue', 151_658.84, 214_562.95],
  ['Sales - Referral Fee', '202', 'revenue', 1_363.65, 1_545.47],
  ['Sales Commission Sales Contractors', '481', 'cogs', 35_370.26],
  ['Bank Fees', '404', 'opex', 158.32],
  ['Canvassing - Lead', '430', 'opex', 3_675.0],
  ['Consultants', '510', 'opex', 49_462.53],
  ['Consulting & Accounting', '412', 'opex', 205.0],
  ['Filing Fees ASIC', '455', 'opex', 329.0],
  ['Legal expenses', '441', 'opex', 2_076.0],
  ['Marketing', '402', 'opex', 175.7],
  ['Subscriptions', '485', 'opex', 1_786.0],
  ['Virtual Contractors', '508', 'opex', 13_416.22],
  ['Work Business Trip - Director', '495', 'opex', 0],
]

/** Setup-dragon C02: every expense account's group. Income and COGS print flat (C03). */
const DRAGON_GROUPS: Record<string, string> = {
  'Staff Bonus and Incentives': 'Employment Expense',
  'Virtual Contractors': 'Employment Expense',
  'Wages and Salaries - Admin': 'Employment Expense',
  'Superannuation - Admin': 'Employment Expense',
  'MV - Rego and Insurance': 'Motor Vehicle Expense',
  'Motor Vehicle Expenses': 'Motor Vehicle Expense',
  'MV - Mini Cooper S - Fuel': 'Motor Vehicle Expense',
  'Tolls and Parking': 'Motor Vehicle Expense',
  'Lease of Vehicles': 'Travel & Accommodation',
  'Work Business Trip - Director': 'Travel & Accommodation',
  Consultants: 'Professional Expense',
  'Consulting & Accounting': 'Professional Expense',
  'Business Coaching': 'Professional Expense',
  Accounting: 'Professional Expense',
  'Legal expenses': 'Professional Expense',
  Subscriptions: 'IT Hardware and Software',
  Marketing: 'Marketing and Advertising',
  'Google SEO': 'Marketing and Advertising',
  'Facebook Adverts': 'Marketing and Advertising',
  'Canvassing - Lead': 'Marketing and Advertising',
  Rent: 'Occupancy Expense',
  'Telephone & Internet': 'Occupancy Expense',
  'Bank Fees': 'Bank and Other Fees',
  'Filing Fees ASIC': 'Bank and Other Fees',
  'Licences and Fees': 'Bank and Other Fees',
  'Insurance (433)': 'Other Operating Expenses',
  'Interest Expense': 'Other Operating Expenses',
  'Office Expenses': 'Other Operating Expenses',
  'Recruitment Costs': 'Other Operating Expenses',
}

const plRows = (profile: string, tenant: string, ledger: Ledger[]) =>
  ledger.map(([account_name, account_code, account_type, aug, jul]) => ({
    business_id: profile,
    tenant_id: tenant,
    account_name,
    account_code,
    account_type,
    section: '',
    monthly_values: { '2026-07': jul ?? 0, '2026-08': aug },
  }))

export function dragonState(opts: { groups?: boolean } = {}) {
  const groups = opts.groups ?? true
  return {
    businesses: [{ id: DRAGON, name: 'Dragon Roofing', consolidation_budget_mode: 'per_tenant' }],
    business_profiles: [{ id: DRAGON_PROFILE, business_id: DRAGON, fiscal_year_start: 7 }],
    xero_connections: [
      { id: '9eb65be5-c458-480a-aaf8-802fcd1763ff', business_id: DRAGON, tenant_id: DRG, tenant_name: 'Dragon Roofing Pty Ltd', display_name: 'Dragon Roofing Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'd85f3cef-6549-452b-b3a6-8e2412db752a', business_id: DRAGON, tenant_id: EHC, tenant_name: 'EASY HAIL CLAIM PTY LTD', display_name: 'EASY HAIL CLAIM PTY LTD', display_order: 2, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [...plRows(DRAGON_PROFILE, DRG, DRAGON_LEDGER), ...plRows(DRAGON_PROFILE, EHC, EASY_HAIL_LEDGER)],
    fx_rates: [],
    financial_forecasts: [],
    forecast_pl_lines: [],
    consolidation_elimination_rules: [],
    account_mappings: groups
      ? Object.entries(DRAGON_GROUPS).map(([name, group]) => ({ business_id: DRAGON, xero_account_name: name, report_subcategory: group }))
      : [],
    monthly_report_settings: [settingsRow(DRAGON, { expense_group_order: groups ? DRAGON_GROUP_ORDER : null, subscription_account_codes: ['485'] })],
  }
}

// ─── IICT Group ──────────────────────────────────────────────────────────────

export const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'
export const IICT_PROFILE = '6c0dfadb-4229-4fc2-89eb-ec064d24511b'
export const IAP = '1d83c9a4-bf6d-448f-bb87-88e2684317bf'
export const IGL = 'de943481-389d-4134-b0af-410f025f53c2'
export const IGP = '44582ebf-ec15-414b-9f20-8706967257f3'

/** HKD/AUD monthly averages stored 15 Sep 2026 (Calxa's implied rates). */
export const HKD_AUD_AVERAGE: Record<string, number> = { '2026-06': 0.1851, '2026-07': 0.1830919, '2026-08': 0.1795357 }

export function iictState() {
  return {
    businesses: [{ id: IICT, name: 'IICT Group', consolidation_budget_mode: 'single' }],
    business_profiles: [{ id: IICT_PROFILE, business_id: IICT, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c69934d7-07b7-4cfb-a69d-052def1ee7cc', business_id: IICT, tenant_id: IAP, tenant_name: 'IICT (Aust) Pty Ltd', display_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: '3688d88e-55c1-4e0a-b0a4-df32d8735d7c', business_id: IICT, tenant_id: IGL, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 2, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
      { id: 'igp-connection', business_id: IICT, tenant_id: IGP, tenant_name: 'IICT Group Pty Ltd', display_name: 'IICT Group Pty Ltd', display_order: 3, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_pl_lines_wide_compat: [
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Commissions Received', account_code: '260', account_type: 'revenue', section: '', monthly_values: { '2026-07': 31_707.37, '2026-08': 32_455 } },
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: '', monthly_values: { '2026-07': 2_066_024.18, '2026-08': 1_628_444.86 } },
      { business_id: IICT_PROFILE, tenant_id: IGP, account_name: 'Membership income', account_code: '200', account_type: 'revenue', section: '', monthly_values: { '2026-08': 62 } },
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Dues & Subscriptions', account_code: '418', account_type: 'opex', section: '', monthly_values: { '2026-07': 25_000, '2026-08': 15_647.59 } },
      { business_id: IICT_PROFILE, tenant_id: IGL, account_name: 'Dues & Subscriptions', account_code: '418', account_type: 'opex', section: '', monthly_values: { '2026-07': 3_000, '2026-08': 4_213.13 } },
      { business_id: IICT_PROFILE, tenant_id: IGP, account_name: 'Dues & Subscriptions', account_code: '418', account_type: 'opex', section: '', monthly_values: { '2026-07': 150, '2026-08': 163.64 } },
      // Posted to years ago, nothing in FY2027: the all-zero Other Income section (IICT-13).
      { business_id: IICT_PROFILE, tenant_id: IAP, account_name: 'Interest Income', account_code: '270', account_type: 'other_income', section: '', monthly_values: { '2024-03': 4.11 } },
    ],
    fx_rates: [
      ...FY_MONTHS.map((m) => ({ currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: `${m}-01`, rate: HKD_AUD_AVERAGE[m] ?? 0.18, source: 'oxr' })),
      { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-06-01', rate: HKD_AUD_AVERAGE['2026-06'], source: 'oxr' },
    ],
    financial_forecasts: [],
    forecast_pl_lines: [],
    consolidation_elimination_rules: [],
    account_mappings: [
      { business_id: IICT, xero_account_name: 'Dues & Subscriptions', report_subcategory: 'Other Operating Expenses' },
    ],
    monthly_report_settings: [settingsRow(IICT, { subscription_account_codes: ['418'], expense_group_order: ['Employment Expense', 'Other Operating Expenses'] })],
  }
}

export async function generateAsCoach(POST: (req: any) => Promise<Response>, businessId: string) {
  const req = new Request('http://localhost/api/monthly-report/consolidated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId, report_month: '2026-08', fiscal_year: 2027 }),
  })
  const res = await POST(req as any)
  return { status: res.status, json: (await res.json()) as any }
}
