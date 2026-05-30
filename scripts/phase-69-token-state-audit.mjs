#!/usr/bin/env node
/**
 * Phase 69-01 — Read-only Xero token state audit.
 *
 * Purpose: Snapshot the live state of `xero_connections` rows for the 5
 * known-expired tenants identified in the Phase 70 audit (Envisage, JDS,
 * IICT × 3), to map evidence against the 7 hypotheses in 69-CONTEXT.md.
 *
 * READ-ONLY. No inserts/updates/deletes.
 *
 * Reusable: re-run after any cron-related deploy to verify expires_at /
 * updated_at advance on the next tick.
 *
 * Env: SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_KEY (legacy).
 *
 * Run: node scripts/phase-69-token-state-audit.mjs
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// 5 known-expired tenants from Phase 70 audit + 69-CONTEXT.md.
const TARGETS = [
  { label: 'Envisage',     business_id: '8c8c63b2-bdc4-4115-9375-8d0fd89acc00' },
  { label: 'Just Digital', business_id: 'fea253dd-3dfa-447b-8f9b-8dff68aeac0a' },
  { label: 'IICT',         business_id: 'fbc6dffd-677d-47ec-8277-7157982938e7' },
];

function sec(t) { console.log('\n' + '═'.repeat(78) + '\n' + t + '\n' + '═'.repeat(78)); }

function ageMinutes(iso) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}
function pretty(min) {
  if (min === null) return '—';
  if (min < 0) return `in ${Math.abs(min)}m`;
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function inspect(c) {
  sec(`${c.label}   businesses.id=${c.business_id}`);

  // Pull ALL columns so we don't miss any token-state hint.
  const { data: rows, error } = await sb
    .from('xero_connections')
    .select('*')
    .eq('business_id', c.business_id)
    .order('tenant_name', { ascending: true });

  if (error) {
    console.log(`ERR ${error.message}`);
    return;
  }
  if (!rows || rows.length === 0) {
    console.log('No xero_connections rows for this business_id.');
    return;
  }

  for (const r of rows) {
    console.log(`\n  Tenant: ${r.tenant_name}   (tenant_id=${r.tenant_id})`);
    console.log(`    id                       : ${r.id}`);
    console.log(`    is_active                : ${r.is_active}`);
    console.log(`    functional_currency      : ${r.functional_currency ?? '—'}`);
    console.log(`    include_in_consolidation : ${r.include_in_consolidation ?? '—'}`);
    console.log(`    expires_at               : ${r.expires_at}    (${pretty(ageMinutes(r.expires_at))})`);
    console.log(`    updated_at               : ${r.updated_at}    (${pretty(ageMinutes(r.updated_at))})`);
    console.log(`    last_synced_at           : ${r.last_synced_at ?? '—'}    (${pretty(ageMinutes(r.last_synced_at))})`);
    console.log(`    token_refreshing_at      : ${r.token_refreshing_at ?? 'null'}    (${pretty(ageMinutes(r.token_refreshing_at))})`);
    console.log(`    created_at               : ${r.created_at}    (${pretty(ageMinutes(r.created_at))})`);
    console.log(`    access_token (len)       : ${(r.access_token ?? '').length}`);
    console.log(`    refresh_token (len)      : ${(r.refresh_token ?? '').length}`);
    // Any error/status columns? Print every key we don't already cover.
    const known = new Set([
      'id', 'business_id', 'user_id', 'tenant_id', 'tenant_name', 'display_name',
      'access_token', 'refresh_token', 'expires_at', 'is_active', 'updated_at',
      'last_synced_at', 'token_refreshing_at', 'created_at', 'functional_currency',
      'include_in_consolidation', 'display_order',
    ]);
    const extra = Object.keys(r).filter(k => !known.has(k));
    if (extra.length) {
      console.log(`    extra columns            :`);
      for (const k of extra) {
        console.log(`      ${k} = ${JSON.stringify(r[k])}`);
      }
    }
  }
}

async function aggregate() {
  sec('AGGREGATE — all active xero_connections (for cron-firing inference)');
  const { data: rows, error } = await sb
    .from('xero_connections')
    .select('id, business_id, tenant_name, is_active, expires_at, updated_at, token_refreshing_at, last_synced_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) { console.log('ERR', error.message); return; }
  console.log(`total active rows: ${rows.length}`);

  // Group by updated_at age bucket.
  const buckets = { '<6h': 0, '6-12h': 0, '12-24h': 0, '1-3d': 0, '3-7d': 0, '>7d': 0, 'null': 0 };
  for (const r of rows) {
    const a = ageMinutes(r.updated_at);
    if (a === null) buckets['null']++;
    else if (a < 360) buckets['<6h']++;
    else if (a < 720) buckets['6-12h']++;
    else if (a < 1440) buckets['12-24h']++;
    else if (a < 4320) buckets['1-3d']++;
    else if (a < 10080) buckets['3-7d']++;
    else buckets['>7d']++;
  }
  console.log('\nupdated_at age distribution (cron is "0 */6 * * *" = every 6h):');
  for (const k of Object.keys(buckets)) {
    console.log(`  ${k.padEnd(8)}: ${buckets[k]}`);
  }

  // Stuck locks?
  const stuck = rows.filter(r => {
    if (!r.token_refreshing_at) return false;
    return Date.now() - new Date(r.token_refreshing_at).getTime() > 30_000;
  });
  console.log(`\nstuck refresh locks (>30s old): ${stuck.length}`);
  for (const s of stuck.slice(0, 10)) {
    console.log(`  • ${s.tenant_name}   lock_age=${pretty(ageMinutes(s.token_refreshing_at))}   updated_at=${pretty(ageMinutes(s.updated_at))}`);
  }

  // Most-recent updated_at across the whole table — if this is days old,
  // cron is structurally not firing.
  const mostRecent = rows[0];
  if (mostRecent) {
    console.log(`\nmost-recent updated_at across ALL active rows: ${mostRecent.updated_at}  (${pretty(ageMinutes(mostRecent.updated_at))})`);
    console.log(`  tenant: ${mostRecent.tenant_name}`);
  }
}

(async () => {
  console.log('Phase 69-01 — Xero token state audit');
  console.log('Now: ' + new Date().toISOString());
  for (const c of TARGETS) await inspect(c);
  await aggregate();
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
