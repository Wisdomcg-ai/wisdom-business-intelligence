#!/usr/bin/env node
/**
 * Phase 70 Plan 07 — B3: IICT onboarding completion (interactive, 5 steps).
 *
 * IICT is essentially un-onboarded per the Phase 70 audit:
 *   1. business_profiles missing industry, annual_revenue, gross_profit, net_profit (+ derived margins)
 *   2. businesses.consolidation_budget_mode = 'single' despite 3 Xero tenants (AU + AU + HK)
 *   3. zero subscription_budgets rows
 *   4. (likely) duplicate FY27 forecast row — verified 70-02 may have already resolved
 *   5. zero monthly_report_snapshots ever generated
 *
 * This script provides --step=N (1..5) flags so Matt can run each step
 * independently in sequence, reviewing each step's effect before proceeding.
 * Each step is idempotent — re-running a completed step is a no-op.
 *
 * SCOPE — IICT ONLY. Every query is hardcoded to IICT_BUSINESSES_ID or
 * IICT_PROFILES_ID. Touching any other client requires editing this file.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DEVIATIONS FROM PLAN (auto-applied at build time — Rule 1 fixes)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * D1 — consolidation_budget_mode target value:
 *   The orchestrator prompt + plan say "change 'single' → 'consolidated'".
 *   The DB CHECK constraint (supabase/migrations/20260420195612_consolidation_budget_mode.sql)
 *   and the API VALID_MODES (src/app/api/consolidation/businesses/[id]/route.ts:41) ONLY
 *   allow 'single' | 'per_tenant'. Writing 'consolidated' would violate the constraint.
 *   This script flips IICT to 'per_tenant' (the documented multi-tenant Calxa-style mode).
 *
 * D2 — Step 5 snapshot generation cannot be invoked from a CLI script:
 *   The /api/monthly-report/generate endpoint requires a browser-attached user
 *   session (createRouteHandlerClient + supabase auth.getUser()) and a section-
 *   permission gate keyed to user.id. A service-role mjs script CANNOT obtain
 *   that session. Per plan: "the script does NOT execute these — Matt runs them
 *   from the browser/CLI with his session." Step 5 therefore prints exact UI
 *   instructions + a curl template for advanced use, then verifies the resulting
 *   rows in monthly_report_snapshots when re-invoked with --apply.
 *
 * D3 — Step 1 derived margin field name lock (already correct per CONTEXT.md B3):
 *   Columns are `gross_profit_margin` / `net_profit_margin` (NOT _percentage). Verified
 *   in supabase/migrations/00000000000000_baseline_schema.sql lines 1881-1882.
 *
 * D4 — Step 4 most likely a no-op:
 *   Live state at build time (2026-05-31): IICT has 2 FY27 forecast rows but only
 *   1 with is_active=true. 70-02 (or a coach hand-run) appears to have already
 *   deduped. Step 4 detects this and exits 0 cleanly.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/70-07-B3-iict-onboarding-completion.mjs                    # usage
 *   node scripts/70-07-B3-iict-onboarding-completion.mjs --step=1           # dry-run step 1
 *   node scripts/70-07-B3-iict-onboarding-completion.mjs --step=1 --apply   # write step 1
 *   ... (same pattern for steps 2, 3, 4, 5)
 *
 * After each step:
 *   node scripts/phase-70-data-audit.mjs   # verify the IICT section flipped on that dimension
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY was disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
}

// ── Locked IICT IDs (from 70-CONTEXT.md decisions B3) ─────────────────────────
const IICT_BUSINESSES_ID = 'fbc6dffd-677d-47ec-8277-7157982938e7';
const IICT_PROFILES_ID   = '6c0dfadb-4229-4fc2-89eb-ec064d24511b';

// ── CLI flags ─────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const STEP_ARG = process.argv.find((a) => a.startsWith('--step='));
const STEP = STEP_ARG ? parseInt(STEP_ARG.split('=')[1], 10) : null;

// ── HTTP helpers (mirror 70-02-A1 patterns) ───────────────────────────────────
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiHeadCount(table, filter) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`HEAD ${table}?${filter} → ${res.status} ${await res.text()}`);
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function apiPatch(table, filter, body) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}?${filter} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiInsert(table, body) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Logging helpers ──────────────────────────────────────────────────────────
const C = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function banner() {
  console.log('═'.repeat(78));
  console.log(C.bold('Phase 70 Plan 07 — B3: IICT Onboarding Completion'));
  console.log('═'.repeat(78));
  console.log(`businesses.id        = ${IICT_BUSINESSES_ID}`);
  console.log(`business_profiles.id = ${IICT_PROFILES_ID}`);
  console.log(`Mode: ${APPLY ? C.red(C.bold('APPLY (writes commit to production)')) : C.yellow(C.bold('DRY RUN (preview only)'))}`);
  console.log(`Step: ${STEP ?? '(none — printing usage)'}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
}

function usage() {
  console.log(C.bold('USAGE'));
  console.log('');
  console.log('  node scripts/70-07-B3-iict-onboarding-completion.mjs --step=N [--apply]');
  console.log('');
  console.log(C.bold('STEPS'));
  console.log('');
  console.log('  --step=1   business_profiles fill-out (INTERACTIVE — Matt enters values for industry,');
  console.log('             annual_revenue, gross_profit, net_profit; script derives gross_profit_margin,');
  console.log('             net_profit_margin, current_revenue).');
  console.log('');
  console.log('  --step=2   businesses.consolidation_budget_mode flip from \'single\' → \'per_tenant\'');
  console.log('             (DETERMINISTIC; requires >1 xero_connection row — verified 3 tenants exist).');
  console.log(C.yellow('             NOTE: target value is \'per_tenant\' not \'consolidated\' — see D1 in file header.'));
  console.log('');
  console.log('  --step=3   subscription_budgets entry (INTERACTIVE — vendor name, frequency, amount,');
  console.log('             renewal_month, account_codes; loops until Matt types \'done\').');
  console.log('             Aborts if existing rows present (avoid accidental duplicates).');
  console.log('');
  console.log('  --step=4   FY27 forecast dedupe (CONDITIONAL; canonical-selection rule from 70-02).');
  console.log('             Likely no-op — IICT already has 1 active FY27 forecast per live state at build.');
  console.log('');
  console.log('  --step=5   Baseline monthly_report_snapshots for 2026-04 and 2026-05.');
  console.log(C.yellow('             MANUAL STEP — script prints UI instructions + curl template; Matt drives'));
  console.log(C.yellow('             from browser. --apply mode verifies the rows exist post-generation.'));
  console.log('');
  console.log('  After each step:  node scripts/phase-70-data-audit.mjs   # confirm IICT dimension passed');
  console.log('');
}

if (STEP == null) {
  banner();
  usage();
  process.exit(0);
}

if (![1, 2, 3, 4, 5].includes(STEP)) {
  banner();
  console.error(C.red(`✗ Invalid --step=${STEP}. Must be 1..5.`));
  usage();
  process.exit(2);
}

banner();

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — business_profiles fill-out (INTERACTIVE)
// ─────────────────────────────────────────────────────────────────────────────
async function runStep1() {
  console.log(C.cyan(C.bold('STEP 1 — business_profiles fill-out')));
  console.log('');

  const profile = await apiGet(`business_profiles?id=eq.${IICT_PROFILES_ID}&select=*`).then((rows) => rows[0]);
  if (!profile) {
    throw new Error(`business_profiles row id=${IICT_PROFILES_ID} not found`);
  }
  console.log('Current profile (relevant fields):');
  console.log(`  industry              = ${JSON.stringify(profile.industry)}`);
  console.log(`  annual_revenue        = ${JSON.stringify(profile.annual_revenue)}`);
  console.log(`  gross_profit          = ${JSON.stringify(profile.gross_profit)}`);
  console.log(`  net_profit            = ${JSON.stringify(profile.net_profit)}`);
  console.log(`  gross_profit_margin   = ${JSON.stringify(profile.gross_profit_margin)}`);
  console.log(`  net_profit_margin     = ${JSON.stringify(profile.net_profit_margin)}`);
  console.log(`  current_revenue       = ${JSON.stringify(profile.current_revenue)}`);
  console.log(`  profile_completed     = ${JSON.stringify(profile.profile_completed)}`);
  console.log(`  fiscal_year_start     = ${JSON.stringify(profile.fiscal_year_start)}`);
  console.log('');

  // Idempotency check — all 4 user-entered fields populated
  const required = ['industry', 'annual_revenue', 'gross_profit', 'net_profit'];
  const missing = required.filter((k) => profile[k] == null || profile[k] === '');
  if (missing.length === 0) {
    console.log(C.green('✓ All required fields already populated. Nothing to do (idempotent).'));
    process.exit(0);
  }
  console.log(C.yellow(`Missing fields to fill: ${missing.join(', ')}`));
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  const answers = {};

  // Field prompts (suggestions per IICT context: AU+HK group, business services / IT consulting)
  for (const field of missing) {
    if (field === 'industry') {
      const hint = '(suggested: "Information Technology / IT Consulting" — IICT = "Integrated Information Centre for Telecommunications"; defer to Matt)';
      // eslint-disable-next-line no-await-in-loop
      const ans = (await rl.question(`IICT — ${field} (current: NULL) ${hint}\n  enter value (or 'skip'): `)).trim();
      if (ans === '' || ans.toLowerCase() === 'skip') {
        console.log(C.yellow(`  → ${field} skipped`));
        continue;
      }
      answers[field] = ans;
    } else {
      // numeric field
      let value = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const ans = (await rl.question(`IICT — ${field} (current: NULL) — enter numeric value (or 'skip'): `)).trim();
        if (ans === '' || ans.toLowerCase() === 'skip') {
          console.log(C.yellow(`  → ${field} skipped`));
          value = null;
          break;
        }
        // accept "$1,234,567" / "1234567" / "1.23M"
        const cleaned = ans.replace(/[,$_\s]/g, '');
        const num = Number(cleaned);
        if (!Number.isFinite(num) || num <= 0) {
          console.log(C.red(`  ✗ invalid number "${ans}" — must be a positive number. Try again.`));
          continue;
        }
        value = num;
        break;
      }
      if (value != null) answers[field] = value;
    }
  }
  rl.close();

  // Derived fields — only computable if revenue + profits all provided
  const revenue = answers.annual_revenue ?? profile.annual_revenue;
  const gp = answers.gross_profit ?? profile.gross_profit;
  const np = answers.net_profit ?? profile.net_profit;

  const derived = {};
  if (revenue != null && gp != null && revenue > 0) {
    derived.gross_profit_margin = Math.round((gp / revenue) * 1000) / 10;
  }
  if (revenue != null && np != null && revenue > 0) {
    derived.net_profit_margin = Math.round((np / revenue) * 1000) / 10;
  }
  if (revenue != null) {
    derived.current_revenue = revenue;
  }

  const updatePayload = {
    ...answers,
    ...derived,
    profile_completed: true,
    profile_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log('');
  console.log(C.bold('Proposed UPDATE business_profiles SET ...'));
  console.log(`  WHERE id = ${IICT_PROFILES_ID}`);
  console.log('  payload:');
  for (const [k, v] of Object.entries(updatePayload)) {
    console.log(`    ${k} = ${JSON.stringify(v)}`);
  }
  console.log('');

  if (!APPLY) {
    console.log(C.yellow('DRY RUN — re-run with --apply to commit this UPDATE.'));
    process.exit(0);
  }

  if (Object.keys(answers).length === 0) {
    console.log(C.yellow('No values entered — nothing to write. Exiting clean.'));
    process.exit(0);
  }

  console.log(C.red('APPLYING — writing to production business_profiles...'));
  const result = await apiPatch('business_profiles', `id=eq.${IICT_PROFILES_ID}`, updatePayload);
  console.log(C.green(`✓ UPDATE succeeded — ${result.length} row(s) modified.`));
  console.log('');
  console.log(C.dim('Next: node scripts/phase-70-data-audit.mjs   # confirm industry/revenue/profit no longer NULL'));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — consolidation_budget_mode flip (DETERMINISTIC)
// ─────────────────────────────────────────────────────────────────────────────
async function runStep2() {
  console.log(C.cyan(C.bold('STEP 2 — businesses.consolidation_budget_mode flip')));
  console.log('');

  const biz = await apiGet(`businesses?id=eq.${IICT_BUSINESSES_ID}&select=id,name,consolidation_budget_mode,status`).then((rows) => rows[0]);
  if (!biz) throw new Error(`businesses row id=${IICT_BUSINESSES_ID} not found`);
  console.log(`Current state: name="${biz.name}" status=${biz.status} consolidation_budget_mode=${C.bold(biz.consolidation_budget_mode)}`);
  console.log('');

  // Note: 'consolidated' is NOT a valid value — CHECK constraint allows 'single' | 'per_tenant'.
  // See file-header D1 — orchestrator prompt said 'consolidated', we use 'per_tenant'.
  const TARGET = 'per_tenant';

  if (biz.consolidation_budget_mode === TARGET) {
    console.log(C.green(`✓ Already '${TARGET}'. Nothing to do (idempotent).`));
    process.exit(0);
  }

  // Sanity check — refuse to flip per_tenant if only 1 connection exists
  const connections = await apiGet(`xero_connections?business_id=eq.${IICT_BUSINESSES_ID}&select=tenant_id,tenant_name,functional_currency,is_active,include_in_consolidation`);
  const activeIncluded = connections.filter((c) => c.is_active && c.include_in_consolidation);
  console.log(`xero_connections (active + included in consolidation): ${activeIncluded.length}`);
  for (const c of activeIncluded) {
    console.log(`  • ${c.tenant_name} (${c.functional_currency})`);
  }
  console.log('');

  if (activeIncluded.length <= 1) {
    console.error(C.red(`✗ Refusing to flip to '${TARGET}' — only ${activeIncluded.length} active+included connection(s). Aborting.`));
    process.exit(1);
  }

  console.log(C.bold(`Proposed: UPDATE businesses SET consolidation_budget_mode = '${TARGET}' WHERE id = ${IICT_BUSINESSES_ID}`));
  console.log('');

  if (!APPLY) {
    console.log(C.yellow('DRY RUN — re-run with --apply to commit this UPDATE.'));
    process.exit(0);
  }

  console.log(C.red('APPLYING...'));
  const result = await apiPatch('businesses', `id=eq.${IICT_BUSINESSES_ID}`, {
    consolidation_budget_mode: TARGET,
    updated_at: new Date().toISOString(),
  });
  console.log(C.green(`✓ UPDATE succeeded — consolidation_budget_mode = '${result[0]?.consolidation_budget_mode}'.`));
  console.log('');
  console.log(C.dim('Next: node scripts/phase-70-data-audit.mjs   # confirm IICT shows consolidation_budget_mode=per_tenant'));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — subscription_budgets initial entry (INTERACTIVE)
// ─────────────────────────────────────────────────────────────────────────────
async function runStep3() {
  console.log(C.cyan(C.bold('STEP 3 — subscription_budgets initial entry')));
  console.log('');

  const existingCount = await apiHeadCount('subscription_budgets', `business_id=eq.${IICT_BUSINESSES_ID}`);
  console.log(`Current subscription_budgets count for IICT: ${existingCount}`);
  if (existingCount > 0) {
    console.error(C.red(`✗ Refusing to insert — ${existingCount} row(s) already exist. Review manually before re-running.`));
    process.exit(1);
  }

  // Need a user_id to associate with rows? Schema (baseline) doesn't require user_id on subscription_budgets.
  // Frequency CHECK: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc'.
  const VALID_FREQ = ['monthly', 'quarterly', 'annual', 'ad-hoc'];

  // Use vendor-normalization helper via lightweight inline copy (mirrors src/lib/utils/vendor-normalization.ts createVendorKey).
  // Direct import would require TS compilation — script is .mjs/JS-only. The function is 1 line.
  const createVendorKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

  const rl = createInterface({ input: stdin, output: stdout });
  const collected = [];

  console.log('');
  console.log(C.bold('Interactive entry loop — type \'done\' as vendor name to finish.'));
  console.log('');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const vendor = (await rl.question('Vendor name (or \'done\'): ')).trim();
    if (vendor === '' || vendor.toLowerCase() === 'done') break;

    let frequency;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const f = (await rl.question(`  Frequency (${VALID_FREQ.join(' | ')}): `)).trim().toLowerCase();
      if (VALID_FREQ.includes(f)) { frequency = f; break; }
      console.log(C.red(`    ✗ invalid — must be one of: ${VALID_FREQ.join(', ')}`));
    }

    let monthly_budget;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const a = (await rl.question('  Monthly $ budget (for annual: enter the monthly-equivalent — annual_budget is auto-derived as monthly×12): ')).trim();
      const cleaned = a.replace(/[,$_\s]/g, '');
      const num = Number(cleaned);
      if (Number.isFinite(num) && num >= 0) { monthly_budget = num; break; }
      console.log(C.red('    ✗ invalid number — try again'));
    }

    let renewal_month = null;
    if (frequency === 'annual') {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const r = (await rl.question('  Renewal month (1-12, or \'skip\'): ')).trim();
        if (r.toLowerCase() === 'skip' || r === '') break;
        const n = parseInt(r, 10);
        if (Number.isInteger(n) && n >= 1 && n <= 12) { renewal_month = n; break; }
        console.log(C.red('    ✗ invalid — must be integer 1..12 or \'skip\''));
      }
    }

    // eslint-disable-next-line no-await-in-loop
    const codesRaw = (await rl.question('  Account codes (comma-separated Xero codes, or \'skip\'): ')).trim();
    let account_codes = [];
    if (codesRaw !== '' && codesRaw.toLowerCase() !== 'skip') {
      account_codes = codesRaw.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const vendor_key = createVendorKey(vendor);
    // Vendor-key sanity warning
    if (vendor_key.length < 3) {
      console.log(C.yellow(`    ⚠ vendor_key="${vendor_key}" is short — verify vendor name normalizes cleanly for downstream subscription-detail matching.`));
    }

    const row = {
      business_id: IICT_BUSINESSES_ID,
      vendor_name: vendor,
      vendor_key,
      frequency,
      monthly_budget,
      // annual_budget is GENERATED ALWAYS — do NOT include it
      account_codes,
      is_active: true,
      ...(renewal_month != null ? { renewal_month } : {}),
    };

    console.log('  → planned INSERT:');
    for (const [k, v] of Object.entries(row)) console.log(`      ${k} = ${JSON.stringify(v)}`);
    collected.push(row);
    console.log('');
  }
  rl.close();

  console.log('');
  console.log('═'.repeat(72));
  console.log(C.bold(`Collected ${collected.length} subscription row(s)`));
  console.log('═'.repeat(72));
  for (const r of collected) {
    console.log(`  • ${r.vendor_name} (${r.frequency}) $${r.monthly_budget}/mo  codes=${JSON.stringify(r.account_codes)}${r.renewal_month != null ? `  renewal_month=${r.renewal_month}` : ''}`);
  }

  if (collected.length === 0) {
    console.log(C.yellow('No rows entered — nothing to write.'));
    process.exit(0);
  }

  if (!APPLY) {
    console.log('');
    console.log(C.yellow('DRY RUN — re-run with --apply to insert these rows.'));
    process.exit(0);
  }

  console.log('');
  console.log(C.red(`APPLYING — inserting ${collected.length} subscription_budgets row(s)...`));
  const inserted = await apiInsert('subscription_budgets', collected);
  console.log(C.green(`✓ INSERT succeeded — ${inserted.length} row(s) created.`));
  console.log('');
  console.log(C.dim('Next: node scripts/phase-70-data-audit.mjs   # confirm IICT subscription_budgets count > 0'));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — FY27 forecast dedupe (CONDITIONAL)
// ─────────────────────────────────────────────────────────────────────────────
async function runStep4() {
  console.log(C.cyan(C.bold('STEP 4 — FY27 forecast dedupe (canonical-selection per 70-02)')));
  console.log('');

  const forecasts = await apiGet(
    `financial_forecasts?business_id=eq.${IICT_PROFILES_ID}&select=id,name,fiscal_year,year_type,forecast_type,version_number,is_active,updated_at,created_at,tenant_id&order=created_at.desc`,
  );
  console.log(`Total IICT financial_forecasts: ${forecasts.length}`);
  for (const f of forecasts) {
    console.log(`  • [${f.is_active ? 'ACTIVE' : '      '}] FY${f.fiscal_year} ${f.year_type} ${f.forecast_type} v${f.version_number}  id=${f.id}  updated=${f.updated_at}  tenant=${f.tenant_id ?? 'consolidated'}`);
  }
  console.log('');

  // Group by (fiscal_year, year_type, forecast_type, tenant_id) among ACTIVE rows
  const activeRows = forecasts.filter((f) => f.is_active);
  const groups = new Map();
  for (const f of activeRows) {
    const key = `FY${f.fiscal_year}|${f.year_type}|${f.forecast_type}|tenant=${f.tenant_id ?? 'null'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const conflicts = [...groups.entries()].filter(([, rows]) => rows.length > 1);

  if (conflicts.length === 0) {
    console.log(C.green(`✓ No conflict groups (every active forecast is unique on (FY, year_type, forecast_type, tenant)). Already deduped — likely by 70-02.`));
    process.exit(0);
  }

  // Per group: select canonical via 70-02's rule
  const allLosers = [];
  for (const [key, rows] of conflicts) {
    console.log(C.yellow(`Group with ${rows.length} active rows: ${key}`));

    // Enrich with pl_line_count + payroll_summary_present
    const enriched = [];
    for (const r of rows) {
      // eslint-disable-next-line no-await-in-loop
      const plCount = await apiHeadCount('forecast_pl_lines', `forecast_id=eq.${r.id}`);
      // eslint-disable-next-line no-await-in-loop
      const payroll = await apiHeadCount('forecast_payroll_summary', `forecast_id=eq.${r.id}`);
      enriched.push({ ...r, pl_line_count: plCount, payroll_summary_present: payroll > 0 ? 1 : 0 });
    }

    enriched.sort((a, b) => {
      const ua = Date.parse(a.updated_at || 0);
      const ub = Date.parse(b.updated_at || 0);
      if (ua !== ub) return ub - ua;
      if (a.pl_line_count !== b.pl_line_count) return b.pl_line_count - a.pl_line_count;
      if (a.payroll_summary_present !== b.payroll_summary_present) return b.payroll_summary_present - a.payroll_summary_present;
      const ca = Date.parse(a.created_at || 0);
      const cb = Date.parse(b.created_at || 0);
      if (ca !== cb) return cb - ca;
      return String(a.id).localeCompare(String(b.id));
    });

    const winner = enriched[0];
    const losers = enriched.slice(1);
    console.log(C.green(`  ✓ WINNER  id=${winner.id}  updated=${winner.updated_at}  pl_lines=${winner.pl_line_count}  payroll_present=${winner.payroll_summary_present}`));
    for (const l of losers) {
      console.log(C.red(`  ✗ LOSER   id=${l.id}  updated=${l.updated_at}  pl_lines=${l.pl_line_count}  payroll_present=${l.payroll_summary_present}`));
      allLosers.push(l);
    }
  }
  console.log('');

  if (!APPLY) {
    console.log(C.yellow(`DRY RUN — re-run with --apply to set is_active=false on ${allLosers.length} loser row(s).`));
    process.exit(0);
  }

  console.log(C.red(`APPLYING — deactivating ${allLosers.length} loser row(s)...`));
  let succeeded = 0;
  for (const l of allLosers) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await apiPatch('financial_forecasts', `id=eq.${l.id}`, {
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      console.log(C.green(`  ✓ deactivated ${l.id}`));
      succeeded++;
    } catch (err) {
      console.log(C.red(`  ✗ FAILED ${l.id}: ${err.message}`));
    }
  }
  console.log('');
  console.log(succeeded === allLosers.length
    ? C.green(`✓ All ${succeeded} loser(s) deactivated cleanly.`)
    : C.red(`✗ MISMATCH: ${succeeded}/${allLosers.length} deactivated.`));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Baseline monthly_report_snapshots (MANUAL via existing flow)
// ─────────────────────────────────────────────────────────────────────────────
async function runStep5() {
  console.log(C.cyan(C.bold('STEP 5 — Baseline monthly_report_snapshots (2026-04 + 2026-05)')));
  console.log('');
  console.log(C.dim('Per CONTEXT.md B3: use the existing report generation flow (do not bypass).'));
  console.log(C.dim('Per file-header D2: a service-role .mjs script CANNOT obtain a user session — Matt drives the UI/curl.'));
  console.log('');

  // Determine fiscal_year for each target month using fiscal_year_start
  const profile = await apiGet(`business_profiles?id=eq.${IICT_PROFILES_ID}&select=fiscal_year_start`).then((rows) => rows[0]);
  const fyStart = profile?.fiscal_year_start ?? 7; // AU default
  console.log(`IICT fiscal_year_start = ${fyStart} (1=Jan..12=Dec; AU is 7 → FY ends June)`);

  function fiscalYearFor(yyyy_mm) {
    const [y, m] = yyyy_mm.split('-').map(Number);
    // Convention used by codebase: fiscal year labeled by the calendar year IT ENDS IN.
    // For AU (start=7), month >= 7 belongs to NEXT FY. e.g. 2026-04 → FY2026 (Jul 2025..Jun 2026).
    if (m >= fyStart) return y + 1;
    return y;
  }

  const TARGETS = [
    { report_month: '2026-04', fiscal_year: fiscalYearFor('2026-04') },
    { report_month: '2026-05', fiscal_year: fiscalYearFor('2026-05') },
  ];

  console.log('');
  console.log('Target snapshots:');
  for (const t of TARGETS) {
    console.log(`  • report_month=${t.report_month}  fiscal_year=${t.fiscal_year}`);
  }
  console.log('');

  // ── (a) Read current snapshot state ──
  const existing = await apiGet(
    `monthly_report_snapshots?business_id=eq.${IICT_BUSINESSES_ID}&select=id,report_month,fiscal_year,status,is_draft,generated_at&order=report_month.desc`,
  );
  console.log(`Current monthly_report_snapshots for IICT: ${existing.length}`);
  for (const s of existing) {
    console.log(`  • report_month=${s.report_month}  fiscal_year=${s.fiscal_year}  status=${s.status}  draft=${s.is_draft}  generated_at=${s.generated_at}`);
  }
  console.log('');

  const have = new Set(existing.map((s) => s.report_month));
  const missing = TARGETS.filter((t) => !have.has(t.report_month));

  if (missing.length === 0) {
    console.log(C.green('✓ All target snapshots already exist. Step 5 complete (idempotent).'));
    process.exit(0);
  }

  console.log(C.yellow(`Missing snapshots: ${missing.map((t) => t.report_month).join(', ')}`));
  console.log('');

  if (!APPLY) {
    // Dry-run: print exactly what Matt must do
    console.log(C.bold('TO GENERATE THE MISSING SNAPSHOTS — Matt drives this manually:'));
    console.log('');
    console.log(C.bold('Option A — UI (RECOMMENDED — uses the same flow the report PDF generator depends on):'));
    console.log('');
    console.log('  1. Open https://wisdombi.ai/finances/monthly-report (logged in as coach/Matt).');
    console.log(`  2. Switch the active business to IICT Group (business_id=${IICT_BUSINESSES_ID}).`);
    for (const t of missing) {
      console.log(`  3. Select report month ${t.report_month}, click "Generate Report", then "Save Snapshot" (FY${t.fiscal_year}).`);
    }
    console.log('  4. Repeat step 3 for each missing month.');
    console.log('');
    console.log(C.bold('Option B — curl (only if UI unavailable; requires Matt\'s session cookie):'));
    console.log('');
    console.log(C.dim('  # 1. Open https://wisdombi.ai in your browser, log in, then DevTools → Application → Cookies → copy `sb-*-auth-token`.'));
    console.log(C.dim('  # 2. Use it like so (curl will POST /api/monthly-report/generate THEN POST /api/monthly-report/snapshot):'));
    console.log('');
    for (const t of missing) {
      console.log(`  curl -X POST 'https://wisdombi.ai/api/monthly-report/generate' \\`);
      console.log(`       -H 'Cookie: sb-<your-project>-auth-token=<copy-from-devtools>' \\`);
      console.log(`       -H 'Content-Type: application/json' \\`);
      console.log(`       -d '{"business_id":"${IICT_BUSINESSES_ID}","report_month":"${t.report_month}","fiscal_year":${t.fiscal_year}}'`);
      console.log('  # → returns generated report_data + summary; then POST that into /api/monthly-report/snapshot to persist:');
      console.log(`  curl -X POST 'https://wisdombi.ai/api/monthly-report/snapshot' \\`);
      console.log(`       -H 'Cookie: sb-<your-project>-auth-token=<copy-from-devtools>' \\`);
      console.log(`       -H 'Content-Type: application/json' \\`);
      console.log(`       -d '{"business_id":"${IICT_BUSINESSES_ID}","report_month":"${t.report_month}","fiscal_year":${t.fiscal_year},"is_draft":true,"unreconciled_count":0,"report_data": <paste-from-generate-response>, "summary": <paste-from-generate-response>}'`);
      console.log('');
    }
    console.log(C.bold('After generation, verify:'));
    console.log(`  node scripts/70-07-B3-iict-onboarding-completion.mjs --step=5 --apply`);
    console.log(C.dim('  (--apply on step 5 = "verify post-Matt-execution"; does NOT write to monthly_report_snapshots directly)'));
    console.log('');
    console.log(C.yellow('DRY RUN — script is now waiting for Matt to drive the UI / curl flow above, then re-run with --apply to verify.'));
    process.exit(0);
  }

  // APPLY mode on step 5 = verify-only
  console.log(C.bold('VERIFY mode (--apply on step 5 = verify post-generation; this step does NOT write to monthly_report_snapshots).'));
  console.log('');
  const stillMissing = [];
  for (const t of TARGETS) {
    const rows = await apiGet(`monthly_report_snapshots?business_id=eq.${IICT_BUSINESSES_ID}&report_month=eq.${t.report_month}&select=id,report_month,fiscal_year,status,is_draft,generated_at`);
    if (rows.length === 0) {
      console.log(C.red(`  ✗ MISSING report_month=${t.report_month}`));
      stillMissing.push(t.report_month);
    } else {
      const r = rows[0];
      console.log(C.green(`  ✓ FOUND  report_month=${r.report_month}  fiscal_year=${r.fiscal_year}  status=${r.status}  draft=${r.is_draft}  generated_at=${r.generated_at}`));
    }
  }
  console.log('');
  if (stillMissing.length > 0) {
    console.log(C.red(`✗ ${stillMissing.length} snapshot(s) still missing: ${stillMissing.join(', ')}.`));
    console.log(C.red('  → Drive the UI / curl flow (see dry-run output) and re-verify.'));
    process.exit(1);
  }
  console.log(C.green('✓ All target snapshots present. Step 5 complete.'));
  console.log('');
  console.log(C.dim('Next: node scripts/phase-70-data-audit.mjs   # final IICT verification across all 5 dimensions'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
try {
  if (STEP === 1) await runStep1();
  if (STEP === 2) await runStep2();
  if (STEP === 3) await runStep3();
  if (STEP === 4) await runStep4();
  if (STEP === 5) await runStep5();
  console.log('');
  console.log(`Finished: ${new Date().toISOString()}`);
} catch (err) {
  console.error(C.red(`✗ FATAL: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
}
