#!/usr/bin/env node
/**
 * Phase 70 Plan 02 — A1: Active-forecast remediation (cross-client dedupe).
 *
 * Resolves Phase 67's unique-active-forecast enforcement gap across ALL
 * production businesses. Phase 67 added a unique partial index, but
 * pre-existing duplicates were never resolved. The Phase 70 audit confirmed
 * at least Envisage (2 active) and JDS (2 active) still violate the invariant;
 * other clients were not sampled.
 *
 * SCOPE
 *   - All production businesses (status='active' on `businesses` table; key
 *     resolved via business_profiles.business_id → businesses.id since
 *     financial_forecasts.business_id stores business_profiles.id per the
 *     locked dual-ID convention in 70-CONTEXT.md).
 *   - Groups duplicate active forecasts by (business_id, fiscal_year,
 *     year_type, forecast_type). This is strictly safer than the Phase 67
 *     partial index, which keys (business_id, fiscal_year, forecast_type)
 *     only — by also segmenting on year_type we will NEVER accidentally
 *     deactivate a legitimately-distinct CY-vs-FY pair at the same fiscal
 *     year number. NOTE the plan's <interfaces> comment said the constraint
 *     was on year_type; in reality the unique index is on forecast_type
 *     (see supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql).
 *     Grouping by the union of both keys is the correct, conservative choice
 *     and is captured here as a Rule 1 (bug) auto-fix.
 *
 * CANONICAL SELECTION (locked, 70-CONTEXT.md decisions A1)
 *   1. Most recently updated_at
 *   2. Tie → most forecast_pl_lines rows
 *   3. Tie → has any forecast_payroll_summary row at all (presence=1)
 *   4. Tie → most recently created_at
 *   5. Final tiebreaker → lowest id alphabetically (deterministic fallback)
 *
 * MUTATION
 *   - On --apply: set is_active=false, updated_at=NOW() per loser, one at
 *     a time, each wrapped in try/catch. NEVER deletes. NEVER touches winner.
 *     NEVER touches any other column. Loud failure on partial completion.
 *
 * IDEMPOTENCY
 *   - Re-running with no flags on already-clean data: "Groups with conflicts: 0".
 *   - Re-running --apply on already-clean data: 0 mutations attempted.
 *
 * Run:
 *   node scripts/70-02-A1-active-forecast-remediation.mjs            # dry-run
 *   node scripts/70-02-A1-active-forecast-remediation.mjs --apply    # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY was disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
}

const APPLY = process.argv.includes('--apply');

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiHeadCount(table, filter) {
  // Use PostgREST head=true + count=exact via Prefer header to get a row count
  // without pulling rows. Returns the integer count parsed from Content-Range.
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`HEAD ${table}?${filter} → ${res.status} ${await res.text()}`);
  const cr = res.headers.get('content-range') || '';
  // Format: "0-9/123" or "*/0"
  const m = cr.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function apiPatch(table, filter, body) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}?${filter} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Logging helpers ─────────────────────────────────────────────────────────
const C = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

console.log('='.repeat(72));
console.log(C.bold('Phase 70 Plan 02 — A1 Active-Forecast Remediation'));
console.log('='.repeat(72));
if (APPLY) {
  console.log(C.red(C.bold('APPLY MODE — writes will commit to production Supabase')));
} else {
  console.log(C.yellow(C.bold('DRY RUN — preview only, no writes')));
}
console.log(`URL: ${URL}`);
console.log(`Started: ${new Date().toISOString()}`);
console.log('');

// ── (1) Fetch all active forecasts across all businesses ───────────────────
console.log(C.dim('── Fetching active forecasts (cross-client) ───────────────'));
const activeForecasts = await apiGet(
  'financial_forecasts?is_active=eq.true&select=id,business_id,name,fiscal_year,year_type,forecast_type,version_number,updated_at,created_at',
);
console.log(`  active forecasts total: ${activeForecasts.length}`);

// ── (2) Resolve the "active business" allowlist ────────────────────────────
// financial_forecasts.business_id is keyed by business_profiles.id (dual-ID
// drift, locked in 70-CONTEXT.md). To honour "skip non-active production
// businesses" we need to walk business_profiles.id → business_profiles.business_id
// → businesses.id and check businesses.status='active'.
console.log(C.dim('── Resolving business status (business_profiles → businesses) ──'));
const profiles = await apiGet(
  'business_profiles?select=id,business_id',
);
const profileToBiz = new Map(profiles.map((p) => [p.id, p.business_id]));

