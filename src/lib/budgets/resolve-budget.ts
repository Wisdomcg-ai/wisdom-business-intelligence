/**
 * Where the monthly report's BUDGET comes from.
 *
 * A budget and a forecast are different objects: a budget is approved once,
 * covers all twelve months and changes only by an explicit revision; a forecast
 * is re-cut constantly and legitimately starts at the current month. The report
 * has always read a forecast, which is why a closed month's variance can move
 * after the fact and why a mid-year-seeded forecast has no budget for the month
 * being reported (Distinct Directions, 8 Sep 2026: August budget $0 against a
 * $471,250 actual). `budget_versions` / `budget_lines` give the budget its own
 * object; this module is the seam that lets the source change underneath the
 * report without the report noticing.
 *
 * THIS FILE CHANGES NO BEHAVIOUR. Every branch below is lifted verbatim from
 * generate/route.ts, including the things that look like bugs — the FY guard's
 * null-tolerance, the sequential id loop, the unordered line read whose row
 * order decides which duplicate account name wins downstream. The budget-version
 * tier is inert until a caller passes a pin, which nothing does yet.
 *
 * See .planning/BUDGET-STORE-PLAN.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

/**
 * One budget line, in the shape generate/route.ts already consumes.
 *
 * `id` is REQUIRED and unique within a ResolvedBudget. The route keys four
 * separate behaviours on it — a by-id map, the exact-match tier that
 * account_mappings.forecast_pl_line_id points at, the matched set, and the
 * double-claim guard. With `id` undefined the failure is not a crash but a
 * plausible-looking report: the first matched account claims `undefined`, every
 * later one reads as already-claimed and renders $0 across all four budget
 * columns, and the budget-only pass emits nothing. The whole budget column
 * collapses onto one account. On the forecast path this is the real
 * `forecast_pl_lines.id`, because that is exactly what the mapping points at.
 */
export interface ResolvedBudgetLine {
  id: string
  account_name: string
  /**
   * Report display vocabulary: 'Revenue' | 'Cost of Sales' |
   * 'Operating Expenses' | 'Other Income' | 'Other Expenses'. Nullable —
   * forecast_pl_lines.category is, and the consumer defaults null to
   * Operating Expenses.
   */
  category: string | null
  /**
   * Deliberately keeps the legacy name. The call site types this `any`, so a
   * rename here would be a silent runtime zeroing rather than a type error:
   * every budget cell would render $0 as a real variance instead of an honest
   * dash, and unspent_budget would go large-negative on every row — persisted
   * into monthly_report_snapshots. Rename once the call site is typed.
   */
  forecast_months: Record<string, number>
}

export type NoBudgetReason =
  | 'no_version_in_force'
  | 'version_not_yet_effective'
  | 'multiple_versions_in_force'
  | 'version_has_no_lines'
  | 'budget_read_failed'
  | 'invalid_report_month'

export interface ResolvedBudget {
  /**
   * 'none' means there is no budget. A source that resolved an object but
   * yielded zero lines returns 'none' — the caller's `hasBudget` must equal
   * `lines.length > 0`, or the twelve active-but-empty forecasts in prod flip
   * from an honest no-budget banner to $0 budget columns.
   */
  source: 'budget_version' | 'forecast' | 'none'
  /** budget_versions.id when source === 'budget_version', else null. */
  versionId: string | null
  /**
   * financial_forecasts.id when source === 'forecast', else null. Emitted
   * verbatim as report.budget_forecast_id — pure provenance, frozen into
   * monthly_report_snapshots.report_data, and the only record of what a
   * finalised month was measured against.
   */
  forecastId: string | null
  /**
   * Why there is no budget, when the client is on the budget store. Null on the
   * legacy path. The banner names it rather than showing a blank column, which
   * a reader takes for $0.
   */
  noBudgetReason: NoBudgetReason | null
  /** The forecast's name / the version's label. */
  label: string | null
  lines: ResolvedBudgetLine[]
  /** Distinct months carrying at least one line. Diagnostic; nothing reads it yet. */
  monthsCovered: number
}

export interface ResolveBudgetArgs {
  /** businesses-space. */
  businessId: string
  /**
   * business_profiles.id, passed in rather than re-derived: the caller's own
   * profile read also supplies yearStartMonth, and duplicating the query risks
   * the two disagreeing. All 31 profiles are fiscal_year_start = 7 today, so a
   * silent default would be invisible in testing.
   */
  profileId: string | null
  fiscalYear: number | string
  /**
   * 'YYYY-MM'. Effective-dating compares month keys as TEXT, so '2026-8' would
   * sort before '2026-10' and silently pick the wrong version — the shape is
   * validated here rather than trusted.
   */
  reportMonth: string
  /**
   * monthly_report_settings.budget_source. Read POSITIVELY: 19 of 31 businesses
   * have no settings row, so this arrives undefined rather than 'forecast'.
   */
  budgetSource: 'forecast' | 'budget_version'
  pin: {
    budgetForecastId?: string | null
  }
}

