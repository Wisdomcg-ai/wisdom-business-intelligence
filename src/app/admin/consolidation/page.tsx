'use client'

/**
 * /admin/consolidation — Index page
 *
 * Plan 34-00f (post-pivot) — lists every business that has 2+ active
 * consolidation-eligible Xero tenants. Each row shows:
 *   - business name
 *   - tenant count
 *   - FX-rates-status indicator (are there any pending non-AUD pairs whose
 *     monthly_average rate is missing for recent months?)
 *
 * Clicking a row navigates to /admin/consolidation/[businessId] for the detail
 * settings view.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Layers, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface ConnectionRow {
  id: string
  business_id: string
  tenant_id: string
  tenant_name: string | null
  display_name: string | null
  functional_currency: string
  include_in_consolidation: boolean
  is_active: boolean
}

interface BusinessRow {
  id: string
  business_name: string | null
}

interface FxRateRow {
  currency_pair: string
  rate_type: string
  period: string
}

interface BusinessGroupSummary {
  business_id: string
  business_name: string
  tenant_count: number
  has_foreign_tenant: boolean
  fx_status: 'all_good' | 'missing' | 'not_applicable'
  fx_missing_count: number
}

/**
 * Given a list of months (YYYY-MM) and the set of (pair, month) combinations
 * with rates present, count the (pair, month) combos we are MISSING for the
 * non-AUD tenants on this business.
 *
 * Rates checked: monthly_average only (P&L) — closing_spot is BS-only and
 * not wired into Iteration 34.0 consolidation.
 */
function countMissingFxForBusiness(
  connections: ConnectionRow[],
  ratesPresent: Set<string>, // `${pair}::${month}` keys
  recentMonths: string[],
): { hasForeign: boolean; missingCount: number } {
  const foreignCurrencies = Array.from(
    new Set(
      connections
        .filter(c => c.is_active && c.include_in_consolidation)
        .map(c => c.functional_currency)
        .filter(fc => fc !== 'AUD'),
    ),
  )
  if (foreignCurrencies.length === 0) {
    return { hasForeign: false, missingCount: 0 }
  }
  let missing = 0
  for (const fc of foreignCurrencies) {
    const pair = `${fc}/AUD`
    for (const m of recentMonths) {
      if (!ratesPresent.has(`${pair}::${m}`)) missing++
    }
  }
  return { hasForeign: true, missingCount: missing }
}

/**
 * Produce the last N YYYY-MM month keys relative to `now` (inclusive of the
 * current month). We use 3 months as the "recent" window for the FX-coverage
 * indicator — rough heuristic matching how Matt reviews consolidated reports
 * (prior month + two before).
 */
