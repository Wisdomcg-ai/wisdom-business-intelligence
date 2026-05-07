/**
 * Audit script — find tenants with sub-1% COGS or commission percentages
 * that were corrupted by the PR #126 (commit 917d3267) `normalizedPct` guard.
 *
 * Background
 * ----------
 * PR #126 ("fix(56-p1a): calculation safety fixes") added this guard at two
 * sites in `useForecastWizard.ts`:
 *
 *     const rawPct = line.percentOfRevenue || 0
 *     const normalizedPct = rawPct > 1 ? rawPct : rawPct * 100   // <-- bug
 *     const adjustedPct = normalizedPct + trendAdj
 *     return sum + (revenue * adjustedPct) / 100
 *
 * Intent: handle legacy/import paths that stored percentOfRevenue as a 0-1
 * decimal (0.30 instead of 30). Reality: legitimate sub-1% values (e.g., a
 * COGS line that's 0.5% of revenue, or a commission of 0.05%) are inflated
 * 100×. JDS confirmed affected — 28 of 29 variable COGS lines have
 * percentOfRevenue < 1, wizard_state.year1.cogs corrupted to ~$76.15M
 * (correct value ~$6.65M).
 *
 * PR #134 reverts the guard. Once merged, NEW saves produce correct rollups.
 * But existing wizard_state rows on prod stay corrupted until the operator
 * triggers a resave naturally. This script measures the blast radius.
 *
 * What it does
 * ------------
 * For every active forecast (financial_forecasts.is_active = true):
 *   1. Read `assumptions` JSON.
 *   2. Walk `assumptions.cogs.lines[]`, count rows where:
 *        costBehavior === 'variable' AND
 *        percentOfRevenue > 0 AND
 *        percentOfRevenue < 1
 *   3. Walk `assumptions.team.commissions[]`, count rows where:
 *        percentOfRevenue > 0 AND
 *        percentOfRevenue < 1
 *   4. Compute the delta in dollars between the corrupted and corrected Y1
 *      COGS + commissions impact, using:
 *        - Y1 revenue from `wizard_state.year1.revenue` (which is NOT corrupted —
 *          revenue rollup never went through the buggy guard)
 *        - For each affected COGS line: corruption added
 *            revenue × pct × (99/100)
 *          (buggy contribution = revenue × pct, correct = revenue × pct / 100)
 *        - Same for commissions, but using each commission's linked revenue
 *          line Y1 total instead of total revenue.
 *   5. Output a markdown table to stdout AND to disk.
 *
 * READ-ONLY against the database. No INSERTs, UPDATEs, DELETEs. Mirrors the
 * env-var conventions of `scripts/snapshot-forecast-baseline.ts` and the
 * table-shape conventions of `scripts/audit-multiple-active-forecasts.ts`.
 *
 * Schema notes (from src/app/finances/forecast/components/wizard-v4/types/assumptions.ts)
 * ---------------------------------------------------------------------------
 *   COGSLineAssumption.costBehavior : 'variable' | 'fixed'   (NOT `behavior`)
 *   COGSLineAssumption.percentOfRevenue : number             (canonical 0-100)
 *   PlannedCommission.percentOfRevenue : number              (canonical 0-100)
 *   PlannedCommission.revenueLineId    : string              (FK to revenue line)
 *   ForecastAssumptions.team.commissions : PlannedCommission[]
 *   RevenueLineAssumption.year1Monthly : Record<'YYYY-MM', number>
 *
 * Usage:
 *   # Default — write the audit output to the Phase 57 dir.
 *   npx tsx scripts/audit-pct-exposure.ts
 *
 *   # Custom output path.
 *   npx tsx scripts/audit-pct-exposure.ts \
 *     --output=.planning/phases/57-subscriptions-flow-restructure/normalizedPct-exposure-audit.md
 *
 *   # Dry-run mode (default; nothing destructive ever happens — flag is purely
 *   # for symmetry with the resave script).
 *   npx tsx scripts/audit-pct-exposure.ts --dry-run
 */
import { config } from 'dotenv'
import path from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'

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

const DEFAULT_OUTPUT = path.join(
  '.planning/phases/57-subscriptions-flow-restructure',
  'normalizedPct-exposure-audit.md',
)
const outputPath = args.output ?? DEFAULT_OUTPUT

// ---------------------------------------------------------------------------
// Supabase client — service role.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[AUDIT] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Narrow shapes for the columns / JSON paths we read.
// ---------------------------------------------------------------------------

