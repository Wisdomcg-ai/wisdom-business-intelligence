/**
 * Multi-Tenant Consolidated Balance Sheet — Phase 34, Iteration 34.1.
 *
 * Companion to engine.ts (P&L). One business, multiple Xero tenants. The BS
 * engine:
 *   1. Loads the business + its active, consolidation-included tenants from
 *      xero_connections (reuses loadBusinessContext from engine.ts).
 *   2. Fetches xero_balance_sheet_lines per tenant.
 *   3. Applies FX translation at CLOSING SPOT rate (not monthly-average like P&L).
 *   4. Applies ONLY `intercompany_loan` elimination rules — both sides zeroed
 *      (Pitfall 5 — the loan payable on A's books AND the loan receivable on
 *      B's books both disappear in the consolidated column).
 *   5. Computes a Translation Reserve (CTA) equity line = residual needed to
 *      restore Assets = Liabilities + Equity after FX translation. Dragon
 *      (AUD-only) yields CTA = 0; IICT (with HKD member) yields non-zero CTA.
 *
 * The P&L engine filters out `intercompany_loan` rules (those apply to the BS
 * only). This engine consumes ONLY `intercompany_loan` rules (the inverse).
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import type {
  ConsolidationBusiness,
  ConsolidationTenant,
  XeroPLLineLike,
  EliminationRule,
} from './types'
import { loadBusinessContext } from './engine'
import { loadEliminationRulesForBusiness, matchRuleToLines } from './eliminations'
import {
  buildAlignedAccountUniverse,
  accountAlignmentKey,
  deduplicateLines,
  type AlignedAccount,
} from './account-alignment'

/** A single balance-sheet row in the consolidated/per-tenant output. */
export interface BSRow {
  account_type: 'asset' | 'liability' | 'equity' | string
  account_name: string
  section: string
  /** Balance AS OF the report date (a single number — not a month map). */
  balance: number
}

/** Per-tenant column in the consolidated BS response. */
export interface BSEntityColumn {
  connection_id: string
  tenant_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  rows: BSRow[]
}

/** One elimination entry (intercompany loan — both sides zeroed). */
export interface BSEliminationEntry {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  /** Negative — reduces the consolidated total for this account. */
  amount: number
  source_tenant_id: string
  source_amount: number
}

/** Full consolidated BS response shape. */
export interface ConsolidatedBalanceSheet {
  business: ConsolidationBusiness
  asOfDate: string
  byTenant: BSEntityColumn[]
  eliminations: BSEliminationEntry[]
  consolidated: {
    rows: BSRow[]
    /** CTA / Translation Reserve; 0 for AUD-only consolidations. */
    translationReserve: number
  }
  /** Shape matches ConsolidatedReport.fx_context for consistency. */
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    tenants_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
  }
}

export interface BuildBalanceSheetOpts {
  businessId: string
  /** 'YYYY-MM-DD' — month-end date by convention. */
  asOfDate: string
  /**
   * Optional FX translator invoked once per tenant whose functional_currency
   * differs from the business's presentation_currency. Tenants sharing the
   * presentation currency are short-circuited (pure pass-through).
   *
   * Returns:
   *   - `translated` — same-shape lines in presentation currency
   *   - `missing`    — list of (currency_pair, period) pairs with no rate
   *   - `ratesUsed`  — flat map: currency pair -> rate (single-rate BS)
   */
  translate?: (
    tenant: ConsolidationTenant,
    lines: XeroPLLineLike[],
  ) => Promise<{
    translated: XeroPLLineLike[]
    missing: Array<{ currency_pair: string; period: string }>
    ratesUsed: Record<string, number>
  }>
}

/**
 * Load xero_balance_sheet_lines grouped by tenant for a business.
 */
export async function loadBSTenantSnapshots(
  supabase: any,
  businessId: string,
  tenants: ConsolidationTenant[],
): Promise<Array<{ tenant: ConsolidationTenant; rawLines: XeroPLLineLike[] }>> {
  if (tenants.length === 0) return []

  const ids = await resolveBusinessIds(supabase, businessId)
  const tenantIds = tenants.map((t) => t.tenant_id)

  const { data: lines, error } = await supabase
    .from('xero_balance_sheet_lines')
    .select('business_id, tenant_id, account_name, account_code, account_type, section, monthly_values')
    .in('business_id', ids.all)
    .in('tenant_id', tenantIds)

  if (error) {
    throw new Error(
      `[Consolidated BS] Failed to load xero_balance_sheet_lines: ${error.message}`,
    )
  }

  const byTenant = new Map<string, XeroPLLineLike[]>()
  for (const line of (lines ?? []) as XeroPLLineLike[]) {
    const key = line.tenant_id ?? ''
    const arr = byTenant.get(key) ?? []
    arr.push(line)
    byTenant.set(key, arr)
  }

  return tenants.map((tenant) => ({
    tenant,
    rawLines: byTenant.get(tenant.tenant_id) ?? [],
  }))
}

