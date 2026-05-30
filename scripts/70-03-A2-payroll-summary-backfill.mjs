#!/usr/bin/env node
// SUPER POLICY (locked by Matt 2026-05-31): always 0.12 default unless employee.superannuation_rate is non-null. Per-forecast overrides ignored as stale FY25 artifacts. Admin-configurable UI deferred.
/**
 * Phase 70 Plan 03 — A2: forecast_payroll_summary backfill (cross-client).
 *
 * Computes one `forecast_payroll_summary` row per active forecast from the
 * underlying `forecast_employees` rows. Idempotent upsert keyed by forecast_id.
 *
 * COMPUTE RULES (locked per 70-CONTEXT.md decision A2, 2026-05-31; super-rate
 * policy re-locked by Matt 2026-05-31 post-dry-run):
 *   wages       = monthly_cost ?? (annual_salary / 12)
 *   super       = wages × 0.12 (HARDCODED — AU SG statutory rate FY26+ from 2025-07-01.
 *                 Per-forecast `financial_forecasts.superannuation_rate` overrides are
 *                 IGNORED as stale FY25 operator artifacts. Admin-configurable UI to
 *                 update this on rate changes (next: 12.5% from 2027-07-01) is a
 *                 deferred feature for the code-fixes phase.)
 *   payg        = wages × 0.32 (default AU fallback; per-employee payg_per_period
 *                 conversion deferred to a follow-up code phase)
 *   payroll_tax = wages × NSW_PAYROLL_TAX_RATE (NSW; multi-state out of scope)
 *   net_wages   = wages_admin + wages_cogs − payg
 *
 * SUPER RATE SOURCE (Matt 2026-05-31 policy lock):
 *   Both `forecast_employees.super_rate` (numeric(5,2) DEFAULT 11.0 — whole-percent)
 *   AND `financial_forecasts.superannuation_rate` (numeric(5,4) DEFAULT 0.12 — decimal)
 *   are IGNORED. Reasons:
 *     • Employee `super_rate` is a units-mismatched column (holds whole-percent
 *       like 11.5; multiplying wages by it gives ~10× nonsense values).
 *     • Forecast `superannuation_rate` overrides observed in production (e.g.
 *       Precision Electrical = 0.115) are stale operator artifacts from FY25
 *       when the statutory rate was 11.5%. The current AU SG statutory rate is
 *       12% (effective 2025-07-01); applying stale overrides under-allocates super.
 *   Policy: hardcode to 0.12 default. When a future rate change ships (next:
 *   12.5% effective 2027-07-01), a coach/admin UI setting will let operators
 *   update this — deferred to the code-fixes phase.
 *   The script emits a warning for every forecast whose `superannuation_rate`
 *   differs from 0.12, naming the stale value so operators can verify.
 *
 * DATE HANDLING:
 *   forecast_employees.start_date / end_date are DB `date` columns ("YYYY-MM-DD").
 *   financial_forecasts.forecast_start_month / end_month are "YYYY-MM" text.
 *   Comparison: take YYYY-MM prefix of employee start/end dates and compare
 *   lexicographically against the month key. (Works because the date format is
 *   ISO-prefixed; "2024-02" < "2024-03" lexicographically.)
 *
 * EDGE CASES:
 *   - Forecast with 0 employees: skip entirely (no empty row written — zero
 *     row is misleading per plan).
 *   - Forecast missing forecast_start_month or forecast_end_month: log WARN, skip.
 *   - Employee with neither monthly_cost nor annual_salary: log WARN, skip emp.
 *   - Employee with end_date < start_date: log WARN, skip emp.
 *   - Employee with annual_salary === 0 (or monthly_cost === 0): treat as 0
 *     wages (do NOT skip — operator intent unclear).
 *
 * IDEMPOTENCY: re-running on already-backfilled rows produces 0 mutations.
 * Maps are compared with deterministic key ordering before deciding to write.
 *
 * Run:
 *   node scripts/70-03-A2-payroll-summary-backfill.mjs            # DRY RUN
 *   node scripts/70-03-A2-payroll-summary-backfill.mjs --apply    # WRITES
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY was disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
}

const APPLY = process.argv.includes('--apply');

// ── Locked compute constants ────────────────────────────────────────────────
const DEFAULT_SUPER_RATE = 0.12;   // per CONTEXT A2 (2026-05-31)
const DEFAULT_PAYG_RATE = 0.32;    // per CONTEXT A2
const NSW_PAYROLL_TAX_RATE = 0.0485; // per CONTEXT A2

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiUpsert(table, body, onConflict) {
  const url = `${URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Logging helpers ─────────────────────────────────────────────────────────
const C = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ── Month iteration helper (inclusive both ends) ────────────────────────────
function monthRangeInclusive(startYM, endYM) {
  // startYM, endYM both "YYYY-MM" strings. Returns array of month keys.
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  const out = [];
  let y = sy, m = sm;
  // Safety: cap at 120 months to defeat any pathological inputs.
  for (let i = 0; i < 120; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (y === ey && m === em) return out;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  throw new Error(`monthRangeInclusive: > 120 months between ${startYM} and ${endYM} — refusing`);
}

// Active-in-month check. Both inputs may be DB date strings ("YYYY-MM-DD") or
// "YYYY-MM" — we take the first 7 chars and compare as strings.
function ym(s) {
  if (!s) return null;
  return String(s).slice(0, 7);
}

function isActiveInMonth(emp, monthKey) {
  const startYM = ym(emp.start_date);
  if (startYM && startYM > monthKey) return false;
  const endYM = ym(emp.end_date);
  if (endYM && endYM < monthKey) return false;
  return true;
}

// ── Map equality (idempotency check) ────────────────────────────────────────
function mapsEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    // Allow for tiny float drift from numeric(12,2) round-trip.
    const av = Number(a[ak[i]]);
    const bv = Number(b[bk[i]]);
    if (Math.abs(av - bv) > 0.005) return false;
  }
  return true;
}

function payloadEqual(computed, existing) {
  if (!existing) return false;
  return (
    mapsEqual(computed.pay_runs_per_month,     existing.pay_runs_per_month) &&
    mapsEqual(computed.wages_admin_monthly,    existing.wages_admin_monthly) &&
    mapsEqual(computed.wages_cogs_monthly,     existing.wages_cogs_monthly) &&
    mapsEqual(computed.payg_monthly,           existing.payg_monthly) &&
    mapsEqual(computed.net_wages_monthly,      existing.net_wages_monthly) &&
    mapsEqual(computed.superannuation_monthly, existing.superannuation_monthly) &&
    mapsEqual(computed.payroll_tax_monthly,    existing.payroll_tax_monthly)
  );
}

// ── Header ──────────────────────────────────────────────────────────────────
console.log('='.repeat(72));
console.log(C.bold('Phase 70 Plan 03 — A2 Payroll-Summary Backfill'));
console.log('='.repeat(72));
if (APPLY) {
  console.log(C.red(C.bold('APPLY MODE — writes will commit to production Supabase')));
} else {
  console.log(C.yellow(C.bold('DRY RUN — preview only, no writes (re-run with --apply to commit)')));
}
console.log(`URL: ${URL}`);
console.log(`Started: ${new Date().toISOString()}`);
console.log(C.dim(`Compute rules: wages=monthly_cost??salary/12, super=wages×${DEFAULT_SUPER_RATE} (HARDCODED — forecast overrides ignored per Matt 2026-05-31), payg=wages×${DEFAULT_PAYG_RATE}, ptax=wages×${NSW_PAYROLL_TAX_RATE}`));
console.log('');

// ── (1) Fetch all active forecasts ──────────────────────────────────────────
console.log(C.dim('── Fetching active forecasts ──────────────────────────────'));
const activeForecasts = await apiGet(
  'financial_forecasts?is_active=eq.true&select=id,business_id,name,fiscal_year,year_type,forecast_type,forecast_start_month,forecast_end_month,superannuation_rate',
);
console.log(`  active forecasts: ${activeForecasts.length}`);

// ── (2) Resolve business names (display only) ──────────────────────────────
const profiles = await apiGet('business_profiles?select=id,business_id');
const profileToBiz = new Map(profiles.map((p) => [p.id, p.business_id]));
const allBusinesses = await apiGet('businesses?select=id,name');
const bizNameById = new Map(allBusinesses.map((b) => [b.id, b.name]));

function businessNameFor(profileId) {
  const bizId = profileToBiz.get(profileId);
  if (!bizId) return '(unknown)';
  return bizNameById.get(bizId) || '(unknown)';
}

// ── (3) Loop each forecast, compute, compare, optionally write ─────────────
console.log('');

let examined = 0;
let needBackfill = 0;       // existing row missing OR maps differed
let skippedAlreadyCorrect = 0; // idempotency: row present + maps match
let skippedNoEmployees = 0;
let skippedMissingRange = 0;
let warnings = 0;
let upserted = 0;
const failures = [];

for (const F of activeForecasts) {
  examined++;
  const bizName = businessNameFor(F.business_id);
  const label = `business="${bizName}" forecast="${F.name}" FY${F.fiscal_year} (${F.forecast_start_month}..${F.forecast_end_month})`;

  if (!F.forecast_start_month || !F.forecast_end_month) {
    console.log(C.yellow(`⚠ SKIP (missing range)  ${label}`));
    warnings++;
    skippedMissingRange++;
    continue;
  }

  // Read employees for this forecast (active or NULL-active treated as active).
  const employees = await apiGet(
    `forecast_employees?forecast_id=eq.${F.id}&select=*`,
  );
  const activeEmployees = employees.filter((e) => e.is_active !== false);

  if (activeEmployees.length === 0) {
    console.log(C.dim(`· skip (no employees)   ${label}`));
    skippedNoEmployees++;
    continue;
  }

  // SUPER POLICY (Matt 2026-05-31): always 0.12 default; per-forecast overrides
  // (e.g. Precision Electrical's stale 0.115 FY25 artifact) are IGNORED.
  // Warn the operator when the forecast carries a non-0.12 rate so they can
  // verify the stale-artifact assumption.
  const forecastSuperRateRaw = F.superannuation_rate != null ? Number(F.superannuation_rate) : null;
  if (forecastSuperRateRaw != null && Math.abs(forecastSuperRateRaw - DEFAULT_SUPER_RATE) > 1e-6) {
    console.log(C.yellow(`⚠ Forecast "${F.name}" (business="${bizName}") has stale forecast.superannuation_rate=${forecastSuperRateRaw}; using ${DEFAULT_SUPER_RATE} per Matt 2026-05-31`));
    warnings++;
  }
  const forecastSuperRate = DEFAULT_SUPER_RATE; // hardcoded per policy lock

  // Build month range
  let monthKeys;
  try {
    monthKeys = monthRangeInclusive(F.forecast_start_month, F.forecast_end_month);
  } catch (e) {
    console.log(C.red(`✗ SKIP (bad range)  ${label}  — ${e.message}`));
    warnings++;
    skippedMissingRange++;
    continue;
  }

  // Per-month accumulators
  const pay_runs_per_month     = {};
  const wages_admin_monthly    = {};
  const wages_cogs_monthly     = {};
  const superannuation_monthly = {};
  const payroll_tax_monthly    = {};
  const payg_monthly           = {};
  const net_wages_monthly      = {};

  let opexCount = 0, cogsCount = 0;
  for (const e of activeEmployees) {
    if (e.classification === 'cogs') cogsCount++;
    else opexCount++;
  }

  // Validate employees once; collect skipped IDs for the per-forecast log.
  const validEmployees = [];
  for (const e of activeEmployees) {
    if (e.start_date && e.end_date && ym(e.end_date) < ym(e.start_date)) {
      console.log(C.yellow(`  ⚠ employee "${e.employee_name}" (id=${e.id}) end_date < start_date — skipping`));
      warnings++;
      continue;
    }
    const monthlyCost = e.monthly_cost != null ? Number(e.monthly_cost) : null;
    const annualSalary = e.annual_salary != null ? Number(e.annual_salary) : null;
    if (monthlyCost == null && annualSalary == null) {
      console.log(C.yellow(`  ⚠ employee "${e.employee_name}" (id=${e.id}) has no monthly_cost or annual_salary — skipping`));
      warnings++;
      continue;
    }
    validEmployees.push(e);
  }

  for (const M of monthKeys) {
    let wagesAdmin = 0;
    let wagesCogs = 0;
    let superVal = 0;
    let payrollTax = 0;
    let payg = 0;
    let payRuns = 0;

    for (const e of validEmployees) {
      if (!isActiveInMonth(e, M)) continue;

      const monthlyCost = e.monthly_cost != null ? Number(e.monthly_cost) : null;
      const annualSalary = e.annual_salary != null ? Number(e.annual_salary) : null;
      // wages = monthly_cost ?? annual_salary/12 (per CONTEXT A2 locked rule)
      const wages = monthlyCost != null ? monthlyCost : (annualSalary != null ? annualSalary / 12 : 0);

      // super = wages × 0.12 (Matt 2026-05-31 policy lock).
      // - forecast_employees.super_rate IGNORED (whole-percent column,
      //   units-mismatch bug).
      // - financial_forecasts.superannuation_rate overrides IGNORED (stale
      //   FY25 operator artifacts; AU SG statutory rate is 12% from 2025-07-01).
      superVal += wages * forecastSuperRate;

      // payg = wages × 0.32 (locked default; per-employee payg_per_period
      // conversion deferred to a follow-up code phase per plan)
      payg += wages * DEFAULT_PAYG_RATE;

      // payroll_tax = wages × NSW rate
      payrollTax += wages * NSW_PAYROLL_TAX_RATE;

      if (e.classification === 'cogs') {
        wagesCogs += wages;
      } else {
        wagesAdmin += wages;
      }

      // pay_runs: simplified — count each active employee once per month
      // (assumes monthly cadence; per-forecast frequency conversion deferred
      // per plan task 1 step 3c bullet "pay_runs contribution").
      payRuns += 1;
    }

    // Round all monetary outputs to 2dp for clean JSONB equality + display.
    pay_runs_per_month[M]     = payRuns;
    wages_admin_monthly[M]    = Math.round(wagesAdmin * 100) / 100;
    wages_cogs_monthly[M]     = Math.round(wagesCogs * 100) / 100;
    superannuation_monthly[M] = Math.round(superVal * 100) / 100;
    payroll_tax_monthly[M]    = Math.round(payrollTax * 100) / 100;
    payg_monthly[M]           = Math.round(payg * 100) / 100;
    net_wages_monthly[M]      = Math.round((wagesAdmin + wagesCogs - payg) * 100) / 100;
  }

  const computed = {
    pay_runs_per_month,
    wages_admin_monthly,
    wages_cogs_monthly,
    superannuation_monthly,
    payroll_tax_monthly,
    payg_monthly,
    net_wages_monthly,
  };

  // Fetch existing row for idempotency check.
  const existingRows = await apiGet(
    `forecast_payroll_summary?forecast_id=eq.${F.id}&select=*`,
  );
  const existing = existingRows[0] || null;

  if (existing && payloadEqual(computed, existing)) {
    console.log(C.green(`✓ skip (already correct)  ${label}  [${validEmployees.length} emp, ${monthKeys.length} mo]`));
    skippedAlreadyCorrect++;
    continue;
  }

  // Needs backfill — print preview.
  needBackfill++;
  const sampleMonths = monthKeys.slice(0, 3);
  const totalAdmin = Object.values(wages_admin_monthly).reduce((s, v) => s + v, 0);
  const totalCogs  = Object.values(wages_cogs_monthly).reduce((s, v) => s + v, 0);
  const totalSuper = Object.values(superannuation_monthly).reduce((s, v) => s + v, 0);
  const totalPtax  = Object.values(payroll_tax_monthly).reduce((s, v) => s + v, 0);
  const totalPayg  = Object.values(payg_monthly).reduce((s, v) => s + v, 0);

  console.log(C.cyan('═'.repeat(70)));
  console.log(C.bold(label));
  console.log(`  employees: ${validEmployees.length}/${activeEmployees.length} valid (${opexCount} opex, ${cogsCount} cogs)  super_rate=${forecastSuperRate}`);
  console.log(`  months: ${monthKeys.length} (${monthKeys[0]}..${monthKeys[monthKeys.length - 1]})`);
  for (const M of sampleMonths) {
    console.log(C.dim(
      `    ${M}: ` +
      `wages_admin=${wages_admin_monthly[M]}  wages_cogs=${wages_cogs_monthly[M]}  ` +
      `super=${superannuation_monthly[M]}  ptax=${payroll_tax_monthly[M]}  ` +
      `payg=${payg_monthly[M]}  net=${net_wages_monthly[M]}  pay_runs=${pay_runs_per_month[M]}`,
    ));
  }
  if (monthKeys.length > 3) console.log(C.dim(`    … (${monthKeys.length - 3} more months)`));
  console.log(`  YEAR TOTALS: wages_admin=${Math.round(totalAdmin)}  wages_cogs=${Math.round(totalCogs)}  super=${Math.round(totalSuper)}  ptax=${Math.round(totalPtax)}  payg=${Math.round(totalPayg)}`);
  if (existing) {
    // Print which top-level maps differ for orientation.
    const changedFields = [];
    if (!mapsEqual(computed.pay_runs_per_month,     existing.pay_runs_per_month))     changedFields.push('pay_runs_per_month');
    if (!mapsEqual(computed.wages_admin_monthly,    existing.wages_admin_monthly))    changedFields.push('wages_admin_monthly');
    if (!mapsEqual(computed.wages_cogs_monthly,     existing.wages_cogs_monthly))     changedFields.push('wages_cogs_monthly');
    if (!mapsEqual(computed.superannuation_monthly, existing.superannuation_monthly)) changedFields.push('superannuation_monthly');
    if (!mapsEqual(computed.payroll_tax_monthly,    existing.payroll_tax_monthly))    changedFields.push('payroll_tax_monthly');
    if (!mapsEqual(computed.payg_monthly,           existing.payg_monthly))           changedFields.push('payg_monthly');
    if (!mapsEqual(computed.net_wages_monthly,      existing.net_wages_monthly))      changedFields.push('net_wages_monthly');
    console.log(C.yellow(`  existing row: PRESENT → will UPDATE  (changed fields: ${changedFields.join(', ')})`));
  } else {
    console.log(C.yellow(`  existing row: NONE → will INSERT`));
  }

  // Apply path
  if (APPLY) {
    try {
      await apiUpsert(
        'forecast_payroll_summary',
        { forecast_id: F.id, ...computed },
        'forecast_id',
      );
      upserted++;
      console.log(C.green(`  ✓ upserted`));
    } catch (err) {
      console.log(C.red(`  ✗ FAILED: ${err.message}`));
      failures.push({ forecast_id: F.id, name: F.name, business: bizName, error: err.message });
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═'.repeat(72));
console.log(C.bold('Summary'));
console.log('═'.repeat(72));
console.log(`Active forecasts examined: ${examined}`);
console.log(`Forecasts needing backfill: ${needBackfill}`);
console.log(`Forecasts skipped (already correct): ${skippedAlreadyCorrect}`);
console.log(`Forecasts skipped (no employees): ${skippedNoEmployees}`);
console.log(`Forecasts skipped (missing/invalid month range): ${skippedMissingRange}`);
console.log(`Warnings emitted: ${warnings}`);
if (APPLY) {
  console.log(`Forecasts upserted: ${upserted}`);
  console.log(`Failures: ${failures.length}`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(C.red(`  - ${f.business} / "${f.name}" (${f.forecast_id}): ${f.error}`));
    }
  }
} else {
  console.log(`Forecasts upserted: 0  (DRY RUN — re-run with --apply to commit)`);
}
console.log('');
console.log(`Finished: ${new Date().toISOString()}`);

if (APPLY && failures.length > 0) {
  console.error(C.red(C.bold(`✗ APPLY completed with ${failures.length} failure(s). Re-run dry-run to inspect.`)));
  process.exit(1);
}

if (APPLY && upserted !== needBackfill) {
  console.error(C.red(C.bold(`✗ MISMATCH: upserted ${upserted} vs needed ${needBackfill}.`)));
  process.exit(1);
}

if (APPLY) {
  console.log(C.green(C.bold(`✓ Backfill complete. Re-run without flags to verify idempotency ("needing backfill: 0").`)));
}
