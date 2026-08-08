import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks, getLastSyncByTenant } from "@/lib/health-checks";
import { checkAnthropicModels } from "@/lib/ai/model-health";
import { getXeroSyncCoverage, describeSyncCoverage } from "@/lib/xero/sync-coverage";
import {
  ACCESS_TOKEN_TTL_MS,
  TOKEN_VERIFIED_WINDOW_MS,
  FIRST_SYNC_GRACE_MS,
} from "@/lib/xero/connection-status";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import * as Sentry from '@sentry/nextjs'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { APP_NAME } from '@/lib/config/brand'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { monitorCron } from '@/lib/cron/monitor'

const CRON_PATH = '/api/cron/daily-health-report'

const BRAND_ORANGE = "#F5821F";
const BRAND_NAVY = "#172238";
const LOGO_URL = "https://wisdombi.ai/images/logo-main.png";

async function getHandler(request: NextRequest) {
  // Verify cron auth.
  // Fail-closed: reject when CRON_SECRET is unset so a missing secret can never
  // silently reopen this endpoint to unauthenticated callers (`Bearer undefined`).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });
  }

  try {
    // Run health checks
    const health = await runHealthChecks();

    // AI-model safeguard: ping every Anthropic model the app uses against the
    // prod key. A retired/inaccessible model fails fast (404 not_found) — this
    // catches it here, before a coach hits it. (The failure that silently
    // shipped `claude-sonnet-4-20250514` would have surfaced the next morning.)
    const aiHealth = await checkAnthropicModels();

    // Gather daily stats
    const supabase = createServiceRoleClient();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries for stats
    const [
      errorSummaryResult,
      activeUsers24hResult,
      activeUsers7dResult,
      totalBusinessesResult,
      staleBusinessesResult,
      xeroConnectionsResult,
    ] = await Promise.all([
      // Error summary (24h) grouped by type
      supabase
        .from("client_error_logs")
        .select("error_type")
        .gte("created_at", oneDayAgo),
      // Active users 24h
      supabase
        .from("activity_log")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      // Active users 7d
      supabase
        .from("activity_log")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
      // Total businesses
      supabase
        .from("businesses")
        .select("*", { count: "exact", head: true }),
      // Stale businesses (no activity in 30+ days)
      supabase
        .from("businesses")
        .select("id, name, updated_at")
        .lt("updated_at", thirtyDaysAgo),
      // Xero connections with issues.
      // REL-N1: the column is `expires_at`, not the nonexistent `token_expires_at`
      // (which silently errored this query). tenant_id enables the sync_jobs
      // freshness join below.
      supabase
        .from("xero_connections")
        .select("id, business_id, tenant_id, is_active, expires_at, last_synced_at, created_at"),
    ]);

    // REL-N2: cron-safe sync freshness keyed on the stable Xero tenant_id.
    // last_synced_at alone false-positives "stale" on cron-only tenants because
    // the cron only recently started writing it.
    const { ok: syncLookupOk, byTenant: lastSyncByTenant } = await getLastSyncByTenant(supabase);

    // Did every business that should have synced actually sync? This is the only
    // check in the system that can notice a connection nobody even ATTEMPTED — a
    // cron budget cutoff leaves its unreached businesses with no result, no
    // sync_jobs row and no heartbeat, so every per-connection check passes them
    // over in silence.
    const coverage = await getXeroSyncCoverage(supabase);
    const coverageLine = describeSyncCoverage(coverage);
    if (coverageLine) {
      Sentry.captureMessage(coverageLine, {
        level: coverage.ok ? 'warning' : 'error',
        tags: { invariant: 'xero_sync_coverage_gap' },
        extra: {
          expected: coverage.expected,
          covered: coverage.covered,
          uncheckable: coverage.uncheckable,
          missing: coverage.missing,
        },
      } as never);
    }

    // Process error summary
    const errorCounts: Record<string, number> = {};
    if (errorSummaryResult.data) {
      for (const row of errorSummaryResult.data) {
        const type = (row as { error_type?: string }).error_type || "unknown";
        errorCounts[type] = (errorCounts[type] || 0) + 1;
      }
    }

    // Process xero issues
    const xeroIssues: string[] = [];
    if (xeroConnectionsResult.data) {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const all = xeroConnectionsResult.data as any[];
      const activeConnections = all.filter((c: any) => c.is_active);

      // A disconnected business used to make this email GREENER, because the
      // filter above ran before any issue was raised and a dead row simply
      // vanished from the report. Count them.
      const deadCount = all.length - activeConnections.length;
      if (deadCount > 0) {
        xeroIssues.push(`${deadCount} Xero connection${deadCount > 1 ? 's' : ''} disconnected — needs reconnect`);
      }

      if (!syncLookupOk) {
        xeroIssues.push('Xero sync-freshness lookup failed — data currency is UNKNOWN for every business');
      }

      for (const conn of activeConnections) {
        // Was `expires_at < now + 24h`, which is true for every active
        // connection on every run because Xero access tokens live 30 minutes —
        // a spurious line per client in every email, burying the one line that
        // means something. The real question is whether the refresh pipe is
        // still producing tokens.
        const expiresMs = conn.expires_at ? new Date(conn.expires_at).getTime() : NaN;
        if (!Number.isFinite(expiresMs)) {
          xeroIssues.push(`Xero token expiry unreadable (business ${conn.business_id})`);
        } else if (now.getTime() - (expiresMs - ACCESS_TOKEN_TTL_MS) > TOKEN_VERIFIED_WINDOW_MS) {
          xeroIssues.push(`Xero token not refreshing (business ${conn.business_id})`);
        }

        const lastConnSync = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0;
        const lastJobSync = conn.tenant_id ? lastSyncByTenant.get(conn.tenant_id) ?? 0 : 0;
        const freshest = Math.max(lastConnSync, lastJobSync);
        if (freshest === 0) {
          // The old exemption for never-synced connections had no expiry, so a
          // connection that never worked stayed invisible forever.
          const connectedMs = conn.created_at ? new Date(conn.created_at).getTime() : 0;
          if (connectedMs > 0 && now.getTime() - connectedMs > FIRST_SYNC_GRACE_MS) {
            xeroIssues.push(`Xero never synced since connecting (business ${conn.business_id})`);
          }
        } else if (now.getTime() - freshest > oneDayMs) {
          xeroIssues.push(`Xero sync stale (business ${conn.business_id})`);
        }
      }
    }

    const staleBusinessCount = staleBusinessesResult.data?.length ?? 0;

    // Metric invariants — the daily plausibility checks over the Xero mirror.
    // These previously would have reported to Sentry ONLY, which in practice
    // means an alert nobody sees; a check that fires where no one is looking
    // has the same value as no check at all. Stale/missing results are
    // themselves a finding — the checker going quiet looks exactly like
    // everything being fine.
    const invariantRun = await supabase
      .from('metric_invariant_runs')
      .select('check_name, severity, subject, observed, threshold, passed, run_at')
      .order('run_at', { ascending: false })
      .limit(200);
    const latestRunAt = invariantRun.data?.[0]?.run_at ?? null;
    const invariantRows = (invariantRun.data ?? []).filter((r) => r.run_at === latestRunAt);
    const invariantFailures = invariantRows.filter((r) => !r.passed);
    const invariantAgeHours = latestRunAt
      ? (now.getTime() - Date.parse(latestRunAt)) / 3_600_000
      : null;
    const invariantStale = invariantAgeHours == null || invariantAgeHours > 36;

    // Build attention items
    const attentionItems: string[] = [];
    if (invariantStale) {
      attentionItems.push(
        latestRunAt
          ? `Metric invariant checks are STALE — last run ${Math.round(invariantAgeHours!)}h ago`
          : 'Metric invariant checks have NEVER run — the mirror is unchecked',
      );
    } else {
      // Only warn/critical failures escalate to Attention. 'watch' failures are
      // shown in their own section but never here — a permanently-orange line
      // trains the reader to skim past the whole list.
      for (const f of invariantFailures.filter((r) => r.severity !== 'watch')) {
        attentionItems.push(`Metric invariant FAILED: ${f.check_name} (${f.subject}) — ${f.observed} vs ${f.threshold}`);
      }
    }
    if (staleBusinessCount > 0) {
      attentionItems.push(`${staleBusinessCount} business${staleBusinessCount > 1 ? "es" : ""} inactive >30 days`);
    }
    xeroIssues.forEach((i) => attentionItems.push(i));
    // The coverage gap goes at the TOP of attention items. It is the only line
    // that can say "a business produced nothing at all last night", which
    // outranks any per-connection complaint about a business that did report in.
    if (coverageLine) attentionItems.unshift(coverageLine);
    if (!aiHealth.skipped) {
      for (const f of aiHealth.failures) {
        attentionItems.push(`AI model unavailable: ${f.model}${f.error ? ` — ${f.error}` : ''}`);
      }
    }

    // Status indicator
    const statusColor = health.overall === "healthy" ? "#22c55e" : health.overall === "degraded" ? "#f59e0b" : "#ef4444";
    const statusLabel = health.overall.charAt(0).toUpperCase() + health.overall.slice(1);

    const checkRow = (name: string, check: { status: string; latency?: number; message?: string }) => {
      const icon = check.status === "ok" ? "&#9679;" : check.status === "warning" ? "&#9888;" : "&#10060;";
      const color = check.status === "ok" ? "#22c55e" : check.status === "warning" ? "#f59e0b" : "#ef4444";
      const detail = check.latency ? `(${check.latency}ms)` : check.message ? `(${check.message})` : "";
      return `<tr><td style="padding:4px 12px;color:${color};">${icon}</td><td style="padding:4px 12px;">${name}</td><td style="padding:4px 12px;color:#6b7280;">${detail}</td></tr>`;
    };

    const dateStr = now.toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Australia/Sydney",
    });

    const errorSection =
      Object.keys(errorCounts).length > 0
        ? Object.entries(errorCounts)
            .map(([type, count]) => `<li>${type}: ${count}</li>`)
            .join("")
        : "<li>No errors recorded</li>";

    const attentionSection =
      attentionItems.length > 0
        ? attentionItems.map((item) => `<li style="color:${BRAND_ORANGE};">${item}</li>`).join("")
        : `<li style="color:#22c55e;">Nothing needs attention</li>`;

    const invariantSection = invariantStale
      ? `<li style="color:${BRAND_ORANGE};">${latestRunAt ? `Checker stale — last run ${Math.round(invariantAgeHours!)}h ago` : 'Checker has never run'}</li>`
      : invariantFailures.length > 0
        ? invariantFailures
            .map((f) => `<li style="color:${f.severity === 'watch' ? '#6b7280' : BRAND_ORANGE};">${f.check_name} — ${f.subject}: observed ${f.observed} vs threshold ${f.threshold}${f.severity === 'watch' ? ' (watch)' : ''}</li>`)
            .join('')
        : `<li style="color:#22c55e;">All ${invariantRows.length} checks passed</li>`;

    const aiModelsSection = aiHealth.skipped
      ? `<tr><td style="padding:4px 12px;color:#6b7280;">No ANTHROPIC_API_KEY configured — AI models not checked.</td></tr>`
      : aiHealth.results
          .map((r) => {
            const icon = r.ok ? "&#9679;" : "&#10060;";
            const color = r.ok ? "#22c55e" : "#ef4444";
            const detail = r.ok ? "reachable" : (r.error ?? "failed");
            return `<tr><td style="padding:4px 12px;color:${color};">${icon}</td><td style="padding:4px 12px;font-family:monospace;font-size:12px;">${r.model}</td><td style="padding:4px 12px;color:#6b7280;font-size:12px;">${detail}</td></tr>`;
          })
          .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="text-align:center;margin-bottom:24px;">
    <img src="${LOGO_URL}" alt="${APP_NAME}" style="max-width:160px;height:auto;" />
  </div>
  <h2 style="color:${BRAND_NAVY};text-align:center;margin-bottom:4px;">Daily Health Report</h2>
  <p style="text-align:center;color:#6b7280;margin-top:0;">${dateStr}</p>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">System Status: <span style="color:${statusColor};">&#9679; ${statusLabel}</span></h3>
    <table style="width:100%;font-size:14px;">
      ${checkRow("Database", health.checks.database)}
      ${checkRow("Auth", health.checks.auth)}
      ${checkRow("Error Rate", health.checks.errorRate)}
      ${checkRow("Xero", health.checks.xero)}
    </table>
  </div>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">AI Models <span style="font-weight:400;font-size:13px;color:#6b7280;">(pinged against the prod key)</span></h3>
    <table style="width:100%;font-size:14px;">
      ${aiModelsSection}
    </table>
  </div>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">Metric Invariants <span style="font-weight:400;font-size:13px;color:#6b7280;">(daily plausibility checks over the Xero mirror)</span></h3>
    <ul style="margin:0;padding-left:20px;font-size:14px;">
      ${invariantSection}
    </ul>
  </div>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">24-Hour Activity</h3>
    <table style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 12px;">Active users (24h)</td><td style="padding:4px 12px;font-weight:600;">${activeUsers24hResult.count ?? "N/A"}</td></tr>
      <tr><td style="padding:4px 12px;">Active users (7d)</td><td style="padding:4px 12px;font-weight:600;">${activeUsers7dResult.count ?? "N/A"}</td></tr>
      <tr><td style="padding:4px 12px;">Total businesses</td><td style="padding:4px 12px;font-weight:600;">${totalBusinessesResult.count ?? "N/A"}</td></tr>
    </table>
  </div>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">Errors (24h)</h3>
    <ul style="font-size:14px;margin:0;padding-left:20px;">${errorSection}</ul>
  </div>

  <div style="background:white;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;">
    <h3 style="margin-top:0;color:${BRAND_NAVY};">Attention Needed</h3>
    <ul style="font-size:14px;margin:0;padding-left:20px;">${attentionSection}</ul>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    ${APP_NAME} - Daily Health Report<br>Generated at ${now.toISOString()}
  </p>
