#!/usr/bin/env node
/**
 * Phase 68 Plan 03 — Add 13 diversification ideas to Armstrong's
 * strategic_initiatives as exploratory parking-lot items.
 *
 * Each row: step_type='strategic_ideas', idea_type='strategic',
 * selected=false, category='growth'. Quarter columns all null.
 *
 * NOTE on enum mapping (constraint discovered during live run 2026-05-29):
 *   - idea_type='exploratory' was rejected by strategic_initiatives_idea_type_check.
 *     Allowed values: 'strategic' | 'operational'. We use 'strategic' because
 *     these ARE strategic options for the business. The "parking-lot / not yet
 *     committed" signal is conveyed by selected=false.
 *   - category='diversification' is not in the allowed category enum. Allowed:
 *     customer_experience, finance, growth, marketing, misc, operations, other,
 *     people, product, sales, systems, team. We use 'growth' (diversification
 *     IS a growth play).
 *
 * Targets:
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *   user_id              = f4702002-69a6-44f1-b963-ada2a95c843b
 *
 * Idempotency: existence-check by normalized title before insert.
 * Re-running with --apply: "Inserted 0, Skipped N".
 *
 * Run:
 *   node scripts/68-03-armstrong-diversification-ideas.mjs           # dry-run
 *   node scripts/68-03-armstrong-diversification-ideas.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';
const USER_ID              = 'f4702002-69a6-44f1-b963-ada2a95c843b';

const DIVERSIFICATION_TITLES = [
  "Australian Housing partnership (Jordan Ricketts)",
  "NSW affordable housing builder panel",
  "Strata maintenance / repair work",
  "In-house electrical + plumbing",
  "Insurance remediation work (flood/storm/roof)",
  "Duplex defect remediation",
  "School works / demountables",
  "Government tenders",
  "University maintenance contracts",
  "Waterfront / barge + maritime partner (Class 2 licence, Evolve FM panel)",
  "Prefab passive homes / kit homes",
  "Pontoon innovation (Kevlar/fibreglass)",
  "Experiences subscription business (Portelli-style)",
];

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const normalize = (t) => (t || '').trim().toLowerCase();

function buildPayload(title) {
  return {
    business_id: BUSINESS_PROFILES_ID,
    user_id: USER_ID,
    title,
    step_type: 'strategic_ideas',
    idea_type: 'strategic',          // enum: 'strategic' | 'operational' only
    selected: false,                 // signals "parking-lot, not committed to 12-month plan"
    category: 'growth',              // diversification IS a growth play; 'diversification' not in enum
    quarter_assigned: null,
    year_assigned: null,
    fiscal_year: null,
    priority: null,
    source: 'manual',
  };
}

async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiInsert(payload) {
  const res = await fetch(`${URL}/rest/v1/strategic_initiatives`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST strategic_initiatives → ${res.status} ${await res.text()}`);
  return res.json();
}

console.log('=== Phase 68 Plan 03 — Armstrong diversification ideas ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('');

// 1. Fetch existing strategic_ideas titles for idempotency check
const existingRows = await apiGet(
  `strategic_initiatives?business_id=eq.${BUSINESS_PROFILES_ID}&step_type=eq.strategic_ideas&select=title`,
);
const existingTitles = new Set(existingRows.map((r) => normalize(r.title)));
console.log(`Existing strategic_ideas rows for Armstrong: ${existingRows.length}`);
console.log('');

// 2. Build insert queue
const inserts = [];
const skips = [];
for (const title of DIVERSIFICATION_TITLES) {
  if (existingTitles.has(normalize(title))) {
    skips.push(title);
  } else {
    inserts.push(title);
  }
}

console.log(`=== INSERT PLAN (${inserts.length} new ideas) ===`);
for (const t of inserts) console.log(`  + ${t}`);
if (inserts.length === 0) console.log('  (none — all 13 titles already exist)');

if (skips.length > 0) {
  console.log(`\n=== SKIPS (${skips.length} — already exist) ===`);
  for (const t of skips) console.log(`  · ${t}`);
}

console.log('');

if (!APPLY) {
  console.log('\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

if (inserts.length === 0) {
  console.log('\x1b[32m✓ Nothing to insert (idempotent — all 13 already exist).\x1b[0m');
  process.exit(0);
}

console.log('Applying inserts...');
let count = 0;
for (const title of inserts) {
  await apiInsert(buildPayload(title));
  count++;
  process.stdout.write('.');
}
console.log('');
console.log(`\n\x1b[32m✓ Inserted ${count} new diversification ideas. Skipped ${skips.length} (already existed).\x1b[0m`);
console.log('');
console.log('Refresh /goals (Step 2 — Strategic Ideas) in the wizard to see them in the parking lot.');
