/**
 * Phase 44.1 Plan 44.1-05 — Canary snapshot/diff utility for `forecast_pl_lines`.
 *
 * Per D-44.1-13 / D-44.1-14 / D-44.1-15: prove the structural UPSERT fix in
 * 20260429000003_save_assumptions_and_materialize_upsert.sql works on a real
 * tenant in Vercel preview BEFORE pushing main.
 *
 * Two modes (selected via `--mode=`):
 *
 *   1. `--mode=snapshot` — read all `forecast_pl_lines` rows for the chosen
 *      `--forecast-id` via Supabase service-role and dump to a JSON file under
 *      `.planning/phases/44.1-atomic-save-hardening-and-staged-rollout/`.
 *
 *   2. `--mode=diff` — re-read rows for the same `--forecast-id`, compare against
 *      the supplied `--snapshot-file=` JSON, and emit a five-test pass/fail
 *      report covering D-44.1-14 invariants:
 *
 *        T1: Manual rows count preserved.
 *        T2: No derived rows lost by id (UPSERT keeps id on conflict).
 *        T3: No derived rows had their forecast_months JSONB blanked
 *            (the 44.1-08 converter merge contract).
 *        T4: Manual rows untouched (forecast_months identical, computed_at not bumped).
 *        T5: computed_at moved forward on every derived row that survived
 *            (D-18 freshness invariant in ForecastReadService).
 *
 * Exit code is the machine-checkable signal: 0 on PASS, 1 on FAIL.
 *
 * READ-ONLY against the database. The script never INSERTs, UPDATEs, or DELETEs.
 * Snapshot files are runtime artifacts containing business data — they are
 * gitignored via `.planning/phases/44.1-.../canary-snapshot-*.json`.
 *
 * Usage:
 *   # 1) Take the BEFORE snapshot.
 *   npx tsx scripts/canary-forecast-save.ts --mode=snapshot --forecast-id=<uuid>
 *
 *   # 2) Run the wizard save end-to-end in Vercel preview (Steps 1-5).
 *
 *   # 3) Diff AFTER. Exit code 0 = PASS, 1 = FAIL.
 *   npx tsx scripts/canary-forecast-save.ts \
 *     --mode=diff \
 *     --forecast-id=<uuid> \
 *     --snapshot-file=<path printed by step 1>
 *
 * On FAIL: STOP. Do NOT push to main. Invoke PITR-RUNBOOK.md to restore.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

config({ path: path.resolve(process.cwd(), '.env.local') })

// -----------------------------------------------------------------------------
// Argv parsing — minimal `--key=value` form, no extra deps.
// -----------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const stripped = arg.replace(/^--/, '')
    const eqIdx = stripped.indexOf('=')
    if (eqIdx === -1) return [stripped, 'true']
    return [stripped.slice(0, eqIdx), stripped.slice(eqIdx + 1)]
  })
) as Record<string, string>

const mode = args.mode as 'snapshot' | 'diff' | undefined
const forecastId = args['forecast-id']

if (!mode || (mode !== 'snapshot' && mode !== 'diff') || !forecastId) {
  console.error(
    'Usage: npx tsx scripts/canary-forecast-save.ts --mode=snapshot|diff --forecast-id=<uuid> [--snapshot-file=<path>]'
  )
  console.error('')
  console.error('  --mode=snapshot   Read forecast_pl_lines and dump to JSON.')
  console.error('  --mode=diff       Compare against --snapshot-file and emit pass/fail.')
  console.error('  --forecast-id     UUID of the forecast to canary.')
  console.error('  --snapshot-file   (diff only) Path to the JSON written by snapshot mode.')
  process.exit(1)
}

const SNAPSHOT_DIR = '.planning/phases/44.1-atomic-save-hardening-and-staged-rollout'

// -----------------------------------------------------------------------------
// Supabase client — service role, no session persistence.
// -----------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[CANARY] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// -----------------------------------------------------------------------------
// Row shape — exactly what we read from forecast_pl_lines.
// -----------------------------------------------------------------------------

interface Row {
  id: string
  account_code: string | null
  account_name: string | null
  category: string | null
  is_manual: boolean
  forecast_months: Record<string, number> | null
  actual_months: Record<string, number> | null
  computed_at: string | null
  updated_at: string | null
}

interface Snapshot {
  forecast_id: string
  snapshot_taken_at: string
  rows: Row[]
}

async function loadRows(forecastIdArg: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('forecast_pl_lines')
    .select(
      'id, account_code, account_name, category, is_manual, forecast_months, actual_months, computed_at, updated_at'
    )
    .eq('forecast_id', forecastIdArg)
    .order('id', { ascending: true })
  if (error) throw new Error(`loadRows failed: ${error.message}`)
  return (data ?? []) as Row[]
}

// -----------------------------------------------------------------------------
// Snapshot mode — write the BEFORE state to a JSON file we can diff against.
// -----------------------------------------------------------------------------

async function snapshot(): Promise<void> {
  const rows = await loadRows(forecastId!)
  const takenAt = new Date().toISOString()
  const snap: Snapshot = {
    forecast_id: forecastId!,
    snapshot_taken_at: takenAt,
    rows,
  }
  const filename =
    args['snapshot-file'] ||
    path.join(
      SNAPSHOT_DIR,
      `canary-snapshot-${forecastId}-${takenAt.replace(/[:.]/g, '-')}.json`
    )
  writeFileSync(filename, JSON.stringify(snap, null, 2))

  const manualCount = rows.filter((r) => r.is_manual).length
  const derivedCount = rows.filter((r) => !r.is_manual).length
  const accountCodes = [...new Set(rows.map((r) => r.account_code ?? 'NULL'))].sort()

  console.log(`[CANARY] Snapshot saved: ${filename}`)
  console.log(`[CANARY] forecast_id: ${forecastId}`)
  console.log(`[CANARY] snapshot_taken_at: ${takenAt}`)
  console.log(`[CANARY] Rows captured: ${rows.length}`)
  console.log(`[CANARY] is_manual=true:  ${manualCount}`)
  console.log(`[CANARY] is_manual=false: ${derivedCount}`)
  console.log(
    `[CANARY] distinct account_codes (${accountCodes.length}): ${accountCodes.slice(0, 30).join(', ')}${accountCodes.length > 30 ? ', ...' : ''}`
  )
  console.log('')
  console.log('[CANARY] NEXT STEPS:')
  console.log('  1. Run wizard save end-to-end in Vercel preview (Steps 1-5).')
  console.log('  2. After save completes, diff:')
  console.log(
    `     npx tsx scripts/canary-forecast-save.ts --mode=diff --forecast-id=${forecastId} --snapshot-file=${filename}`
  )
}

// -----------------------------------------------------------------------------
// Diff mode — read AFTER state, compare against snapshot, emit T1-T5 pass/fail.
// -----------------------------------------------------------------------------

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

async function diff(): Promise<void> {
  const snapFile = args['snapshot-file']
  if (!snapFile || !existsSync(snapFile)) {
    console.error(`[CANARY] --snapshot-file path is required and must exist for --mode=diff`)
    console.error(`         received: ${snapFile ?? '(none)'}`)
    process.exit(1)
  }

  const before = JSON.parse(readFileSync(snapFile, 'utf8')) as Snapshot
  if (before.forecast_id !== forecastId) {
    console.error(
      `[CANARY] snapshot forecast_id (${before.forecast_id}) does not match --forecast-id (${forecastId}). Refusing to diff.`
    )
    process.exit(1)
  }
  const after = await loadRows(forecastId!)
  const diffTakenAt = new Date().toISOString()

  console.log(`[CANARY] Diff for forecast=${forecastId}`)
  console.log(`[CANARY] Before snapshot: ${before.snapshot_taken_at} (${before.rows.length} rows)`)
  console.log(`[CANARY] After  snapshot: ${diffTakenAt} (${after.length} rows)`)
  console.log('')

  // ---------------------------------------------------------------------------
  // Index by id for stable per-row comparison.
  // ---------------------------------------------------------------------------
  const beforeById = new Map(before.rows.map((r) => [r.id, r]))
  const afterById = new Map(after.map((r) => [r.id, r]))

  // ---------------------------------------------------------------------------
  // T1: row count by is_manual flag.
  //     Manual count MUST be exactly preserved. Derived count is allowed to grow
  //     (new accounts) but not shrink unexpectedly — T2 catches that.
  // ---------------------------------------------------------------------------
  const beforeManual = before.rows.filter((r) => r.is_manual).length
  const afterManual = after.filter((r) => r.is_manual).length
  const beforeDerived = before.rows.filter((r) => !r.is_manual).length
  const afterDerived = after.filter((r) => !r.is_manual).length
  const t1Pass = beforeManual === afterManual

  // ---------------------------------------------------------------------------
  // T2: rows lost — derived rows present BEFORE but absent AFTER by id.
  //     UPSERT on conflict (forecast_id, account_code) WHERE is_manual=false
  //     keeps the existing id, so a missing id IS a row loss.
  // ---------------------------------------------------------------------------
  const lostDerivedIds: string[] = []
  for (const [id, row] of beforeById) {
    if (!row.is_manual && !afterById.has(id)) {
      lostDerivedIds.push(id)
    }
  }
  const t2Pass = lostDerivedIds.length === 0

  // ---------------------------------------------------------------------------
  // T3: blanked forecast_months — derived rows whose forecast_months had keys
  //     before but is empty after. The 44.1-08 converter merge guarantees this
  //     cannot happen for in-range months; T3 catches regression.
  // ---------------------------------------------------------------------------
  const blanked: string[] = []
  for (const [id, beforeRow] of beforeById) {
    if (beforeRow.is_manual) continue
    const afterRow = afterById.get(id)
    if (!afterRow) continue
    const beforeKeys = Object.keys(beforeRow.forecast_months ?? {}).length
    const afterKeys = Object.keys(afterRow.forecast_months ?? {}).length
    if (beforeKeys > 0 && afterKeys === 0) blanked.push(id)
  }
  const t3Pass = blanked.length === 0

  // ---------------------------------------------------------------------------
  // T4: manual rows untouched — same id, same forecast_months, same computed_at.
  //     The partial unique index excludes is_manual=true rows, and the UPSERT
  //     body explicitly sets is_manual=false on every inserted row. Manual rows
  //     therefore should be byte-for-byte identical post-save.
  // ---------------------------------------------------------------------------
  const manualMutated: string[] = []
  for (const [id, beforeRow] of beforeById) {
    if (!beforeRow.is_manual) continue
    const afterRow = afterById.get(id)
    if (!afterRow) {
      manualMutated.push(`${id} (LOST)`)
      continue
    }
    if (!jsonEq(beforeRow.forecast_months, afterRow.forecast_months)) {
      manualMutated.push(`${id} (forecast_months changed)`)
    }
    if (beforeRow.computed_at !== afterRow.computed_at) {
      manualMutated.push(`${id} (computed_at bumped)`)
    }
  }
  const t4Pass = manualMutated.length === 0

  // ---------------------------------------------------------------------------
  // T5: computed_at moved forward on every surviving derived row. Section 5 of
  //     the new RPC body bumps computed_at = v_now even for rows the UPSERT did
  //     not touch (carry-forward). If any derived row's computed_at is unchanged
  //     or moved backward, the D-18 freshness invariant in ForecastReadService
  //     would fire on a legitimate post-save read.
  // ---------------------------------------------------------------------------
  const stale: string[] = []
  for (const [id, beforeRow] of beforeById) {
    if (beforeRow.is_manual) continue
    const afterRow = afterById.get(id)
    if (!afterRow) continue
    const beforeAt = beforeRow.computed_at ?? ''
    const afterAt = afterRow.computed_at ?? ''
    if (afterAt <= beforeAt) stale.push(id)
  }
  const t5Pass = stale.length === 0

  // ---------------------------------------------------------------------------
  // Report.
  // ---------------------------------------------------------------------------
  console.log('=== CANARY DIFF RESULT ===')
  console.log(
    `[T1] Manual rows: before=${beforeManual} after=${afterManual} ${t1Pass ? 'PASS' : 'FAIL'}`
  )
  console.log(
    `[T1] Derived rows: before=${beforeDerived} after=${afterDerived} (allowed to grow; never shrink unexpectedly)`
  )
  console.log(
    `[T2] Derived rows lost (by id): ${lostDerivedIds.length} ${t2Pass ? 'PASS' : 'FAIL'}`
  )
  if (lostDerivedIds.length) {
    console.log(`     IDs: ${lostDerivedIds.slice(0, 20).join(', ')}${lostDerivedIds.length > 20 ? ', ...' : ''}`)
  }
  console.log(
    `[T3] Derived rows with blanked forecast_months: ${blanked.length} ${t3Pass ? 'PASS' : 'FAIL'}`
  )
  if (blanked.length) {
    console.log(`     IDs: ${blanked.slice(0, 20).join(', ')}${blanked.length > 20 ? ', ...' : ''}`)
  }
  console.log(
    `[T4] Manual rows mutated: ${manualMutated.length} ${t4Pass ? 'PASS' : 'FAIL'}`
  )
  if (manualMutated.length) {
    console.log(`     ${manualMutated.slice(0, 20).join('; ')}`)
  }
  console.log(
    `[T5] Derived rows with stale computed_at: ${stale.length} ${t5Pass ? 'PASS' : 'FAIL'}`
  )
  if (stale.length) {
    console.log(`     IDs: ${stale.slice(0, 20).join(', ')}${stale.length > 20 ? ', ...' : ''}`)
  }

  const overall = t1Pass && t2Pass && t3Pass && t4Pass && t5Pass

  console.log('')
  console.log(
    `=== OVERALL: ${overall ? 'PASS — proceed to push main per D-44.1-20 step (1)' : 'FAIL — DO NOT PUSH; invoke PITR-RUNBOOK.md to restore'} ===`
  )
  process.exit(overall ? 0 : 1)
}

// -----------------------------------------------------------------------------
// Dispatch.
// -----------------------------------------------------------------------------

const run = mode === 'snapshot' ? snapshot() : diff()
run.catch((e) => {
  console.error('[CANARY] error:', e)
  process.exit(1)
})
