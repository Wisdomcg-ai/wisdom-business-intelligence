/**
 * Multi-Tenant Consolidation Engine (P&L) — Phase 34
 *
 * One business, multiple Xero tenants. The engine:
 *   1. Loads the business + its active, consolidation-included tenants from xero_connections
 *   2. Fetches xero_pl_lines for that business, groups by tenant_id
 *   3. Aligns accounts across tenants, applies FX + eliminations, produces a consolidated view
 *
 * FX translation (fx.ts) and elimination rules (eliminations.ts) are pure modules plugged in
 * via the `translate` callback and the business-scoped rules table.
 *
 * resolveBusinessIds is used ONCE to resolve the dual-ID business identifier; the subsequent
 * xero_pl_lines query uses the resolved IDs + filters by tenant_id per tenant.
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import type {
  ConsolidationBusiness,
  ConsolidationTenant,
  XeroPLLineLike,
  EntityColumn,
  EliminationEntry,
  ConsolidatedReport,
} from './types'
import {
  buildAlignedAccountUniverse,
  buildEntityColumn,
  deduplicateLines,
  accountAlignmentKey,
  type AlignedAccount,
} from './account-alignment'
import { loadEliminationRulesForBusiness, applyEliminations } from './eliminations'

interface LoadedContext {
  business: ConsolidationBusiness
  tenants: ConsolidationTenant[]
}

interface TenantSnapshot {
  tenant: ConsolidationTenant
  rawLines: XeroPLLineLike[]
}

export interface BuildConsolidationOpts {
  businessId: string
  reportMonth: string // 'YYYY-MM'
  fiscalYear: number
  fyMonths: readonly string[] // 12 'YYYY-MM' keys, driven by business fiscal year
  /**
   * Optional FX translator invoked once per tenant whose `functional_currency`
   * differs from the business's `presentation_currency`. Tenants sharing the
   * presentation currency are short-circuited (pure pass-through).
   *
   * Returns:
   *   - `translated`  — same-shape XeroPLLineLike array in presentation currency
   *   - `missing`     — month keys for which no rate was available
   *   - `ratesUsed`   — flat map: `${currency_pair}::${month}` → rate
   */
  translate?: (
    tenant: ConsolidationTenant,
    lines: XeroPLLineLike[],
  ) => Promise<{
    translated: XeroPLLineLike[]
    missing: string[]
    ratesUsed: Record<string, number>
  }>
}

/**
 * Load business metadata + its active, consolidation-included Xero tenants.
 */
export async function loadBusinessContext(
  supabase: any,
  businessId: string,
): Promise<LoadedContext> {
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', businessId)
    .single()
  if (bErr || !business) {
    throw new Error(`[Consolidation Engine] Business ${businessId} not found: ${bErr?.message ?? ''}`)
  }

  const { data: connections, error: cErr } = await supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, display_name, display_order, functional_currency, include_in_consolidation, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('include_in_consolidation', true)
    .order('display_order', { ascending: true })
  if (cErr) {
    throw new Error(`[Consolidation Engine] Failed to load tenants: ${cErr.message}`)
  }

  const tenants: ConsolidationTenant[] = (connections ?? []).map((c: any) => ({
    connection_id: c.id,
    business_id: c.business_id,
    tenant_id: c.tenant_id,
    display_name: c.display_name || c.tenant_name || c.tenant_id,
    display_order: c.display_order ?? 0,
    functional_currency: c.functional_currency || 'AUD',
    include_in_consolidation: c.include_in_consolidation ?? true,
  }))

  return {
    business: {
      id: business.id,
      name: business.name,
      presentation_currency: 'AUD', // hardcoded for now — could add to businesses column later
    },
    tenants,
  }
}

/**
 * Single-query per business, grouped by tenant in memory. Uses resolveBusinessIds
 * on the parent business (dual-ID safety) then slices xero_pl_lines by tenant_id.
 */
export async function loadTenantSnapshots(
  supabase: any,
  businessId: string,
  tenants: ConsolidationTenant[],
): Promise<TenantSnapshot[]> {
  if (tenants.length === 0) return []

  const ids = await resolveBusinessIds(supabase, businessId)
  const tenantIds = tenants.map((t) => t.tenant_id)

  const { data: lines, error } = await supabase
    .from('xero_pl_lines')
    .select('business_id, tenant_id, account_name, account_code, account_type, section, monthly_values')
    .in('business_id', ids.all)
    .in('tenant_id', tenantIds)

  if (error) {
    throw new Error(`[Consolidation Engine] Failed to load xero_pl_lines: ${error.message}`)
  }

  const byTenant = new Map<string, XeroPLLineLike[]>()
  for (const line of (lines ?? []) as XeroPLLineLike[]) {
    const arr = byTenant.get(line.tenant_id ?? '') ?? []
    arr.push(line)
    byTenant.set(line.tenant_id ?? '', arr)
  }

  return tenants.map((tenant) => ({
    tenant,
    rawLines: byTenant.get(tenant.tenant_id) ?? [],
  }))
}