/**
 * Build per-tenant BS columns from deduped lines aligned to a universe.
 * Every account in the universe appears in every column (absent rows get balance 0).
 */
function buildBSEntityColumn(
  tenant: ConsolidationTenant,
  dedupedLines: XeroPLLineLike[],
  universe: AlignedAccount[],
  asOfDate: string,
): BSEntityColumn {
  const byKey = new Map<string, XeroPLLineLike>()
  for (const line of dedupedLines) {
    byKey.set(accountAlignmentKey(line), line)
  }
  // monthly_values is keyed YYYY-MM (e.g. '2026-03'); asOfDate is a full
  // month-end date (e.g. '2026-03-31'). Normalise before lookup.
  const monthKey = asOfDate.slice(0, 7)
  const rows: BSRow[] = universe.map((u) => {
    const existing = byKey.get(u.key)
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      section: existing?.section ?? u.section,
      balance: existing?.monthly_values?.[monthKey] ?? 0,
    }
  })
  return {
    connection_id: tenant.connection_id,
    tenant_id: tenant.tenant_id,
    business_id: tenant.business_id,
    display_name: tenant.display_name,
    display_order: tenant.display_order,
    functional_currency: tenant.functional_currency,
    rows,
  }
}

/**
 * Apply intercompany_loan elimination rules — both sides zeroed (Pitfall 5).
 *
 * A bidirectional intercompany loan has a matching (Loan Payable on tenant A,
 * Loan Receivable on tenant B) pair. On consolidation, BOTH sides must be
 * removed from the totals, not just one. This is distinct from P&L
 * eliminations where a single transaction appears in both books with opposite
 * signs and therefore nets to zero naturally — the BS loan balances ADD to
 * the consolidated total (asset + asset on one side, liability + liability on
 * the other) and must be actively zeroed.
 */
export function applyLoanEliminations(
  rules: EliminationRule[],
  byTenant: BSEntityColumn[],
): BSEliminationEntry[] {
  const entries: BSEliminationEntry[] = []

  for (const rule of rules) {
    if (rule.rule_type !== 'intercompany_loan') continue

    const tenantA = byTenant.find((t) => t.tenant_id === rule.tenant_a_id)
    const tenantB = byTenant.find((t) => t.tenant_id === rule.tenant_b_id)
    if (!tenantA || !tenantB) continue

    // Re-use matchRuleToLines from P&L eliminations — it only inspects
    // account_code + account_name_pattern, which are shared between P&L and
    // BS line shapes. Convert BS rows to XeroPLLineLike-compatible shape
    // (balance -> monthly_values[asOfDate] stub).
    const asPL = (rows: BSRow[], tenantBusinessId: string, tenantId: string): XeroPLLineLike[] =>
      rows.map((r) => ({
        business_id: tenantBusinessId,
        tenant_id: tenantId,
        account_name: r.account_name,
        account_code: null,
        account_type: r.account_type,
        section: r.section,
        monthly_values: { __bs__: r.balance },
      }))

    const plA = asPL(tenantA.rows, tenantA.business_id, tenantA.tenant_id)
    const plB = asPL(tenantB.rows, tenantB.business_id, tenantB.tenant_id)

    const matchedA = matchRuleToLines(rule, 'a', plA)
    const matchedB = matchRuleToLines(rule, 'b', plB)

    // direction semantics intentionally ignored for intercompany_loan —
    // the canonical behaviour is to zero BOTH sides (Pitfall 5). A rule
    // author who genuinely wants one-sided loan elimination should use
    // account_pair with direction=entity_a_eliminates instead.
    for (const line of matchedA) {
      const src = line.monthly_values.__bs__ ?? 0
      entries.push({
        rule_id: rule.id,
        rule_description: rule.description,
        account_type: line.account_type,
        account_name: line.account_name,
        amount: -src,
        source_tenant_id: rule.tenant_a_id,
        source_amount: src,
      })
    }
    for (const line of matchedB) {
      const src = line.monthly_values.__bs__ ?? 0
      entries.push({
        rule_id: rule.id,
        rule_description: rule.description,
        account_type: line.account_type,
        account_name: line.account_name,
        amount: -src,
        source_tenant_id: rule.tenant_b_id,
        source_amount: src,
      })
    }
  }

  return entries
}

/**
 * Compute the Translation Reserve (CTA) that restores
 *   Σ assets − (Σ liabilities + Σ equity) = 0
 * after FX translation at closing-spot. Returns the signed residual; caller
 * posts it as an equity line only when |residual| > 0.01.
 *
 * The project's BS sign convention (confirmed via BalanceSheetTab.tsx) is:
 *   assets positive, liabilities positive, equity positive, and
 *   Net Assets = assets − liabilities = equity.
 *
 * Translating each line at closing-spot means the three sums may not agree
 * by cents (or more, for long-lived members) — CTA absorbs the difference.
 */
