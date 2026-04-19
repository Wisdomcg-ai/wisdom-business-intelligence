/**
 * Multi-Tenant Consolidation — Account Alignment (Phase 34)
 *
 * Takes N tenants' P&L lines and produces:
 *   1. A deduplicated, sorted account universe across tenants
 *   2. Per-tenant columns where every universe row appears (absent accounts → $0 filler)
 *
 * Core design: the alignment key combines account_type AND normalized account_name
 * (Pitfall 4 from 34-RESEARCH.md). Two accounts with the same display name but different
 * account_type (e.g. "Bank Fees" as opex vs other_expense) stay separate rows.
 *
 * This module is pure — no Supabase, no async. Drives deterministic tests.
 */

import type { XeroPLLineLike, ConsolidationTenant, EntityColumn } from './types'

/**
 * Alignment key — combines account_type and normalized account_name.
 * MUST be lowercase + trimmed name + lowercase type + '::' separator.
 * Prevents Pitfall 4: same account_name under different account_type in different members
 * (e.g. "Bank Fees" as opex vs other_expense) stays separate.
 */
export function accountAlignmentKey(line: { account_type: string; account_name: string }): string {
  return `${line.account_type.toLowerCase().trim()}::${line.account_name.toLowerCase().trim()}`
}

/**
 * Xero sync can produce duplicate rows in xero_pl_lines for the same (business_id, tenant_id, account_name).
 * Mirror generate/route.ts:254-265: merge by account_name within a tenant, summing monthly_values.
 */
export function deduplicateLines(lines: XeroPLLineLike[]): XeroPLLineLike[] {
  const byName = new Map<string, XeroPLLineLike>()
  for (const line of lines) {
    const key = line.account_name
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...line, monthly_values: { ...line.monthly_values } })
      continue
    }
    // Merge monthly_values — sum overlapping months
    for (const [month, value] of Object.entries(line.monthly_values)) {
      existing.monthly_values[month] = (existing.monthly_values[month] ?? 0) + value
    }
    // If existing is missing account_code but dupe has it, take it
    if (!existing.account_code && line.account_code) existing.account_code = line.account_code
    if (!existing.section && line.section) existing.section = line.section
  }
  return Array.from(byName.values())
}

export interface AlignedAccount {
  key: string // 'revenue::sales - deposit'
  account_type: string
  account_name: string // display name from first member that had this account
  section: string // display section from first member that had this account
}

/**
 * Builds a deduplicated, sorted universe of accounts across all tenants' deduped lines.
 * Sort order: account_type (revenue, cogs, opex, other_income, other_expense) → account_name alpha.
 */
export function buildAlignedAccountUniverse(tenantDedupedLines: XeroPLLineLike[][]): AlignedAccount[] {
  const universe = new Map<string, AlignedAccount>()
  for (const tenantLines of tenantDedupedLines) {
    for (const line of tenantLines) {
      const key = accountAlignmentKey(line)
      if (!universe.has(key)) {
        universe.set(key, {
          key,
          account_type: line.account_type,
          account_name: line.account_name,
          section: line.section ?? '',
        })
      }
    }
  }
  const typeOrder: Record<string, number> = {
    revenue: 0,
    cogs: 1,
    opex: 2,
    other_income: 3,
    other_expense: 4,
  }
  return Array.from(universe.values()).sort((a, b) => {
    const ta = typeOrder[a.account_type.toLowerCase()] ?? 99
    const tb = typeOrder[b.account_type.toLowerCase()] ?? 99
    if (ta !== tb) return ta - tb
    return a.account_name.localeCompare(b.account_name)
  })
}

/**
 * Build per-tenant column from a tenant's deduped lines + the unified universe.
 * Every universe row MUST appear in the column. Absent-in-tenant rows get all-zero monthly_values.
 */
export function buildEntityColumn(
  tenant: ConsolidationTenant,
  tenantDedupedLines: XeroPLLineLike[],
  universe: AlignedAccount[],
  fyMonths: readonly string[],
): EntityColumn {
  const byKey = new Map<string, XeroPLLineLike>()
  for (const line of tenantDedupedLines) {
    byKey.set(accountAlignmentKey(line), line)
  }
  const zeroMonths = (): Record<string, number> => {
    const z: Record<string, number> = {}
    for (const m of fyMonths) z[m] = 0
    return z
  }
  const lines = universe.map((u) => {
    const existing = byKey.get(u.key)
    if (existing) {
      return existing
    }
    // Filler — absent in this tenant
    return {
      business_id: tenant.business_id,
      tenant_id: tenant.tenant_id,
      account_name: u.account_name,
      account_code: null,
      account_type: u.account_type,
      section: u.section,
      monthly_values: zeroMonths(),
    } satisfies XeroPLLineLike
  })
  return {
    connection_id: tenant.connection_id,
    tenant_id: tenant.tenant_id,
    display_name: tenant.display_name,
    display_order: tenant.display_order,
    functional_currency: tenant.functional_currency,
    lines,
  }
}
