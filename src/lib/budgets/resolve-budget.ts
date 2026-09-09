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
 * The FORECAST tiers below still change no behaviour: every branch is lifted
 * verbatim from generate/route.ts, including the things that look like bugs —
 * the FY guard's null-tolerance, the sequential id loop, the unordered line
 * read whose row order decides which duplicate account name wins downstream.
 * Leave them alone; the characterisation suite exists to catch anyone who
 * doesn't.
 *
 * The BUDGET-VERSION tier does not share that constraint, because it has no
 * legacy to be faithful to. It carries budget_lines.account_code through and
 * groups on it — see budgetLineKey below for why grouping on the name alone
 * was quietly summing distinct accounts together.
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
  /**
   * Xero's account code — the one key that is the same string on the budget
   * side and the actuals side, and the reason this field exists at all. Name
   * matching is a heuristic that loses on any account a bookkeeper renamed on
   * one side only: Urban Road's P&L says "Foreign Currency Gains and Losses"
   * where its budget says "Foreign Currency Loss/Gain", which normalise to
   * nothing in common, so the report printed the account TWICE — once with the
   * actual and a $0 budget, once budget-only with a $0 actual — and both
   * Operating Expenses subtotals were wrong.
   *
   * OPTIONAL, not `string | null`: the forecast path never selects it, so on
   * that path the property is absent rather than present-and-null, and the
   * resolved line is byte-identical to what it was before this field existed.
   * Everything downstream must therefore treat a missing code as "this source
   * has no codes", never as "this account has no code".
   */
  account_code?: string | null
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
   * Every fiscal month the caller will read out of the budget, in FY order.
   * The monthly report reads four different windows out of one budget map —
   * the report month, YTD, the annual total and next month — so resolving a
   * single version for the anchor month and applying it to all four would let a
   * revision restate the months before it took effect, inside the very totals
   * that are meant to be settled. Each month gets the version in force FOR THAT
   * MONTH. Defaults to [reportMonth].
   */
  months?: readonly string[]
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

/**
 * The identity of a budget account: its code when it has one, its name when it
 * does not.
 *
 * Two things have to agree on this or money goes missing. The resolver groups
 * budget_lines by it (one row per account per month collapses into one line
 * carrying a month map), and the report's budget-only pass suppresses by it
 * (a budget account already shown against an actual must not be re-emitted as
 * a second, budget-only row). Key those two on DIFFERENT things — grouping on
 * code, suppressing on name — and a pair of same-named accounts splits into
 * two lines of which only one survives the suppression: the other's whole
 * annual budget silently disappears from the subtotal. Grouping on name alone,
 * which is what this replaced, had the mirror-image failure: the two accounts
 * merged and their budgets were summed into whichever row won.
 *
 * The `code:` / `name:` prefixes keep the two namespaces apart, so an account
 * code that happens to read like another account's name cannot collide with it.
 */
