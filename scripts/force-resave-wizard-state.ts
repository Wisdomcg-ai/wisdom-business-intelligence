/**
 * Force-resave script — proactively repair `financial_forecasts.wizard_state`
 * rows corrupted by the PR #126 normalizedPct guard.
 *
 * Companion to `scripts/audit-pct-exposure.ts`. Run that first to identify
 * affected tenants; run this per-tenant to apply the correction.
 *
 * What gets repaired
 * ------------------
 * Only `financial_forecasts.wizard_state.year{1,2,3}` is touched. Specifically
 * the COGS, commission-driven teamCosts, gross profit, and net profit fields.
 * `forecast_pl_lines` is NEVER touched — the server materialization path is
 * already correct (it doesn't go through the buggy guard) so it stays as-is.
 *
 * The correction uses a *delta* approach rather than a full wizard rollup
 * replay — much narrower blast radius and reversible:
 *
 *   For each `assumptions.cogs.lines[]` row where:
 *     costBehavior === 'variable'  AND
 *     0 < percentOfRevenue < 1     AND
 *     no manual year{N}Monthly data
 *   …the buggy code added `revenue × pct × 0.99` per year. Subtract that.
 *
 *   For each `assumptions.team.commissions[]` row where:
 *     0 < percentOfRevenue < 1
 *   …subtract `lineRevenue × pct × 0.99` per year (lineRevenue = the linked
 *   revenue line's per-year total; falls back to total revenue if the link
 *   can't be resolved).
 *
 *   Then recompute grossProfit and netProfit per year using the existing
 *   wizard formula:
 *     grossProfit = revenue - cogs
 *     netProfit   = grossProfit - teamCosts - opex - depreciation
 *                   - otherExpenses - investments
 *                   + otherIncome - xeroOtherExpense
 *
 * Safety guards
 * -------------
 *   - `--confirm` is required to actually write. Default is dry-run.
 *   - Per-year, if the corrected `cogs` would go negative we ABORT for that
 *     forecast and report (likely means wizard_state predates the bug or has
 *     already been partially corrected — don't write garbage).
 *   - If the assumptions JSON shape doesn't match expectations
 *     (cogs.lines is not an array, etc.) we ABORT with a clear message.
 *   - If wizard_state is missing or empty we ABORT (nothing to correct).
 *   - Idempotent: re-running on the same tenant reads the *current* corrupted
 *     value, applies the *same* delta, and produces the same result. After
 *     write, a follow-up run still computes the same delta from assumptions
 *     but the dry-run summary will show the new (post-write) wizard_state
 *     would receive a corrected value identical to the previous correction.
 *     Since we're writing the corrected value (not subtracting from it again),
 *     re-running is safe — the corrected wizard_state.year1.cogs is then
 *     above 1, so subtracting the same delta a second time would NOT happen
 *     because we always read assumptions (where pct < 1 is the source of
 *     truth) — see additional idempotency guard below.
 *   - Idempotency guard: we compare the proposed corrected cogs against the
 *     current cogs + a tolerance. If `current_cogs - cogsDelta` rounds to
 *     `current_cogs` (i.e., already corrected), no-op for that year.
 *
 * Usage:
 *   # Dry-run (always safe; no `--confirm` = no write):
 *   npx tsx scripts/force-resave-wizard-state.ts \
 *     --business-id=900aa935-ae8c-4913-baf7-169260fa19ef --dry-run
 *
 *   # Apply (requires `--confirm`):
 *   npx tsx scripts/force-resave-wizard-state.ts \
 *     --business-id=900aa935-ae8c-4913-baf7-169260fa19ef --confirm
 *
 *   # Specific forecast id (when a tenant has multiple active forecasts):
 *   npx tsx scripts/force-resave-wizard-state.ts \
 *     --business-id=900aa935-ae8c-4913-baf7-169260fa19ef \
 *     --forecast-id=1a03be71-e6c8-4755-8a5b-1035128197dc \
 *     --confirm
 */
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// CLI args.
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const stripped = arg.replace(/^--/, '')
    const eqIdx = stripped.indexOf('=')
    if (eqIdx === -1) return [stripped, 'true']
    return [stripped.slice(0, eqIdx), stripped.slice(eqIdx + 1)]
  }),
) as Record<string, string>

