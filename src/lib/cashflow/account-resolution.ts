/**
 * Account resolution helpers — bridge between keyword matching (current behaviour)
 * and explicit account ID lookup (Phase 28.1+ when use_explicit_accounts=true).
 *
 * The engine receives PLLine rows which carry account_code + account_name.
 * Settings store xero_account_id (UUID) AND we have xero_accounts as a lookup
 * table to go UUID → code/name.
 *
 * This module provides `resolve*` helpers that check settings first (if
 * configured) and fall back to keyword matching. Used in Phase 28.2 when we
 * wire up algorithm changes. Exported here now so Phase 28.1 provides the
 * foundation without requiring the algorithm switch.
 */

import { isDepreciationExpense } from './engine'
import type { PLLine } from '@/app/finances/forecast/types'

/** Minimal shape of CashflowCalxaSettings needed for resolution */
export interface AccountResolutionSettings {
  use_explicit_accounts?: boolean
  depreciation_expense_account_id?: string | null
  depreciation_accumulated_account_ids?: string[]
  wages_expense_account_id?: string | null
  super_expense_account_id?: string | null
  super_payable_account_id?: string | null
  bank_account_ids?: string[]
  debtors_account_id?: string | null
  creditors_account_id?: string | null
  gst_collected_account_id?: string | null
  gst_paid_account_id?: string | null
  payg_wh_liability_account_id?: string | null
  company_tax_liability_account_id?: string | null
}

/**
 * A Xero Chart of Accounts entry, used to resolve xero_account_id (UUID)
 * into account_code and account_name that match PLLine rows.
 */
export interface XeroAccountRef {
  xero_account_id: string
  account_code: string | null
  account_name: string
}

/** Build a quick lookup: xero_account_id UUID → account_code + account_name */
export function buildAccountLookup(accounts: XeroAccountRef[]): Map<string, XeroAccountRef> {
  return new Map(accounts.map(a => [a.xero_account_id, a]))
}

/**
 * Match a PLLine against a set of configured xero_account_ids.
 * Uses the xero_accounts lookup to translate the UUID(s) to code/name for
 * comparison against the PLLine.
 */
export function lineMatchesAccountIds(
  line: PLLine,
  xeroAccountIds: string[],
  lookup: Map<string, XeroAccountRef>
): boolean {
  for (const id of xeroAccountIds) {
    const ref = lookup.get(id)
    if (!ref) continue
    // Match by code when available (most precise), otherwise by name
    if (ref.account_code && line.account_code === ref.account_code) return true
    if (line.account_name === ref.account_name) return true
  }
  return false
}

/**
 * Is this P&L line a depreciation/amortisation account?
 * Uses explicit account ID if settings configured, otherwise falls back to keyword match.
 */
export function resolveIsDepreciation(
  line: PLLine,
  settings: AccountResolutionSettings | null,
  lookup: Map<string, XeroAccountRef>
): boolean {
  if (settings?.use_explicit_accounts && settings.depreciation_expense_account_id) {
    return lineMatchesAccountIds(line, [settings.depreciation_expense_account_id], lookup)
  }
  return isDepreciationExpense(line.account_name)
}

/**
 * Is this P&L line the configured wages expense account?
 * Only returns true if settings are configured; otherwise returns false
 * (current engine uses keyword matching via isEmploymentExpense directly).
 */
export function resolveIsWagesExpense(
  line: PLLine,
  settings: AccountResolutionSettings | null,
  lookup: Map<string, XeroAccountRef>
): boolean {
  if (settings?.use_explicit_accounts && settings.wages_expense_account_id) {
    return lineMatchesAccountIds(line, [settings.wages_expense_account_id], lookup)
  }
  return false
}
