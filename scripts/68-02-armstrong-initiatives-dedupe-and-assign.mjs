#!/usr/bin/env node
/**
 * Phase 68 Plan 02 — Armstrong strategic_initiatives dedupe (Option 3 hybrid).
 *
 * SCOPE (deliberate, narrow):
 *   1. Parking-lot dedupe: delete step_type='strategic_ideas' rows whose
 *      normalized title also exists as a step_type='twelve_month' row.
 *      Keep strategic_ideas rows WITHOUT a twelve_month counterpart
 *      (books, exploratory items, etc.).
 *   2. Cross-quarter duplicate cleanup: if a title appears in multiple
 *      quarter step_types (q1, q2, q3, q4), keep the earliest quarter
 *      (q1 wins over q2/q3/q4) and delete the rest.
 *
 * EXPLICITLY DOES NOT:
 *   - Touch the quarter_assigned, year_assigned, fiscal_year, start_date,
 *     end_date columns on any row. The wizard manages quarter assignment
 *     via step_type and we respect that.
 *   - Delete any q1/q2/q3/q4 row that is NOT a cross-quarter duplicate.
 *     Matt's wizard assignments are preserved.
 *   - Apply transcript-based quarter sequencing. Matt's wizard is the
 *     source of truth for which initiative belongs in which quarter.
 *   - Affect any tenant other than Armstrong & Co.
 *
 * Targets:
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *   user_id              = f4702002-69a6-44f1-b963-ada2a95c843b
 *
 * Idempotency: a second --apply run produces 0 deletes.
 *
 * Run:
 *   node scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs           # dry-run
 *   node scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';
const USER_ID              = 'f4702002-69a6-44f1-b963-ada2a95c843b';

// Earliest-quarter wins when the same title is assigned to multiple quarters.
const QUARTER_PRIORITY = ['q1', 'q2', 'q3', 'q4'];

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const normalize = (t) => (t || '').trim().toLowerCase();

async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiDelete(table, id) {
  const res = await fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (res.status === 404) return { status: 'noop' }; // already deleted
  if (!res.ok) throw new Error(`DELETE ${table} id=${id} → ${res.status} ${await res.text()}`);
  return { status: 'deleted' };
}

console.log('=== Phase 68 Plan 02 — Armstrong initiative dedupe (Option 3 hybrid) ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('');

// 1. Fetch all initiatives for Armstrong
const rows = await apiGet(
  `strategic_initiatives?business_id=eq.${BUSINESS_PROFILES_ID}&select=id,title,step_type,quarter_assigned,year_assigned,fiscal_year,start_date,end_date`,
);
console.log(`Total strategic_initiatives rows for Armstrong: ${rows.length}\n`);

// 2. Index twelve_month titles
const twelveMonthTitles = new Set(
  rows.filter((r) => r.step_type === 'twelve_month').map((r) => normalize(r.title)),
);

// 3. PARKING-LOT DEDUPE PASS — strategic_ideas rows whose title also exists in twelve_month
const parkingLotDeletes = rows
  .filter((r) => r.step_type === 'strategic_ideas' && twelveMonthTitles.has(normalize(r.title)))
  .map((r) => ({ id: r.id, title: r.title, step_type: r.step_type, reason: 'duplicate of twelve_month' }));

// 4. CROSS-QUARTER DUPLICATE PASS — keep earliest quarter when same title appears in multiple
const quarterRowsByTitle = new Map();
for (const r of rows) {
  if (!QUARTER_PRIORITY.includes(r.step_type)) continue;
  const t = normalize(r.title);
  if (!quarterRowsByTitle.has(t)) quarterRowsByTitle.set(t, []);
  quarterRowsByTitle.get(t).push(r);
}
const crossQuarterDeletes = [];
for (const [title, group] of quarterRowsByTitle) {
  if (group.length < 2) continue;
  // Sort by quarter priority; keep first (earliest), delete the rest
  group.sort((a, b) => QUARTER_PRIORITY.indexOf(a.step_type) - QUARTER_PRIORITY.indexOf(b.step_type));
  const keep = group[0];
  for (let i = 1; i < group.length; i++) {
    crossQuarterDeletes.push({
      id: group[i].id,
      title: group[i].title,
      step_type: group[i].step_type,
      reason: `duplicate of ${keep.step_type} entry (keeping earlier quarter)`,
    });
  }
}

// 5. Compute preserved counts
const allDeleteIds = new Set([...parkingLotDeletes, ...crossQuarterDeletes].map((d) => d.id));
const preserved = rows.filter((r) => !allDeleteIds.has(r.id));
const preservedByStep = preserved.reduce((acc, r) => {
  acc[r.step_type] = (acc[r.step_type] || 0) + 1;
  return acc;
}, {});

// 6. Print plans
console.log(`=== PARKING-LOT DEDUPE PLAN (${parkingLotDeletes.length} deletes) ===`);
for (const d of parkingLotDeletes) {
  console.log(`  - [${d.step_type}] ${d.title}`);
}
if (parkingLotDeletes.length === 0) console.log('  (none — already deduped)');

console.log(`\n=== CROSS-QUARTER DUPLICATE PLAN (${crossQuarterDeletes.length} deletes) ===`);
for (const d of crossQuarterDeletes) {
  console.log(`  - [${d.step_type}] ${d.title}  (${d.reason})`);
}
if (crossQuarterDeletes.length === 0) console.log('  (none — no cross-quarter duplicates)');

console.log(`\n=== PRESERVED (${preserved.length} rows kept) ===`);
for (const step of Object.keys(preservedByStep).sort()) {
  console.log(`  step_type='${step}': ${preservedByStep[step]} rows`);
}

console.log('');
const totalDeletes = parkingLotDeletes.length + crossQuarterDeletes.length;
console.log(`Total deletes planned: ${totalDeletes}`);
console.log(`Rows after apply: ${rows.length - totalDeletes} (was ${rows.length})`);

// 7. Apply or exit
if (!APPLY) {
  console.log('\n\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

if (totalDeletes === 0) {
  console.log('\n\x1b[32m✓ Nothing to delete (idempotent — already clean).\x1b[0m');
  process.exit(0);
}

console.log('\nApplying deletes...');
let deleted = 0;
let noop = 0;
for (const d of [...parkingLotDeletes, ...crossQuarterDeletes]) {
  const r = await apiDelete('strategic_initiatives', d.id);
  if (r.status === 'deleted') deleted++;
  else noop++;
  process.stdout.write('.');
}
console.log('');
console.log(`\n\x1b[32m✓ Deleted ${deleted} rows (${parkingLotDeletes.length} parking-lot + ${crossQuarterDeletes.length} cross-quarter).\x1b[0m`);
if (noop > 0) console.log(`(${noop} rows were already gone — idempotent retry, no harm.)`);
console.log('');
console.log('Refresh /goals (Step 2/Step 3) in the wizard — parking lot should now show ~21 items (books + exploratory only).');