interface RevenueLineAssumption {
  accountId?: string
  accountName?: string
  year1Monthly?: Record<string, number>
}

interface CogsLineAssumption {
  accountId?: string
  accountName?: string
  costBehavior?: 'variable' | 'fixed' | string
  percentOfRevenue?: number
  year1Monthly?: Record<string, number>
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
  teamCosts?: number
  netProfit?: number
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
  updated_at: string
  assumptions: ForecastAssumptions | null
  wizard_state: WizardState | null
}

interface BusinessProfileRow {
  id: string
  business_name: string | null
}

// ---------------------------------------------------------------------------
// Severity tiers (per task spec).
// ---------------------------------------------------------------------------

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

function classifySeverity(absDelta: number): Severity {
  if (absDelta <= 0) return 'NONE'
  if (absDelta > 1_000_000) return 'CRITICAL'
  if (absDelta > 100_000) return 'HIGH'
  if (absDelta > 10_000) return 'MEDIUM'
  return 'LOW'
}

// ---------------------------------------------------------------------------
// Per-tenant audit row.
// ---------------------------------------------------------------------------

interface AuditRow {
  tenantName: string
  businessId: string
  forecastId: string
  forecastName: string | null
  fiscalYear: number
  cogsSubOnePctCount: number
  commissionSubOnePctCount: number
  wizardY1Cogs: number | null
  wizardY1Revenue: number | null
  correctedY1Cogs: number | null
  cogsDelta: number
  commissionDelta: number
  totalDelta: number
  severity: Severity
  notes: string[]
}

// ---------------------------------------------------------------------------
// Core audit logic.
// ---------------------------------------------------------------------------

/**
 * Sum a `Record<'YYYY-MM', number>` defensively.
 * Returns 0 for null/undefined/empty.
 */
function sumMonthly(monthly: Record<string, number> | undefined | null): number {
  if (!monthly) return 0
  let total = 0
  for (const v of Object.values(monthly)) {
    const n = Number(v)
    if (Number.isFinite(n)) total += n
  }
  return total
}

/**
 * For one forecast row, inspect assumptions and wizard_state and return an
 * AuditRow. Pure: no I/O. Tolerant of missing/legacy shapes.
 */
