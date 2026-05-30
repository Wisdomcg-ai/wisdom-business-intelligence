#!/usr/bin/env node
/**
 * Phase 70-09 — C2 cron heartbeat health check.
 *
 * READ-ONLY. Queries the cron_heartbeats table introduced in Phase 69-04 to
 * answer the question Phase 69's regression went undetected for weeks asking:
 *   "Is each registered cron actually firing on schedule?"
 *
 * The critical cron for Phase 70 is /api/cron/refresh-xero-tokens (every 6h).
 * If that cron is silent past 2x its cadence (>= 12h), any Phase 70 verdict
 * relying on fresh Xero data (70-04 renewal_month inference from bank
 * transactions, 70-05 account_codes inference from P&L lines, 70-08
 * audit re-run) is suspect.
 *
 * Output:
 *   1. Per-cron classification printed to stdout
 *      (HEALTHY / WARN / CRITICAL / UNKNOWN)
 *   2. Markdown snapshot report written to
 *      .planning/phases/70-.../70-09-cron-health-report.md
 *
 * WARN-not-BLOCK contract: this script ALWAYS exits 0 except on true script
 * execution errors. Per Phase 70 CONTEXT.md C2, cron health is informational
 * for verification freshness only — it does not gate Phase 70 close.
 *
 * NO --apply flag. NO mutations. NO Xero API calls. Heartbeats only.
 *
 * Env: SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_KEY (legacy).
 *
 * Run: node scripts/70-09-C2-cron-heartbeat-check.mjs
 */