const NONE: ResolvedBudget = {
  source: 'none',
  versionId: null,
  forecastId: null,
  label: null,
  lines: [],
  monthsCovered: 0,
  noBudgetReason: null,
}

/** 'none', but able to say why — only ever used on the budget-store path. */
function noneBecause(reason: NoBudgetReason): ResolvedBudget {
  return { ...NONE, noBudgetReason: reason }
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

function countMonths(lines: readonly ResolvedBudgetLine[]): number {
  const months = new Set<string>()
  for (const line of lines) {
    for (const key of Object.keys(line.forecast_months || {})) months.add(key)
  }
  return months.size
}

/**
 * Resolve the budget for one report.
 *
 * Tier order, and the rule that governs it: **a tier that fails to resolve an
 * object falls through; a tier that resolves an object but has zero lines ends
 * the cascade at 'none'.** That asymmetry is today's behaviour — a dangling pin
 * retries the fallback, a pin at an empty forecast does not.
 */
export async function resolveBudget(
  supabase: SupabaseClient,
  { businessId, profileId, fiscalYear, reportMonth, budgetSource, pin }: ResolveBudgetArgs,
): Promise<ResolvedBudget> {
  // ── Tier V: the budget store ───────────────────────────────────────────────
  // The gate is on the QUERY, not the tier order: with 'forecast' the budget
  // tables are not touched at all, so every business that has not been switched
  // over is byte-identical to before — and the window between this code
  // deploying and the migration being applied by hand is safe.
  //
  // FAIL-CLOSED once a client is on the store. Falling back to the forecast
  // here would silently measure them against the moving yardstick this whole
  // design exists to get away from, so every miss ends at 'none' carrying a
  // reason the banner can state.
  if (budgetSource === 'budget_version') {
    return await resolveInForceVersion(supabase, businessId, fiscalYear, reportMonth)
  }

  // ── Tier F1: the pinned forecast ───────────────────────────────────────────
  let selected: { id: string; name?: string | null } | null = null

  if (pin.budgetForecastId) {
    const { data: fc } = await supabase
      .from('financial_forecasts')
      .select('id, name, fiscal_year')
      .eq('id', pin.budgetForecastId)
      .single()

    // `monthly_report_settings` has ONE row per business and no fiscal_year
    // column, so the pin is FY-agnostic. Honouring it for every year would
    // measure an FY2026 report against an FY2027 budget the moment a coach
    // pinned next year's plan — every line wrong, silently. A null fiscal_year
    // is deliberately honoured for every year, and both sides go through
    // Number() because fiscal_year arrives from the request body uncoerced.
    if (fc && fc.fiscal_year != null && Number(fc.fiscal_year) !== Number(fiscalYear)) {
      Sentry.captureMessage('[Report Generate] Pinned budget belongs to another fiscal year — falling back', {
        level: 'warning' as any,
        tags: { invariant: 'budget-fy-mismatch' },
        extra: {
          business_id: businessId,
          pinnedForecastId: fc.id,
          pinnedFY: fc.fiscal_year,
          reportFY: fiscalYear,
        },
      } as any)
    } else {
      selected = fc
    }
  }

  // ── Tier F2: the active forecast for this FY ───────────────────────────────
  if (!selected) {
    // Both id-spaces, profile first, first hit wins. Not `.in()` — the
    // sequential loop and its order are the live behaviour, and they cannot
    // currently disagree only because no (business_id, fiscal_year) has two
    // active rows. That is a data window, not a constraint.
    const idsToTry = profileId ? [profileId, businessId] : [businessId]

    for (const id of idsToTry) {
      const { data: fc } = await supabase
        .from('financial_forecasts')
        .select('id, name')
        .eq('business_id', id)
        .eq('is_active', true)
        .eq('fiscal_year', fiscalYear)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (fc) {
        selected = fc
        break
      }
    }
  }

  if (!selected) return NONE

  // Unordered on purpose: row order decides which duplicate account name the
  // downstream fuzzy lookup keeps and which the budget-only pass re-emits.
  // Adding an ORDER BY here would silently reshuffle live reports.
  const { data: bLines } = await supabase
    .from('forecast_pl_lines')
    .select('id, account_name, category, forecast_months')
    .eq('forecast_id', selected.id)

  const lines = (bLines || []) as ResolvedBudgetLine[]

  // A forecast with ZERO materialised lines is not a budget. The wizard used to
  // activate empty-shell forecasts, and the report would otherwise render $0
  // budgets against every row. Twelve active forecasts in prod are in exactly
  // this state. Demoting here — rather than returning an empty line array —
  // is what keeps `hasBudget === (lines.length > 0)` true for the caller.
  if (lines.length === 0) return NONE

  return {
    source: 'forecast',
    versionId: null,
    forecastId: selected.id,
    label: selected.name ?? null,
    lines,
    monthsCovered: countMonths(lines),
    noBudgetReason: null,
  }
}

/**
 * The budget version in force for a report month.
 *
 * Effective-dating, not a pin: a version carries the month it becomes the
 * baseline, and the report asks "which one was in force in August?" rather than
 * "which one is currently selected?". That is what stops a revision imported in
 * December from restating August, and it is why there is no budget_version_id
 * on settings — a single FY-agnostic pointer is the shape that produced the
 * budget-fy-mismatch guard on the forecast path.
 *
 * ONE in-force version only, for now. A single report reads four different
 * month windows out of one budget map — the report month, YTD, the annual
 * total and next month — while carrying one version id. Stitching a v2 across
 * those windows month by month is a separate piece of work; until it exists,
 * two in-force versions is refused rather than answered wrongly. The same
 * refusal keeps multi-org businesses (Dragon 2 orgs, IICT 3) out, without
 * inventing an FX rule for summing their budgets.
 *
 * Never throws: code deploys before migrations are applied by hand here, so a
 * missing relation reads as "could not read the budget", not a 500 on every
 * client's report.
 */
async function resolveInForceVersion(
  supabase: SupabaseClient,
  businessId: string,
  fiscalYear: number | string,
  reportMonth: string,
): Promise<ResolvedBudget> {
  // A malformed month would compare lexically against effective_from and could
  // pick the wrong version silently. Refuse instead.
  if (!MONTH_KEY.test(reportMonth || '')) return noneBecause('invalid_report_month')

  try {
    const { data: versions, error } = await supabase
      .from('budget_versions')
      .select('id, label, effective_from, version_number')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .not('locked_at', 'is', null)
      .lte('effective_from', reportMonth)
      .order('effective_from', { ascending: false })

    if (error) return noneBecause('budget_read_failed')
    if (!versions || versions.length === 0) {
      // Distinguish "nothing imported" from "imported, but not yet in force" —
      // reporting July against a version effective from September is a real
      // state with a different answer for the reader.
      const { data: future } = await supabase
        .from('budget_versions')
        .select('id')
        .eq('business_id', businessId)
        .eq('fiscal_year', fiscalYear)
        .not('locked_at', 'is', null)
        .gt('effective_from', reportMonth)
        .limit(1)
      return noneBecause(future && future.length > 0 ? 'version_not_yet_effective' : 'no_version_in_force')
    }

    // Everything sharing the newest effective_from is genuinely ambiguous;
    // an older one is simply superseded.
    const newest = versions[0].effective_from
    const inForce = versions.filter((v: { effective_from: string }) => v.effective_from === newest)
    if (inForce.length > 1) {
      Sentry.captureMessage('[Report Generate] More than one budget version in force — refusing to choose', {
        level: 'warning' as any,
        tags: { invariant: 'budget-multiple-versions-in-force' },
        extra: { business_id: businessId, fiscalYear, reportMonth, effective_from: newest, versionIds: inForce.map((v: { id: string }) => v.id) },
      } as any)
      return noneBecause('multiple_versions_in_force')
    }

    const version = inForce[0] as { id: string; label: string | null }

    const { data: rows, error: linesError } = await supabase
      .from('budget_lines')
      .select('id, account_name, category, month, amount')
      .eq('budget_version_id', version.id)

    if (linesError) return noneBecause('budget_read_failed')
    if (!rows || rows.length === 0) return noneBecause('version_has_no_lines')

    // budget_lines is one row per account per month; the report wants one line
    // per account carrying a month map.
    const byAccount = new Map<string, ResolvedBudgetLine>()
    for (const row of rows as Array<{
      id: string
      account_name: string
      category: string | null
      month: string
      amount: number | string
    }>) {
      let line = byAccount.get(row.account_name)
      if (!line) {
        line = { id: row.id, account_name: row.account_name, category: row.category, forecast_months: {} }
        byAccount.set(row.account_name, line)
      }
      line.forecast_months[row.month] = (line.forecast_months[row.month] ?? 0) + (Number(row.amount) || 0)
    }

    const lines = Array.from(byAccount.values())
    return {
      source: 'budget_version',
      versionId: version.id,
      forecastId: null,
      label: version.label ?? null,
      lines,
      monthsCovered: countMonths(lines),
      noBudgetReason: null,
    }
  } catch {
    return noneBecause('budget_read_failed')
  }
}
