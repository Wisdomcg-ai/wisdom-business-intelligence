/**
 * WA.5a — non-destructive account auto-mapping.
 *
 * Auto-map exists to turn a business's synced Xero accounts into
 * `account_mappings` rows so the monthly report can render. It used to do that
 * with a blanket upsert:
 *
 *   .upsert(rows, { onConflict: 'business_id,xero_account_name',
 *                   ignoreDuplicates: false })
 *
 * where every row carried a recomputed `report_category`, a recomputed forecast
 * link, and `is_confirmed: false`. So re-running it on an already-mapped
 * business silently:
 *
 *   - reset every confirmed mapping back to unconfirmed,
 *   - overwrote any report_category a coach had corrected by hand, and
 *   - rewired forecast links by fuzzy match, discarding hand-set ones.
 *
 * At the time of writing, 357 of 444 production mappings are confirmed — 88 of
 * them on Just Digital, 84 with a forecast link. The "Auto-Map" button in the
 * mapping editor calls this with no confirmation step, so that was one click
 * away at all times. It also blocked the useful thing: you cannot safely run
 * auto-map from a sync when the operation can destroy a coach's work.
 *
 * The rule now: **auto-map fills gaps, it never overwrites judgement.**
 *
 *   - an account with no mapping row      -> insert
 *   - an unconfirmed row with no forecast link, where a match now exists
 *                                          -> add the link, nothing else
 *   - anything confirmed                   -> untouched, always
 *
 * The second case matters because the usual order of operations is sync Xero,
 * auto-map, then build the forecast. Rows mapped before a forecast existed have
 * no link, and re-running should be able to fill that in without the coach
 * losing anything. Efficient Living is exactly this shape today: 87 mappings,
 * 0 confirmed, 0 linked.
 *
 * `planAutoMap` is pure so the decisions above are testable without a database;
 * `autoMapAccounts` is the thin IO wrapper around it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'

/** A distinct Xero account seen in the business's synced P&L lines. */
export interface XeroAccountInput {
  account_name: string
  account_code: string | null
  account_type: string
  section: string
}

/** An account_mappings row as it exists today. */
export interface ExistingMapping {
  xero_account_name: string
  is_confirmed: boolean | null
  forecast_pl_line_id: string | null
}

export interface ForecastLine {
  id: string
  account_name: string
  account_code: string | null
}

/** A new account_mappings row to insert. */
export interface NewMappingRow {
  business_id: string
  xero_account_code: string | null
  xero_account_name: string
  xero_account_type: string | null
  report_category: string
  report_subcategory: string | null
  forecast_pl_line_id: string | null
  forecast_pl_line_name: string | null
  is_auto_mapped: true
  is_confirmed: false
  updated_at: string
}

/** A forecast link to add to an existing unconfirmed, unlinked row. */
export interface ForecastLinkUpdate {
  xero_account_name: string
  forecast_pl_line_id: string
  forecast_pl_line_name: string
}

export interface AutoMapPlan {
  toInsert: NewMappingRow[]
  toLinkForecast: ForecastLinkUpdate[]
  /** Distinct Xero accounts considered. */
  xeroAccounts: number
  /** Existing rows deliberately left alone. */
  preserved: number
  /** Of those, how many were confirmed — the ones the old code would have reset. */
  confirmedPreserved: number
  matchedByCode: number
  matchedByName: number
  matchedToForecast: number
}

/** Xero account_type -> report category. */
export function mapAccountTypeToCategory(accountType: string): string {
  switch ((accountType || '').toLowerCase()) {
    case 'revenue':
      return 'Revenue'
    case 'cogs':
      return 'Cost of Sales'
    case 'opex':
      return 'Operating Expenses'
    case 'other_income':
      return 'Other Income'
    case 'other_expense':
      return 'Other Expenses'
    default:
      return 'Operating Expenses'
  }
}