</body>
</html>`;

    // Escalate AI-model failures to Sentry (alert channel #2 — the audit trail).
    if (!aiHealth.ok && !aiHealth.skipped) {
      Sentry.captureMessage(
        `[ai-health] ${aiHealth.failures.length} Anthropic model(s) unavailable: ${aiHealth.failures.map((f) => f.model).join(", ")}`,
        {
          level: "error",
          tags: { route: "cron/daily-health-report", invariant: "ai_model_unavailable" },
          extra: { failures: aiHealth.failures },
        } as any,
      );
    }

    const aiAlert = !aiHealth.ok && !aiHealth.skipped ? "⚠️ AI MODELS — " : "";
    const result = await sendEmail({
      to: adminEmail,
      subject: `${aiAlert}${APP_NAME} Health Report — ${statusLabel} — ${dateStr}`,
      html,
    });

    // REL-N7: a failed health-report send was previously only recorded as a
    // 'partial' heartbeat — so the report silently failing to reach the admin
    // alerted no one. Surface it to Sentry so the missing report pages.
    if (!result.success) {
      Sentry.captureMessage('Daily health report: email send failed', {
        level: 'warning',
        tags: { route: 'cron/daily-health-report', invariant: 'cron_daily_health_report_send_failed' },
        extra: { error: (result as { error?: unknown }).error, health_overall: health.overall },
      } as any);
    }

    // Phase 69-04 — invocation heartbeat. Health.overall feeds metadata so a
    // cadence query can also observe the system-wide health summary the
    // report emailed out.
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: result.success ? 'success' : 'partial',
      metadata: { health_overall: health.overall, email_sent: !!result.success, ai_models_ok: aiHealth.skipped ? null : aiHealth.ok },
    });

    return NextResponse.json({ success: result.success, health: health.overall });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/daily-health-report' }, extra: { context: "[Daily Health Report] Error" } } as any);
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Input-less cron GET (auth via Bearer header) — observe wrapper, permissive empty schema.
export const GET = withQuerySchema(
  'cron/daily-health-report',
  z.object({}),
  monitorCron(
    CRON_PATH,
    getHandler as unknown as (request: Request) => Promise<Response>,
  ),
);
