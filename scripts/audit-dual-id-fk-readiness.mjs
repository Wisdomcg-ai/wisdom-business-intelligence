#!/usr/bin/env node
/**
 * Phase 75-01 (R-6) — FK-readiness audit. READ-ONLY by default.
 *
 * Proves whether the FK-Integrity Phase B targets (FK-INTEGRITY-PLAN.md) are
 * ready to receive a foreign key. An FK → business_profiles(id) REJECTS any row
 * keyed by businesses.id or user_id, so for every FK-target column we count:
 *   - wrong_key       : value is a businesses.id (or otherwise not a profile id) on a profile-keyed table
 *   - orphan          : value matches neither businesses nor business_profiles (dangling)
 *   - uncastable      : value is not a syntactically valid UUID (blocks the text→uuid cast)
 *   - null_profile_id : dual-column table row whose uuid business_profile_id is NULL (the FK column)
 *
 * GREEN gate for 75-02 = every FK-target column has wrong_key = orphan = uncastable = null_profile_id = 0.
 *
 * No writes. Pure Supabase REST reads via the prod service key in .env.local.
 * Run: node scripts/audit-dual-id-fk-readiness.mjs
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE URL / KEY in .env.local'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FK-target columns from FK-INTEGRITY-PLAN.md Phase B.
const PROFILE_TEXT = ['activity_log', 'plan_snapshots', 'sprint_key_actions', 'kpi_history']; // text business_id → cast → business_profiles(id)
const PROFILE_DUAL = ['business_financial_goals', 'business_kpis'];                            // text business_id + uuid business_profile_id (FK goes on the uuid col)
const GROUP_B = ['issues_list', 'open_loops', 'strategy_data', 'cashflow_assumptions'];        // uuid business_id → businesses(id), NULLs allowed

async function loadIdSet(table, col) {
  const s = new Set();
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(table).select(col).range(f, f + 999);
    if (error) throw new Error(`${table}.${col}: ${error.message}`);
    for (const r of data) if (r[col]) s.add(r[col]);
    if (data.length < 1000) break;
  }
  return s;
}

async function scan(table, cols) {
  // cols: array of column names to pull. Returns all rows' selected columns.
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(table).select(cols.join(',')).range(f, f + 999);
    if (error) return { error: error.message };
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows };
}

function pad(s, n) { return String(s).padEnd(n); }

async function main() {
  console.log('Loading canonical id sets (business_profiles.id, businesses.id)…');
  const profIds = await loadIdSet('business_profiles', 'id');
  const bizIds = await loadIdSet('businesses', 'id');
  console.log(`  business_profiles: ${profIds.size}   businesses: ${bizIds.size}\n`);

  const results = [];

  // Profile-keyed text columns → business_profiles(id)
  for (const t of PROFILE_TEXT) {
    const r = await scan(t, ['business_id']);
    if (r.error) { results.push({ t, fk: 'profiles', error: r.error }); continue; }
    let total = 0, wrong = 0, orphan = 0, uncastable = 0; const samples = [];
    for (const row of r.rows) {
      const v = row.business_id; if (v == null) continue; total++;
      if (!UUID_RE.test(String(v))) { uncastable++; if (samples.length < 3) samples.push(`uncastable:${v}`); continue; }
      if (profIds.has(v)) continue;            // good
      if (bizIds.has(v)) { wrong++; if (samples.length < 3) samples.push(`biz:${v}`); }
      else { orphan++; if (samples.length < 3) samples.push(`orphan:${v}`); }
    }
    results.push({ t, fk: 'profiles', total, wrong, orphan, uncastable, null_pid: 0, samples });
  }

  // Dual-column tables → FK on uuid business_profile_id
  for (const t of PROFILE_DUAL) {
    const r = await scan(t, ['business_id', 'business_profile_id']);
    if (r.error) { results.push({ t, fk: 'profiles(pid col)', error: r.error }); continue; }
    let total = 0, wrong = 0, orphan = 0, nullPid = 0; const samples = [];
    // Also classify the legacy text business_id (the column the app actually writes)
    // so we know whether a backfill business_profile_id := resolve(business_id) is clean.
    let legProf = 0, legBiz = 0, legOrphan = 0, legUncast = 0, legNull = 0;
    for (const row of r.rows) {
      total++;
      const pid = row.business_profile_id;
      if (pid == null) { nullPid++; if (samples.length < 3) samples.push(`null_pid(legacy_bid:${row.business_id})`); }
      else if (profIds.has(pid)) { /* good */ }
      else if (bizIds.has(pid)) { wrong++; if (samples.length < 3) samples.push(`pid_is_biz:${pid}`); }
      else { orphan++; if (samples.length < 3) samples.push(`pid_orphan:${pid}`); }

      const lb = row.business_id;
      if (lb == null) legNull++;
      else if (!UUID_RE.test(String(lb))) legUncast++;
      else if (profIds.has(lb)) legProf++;
      else if (bizIds.has(lb)) legBiz++;
      else legOrphan++;
    }
    console.log(`  [${t}] FK target = business_id (cast); business_profile_id is dead (${nullPid}/${total} NULL) → DROP. ` +
      `business_id: profile=${legProf} biz=${legBiz} orphan=${legOrphan} uncastable=${legUncast} null=${legNull}`);
    // Corrected design (75-01 finding): the FK goes on the live business_id column (cast text→uuid),
    // NOT the dead business_profile_id. So the verdict is driven by business_id cleanliness; null_pid is
    // informational only (that column is being dropped in 75-02).
    results.push({ t, fk: 'profiles(business_id)', total, wrong: legBiz, orphan: legOrphan, uncastable: legUncast, null_pid: 0, samples: samples.slice(0, 0) });
  }

  // Group B → businesses(id), NULLs allowed
  for (const t of GROUP_B) {
    const r = await scan(t, ['business_id']);
    if (r.error) { results.push({ t, fk: 'businesses', error: r.error }); continue; }
    let total = 0, orphan = 0; const samples = [];
    for (const row of r.rows) {
      const v = row.business_id; if (v == null) continue; total++;
      if (bizIds.has(v)) continue;             // good (NULLs already skipped)
      orphan++; if (samples.length < 3) samples.push(`orphan:${v}`);
    }
    results.push({ t, fk: 'businesses', total, orphan, wrong: 0, uncastable: 0, null_pid: 0, samples });
  }

  // Report
  console.log(`${pad('TABLE', 26)} ${pad('FK→', 18)} ${pad('total', 7)} ${pad('wrong', 6)} ${pad('orphan', 7)} ${pad('uncast', 7)} ${pad('null_pid', 9)} verdict`);
  console.log('-'.repeat(110));
  let red = 0;
  for (const r of results) {
    if (r.error) { console.log(`${pad(r.t, 26)} ${pad(r.fk, 18)} ERROR: ${r.error}`); red++; continue; }
    const blockers = (r.wrong || 0) + (r.orphan || 0) + (r.uncastable || 0) + (r.null_pid || 0);
    const verdict = blockers === 0 ? 'GREEN' : `*** RED (${blockers} blockers) ***`;
    if (blockers > 0) red++;
    console.log(`${pad(r.t, 26)} ${pad(r.fk, 18)} ${pad(r.total, 7)} ${pad(r.wrong || 0, 6)} ${pad(r.orphan || 0, 7)} ${pad(r.uncastable || 0, 7)} ${pad(r.null_pid || 0, 9)} ${verdict}`);
    if (r.samples?.length) console.log(`${' '.repeat(45)}samples: ${r.samples.join(', ')}`);
  }
  console.log('-'.repeat(110));
  console.log(red === 0
    ? '\nFK-READINESS: GREEN — every FK-target column is clean. 75-02 unblocked.'
    : `\nFK-READINESS: RED — ${red} table(s) have blockers. 75-01 Task 2 (guarded backfill) required before 75-02.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
