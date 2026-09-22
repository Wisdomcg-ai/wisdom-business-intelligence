/**
 * Dashboard Actuals API Route
 *
 * Returns monthly actual vs forecast data for Revenue, Gross Profit, and Net Profit
 * charts on the business dashboard. Uses fiscal-year-aware month keys.
 *
 * Resilience strategy (Phase 58 polish):
 *   1. Try to find an active forecast matching the requested fiscal year first
 *      (so requesting FY26 doesn't accidentally read from an FY27 forecast's
 *      sparse FY26 actuals slice).
 *   2. If no FY-matching forecast exists, fall back to the latest active
 *      forecast and read its actual_months for whatever historical FY months
 *      were captured.
 *   3. ALWAYS supplement actuals from xero_pl_lines_wide_compat for the
 *      requested FY's monthly window. This guarantees that historical FYs
 *      (e.g. FY26 today, with no FY26 forecast in the system — only FY27)
 *      still render Xero actuals on the trajectory chart instead of an
 *      empty bar set.
 *   4. forecast_months are only ever sourced from a forecast whose
 *      fiscal_year exactly matches the requested FY. Mismatched-FY forecasts
 *      contribute zero forecast bars (correct: no plan exists for that FY).
 *
 * `lastSync` is the charts' "Last synced" line: the Xero data clock from
 * `businessDataClock` (src/lib/xero/connection-status.ts) over every org behind
 * the figures — the business's counted orgs and every tenant whose mirror rows
 * Step 3 drew, including an org disconnected since — each on its own clock,
 * never later than its drawn rows were last written, and the STALEST one. It
 * used to be `financial_metrics.updated_at`, a column that table has never had:
 * the query errored, the error was ignored, and the line never rendered.
 * financial_metrics was never the charts' source either — they read the
 * xero_pl_lines mirror. A lookup that fails is `unknown`, which the charts show
 * as "couldn't check", never as a date.
 *
 * A failed forecast or Xero read is a 500, which the charts show as "couldn't
 * load" — never a 200 that has quietly dropped the plan or passed the forecast's
 * stored actuals off as Xero's.
 *
 * Query params:
 *   businessId     (required) UUID of the business (dual-ID resolved)
 *   fiscalYear     (optional) defaults to current fiscal year
 *   yearStartMonth (optional) 1–12, default 7 (AU FY)
 */

import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { generateFiscalMonthKeys, getCurrentFiscalYear, getFiscalMonthLabels } from '@/lib/utils/fiscal-year-utils'
import { resolveBusinessProfileIds, type ResolvedBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { getLastSyncByTenant } from '@/lib/health-checks'
import {
  businessDataClock,
  type XeroBusinessDataClock,
  type XeroConnectionStatusRow,
  type XeroSyncClock,
  type XeroTenantShown,
} from '@/lib/xero/connection-status'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { loadFxRates } from '@/lib/consolidation/fx'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    businessId: z.string().optional(),
    fiscalYear: z.string().optional(),
    yearStartMonth: z.string().optional(),
  })
  .passthrough()

// Categories that map to Revenue in the P&L (forecast_pl_lines.category strings)
// 'Other Income' is emitted by the wizard materializer (assumptions-to-pl-lines
// convertParityBuckets) — it is revenue-like and must NEVER fall through to the
// OpEx bucket below, which would flip its sign and make net profit wrong by 2×.
const REVENUE_CATEGORIES = ['Revenue', 'revenue', 'Trading Revenue', 'Other Revenue', 'Other Income', 'other income']
// Categories that map to COGS (forecast_pl_lines.category strings)
const COGS_CATEGORIES = ['Cost of Sales', 'COGS', 'cogs', 'Direct Costs', 'Cost of Goods Sold']

// xero_pl_lines_wide_compat.account_type uses lowercase enum values:
// 'revenue' | 'other_income' | 'cogs' | 'opex' | 'other_expense'
const XERO_REVENUE_TYPES = new Set(['revenue', 'other_income'])
const XERO_COGS_TYPES = new Set(['cogs'])

function isCOGS(category?: string): boolean {
  if (!category) return false
  return COGS_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())
}

function isRevenue(category?: string, accountType?: string): boolean {
  if (accountType && accountType.toLowerCase() === 'revenue') return true
  if (!category) return false
  return REVENUE_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())
}

interface MonthAggregate {
  revenueActual: number
  revenueForecast: number
  cogsActual: number
  cogsForecast: number
  opexActual: number
  opexForecast: number
}

