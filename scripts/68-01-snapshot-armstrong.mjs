#!/usr/bin/env node
/**
 * Phase 68 Plan 01 — Pre-write snapshot of all Armstrong & Co plan-data
 * tables in Supabase. READ-ONLY by design (no write flag). Always safe to run.
 *
 * Purpose: Capture the rollback artifact BEFORE any Workstream A write
 * script (68-02 .. 68-08) runs. If any of those scripts produces a bad
 * result, this snapshot lets us reconstruct the pre-write state.
 *
 * Targets:
 *   businesses.id        = a0bf1b0a-663e-4636-8c0d-eef62972dcbc
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *   user_id              = f4702002-69a6-44f1-b963-ada2a95c843b
 *   swot_analyses.id     = cb6d1358-a0ec-48b8-878c-159df6b3a576
 *
 * Reads (no writes): businesses, business_profiles, business_financial_goals,
 *   business_kpis, strategic_initiatives, strategy_data, swot_analyses,
 *   swot_items, plan_snapshots
 *
 * Output: scripts/snapshots/68-armstrong-pre-write-<ISO-timestamp>.json
 *
 * Run:  node scripts/68-01-snapshot-armstrong.mjs
 *
 * Idempotency: Refuses to overwrite an existing snapshot file
 * (ISO timestamp in filename makes collisions practically impossible).
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY was disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const BUSINESSES_ID         = 'a0bf1b0a-663e-4636-8c0d-eef62972dcbc';
const BUSINESS_PROFILES_ID  = '678ae542-7f0b-43d1-8784-e7341767c250';
const USER_ID               = 'f4702002-69a6-44f1-b963-ada2a95c843b';
const SWOT_ANALYSES_ID      = 'cb6d1358-a0ec-48b8-878c-159df6b3a576';

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// NOTE: dual-ID drift across tables — some store businesses.id in business_id, others store business_profiles.id.
// We snapshot under BOTH keys for tables where the convention is unclear; downstream code uses whichever matches.
const TABLES = [
  { label: 'businesses',                          table: 'businesses',               filter: `id=eq.${BUSINESSES_ID}` },
  { label: 'business_profiles',                   table: 'business_profiles',        filter: `id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'business_financial_goals',            table: 'business_financial_goals', filter: `business_id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'business_kpis_by_businesses_id',      table: 'business_kpis',            filter: `business_id=eq.${BUSINESSES_ID}` },
  { label: 'business_kpis_by_profiles_id',        table: 'business_kpis',            filter: `business_id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'strategic_initiatives',               table: 'strategic_initiatives',    filter: `business_id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'strategy_data',                       table: 'strategy_data',            filter: `business_id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'swot_analyses',                       table: 'swot_analyses',            filter: `id=eq.${SWOT_ANALYSES_ID}` },
  { label: 'swot_items',                          table: 'swot_items',               filter: `swot_analysis_id=eq.${SWOT_ANALYSES_ID}` },
  { label: 'plan_snapshots_by_profiles_id',       table: 'plan_snapshots',           filter: `business_id=eq.${BUSINESS_PROFILES_ID}` },
  { label: 'plan_snapshots_by_businesses_id',     table: 'plan_snapshots',           filter: `business_id=eq.${BUSINESSES_ID}` },
];

async function fetchTable({ table, filter }) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}&select=*`, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${table} (${filter}) → ${res.status} ${body}`);
  }
  return res.json();
}

// ─── Capture also keyed by user_id where business_id columns aren't reliable.
// strategy_data historically filters by user_id (no business_id index); both
// keys are tried so we don't miss rows under either convention.
const FALLBACK_BY_USER = [
  { label: 'strategy_data_by_user',  table: 'strategy_data',  filter: `user_id=eq.${USER_ID}` },
  { label: 'plan_snapshots_by_user', table: 'plan_snapshots', filter: `user_id=eq.${USER_ID}` },
  { label: 'business_financial_goals_by_user', table: 'business_financial_goals', filter: `user_id=eq.${USER_ID}` },
];

console.log('=== Phase 68 Plan 01 — Armstrong snapshot ===');
console.log(`URL: ${URL}`);
console.log(`Tenant: businesses.id=${BUSINESSES_ID}`);
console.log(`        business_profiles.id=${BUSINESS_PROFILES_ID}`);
console.log('');

const result = {};
for (const spec of TABLES) {
  const rows = await fetchTable(spec);
  result[spec.label] = rows;
  console.log(`  ${spec.label.padEnd(30)} ${String(rows.length).padStart(4)} rows`);
}

console.log('');
console.log('Fallback queries (by user_id):');
for (const spec of FALLBACK_BY_USER) {
  const rows = await fetchTable(spec);
  result[spec.label] = rows;
  console.log(`  ${spec.label.padEnd(30)} ${String(rows.length).padStart(4)} rows`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = `scripts/snapshots/68-armstrong-pre-write-${stamp}.json`;

mkdirSync('scripts/snapshots', { recursive: true });
if (existsSync(outPath)) {
  throw new Error('Snapshot file already exists: ' + outPath);
}

const payload = {
  capturedAt: new Date().toISOString(),
  phase: 68,
  plan: '01',
  purpose: 'Pre-write snapshot of Armstrong tenant before Phase 68 Workstream A writes',
  tenant: {
    businesses_id: BUSINESSES_ID,
    business_profiles_id: BUSINESS_PROFILES_ID,
    user_id: USER_ID,
    swot_analyses_id: SWOT_ANALYSES_ID,
  },
  tables: result,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2));

const totalRows = Object.values(result).reduce((s, r) => s + r.length, 0);
console.log('');
console.log(`✓ Snapshot written: ${outPath}`);
console.log(`  Total rows captured: ${totalRows}`);
console.log(`  Tables: ${Object.keys(result).length}`);
