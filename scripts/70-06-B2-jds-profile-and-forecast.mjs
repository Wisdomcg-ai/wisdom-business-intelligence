#!/usr/bin/env node
/**
 * Phase 70 Plan 06 — B2: JDS profile_completed flip + FY26 forecast resolution.
 *
 * JDS-SPECIFIC cleanup. Two operations:
 *   STEP 1 — Flip business_profiles.profile_completed from false → true (always,
 *            no Matt input required; idempotent).
 *   STEP 2 — Resolve the FY26 ambiguity. The Phase 70 audit found that JDS's
 *            FY26 active forecast has 0 forecast_pl_lines while a separate
 *            (inactive) FY27 forecast has 92 lines. Matt chooses:
 *              Option A (BACKFILL FY26 via re-materialize) OR
 *              Option B (DEACTIVATE FY26 in favour of FY27).
 *            Default recommendation per 70-CONTEXT.md decisions B2: Option B.
 *
 * The decision is gated by an explicit --option=A | --option=B CLI flag. The
 * script never assumes — it reads current production state on every run and
 * prints both-options preview when no --option is supplied.
 *
 * SCOPE GUARDS
 *   - Hardcoded to JDS IDs only (businesses.id + business_profiles.id, see
 *     consts below). Will never touch any other business.
 *   - Step 2 never deletes a forecast row; deactivate-only on the FY26 path.
 *   - Option A is explicitly NOT a one-shot backfill. The re-materialize flow
 *     lives in src/app/api/forecast/[id]/recompute/route.ts and src/app/api/
 *     forecast/seed-from-prior/route.ts (both use the
 *     save_assumptions_and_materialize RPC) — wrapping that in a script would
 *     require replicating wizard-state validation + assumption resolution +
 *     authenticated request context. If Matt picks A, the script prints an
 *     escalate message and exits non-zero (no half-implementation).
 *
 * IDEMPOTENCY
 *   - Step 1: skips with "already complete" log if profile_completed === true.
 *   - Step 2 (Option B): if FY27 is already active and FY26 is already
 *     inactive, prints "Option B is already the current state" and exits 0.
 *   - Dry-run never writes.
 *
 * Run:
 *   node scripts/70-06-B2-jds-profile-and-forecast.mjs                    # dry-run (preview both options + locked prompt)
 *   node scripts/70-06-B2-jds-profile-and-forecast.mjs --option=B         # dry-run, Option B only preview
 *   node scripts/70-06-B2-jds-profile-and-forecast.mjs --option=B --apply # WRITES Option B
 *   node scripts/70-06-B2-jds-profile-and-forecast.mjs --option=A --apply # ABORTS with escalate message
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
}

// ── JDS IDs (locked, 70-CONTEXT.md) ────────────────────────────────────────
const JDS_BUSINESSES_ID = 'fea253dd-3dfa-447b-8f9b-8dff68aeac0a';
const JDS_PROFILES_ID   = '900aa935-ae8c-4913-baf7-169260fa19ef';

// ── LOCKED B2 decision prompt (DO NOT paraphrase, DO NOT abbreviate) ───────
// Downstream tooling + Matt's review flow recognises this string by exact match.
const B2_DECISION_PROMPT = "FY26 active forecast has 0 forecast_pl_lines. Options: (A) Backfill via forecast re-materialize, (B) Deactivate FY26 in favour of FY27 (92 lines, ready). Recommend (B). Reply 'A' or 'B'.";

// ── CLI parsing ────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const optionArg = process.argv.find((a) => a.startsWith('--option='));
const OPTION = optionArg ? optionArg.slice('--option='.length).toUpperCase() : null;
if (OPTION && OPTION !== 'A' && OPTION !== 'B') {
  console.error(`Invalid --option=${OPTION}. Must be A or B.`);
  process.exit(2);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// ── HTTP helpers ───────────────────────────────────────────────────────────
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

// ── Logging helpers ────────────────────────────────────────────────────────
const C = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

console.log('='.repeat(72));
console.log(C.bold('Phase 70 Plan 06 — B2 JDS profile + FY26 forecast resolution'));
console.log('='.repeat(72));
if (APPLY) {
  console.log(C.red(C.bold('APPLY MODE — writes will commit to production Supabase')));
} else {
  console.log(C.yellow(C.bold('DRY RUN — preview only, no writes')));
}
console.log(`URL: ${URL}`);
console.log(`Scope: JDS only (businesses.id=${JDS_BUSINESSES_ID})`);
console.log(`       business_profiles.id=${JDS_PROFILES_ID}`);
console.log(`Option flag: ${OPTION ?? '(none — preview both options)'}`);
console.log(`Started: ${new Date().toISOString()}`);
console.log('');

// ── Sanity: confirm the profile row exists ─────────────────────────────────
const profiles = await apiGet(
  `business_profiles?id=eq.${JDS_PROFILES_ID}&select=id,business_id,company_name,profile_completed,profile_updated_at`,
);
if (!profiles || profiles.length === 0) {
  console.error(C.red(C.bold(`✗ ABORT — no business_profiles row found for id=${JDS_PROFILES_ID}`)));
  console.error(C.red('  Cannot proceed without the JDS profile row. Has the IDs changed?'));
  process.exit(1);
}
const jdsProfile = profiles[0];

// Cross-check the businesses row exists too (for the businesses.id we hardcoded)
const businesses = await apiGet(
  `businesses?id=eq.${JDS_BUSINESSES_ID}&select=id,name,status`,
);
if (!businesses || businesses.length === 0) {
  console.error(C.red(C.bold(`✗ ABORT — no businesses row found for id=${JDS_BUSINESSES_ID}`)));
  process.exit(1);
}
const jdsBusiness = businesses[0];
console.log(C.dim(`Confirmed: business="${jdsBusiness.name}" status=${jdsBusiness.status}`));
console.log(C.dim(`Confirmed: profile company="${jdsProfile.company_name}" profile_completed=${jdsProfile.profile_completed}`));
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — Profile completion flip (always; no Matt input required)
// ═══════════════════════════════════════════════════════════════════════════
console.log(C.bold('═══ STEP 1 — business_profiles.profile_completed flip ═══'));
let profileMutationPlanned = false;
if (jdsProfile.profile_completed === true) {
  console.log(C.green(`  ✓ already complete (profile_completed=true; updated=${jdsProfile.profile_updated_at}) — skipping`));
} else {
  profileMutationPlanned = true;
  console.log(C.yellow(`  ⚠ profile_completed=${jdsProfile.profile_completed} → will set to TRUE`));
  console.log(`     PATCH business_profiles?id=eq.${JDS_PROFILES_ID}`);
  console.log(`     body: { profile_completed: true, profile_updated_at: NOW() }`);
}
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — Read current forecast state (post-70-02 dedupe)
// ═══════════════════════════════════════════════════════════════════════════
console.log(C.bold('═══ STEP 2 — JDS forecast state (current) ═══'));

// financial_forecasts.business_id is keyed by business_profiles.id per the
// dual-ID convention (70-CONTEXT.md). Use JDS_PROFILES_ID here, NOT the
// businesses.id.
const forecasts = await apiGet(
  `financial_forecasts?business_id=eq.${JDS_PROFILES_ID}&select=id,name,fiscal_year,year_type,forecast_type,version_number,is_active,created_at,updated_at&order=created_at.desc`,
);

if (forecasts.length === 0) {
  console.log(C.yellow(`  (no forecasts found for JDS — nothing to resolve)`));
} else {
  console.log(`  Total forecasts found: ${forecasts.length}`);
  console.log('');

  // Enrich with forecast_pl_lines count
  const enriched = [];
  for (const f of forecasts) {
    const plCount = await apiHeadCount('forecast_pl_lines', `forecast_id=eq.${f.id}`);
    enriched.push({ ...f, pl_line_count: plCount });
  }

  console.log(`  ${'name'.padEnd(28)} ${'FY'.padEnd(6)} ${'type'.padEnd(12)} ${'active'.padEnd(7)} ${'pl_lines'.padEnd(9)} updated_at`);
  console.log(`  ${'─'.repeat(28)} ${'─'.repeat(6)} ${'─'.repeat(12)} ${'─'.repeat(7)} ${'─'.repeat(9)} ${'─'.repeat(24)}`);
  for (const f of enriched) {
    const flag = f.is_active ? C.green('TRUE') : C.dim('false');
    const lineMark = f.is_active && f.pl_line_count === 0 ? C.red(String(f.pl_line_count).padEnd(9)) : String(f.pl_line_count).padEnd(9);
    console.log(`  ${String(f.name).padEnd(28)} ${`FY${f.fiscal_year}`.padEnd(6)} ${String(f.forecast_type).padEnd(12)} ${flag.padEnd(7 + 9)} ${lineMark} ${f.updated_at}`);
  }
  console.log('');

  // Bucket FY26 vs FY27 active
  const fy26Active = enriched.filter((f) => f.fiscal_year === 2026 && f.is_active);
  const fy27Active = enriched.filter((f) => f.fiscal_year === 2027 && f.is_active);
  const fy26Inactive = enriched.filter((f) => f.fiscal_year === 2026 && !f.is_active);
  const fy27Inactive = enriched.filter((f) => f.fiscal_year === 2027 && !f.is_active);

  console.log(`  Buckets: FY26 active=${fy26Active.length}  FY26 inactive=${fy26Inactive.length}  FY27 active=${fy27Active.length}  FY27 inactive=${fy27Inactive.length}`);
  console.log('');

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 3 — Decision branch
  // ═════════════════════════════════════════════════════════════════════════
  console.log(C.bold('═══ STEP 3 — Decision branch ═══'));

  // Hard ambiguity guard (per plan task 1 step 3 paragraph B-final)
  if (fy26Active.length > 1 || fy27Active.length > 1) {
    console.error(C.red(C.bold('✗ ABORT — JDS forecast state ambiguous')));
    console.error(C.red(`  Multiple active rows in same fiscal year (FY26=${fy26Active.length}, FY27=${fy27Active.length}).`));
    console.error(C.red(`  Please run scripts/70-02-A1-active-forecast-remediation.mjs --apply first.`));
    process.exit(1);
  }

  const fy26 = fy26Active[0] ?? fy26Inactive[0] ?? null;
  const fy27 = fy27Active[0] ?? fy27Inactive[0] ?? null;

  if (!OPTION) {
    // ── No --option supplied: preview BOTH options + print the locked B2 prompt ──
    console.log('');
    console.log(C.cyan(C.bold('Both-options preview:')));
    console.log('');
    console.log(C.cyan('  Option A — BACKFILL FY26 forecast_pl_lines'));
    if (!fy26) {
      console.log('    (no FY26 forecast at all — nothing to backfill; Option A would be a no-op)');
    } else {
      console.log(`    Target: forecast id=${fy26.id}  name="${fy26.name}"  active=${fy26.is_active}  pl_lines=${fy26.pl_line_count}`);
      console.log(`    Path: would need to re-run the materialize flow (POST /api/forecast/${fy26.id}/recompute or save_assumptions_and_materialize RPC).`);
      console.log(C.yellow(`    NOTE: this script does NOT implement Option A as a one-shot backfill — see Option A branch below for escalation message.`));
    }
    console.log('');
    console.log(C.cyan('  Option B — DEACTIVATE FY26 in favour of FY27 (RECOMMENDED)'));
    const updates = [];
    if (fy26 && fy26.is_active) {
      updates.push(`    UPDATE financial_forecasts SET is_active=false WHERE id='${fy26.id}'  (FY26 "${fy26.name}", pl_lines=${fy26.pl_line_count})`);
    }
    if (fy27 && !fy27.is_active) {
      updates.push(`    UPDATE financial_forecasts SET is_active=true  WHERE id='${fy27.id}'  (FY27 "${fy27.name}", pl_lines=${fy27.pl_line_count})`);
    }
    if (updates.length === 0) {
      console.log(C.green('    (already current state — Option B would be a no-op)'));
    } else {
      for (const u of updates) console.log(u);
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(C.bold(B2_DECISION_PROMPT));
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    if (APPLY) {
      console.error(C.red('✗ --apply was specified without --option=A|B. Refusing to mutate.'));
      console.error(C.red('  Re-run with --option=A --apply OR --option=B --apply.'));
      process.exit(1);
    }

    // Dry-run pure preview — exit success after also doing Step 1 preview above.
    console.log(C.yellow(`DRY RUN — re-run with --option=B --apply (recommended) or --option=A --apply.`));
    console.log(`Finished: ${new Date().toISOString()}`);
    process.exit(0);
  }

  // ── Option A path ────────────────────────────────────────────────────────
  if (OPTION === 'A') {
    console.log(C.yellow(C.bold('Option A — BACKFILL FY26 (selected)')));
    console.log('');
    console.log(C.red(C.bold('Option A is not implementable as a one-shot backfill script.')));
    console.log(C.red('Re-materializing forecast_pl_lines requires:'));
    console.log(C.red('  - Valid forecast assumptions (revenue + cogs + opex + employees + plan_periods)'));
    console.log(C.red('  - An authenticated request context for save_assumptions_and_materialize RPC OR'));
    console.log(C.red('    POST /api/forecast/<id>/recompute (which itself requires a logged-in coach session)'));
    console.log(C.red('  - Wizard-state validation matching the live forecast wizard'));
    console.log('');
    console.log(C.yellow('Recommended path:'));
    console.log(C.yellow('  1. Recommend Option B (run with --option=B --apply) — FY27 already has 92 populated rows.'));
    console.log(C.yellow('  2. OR escalate to a dedicated phase that wraps the materialize flow with a service-role'));
    console.log(C.yellow('     token + assumption-resolution + integration tests. Not a Phase 70 data-only task.'));
    console.log('');
    console.log(C.red('Exiting non-zero (no mutation performed for Step 2; Step 1 profile flip is also skipped'));
    console.log(C.red('to keep this run atomic — re-run with --option=B --apply when Matt picks B).'));
    console.log('');
    console.log(`Finished: ${new Date().toISOString()}`);
    process.exit(1);
  }

  // ── Option B path ────────────────────────────────────────────────────────
  if (OPTION === 'B') {
    console.log(C.cyan(C.bold('Option B — DEACTIVATE FY26 in favour of FY27 (selected)')));
    console.log('');

    const plannedB = [];
    if (fy26 && fy26.is_active) {
      plannedB.push({ id: fy26.id, label: `FY26 "${fy26.name}"`, body: { is_active: false, updated_at: new Date().toISOString() } });
    }
    if (fy27 && !fy27.is_active) {
      plannedB.push({ id: fy27.id, label: `FY27 "${fy27.name}"`, body: { is_active: true, updated_at: new Date().toISOString() } });
    }

    if (plannedB.length === 0) {
      console.log(C.green('  ✓ Option B is already the current state — no mutation needed.'));
      // STEP 1 may still need to run. Fall through to the apply block below;
      // it will guard with APPLY + profileMutationPlanned.
    } else {
      for (const p of plannedB) {
        console.log(`  Planned: ${p.label}  id=${p.id}  → is_active=${p.body.is_active}`);
      }
    }
    console.log('');

    if (!APPLY) {
      console.log(C.yellow(`DRY RUN — re-run with --option=B --apply to execute.`));
      console.log(`Finished: ${new Date().toISOString()}`);
      process.exit(0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // APPLY block — STEP 1 (profile) + STEP 2 (forecast Option B)
    // ═════════════════════════════════════════════════════════════════════════
    console.log(C.red(C.bold('APPLYING — writing to production...')));
    console.log('');

    // STEP 1 write
    if (profileMutationPlanned) {
      try {
        await apiPatch(
          'business_profiles',
          `id=eq.${JDS_PROFILES_ID}`,
          { profile_completed: true, profile_updated_at: new Date().toISOString() },
        );
        console.log(C.green(`  ✓ business_profiles.profile_completed = true`));
      } catch (err) {
        console.error(C.red(`  ✗ FAILED Step 1 (profile flip): ${err.message}`));
        process.exit(1);
      }
    } else {
      console.log(C.dim(`  · Step 1 skipped (profile already complete)`));
    }

    // STEP 2 writes (Option B)
    if (plannedB.length === 0) {
      console.log(C.dim(`  · Step 2 skipped (Option B is already the current state)`));
    } else {
      for (const p of plannedB) {
        try {
          await apiPatch('financial_forecasts', `id=eq.${p.id}`, p.body);
          console.log(C.green(`  ✓ ${p.label}  is_active=${p.body.is_active}`));
        } catch (err) {
          console.error(C.red(`  ✗ FAILED Step 2 (${p.label}): ${err.message}`));
          process.exit(1);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 4 — Post-write verification
    // ═════════════════════════════════════════════════════════════════════════
    console.log('');
    console.log(C.bold('═══ STEP 4 — Post-write verification ═══'));

    const verifyProfile = await apiGet(
      `business_profiles?id=eq.${JDS_PROFILES_ID}&select=id,profile_completed`,
    );
    const verifyForecasts = await apiGet(
      `financial_forecasts?business_id=eq.${JDS_PROFILES_ID}&is_active=eq.true&select=id,name,fiscal_year`,
    );

    let verifyErrors = 0;

    if (!verifyProfile[0]?.profile_completed) {
      console.error(C.red(`  ✗ ERROR — business_profiles.profile_completed is not true after write!`));
      verifyErrors++;
    } else {
      console.log(C.green(`  ✓ business_profiles.profile_completed = true`));
    }

    if (verifyForecasts.length !== 1) {
      console.error(C.red(`  ✗ ERROR — expected exactly 1 active forecast, found ${verifyForecasts.length}`));
      verifyErrors++;
    } else {
      const sole = verifyForecasts[0];
      const linesAfter = await apiHeadCount('forecast_pl_lines', `forecast_id=eq.${sole.id}`);
      if (linesAfter <= 0) {
        console.error(C.red(`  ✗ ERROR — sole active forecast "${sole.name}" (FY${sole.fiscal_year}) has ${linesAfter} forecast_pl_lines (expected > 0)`));
        verifyErrors++;
      } else {
        console.log(C.green(`  ✓ exactly one active forecast: "${sole.name}" (FY${sole.fiscal_year}) with ${linesAfter} forecast_pl_lines`));
      }
    }

    if (verifyErrors > 0) {
      console.error('');
      console.error(C.red(C.bold(`✗ POST-WRITE VERIFICATION FAILED (${verifyErrors} errors). Investigate before declaring done.`)));
      process.exit(1);
    }

    console.log('');
    console.log(C.green(C.bold('✓ All operations applied + verified. JDS B2 cleanup complete.')));
    console.log(`Finished: ${new Date().toISOString()}`);
    process.exit(0);
  }
}

// ── No forecasts found path: still run STEP 1 if needed in apply mode ──────
if (APPLY && profileMutationPlanned) {
  try {
    await apiPatch(
      'business_profiles',
      `id=eq.${JDS_PROFILES_ID}`,
      { profile_completed: true, profile_updated_at: new Date().toISOString() },
    );
    console.log(C.green(`  ✓ business_profiles.profile_completed = true (Step 1 only — no forecasts to resolve)`));
  } catch (err) {
    console.error(C.red(`  ✗ FAILED Step 1: ${err.message}`));
    process.exit(1);
  }
}

console.log('');
console.log(`Finished: ${new Date().toISOString()}`);
