#!/usr/bin/env node
/**
 * Phase 68 Plan 07 — Attach sales-process note to Armstrong's
 * "Unpack current sales process" twelve_month initiative.
 *
 * Captures the current sales process (architect → quote → meeting →
 * site walk → references → follow-up) and the proposed additions
 * (discovery questions, indecision-period choreography, 2-beer fit
 * test) from the 2026-05-12 session.
 *
 * SCHEMA DEVIATION from PLAN:
 *   strategic_initiatives.notes is a TEXT column (not JSONB) — verified
 *   live (existing rows hold empty strings). Script writes a formatted
 *   markdown string instead of a stringified JSON object. The structure
 *   is preserved as human-readable headings + bullet lists so the note
 *   reads naturally in the wizard UI.
 *
 * Targets:
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *
 * Idempotency: PATCH only if existing notes !== target string.
 *
 * Run:
 *   node scripts/68-07-armstrong-sales-process-note.mjs           # dry-run
 *   node scripts/68-07-armstrong-sales-process-note.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';

// Match on lower(trim(title)) === this value OR title contains 'unpack' AND 'sales process'.
const TARGET_TITLE_MATCH = (t) => {
  const n = (t || '').trim().toLowerCase();
  return n.includes('unpack') && n.includes('sales process');
};

// Markdown-formatted note. Multiline string preserved verbatim.
const NOTES_PAYLOAD = `Captured from: 2026-05-12 Armstrong session.

## Current sales process

1. Architect produces plans
2. Client takes plans to builder for price
3. Initial meeting with client
4. Site walk
5. Reference check / references provided
6. Formal quote
7. Follow-up

## Proposed additions

- **Discovery questions block before pricing** — surface budget, decision-makers, timeline, decision criteria.
- **Choreographed indecision period** — own the indecision period; make space for the client to slow down and feel the decision.
- **2-beer fit-test** — informal social meeting to confirm relationship-fit before signing. Use with caveats: it's a heuristic, not a gate.
`;

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function apiGet(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiPatch(filter, body) {
  const r = await fetch(`${URL}/rest/v1/strategic_initiatives?${filter}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${filter} → ${r.status} ${await r.text()}`);
  return r.json();
}

console.log('=== Phase 68 Plan 07 — Armstrong sales-process note ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('');

const rows = await apiGet(
  `strategic_initiatives?business_id=eq.${BUSINESS_PROFILES_ID}&step_type=eq.twelve_month&select=id,title,notes`,
);
const candidates = rows.filter((r) => TARGET_TITLE_MATCH(r.title));
console.log(`Matching twelve_month initiatives ('unpack' + 'sales process'): ${candidates.length}`);
for (const c of candidates) console.log(`  · id=${c.id} title="${c.title}" notes_len=${(c.notes || '').length}`);

if (candidates.length === 0) {
  console.error('\n\x1b[31mERROR: No matching "Unpack sales process" initiative found. Has 68-02 left this row intact?\x1b[0m');
  process.exit(1);
}
if (candidates.length > 1) {
  console.error('\n\x1b[31mERROR: More than one matching initiative — refusing to PATCH ambiguously.\x1b[0m');
  process.exit(1);
}

const target = candidates[0];
const needsPatch = (target.notes || '') !== NOTES_PAYLOAD;
console.log('');
console.log(`Notes already match: ${!needsPatch}`);
console.log(`PATCH planned: ${needsPatch ? 'YES' : 'NO (idempotent — skip)'}`);

if (needsPatch) {
  console.log('\n--- New notes payload ---');
  console.log(NOTES_PAYLOAD);
  console.log('--- end payload ---');
}

if (!APPLY) {
  console.log('\n\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

if (!needsPatch) {
  console.log('\n\x1b[32m✓ Notes already match — no write needed (idempotent).\x1b[0m');
  process.exit(0);
}

await apiPatch(`id=eq.${target.id}`, { notes: NOTES_PAYLOAD });
console.log('\n\x1b[32m✓ Notes patched on initiative ' + target.id + '\x1b[0m');