const allBusinesses = await apiGet('businesses?select=id,status,name');
const bizStatusById = new Map(allBusinesses.map((b) => [b.id, { status: b.status, name: b.name }]));

// Helper: business_profiles.id → { status, name } via 2-hop resolve
const profileStatus = (profileId) => {
  const bizId = profileToBiz.get(profileId);
  if (!bizId) return { status: 'unknown', name: '(unknown business)', bizId: null };
  const meta = bizStatusById.get(bizId);
  if (!meta) return { status: 'unknown', name: '(unknown business)', bizId };
  return { status: meta.status, name: meta.name, bizId };
};

// ── (3) Group by composite key — see header comment for why year_type+forecast_type ──
const groups = new Map();
for (const f of activeForecasts) {
  const key = `${f.business_id}::FY${f.fiscal_year}::${f.year_type}::${f.forecast_type}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}

const conflictGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
console.log(`  groups (any size): ${groups.size}`);
console.log(`  groups with > 1 active: ${conflictGroups.length}`);
console.log('');

if (conflictGroups.length === 0) {
  console.log(C.green('Groups with conflicts: 0'));
  console.log(C.green('Losers identified: 0'));
  console.log(C.green('✓ Nothing to do — data already satisfies the unique-active invariant.'));
  console.log('');
  console.log(`Finished: ${new Date().toISOString()}`);
  process.exit(0);
}

// ── (4) For each conflict group, enrich + select canonical winner ──────────
console.log(C.dim('── Enriching conflict groups (pl_lines + payroll_summary) ──'));
console.log('');

const allLosers = []; // collected for the --apply pass
const skippedGroups = []; // non-active parent businesses

for (const [key, rows] of conflictGroups) {
  // Resolve the parent business
  const sample = rows[0];
  const { status, name, bizId } = profileStatus(sample.business_id);

  if (status !== 'active') {
    skippedGroups.push({ key, status, name, bizId, count: rows.length });
    console.log(C.yellow(`═══════════════════════════════════════════════════════════════════`));
    console.log(C.yellow(`SKIP (parent business not active)  business_profile_id=${sample.business_id}`));
    console.log(C.yellow(`  business="${name}"  businesses.id=${bizId ?? '—'}  status=${status}`));
    console.log(C.yellow(`  group: FY${sample.fiscal_year} year_type=${sample.year_type} forecast_type=${sample.forecast_type}  (${rows.length} active rows untouched)`));
    continue;
  }

  // Enrich each row with pl_line_count + payroll_summary_present (0/1)
  const enriched = [];
  for (const r of rows) {
    const plCount = await apiHeadCount('forecast_pl_lines', `forecast_id=eq.${r.id}`);
    const payrollPresent = await apiHeadCount('forecast_payroll_summary', `forecast_id=eq.${r.id}`);
    enriched.push({
      ...r,
      pl_line_count: plCount,
      // Treat "row exists at all" as 1 — most production rows are missing
      // entirely (audit confirmed). A row present with all-zero jsonb still
      // beats no row at all because at least the schema slot was populated.
      payroll_summary_present: payrollPresent > 0 ? 1 : 0,
    });
  }

  // Sort: winner = first
  //   updated_at DESC
  //   pl_line_count DESC
  //   payroll_summary_present DESC
  //   created_at DESC
  //   id ASC (deterministic final tiebreaker; flagged WARN if used)
  enriched.sort((a, b) => {
    const ua = Date.parse(a.updated_at || 0);
    const ub = Date.parse(b.updated_at || 0);
    if (ua !== ub) return ub - ua;
    if (a.pl_line_count !== b.pl_line_count) return b.pl_line_count - a.pl_line_count;
    if (a.payroll_summary_present !== b.payroll_summary_present) return b.payroll_summary_present - a.payroll_summary_present;
    const ca = Date.parse(a.created_at || 0);
    const cb = Date.parse(b.created_at || 0);
    if (ca !== cb) return cb - ca;
    // Deterministic final fallback — see edge case in plan task 1 step 7
    return String(a.id).localeCompare(String(b.id));
  });

  const winner = enriched[0];
  const losers = enriched.slice(1);

  // Compute winner reason vs the BEST loser (the second-place row)
  const challenger = losers[0];
  let reason = 'sole highest updated_at';
  if (Date.parse(winner.updated_at) === Date.parse(challenger.updated_at)) {
    if (winner.pl_line_count !== challenger.pl_line_count) {
      reason = `tie on updated_at; more pl_lines (${winner.pl_line_count} vs ${challenger.pl_line_count})`;
    } else if (winner.payroll_summary_present !== challenger.payroll_summary_present) {
      reason = `tie on updated_at + pl_lines; has payroll_summary row`;
    } else if (Date.parse(winner.created_at) !== Date.parse(challenger.created_at)) {
      reason = `tie on updated_at + pl_lines + payroll; latest created_at`;
    } else {
      reason = C.yellow(`WARN — all primary tiebreakers tied; deterministic fallback (lowest id)`);
    }
  } else {
    reason = `latest updated_at (${winner.updated_at} > ${challenger.updated_at})`;
  }

  // Detect "all rows empty" edge case (plan task 1 step 7 paragraph 2)
  const allEmpty = enriched.every((r) => r.pl_line_count === 0 && r.payroll_summary_present === 0);

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(C.bold(`business_profile_id=${winner.business_id}  business="${name}"`));
  console.log(`  group: FY${winner.fiscal_year} year_type=${winner.year_type} forecast_type=${winner.forecast_type}  (${enriched.length} active rows)`);
  if (allEmpty) {
    console.log(C.yellow(`  NOTE — all rows have pl_lines=0 + no payroll_summary; keeping most-recently-updated as winner per CONTEXT A1 paragraph 4`));
  }
  console.log(C.green(`  ✓ WINNER  id=${winner.id}  name="${winner.name}"  v${winner.version_number}`));
  console.log(`             updated=${winner.updated_at}  pl_lines=${winner.pl_line_count}  payroll=${winner.payroll_summary_present}  created=${winner.created_at}`);
  console.log(`             reason="${reason}"`);
  for (const l of losers) {
    console.log(C.red(`  ✗ LOSER   id=${l.id}  name="${l.name}"  v${l.version_number}`));
    console.log(`             updated=${l.updated_at}  pl_lines=${l.pl_line_count}  payroll=${l.payroll_summary_present}  created=${l.created_at}`);
    console.log(`             → will set is_active=false`);
    allLosers.push({
      id: l.id,
      business_id: l.business_id,
      business_name: name,
      group_label: `FY${l.fiscal_year} ${l.year_type} ${l.forecast_type}`,
      forecast_name: l.name,
    });
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(C.bold('Summary'));
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Groups with conflicts: ${conflictGroups.length - skippedGroups.length} (excluding ${skippedGroups.length} skipped non-active parent)`);
console.log(`Losers identified: ${allLosers.length}`);
if (skippedGroups.length > 0) {
  console.log(C.yellow(`Skipped (parent business not active): ${skippedGroups.length} groups`));
  for (const s of skippedGroups) {
    console.log(C.yellow(`  - "${s.name}" (status=${s.status})  ${s.count} active rows untouched`));
  }
}

