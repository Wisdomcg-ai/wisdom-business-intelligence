'use client'

/**
 * /admin/consolidation/[businessId] — Business detail settings page
 *
 * Plan 34-00f (post-pivot, tenant model). Three sections:
 *   1. Per-tenant settings (xero_connections rows)
 *   2. FX rates (create / delete for this business's foreign currencies)
 *   3. Elimination rules (read-only; creating is a future iteration)
 *
 * Data writes go through the plan's API routes:
 *   - POST /api/consolidation/fx-rates
 *   - DELETE /api/consolidation/fx-rates/[id]
 *   - PATCH /api/consolidation/tenants/[connectionId]
 *
 * Data reads use the browser Supabase client (RLS scopes rows to the signed-in
 * coach/super_admin).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  Link2,
  Info,
} from 'lucide-react'
import {
  ALLOWED_FUNCTIONAL_CURRENCIES,
  ALLOWED_RATE_TYPES,
} from '@/lib/consolidation/admin-guards'

interface Tenant {
  id: string
  business_id: string
  tenant_id: string
  tenant_name: string | null
  display_name: string | null
  display_order: number | null
  functional_currency: string
  include_in_consolidation: boolean
  is_active: boolean
}

interface Forecast {
  id: string
  name: string
  fiscal_year: number
  tenant_id: string | null
  forecast_type: string | null
  is_active: boolean | null
}

interface FxRate {
  id: string
  currency_pair: string
  rate_type: 'monthly_average' | 'closing_spot'
  period: string // ISO date
  rate: number
  source: string
  created_at: string
}

interface EliminationRule {
  id: string
  business_id: string
  rule_type: 'account_pair' | 'account_category' | 'intercompany_loan'
  tenant_a_id: string | null
  tenant_b_id: string | null
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  entity_b_account_code: string | null
  entity_b_account_name_pattern: string | null
  direction: 'bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates'
  description: string
  active: boolean
}

// Local editable copy of a tenant — we keep input state per-tenant and only
// PATCH on Save so accidental keystrokes don't round-trip the DB.
interface TenantDraft {
  display_name: string
  display_order: number
  functional_currency: string
  include_in_consolidation: boolean
  is_active: boolean
  // true when the draft differs from the server snapshot
  dirty: boolean
}

function makeDraft(t: Tenant): TenantDraft {
  return {
    display_name: t.display_name ?? t.tenant_name ?? '',
    display_order: t.display_order ?? 0,
    functional_currency: t.functional_currency,
    include_in_consolidation: t.include_in_consolidation,
    is_active: t.is_active,
    dirty: false,
  }
}

type BudgetMode = 'single' | 'per_tenant'

export default function ConsolidationBusinessDetailPage() {
  const params = useParams<{ businessId: string }>()
  const businessId = params?.businessId as string

  const [businessName, setBusinessName] = useState<string>('')
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('single')
  const [savingBudgetMode, setSavingBudgetMode] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [drafts, setDrafts] = useState<Record<string, TenantDraft>>({})
  const [fxRates, setFxRates] = useState<FxRate[]>([])
  const [rules, setRules] = useState<EliminationRule[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [forecastSavingId, setForecastSavingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(
    null,
  )

  // FX entry form — seeded sensibly based on the first non-AUD tenant.
  const [fxForm, setFxForm] = useState({
    currency_pair: 'HKD/AUD',
    rate_type: 'monthly_average' as 'monthly_average' | 'closing_spot',
    period: '',
    rate: '',
  })
  const [fxSubmitting, setFxSubmitting] = useState(false)

  const loadedRef = useRef(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const supabase = createClient()

      // Business name + hybrid budget mode (Phase 34 Step 2).
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('business_name, consolidation_budget_mode')
        .eq('id', businessId)
        .maybeSingle()
      if (bizErr) throw bizErr
      setBusinessName(biz?.business_name ?? '(unnamed business)')
      // Defensive: fall back to 'single' if the column is missing / unrecognised.
      const rawMode = (biz as any)?.consolidation_budget_mode
      setBudgetMode(rawMode === 'per_tenant' ? 'per_tenant' : 'single')

      // Tenants (xero_connections — INCLUDE inactive so coach can re-enable).
      const { data: tenantRows, error: tenantErr } = await supabase
        .from('xero_connections')
        .select(
          'id, business_id, tenant_id, tenant_name, display_name, display_order, functional_currency, include_in_consolidation, is_active',
        )
        .eq('business_id', businessId)
        .order('display_order', { ascending: true })
      if (tenantErr) throw tenantErr
      const ts = (tenantRows ?? []) as Tenant[]
      setTenants(ts)
      setDrafts(() => {
        const next: Record<string, TenantDraft> = {}
        for (const t of ts) next[t.id] = makeDraft(t)
        return next
      })

      // Seed the FX form currency_pair based on the first foreign tenant (if any).
      const firstForeign = ts.find(
        t => t.is_active && t.include_in_consolidation && t.functional_currency !== 'AUD',
      )
      if (firstForeign) {
        setFxForm(prev => ({
          ...prev,
          currency_pair: `${firstForeign.functional_currency}/AUD`,
        }))
      }

      // FX rates — show every rate in the system (scoped by the UNIQUE
      // constraint currency_pair+rate_type+period; there's no business_id on
      // fx_rates today). Filter visually to the currencies this business needs.
      const { data: rateRows, error: rateErr } = await supabase
        .from('fx_rates')
        .select('*')
        .order('currency_pair', { ascending: true })
        .order('period', { ascending: false })
      if (rateErr) throw rateErr
      setFxRates((rateRows ?? []) as FxRate[])

      // Elimination rules for this business.
      const { data: ruleRows, error: ruleErr } = await supabase
        .from('consolidation_elimination_rules')
        .select('*')
        .eq('business_id', businessId)
        .order('active', { ascending: false })
      if (ruleErr) throw ruleErr
      setRules((ruleRows ?? []) as EliminationRule[])

      // Financial forecasts — so the coach can assign each to a tenant.
      // financial_forecasts.business_id FKs to business_profiles(id) in some
      // installs; we try businesses.id first and fall back to the profile id
      // (mirrors the ForecastService lookup pattern).
      const idsToTry: string[] = [businessId]
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', businessId)
        .maybeSingle()
      if (profile?.id && profile.id !== businessId) {
        idsToTry.push(profile.id)
      }
      const { data: forecastRows, error: forecastErr } = await supabase
        .from('financial_forecasts')
        .select('id, name, fiscal_year, tenant_id, forecast_type, is_active')
        .in('business_id', idsToTry)
        .order('fiscal_year', { ascending: false })
        .order('updated_at', { ascending: false })
      if (forecastErr) throw forecastErr
      setForecasts((forecastRows ?? []) as Forecast[])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to load consolidation data')
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void reload()
  }, [reload])

  const foreignCurrencies = useMemo(() => {
    return Array.from(
      new Set(
        tenants
          .filter(t => t.is_active && t.include_in_consolidation)
          .map(t => t.functional_currency)
          .filter(c => c !== 'AUD'),
      ),
    )
  }, [tenants])

  const relevantPairs = useMemo(
    () => foreignCurrencies.map(c => `${c}/AUD`),
    [foreignCurrencies],
  )

  const fxRatesForPairs = useMemo(() => {
    if (relevantPairs.length === 0) return fxRates
    return fxRates.filter(r => relevantPairs.includes(r.currency_pair))
  }, [fxRates, relevantPairs])

  // Map the tenant_id → display_name so elimination-rule rows can show human
  // names instead of Xero UUID strings.
  const tenantLabelById = useMemo(() => {
    const out = new Map<string, string>()
    for (const t of tenants) {
      out.set(t.tenant_id, t.display_name ?? t.tenant_name ?? t.tenant_id)
    }
    return out
  }, [tenants])

  // ---- Budget mode save handler (Phase 34 Step 2) ----
  // Persists the selected mode via PATCH /api/consolidation/businesses/[id].
  // Optimistic UI: we update state immediately and roll back on failure so
  // the radio reflects the server's authoritative value.
  const saveBudgetMode = async (next: BudgetMode) => {
    if (next === budgetMode || savingBudgetMode) return
    const previous = budgetMode
    setBudgetMode(next)
    setSavingBudgetMode(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/consolidation/businesses/${encodeURIComponent(businessId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consolidation_budget_mode: next }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error ?? `Save failed (HTTP ${res.status})`)
      }
      const serverMode = body?.business?.consolidation_budget_mode
      if (serverMode === 'single' || serverMode === 'per_tenant') {
        setBudgetMode(serverMode)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to save budget mode')
      setBudgetMode(previous)
    } finally {
      setSavingBudgetMode(false)
    }
  }

  // ---- Tenant save handler ----
  const updateDraft = (connectionId: string, patch: Partial<TenantDraft>) => {
    setDrafts(prev => {
      const current = prev[connectionId]
      if (!current) return prev
      return {
        ...prev,
        [connectionId]: { ...current, ...patch, dirty: true },
      }
    })
  }

  const saveTenant = async (connectionId: string) => {
    const draft = drafts[connectionId]
    const tenant = tenants.find(t => t.id === connectionId)
    if (!draft || !tenant) return
    setSavingConnectionId(connectionId)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (draft.display_name !== (tenant.display_name ?? '')) {
        body.display_name = draft.display_name
      }
      if (draft.display_order !== (tenant.display_order ?? 0)) {
        body.display_order = draft.display_order
      }
      if (draft.functional_currency !== tenant.functional_currency) {
        body.functional_currency = draft.functional_currency
      }
      if (draft.include_in_consolidation !== tenant.include_in_consolidation) {
        body.include_in_consolidation = draft.include_in_consolidation
      }
      if (draft.is_active !== tenant.is_active) {
        body.is_active = draft.is_active
      }
      if (Object.keys(body).length === 0) {
        // Nothing actually changed — just clear the dirty flag.
        setDrafts(prev => ({ ...prev, [connectionId]: { ...draft, dirty: false } }))
        return
      }
      const res = await fetch(
        `/api/consolidation/tenants/${encodeURIComponent(connectionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const responseBody = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          responseBody?.error ?? `Save failed (HTTP ${res.status})`,
        )
      }
      await reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to save tenant')
    } finally {
      setSavingConnectionId(null)
    }
  }

  // ---- FX handlers ----
  const handleFxSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (fxSubmitting) return
    setFxSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/consolidation/fx-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency_pair: fxForm.currency_pair,
          rate_type: fxForm.rate_type,
          period: fxForm.period,
          rate: Number(fxForm.rate),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error ?? `Save failed (HTTP ${res.status})`)
      }
      setFxForm(prev => ({ ...prev, period: '', rate: '' }))
      await reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to save FX rate')
    } finally {
      setFxSubmitting(false)
    }
  }

  const handleFxDelete = async (id: string) => {
    if (!confirm('Delete this FX rate?')) return
    setError(null)
    try {
      const res = await fetch(
        `/api/consolidation/fx-rates/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Delete failed (HTTP ${res.status})`)
      }
      await reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to delete FX rate')
    }
  }

  // ---- Forecast tenant-assignment handler ----
  const saveForecastTenant = async (
    forecastId: string,
    tenantId: string | null,
  ) => {
    setForecastSavingId(forecastId)
    setError(null)
    try {
      const res = await fetch(
        `/api/consolidation/forecasts/${encodeURIComponent(forecastId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error ?? `Save failed (HTTP ${res.status})`)
      }
      await reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to save forecast tenant assignment')
    } finally {
      setForecastSavingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <Link
          href="/admin/consolidation"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-brand-orange"
        >
          <ArrowLeft className="w-4 h-4" /> All businesses
        </Link>
        <h1 className="text-2xl font-semibold">{businessName}</h1>
        <p className="text-sm text-gray-600">
          {tenants.length} connected Xero tenant{tenants.length === 1 ? '' : 's'}
          {foreignCurrencies.length > 0 && (
            <>
              {' · '}foreign currencies: {foreignCurrencies.join(', ')}
            </>
          )}
        </p>
      </header>

      {error && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Phase 34 Step 2 — Hybrid Budget Mode toggle.
          Lets the coach choose whether this business budgets at a single
          consolidated level or per Xero tenant. The selection drives the
          consolidated P&L's Budget / Variance columns. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Budget mode</h2>
          {savingBudgetMode && (
            <Loader2
              className="w-3 h-3 animate-spin text-gray-400"
              aria-label="Saving budget mode"
            />
          )}
        </div>
        <div
          role="radiogroup"
          aria-label="Consolidation budget mode"
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <label
            className={`border rounded-lg p-4 cursor-pointer ${
              budgetMode === 'single'
                ? 'border-brand-orange bg-orange-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="consolidation-budget-mode"
                value="single"
                checked={budgetMode === 'single'}
                onChange={() => saveBudgetMode('single')}
                disabled={savingBudgetMode}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Single consolidated budget</div>
                <p className="text-xs text-gray-600 mt-1">
                  One forecast for the whole business. Simpler — use when the
                  group is budgeted as a single unit. Per-tenant Budget +
                  Variance columns are hidden on the consolidated P&amp;L.
                </p>
              </div>
            </div>
          </label>
          <label
            className={`border rounded-lg p-4 cursor-pointer ${
              budgetMode === 'per_tenant'
                ? 'border-brand-orange bg-orange-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="consolidation-budget-mode"
                value="per_tenant"
                checked={budgetMode === 'per_tenant'}
                onChange={() => saveBudgetMode('per_tenant')}
                disabled={savingBudgetMode}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Per-tenant budgets</div>
                <p className="text-xs text-gray-600 mt-1">
                  Each Xero tenant has its own forecast. Budgets are summed
                  into the consolidated Budget column (Calxa-style). Use the
                  tenant picker below to assign each forecast.
                </p>
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* Per-tenant settings */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Per-tenant settings</h2>
        </div>
        {tenants.length === 0 ? (
          <p className="text-sm text-gray-500">
            No Xero connections found for this business.
          </p>
        ) : (
          <div className="border rounded-lg overflow-x-auto bg-white">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Display name</th>
                  <th className="text-left px-3 py-2 font-medium">Xero tenant</th>
                  <th className="text-right px-3 py-2 font-medium">Order</th>
                  <th className="text-left px-3 py-2 font-medium">Currency</th>
                  <th className="text-center px-3 py-2 font-medium">In consol.</th>
                  <th className="text-center px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const draft = drafts[t.id] ?? makeDraft(t)
                  const saving = savingConnectionId === t.id
                  return (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={e =>
                            updateDraft(t.id, { display_name: e.target.value })
                          }
                          className="w-full px-2 py-1 border rounded"
                          placeholder={t.tenant_name ?? ''}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                        <span className="block max-w-[180px] truncate" title={t.tenant_id}>
                          {t.tenant_name ?? t.tenant_id}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={draft.display_order}
                          onChange={e =>
                            updateDraft(t.id, {
                              display_order: Number(e.target.value),
                            })
                          }
                          className="w-16 px-2 py-1 border rounded text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={draft.functional_currency}
                          onChange={e =>
                            updateDraft(t.id, {
                              functional_currency: e.target.value,
                            })
                          }
                          className="px-2 py-1 border rounded"
                        >
                          {ALLOWED_FUNCTIONAL_CURRENCIES.map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={draft.include_in_consolidation}
                          onChange={e =>
                            updateDraft(t.id, {
                              include_in_consolidation: e.target.checked,
                            })
                          }
                          aria-label="Include in consolidation"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={e =>
                            updateDraft(t.id, { is_active: e.target.checked })
                          }
                          aria-label="Active"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => saveTenant(t.id)}
                          disabled={saving || !draft.dirty}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-brand-orange text-white hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* FX rates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">FX rates</h2>
          {foreignCurrencies.length === 0 && (
            <p className="text-xs text-gray-500">
              All tenants are AUD — FX rates not required.
            </p>
          )}
        </div>

        {foreignCurrencies.length > 0 ? (
          <form
            onSubmit={handleFxSubmit}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 border rounded-lg bg-gray-50"
          >
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Currency pair
              </label>
              <select
                value={fxForm.currency_pair}
                onChange={e =>
                  setFxForm(prev => ({
                    ...prev,
                    currency_pair: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border rounded"
              >
                {relevantPairs.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {/* Fallback — always allow the seed default even if the list has grown */}
                {!relevantPairs.includes(fxForm.currency_pair) && (
                  <option value={fxForm.currency_pair}>
                    {fxForm.currency_pair}
                  </option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Rate type
              </label>
              <select
                value={fxForm.rate_type}
                onChange={e =>
                  setFxForm(prev => ({
                    ...prev,
                    rate_type: e.target.value as 'monthly_average' | 'closing_spot',
                  }))
                }
                className="w-full px-3 py-2 border rounded"
              >
                {ALLOWED_RATE_TYPES.map(rt => (
                  <option key={rt} value={rt}>
                    {rt === 'monthly_average' ? 'Monthly Average (P&L)' : 'Closing Spot (BS)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Period
              </label>
              <input
                type="date"
                value={fxForm.period}
                onChange={e =>
                  setFxForm(prev => ({ ...prev, period: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Rate
              </label>
              <input
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.1925"
                value={fxForm.rate}
                onChange={e =>
                  setFxForm(prev => ({ ...prev, rate: e.target.value }))
                }
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={fxSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded hover:bg-brand-orange-600 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {fxSubmitting ? 'Saving…' : 'Add rate'}
              </button>
            </div>
          </form>
        ) : null}

        {fxRatesForPairs.length === 0 ? (
          <p className="text-sm text-gray-500">
            {foreignCurrencies.length === 0
              ? 'No FX rates needed — this business has no foreign-currency tenants.'
              : 'No FX rates entered yet for the relevant currencies. Use the form above to add one.'}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Pair</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Period</th>
                  <th className="text-right px-3 py-2 font-medium">Rate</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fxRatesForPairs.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{r.currency_pair}</td>
                    <td className="px-3 py-2">
                      {r.rate_type === 'monthly_average'
                        ? 'Monthly avg'
                        : 'Closing spot'}
                    </td>
                    <td className="px-3 py-2">{r.period.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.rate).toFixed(6)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.source}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleFxDelete(r.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        aria-label="Delete FX rate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Elimination rules (read-only) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-5 h-5 text-gray-500" /> Elimination rules
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Info className="w-3 h-3" /> Read-only — edit via migration for now
          </span>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-gray-500">
            No elimination rules seeded for this business.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium">Tenant A</th>
                  <th className="text-left px-3 py-2 font-medium">Tenant B</th>
                  <th className="text-left px-3 py-2 font-medium">Direction</th>
                  <th className="text-center px-3 py-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {r.rule_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.description}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.tenant_a_id ? (
                        <>
                          <span className="font-medium">
                            {tenantLabelById.get(r.tenant_a_id) ?? r.tenant_a_id}
                          </span>
                          {r.entity_a_account_code && (
                            <span className="ml-1 text-gray-500">
                              · {r.entity_a_account_code}
                            </span>
                          )}
                          {r.entity_a_account_name_pattern && (
                            <span className="ml-1 text-gray-500">
                              · {r.entity_a_account_name_pattern}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.tenant_b_id ? (
                        <>
                          <span className="font-medium">
                            {tenantLabelById.get(r.tenant_b_id) ?? r.tenant_b_id}
                          </span>
                          {r.entity_b_account_code && (
                            <span className="ml-1 text-gray-500">
                              · {r.entity_b_account_code}
                            </span>
                          )}
                          {r.entity_b_account_name_pattern && (
                            <span className="ml-1 text-gray-500">
                              · {r.entity_b_account_name_pattern}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.direction}</td>
                    <td className="px-3 py-2 text-center">
                      {r.active ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          active
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {relevantPairs.length > 0 && fxRatesForPairs.length === 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This business has foreign-currency tenants ({foreignCurrencies.join(', ')}
              ) but no FX rates entered yet. The consolidated P&amp;L will show raw
              foreign-currency values until a monthly_average rate is added.
            </span>
          </div>
        )}
      </section>

      {/* Phase 34.3 — Forecast tenant assignment.
          Each financial_forecasts row gets scoped to exactly one Xero tenant
          so the consolidated P&L can sum per-tenant budgets into a
          consolidated budget column. Selecting "Whole business (legacy)" stores
          tenant_id = NULL and preserves pre-34.3 behaviour.

          Phase 34 Step 2 — the header + selector adapt to budgetMode:
            - 'single'     → one business-level forecast (tenant_id IS NULL)
                             drives the consolidated Budget. Tenant picker is
                             hidden; a Scope column shows which forecast is the
                             consolidated budget source.
            - 'per_tenant' → full picker UI (original 34.3 behaviour). */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {budgetMode === 'single'
              ? 'Forecast (single budget)'
              : 'Forecast tenant assignment'}
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Info className="w-3 h-3" />{' '}
            {budgetMode === 'single'
              ? 'Single mode — one business-level forecast drives the consolidated Budget'
              : 'Pick the Xero tenant each budget covers'}
          </span>
        </div>
        {forecasts.length === 0 ? (
          <p className="text-sm text-gray-500">
            No financial forecasts exist for this business yet. Create one via
            the <Link href="/finances/forecast" className="text-brand-orange hover:underline">Forecast page</Link>
            {budgetMode === 'single'
              ? ' — it will drive the consolidated Budget column.'
              : ' — once saved, come back here to assign it to a tenant.'}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Fiscal year</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  {budgetMode === 'per_tenant' ? (
                    <th className="text-left px-3 py-2 font-medium">Tenant assignment</th>
                  ) : (
                    <th className="text-left px-3 py-2 font-medium">Scope</th>
                  )}
                  <th className="text-center px-3 py-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map(f => {
                  const saving = forecastSavingId === f.id
                  const isSingleModeSource =
                    budgetMode === 'single' && f.tenant_id == null
                  return (
                    <tr
                      key={f.id}
                      className={`border-b hover:bg-gray-50 ${
                        isSingleModeSource ? 'bg-orange-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2">{f.name}</td>
                      <td className="px-3 py-2 tabular-nums">{f.fiscal_year}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {f.forecast_type ?? 'forecast'}
                        </span>
                      </td>
                      {budgetMode === 'per_tenant' ? (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <select
                              disabled={saving}
                              value={f.tenant_id ?? ''}
                              onChange={e =>
                                saveForecastTenant(
                                  f.id,
                                  e.target.value === '' ? null : e.target.value,
                                )
                              }
                              className="px-2 py-1 border rounded text-xs min-w-[200px]"
                            >
                              <option value="">
                                Whole business (legacy / consolidated)
                              </option>
                              {tenants
                                .filter(t => t.is_active && t.include_in_consolidation)
                                .map(t => (
                                  <option key={t.id} value={t.tenant_id}>
                                    {t.display_name ?? t.tenant_name ?? t.tenant_id}
                                  </option>
                                ))}
                            </select>
                            {saving && (
                              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                            )}
                          </div>
                        </td>
                      ) : (
                        <td className="px-3 py-2 text-xs">
                          {f.tenant_id == null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                              Consolidated budget source
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              Scoped to tenant (unused in single mode)
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        {f.is_active ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            active
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {budgetMode === 'single'
            ? 'In single mode, the consolidated P&L reads the first business-level forecast (tenant_id = NULL) for the fiscal year. Tenant-scoped forecasts are ignored — switch to Per-tenant mode above to use them.'
            : 'Legacy forecasts stay unassigned (NULL) and continue to work as a fallback when no tenants have a forecast for the fiscal year. Once a forecast is assigned to a tenant, its P&L lines feed the Budget column for that tenant in the consolidated P&L report.'}
        </p>
      </section>
    </div>
  )
}
