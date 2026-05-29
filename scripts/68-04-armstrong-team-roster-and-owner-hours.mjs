#!/usr/bin/env node
/**
 * Phase 68 Plan 04 — Armstrong team roster + owner-hours backfill.
 *
 * A4: Update business_profiles.key_roles to add Carly, Cooper, Chris;
 *     update Pablo + Kye titles to reflect their lockup/finish workflow
 *     split; annotate Pablo as foreman-promotion candidate.
 *
 *     Preserves existing roles (Luke, Alice, Peni, Billy, Brodie) by
 *     name-based merge.
 *
 *     Also flags any pre-existing "Pubs" entry to stderr for Matt's
 *     reconciliation (Pubs vs Pablo — same person?).
 *
 * A6: Backfill owner_hours_per_week_* on business_financial_goals to
 *     reflect Luke's "off the tools by FY29" glide path:
 *       current=50, year1=40, year2=25, year3=10
 *     And patch owner_info.desired_hours from 0 → 10 (data-entry bug fix).
 *
 * Targets:
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *   user_id              = f4702002-69a6-44f1-b963-ada2a95c843b
 *
 * NOTE on schema deviation from PLAN:
 *   PLAN used `role:` key in target objects. The live business_profiles.key_roles
 *   schema uses `title:` (not `role:`) — verified via snapshot query. Script
 *   uses `title:` to match what's already in the database and what the wizard
 *   reads at Step4AnnualPlan.tsx:179.
 *
 * Idempotency: PATCH only the changed keys. Re-running with --apply when
 * everything is already correct logs "no changes needed".
 *
 * Run:
 *   node scripts/68-04-armstrong-team-roster-and-owner-hours.mjs           # dry-run
 *   node scripts/68-04-armstrong-team-roster-and-owner-hours.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';
const USER_ID              = 'f4702002-69a6-44f1-b963-ada2a95c843b';

// Target roles. Each replaces (or adds, if not present) the entry with the same `name`.
// Note: `title` (not `role`) — matches live schema.
const TARGET_ROLES = [
  { name: 'Pablo',  title: 'Foreman (Lockup → Finish)', notes: 'Foreman-promotion candidate — target ready Jan-Jun 2028. Possibly same person as "Pubs" referenced in earlier notes; confirm with Matt.', status: 'promotion_candidate' },
  { name: 'Kye',    title: 'Foreman (Setup → Lockup)',  notes: '',                                                                                                                                      status: '' },
  { name: 'Carly',  title: 'Subcontract Carpenter',     notes: 'First apprentice — "huge part of the cocktail"',                                                                                        status: '' },
  { name: 'Cooper', title: 'Subcontract Carpenter',     notes: '',                                                                                                                                      status: '' },
  { name: 'Chris',  title: 'Carpenter',                 notes: 'Just started',                                                                                                                          status: '' },
];

const TARGET_OWNER_HOURS = {
  owner_hours_per_week_current: 50,
  owner_hours_per_week_year1:   40,
  owner_hours_per_week_year2:   25,
  owner_hours_per_week_year3:   10,
};

const TARGET_DESIRED_HOURS = 10;

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const norm = (s) => (s || '').trim().toLowerCase();
const rolesEqual = (a, b) =>
  norm(a.name) === norm(b.name) &&
  (a.title || '').trim() === (b.title || '').trim() &&
  (a.notes || '') === (b.notes || '') &&
  (a.status || '') === (b.status || '');

console.log('=== Phase 68 Plan 04 — Armstrong team roster + owner hours ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('');

// ─── A4: Team roster merge ────────────────────────────────────────────────────
const [profile] = await apiGet(
  `business_profiles?id=eq.${BUSINESS_PROFILES_ID}&select=key_roles,owner_info`,
);
const existingRoles = Array.isArray(profile.key_roles) ? profile.key_roles : [];
const targetNames = new Set(TARGET_ROLES.map((r) => norm(r.name)));

// Preserve existing roles whose normalized-name isn't in the target list.
const preservedRoles = existingRoles.filter((r) => r?.name && !targetNames.has(norm(r.name)));
const finalRoles = [...preservedRoles, ...TARGET_ROLES];

// Pubs reconciliation flag (CONTEXT.md A4 pending question)
for (const role of preservedRoles) {
  const n = norm(role.name);
  if (n === 'pubs' || n.includes('pub')) {
    console.error(`\n⚠️ FOUND 'Pubs' entry in key_roles — confirm with Matt whether this is Pablo (per CONTEXT.md A4 pending question)`);
    console.error('Preserved role payload:', JSON.stringify(role, null, 2));
  }
}

const rolesChanged = (() => {
  if (finalRoles.length !== existingRoles.length) return true;
  // Order-insensitive comparison by name
  const byName = (arr) => Object.fromEntries(arr.map((r) => [norm(r.name), r]));
  const a = byName(finalRoles);
  const b = byName(existingRoles);
  if (Object.keys(a).length !== Object.keys(b).length) return true;
  for (const k of Object.keys(a)) {
    if (!b[k]) return true;
    if (!rolesEqual(a[k], b[k])) return true;
  }
  return false;
})();

console.log('Existing roles in key_roles:');
for (const r of existingRoles) {
  console.log(`  - ${r?.name || '(unnamed)'} — ${r?.title || ''}`);
}
console.log('');
console.log('Preserved (not in target list — kept as-is):');
if (preservedRoles.length === 0) console.log('  (none)');
else for (const r of preservedRoles) console.log(`  · ${r.name} (${r.title || ''})`);
console.log('');
console.log('Target roles (added or updated):');
for (const r of TARGET_ROLES) console.log(`  ✓ ${r.name} — ${r.title}${r.status ? ` [${r.status}]` : ''}`);
console.log('');
console.log(`Final key_roles count: ${finalRoles.length} (was ${existingRoles.length})`);
console.log(`Roles change required: ${rolesChanged ? 'YES' : 'NO (already matches)'}`);

// ─── A4: owner_info.desired_hours merge ──────────────────────────────────────
const existingOwnerInfo = profile.owner_info || {};
const desiredHoursChanged = existingOwnerInfo.desired_hours !== TARGET_DESIRED_HOURS;
const mergedOwnerInfo = desiredHoursChanged
  ? { ...existingOwnerInfo, desired_hours: TARGET_DESIRED_HOURS }
  : existingOwnerInfo;
console.log('');
console.log(`owner_info.desired_hours: ${existingOwnerInfo.desired_hours} → ${TARGET_DESIRED_HOURS} ${desiredHoursChanged ? '(CHANGE)' : '(no change)'}`);

// ─── A6: business_financial_goals owner_hours_per_week_* backfill ─────────────
const [goals] = await apiGet(
  `business_financial_goals?business_id=eq.${BUSINESS_PROFILES_ID}&select=id,owner_hours_per_week_current,owner_hours_per_week_year1,owner_hours_per_week_year2,owner_hours_per_week_year3`,
);
const ownerHoursDiff = {};
for (const [k, v] of Object.entries(TARGET_OWNER_HOURS)) {
  if (goals[k] !== v) ownerHoursDiff[k] = v;
}
const ownerHoursChanged = Object.keys(ownerHoursDiff).length > 0;

console.log('');
console.log('owner_hours_per_week diff:');
for (const k of Object.keys(TARGET_OWNER_HOURS)) {
  const cur = goals[k];
  const tgt = TARGET_OWNER_HOURS[k];
  console.log(`  ${k}: ${cur} → ${tgt}${cur !== tgt ? ' (CHANGE)' : ''}`);
}

console.log('');
console.log(`business_profiles change needed: ${rolesChanged || desiredHoursChanged ? 'YES' : 'NO'}`);
console.log(`business_financial_goals change needed: ${ownerHoursChanged ? 'YES' : 'NO'}`);

if (!APPLY) {
  console.log('\n\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

// ─── Apply ────────────────────────────────────────────────────────────────────
if (rolesChanged || desiredHoursChanged) {
  const body = {};
  if (rolesChanged) body.key_roles = finalRoles;
  if (desiredHoursChanged) body.owner_info = mergedOwnerInfo;
  await apiPatch(`business_profiles?id=eq.${BUSINESS_PROFILES_ID}`, body);
  console.log('\n\x1b[32m✓ business_profiles patched\x1b[0m');
} else {
  console.log('\nbusiness_profiles: no changes needed');
}

if (ownerHoursChanged) {
  await apiPatch(`business_financial_goals?id=eq.${goals.id}`, ownerHoursDiff);
  console.log('\x1b[32m✓ business_financial_goals patched\x1b[0m');
} else {
  console.log('business_financial_goals: no changes needed');
}
