#!/usr/bin/env node
/**
 * HOTFIX: remap Armstrong's diversification ideas from category='growth' to
 * category='other' so the wizard UI bucket map at Step2StrategicIdeas.tsx
 * (marketing/operations/finance/people/systems/product/customer_experience/
 * other/misc) doesn't crash with `e[t.category||"misc"].push is undefined`.
 *
 * Discovered 2026-05-29 — Matt's Clients page crashed after Plan 68-03
 * inserted 13 strategic_ideas with category='growth' (a valid DB enum
 * value the frontend's bucket map doesn't include).
 *
 * Permanent fix should: (a) add `growth` to the bucket map in
 * Step2StrategicIdeas.tsx + Step3PrioritizeInitiatives.tsx + quarterly
 * review sync service, OR (b) add a defensive `grouped[category] ?? grouped.misc`
 * fallback. Tracked for Wave 2 of Phase 68 as a sibling fix.
 *
 * Single tenant. Dry-run + --apply pattern. Idempotent.
 *
 * Run:
 *   node scripts/armstrong-fix-growth-category-hotfix.mjs           # dry-run
 *   node scripts/armstrong-fix-growth-category-hotfix.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');
const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function api(method, path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

console.log('=== HOTFIX: remap category=growth → other for Armstrong ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('');

const rows = await api('GET', `strategic_initiatives?business_id=eq.${BUSINESS_PROFILES_ID}&category=eq.growth&select=id,title,category`);
console.log(`Found ${rows.length} rows with category='growth':`);
for (const r of rows) console.log(`  · ${r.title}`);
console.log('');

if (rows.length === 0) {
  console.log('\x1b[32m✓ Nothing to remap (idempotent).\x1b[0m');
  process.exit(0);
}

if (!APPLY) {
  console.log(`Plan: PATCH all ${rows.length} rows to category='other'.`);
  console.log('\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

console.log('Applying...');
for (const r of rows) {
  await api('PATCH', `strategic_initiatives?id=eq.${r.id}`, { category: 'other' });
  process.stdout.write('~');
}
console.log('');
console.log(`\n\x1b[32m✓ Remapped ${rows.length} rows from growth → other.\x1b[0m`);
console.log('Refresh /coach/clients — the Clients page should load again.');
