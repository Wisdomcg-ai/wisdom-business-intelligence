#!/usr/bin/env node
/**
 * Phase 68 Plan 06 — Armstrong values + mission + SWOT polish.
 *
 * A7: Replace 5-buzzword core_values with 9 "we" behaviour statements.
 * A8: Replace mission_statement with verbatim session wording.
 * A9: SWOT touch-ups:
 *     - Annotate existing "Flexible & adaptable to client needs" entries
 *       in BOTH strength AND weakness (both already exist) with explainer
 *       descriptions making the same-trait tension explicit.
 *     - Insert new strength: "Operational delivery — Marrickville 7 weeks
 *       ahead of schedule with wet weather"
 *     - Insert new threat: "Trade cost inflation pushing jobs out of client
 *       budget (e.g., $175k → $200k)"
 *     - PATCH the existing home-warranty threat description with the
 *       headroom + claims-history context for future cap-increase chats.
 *
 * SCHEMA DEVIATIONS from PLAN (confirmed via 68-01 snapshot):
 *   - swot_items uses `title` (not `content`) for the line itself.
 *   - swot_items.category is SINGULAR: 'strength' / 'weakness' /
 *     'opportunity' / 'threat' (plan said plural — wrong).
 *   - strategy_data row for Armstrong is keyed by user_id (business_id
 *     is null on the existing row).
 *   - swot_items.created_by is NOT NULL — use USER_ID.
 *
 * Idempotency: existence checks on both sides; PATCH only when fields
 * actually differ. Re-running with --apply reports "no changes" when done.
 *
 * Run:
 *   node scripts/68-06-armstrong-values-mission-swot.mjs           # dry-run
 *   node scripts/68-06-armstrong-values-mission-swot.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const USER_ID          = 'f4702002-69a6-44f1-b963-ada2a95c843b';
const SWOT_ANALYSES_ID = 'cb6d1358-a0ec-48b8-878c-159df6b3a576';

// ─── A7: Core values (9 behaviour statements) ────────────────────────────────
const CORE_VALUES = [
  "We are happy and have fun on every job",
  "We are always learning and teaching each other",
  "We work hard and do what we say we will do",
  "We are open and transparent — with each other and with clients",
  "We collaborate to solve problems",
  "We build long-term relationships, not transactions",
  "We do the right thing when no one's watching",
  "No dickheads",
  "We are welcoming and collaborative on site",
];

// ─── A8: Mission statement (verbatim) ─────────────────────────────────────────
const MISSION_STATEMENT = "We take someone's dream that has been sketched on paper and turn it into reality, focusing on the details, overcoming the unforeseen challenges, and constantly ensuring we align with their desires, while coupling this with an amazing client experience.";

// ─── A9: SWOT mutations ──────────────────────────────────────────────────────
const FLEX_STRENGTH_DESC = "Flexibility wins clients but creates scope creep — same trait shows up as a weakness";
const FLEX_WEAKNESS_DESC = "Same trait that wins clients also drives scope creep when boundaries aren't set early";
const NEW_STRENGTH_TITLE = "Operational delivery — Marrickville 7 weeks ahead of schedule with wet weather";
const NEW_THREAT_TITLE   = "Trade cost inflation pushing jobs out of client budget (e.g., $175k → $200k)";
const HOME_WARRANTY_DESC = "Current cap $5M; $2.2M tied at Clavellie, $700k Marrickville; zero claims history (advantage when negotiating cap increase)";

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const norm = (s) => (s || '').trim().toLowerCase();

async function apiGet(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiInsert(table, payload) {
  const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`POST ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiPatch(table, filter, body) {
  const r = await fetch(`${URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${table} ${filter} → ${r.status} ${await r.text()}`);
  return r.json();
}

console.log('=== Phase 68 Plan 06 — Armstrong values + mission + SWOT polish ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: user_id =', USER_ID, '  swot_analyses.id =', SWOT_ANALYSES_ID);
console.log('');

// ─── A7 + A8: strategy_data ──────────────────────────────────────────────────
const sdRows = await apiGet(`strategy_data?user_id=eq.${USER_ID}&select=id,vision_mission`);
if (!sdRows.length) throw new Error('strategy_data row not found for user_id ' + USER_ID);
const sd = sdRows[0];
const existingVM = sd.vision_mission || {};
const newVM = {
  ...existingVM,
  core_values: CORE_VALUES,
  mission_statement: MISSION_STATEMENT,
};
const valuesChanged = JSON.stringify(existingVM.core_values || []) !== JSON.stringify(CORE_VALUES);
const missionChanged = (existingVM.mission_statement || '') !== MISSION_STATEMENT;
const sdNeedsPatch = valuesChanged || missionChanged;

console.log('--- A7/A8 strategy_data ---');
console.log('  core_values change:', valuesChanged ? 'YES' : 'no');
console.log('    existing:', JSON.stringify(existingVM.core_values));
console.log('    target:  ', JSON.stringify(CORE_VALUES));
console.log('  mission_statement change:', missionChanged ? 'YES' : 'no');
console.log('  Needs PATCH:', sdNeedsPatch ? 'YES' : 'no');

// ─── A9: SWOT items ──────────────────────────────────────────────────────────
const items = await apiGet(`swot_items?swot_analysis_id=eq.${SWOT_ANALYSES_ID}&select=id,category,title,description,impact_level,priority_order&order=category,priority_order`);
console.log(`\n--- A9 SWOT (${items.length} existing items) ---`);

const swotMutations = [];

// Op 1: Flexible & adaptable — annotate both strength and weakness.
const flexStrengthRow = items.find(
  (i) => i.category === 'strength' && norm(i.title).includes('flexible') && norm(i.title).includes('adaptable'),
);
const flexWeaknessRow = items.find(
  (i) => i.category === 'weakness' && norm(i.title).includes('flexible') && norm(i.title).includes('adaptable'),
);

if (flexStrengthRow) {
  if ((flexStrengthRow.description || '') !== FLEX_STRENGTH_DESC) {
    swotMutations.push({ kind: 'PATCH', id: flexStrengthRow.id, label: 'Op 1: flex-strength description', body: { description: FLEX_STRENGTH_DESC } });
  }
} else {
  swotMutations.push({ kind: 'INSERT (defensive)', label: 'Op 1: flex-strength row missing — defensive insert', payload: { swot_analysis_id: SWOT_ANALYSES_ID, category: 'strength', title: 'Flexible & adaptable', description: FLEX_STRENGTH_DESC, impact_level: 3, status: 'active', created_by: USER_ID } });
}

if (flexWeaknessRow) {
  if ((flexWeaknessRow.description || '') !== FLEX_WEAKNESS_DESC) {
    swotMutations.push({ kind: 'PATCH', id: flexWeaknessRow.id, label: 'Op 1: flex-weakness description', body: { description: FLEX_WEAKNESS_DESC } });
  }
} else {
  swotMutations.push({ kind: 'INSERT', label: 'Op 1: flex-weakness row missing — insert', payload: { swot_analysis_id: SWOT_ANALYSES_ID, category: 'weakness', title: 'Flexible & adaptable', description: FLEX_WEAKNESS_DESC, impact_level: 3, status: 'active', created_by: USER_ID } });
}

// Op 2: new strength
const hasNewStrength = items.some((i) => i.category === 'strength' && norm(i.title) === norm(NEW_STRENGTH_TITLE));
if (!hasNewStrength) {
  swotMutations.push({ kind: 'INSERT', label: 'Op 2: new strength', payload: { swot_analysis_id: SWOT_ANALYSES_ID, category: 'strength', title: NEW_STRENGTH_TITLE, description: null, impact_level: 4, status: 'active', created_by: USER_ID } });
}

// Op 3: new threat
const hasNewThreat = items.some((i) => i.category === 'threat' && norm(i.title) === norm(NEW_THREAT_TITLE));
if (!hasNewThreat) {
  swotMutations.push({ kind: 'INSERT', label: 'Op 3: new threat', payload: { swot_analysis_id: SWOT_ANALYSES_ID, category: 'threat', title: NEW_THREAT_TITLE, description: null, impact_level: 4, status: 'active', created_by: USER_ID } });
}

// Op 4: home warranty threat description
const hwRow = items.find((i) => i.category === 'threat' && (norm(i.title).includes('home warranty') || norm(i.title).includes('home-warranty')));
if (hwRow) {
  if ((hwRow.description || '') !== HOME_WARRANTY_DESC) {
    swotMutations.push({ kind: 'PATCH', id: hwRow.id, label: 'Op 4: home warranty description', body: { description: HOME_WARRANTY_DESC } });
  }
} else {
  swotMutations.push({ kind: 'INSERT', label: 'Op 4: home warranty threat missing — insert', payload: { swot_analysis_id: SWOT_ANALYSES_ID, category: 'threat', title: 'Home warranty cap exposure', description: HOME_WARRANTY_DESC, impact_level: 4, status: 'active', created_by: USER_ID } });
}

if (swotMutations.length === 0) console.log('  (no SWOT changes needed)');
else for (const m of swotMutations) {
  console.log(`  [${m.kind}] ${m.label}`);
}

console.log('');
console.log(`Summary: strategy_data ${sdNeedsPatch ? 'WILL PATCH' : 'no change'} | swot_items ${swotMutations.length} mutation(s)`);

if (!APPLY) {
  console.log('\n\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

// ─── Apply ───────────────────────────────────────────────────────────────────
if (sdNeedsPatch) {
  await apiPatch('strategy_data', `id=eq.${sd.id}`, { vision_mission: newVM });
  console.log('\n\x1b[32m✓ strategy_data patched\x1b[0m');
} else {
  console.log('\nstrategy_data: no changes needed');
}

let inserted = 0, patched = 0;
for (const m of swotMutations) {
  if (m.kind === 'PATCH') {
    await apiPatch('swot_items', `id=eq.${m.id}`, m.body);
    patched++;
    process.stdout.write('~');
  } else {
    await apiInsert('swot_items', m.payload);
    inserted++;
    process.stdout.write('+');
  }
}
if (swotMutations.length) console.log('');
console.log(`\x1b[32m✓ swot_items: ${inserted} inserted, ${patched} patched\x1b[0m`);
