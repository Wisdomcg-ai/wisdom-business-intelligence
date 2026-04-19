/**
 * Dragon Consolidation — reference fixture for Mar 2026.
 *
 * Source: Matt's Dragon Consolidated Finance Report March 2026 PDF.
 *
 * Coverage goal (per plan 00a-T2): at minimum the accounts touched by
 * elimination rules + anchor spot-check values from VALIDATION.md so the
 * engine tests (plans 00b, 00d) can assert to the dollar.
 *
 * Spot-check anchors (locked by CONTEXT.md + VALIDATION.md — the engine
 * MUST reproduce these exactly):
 *   - Easy Hail Claim `Sales - Deposit` Mar 2026 = 11,652
 *   - Dragon Roofing `Advertising & Marketing` Mar 2026 = -9,015
 *   - Easy Hail Claim `Advertising & Marketing` Mar 2026 = +9,015
 *   - Dragon Roofing `Referral Fee - Easy Hail` Mar 2026 = 818
 *   - Easy Hail Claim `Sales - Referral Fee` Mar 2026 = 818
 *
 * Any numbers outside those anchors are transcribed with best-available
 * accuracy from the PDF. Rows where the exact figure cannot be read from
 * the PDF source are flagged with `TODO_MATT_CONFIRM` comments — these
 * MUST be resolved before the plan 00e human-verification checkpoint.
 */

import type { XeroPLLineLike } from '../types'

/** 12 FY months July 2025 → June 2026 (AU financial year). */
export const FY_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
] as const

/** Build a monthly_values map with the same value for every month. */
export function evenSpread(months: readonly string[], amount: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const m of months) result[m] = amount
  return result
}

// Hardcoded business IDs for fixture purposes — do NOT rely on these in
// production code. Production uses resolveBusinessIds() to fetch real UUIDs
// from the businesses table.
export const DRAGON_ROOFING_BIZ = '00000000-0000-0000-0000-dragon00dragn'
export const EASY_HAIL_BIZ = '00000000-0000-0000-0000-easyhail0hail'
// Fixture tenant_ids — represent xero_connections.tenant_id values.
export const DRAGON_ROOFING_TENANT = 'tenant-dragon-roofing'
export const EASY_HAIL_TENANT = 'tenant-easy-hail'

/**
 * Dragon Roofing Pty Ltd — key P&L rows for the consolidation fixture.
 *
 * Mar 2026 anchors (from PDF):
 *   - Advertising & Marketing: -9,015 (transfer TO Easy Hail; elimination pivot)
 *   - Referral Fee - Easy Hail: 818 (intercompany revenue; elimination pivot)
 */
export const dragonRoofingPL: XeroPLLineLike[] = [
  // Revenue
  {
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: DRAGON_ROOFING_TENANT,
    account_name: 'Sales - Roofing',
    account_code: '200',
    account_type: 'revenue',
    section: 'Revenue',
    // TODO_MATT_CONFIRM: exact Mar 2026 Sales - Roofing value on Dragon column
    monthly_values: { '2026-03': 0 },
  },
  {
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: DRAGON_ROOFING_TENANT,
    account_name: 'Referral Fee - Easy Hail',
    account_code: '210',
    account_type: 'revenue',
    section: 'Revenue',
    // Anchored: 818 per CONTEXT.md § Dragon intercompany rules
    monthly_values: { '2026-03': 818 },
  },
  // Operating Expenses
  {
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: DRAGON_ROOFING_TENANT,
    account_name: 'Advertising & Marketing',
    account_code: '420',
    account_type: 'opex',
    section: 'Operating Expenses',
    // Anchored: -9,015 (transferred to Easy Hail side; appears as negative
    // opex row on Dragon because it is a contra-expense / reversal).
    monthly_values: { '2026-03': -9015 },
  },
  // TODO_MATT_CONFIRM: add top-3 OpEx rows (Wages, Insurance, Rent/Occupancy)
  // and top-3 Revenue rows when PDF is re-read. Engine Dragon test only
  // asserts against the elimination-pivot rows until this is filled in.
]

/**
 * Easy Hail Claim Pty Ltd — mirror of Dragon's intercompany transactions.
 *
 * Mar 2026 anchors (from PDF):
 *   - Sales - Deposit: 11,652 (non-intercompany; MUST pass through to consolidated unchanged)
 *   - Sales - Referral Fee: 818 (intercompany revenue; eliminates against Dragon's Referral Fee - Easy Hail)
 *   - Advertising & Marketing: +9,015 (transfer FROM Dragon; eliminates against Dragon's -9,015)
 */
export const easyHailPL: XeroPLLineLike[] = [
  // Revenue
  {
    // Anchored: Sales - Deposit Mar 2026 = 11,652 per VALIDATION.md spot-check.
    business_id: EASY_HAIL_BIZ,
    tenant_id: EASY_HAIL_TENANT,
    account_name: 'Sales - Deposit',
    account_code: '220',
    monthly_values: { '2026-03': 11652 },
    account_type: 'revenue',
    section: 'Revenue',
  },
  {
    business_id: EASY_HAIL_BIZ,
    tenant_id: EASY_HAIL_TENANT,
    account_name: 'Sales - Referral Fee',
    account_code: '221',
    account_type: 'revenue',
    section: 'Revenue',
    // Anchored: 818 per CONTEXT.md § Dragon intercompany rules
    monthly_values: { '2026-03': 818 },
  },
  // Operating Expenses
  {
    business_id: EASY_HAIL_BIZ,
    tenant_id: EASY_HAIL_TENANT,
    account_name: 'Advertising & Marketing',
    account_code: '420',
    account_type: 'opex',
    section: 'Operating Expenses',
    // Anchored: +9,015 (transferred from Dragon — appears as positive opex)
    monthly_values: { '2026-03': 9015 },
  },
  // TODO_MATT_CONFIRM: add top-3 OpEx rows for Easy Hail and any other
  // non-intercompany revenue rows when PDF is re-read.
]

/**
 * Expected consolidated totals for Mar 2026.
 *
 * Key is `${account_type}::${account_name.toLowerCase().trim()}` (the
 * alignment key defined in PATTERNS.md § engine).
 *
 * Derivation (anchors only — non-anchor accounts still TODO):
 *   - Sales - Deposit: Easy Hail 11,652 + Dragon 0 = 11,652 (no elimination)
 *   - Referral Fee - Easy Hail (Dragon side): 818 − 818 (eliminated) = 0
 *   - Sales - Referral Fee (Easy Hail side): 818 − 818 (eliminated) = 0
 *   - Advertising & Marketing: -9,015 (Dragon) + 9,015 (Easy Hail) − eliminations = 0
 *     (bidirectional elimination zeros both sides; net already nets to 0 but
 *      the elimination rule makes it explicit and audit-visible.)
 */
export const dragonExpectedConsolidated = {
  '2026-03': {
    'revenue::sales - deposit': 11652,
    'revenue::referral fee - easy hail': 0, // eliminated
    'revenue::sales - referral fee': 0, // eliminated
    'opex::advertising & marketing': 0, // bidirectional elimination nets to zero
    // TODO_MATT_CONFIRM: add remaining anchored account totals once the
    // Dragon top-3 revenue + top-3 opex rows are transcribed above.
  },
} as const