import { config } from 'dotenv';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Load .env.local first, then fall back to .env (same pattern as
// scripts/phase-69-token-state-audit.mjs).
config({ path: '.env.local' });
if (existsSync('.env')) config({ path: '.env' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_KEY in .env.local',
  );
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// KNOWN_CRONS — derived directly from vercel.json (single source of truth for
// what cron registration looks like in production). Cadence is the schedule's
// natural interval; `critical=true` means the cron is load-bearing for Phase
// 70's verification (only refresh-xero-tokens qualifies — the other crons are
// background ops that wouldn't invalidate a Phase 70 verdict if silent).
// ---------------------------------------------------------------------------
const KNOWN_CRONS = [
  { path: '/api/cron/refresh-xero-tokens',  cadence_hours: 6,    critical: true  },
  { path: '/api/cron/sync-all-xero',        cadence_hours: 24,   critical: false },
  { path: '/api/cron/reconciliation-watch', cadence_hours: 24,   critical: false },
  { path: '/api/cron/daily-health-report',  cadence_hours: 24,   critical: false },
  { path: '/api/cron/weekly-digest',        cadence_hours: 168,  critical: false }, // weekly
];

const NOW_MS = Date.now();
const NOW_ISO = new Date(NOW_MS).toISOString();
const NOW_MINUS_24H_ISO = new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtAge(hoursFloat) {
  if (hoursFloat === null || hoursFloat === undefined || Number.isNaN(hoursFloat)) {
    return 'NEVER';
  }
  if (hoursFloat < 1) return `${Math.round(hoursFloat * 60)}m ago`;
  if (hoursFloat < 48) return `${hoursFloat.toFixed(1)}h ago`;
  return `${(hoursFloat / 24).toFixed(1)}d ago`;
}

function fmtCadence(hours) {
  if (hours < 24) return `${hours}h`;
  if (hours === 24) return '24h (daily)';
  if (hours === 168) return '168h (weekly)';
  return `${hours}h`;
}

// ---------------------------------------------------------------------------
// Per-cron query — last heartbeat, last 24h ticks, last 24h failures.
// All three are independent SELECTs against the (cron_path, ran_at DESC)
// index. No writes. No --apply. cron_heartbeats has no UPDATE/DELETE policies
// per the Phase 69-04 migration; this script honours append-only by query
// shape alone.
// ---------------------------------------------------------------------------
async function checkOneCron(cron) {
  // 1. Last heartbeat
  const lastResp = await sb
    .from('cron_heartbeats')
    .select('ran_at, status, error_message')
    .eq('cron_path', cron.path)
    .order('ran_at', { ascending: false })
    .limit(1);

  if (lastResp.error) {
    return {
      ...cron,
      classification: 'UNKNOWN',
      last_run: null,
      last_run_status: null,
      last_run_error: null,
      hours_since_last_run: null,
      ticks_last_24h: 0,
      failures_last_24h: 0,
      query_error: lastResp.error.message,
    };
  }
  const lastRow = lastResp.data?.[0] ?? null;
  const lastRunIso = lastRow?.ran_at ?? null;
  const hoursSince = lastRunIso
    ? (NOW_MS - new Date(lastRunIso).getTime()) / (1000 * 60 * 60)
    : null;

  // 2. Ticks in last 24h
  const ticksResp = await sb
    .from('cron_heartbeats')
    .select('id', { count: 'exact', head: true })
    .eq('cron_path', cron.path)
    .gte('ran_at', NOW_MINUS_24H_ISO);
  const ticks24h = ticksResp.count ?? 0;

  // 3. Failures in last 24h (status='failed' OR status='partial' — both
  // signal "the cron ran but didn't fully succeed", which for Phase 70 means
  // the Xero token state may be partial). We treat partial separately in
  // the classification but combine them for the loud warning.
  const failResp = await sb
    .from('cron_heartbeats')
    .select('id', { count: 'exact', head: true })
    .eq('cron_path', cron.path)
    .gte('ran_at', NOW_MINUS_24H_ISO)
    .in('status', ['failed', 'partial']);
  const failures24h = failResp.count ?? 0;

  // ---------------------- Classification ----------------------
  // HEALTHY  : last run < cadence AND zero 24h failures
  // WARN     : cadence <= last run < 2x cadence  OR  any 24h failures
  // CRITICAL : last run >= 2x cadence  OR  never ran
  // UNKNOWN  : query error (handled above)
  let classification;
  if (lastRunIso === null) {
    classification = 'CRITICAL';
  } else if (hoursSince >= 2 * cron.cadence_hours) {
    classification = 'CRITICAL';
  } else if (hoursSince >= cron.cadence_hours) {
    classification = 'WARN';
  } else if (failures24h > 0) {
    classification = 'WARN';
  } else {
    classification = 'HEALTHY';
  }

  return {
    ...cron,
    classification,
    last_run: lastRunIso,
    last_run_status: lastRow?.status ?? null,
    last_run_error: lastRow?.error_message ?? null,
    hours_since_last_run: hoursSince,
    ticks_last_24h: ticks24h,
    failures_last_24h: failures24h,
    query_error: null,
  };
}

// ---------------------------------------------------------------------------
// Table-missing detection. If the migration hasn't been applied to this DB,
// every query above fails with "relation public.cron_heartbeats does not
// exist". Catching that case once up front gives a clean diagnostic instead
// of N identical errors.
// ---------------------------------------------------------------------------
async function tableExists() {
  // Use a non-head SELECT so PostgREST returns its full error envelope when
  // the table is missing — the head=true variant has been observed returning
  // status=204 with both error=null and count=null when the relation is not
  // in the schema cache (false-positive "exists" signal).
  const probe = await sb.from('cron_heartbeats').select('id').limit(1);
  if (probe.error) {
    const msg = probe.error.message || '';
    if (
      msg.includes('does not exist') ||
      msg.includes('Could not find the table') ||
      msg.includes('relation') ||
      probe.error.code === '42P01' ||
      probe.error.code === 'PGRST205'
    ) {
      return { exists: false, error: probe.error.message };
    }
    return { exists: false, error: probe.error.message };
  }
  // Follow-up count for the report header (rough size signal).
  const count = await sb
    .from('cron_heartbeats')
    .select('id', { count: 'exact', head: true });
  return { exists: true, total: count.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Markdown report writer
// ---------------------------------------------------------------------------
function buildReport({ results, tableProbe, criticalCronStatus }) {
  const headerStatus = (() => {
    if (!tableProbe.exists) return 'TABLE_MISSING';
    if (criticalCronStatus === 'CRITICAL') return 'CRITICAL';
    if (results.some((r) => r.classification === 'CRITICAL')) return 'CRITICAL';
    if (results.some((r) => r.classification === 'WARN')) return 'WARN';
    return 'HEALTHY';
  })();

  const rows = results
    .map((r) => {
      const cadence = fmtCadence(r.cadence_hours);
      const last = r.last_run ? `${r.last_run} (${fmtAge(r.hours_since_last_run)})` : 'NEVER';
      const critFlag = r.critical ? ' (CRITICAL)' : '';
      return `| \`${r.path}\`${critFlag} | ${r.classification} | ${last} | ${cadence} | ${r.ticks_last_24h} | ${r.failures_last_24h} |`;
    })
    .join('\n');

  const tableMissingBlock = tableProbe.exists
    ? ''
    : `\n## cron_heartbeats table NOT present\n\nQuery error: \`${tableProbe.error}\`\n\nThe Phase 69-04 migration (\`supabase/migrations/20260530000000_phase69_cron_heartbeats.sql\`) has not been applied to this database. Until it is, cron cadence cannot be empirically verified. Phase 70's Xero-dependent verifications (70-04 renewal_month, 70-05 account_codes, 70-08 audit re-run) are NOT confirmed — they ran without invocation-cadence proof.\n\n**Action:** apply the migration; re-run this check after the first organic cron tick (max 6h post-deploy).\n`;

  const refreshCron = results.find((r) => r.path === '/api/cron/refresh-xero-tokens');
  const implications = (() => {
    if (!tableProbe.exists) {
      return `**Status:** UNKNOWN — \`cron_heartbeats\` table not present in this database.\n\nPhase 70's Xero-touching verifications (70-04 renewal_month backfill via Xero bank tx, 70-05 account_codes inference via Xero P&L lines, 70-08 audit re-run reading expires_at / last_synced_at) all ran assuming Phase 69 had landed and the refresh cron was firing. With no heartbeat evidence to prove that, those verdicts are PROVISIONAL. Re-run 70-08 + this check once the migration is live AND one full cron cycle (≥ 6h) has elapsed.`;
    }
    if (!refreshCron) {
      return `**Status:** UNKNOWN — refresh-xero-tokens not found in KNOWN_CRONS (configuration drift?).`;
    }
    if (refreshCron.classification === 'HEALTHY') {
      return `**Status:** HEALTHY — \`/api/cron/refresh-xero-tokens\` last ran ${fmtAge(refreshCron.hours_since_last_run)} (cadence: ${fmtCadence(refreshCron.cadence_hours)}; ${refreshCron.ticks_last_24h} ticks / ${refreshCron.failures_last_24h} failures in last 24h).\n\nPhase 70 verdicts that depend on fresh Xero data (70-04 renewal_month inference, 70-05 account_codes inference, 70-08 audit re-run) are TRUSTED — the cron is firing on schedule and tokens are being kept alive. No re-run required.`;
    }
    if (refreshCron.classification === 'WARN') {
      return `**Status:** WARN — \`/api/cron/refresh-xero-tokens\` last ran ${fmtAge(refreshCron.hours_since_last_run)} (cadence: ${fmtCadence(refreshCron.cadence_hours)}; ${refreshCron.ticks_last_24h} ticks / ${refreshCron.failures_last_24h} failures in last 24h).\n\nThe cron is firing but slightly stale OR has had at least one partial/failed tick in the last 24h. Phase 70 verdicts remain provisionally TRUSTED — the cron is alive — but watch the next tick. If the next scheduled tick also fails to advance \`last_run\`, escalate per the runbook (\`.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md\`). Last-run error (if any): \`${refreshCron.last_run_error ?? '(none)'}\`.`;
    }
    // CRITICAL
    return `**Status:** CRITICAL — \`/api/cron/refresh-xero-tokens\` ${refreshCron.last_run ? `last ran ${fmtAge(refreshCron.hours_since_last_run)} (>= 2x cadence)` : 'has NEVER run since the heartbeats table was created'}.\n\nPhase 69 deploy may not have re-registered the cron with Vercel's scheduler — the EXACT failure mode Phase 69 was meant to permanently fix. Phase 70 verdicts that depend on fresh Xero data (70-04 renewal_month from Xero bank tx, 70-05 account_codes from Xero P&L, 70-08 audit re-run) MAY be reading STALE token / sync state.\n\n**Actions, in order:**\n1. Check Vercel Dashboard → Project → Settings → Crons. Confirm \`/api/cron/refresh-xero-tokens\` is listed with a near-future \`Next run\` timestamp.\n2. If missing or shows "Not scheduled", re-run \`vercel --prod\` to force re-registration (per 69-04 runbook Step 1).\n3. If still missing after a second redeploy, activate the GitHub Actions fallback skeleton documented in 69-04-MONITORING-RUNBOOK.md.\n4. Once the cron is empirically firing (re-run this script and see HEALTHY), re-run \`scripts/phase-70-data-audit.mjs\` to refresh the trust signal for 70-04 / 70-05 / 70-08 verdicts.`;
  })();

  const recommendations = (() => {
    if (!tableProbe.exists) {
      return [
        '- Apply the Phase 69-04 migration to this database.',
        '- Re-run this script after ≥ 6h post-deploy to confirm the first organic refresh-xero-tokens tick fires.',
        '- Until then, treat 70-04 / 70-05 / 70-08 Xero verdicts as provisional.',
      ].join('\n');
    }
    if (!refreshCron) {
      return '- Investigate KNOWN_CRONS / vercel.json drift before relying on this report.';
    }
    if (refreshCron.classification === 'HEALTHY') {
      return [
        '- Next refresh-xero-tokens tick expected within ~6h (cron schedule `0 */6 * * *` UTC: 00:00 / 06:00 / 12:00 / 18:00).',
        '- Re-run this check daily for the next 7 days as part of the Phase 69 post-deploy soak (per 69-04 runbook Step 3).',
        '- If any tick fails to advance `last_run` past `2 × 6h = 12h`, escalate per the 69-04 runbook.',
        '- No other action required for Phase 70 close.',
      ].join('\n');
    }
    if (refreshCron.classification === 'WARN') {
      return [
        '- Watch the next scheduled refresh-xero-tokens tick (within ~6h).',
        '- If `last_run` advances + failures clear, treat as a transient and downgrade to HEALTHY on the next run.',
        '- If the same row stays stale across 2 consecutive expected ticks (~12h), escalate to CRITICAL — Vercel scheduler may be drifting again.',
        '- Cross-reference 70-04 / 70-05 unresolved rows: if the cron error_message points to a specific tenant\'s token, expect 70-04 unresolved renewal rows for that tenant to clear once the cron recovers.',
      ].join('\n');
    }
    return [
      '- Immediate: Vercel dashboard cron check + redeploy per 69-04 runbook Step 1.',
      '- Within 6h: re-run this script. If still CRITICAL, escalate to GitHub Actions fallback per 69-04 runbook.',
      '- Within 24h: re-run `scripts/phase-70-data-audit.mjs` once the cron is empirically firing — current 70-04 / 70-05 / 70-08 verdicts are PROVISIONAL until the cron health is confirmed.',
      '- Phase 70 close itself is NOT blocked (per CONTEXT.md C2 warn-not-block); this is verification debt to clear before declaring Xero-side trust restored.',
    ].join('\n');
  })();

  return `# Phase 70-09 — Cron Health Report (C2)

**Captured:** ${NOW_ISO}
**Overall status:** ${headerStatus}
**Source:** \`scripts/70-09-C2-cron-heartbeat-check.mjs\` (read-only query against \`public.cron_heartbeats\`)
**Cron registry:** \`vercel.json\` (5 cron paths)
**Heartbeat layer:** Phase 69-04 (\`supabase/migrations/20260530000000_phase69_cron_heartbeats.sql\`, \`src/lib/cron/heartbeat.ts\`)
${tableMissingBlock}
## Summary

| Cron path | Status | Last run | Cadence | Ticks 24h | Failures 24h |
|---|---|---|---|---|---|
${rows}

Classification rules:
- **HEALTHY**: last run within cadence window AND zero failed/partial ticks in 24h
- **WARN**: last run between 1x and 2x cadence OR any failed/partial ticks in 24h
- **CRITICAL**: last run beyond 2x cadence OR no heartbeats ever recorded
- **UNKNOWN**: query error (typically: table missing — Phase 69-04 migration not applied)

## Phase 70 implications

${implications}

## Recommendations for the next 24h

${recommendations}

## Cross-reference

- Phase 69 monitoring runbook: \`.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md\` (full escalation protocol + Sentry alert configuration + GitHub Actions fallback skeleton)
- Phase 70 audit re-run: \`scripts/phase-70-data-audit.mjs\` (re-run after the cron is empirically firing if status is WARN/CRITICAL)
- Phase 70 CONTEXT.md C2 contract: this check is **warn-not-block** — Phase 70 close is independent of cron health; only downstream verification freshness is affected.
- PR #231 (Phase 69 cron re-registration + heartbeat layer) merged 2026-05-30T20:20:11Z; first organic refresh-xero-tokens tick expected at the next \`0 */6 * * *\` UTC boundary post-deploy.

---
*Generated by \`scripts/70-09-C2-cron-heartbeat-check.mjs\` — read-only.*
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  console.log('=== Phase 70-09 — C2 Cron Heartbeat Health Check ===');
  console.log(`Now: ${NOW_ISO}`);

  const tableProbe = await tableExists();
  if (!tableProbe.exists) {
    console.log('');
    console.log('cron_heartbeats table NOT present in this database.');
    console.log(`  query error: ${tableProbe.error}`);
    console.log('');
    console.log('cron_heartbeats not present — Phase 69 not yet in production;');
    console.log("Phase 70's Xero-dependent verifications are unconfirmed.");
    // Still emit the markdown report so Phase 70 has the snapshot artifact
    // even when the table is missing.
    const reportPath = resolveReportPath();
    const md = buildReport({ results: KNOWN_CRONS.map((c) => ({
      ...c,
      classification: 'UNKNOWN',
      last_run: null,
      last_run_status: null,
      last_run_error: null,
      hours_since_last_run: null,
      ticks_last_24h: 0,
      failures_last_24h: 0,
      query_error: tableProbe.error,
    })), tableProbe, criticalCronStatus: 'UNKNOWN' });
    writeFileSync(reportPath, md, 'utf8');
    console.log(`\nReport written: ${reportPath}`);
    process.exit(0);
  }

  console.log(`cron_heartbeats present — total rows: ${tableProbe.total}`);
  console.log('');

  const results = [];
  for (const cron of KNOWN_CRONS) {
    const r = await checkOneCron(cron);
    results.push(r);
  }

  // Print the per-cron status block.
  console.log('Per-cron status:');
  console.log('');
  for (const r of results) {
    const last = r.last_run ? fmtAge(r.hours_since_last_run) : 'NEVER';
    const critFlag = r.critical ? ' [critical]' : '';
    console.log(
      `  ${r.classification.padEnd(8)} ${r.path.padEnd(40)}` +
        ` last=${last.padEnd(10)} cadence=${fmtCadence(r.cadence_hours).padEnd(14)}` +
        ` ticks_24h=${r.ticks_last_24h} failures_24h=${r.failures_last_24h}${critFlag}`,
    );
  }
  console.log('');

  const critical = results.find((r) => r.critical);
  const criticalCronStatus = critical?.classification ?? 'UNKNOWN';

  // Loud warning when the critical-flagged cron is unhealthy. WARN-not-BLOCK:
  // we still exit 0 per the CONTEXT.md C2 contract.
  if (criticalCronStatus === 'CRITICAL') {
    console.log('═'.repeat(78));
    console.log('WARNING: refresh-xero-tokens is CRITICAL.');
    console.log("Phase 70 verification (70-08) reads Xero data that may be stale or unrefreshed.");
    console.log('Confirm Phase 69 deployment landed in production.');
    console.log('See .planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md');
    console.log('═'.repeat(78));
  } else if (criticalCronStatus === 'WARN') {
    console.log('═'.repeat(78));
    console.log('NOTE: refresh-xero-tokens is WARN (slightly stale or partial failure in 24h).');
    console.log('Watch the next scheduled tick. Phase 70 verdicts are provisionally trusted.');
    console.log('═'.repeat(78));
  }

  // Write the markdown report.
  const reportPath = resolveReportPath();
  const md = buildReport({ results, tableProbe, criticalCronStatus });
  writeFileSync(reportPath, md, 'utf8');
  console.log(`\nReport written: ${reportPath}`);

  // WARN-not-BLOCK: always exit 0 unless something truly broke above.
  process.exit(0);
})().catch((e) => {
  console.error('Script execution error:', e);
  process.exit(1);
});

function resolveReportPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(
    __dirname,
    '..',
    '.planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-09-cron-health-report.md',
  );
}