/**
 * Combine per-tenant columns into a single consolidated column.
 * Formula: consolidated[account][month] = Σ tenants[account][month]
 *          plus reportMonth-scoped eliminations (applied only at reportMonth).
 */
export function combineTenants(
  byTenant: EntityColumn[],
  universe: AlignedAccount[],
  eliminations: EliminationEntry[],
  fyMonths: readonly string[],
  reportMonth: string,
): ConsolidatedReport['consolidated'] {
  const elimsByKey = new Map<string, EliminationEntry[]>()
  for (const e of eliminations) {
    const key = accountAlignmentKey({ account_type: e.account_type, account_name: e.account_name })
    const arr = elimsByKey.get(key) ?? []
    arr.push(e)
    elimsByKey.set(key, arr)
  }

  const lines = universe.map((u) => {
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      let sum = 0
      for (const col of byTenant) {
        const lineInTenant = col.lines.find(
          (l) =>
            accountAlignmentKey({ account_type: l.account_type, account_name: l.account_name }) ===
            u.key,
        )
        sum += lineInTenant?.monthly_values[m] ?? 0
      }
      if (m === reportMonth) {
        const elims = elimsByKey.get(u.key) ?? []
        sum += elims.reduce((acc, e) => acc + e.amount, 0)
      }
      monthly[m] = sum
    }
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      monthly_values: monthly,
    }
  })

  return { lines }
}

/**
 * Main entry point. Input: a business_id. Output: consolidated P&L with per-tenant columns.
 */
export async function buildConsolidation(
  supabase: any,
  opts: BuildConsolidationOpts,
): Promise<ConsolidatedReport> {
  const startedAt = Date.now()

  // 1. Load business + tenants
  const { business, tenants } = await loadBusinessContext(supabase, opts.businessId)

  // 2. Load P&L for all tenants in one query, grouped by tenant_id
  const snapshots = await loadTenantSnapshots(supabase, opts.businessId, tenants)

  // 3. Dedup per tenant (xero sync race duplicates)
  const deduped = snapshots.map((s) => ({
    ...s,
    lines: deduplicateLines(s.rawLines),
  }))

  // 4. FX translation — only invoked when tenant.functional_currency != business.presentation_currency.
  // Missing rates surface via fx_context.missing_rates[]. NEVER silently falls back to 1.0.
  const fxRatesUsed: Record<string, number> = {}
  const fxMissing: { currency_pair: string; period: string }[] = []
  const translated = await Promise.all(
    deduped.map(async (d) => {
      if (!opts.translate || d.tenant.functional_currency === business.presentation_currency) {
        return d
      }
      const { translated: tLines, missing, ratesUsed } = await opts.translate(d.tenant, d.lines)
      Object.assign(fxRatesUsed, ratesUsed)
      const pair = `${d.tenant.functional_currency}/${business.presentation_currency}`
      for (const m of missing) {
        fxMissing.push({ currency_pair: pair, period: m })
      }
      return { ...d, lines: tLines }
    }),
  )

  // 5. Build universe + per-tenant columns
  const universe = buildAlignedAccountUniverse(translated.map((t) => t.lines))
  const byTenant = translated.map((t) => buildEntityColumn(t.tenant, t.lines, universe, opts.fyMonths))

  // 6. Elimination application — business-scoped rules, filter BS-only (intercompany_loan)
  const allRules = await loadEliminationRulesForBusiness(supabase, opts.businessId)
  const plRules = allRules.filter((r) => r.rule_type !== 'intercompany_loan')
  const eliminations = applyEliminations(plRules, byTenant, opts.reportMonth)

  // 7. Combine
  const consolidated = combineTenants(byTenant, universe, eliminations, opts.fyMonths, opts.reportMonth)

  const totalLines = deduped.reduce((acc, d) => acc + d.lines.length, 0)

  return {
    business,
    byTenant,
    eliminations,
    consolidated,
    fx_context: { rates_used: fxRatesUsed, missing_rates: fxMissing },
    diagnostics: {
      tenants_loaded: tenants.length,
      total_lines_processed: totalLines,
      eliminations_applied_count: eliminations.length,
      eliminations_total_amount: eliminations.reduce((acc, e) => acc + Math.abs(e.amount), 0),
      processing_ms: Date.now() - startedAt,
    },
  }
}
