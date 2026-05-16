/**
 * Phase 66 Plan 66-01 — legacy section-permission key drift audit.
 *
 * Background:
 *   The `business_users` and `team_invites` baseline DEFAULT JSONB uses the
 *   legacy key `"financials"` (confirmed at baseline_schema.sql lines 1929 +
 *   5206). The Phase 65 helper `requireSectionPermission` reads the canonical
 *   key `"finances"`. Any production row carrying only `"financials"` will
 *   have `section_permissions['finances']` read as `undefined` → defaults to
 *   allow → a member with an explicit legacy deny slips through once
 *   `SECTION_PERMISSION_ENFORCE=true` is flipped (Phase 65 Wave 65-04).
 *
 *   This script is the binding prerequisite for 66-01 — it tells the operator
 *   exactly how many rows need the backfill migration, and provides sample
 *   rows for spot-checking.
 *
 * This script is OPERATOR-RUN (Matt against production). It makes ZERO writes.
 * Run it via tsx — no build step required.
 *
 * Usage:
 *   npx tsx scripts/audit-section-permissions-legacy-key.ts [--business-id=<uuid>] [--dry-run]
 *
 * Options:
 *   --business-id=<uuid>   Scope all queries to a single business (for single-tenant triage).
 *   --dry-run              No-op flag — the script is read-only regardless; present for
 *                          consistency with the operator tooling convention.
 *   --help / -h            Print this usage and exit 0.
 *
 * Exit codes:
 *   0 — all rows have the canonical 'finances' key (no migration needed)
 *   1 — one or more rows are missing the 'finances' key (migration required)
 *   2 — connection / query error
 *
 * Output:
 *   stdout — human-readable per-table summary + up to 20 sample rows per table
 *   stderr — single line of structured JSON for log aggregation:
 *            { business_users_affected, team_invites_affected, conflicting_rows, sampled }
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ── CLI arg parsing ─────────────────────────────────────────────────────────

interface CliArgs {
  businessId?: string
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const out: CliArgs = { dryRun: false }
  for (const a of argv) {
    if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a === '--dry-run') out.dryRun = true
  }
  return out
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/audit-section-permissions-legacy-key.ts [--business-id=<uuid>] [--dry-run]

Options:
  --business-id=<uuid>   Scope all queries to a single business (for single-tenant triage).
  --dry-run              No-op flag — the script is read-only regardless.
  --help / -h            Print this usage and exit 0.

Exit codes:
  0 — all rows already have the canonical 'finances' key (no migration needed)
  1 — one or more rows are missing the 'finances' key (migration required)
  2 — connection / query error

Output:
  stdout — human-readable per-table summary + up to 20 sample rows per table
  stderr — single line of structured JSON for log aggregation
`)
}

// ── Row types ───────────────────────────────────────────────────────────────

interface BusinessUserRow {
  id: string
  business_id: string
  user_id: string | null
  role: string
  status: string
  section_permissions: Record<string, unknown> | null
}

interface TeamInviteRow {
  id: string
  business_id: string | null
  role: string
  status: string | null
  section_permissions: Record<string, unknown> | null
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))
  if ('help' in parsed) {
    printHelp()
    process.exit(0)
  }
  const { businessId, dryRun } = parsed

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[audit] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    return 2
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[audit] Phase 66-01 — section_permissions legacy-key drift audit')
  if (dryRun) console.log('[audit] --dry-run flag set (informational; script is read-only regardless)')
  if (businessId) console.log(`[audit] Scoped to business_id=${businessId}`)
  console.log('')

  // ── Query 1 (PRIMARY): business_users missing the canonical 'finances' key ─

  let buAll: BusinessUserRow[] = []
  try {
    let q = supabase
      .from('business_users')
      .select('id, business_id, user_id, role, status, section_permissions')
    if (businessId) q = q.eq('business_id', businessId)
    const { data, error } = await q
    if (error) throw error
    buAll = (data ?? []) as BusinessUserRow[]
  } catch (err) {
    console.error('[audit] Failed to query business_users:', err)
    return 2
  }

  // Filter in TypeScript (simplest and unambiguous — avoids JSONB ? operator escaping)
  const buAffected = buAll.filter((row) => !('finances' in (row.section_permissions ?? {})))
  const buConflicting = buAll.filter((row) => {
    const sp = row.section_permissions ?? {}
    return (
      'financials' in sp &&
      'finances' in sp &&
      sp['financials'] !== sp['finances']
    )
  })

  // ── Query 2 (PRIMARY): team_invites missing the canonical 'finances' key ────

  let tiAll: TeamInviteRow[] = []
  try {
    let q = supabase
      .from('team_invites')
      .select('id, business_id, role, status, section_permissions')
    if (businessId) q = q.eq('business_id', businessId)
    const { data, error } = await q
    if (error) throw error
    tiAll = (data ?? []) as TeamInviteRow[]
  } catch (err) {
    console.error('[audit] Failed to query team_invites:', err)
    return 2
  }

  const tiAffected = tiAll.filter((row) => !('finances' in (row.section_permissions ?? {})))

  // ── Format helper ────────────────────────────────────────────────────────

  const MAX_SAMPLE = 20

  function formatBusinessUserRow(row: BusinessUserRow): string {
    const sp = row.section_permissions ?? {}
    const financialsVal = 'financials' in sp ? sp['financials'] : undefined
    const financesVal = 'finances' in sp ? sp['finances'] : undefined
    return [
      `  id=${row.id}`,
      `  business_id=${row.business_id}`,
      `  user_id=${row.user_id ?? 'null'}`,
      `  role=${row.role} status=${row.status}`,
      `  financials_value=${JSON.stringify(financialsVal)} finances_value=${JSON.stringify(financesVal)}`,
      `  section_permissions=${JSON.stringify(sp)}`,
    ].join('\n')
  }

  function formatTeamInviteRow(row: TeamInviteRow): string {
    const sp = row.section_permissions ?? {}
    const financialsVal = 'financials' in sp ? sp['financials'] : undefined
    const financesVal = 'finances' in sp ? sp['finances'] : undefined
    return [
      `  id=${row.id}`,
      `  business_id=${row.business_id ?? 'null'}`,
      `  role=${row.role} status=${row.status ?? 'null'}`,
      `  financials_value=${JSON.stringify(financialsVal)} finances_value=${JSON.stringify(financesVal)}`,
      `  section_permissions=${JSON.stringify(sp)}`,
    ].join('\n')
  }

  // ── Print human-readable summary ─────────────────────────────────────────

  console.log(`GATE: business_users — rows missing canonical 'finances' key`)
  console.log(`  Total rows scanned : ${buAll.length}`)
  console.log(`  Affected (missing) : ${buAffected.length}`)
  console.log(`  Conflicting rows   : ${buConflicting.length} (have both keys with different values — migration skips these)`)

  if (buAffected.length === 0) {
    console.log(`  PASS — no rows need backfilling in business_users`)
  } else {
    console.log(`  FAIL — migration required for ${buAffected.length} business_users row(s)`)
    const sample = buAffected.slice(0, MAX_SAMPLE)
    console.log(`  Sample (up to ${MAX_SAMPLE}):`)
    for (const row of sample) {
      console.log(formatBusinessUserRow(row))
      console.log('')
    }
    if (buAffected.length > MAX_SAMPLE) {
      console.log(`  ... and ${buAffected.length - MAX_SAMPLE} more rows not shown`)
    }
  }

  if (buConflicting.length > 0) {
    console.log(`\n  WARNING: ${buConflicting.length} business_users row(s) have CONFLICTING values for 'financials' and 'finances'.`)
    console.log(`  These rows already have the 'finances' key so the migration will NOT touch them.`)
    console.log(`  Operator should review these rows manually:`)
    const sample = buConflicting.slice(0, 5)
    for (const row of sample) {
      console.log(formatBusinessUserRow(row))
      console.log('')
    }
  }

  console.log('')
  console.log(`GATE: team_invites — rows missing canonical 'finances' key`)
  console.log(`  Total rows scanned : ${tiAll.length}`)
  console.log(`  Affected (missing) : ${tiAffected.length}`)

  if (tiAffected.length === 0) {
    console.log(`  PASS — no rows need backfilling in team_invites`)
  } else {
    console.log(`  FAIL — migration required for ${tiAffected.length} team_invites row(s)`)
    const sample = tiAffected.slice(0, MAX_SAMPLE)
    console.log(`  Sample (up to ${MAX_SAMPLE}):`)
    for (const row of sample) {
      console.log(formatTeamInviteRow(row))
      console.log('')
    }
    if (tiAffected.length > MAX_SAMPLE) {
      console.log(`  ... and ${tiAffected.length - MAX_SAMPLE} more rows not shown`)
    }
  }

  // ── Structured JSON to stderr ────────────────────────────────────────────

  const structured = {
    business_users_affected: buAffected.length,
    team_invites_affected: tiAffected.length,
    conflicting_rows: buConflicting.length,
    sampled: Math.min(buAffected.length, MAX_SAMPLE) + Math.min(tiAffected.length, MAX_SAMPLE),
  }
  console.error(JSON.stringify(structured))

  // ── Exit code ────────────────────────────────────────────────────────────

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const totalAffected = buAffected.length + tiAffected.length
  if (totalAffected === 0) {
    console.log(`PASS — all rows already carry the canonical 'finances' key. No migration needed.`)
    return 0
  } else {
    console.log(
      `FAIL — ${buAffected.length} business_users + ${tiAffected.length} team_invites rows are missing the 'finances' key.`
    )
    console.log(`Run supabase/migrations/20260516000000_phase66_backfill_finances_section_key.sql to fix.`)
    return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[audit] Unhandled error:', err)
    process.exit(2)
  })