export function budgetLineKey(line: { account_code?: string | null; account_name?: string | null }): string {
  const code = (line.account_code ?? '').trim().toLowerCase()
  if (code) return `code:${code}`
  return `name:${(line.account_name ?? '').trim().toLowerCase()}`
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
  { businessId, profileId, fiscalYear, reportMonth, months, budgetSource, pin }: ResolveBudgetArgs,
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
    return await resolveInForceVersion(supabase, businessId, fiscalYear, reportMonth, months)
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
  months?: readonly string[],
): Promise<ResolvedBudget> {
  // A malformed month would compare lexically against effective_from and could
  // pick the wrong version silently. Refuse instead.
  if (!MONTH_KEY.test(reportMonth || '')) return noneBecause('invalid_report_month')
  const wanted = (months && months.length > 0 ? months : [reportMonth]).filter((m) => MONTH_KEY.test(m))
  if (wanted.length === 0) return noneBecause('invalid_report_month')

  try {
    // Every locked version for the year, not just those already in force for
    // the anchor month: a later month may be governed by a version the anchor
    // month predates.
    const { data: versions, error } = await supabase
      .from('budget_versions')
      .select('id, label, effective_from, version_number, tenant_id')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .not('locked_at', 'is', null)
      .order('effective_from', { ascending: false })

    if (error) return noneBecause('budget_read_failed')

    const all = (versions ?? []) as Array<{
      id: string
      label: string | null
      effective_from: string
      tenant_id: string | null
    }>

    if (all.length === 0) return noneBecause('no_version_in_force')

    // ── Which version governs each month ─────────────────────────────────────
    const versionForMonth = new Map<string, string>()
    const chosen = new Map<string, { id: string; label: string | null; tenant_id: string | null }>()
    let ambiguousAt: { month: string; effectiveFrom: string; ids: string[] } | null = null

    for (const month of wanted) {
      const eligible = all.filter((v) => v.effective_from <= month)
      if (eligible.length === 0) continue
      const newest = eligible[0].effective_from
      const tied = eligible.filter((v) => v.effective_from === newest)
      if (tied.length > 1) {
        // Refused for the WHOLE year, not just this month: dropping one month
        // from the annual total would understate the yardstick silently, which
        // is worse than declining to answer.
        ambiguousAt = { month, effectiveFrom: newest, ids: tied.map((v) => v.id) }
        break
      }
      versionForMonth.set(month, tied[0].id)
      chosen.set(tied[0].id, tied[0])
    }

    if (ambiguousAt) {
      Sentry.captureMessage('[Report Generate] More than one budget version in force — refusing to choose', {
        level: 'warning' as any,
        tags: { invariant: 'budget-multiple-versions-in-force' },
        extra: { business_id: businessId, fiscalYear, ...ambiguousAt },
      } as any)
      return noneBecause('multiple_versions_in_force')
    }

    // The report month is the primary window; a budget that does not govern it
    // cannot answer the question being asked, even if it governs later months.
    // Reporting July against a version effective from September is a real state
    // with its own answer, and it is not "fall back to the forecast".
    if (!versionForMonth.has(reportMonth)) return noneBecause('version_not_yet_effective')

    // Summing two Xero orgs' budgets would need an FX rule this does not have,
    // and the settings flip already refuses multi-org businesses. Belt and
    // braces, because the flip guard lives in a different route.
    const tenants = new Set(Array.from(chosen.values()).map((v) => v.tenant_id ?? ''))
    if (tenants.size > 1) {
      Sentry.captureMessage('[Report Generate] Budget versions span more than one Xero org — refusing to sum', {
        level: 'warning' as any,
        tags: { invariant: 'budget-multiple-tenants-in-force' },
        extra: { business_id: businessId, fiscalYear, tenants: Array.from(tenants) },
      } as any)
      return noneBecause('multiple_versions_in_force')
    }

    const { data: rows, error: linesError } = await supabase
      .from('budget_lines')
      .select('id, account_code, account_name, category, month, amount, budget_version_id')
      .in('budget_version_id', Array.from(chosen.keys()))

    if (linesError) return noneBecause('budget_read_failed')
    if (!rows || rows.length === 0) return noneBecause('version_has_no_lines')

    // budget_lines is one row per account per month; the report wants one line
    // per account carrying a month map. A row counts only when its version is
    // the one governing its own month — that is what keeps a superseded
    // version's July out of the total once a revision takes over in October.
    //
    // Grouped on the ACCOUNT CODE, falling back to the name only for a line
    // that has none. Keyed on the name alone — which is what this used to do —
    // two distinct Xero accounts that happen to share a name (a real shape in
    // a chart of accounts that carries per-location duplicates) were merged
    // into one line and their budgets summed, and the merge was invisible in
    // the report because the row it produced looked perfectly ordinary.
    const byAccount = new Map<string, ResolvedBudgetLine>()
    for (const row of rows as Array<{
      id: string
      account_code: string | null
      account_name: string
      category: string | null
      month: string
      amount: number | string
      budget_version_id: string
    }>) {
      if (versionForMonth.get(row.month) !== row.budget_version_id) continue
      const key = budgetLineKey(row)
      let line = byAccount.get(key)
      if (!line) {
        line = {
          id: row.id,
          account_code: row.account_code ?? null,
          account_name: row.account_name,
          category: row.category,
          forecast_months: {},
        }
        byAccount.set(key, line)
      }
      line.forecast_months[row.month] = (line.forecast_months[row.month] ?? 0) + (Number(row.amount) || 0)
    }

    const lines = Array.from(byAccount.values())
    if (lines.length === 0) return noneBecause('version_has_no_lines')

    // Provenance is the version governing the ANCHOR month, so the report keeps
    // emitting a single version id. A page spanning several versions names them
    // in its own header rather than overloading this field.
    const anchor = chosen.get(versionForMonth.get(reportMonth)!)!

    return {
      source: 'budget_version',
      versionId: anchor.id,
      forecastId: null,
      label: anchor.label ?? null,
      lines,
      monthsCovered: countMonths(lines),
      noBudgetReason: null,
    }
  } catch {
    return noneBecause('budget_read_failed')
  }
}