function auditForecast(
  forecast: ForecastRow,
  tenantName: string,
): AuditRow {
  const notes: string[] = []
  const assumptions = forecast.assumptions ?? {}
  const wizard = forecast.wizard_state ?? {}
  const y1 = wizard.year1 ?? {}

  // ---- COGS ----
  const cogsLines = assumptions.cogs?.lines ?? []
  let cogsSubOnePctCount = 0
  let cogsDelta = 0
  // The corrupted contribution per affected variable line is:
  //     revenue * pct                  (buggy)
  // The correct contribution is:
  //     revenue * pct / 100
  // So delta added by the bug = revenue * pct * (1 - 1/100) = revenue * pct * 0.99
  // We use Y1 revenue from wizard_state.year1.revenue, which is NOT corrupted.
  const wizardY1Revenue = Number(y1.revenue ?? 0)
  for (const line of cogsLines) {
    const beh = String(line.costBehavior ?? '').toLowerCase()
    const pct = Number(line.percentOfRevenue ?? 0)
    if (beh !== 'variable') continue
    if (!(pct > 0 && pct < 1)) continue
    // Skip if the line has manual year1Monthly data — wizard rollup uses the
    // monthly path in that case and the pct guard never fires.
    const manualSum = sumMonthly(line.year1Monthly)
    if (manualSum > 0) {
      notes.push(
        `COGS "${line.accountName ?? line.accountId ?? '(unnamed)'}" has pct=${pct} but year1Monthly is populated — pct path is bypassed. Excluded from delta.`,
      )
      continue
    }
    cogsSubOnePctCount += 1
    if (wizardY1Revenue > 0) {
      // delta = revenue * pct * 0.99
      cogsDelta += wizardY1Revenue * pct * 0.99
    }
  }

  // ---- Commissions ----
  // Commission delta uses each commission's linked revenue line Y1 total, not
  // total revenue. If we can't resolve the line revenue, fall back to total
  // wizard Y1 revenue and flag the assumption.
  const commissions = assumptions.team?.commissions ?? []
  const revLines = assumptions.revenue?.lines ?? []
  // Build accountId/id-keyed lookup; revenue line's `accountId` is what
  // commissions reference via `revenueLineId` (per useForecastWizard.ts:1304).
  const revLineByKey = new Map<string, RevenueLineAssumption>()
  for (const r of revLines) {
    if (r.accountId) revLineByKey.set(r.accountId, r)
  }
  let commissionSubOnePctCount = 0
  let commissionDelta = 0
  for (const c of commissions) {
    const pct = Number(c.percentOfRevenue ?? 0)
    if (!(pct > 0 && pct < 1)) continue
    commissionSubOnePctCount += 1
    let lineRevenue = 0
    if (c.revenueLineId) {
      const rev = revLineByKey.get(c.revenueLineId)
      if (rev) {
        lineRevenue = sumMonthly(rev.year1Monthly)
      }
    }
    if (lineRevenue === 0) {
      // Fallback: if we can't resolve the linked revenue line, use total Y1
      // revenue. This OVER-estimates commission delta but signals the
      // exposure. Flag in notes.
      lineRevenue = wizardY1Revenue
      notes.push(
        `Commission ${c.id ?? c.teamMemberId ?? '(no id)'} pct=${pct}: revenueLineId=${c.revenueLineId ?? '(none)'} not resolvable in assumptions.revenue.lines — used total Y1 revenue as upper bound.`,
      )
    }
    if (lineRevenue > 0) {
      commissionDelta += lineRevenue * pct * 0.99
    }
  }

  // Corrected Y1 COGS = current corrupted - cogsDelta. (Commission delta lives
  // in teamCosts, not COGS.)
  const wizardY1Cogs = y1.cogs == null ? null : Number(y1.cogs)
  const correctedY1Cogs =
    wizardY1Cogs == null ? null : wizardY1Cogs - cogsDelta

  // Total absolute dollar delta across COGS + commissions (this is what shows
  // up as overstatement in net profit reduction).
  const totalDelta = cogsDelta + commissionDelta

  if (wizardY1Revenue <= 0) {
    notes.push(
      'wizard_state.year1.revenue is missing or zero — delta computations are 0 by definition. Forecast may pre-date wizard_state persistence (operator never re-saved).',
    )
  }
  if (!wizard.year1) {
    notes.push('wizard_state.year1 missing entirely.')
  }
  if (cogsSubOnePctCount === 0 && commissionSubOnePctCount === 0) {
    notes.push('No sub-1% percentage lines — not exposed.')
  }

  return {
    tenantName,
    businessId: forecast.business_id,
    forecastId: forecast.id,
    forecastName: forecast.name,
    fiscalYear: forecast.fiscal_year,
    cogsSubOnePctCount,
    commissionSubOnePctCount,
    wizardY1Cogs,
    wizardY1Revenue: wizardY1Revenue || null,
    correctedY1Cogs,
    cogsDelta: Math.round(cogsDelta),
    commissionDelta: Math.round(commissionDelta),
    totalDelta: Math.round(totalDelta),
    severity: classifySeverity(Math.abs(totalDelta)),
    notes,
  }
}

