/**
 * Phase 44.1 Plan 44.1-01 — Pre-DDL audit for forecast_pl_lines.account_code
 *
 * Surface the two failure modes that would block the partial unique index
 * `(forecast_id, account_code) WHERE is_manual = false` planned in 44.1-02:
 *
 *   1. NULL `account_code` rows where `is_manual = false`. The new RPC's
 *      ON CONFLICT (forecast_id, account_code) clause cannot match NULLs
 *      against themselves (NULL != NULL in SQL), so any such row will cause
 *      either a constraint failure or silent duplicate inserts.
 *
 *   2. Duplicate `(forecast_id, account_code)` groups where `is_manual = false`.
 *      Pre-existing dupes prevent CREATE UNIQUE INDEX from succeeding.
 *
 * Output drives D-44.1-05:
 *   N == 0 && M == 0  → 44.1-02 ships partial unique index AS-IS.
 *   N > 0 && M == 0   → 44.1-02 prologue: backfill nulls with synthetic codes.
 *   M > 0             → ABORT 44.1-02 — duplicates need hand remediation.
 *
 * Per D-44.1-04 the script ALWAYS exits 0 — its job is to surface state, not
 * gate CI. Errors are logged to stderr; the operator still gets a clean exit
 * so the wrapping pipeline doesn't fail.
 *
 * READ-ONLY. No DELETE, UPDATE, or INSERT. Mirrors the pattern of
 * scripts/audit-multiple-active-forecasts.ts and
 * scripts/audit-xero-pl-lines-duplicates.ts.
 *
 * Usage:
 *   npx tsx scripts/audit-forecast-pl-lines-account-codes.ts
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

interface ForecastPlLineRow {
  id: string
  forecast_id: string
  account_code: string | null
  account_name: string | null
  category: string | null
  is_manual: boolean | null
  computed_at: string | null
}

async function audit() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Honor both env-var spellings used in this codebase: SUPABASE_SERVICE_ROLE_KEY
  // (per 44.1-01 plan + Next.js convention) and SUPABASE_SERVICE_KEY (used by
  // the older audit scripts in this folder). Fall through so either is fine.
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[AUDIT] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local'
    )
    // Per D-44.1-04 audit always exits 0 even on misconfiguration — the
    // missing-env signal is on stderr for the operator.
    process.exit(0)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  console.log('=== Phase 44.1 Plan 44.1-01 — forecast_pl_lines account_code audit ===')
  console.log(`Run timestamp: ${new Date().toISOString()}`)
  console.log('')

  // -------------------------------------------------------------------------
  // Query A — NULL account_code rows where is_manual = false.
  // These would break the planned UPSERT's ON CONFLICT clause (NULL != NULL).
  // -------------------------------------------------------------------------
  const { data: nullRows, error: nullErr } = await supabase
    .from('forecast_pl_lines')
    .select('id, forecast_id, account_name, category, is_manual, computed_at')
    .is('account_code', null)
    .eq('is_manual', false)

  if (nullErr) {
    console.error('[AUDIT] Query A failed:', nullErr)
  }

  const nullCount = nullRows?.length ?? 0
  console.log(`[AUDIT] null account_code (is_manual=false) rows: ${nullCount}`)
  console.table((nullRows ?? []).slice(0, 10))
  console.log('')

  // -------------------------------------------------------------------------
  // Query B — Duplicate (forecast_id, account_code) groups where is_manual=false.
  // Pre-existing dupes block CREATE UNIQUE INDEX. Group in JS — no exec_sql
  // RPC exists in this codebase, and the table is small enough (<10k rows
  // typical) that one round-trip is fine.
  // -------------------------------------------------------------------------
  const { data: allRows, error: allErr } = await supabase
    .from('forecast_pl_lines')
    .select('id, forecast_id, account_code, account_name, is_manual, computed_at')
    .eq('is_manual', false)
    .not('account_code', 'is', null)

  if (allErr) {
    console.error('[AUDIT] Query B failed:', allErr)
  }

  const groups = new Map<string, ForecastPlLineRow[]>()
  for (const r of (allRows ?? []) as ForecastPlLineRow[]) {
    const key = `${r.forecast_id}|${r.account_code}`
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }
  const dupes = [...groups.entries()].filter(([, rows]) => rows.length > 1)

  console.log(
    `[AUDIT] duplicate (forecast_id, account_code) groups (is_manual=false): ${dupes.length}`
  )
  console.table(
    dupes.slice(0, 10).map(([k, rs]) => ({
      key: k,
      count: rs.length,
      ids: rs.map((r) => r.id).join(','),
    }))
  )
  console.log('')

  // -------------------------------------------------------------------------
  // Query C — Total row counts for context.
  // -------------------------------------------------------------------------
  const { count: totalAll, error: totalAllErr } = await supabase
    .from('forecast_pl_lines')
    .select('*', { count: 'exact', head: true })
  if (totalAllErr) console.error('[AUDIT] Query C totalAll failed:', totalAllErr)

  const { count: totalManual, error: totalManualErr } = await supabase
    .from('forecast_pl_lines')
    .select('*', { count: 'exact', head: true })
    .eq('is_manual', true)
  if (totalManualErr) console.error('[AUDIT] Query C totalManual failed:', totalManualErr)

  const { count: totalNonManual, error: totalNonManualErr } = await supabase
    .from('forecast_pl_lines')
    .select('*', { count: 'exact', head: true })
    .eq('is_manual', false)
  if (totalNonManualErr)
    console.error('[AUDIT] Query C totalNonManual failed:', totalNonManualErr)

  console.log(
    `[AUDIT] forecast_pl_lines: total=${totalAll ?? 0}, is_manual=true=${totalManual ?? 0}, is_manual=false=${totalNonManual ?? 0}`
  )
  console.log('')

  // -------------------------------------------------------------------------
  // Decision recommendation block (D-44.1-05) — drives 44.1-02 prologue.
  // -------------------------------------------------------------------------
  let recommendation: string
  if (nullCount === 0 && dupes.length === 0) {
    recommendation =
      'proceed with partial unique index AS-IS in 44.1-02 (no backfill, no remediation needed)'
  } else if (nullCount > 0 && dupes.length === 0) {
    recommendation =
      "backfill nulls in 44.1-02 prologue (UPDATE forecast_pl_lines SET account_code = 'ACCT-MISSING-' || id WHERE account_code IS NULL AND is_manual = false), then ship partial unique index"
  } else {
    recommendation =
      'ABORT 44.1-02 — duplicate (forecast_id, account_code) groups must be remediated by hand BEFORE the partial unique index can be created'
  }

  console.log('[DECISION D-44.1-05]')
  console.log(`- null account_code (is_manual=false): ${nullCount}`)
  console.log(`- duplicate (forecast_id, account_code) groups: ${dupes.length}`)
  console.log('Recommendation:')
  console.log(`  if N == 0 and M == 0: proceed with partial unique index AS-IS in 44.1-02`)
  console.log(
    `  if N > 0 and M == 0: backfill nulls in 44.1-02 prologue (UPDATE forecast_pl_lines SET account_code = 'ACCT-MISSING-' || id WHERE account_code IS NULL AND is_manual = false)`
  )
  console.log(`  if M > 0: ABORT 44.1-02 — duplicates must be remediated by hand first`)
  console.log('')
  console.log(`Concrete recommendation for THIS run: ${recommendation}`)

  // D-44.1-04: audit surfaces state, never gates CI.
  process.exit(0)
}

audit().catch((e) => {
  console.error('[AUDIT] script error:', e)
  // Even on error, exit 0 — D-44.1-04.
  process.exit(0)
})