function emptyAgg(): MonthAggregate {
  return {
    revenueActual: 0,
    revenueForecast: 0,
    cogsActual: 0,
    cogsForecast: 0,
    opexActual: 0,
    opexForecast: 0,
  }
}

/** Same window as the coach pill and the CFO board, so a cold tenant reads old rather than never. */
const SYNC_CLOCK_WINDOW_DAYS = 60

const CONNECTION_COLUMNS =
  'id, business_id, tenant_id, tenant_name, functional_currency, include_in_consolidation, is_active, last_synced_at, updated_at, expires_at, created_at'

/**
 * The sync clock, read as the service role as the pill and the board read it:
 * sync_jobs' RLS policy matches its business_profiles.id column against
 * businesses.id sets, so a user's client sees next to none of it. Only tenants
 * the caller can already see — this business's connection rows and mirror rows —
 * are looked up in the answer.
 */
function readSyncClock(): Promise<XeroSyncClock> {
  return getLastSyncByTenant(createServiceRoleClient(), SYNC_CLOCK_WINDOW_DAYS)
}

/** The connection rows and sync clock behind "Last synced", or the fact that they could not be read. */
type ClockInputs = { ok: true; rows: XeroConnectionStatusRow[]; syncClock: XeroSyncClock | null } | { ok: false }

/** Read alongside the P&L steps. Never rejects: a failure is `{ ok: false }`, which reads "couldn't check". */
async function readClockInputs(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  ids: ResolvedBusinessProfileIds,
): Promise<ClockInputs> {
  try {
    // Every row under both id forms, dead rows included, through the caller's own
    // client: RLS admits the same people who may see this business's figures.
    const { data, error } = await supabase
      .from('xero_connections')
      .select(CONNECTION_COLUMNS)
      .in('business_id', ids.all)
    if (error) {
      Sentry.captureException(error, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] xero_connections read failed — Last synced is unknown' } } as any)
      return { ok: false }
    }
    const rows = (data ?? []) as XeroConnectionStatusRow[]
    // With no rows the clock is needed only if the charts draw Xero figures
    // anyway, which Step 3 finds out; lastSyncFor reads it then.
    return { ok: true, rows, syncClock: rows.length > 0 ? await readSyncClock() : null }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] Last synced lookup threw' } } as any)
    return { ok: false }
  }
}

/** The charts' "Last synced" — see the header. */
async function lastSyncFor(
  inputs: ClockInputs,
  ids: ResolvedBusinessProfileIds,
  tenantsShown: XeroTenantShown[],
): Promise<XeroBusinessDataClock> {
  if (!inputs.ok) return { status: 'unknown' }
  if (inputs.rows.length === 0) {
    // xero_connections is keyed by businesses.id and the dashboard sends the
    // business_profiles.id. A resolver that could not map the id echoes it back
    // alone, so finding nothing under it says nothing about the business.
    if (ids.all.length < 2) return { status: 'unknown' }
    if (tenantsShown.length === 0) return { status: 'none' }
  }
  try {
    // Rows but no connection: the org was disconnected and its mirror rows kept.
    const syncClock = inputs.syncClock ?? (await readSyncClock())
    return businessDataClock(inputs.rows, syncClock, tenantsShown)
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] Last synced lookup threw' } } as any)
    return { status: 'unknown' }
  }
}

/**
 * What each org's mirror rows are worth in AUD (F1, 22 Sep 2026 diagnostic).
 *
 * The charts summed every org's monthly_values straight into one total. For a
 * multi-currency business that adds foreign money to AUD one-for-one: IICT
 * Group Limited's HK$1m of revenue was drawn as A$1m instead of about
 * A$195,000. Orgs the coach excluded from consolidation were summed too.
 *
 * Same conventions as the consolidation engine (lib/consolidation/engine.ts):
 * include_in_consolidation decides membership, a blank functional_currency
 * defaults to AUD and is flagged rather than guessed.
 */
type TenantFx = { currency: string; included: boolean; currencyKnown: boolean }

/** Dead rows are kept when an org is disconnected, so an active row's answer wins. */
function tenantFxByTenant(rows: Array<Record<string, unknown>>): Map<string, TenantFx> {
  const out = new Map<string, TenantFx>()
  for (const row of rows) {
    const tenantId = (row.tenant_id ?? '') as string
    if (!tenantId) continue
    const isActive = row.is_active !== false
    if (out.has(tenantId) && !isActive) continue
    const raw = (row.functional_currency ?? '').toString().trim().toUpperCase()
    out.set(tenantId, {
      currency: raw || 'AUD',
      currencyKnown: raw.length > 0,
      included: row.include_in_consolidation !== false,
    })
  }
  return out
}