// ---------------------------------------------------------------------------
// Output formatting.
// ---------------------------------------------------------------------------

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString('en-US')}`
}

function buildMarkdown(rows: AuditRow[], capturedAt: string): string {
  const exposed = rows.filter(
    (r) => r.cogsSubOnePctCount > 0 || r.commissionSubOnePctCount > 0,
  )
  const totalAbsDelta = exposed.reduce(
    (sum, r) => sum + Math.abs(r.totalDelta),
    0,
  )
  const tierCounts: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NONE: 0,
  }
  for (const r of exposed) tierCounts[r.severity] += 1

  const lines: string[] = []
  lines.push('# normalizedPct exposure audit')
  lines.push('')
  lines.push(`**Captured:** ${capturedAt}`)
  lines.push('')
  lines.push('## Background')
  lines.push('')
  lines.push(
    'PR #126 (commit `917d3267`) added a `pct > 1 ? pct : pct * 100` normalization guard at two sites in the wizard rollup (`useForecastWizard.ts`):',
  )
  lines.push('')
  lines.push('- COGS variable lines (~lines 1430–1442)')
  lines.push('- Commissions (~lines 1555–1570)')
  lines.push('')
  lines.push(
    'The guard inflates legitimate sub-1% percentages 100×. PR #134 reverts the guard. Existing `financial_forecasts.wizard_state` rows on prod remain corrupted until the operator triggers a resave naturally. This audit measures the blast radius.',
  )
  lines.push('')
  lines.push('## Method')
  lines.push('')
  lines.push(
    'For every `financial_forecasts` row with `is_active=true`, walk `assumptions.cogs.lines[]` and `assumptions.team.commissions[]` looking for `percentOfRevenue` values strictly between 0 and 1.',
  )
  lines.push('')
  lines.push(
    'For affected COGS lines, the bug added `revenue × pct × 0.99` to Y1 cogs (buggy contribution `revenue × pct`, correct contribution `revenue × pct / 100`). Y1 revenue is read from `wizard_state.year1.revenue` (not corrupted by the bug).',
  )
  lines.push('')
  lines.push(
    'For commissions, the same delta is computed against the linked revenue line\'s Y1 total (or total Y1 revenue as upper bound when the linked line is unresolvable). The commission delta lives in `teamCosts`, not COGS.',
  )
  lines.push('')
  lines.push('## Severity tiers')
  lines.push('')
  lines.push('Severity is keyed off `|cogsDelta| + |commissionDelta|`:')
  lines.push('')
  lines.push('- **CRITICAL** — total delta > $1,000,000')
  lines.push('- **HIGH** — total delta $100,000 – $1,000,000')
  lines.push('- **MEDIUM** — total delta $10,000 – $100,000')
  lines.push('- **LOW** — total delta < $10,000')
  lines.push('- **NONE** — no sub-1% lines (not exposed)')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Active forecasts scanned: **${rows.length}**`)
  lines.push(`- Forecasts with sub-1% percentage lines: **${exposed.length}**`)
  lines.push(`- Total absolute Y1 delta across exposed tenants: **${fmtMoney(totalAbsDelta)}**`)
  lines.push('- Severity breakdown:')
  lines.push(`  - CRITICAL: ${tierCounts.CRITICAL}`)
  lines.push(`  - HIGH: ${tierCounts.HIGH}`)
  lines.push(`  - MEDIUM: ${tierCounts.MEDIUM}`)
  lines.push(`  - LOW: ${tierCounts.LOW}`)
  lines.push('')

  if (exposed.length > 0) {
    lines.push('## Exposed tenants')
    lines.push('')
    lines.push(
      '| Tenant | business_id | forecast_id | sub-1% COGS | sub-1% Comm. | wizard Y1 cogs | corrected Y1 cogs | Δ COGS | Δ Comm. | Total Δ | Severity |',
    )
    lines.push(
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    )
    const sorted = [...exposed].sort(
      (a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta),
    )
    for (const r of sorted) {
      lines.push(
        `| ${r.tenantName} | \`${r.businessId}\` | \`${r.forecastId}\` | ${r.cogsSubOnePctCount} | ${r.commissionSubOnePctCount} | ${fmtMoney(r.wizardY1Cogs)} | ${fmtMoney(r.correctedY1Cogs)} | ${fmtMoney(r.cogsDelta)} | ${fmtMoney(r.commissionDelta)} | ${fmtMoney(r.totalDelta)} | ${r.severity} |`,
      )
    }
    lines.push('')
  }

  // Notes / per-tenant caveats.
  const tenantsWithNotes = exposed.filter((r) => r.notes.length > 0)
  if (tenantsWithNotes.length > 0) {
    lines.push('## Per-tenant notes')
    lines.push('')
    for (const r of tenantsWithNotes) {
      lines.push(`### ${r.tenantName} (\`${r.businessId}\`)`)
      lines.push('')
      for (const note of r.notes) lines.push(`- ${note}`)
      lines.push('')
    }
  }

  // All-rows table (including unexposed) for completeness.
  lines.push('## All scanned forecasts')
  lines.push('')
  lines.push('| Tenant | forecast_id | sub-1% COGS | sub-1% Comm. | Severity |')
  lines.push('| --- | --- | ---: | ---: | --- |')
  const sortedAll = [...rows].sort((a, b) =>
    a.tenantName.localeCompare(b.tenantName),
  )
  for (const r of sortedAll) {
    lines.push(
      `| ${r.tenantName} | \`${r.forecastId}\` | ${r.cogsSubOnePctCount} | ${r.commissionSubOnePctCount} | ${r.severity} |`,
    )
  }
  lines.push('')

  lines.push('## Next steps')
  lines.push('')
  lines.push(
    '- Run `scripts/force-resave-wizard-state.ts --business-id=<uuid> --dry-run` per CRITICAL/HIGH tenant to preview the correction.',
  )
  lines.push(
    '- Re-run with `--confirm` after reviewing the dry-run output. Idempotent — re-running on the same tenant is safe.',
  )
  lines.push(
    '- LOW severity tenants can be left to natural resave (no operator action required).',
  )
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Console summary (compact, mirrors what we're writing to disk).
// ---------------------------------------------------------------------------

function printConsoleSummary(rows: AuditRow[]): void {
  const exposed = rows.filter(
    (r) => r.cogsSubOnePctCount > 0 || r.commissionSubOnePctCount > 0,
  )
  const totalAbsDelta = exposed.reduce(
    (sum, r) => sum + Math.abs(r.totalDelta),
    0,
  )
  console.log('')
  console.log('=== AUDIT SUMMARY ===')
  console.log(`Active forecasts scanned: ${rows.length}`)
  console.log(`Exposed (sub-1% pct lines): ${exposed.length}`)
  console.log(`Total absolute Y1 delta: ${fmtMoney(totalAbsDelta)}`)
  console.log('')
  if (exposed.length > 0) {
    const sorted = [...exposed].sort(
      (a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta),
    )
    console.log(
      'Tenant                         | sub-1% COGS | sub-1% Comm | Total Δ          | Severity',
    )
    console.log(
      '-------------------------------+-------------+-------------+------------------+---------',
    )
    for (const r of sorted) {
      const name = r.tenantName.padEnd(30).slice(0, 30)
      console.log(
        `${name} | ${String(r.cogsSubOnePctCount).padStart(11)} | ${String(r.commissionSubOnePctCount).padStart(11)} | ${fmtMoney(r.totalDelta).padStart(16)} | ${r.severity}`,
      )
    }
    console.log('')
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const capturedAt = new Date().toISOString()
  console.log(`[AUDIT] normalizedPct exposure audit`)
  console.log(`[AUDIT] Run at: ${capturedAt}`)
  console.log('')

  // 1. Load all active forecasts.
  const { data: forecastsData, error: forecastsErr } = await supabase
    .from('financial_forecasts')
    .select('id, business_id, fiscal_year, name, is_active, updated_at, assumptions, wizard_state')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (forecastsErr) {
    console.error(`[AUDIT] financial_forecasts query failed: ${forecastsErr.message}`)
    process.exit(1)
  }

  const forecasts = (forecastsData ?? []) as ForecastRow[]
  console.log(`[AUDIT] Loaded ${forecasts.length} active forecast(s).`)

  if (forecasts.length === 0) {
    console.log('[AUDIT] Nothing to audit — exiting.')
    return
  }

  // 2. Resolve tenant names. financial_forecasts.business_id is *expected*
  //    to reference business_profiles.id (per src/app/api/forecast-wizard-v4/generate/route.ts:89),
  //    but legacy / test rows may use businesses.id instead — see project memory
  //    `project_dual_id`. Fall back to the businesses table for any IDs that
  //    don't resolve via business_profiles.
  const allIds = [...new Set(forecasts.map((f) => f.business_id))]
  const { data: profilesData, error: profilesErr } = await supabase
    .from('business_profiles')
    .select('id, business_name')
    .in('id', allIds)

  if (profilesErr) {
    console.error(
      `[AUDIT] business_profiles query failed: ${profilesErr.message} — proceeding with IDs as names`,
    )
  }
  const profileNameById = new Map<string, string>()
  for (const p of (profilesData ?? []) as BusinessProfileRow[]) {
    profileNameById.set(p.id, p.business_name ?? p.id)
  }

  // Fall-through: any id not in business_profiles → try businesses.
  const unresolved = allIds.filter((id) => !profileNameById.has(id))
  if (unresolved.length > 0) {
    const { data: bizData, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name')
      .in('id', unresolved)
    if (bizErr) {
      console.error(
        `[AUDIT] businesses fallback query failed: ${bizErr.message} — orphan IDs will display as (unknown:...)`,
      )
    }
    for (const b of (bizData ?? []) as Array<{ id: string; name: string | null }>) {
      profileNameById.set(b.id, b.name ?? b.id)
    }
  }

  // 3. Run audit per forecast.
  const rows: AuditRow[] = forecasts.map((f) =>
    auditForecast(f, profileNameById.get(f.business_id) ?? `(unknown:${f.business_id})`),
  )

  // 4. Console summary.
  printConsoleSummary(rows)

  // 5. Write markdown to disk.
  const outDir = path.dirname(outputPath)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const md = buildMarkdown(rows, capturedAt)
  writeFileSync(outputPath, md)
  console.log(`[AUDIT] Wrote markdown report: ${outputPath}`)
}

main().catch((e) => {
  console.error('[AUDIT] error:', e)
  process.exit(1)
})