export function computeTranslationReserve(rows: BSRow[]): number {
  let assets = 0
  let liabilities = 0
  let equity = 0
  for (const r of rows) {
    if (r.account_type === 'asset') assets += r.balance
    else if (r.account_type === 'liability') liabilities += r.balance
    else if (r.account_type === 'equity') equity += r.balance
  }
  return assets - (liabilities + equity)
}

/**
 * Main entry point. Input: businessId + asOfDate. Output: consolidated BS with
 * per-tenant columns, eliminations, CTA line, and FX diagnostics.
 */
export async function buildConsolidatedBalanceSheet(
  supabase: any,
  opts: BuildBalanceSheetOpts,
): Promise<ConsolidatedBalanceSheet> {
  const startedAt = Date.now()

  // 1. Load business + tenants (reuse P&L engine helper).
  const { business, tenants } = await loadBusinessContext(supabase, opts.businessId)

  // 2. Load BS lines per tenant.
  const snapshots = await loadBSTenantSnapshots(supabase, opts.businessId, tenants)

  // 3. Dedup per tenant (xero sync race duplicates).
  const deduped = snapshots.map((s) => ({
    ...s,
    lines: deduplicateLines(s.rawLines),
  }))

  // 4. FX translation — only invoked when tenant.functional_currency differs.
  const fxRatesUsed: Record<string, number> = {}
  const fxMissing: Array<{ currency_pair: string; period: string }> = []

  const translated = await Promise.all(
    deduped.map(async (d) => {
      if (!opts.translate || d.tenant.functional_currency === business.presentation_currency) {
        return d
      }
      const { translated: tLines, missing, ratesUsed } = await opts.translate(
        d.tenant,
        d.lines,
      )
      Object.assign(fxRatesUsed, ratesUsed)
      for (const m of missing) fxMissing.push(m)
      return { ...d, lines: tLines }
    }),
  )

  // 5. Build universe + per-tenant columns.
  const universe = buildAlignedAccountUniverse(translated.map((t) => t.lines))
  const byTenant = translated.map((t) =>
    buildBSEntityColumn(t.tenant, t.lines, universe, opts.asOfDate),
  )

  // 6. Load elimination rules, keep ONLY intercompany_loan rules.
  const allRules = await loadEliminationRulesForBusiness(supabase, opts.businessId)
  const loanRules = allRules.filter((r) => r.rule_type === 'intercompany_loan')
  const eliminations = applyLoanEliminations(loanRules, byTenant)

  // 7. Combine — Σ tenants + eliminations. Eliminations keyed by
  // account_type::account_name so each side of the loan pair maps to its
  // own account row (Loan Payable on A, Loan Receivable on B).
  const elimsByKey = new Map<string, number>()
  for (const e of eliminations) {
    const k = accountAlignmentKey({
      account_type: e.account_type,
      account_name: e.account_name,
    })
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  const consolidatedRows: BSRow[] = universe.map((u) => {
    let sum = 0
    let section = u.section
    for (const col of byTenant) {
      const row = col.rows.find(
        (r) =>
          accountAlignmentKey({
            account_type: r.account_type,
            account_name: r.account_name,
          }) === u.key,
      )
      if (row) {
        sum += row.balance
        if (!section && row.section) section = row.section
      }
    }
    const elim = elimsByKey.get(u.key) ?? 0
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      section,
      balance: sum + elim,
    }
  })

  // 8. Compute Translation Reserve (CTA). Post as an equity line when
  // non-zero. AUD-only consolidations produce CTA = 0 (within rounding).
  const residual = computeTranslationReserve(consolidatedRows)
  const EPSILON = 0.01
  if (Math.abs(residual) > EPSILON) {
    consolidatedRows.push({
      account_type: 'equity',
      account_name: 'Translation Reserve (CTA)',
      section: 'Equity',
      balance: residual,
    })
  }

  const totalLines = deduped.reduce((acc, d) => acc + d.lines.length, 0)

  return {
    business,
    asOfDate: opts.asOfDate,
    byTenant,
    eliminations,
    consolidated: {
      rows: consolidatedRows,
      translationReserve: Math.abs(residual) > EPSILON ? residual : 0,
    },
    fx_context: {
      rates_used: fxRatesUsed,
      missing_rates: fxMissing,
    },
    diagnostics: {
      tenants_loaded: tenants.length,
      total_lines_processed: totalLines,
      eliminations_applied_count: eliminations.length,
      eliminations_total_amount: eliminations.reduce((acc, e) => acc + Math.abs(e.amount), 0),
      processing_ms: Date.now() - startedAt,
    },
  }
}
