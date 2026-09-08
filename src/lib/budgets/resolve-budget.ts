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
  pin: {
    budgetVersionId?: string | null
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
}

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
  { businessId, profileId, fiscalYear, pin }: ResolveBudgetArgs,
): Promise<ResolvedBudget> {
  // ── Tier V: a pinned budget version ────────────────────────────────────────
  // Inert until something sets the pin. Skipped entirely when absent, so the
  // new tables are not touched at all in the window between this code
  // deploying and the migration being applied by hand.
  if (pin.budgetVersionId) {
    const version = await readBudgetVersion(supabase, pin.budgetVersionId, businessId, fiscalYear)
    if (version) return version
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
  }
}

/**
 * Read a pinned budget version and its lines.
 *
 * Scoped by business and fiscal year, unlike the forecast pin it sits above:
 * that one is unscoped today and tightening it would change behaviour for a
 * mis-pinned client, so it stays as-is until its own PR. A version pin is new,
 * so it starts correct.
 *
 * Returns null — never throws — when the pin misses, the tables do not exist
 * yet, or the version has no lines. Code deploys before migrations are applied
 * by hand here, so a missing relation has to read as "no version" rather than
 * a 500 on every client's report.
 */
async function readBudgetVersion(
  supabase: SupabaseClient,
  versionId: string,
  businessId: string,
  fiscalYear: number | string,
): Promise<ResolvedBudget | null> {
  try {
    const { data: version, error } = await supabase
      .from('budget_versions')
      .select('id, label, business_id, fiscal_year, locked_at')
      .eq('id', versionId)
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .not('locked_at', 'is', null)
      .maybeSingle()

    if (error || !version) return null

    const { data: rows, error: linesError } = await supabase
      .from('budget_lines')
      .select('id, account_name, category, month, amount')
      .eq('budget_version_id', version.id)

    if (linesError || !rows || rows.length === 0) return null

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
      const key = row.account_name
      let line = byAccount.get(key)
      if (!line) {
        line = { id: row.id, account_name: row.account_name, category: row.category, forecast_months: {} }
        byAccount.set(key, line)
      }
      const amount = Number(row.amount) || 0
      line.forecast_months[row.month] = (line.forecast_months[row.month] ?? 0) + amount
    }

    const lines = Array.from(byAccount.values())
    if (lines.length === 0) return null

    return {
      source: 'budget_version',
      versionId: version.id,
      forecastId: null,
      label: version.label ?? null,
      lines,
      monthsCovered: countMonths(lines),
    }
  } catch {
    // Missing relation, stale PostgREST cache, anything: fall through to the
    // forecast tier rather than failing the report.
    return null
  }
}