/**
 * Decide what auto-map should do, without touching the database.
 *
 * Forecast matching keeps the previous priority: account_code first (exact and
 * deterministic), then a fuzzy name match.
 */
export function planAutoMap(args: {
  businessId: string
  xeroAccounts: ReadonlyArray<XeroAccountInput>
  existingMappings: ReadonlyArray<ExistingMapping>
  forecastLines: ReadonlyArray<ForecastLine>
  now?: string
}): AutoMapPlan {
  const { businessId, xeroAccounts, existingMappings, forecastLines } = args
  const now = args.now ?? new Date().toISOString()

  // Dedupe by account name — the same account appears once per period_month.
  const unique = new Map<string, XeroAccountInput>()
  for (const acc of xeroAccounts) {
    if (acc.account_name && !unique.has(acc.account_name)) unique.set(acc.account_name, acc)
  }

  const existingByName = new Map<string, ExistingMapping>()
  for (const m of existingMappings) existingByName.set(m.xero_account_name, m)

  const forecastByCode = new Map<string, ForecastLine>()
  for (const line of forecastLines) {
    if (line.account_code) forecastByCode.set(line.account_code, line)
  }
  const findForecastByName = buildFuzzyLookup(
    forecastLines as ForecastLine[],
    (line) => line.account_name,
  )

  const plan: AutoMapPlan = {
    toInsert: [],
    toLinkForecast: [],
    xeroAccounts: unique.size,
    preserved: 0,
    confirmedPreserved: 0,
    matchedByCode: 0,
    matchedByName: 0,
    matchedToForecast: 0,
  }

  for (const acc of unique.values()) {
    // Resolve a forecast match once; both branches below may want it.
    let match: ForecastLine | undefined
    let viaCode = false
    if (acc.account_code) {
      match = forecastByCode.get(acc.account_code)
      if (match) viaCode = true
    }
    if (!match) match = findForecastByName(acc.account_name)

    const existing = existingByName.get(acc.account_name)

    if (!existing) {
      if (match) {
        plan.matchedToForecast++
        if (viaCode) plan.matchedByCode++
        else plan.matchedByName++
      }
      plan.toInsert.push({
        business_id: businessId,
        xero_account_code: acc.account_code || null,
        xero_account_name: acc.account_name,
        xero_account_type: acc.account_type || null,
        report_category: mapAccountTypeToCategory(acc.account_type),
        report_subcategory: acc.section || null,
        forecast_pl_line_id: match?.id ?? null,
        forecast_pl_line_name: match?.account_name ?? null,
        is_auto_mapped: true,
        is_confirmed: false,
        updated_at: now,
      })
      continue
    }

    // An existing row. Never rewrite a category or a confirmed row.
    plan.preserved++
    if (existing.is_confirmed) plan.confirmedPreserved++

    const canFillLink = !existing.is_confirmed && !existing.forecast_pl_line_id
    if (canFillLink && match) {
      plan.matchedToForecast++
      if (viaCode) plan.matchedByCode++
      else plan.matchedByName++
      plan.toLinkForecast.push({
        xero_account_name: acc.account_name,
        forecast_pl_line_id: match.id,
        forecast_pl_line_name: match.account_name,
      })
    }
  }

  return plan
}

export interface AutoMapResult extends AutoMapPlan {
  created: number
  forecastLinksAdded: number
}

/**
 * Run auto-map for a business.
 *
 * `businessId` is written to account_mappings as-is (businesses-space, matching
 * every other consumer of that table); Xero rows are read across both id spaces
 * via the resolver, as the rest of the monthly report does.
 */