function recentMonthKeys(now: Date, count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function ConsolidationAdminIndexPage() {
  const [businesses, setBusinesses] = useState<BusinessGroupSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBusinesses()
  }, [])

  async function loadBusinesses() {
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      // Fetch all active, consolidation-eligible connections across the system.
      // Role gate on the layout is what keeps this safe — plus RLS on
      // xero_connections further scopes visibility.
      const { data: connData, error: connErr } = await supabase
        .from('xero_connections')
        .select(
          'id, business_id, tenant_id, tenant_name, display_name, functional_currency, include_in_consolidation, is_active',
        )
        .eq('is_active', true)
        .eq('include_in_consolidation', true)

      if (connErr) throw connErr
      const connections = (connData ?? []) as ConnectionRow[]

      // Group connections by business_id; keep only those with 2+ tenants.
      const byBiz = new Map<string, ConnectionRow[]>()
      for (const c of connections) {
        const arr = byBiz.get(c.business_id) ?? []
        arr.push(c)
        byBiz.set(c.business_id, arr)
      }
      const multiTenantBizIds = Array.from(byBiz.entries())
        .filter(([, arr]) => arr.length >= 2)
        .map(([id]) => id)

      if (multiTenantBizIds.length === 0) {
        setBusinesses([])
        setIsLoading(false)
        return
      }

      // Fetch business names.
      const { data: bizData, error: bizErr } = await supabase
        .from('businesses')
        .select('id, business_name')
        .in('id', multiTenantBizIds)

      if (bizErr) throw bizErr
      const bizById = new Map<string, BusinessRow>()
      for (const b of (bizData ?? []) as BusinessRow[]) bizById.set(b.id, b)

      // Fetch recent fx_rates to build the "rates present" set for the
      // last 3 months (monthly_average only — P&L).
      const months = recentMonthKeys(new Date(), 3)
      const { data: rateData, error: rateErr } = await supabase
        .from('fx_rates')
        .select('currency_pair, rate_type, period')
        .eq('rate_type', 'monthly_average')

      if (rateErr) throw rateErr
      const ratesPresent = new Set<string>()
      for (const r of (rateData ?? []) as FxRateRow[]) {
        // Period stored as YYYY-MM-DD; the month key is the first 7 chars.
        ratesPresent.add(`${r.currency_pair}::${r.period.slice(0, 7)}`)
      }

      const summaries: BusinessGroupSummary[] = multiTenantBizIds.map(id => {
        const conns = byBiz.get(id) ?? []
        const { hasForeign, missingCount } = countMissingFxForBusiness(
          conns,
          ratesPresent,
          months,
        )
        const biz = bizById.get(id)
        const fxStatus: BusinessGroupSummary['fx_status'] = !hasForeign
          ? 'not_applicable'
          : missingCount === 0
            ? 'all_good'
            : 'missing'
        return {
          business_id: id,
          business_name: biz?.business_name ?? '(unnamed business)',
          tenant_count: conns.length,
          has_foreign_tenant: hasForeign,
          fx_status: fxStatus,
          fx_missing_count: missingCount,
        }
      })

      summaries.sort((a, b) => a.business_name.localeCompare(b.business_name))
      setBusinesses(summaries)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to load businesses')
    } finally {
      setIsLoading(false)
    }
  }

  const totalMultiTenant = businesses.length
  const withForeign = useMemo(
    () => businesses.filter(b => b.has_foreign_tenant).length,
    [businesses],
  )
  const withMissingFx = useMemo(
    () => businesses.filter(b => b.fx_status === 'missing').length,
    [businesses],
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Layers className="w-6 h-6 text-brand-orange" /> Consolidation Admin
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Businesses with two or more active Xero tenants. Click a business
            to manage per-tenant settings, FX rates, and view its elimination
            rules.
          </p>
        </div>
      </header>

      {error && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Multi-tenant businesses
          </p>
          <p className="text-2xl font-semibold">{totalMultiTenant}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            With foreign-currency tenant
          </p>
          <p className="text-2xl font-semibold">{withForeign}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Missing FX rates (last 3 months)
          </p>
          <p className="text-2xl font-semibold text-amber-600">
            {withMissingFx}
          </p>
        </div>
      </div>

      {businesses.length === 0 ? (
        <div className="p-8 text-center border rounded-lg bg-white">
          <p className="text-gray-600">
            No multi-tenant businesses found. A business needs 2+ active Xero
            connections with <code>include_in_consolidation = true</code> to
            appear here.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Business</th>
                <th className="text-right px-4 py-2 font-medium">Tenants</th>
                <th className="text-left px-4 py-2 font-medium">FX rates</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {businesses.map(b => (
                <tr key={b.business_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/consolidation/${b.business_id}`}
                      className="text-brand-navy hover:text-brand-orange"
                    >
                      {b.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {b.tenant_count}
                  </td>
                  <td className="px-4 py-3">
                    {b.fx_status === 'not_applicable' && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        — AUD only
                      </span>
                    )}
                    {b.fx_status === 'all_good' && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-4 h-4" /> Up to date
                      </span>
                    )}
                    {b.fx_status === 'missing' && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="w-4 h-4" />
                        {b.fx_missing_count} missing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/consolidation/${b.business_id}`}
                      className="inline-flex items-center text-brand-orange hover:text-brand-orange-600 text-sm"
                    >
                      Manage <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
