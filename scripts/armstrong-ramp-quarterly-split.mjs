#!/usr/bin/env node
/**
 * One-off: Replace Armstrong's even quarterly_targets split with a ramp-aware
 * distribution, reflecting construction seasonality + new-job phasing.
 *
 * Single-tenant scope. Idempotent. Dry-run by default.
 *
 *   businesses.id        = a0bf1b0a-663e-4636-8c0d-eef62972dcbc
 *   business_profiles.id = 678ae542-7f0b-43d1-8784-e7341767c250
 *
 * Touched: business_financial_goals.quarterly_targets (JSONB)
 *   Keys updated: revenue.q1..q4, grossProfit.q1..q4, netProfit.q1..q4
 *   Other keys (grossMargin, netMargin, kpi_*, period_notes, etc.) are PRESERVED.
 *
 *   Annual targets (revenue Y1 $7.5M, GP $1.5M @ 20%, NP $750k @ 10%) are unchanged.
 *
 * Run:
 *   node scripts/armstrong-ramp-quarterly-split.mjs           # dry-run (prints payload + diff)
 *   node scripts/armstrong-ramp-quarterly-split.mjs --apply   # writes to prod
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');
const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';

// Ramp-aware split (reasoned in chat 2026-05-29):
//   Q1 Jul-Sep 2026 — winter + ramp-up + closing Marrickville + Nelson Bay   18.7%
//   Q2 Oct-Dec 2026 — momentum builds, new wins phasing in                   25.3%
//   Q3 Jan-Mar 2027 — peak AU construction season                            29.3%
//   Q4 Apr-Jun 2027 — year-end push, closing projects                        26.7%
const RAMP = {
  revenue:     { q1: '1400000', q2: '1900000', q3: '2200000', q4: '2000000' },
  grossProfit: { q1: '280000',  q2: '380000',  q3: '440000',  q4: '400000'  },
  netProfit:   { q1: '140000',  q2: '190000',  q3: '220000',  q4: '200000'  },
};

// Sanity: target annuals
const EXPECTED_ANNUAL = { revenue: 7500000, grossProfit: 1500000, netProfit: 750000 };

async function rest(method, path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = txt; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// Sanity: ramp values sum to expected annual
for (const k of Object.keys(EXPECTED_ANNUAL)) {
  const sum = ['q1','q2','q3','q4'].reduce((s, q) => s + parseInt(RAMP[k][q], 10), 0);
  if (sum !== EXPECTED_ANNUAL[k]) {
    throw new Error(`Ramp ${k} sums to ${sum}, expected ${EXPECTED_ANNUAL[k]}`);
  }
}

// 1. Read current row
const rows = await rest(
  'GET',
  `business_financial_goals?business_id=eq.${BUSINESS_PROFILES_ID}&select=id,revenue_year1,gross_profit_year1,net_profit_year1,quarterly_targets`,
);
if (!rows.length) throw new Error('No business_financial_goals row found for Armstrong');
const row = rows[0];

// Confirm annual targets still match (refuse to write if Matt changed them)
if (row.revenue_year1 !== EXPECTED_ANNUAL.revenue) {
  throw new Error(`Y1 revenue is ${row.revenue_year1}, expected ${EXPECTED_ANNUAL.revenue} — annual target changed; abort.`);
}
if (row.gross_profit_year1 !== EXPECTED_ANNUAL.grossProfit) {
  throw new Error(`Y1 GP is ${row.gross_profit_year1}, expected ${EXPECTED_ANNUAL.grossProfit} — annual target changed; abort.`);
}
if (row.net_profit_year1 !== EXPECTED_ANNUAL.netProfit) {
  throw new Error(`Y1 NP is ${row.net_profit_year1}, expected ${EXPECTED_ANNUAL.netProfit} — annual target changed; abort.`);
}

// 2. Compose new quarterly_targets (preserve all non-touched keys)
const currentQT = row.quarterly_targets || {};
const newQT = {
  ...currentQT,
  revenue:     { ...(currentQT.revenue     || {}), ...RAMP.revenue     },
  grossProfit: { ...(currentQT.grossProfit || {}), ...RAMP.grossProfit },
  netProfit:   { ...(currentQT.netProfit   || {}), ...RAMP.netProfit   },
};

// 3. Print diff
const fmt = (n) => '$' + Number(n).toLocaleString();
console.log('=== Ramp-aware quarterly split for Armstrong ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('business_financial_goals.id:', row.id);
console.log('Y1 annuals (unchanged):', `revenue=${fmt(row.revenue_year1)} GP=${fmt(row.gross_profit_year1)} NP=${fmt(row.net_profit_year1)}\n`);

console.log('Diff per metric × quarter:');
for (const k of ['revenue', 'grossProfit', 'netProfit']) {
  console.log(`\n  ${k}:`);
  for (const q of ['q1','q2','q3','q4']) {
    const oldV = currentQT[k]?.[q] ?? '(unset)';
    const newV = RAMP[k][q];
    const oldNum = oldV === '(unset)' ? 0 : parseInt(oldV, 10);
    const delta = parseInt(newV, 10) - oldNum;
    const sign = delta > 0 ? '+' : '';
    console.log(`    ${q}: ${String(oldV).padStart(10)} → ${String(newV).padStart(10)}  (${sign}${fmt(delta)})`);
  }
}

console.log('\nPreserved keys (NOT touched):', Object.keys(currentQT).filter(k => !['revenue','grossProfit','netProfit'].includes(k)).join(', ') || '(none)');

// 4. Write if --apply
if (!APPLY) {
  console.log('\n\x1b[33mDry-run complete. Re-run with --apply to write.\x1b[0m');
  process.exit(0);
}

const updated = await rest(
  'PATCH',
  `business_financial_goals?id=eq.${row.id}`,
  { quarterly_targets: newQT, updated_at: new Date().toISOString() },
);

console.log('\n\x1b[32m✓ Wrote new quarterly_targets to row', updated[0].id, '\x1b[0m');
console.log('updated_at:', updated[0].updated_at);
console.log('\nReview in the wizard at /goals (Step 4) — you should see the ramp values per quarter.');