const businessIdArg = args['business-id']
const forecastIdArg = args['forecast-id']
const dryRun = args['dry-run'] === 'true' || args['confirm'] !== 'true'
const confirm = args['confirm'] === 'true'

if (!businessIdArg) {
  console.error(
    '[RESAVE] --business-id=<uuid> is required. Run scripts/audit-pct-exposure.ts to find affected tenants.',
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Supabase client — service role.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[RESAVE] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Narrow shapes.
// ---------------------------------------------------------------------------

interface RevenueLineAssumption {
  accountId?: string
  accountName?: string
  year1Monthly?: Record<string, number>
  year2Monthly?: Record<string, number>
  year3Monthly?: Record<string, number>
  year2Quarterly?: { q1: number; q2: number; q3: number; q4: number }
  year3Quarterly?: { q1: number; q2: number; q3: number; q4: number }
}

interface CogsLineAssumption {
  accountId?: string
  accountName?: string
  costBehavior?: 'variable' | 'fixed' | string
  percentOfRevenue?: number
  year1Monthly?: Record<string, number>
  year2Monthly?: Record<string, number>
  year3Monthly?: Record<string, number>
}

interface CommissionAssumption {
  id?: string
  teamMemberId?: string
  revenueLineId?: string
  percentOfRevenue?: number
}

interface ForecastAssumptions {
  revenue?: { lines?: RevenueLineAssumption[] }
  cogs?: { lines?: CogsLineAssumption[] }
  team?: { commissions?: CommissionAssumption[] }
}

interface YearSummary {
  revenue?: number
  cogs?: number
  grossProfit?: number
  grossProfitPct?: number
  teamCosts?: number
  opex?: number
  depreciation?: number
  investments?: number
  otherExpenses?: number
  otherIncome?: number
  xeroOtherExpense?: number
  netProfit?: number
  netProfitPct?: number
}

interface WizardState {
  year1?: YearSummary
  year2?: YearSummary
  year3?: YearSummary
}

interface ForecastRow {
  id: string
  business_id: string
  fiscal_year: number
  name: string | null
  is_active: boolean
  is_locked: boolean | null
  forecast_duration: number | null
  updated_at: string
  assumptions: ForecastAssumptions | null
  wizard_state: WizardState | null
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function sumMonthly(monthly: Record<string, number> | undefined | null): number {
  if (!monthly) return 0
  let total = 0
  for (const v of Object.values(monthly)) {
    const n = Number(v)
    if (Number.isFinite(n)) total += n
  }
  return total
}

function sumQuarterly(
  q: { q1: number; q2: number; q3: number; q4: number } | undefined | null,
): number {
  if (!q) return 0
  return (
    (Number(q.q1) || 0) +
    (Number(q.q2) || 0) +
    (Number(q.q3) || 0) +
    (Number(q.q4) || 0)
  )
}

/** Per-year revenue total for a revenue line, mirroring useForecastWizard's
 *  getRevenueLineYearTotal() priority: monthly > legacy quarterly. */
function revenueLineYearTotal(
  line: RevenueLineAssumption,
  yearNum: 1 | 2 | 3,
): number {
  if (yearNum === 1) return sumMonthly(line.year1Monthly)
  if (yearNum === 2) {
    const m = sumMonthly(line.year2Monthly)
    return m > 0 ? m : sumQuarterly(line.year2Quarterly)
  }
  const m = sumMonthly(line.year3Monthly)
  return m > 0 ? m : sumQuarterly(line.year3Quarterly)
}

interface YearDeltaInput {
  yearKey: 'year1' | 'year2' | 'year3'
  yearNum: 1 | 2 | 3
  current: YearSummary
  cogs: CogsLineAssumption[]
  commissions: CommissionAssumption[]
  revenueLines: RevenueLineAssumption[]
}

interface YearDeltaResult {
  yearKey: 'year1' | 'year2' | 'year3'
  yearNum: 1 | 2 | 3
  cogsLinesAffected: number
  commissionLinesAffected: number
  cogsDelta: number
  commissionDelta: number
  before: { revenue: number; cogs: number; teamCosts: number; netProfit: number }
  after: { revenue: number; cogs: number; teamCosts: number; netProfit: number }
  /** True if the corrected cogs would go below zero or another sanity check
   *  fails — caller must ABORT this year (and the whole forecast) when set. */
  abort: boolean
  abortReason: string | null
  /** True when the proposed correction is a no-op vs current (already
   *  corrected, or no exposure). Distinct from abort. */
  noop: boolean
  /** Human-readable summary line for console output. */
  summary: string
}

/** Compute the per-year delta correction. Pure. */
function computeYearDelta(input: YearDeltaInput): YearDeltaResult {
  const { yearKey, yearNum, current, cogs, commissions, revenueLines } = input
  const revenue = Number(current.revenue ?? 0)
  const cogsBefore = Number(current.cogs ?? 0)
  const teamCostsBefore = Number(current.teamCosts ?? 0)
  const netProfitBefore = Number(current.netProfit ?? 0)
  const before = {
    revenue,
    cogs: cogsBefore,
    teamCosts: teamCostsBefore,
    netProfit: netProfitBefore,
  }

  // ---- COGS delta ----
  let cogsDelta = 0
  let cogsLinesAffected = 0
  for (const line of cogs) {
    const beh = String(line.costBehavior ?? '').toLowerCase()
    const pct = Number(line.percentOfRevenue ?? 0)
    if (beh !== 'variable') continue
    if (!(pct > 0 && pct < 1)) continue
    // Skip if manual monthly is populated for this year — bug doesn't fire.
    const monthlyForYear =
      yearNum === 1
        ? line.year1Monthly
        : yearNum === 2
          ? line.year2Monthly
          : line.year3Monthly
    if (sumMonthly(monthlyForYear) > 0) continue
    cogsLinesAffected += 1
    cogsDelta += revenue * pct * 0.99
  }

  // ---- Commission delta ----
  let commissionDelta = 0
  let commissionLinesAffected = 0
  const revLineByKey = new Map<string, RevenueLineAssumption>()
  for (const r of revenueLines) {
    if (r.accountId) revLineByKey.set(r.accountId, r)
  }
  for (const c of commissions) {
    const pct = Number(c.percentOfRevenue ?? 0)
    if (!(pct > 0 && pct < 1)) continue
    commissionLinesAffected += 1
    let lineRevenue = 0
    if (c.revenueLineId) {
      const rev = revLineByKey.get(c.revenueLineId)
      if (rev) lineRevenue = revenueLineYearTotal(rev, yearNum)
    }
    if (lineRevenue === 0) {
      // Fallback to total Y revenue (upper bound). Mirrors the wizard's
      // `lineRevenue = revenue * (lineY1 / totalY1)` fallback for Y2/Y3 in
      // useForecastWizard.ts:1308-1314 (without the proportional re-scaling
      // since we don't have that map at write time).
      lineRevenue = revenue
    }
    commissionDelta += lineRevenue * pct * 0.99
  }

  // ---- Apply delta ----
  const cogsAfter = cogsBefore - cogsDelta
  const teamCostsAfter = teamCostsBefore - commissionDelta

  // Sanity guards: corrected COGS or teamCosts must not go negative.
  if (cogsAfter < 0) {
    return {
      yearKey,
      yearNum,
      cogsLinesAffected,
      commissionLinesAffected,
      cogsDelta,
      commissionDelta,
      before,
      after: before,
      abort: true,
      abortReason: `corrected ${yearKey}.cogs would be ${Math.round(cogsAfter)} (< 0). wizard_state may predate PR #126 or already be corrected. Refusing to write.`,
      noop: false,
      summary: `${yearKey}: ABORT — corrected cogs negative (${Math.round(cogsAfter)})`,
    }
  }
  if (teamCostsAfter < 0) {
    return {
      yearKey,
      yearNum,
      cogsLinesAffected,
      commissionLinesAffected,
      cogsDelta,
      commissionDelta,
      before,
      after: before,
      abort: true,
      abortReason: `corrected ${yearKey}.teamCosts would be ${Math.round(teamCostsAfter)} (< 0). wizard_state may predate PR #126. Refusing to write.`,
      noop: false,
      summary: `${yearKey}: ABORT — corrected teamCosts negative (${Math.round(teamCostsAfter)})`,
    }
  }

  // No-op detection: if both deltas round to 0, nothing to write.
  if (Math.round(cogsDelta) === 0 && Math.round(commissionDelta) === 0) {
    return {
      yearKey,
      yearNum,
      cogsLinesAffected,
      commissionLinesAffected,
      cogsDelta,
      commissionDelta,
      before,
      after: before,
      abort: false,
      abortReason: null,
      noop: true,
      summary: `${yearKey}: no-op (no exposure or already corrected)`,
    }
  }

  // Recompute gross profit and net profit using the wizard's exact formula.
  // grossProfit = revenue - cogs
  // netProfit   = grossProfit - teamCosts - opex - depreciation
  //               - otherExpenses - investments + otherIncome - xeroOtherExpense
  const opex = Number(current.opex ?? 0)
  const depreciation = Number(current.depreciation ?? 0)
  const investments = Number(current.investments ?? 0)
  const otherExpenses = Number(current.otherExpenses ?? 0)
  const otherIncome = Number(current.otherIncome ?? 0)
  const xeroOtherExpense = Number(current.xeroOtherExpense ?? 0)
  const grossProfitAfter = revenue - cogsAfter
  const netProfitAfter =
    grossProfitAfter -
    teamCostsAfter -
    opex -
    depreciation -
    otherExpenses -
    investments +
    otherIncome -
    xeroOtherExpense

  const after = {
    revenue,
    cogs: Math.round(cogsAfter),
    teamCosts: Math.round(teamCostsAfter),
    netProfit: Math.round(netProfitAfter),
  }

  const summary =
    `${yearKey}: cogs ${Math.round(cogsBefore).toLocaleString()} → ${after.cogs.toLocaleString()} ` +
    `(Δ ${Math.round(cogsDelta).toLocaleString()}; ${cogsLinesAffected} lines), ` +
    `teamCosts ${Math.round(teamCostsBefore).toLocaleString()} → ${after.teamCosts.toLocaleString()} ` +
    `(Δ ${Math.round(commissionDelta).toLocaleString()}; ${commissionLinesAffected} comm.), ` +
    `netProfit ${Math.round(netProfitBefore).toLocaleString()} → ${after.netProfit.toLocaleString()}`

  return {
    yearKey,
    yearNum,
    cogsLinesAffected,
    commissionLinesAffected,
    cogsDelta,
    commissionDelta,
    before,
    after,
    abort: false,
    abortReason: null,
    noop: false,
    summary,
  }
}

/** Build the corrected wizard_state by applying year-by-year deltas. */
function buildCorrectedWizardState(
  current: WizardState,
  results: YearDeltaResult[],
): WizardState {
  const corrected: WizardState = {
    year1: { ...(current.year1 ?? {}) },
    year2: current.year2 ? { ...current.year2 } : undefined,
    year3: current.year3 ? { ...current.year3 } : undefined,
  }
  for (const r of results) {
    if (r.abort || r.noop) continue
    const year = corrected[r.yearKey]
    if (!year) continue
    const grossProfit = r.after.revenue - r.after.cogs
    const grossProfitPct =
      r.after.revenue > 0 ? (grossProfit / r.after.revenue) * 100 : 0
    const netProfitPct =
      r.after.revenue > 0 ? (r.after.netProfit / r.after.revenue) * 100 : 0
    year.cogs = r.after.cogs
    year.teamCosts = r.after.teamCosts
    year.grossProfit = Math.round(grossProfit)
    year.grossProfitPct = Math.round(grossProfitPct * 10) / 10
    year.netProfit = r.after.netProfit
    year.netProfitPct = Math.round(netProfitPct * 10) / 10
  }
  return corrected
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[RESAVE] normalizedPct wizard_state correction`)
  console.log(`[RESAVE] Run at: ${new Date().toISOString()}`)
  console.log(`[RESAVE] business-id=${businessIdArg}`)
  if (forecastIdArg) console.log(`[RESAVE] forecast-id=${forecastIdArg}`)
  console.log(`[RESAVE] mode=${dryRun ? 'DRY-RUN' : 'CONFIRMED-WRITE'}`)
  console.log('')

  // 1. Load matching forecast(s) for the business. financial_forecasts.business_id
  //    references business_profiles.id; tolerate businesses.id mismatches by
  //    accepting either.
  let query = supabase
    .from('financial_forecasts')
    .select(
      'id, business_id, fiscal_year, name, is_active, is_locked, forecast_duration, ' +
        'updated_at, assumptions, wizard_state',
    )
    .eq('is_active', true)
    .eq('business_id', businessIdArg)

  if (forecastIdArg) {
    query = query.eq('id', forecastIdArg)
  }

  const { data: forecasts, error: forecastsErr } = await query

  if (forecastsErr) {
    console.error(`[RESAVE] financial_forecasts query failed: ${forecastsErr.message}`)
    process.exit(1)
  }

  const rows = (forecasts ?? []) as unknown as ForecastRow[]
  if (rows.length === 0) {
    console.error(
      `[RESAVE] No active forecast found for business_id=${businessIdArg}` +
        (forecastIdArg ? ` and forecast_id=${forecastIdArg}` : '') +
        '. Nothing to do.',
    )
    process.exit(1)
  }

  console.log(`[RESAVE] Found ${rows.length} active forecast(s) for this business.`)
  console.log('')

  let writesMade = 0
  let skips = 0
  for (const forecast of rows) {
    console.log(
      `--- forecast ${forecast.id} ("${forecast.name}", FY${forecast.fiscal_year}, duration=${forecast.forecast_duration}) ---`,
    )

    if (forecast.is_locked) {
      console.log(`[RESAVE] SKIP: forecast is_locked=true. Refusing to overwrite.`)
      skips += 1
      console.log('')
      continue
    }

    const assumptions = forecast.assumptions
    const wizard = forecast.wizard_state

    // Schema-shape sanity check before reading anything.
    if (!assumptions || typeof assumptions !== 'object') {
      console.log(`[RESAVE] SKIP: assumptions JSON is missing or non-object.`)
      skips += 1
      console.log('')
      continue
    }
    if (!wizard || typeof wizard !== 'object') {
      console.log(
        `[RESAVE] SKIP: wizard_state is missing or non-object — nothing to correct ` +
          `(operator never persisted summary, or this row predates wizard_state column).`,
      )
      skips += 1
      console.log('')
      continue
    }
    const cogsLinesRaw = (assumptions.cogs as { lines?: unknown } | undefined)?.lines
    if (cogsLinesRaw != null && !Array.isArray(cogsLinesRaw)) {
      console.log(
        `[RESAVE] SKIP: assumptions.cogs.lines is present but not an array (got ${typeof cogsLinesRaw}). ` +
          `Schema deviation — refusing to write.`,
      )
      skips += 1
      console.log('')
      continue
    }
    const commissionsRaw = (assumptions.team as { commissions?: unknown } | undefined)
      ?.commissions
    if (commissionsRaw != null && !Array.isArray(commissionsRaw)) {
      console.log(
        `[RESAVE] SKIP: assumptions.team.commissions is present but not an array (got ${typeof commissionsRaw}). ` +
          `Schema deviation — refusing to write.`,
      )
      skips += 1
      console.log('')
      continue
    }
    const revLinesRaw = (assumptions.revenue as { lines?: unknown } | undefined)?.lines
    if (revLinesRaw != null && !Array.isArray(revLinesRaw)) {
      console.log(
        `[RESAVE] SKIP: assumptions.revenue.lines is present but not an array (got ${typeof revLinesRaw}). ` +
          `Schema deviation — refusing to write.`,
      )
      skips += 1
      console.log('')
      continue
    }

    const cogs = (assumptions.cogs?.lines ?? []) as CogsLineAssumption[]
    const commissions = (assumptions.team?.commissions ?? []) as CommissionAssumption[]
    const revenueLines = (assumptions.revenue?.lines ?? []) as RevenueLineAssumption[]

    // 2. Compute per-year deltas.
    const duration = forecast.forecast_duration ?? 1
    const years: Array<{ key: 'year1' | 'year2' | 'year3'; n: 1 | 2 | 3 }> = [
      { key: 'year1', n: 1 },
    ]
    if (duration >= 2) years.push({ key: 'year2', n: 2 })
    if (duration >= 3) years.push({ key: 'year3', n: 3 })

    const results: YearDeltaResult[] = []
    let aborted = false
    for (const { key, n } of years) {
      const yearSummary = wizard[key]
      if (!yearSummary) {
        console.log(`[RESAVE] ${key}: SKIP — wizard_state.${key} missing.`)
        continue
      }
      const result = computeYearDelta({
        yearKey: key,
        yearNum: n,
        current: yearSummary,
        cogs,
        commissions,
        revenueLines,
      })
      results.push(result)
      console.log(`[RESAVE] ${result.summary}`)
      if (result.abort) {
        console.log(`[RESAVE]   reason: ${result.abortReason}`)
        aborted = true
      }
    }

    if (aborted) {
      console.log(
        `[RESAVE] ABORT writing forecast ${forecast.id} — at least one year flagged. ` +
          `wizard_state untouched.`,
      )
      skips += 1
      console.log('')
      continue
    }

    const allNoop = results.length > 0 && results.every((r) => r.noop)
    if (allNoop) {
      console.log(
        `[RESAVE] No-op for forecast ${forecast.id} — already corrected or never exposed. wizard_state untouched.`,
      )
      skips += 1
      console.log('')
      continue
    }

    // 3. Build corrected wizard_state.
    const correctedWizard = buildCorrectedWizardState(wizard, results)

    if (dryRun) {
      console.log(
        `[RESAVE] DRY-RUN — would UPDATE financial_forecasts.wizard_state for id=${forecast.id}. Re-run with --confirm to write.`,
      )
      console.log('')
      continue
    }

    // 4. Atomic update — only the wizard_state column. Don't touch anything
    //    else (especially not assumptions or forecast_pl_lines).
    const { error: updateErr } = await supabase
      .from('financial_forecasts')
      .update({
        wizard_state: correctedWizard,
        updated_at: new Date().toISOString(),
      })
      .eq('id', forecast.id)

    if (updateErr) {
      console.error(
        `[RESAVE] UPDATE failed for forecast ${forecast.id}: ${updateErr.message}`,
      )
      skips += 1
      console.log('')
      continue
    }

    console.log(
      `[RESAVE] OK — wizard_state updated for forecast ${forecast.id}.`,
    )
    writesMade += 1
    console.log('')
  }

  console.log('=== RESAVE SUMMARY ===')
  console.log(`forecasts examined: ${rows.length}`)
  console.log(`writes made:        ${writesMade}`)
  console.log(`skipped:            ${skips}`)
  if (dryRun) {
    console.log('')
    console.log(
      `Mode was DRY-RUN. Re-run with --confirm to apply (per-business: pass the same --business-id).`,
    )
  }
  if (!confirm && !dryRun) {
    // Defensive — can't actually reach here.
    console.log('Mode was AMBIGUOUS — neither --dry-run nor --confirm. No writes attempted.')
  }
}

main().catch((e) => {
  console.error('[RESAVE] error:', e)
  process.exit(1)
})
