#!/usr/bin/env node
/**
 * Phase 68 Plan 05 — Add 8 KPIs to Armstrong's KPI catalog + tracking.
 *
 * SCHEMA DISCOVERY (during live run 2026-05-29):
 *   business_kpis is a two-tier model:
 *     1. custom_kpis_library — per-tenant KPI definitions (one row per KPI
 *        type). FK key: business_id = business_profiles.id.
 *     2. business_kpis — per-tenant tracking (year targets, current value,
 *        is_active, etc). References custom_kpis_library via NOT-NULL
 *        kpi_id. FK key: business_id = businesses.id.
 *   Both rows must be inserted to register a KPI.
 *
 *   Existing "Completed Jobs" was created this way: library row
 *   `cee3adf3-…` (business_id=678ae542-…) + business_kpis row
 *   `b8e24b40-…` (business_id=a0bf1b0a-…, kpi_id=cee3adf3-…).
 *
 * Existing "Completed Jobs" KPI is untouched.
 *
 * ENUM DEVIATIONS FROM PLAN (better wizard-grouping alignment):
 *   - "Quote-to-Win Conversion" category: ATTRACT → CONVERT
 *   - "Client Feedback Score" category: DELIVER → DELIGHT
 *   - "Luke Hours on Tools per Week" category: LEAD → PEOPLE
 *
 * Idempotency:
 *   Both tables: existence-check by normalized name (library) and by
 *   business_id + kpi_id (tracking). Re-running with --apply when complete
 *   logs zero inserts.
 *
 * Run:
 *   node scripts/68-05-armstrong-kpis.mjs           # dry-run
 *   node scripts/68-05-armstrong-kpis.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESSES_ID        = 'a0bf1b0a-663e-4636-8c0d-eef62972dcbc'; // business_kpis.business_id
const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250'; // custom_kpis_library.business_id
const USER_ID              = 'f4702002-69a6-44f1-b963-ada2a95c843b';

const KPIS = [
  { name: 'Revenue Invoiced',               category: 'DELIVER', frequency: 'monthly', unit: 'dollar',     year1_target: 7500000, year2_target: 10000000, year3_target: 12000000 },
  { name: 'Gross Margin % per Job',         category: 'DELIVER', frequency: 'per-job', unit: 'percentage', year1_target: 20,      year2_target: 20,        year3_target: 20 },
  { name: 'Quote-to-Win Conversion',        category: 'CONVERT', frequency: 'monthly', unit: 'percentage', year1_target: 80,      year2_target: 80,        year3_target: 80 },
  { name: 'Home Warranty Headroom',         category: 'DELIVER', frequency: 'monthly', unit: 'dollar',     year1_target: null,    year2_target: null,      year3_target: null },
  { name: 'Active Jobs in Pipeline',        category: 'DELIVER', frequency: 'monthly', unit: 'number',     year1_target: null,    year2_target: null,      year3_target: null },
  { name: 'Variations Captured & Invoiced', category: 'DELIVER', frequency: 'per-job', unit: 'percentage', year1_target: 95,      year2_target: 95,        year3_target: 95 },
  { name: 'Client Feedback Score',          category: 'DELIGHT', frequency: 'per-job', unit: 'number',     year1_target: 9,       year2_target: 9,         year3_target: 9 },
  { name: 'Luke Hours on Tools per Week',   category: 'PEOPLE',  frequency: 'monthly', unit: 'number',     year1_target: 20,      year2_target: 5,         year3_target: 0 },
];

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const normalize = (s) => (s || '').trim().toLowerCase();

async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function apiInsert(table, payload) {
  const res = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`POST ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function apiPatch(table, filter, body) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PATCH ${table} ${filter} → ${res.status} ${await res.text()}`);
  return res.json();
}

console.log('=== Phase 68 Plan 05 — Armstrong KPIs (2-tier: library + tracking) ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: businesses.id =', BUSINESSES_ID);
console.log('        business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('');

// ─── Read both tables ────────────────────────────────────────────────────────
const libraryRows = await apiGet(
  `custom_kpis_library?business_id=eq.${BUSINESS_PROFILES_ID}&select=id,name,category,frequency,unit`,
);
const trackingRows = await apiGet(
  `business_kpis?business_id=eq.${BUSINESSES_ID}&select=id,name,kpi_id,category,frequency,unit,year1_target,year2_target,year3_target,is_active,is_universal`,
);

const libraryByName = new Map(libraryRows.map((r) => [normalize(r.name), r]));
const trackingByKpiId = new Map(trackingRows.map((r) => [r.kpi_id, r]));

console.log(`custom_kpis_library rows for Armstrong: ${libraryRows.length}`);
for (const r of libraryRows) console.log(`  · ${r.name} [${r.category}/${r.frequency}/${r.unit}]`);
console.log('');
console.log(`business_kpis rows for Armstrong: ${trackingRows.length}`);
for (const r of trackingRows) console.log(`  · ${r.name} [Y1=${r.year1_target} Y2=${r.year2_target} Y3=${r.year3_target}]`);
console.log('');

// ─── Plan ────────────────────────────────────────────────────────────────────
const libraryInserts = [];
const trackingInserts = [];  // { kpi, kpi_id }
const trackingPatches = [];  // { id, diff, name }
const skips = [];

const TRACKING_COMPARE = ['category', 'frequency', 'unit', 'year1_target', 'year2_target', 'year3_target', 'is_active', 'is_universal'];

for (const kpi of KPIS) {
  const libRow = libraryByName.get(normalize(kpi.name));
  if (!libRow) {
    libraryInserts.push(kpi);
    trackingInserts.push({ kpi, kpi_id: null }); // kpi_id resolved post-insert
    continue;
  }
  const trackRow = trackingByKpiId.get(libRow.id);
  if (!trackRow) {
    trackingInserts.push({ kpi, kpi_id: libRow.id });
    continue;
  }
  // Both rows exist — compare tracking fields
  const target = {
    category: kpi.category, frequency: kpi.frequency, unit: kpi.unit,
    year1_target: kpi.year1_target, year2_target: kpi.year2_target, year3_target: kpi.year3_target,
    is_active: true, is_universal: false,
  };
  const diff = {};
  for (const k of TRACKING_COMPARE) if ((trackRow[k] ?? null) !== (target[k] ?? null)) diff[k] = target[k];
  if (Object.keys(diff).length === 0) skips.push(kpi);
  else trackingPatches.push({ id: trackRow.id, name: kpi.name, diff });
}

console.log(`=== custom_kpis_library INSERTS (${libraryInserts.length}) ===`);
for (const k of libraryInserts) console.log(`  + ${k.name}  [${k.category}/${k.frequency}/${k.unit}]`);
if (libraryInserts.length === 0) console.log('  (none)');

console.log(`\n=== business_kpis INSERTS (${trackingInserts.length}) ===`);
for (const t of trackingInserts) console.log(`  + ${t.kpi.name}  Y1=${t.kpi.year1_target} Y2=${t.kpi.year2_target} Y3=${t.kpi.year3_target}`);
if (trackingInserts.length === 0) console.log('  (none)');

console.log(`\n=== business_kpis PATCHES (${trackingPatches.length}) ===`);
for (const p of trackingPatches) console.log(`  ~ ${p.name}  diff: ${JSON.stringify(p.diff)}`);
if (trackingPatches.length === 0) console.log('  (none)');

console.log(`\n=== SKIPS (${skips.length} already match) ===`);
for (const k of skips) console.log(`  · ${k.name}`);

console.log('');
if (!APPLY) {
  console.log('\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

if (libraryInserts.length === 0 && trackingInserts.length === 0 && trackingPatches.length === 0) {
  console.log('\x1b[32m✓ Nothing to do (idempotent).\x1b[0m');
  process.exit(0);
}

console.log('Applying...');

// 1. Insert library rows first; capture the new IDs to link to tracking inserts
for (let i = 0; i < libraryInserts.length; i++) {
  const kpi = libraryInserts[i];
  const libPayload = {
    business_id: BUSINESS_PROFILES_ID,
    name: kpi.name,
    friendly_name: kpi.name,
    category: kpi.category,
    frequency: kpi.frequency,
    unit: kpi.unit,
    description: '',
    created_by: USER_ID,
    status: 'pending',
  };
  const inserted = await apiInsert('custom_kpis_library', libPayload);
  const newId = inserted[0]?.id;
  if (!newId) throw new Error(`Library insert returned no id for ${kpi.name}`);
  // Link the matching tracking-insert entry to the new library id
  const match = trackingInserts.find((t) => t.kpi.name === kpi.name && t.kpi_id === null);
  if (match) match.kpi_id = newId;
  process.stdout.write('L');
}

// 2. Insert business_kpis tracking rows
for (const t of trackingInserts) {
  if (!t.kpi_id) throw new Error(`Tracking insert for ${t.kpi.name} has no kpi_id — library link failed`);
  const trackPayload = {
    business_id: BUSINESSES_ID,
    user_id: USER_ID,
    kpi_id: t.kpi_id,
    name: t.kpi.name,
    friendly_name: t.kpi.name,
    category: t.kpi.category,
    frequency: t.kpi.frequency,
    unit: t.kpi.unit,
    year1_target: t.kpi.year1_target,
    year2_target: t.kpi.year2_target,
    year3_target: t.kpi.year3_target,
    is_active: true,
    is_universal: false,
    notes: t.kpi.year1_target === null ? 'Track-only — no numeric target' : null,
  };
  await apiInsert('business_kpis', trackPayload);
  process.stdout.write('+');
}

// 3. Patch existing tracking rows
for (const p of trackingPatches) {
  await apiPatch('business_kpis', `id=eq.${p.id}`, p.diff);
  process.stdout.write('~');
}
console.log('');
console.log(`\n\x1b[32m✓ ${libraryInserts.length} library, ${trackingInserts.length} tracking inserted, ${trackingPatches.length} patched, ${skips.length} unchanged.\x1b[0m`);