export async function autoMapAccounts(
  supabase: SupabaseClient,
  businessId: string,
): Promise<AutoMapResult> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  const [xeroRes, existingRes, forecastRes] = await Promise.all([
    supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_name, account_code, account_type, section')
      .in('business_id', ids.all),
    supabase
      .from('account_mappings')
      .select('xero_account_name, is_confirmed, forecast_pl_line_id')
      .eq('business_id', businessId),
    supabase
      .from('financial_forecasts')
      .select('id')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (xeroRes.error) throw xeroRes.error
  if (existingRes.error) throw existingRes.error

  let forecastLines: ForecastLine[] = []
  if (forecastRes.data?.id) {
    const { data, error } = await supabase
      .from('forecast_pl_lines')
      .select('id, account_name, account_code')
      .eq('forecast_id', forecastRes.data.id)
    if (error) {
      // A missing forecast degrades the mapping (no links) but must not fail the
      // whole run — an unlinked mapping still lets the report render.
      Sentry.captureException(error, {
        tags: { invariant: 'auto-map-forecast-lines' },
        extra: { businessId, forecastId: forecastRes.data.id },
      } as any)
    } else {
      forecastLines = (data ?? []) as ForecastLine[]
    }
  }

  const plan = planAutoMap({
    businessId,
    xeroAccounts: (xeroRes.data ?? []) as XeroAccountInput[],
    existingMappings: (existingRes.data ?? []) as ExistingMapping[],
    forecastLines,
  })

  let created = 0
  if (plan.toInsert.length > 0) {
    // Insert-only. onConflict...ignoreDuplicates skips any row that raced in
    // between the read and the write rather than overwriting it — the whole
    // point of this function is that it never clobbers an existing row.
    const { data, error } = await supabase
      .from('account_mappings')
      .upsert(plan.toInsert, {
        onConflict: 'business_id,xero_account_name',
        ignoreDuplicates: true,
      })
      .select('id')
    if (error) throw error
    created = data?.length ?? 0
  }

  let forecastLinksAdded = 0
  for (const link of plan.toLinkForecast) {
    // Narrow update: only the link columns, and only while the row is still
    // unconfirmed and unlinked. The predicate makes this safe against a coach
    // confirming the row between the read and the write.
    const { data, error } = await supabase
      .from('account_mappings')
      .update({
        forecast_pl_line_id: link.forecast_pl_line_id,
        forecast_pl_line_name: link.forecast_pl_line_name,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)
      .eq('xero_account_name', link.xero_account_name)
      .is('forecast_pl_line_id', null)
      .or('is_confirmed.is.null,is_confirmed.eq.false')
      .select('id')
    if (error) {
      Sentry.captureException(error, {
        tags: { invariant: 'auto-map-forecast-link' },
        extra: { businessId, account: link.xero_account_name },
      } as any)
      continue
    }
    forecastLinksAdded += data?.length ?? 0
  }

  return { ...plan, created, forecastLinksAdded }
}

/**
 * WA.5b — first-sync trigger.
 *
 * Auto-map used to be reachable only from the Xero OAuth return leg and a
 * button on the Mapping tab — so a business connected before that wiring (or
 * reconnected without a fresh consent round-trip) never got mappings, and
 * generate/route.ts turns zero mappings into a hard 400 NO_MAPPINGS. Five
 * Xero-connected businesses were stuck in exactly that state.
 *
 * Called by the sync orchestrator after a sync lands data. Deliberately
 * conservative: it acts only when the business has ZERO mapping rows — the
 * blocked-client case. Gap-filling a partially-mapped business remains the
 * mapping editor's explicit button; a background job should not be the thing
 * that grows a mapping set a coach is mid-way through curating.
 *
 * Never throws: mapping is a bonus on top of a sync, and a sync must not be
 * marked failed because auto-map hiccuped. Failures are Sentry-tagged.
 */
export async function autoMapIfUnmapped(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ triggered: boolean; created: number }> {
  try {
    const { count, error } = await supabase
      .from('account_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
    if (error) throw error
    if ((count ?? 0) > 0) return { triggered: false, created: 0 }

    const result = await autoMapAccounts(supabase, businessId)
    return { triggered: true, created: result.created }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { invariant: 'auto-map-on-sync' },
      extra: { businessId },
    } as any)
    return { triggered: false, created: 0 }
  }
}
