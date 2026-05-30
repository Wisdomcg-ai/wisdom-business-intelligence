#!/usr/bin/env node
/**
 * Phase 70 Plan 01 — Pre-write rollback baseline snapshot.
 *
 * READ-ONLY by design. No --apply flag. No write paths to Supabase. The ONLY
 * side effect is writing one JSON file to disk under
 * .planning/phases/70-.../snapshots/70-pre-write-<ISO-timestamp>.json.
 *
 * Purpose: Capture the current state of every table that Phase 70 plans 70-02
 * through 70-07 will mutate, BEFORE any --apply runs. If any downstream
 * --apply produces a bad result, this snapshot is the only reliable rollback
 * artifact. Phase 70 has no schema-level audit log — the JSON IS the audit log.
 *
 * Downstream plans 70-02 through 70-07 MUST NOT run their --apply mode until
 * at least one snapshot file exists under the snapshots/ directory.
 *
 * Scope (per 70-CONTEXT.md <decisions> Dual-ID drift block):
 *   Cross-client (ALL production rows, unfiltered):
 *     - businesses                                 (keyed by businesses.id)
 *     - xero_connections                           (keyed by businesses.id)
 *     - subscription_budgets                       (keyed by businesses.id)
 *     - monthly_report_snapshots                   (keyed by businesses.id)
 *     - business_profiles                          (keyed by business_profiles.id)
 *     - financial_forecasts                        (keyed by business_profiles.id)
 *     - forecast_employees                         (keyed by business_profiles.id)
 *     - forecast_payroll_summary                   (keyed by business_profiles.id)
 *     - forecast_pl_lines                          (filtered to active-forecast rows only — full table too large)
 *
 *   Per-client deep snapshot (Envisage + JDS + IICT only), to defend against
 *   dual-ID drift (rows accidentally written under the wrong key convention):
 *     - xero_pl_lines  filtered by BOTH business_id=businesses.id
 *                      AND business_id=business_profiles.id (suffixes:
 *                      _by_businesses_id / _by_profiles_id, same as 68-01).
 *
 * Output: .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/snapshots/70-pre-write-<ISO>.json
 *
 * Idempotency: filename contains an ISO timestamp; re-runs produce a NEW file
 * and refuse to overwrite an existing one. Re-running with no DB changes
 * produces a content-identical file (excluding capturedAt).
 *
 * Run:  node scripts/70-01-snapshot-pre-write.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY was disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// Production client IDs (verified against scripts/phase-70-data-audit.mjs lines 33-37).
const CLIENTS = [
  { label: 'Envisage',     business_id: '8c8c63b2-bdc4-4115-9375-8d0fd89acc00', business_profile_id: 'fa0a80e8-e58e-40aa-b34a-8db667d4b221' },
  { label: 'Just Digital', business_id: 'fea253dd-3dfa-447b-8f9b-8dff68aeac0a', business_profile_id: '900aa935-ae8c-4913-baf7-169260fa19ef' },
  { label: 'IICT',         business_id: 'fbc6dffd-677d-47ec-8277-7157982938e7', business_profile_id: '6c0dfadb-4229-4fc2-89eb-ec064d24511b' },
];

// Cross-client unfiltered tables. Snapshot ALL rows so we have a complete
// rollback baseline regardless of which business the downstream --apply touches.
const CROSS_CLIENT_TABLES = [
  { label: 'businesses',                 table: 'businesses' },
  { label: 'business_profiles',          table: 'business_profiles' },
  { label: 'xero_connections',           table: 'xero_connections' },
  { label: 'subscription_budgets',       table: 'subscription_budgets' },
  { label: 'monthly_report_snapshots',   table: 'monthly_report_snapshots' },
  { label: 'financial_forecasts',        table: 'financial_forecasts' },
  { label: 'forecast_employees',         table: 'forecast_employees' },
  { label: 'forecast_payroll_summary',   table: 'forecast_payroll_summary' },
];

async function fetchAll(table, filterClause = '') {
  // Paginate via PostgREST Range header to bypass the default 1000-row cap.
  const pageSize = 1000;
  const out = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const q = filterClause ? `?${filterClause}&select=*` : `?select=*`;
    const res = await fetch(`${URL}/rest/v1/${table}${q}`, {
      headers: { ...HEADERS, Range: `${from}-${to}`, Prefer: 'count=exact' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${table} (${filterClause || 'no filter'}) [${from}-${to}] → ${res.status} ${body}`);
    }
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchActiveForecastIds() {
  const active = await fetchAll('financial_forecasts', 'is_active=eq.true');
  return active.map((f) => f.id).filter(Boolean);
}

async function fetchForecastPlLinesForIds(forecastIds) {
  if (forecastIds.length === 0) return [];
  // Batch into chunks of 100 so the in.() filter URL stays under PostgREST/HTTP limits.
  const chunkSize = 100;
  const out = [];
  for (let i = 0; i < forecastIds.length; i += chunkSize) {
    const chunk = forecastIds.slice(i, i + chunkSize);
    const inList = chunk.join(',');
    const rows = await fetchAll('forecast_pl_lines', `forecast_id=in.(${inList})`);
    out.push(...rows);
  }
  return out;
}

console.log('=== Phase 70 Plan 01 — Pre-write rollback snapshot ===');
console.log(`URL: ${URL}`);
console.log(`Started: ${new Date().toISOString()}`);
console.log('');
console.log('Cross-client scope: ALL production rows for 8 mutable tables (no business_id filter)');
console.log('Per-client deep scope: Envisage + JDS + IICT, xero_pl_lines under BOTH key conventions');
console.log('');

const tables = {};

// ── (a) Cross-client unfiltered snapshots ─────────────────────────────────────
console.log('── Cross-client snapshots (all production rows) ─────────────────');
for (const spec of CROSS_CLIENT_TABLES) {
  const rows = await fetchAll(spec.table);
  tables[spec.label] = rows;
  console.log(`  ${spec.label.padEnd(40)} ${String(rows.length).padStart(6)} rows`);
}

// ── (b) forecast_pl_lines — filtered to active forecasts only ────────────────
console.log('');
console.log('── forecast_pl_lines (active forecasts only) ────────────────────');
const activeForecastIds = await fetchActiveForecastIds();
console.log(`  active forecast ids: ${activeForecastIds.length}`);
const forecastPlLines = await fetchForecastPlLinesForIds(activeForecastIds);
tables['forecast_pl_lines_active'] = forecastPlLines;
console.log(`  ${'forecast_pl_lines_active'.padEnd(40)} ${String(forecastPlLines.length).padStart(6)} rows`);

// ── (c) Per-client dual-ID drift defence on xero_pl_lines ────────────────────
console.log('');
console.log('── Per-client dual-ID drift defence (xero_pl_lines) ─────────────');
for (const c of CLIENTS) {
  const byBiz = await fetchAll('xero_pl_lines', `business_id=eq.${c.business_id}`);
  const byProfile = await fetchAll('xero_pl_lines', `business_id=eq.${c.business_profile_id}`);
  const labelBiz = `xero_pl_lines_${c.label.replace(/\s+/g, '_')}_by_businesses_id`;
  const labelProfile = `xero_pl_lines_${c.label.replace(/\s+/g, '_')}_by_profiles_id`;
  tables[labelBiz] = byBiz;
  tables[labelProfile] = byProfile;
  console.log(`  ${labelBiz.padEnd(50)} ${String(byBiz.length).padStart(6)} rows`);
  console.log(`  ${labelProfile.padEnd(50)} ${String(byProfile.length).padStart(6)} rows`);
}

// ── Write the rollback artifact ──────────────────────────────────────────────
const phaseDir = '.planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients';
const snapshotsDir = `${phaseDir}/snapshots`;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = `${snapshotsDir}/70-pre-write-${stamp}.json`;

mkdirSync(snapshotsDir, { recursive: true });
if (existsSync(outPath)) {
  throw new Error(`Snapshot file already exists (refusing to overwrite): ${outPath}`);
}

const payload = {
  capturedAt: new Date().toISOString(),
  phase: 70,
  plan: '01',
  purpose: 'Pre-write snapshot before Phase 70 cross-client + per-client backfills (70-02..70-07). This file is the only audit log for the phase; downstream --apply runs MUST NOT proceed without at least one snapshot existing.',
  clients: CLIENTS,
  activeForecastIds,
  tables,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2));

const totalRows = Object.values(tables).reduce((s, r) => s + r.length, 0);
console.log('');
console.log(`Snapshot written: ${outPath}`);
console.log(`Total rows captured: ${totalRows}`);
console.log(`Table labels: ${Object.keys(tables).length}`);
console.log(`Finished: ${new Date().toISOString()}`);