/** Month-average rates to AUD for every foreign currency drawn, read as the service role (fx_rates is coach/super-admin only). */
async function loadRatesToAud(currencies: string[], monthKeys: string[]): Promise<Map<string, Map<string, number>>> {
  const admin = createServiceRoleClient()
  const out = new Map<string, Map<string, number>>()
  for (const currency of currencies) {
    // `as never`: loadFxRates declares a minimal structural client (see fx.ts), as its other callers do.
    out.set(currency, await loadFxRates(admin as never, `${currency}/AUD`, 'monthly_average', monthKeys))
  }
  return out
}

async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const fiscalYearParam = searchParams.get('fiscalYear')
    const yearStartMonthParam = searchParams.get('yearStartMonth')

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const yearStartMonth = yearStartMonthParam ? parseInt(yearStartMonthParam, 10) : 7
    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam, 10) : getCurrentFiscalYear(yearStartMonth)

    if (isNaN(fiscalYear)) {
      return NextResponse.json({ error: 'fiscalYear must be a valid integer' }, { status: 400 })
    }

    // Dual-ID resolution — CRITICAL: financial_forecasts.business_id is FK to business_profiles.id
    const ids = await resolveBusinessProfileIds(supabase, businessId)

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/forecast/dashboard-actuals',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Needs nothing from the P&L steps below, so it runs alongside them.
    const clockInputsRead = readClockInputs(supabase, ids)

    // Generate fiscal month keys in correct fiscal year order
    const monthKeys = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
    const monthKeySet = new Set(monthKeys)
    const monthLabels = getFiscalMonthLabels(yearStartMonth)

    // Initialize per-month aggregates indexed by monthKey
    const aggsByMonth = new Map<string, MonthAggregate>()
    for (const k of monthKeys) aggsByMonth.set(k, emptyAgg())

    // ── Step 1: Try to find a forecast matching the REQUESTED fiscal year first ──
    //
    // This avoids reading FY26 actuals out of an FY27 forecast's sparse historical
    // slice (which produced empty charts for Matt on FY26 today).
    const { data: matchingForecast, error: matchingError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .eq('fiscal_year', fiscalYear)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // A failed read is not "no forecast": the charts would drop the plan, or
    // borrow another year's actuals, and still answer 200.
    if (matchingError) {
      Sentry.captureException(matchingError, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] Error fetching the FY forecast' } } as any)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    // Fallback: latest active forecast (used only as an actuals supplement when
    // no FY-matching forecast exists — its forecast_months are NOT applied to
    // the requested FY since they belong to a different plan year).
    const { data: latestForecast, error: latestError } = matchingForecast
      ? { data: matchingForecast, error: null }
      : await supabase
          .from('financial_forecasts')
          .select('id, business_id, fiscal_year')
          .in('business_id', ids.all)
          .eq('is_active', true)
          .order('fiscal_year', { ascending: false })
          .limit(1)
          .maybeSingle()

    if (latestError) {
      Sentry.captureException(latestError, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] Error fetching the latest forecast' } } as any)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    const forecastForActuals = matchingForecast ?? latestForecast
    const forecastSource: 'matching-fy' | 'latest-fallback' | 'none' =
      matchingForecast ? 'matching-fy' : latestForecast ? 'latest-fallback' : 'none'

    // ── Step 2: Aggregate from forecast_pl_lines ──
    if (forecastForActuals) {
      const { data: plLines, error: linesError } = await supabase
        .from('forecast_pl_lines')
        .select('account_name, category, account_type, actual_months, forecast_months, is_from_xero')
        .eq('forecast_id', forecastForActuals.id)

      if (linesError) {
        Sentry.captureException(linesError, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: "[dashboard-actuals] Error fetching pl_lines" } } as any)
        return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
      }

      for (const line of (plLines || [])) {
        const actualMonths = line.actual_months as Record<string, number> | null | undefined
        const forecastMonths = line.forecast_months as Record<string, number> | null | undefined
        const isRev = isRevenue(line.category, line.account_type)
        const isCogs = !isRev && isCOGS(line.category)

        for (const monthKey of monthKeys) {
          const agg = aggsByMonth.get(monthKey)!
          const lineActual = actualMonths?.[monthKey] || 0
          // Only apply forecast_months when this forecast's fiscal_year matches
          // the requested FY — otherwise it's a different year's plan.
          const lineForecast = forecastSource === 'matching-fy'
            ? (forecastMonths?.[monthKey] || 0)
            : 0

          if (isRev) {
            agg.revenueActual += lineActual
            agg.revenueForecast += lineForecast
          } else if (isCogs) {
            agg.cogsActual += lineActual
            agg.cogsForecast += lineForecast
          } else {
            agg.opexActual += lineActual
            agg.opexForecast += lineForecast
          }
        }
      }
    }

    // ── Step 3: Supplement actuals from xero_pl_lines_wide_compat ──
    //
    // Always run this — it's the canonical source for monthly Xero P&L. If the
    // forecast already had actuals for some months, we OVERWRITE with Xero's
    // monthly_values for the requested FY so the chart reflects current Xero
    // truth (the forecast's actual_months may be stale or incomplete for
    // historical FYs that weren't the forecast's primary year).
    const { data: xeroLines, error: xeroError } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('tenant_id, account_name, account_type, monthly_values, updated_at')
      .in('business_id', ids.all)

    if (xeroError) {
      // This used to be non-fatal: the charts fell back to the forecast's stored
      // actuals and showed them as if they were Xero's — under a "Last synced"
      // date that would describe figures it did not date.
      Sentry.captureException(xeroError, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: '[dashboard-actuals] xero_pl_lines_wide_compat read failed' } } as any)
      return NextResponse.json({ error: 'Failed to fetch Xero actuals' }, { status: 500 })
    }

    // Every drawn line's org and when that line was last written, for "Last
    // synced". Disconnecting an org keeps its mirror rows, so this can include
    // orgs with no connection row.
    const tenantsShown: XeroTenantShown[] = []

    // Which org each mirror row belongs to, in what currency, and whether the
    // coach consolidates it — from the same connection rows "Last synced" reads.
    const clockInputs = await clockInputsRead
    const tenantFx = clockInputs.ok
      ? tenantFxByTenant(clockInputs.rows as unknown as Array<Record<string, unknown>>)
      : new Map<string, TenantFx>()

    // Months whose actuals would be wrong because a foreign org has no rate:
    // drawn as no-data rather than summed untranslated.
    const untranslatedMonths = new Set<string>()
    const untranslatedOrgs = new Set<string>()

    if (xeroLines && xeroLines.length > 0) {
      const drawnTenants = new Set(xeroLines.map(l => (l.tenant_id ?? '') as string))
      // The connection read failed, so no org's currency is known. One org can
      // only be summed with itself; two or more could be different currencies,
      // and adding them would be the very bug this guards (F1).
      const currenciesUnknown = !clockInputs.ok && drawnTenants.size > 1
      if (currenciesUnknown) {
        for (const k of monthKeys) untranslatedMonths.add(k)
        Sentry.captureMessage('dashboard-actuals: actuals withheld — several orgs and no currency for any of them', {
          level: 'warning',
          tags: { route: 'forecast/dashboard-actuals', invariant: 'dashboard_actuals_currency_unknown' },
          extra: { businessId, tenantIds: [...drawnTenants] },
        } as any)
      }

      const drawnCurrencies = new Set<string>()
      for (const line of xeroLines) {
        const fx = tenantFx.get((line.tenant_id ?? '') as string)
        if (fx && !fx.included) continue
        if (fx && fx.currency !== 'AUD') drawnCurrencies.add(fx.currency)
      }

      let ratesByCurrency: Map<string, Map<string, number>>
      try {
        ratesByCurrency = await loadRatesToAud([...drawnCurrencies], monthKeys)
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'forecast/dashboard-actuals', invariant: 'dashboard_actuals_fx_rates_unreadable' }, extra: { context: '[dashboard-actuals] fx_rates read failed' } } as any)
        return NextResponse.json({ error: 'Failed to fetch exchange rates' }, { status: 500 })
      }

      // An org whose currency Xero never reported, on a business that also has a
      // foreign org: defaulting it to AUD is a guess, so say so (same invariant
      // the consolidation engine raises).
      if (drawnCurrencies.size > 0) {
        const unknown = [...tenantFx.entries()].filter(([, fx]) => fx.included && !fx.currencyKnown).map(([tenantId]) => tenantId)
        if (unknown.length > 0) {
          Sentry.captureMessage('dashboard-actuals: org missing functional_currency, treated as AUD', {
            level: 'warning',
            tags: { route: 'forecast/dashboard-actuals', invariant: 'dashboard_actuals_missing_functional_currency' },
            extra: { tenantIds: unknown, businessId },
          } as any)
        }
      }

      // Reset actual buckets — Xero is source of truth for actuals when present.
      for (const k of monthKeys) {
        const agg = aggsByMonth.get(k)!
        agg.revenueActual = 0
        agg.cogsActual = 0
        agg.opexActual = 0
      }

      for (const line of xeroLines) {
        const monthlyValues = (line.monthly_values || {}) as Record<string, number>
        const accountType = (line.account_type || '').toLowerCase()
        const isRev = XERO_REVENUE_TYPES.has(accountType)
        const isCogs = !isRev && XERO_COGS_TYPES.has(accountType)
        const tenantId = (line.tenant_id ?? '') as string
        const fx = tenantFx.get(tenantId)
        // An org the coach took out of the consolidation is not part of the total.
        if (fx && !fx.included) continue
        const currency = fx?.currency ?? 'AUD'
        const rates = currency === 'AUD' ? null : ratesByCurrency.get(currency)

        let drawn = false
        for (const monthKey of monthKeys) {
          const raw = monthlyValues[monthKey]
          if (!raw) continue
          if (!monthKeySet.has(monthKey)) continue
          let value = raw
          if (rates) {
            const rate = rates.get(monthKey)
            if (rate === undefined) {
              // The FX cron only stores closed months, so the open month is
              // normally the one missing. Never sum it as if it were AUD.
              untranslatedMonths.add(monthKey)
              untranslatedOrgs.add(tenantId)
              continue
            }
            value = raw * rate
          }
          const agg = aggsByMonth.get(monthKey)!
          if (isRev) agg.revenueActual += value
          else if (isCogs) agg.cogsActual += value
          else agg.opexActual += value
          drawn = true
        }
        if (drawn) tenantsShown.push({ tenantId: line.tenant_id ?? null, lastWrittenAt: line.updated_at ?? null })
      }
    }

    const lastSync = await lastSyncFor(clockInputs, ids, tenantsShown)

    // ── Step 4: Project aggregates into chart row format ──
    if (untranslatedMonths.size > 0) {
      Sentry.captureMessage('dashboard-actuals: months drawn without actuals — no FX rate', {
        level: 'warning',
        tags: { route: 'forecast/dashboard-actuals', invariant: 'dashboard_actuals_month_untranslated' },
        extra: { businessId, months: [...untranslatedMonths].sort(), tenantIds: [...untranslatedOrgs] },
      } as any)
    }

    const months = monthKeys.map((monthKey, idx) => {
      const agg = aggsByMonth.get(monthKey)!
      // A month a foreign org could not be translated into carries no actuals:
      // the alternative is a total that silently adds foreign money to AUD.
      const actualsUsable = !untranslatedMonths.has(monthKey)
      const gpActual = agg.revenueActual - agg.cogsActual
      const gpForecast = agg.revenueForecast - agg.cogsForecast
      const npActual = gpActual - agg.opexActual
      const npForecast = gpForecast - agg.opexForecast

      // Use null for months with zero values to indicate "no data" (lets the
      // chart distinguish missing-data months from genuine $0 months and
      // suppresses bars cleanly).
      return {
        month: monthKey,
        label: monthLabels[idx],
        revenueActual: actualsUsable && agg.revenueActual !== 0 ? agg.revenueActual : null,
        revenueForecast: agg.revenueForecast !== 0 ? agg.revenueForecast : null,
        gpActual: actualsUsable && gpActual !== 0 ? gpActual : null,
        gpForecast: gpForecast !== 0 ? gpForecast : null,
        npActual: actualsUsable && npActual !== 0 ? npActual : null,
        npForecast: npForecast !== 0 ? npForecast : null,
      }
    })

    // Check if there's any meaningful data (actuals OR forecast)
    const hasAnyData = months.some(m =>
      m.revenueActual !== null || m.revenueForecast !== null
    )

    if (process.env.NODE_ENV !== 'production') {
      console.log('[dashboard-actuals] Returning data for business', businessId, {
        forecastId: forecastForActuals?.id ?? null,
        forecastFY: forecastForActuals?.fiscal_year ?? null,
        forecastSource,
        requestedFY: fiscalYear,
        monthCount: months.length,
        hasAnyData,
      })
    }

    return NextResponse.json({
      data: {
        months,
        lastSync,
      },
      hasData: hasAnyData,
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'forecast/dashboard-actuals' }, extra: { context: "[dashboard-actuals] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'forecast/dashboard-actuals',
  GetQuerySchema,
  getHandler
)