// ── (5) Apply or exit ──────────────────────────────────────────────────────
if (!APPLY) {
  console.log('');
  console.log(C.yellow('DRY RUN — re-run with --apply to deactivate the losers.'));
  console.log(`Finished: ${new Date().toISOString()}`);
  process.exit(0);
}

if (allLosers.length === 0) {
  console.log('');
  console.log(C.green('✓ No losers to deactivate (idempotent — already clean).'));
  console.log(`Finished: ${new Date().toISOString()}`);
  process.exit(0);
}

console.log('');
console.log(C.red(C.bold(`APPLYING — deactivating ${allLosers.length} losers one at a time...`)));
console.log('');

let succeeded = 0;
const failures = [];
for (const l of allLosers) {
  try {
    await apiPatch(
      'financial_forecasts',
      `id=eq.${l.id}`,
      { is_active: false, updated_at: new Date().toISOString() },
    );
    console.log(C.green(`  ✓ deactivated ${l.id}  (${l.business_name} / ${l.group_label} / "${l.forecast_name}")`));
    succeeded++;
  } catch (err) {
    console.log(C.red(`  ✗ FAILED ${l.id}: ${err.message}`));
    failures.push({ id: l.id, error: err.message });
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(C.bold('Apply Results'));
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Losers identified: ${allLosers.length}`);
console.log(`Losers deactivated: ${succeeded}`);
console.log(`Failures: ${failures.length}`);
console.log('');
console.log(`Finished: ${new Date().toISOString()}`);

if (succeeded !== allLosers.length) {
  console.error(C.red(C.bold(`✗ MISMATCH: ${succeeded} deactivated vs ${allLosers.length} identified. Failures:`)));
  for (const f of failures) console.error(C.red(`  - ${f.id}: ${f.error}`));
  process.exit(1);
}

console.log(C.green(C.bold(`✓ All ${succeeded} losers deactivated cleanly. Re-run without --apply to verify "Groups with conflicts: 0".`)));
