import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health-checks";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";

const BRAND_ORANGE = "#F5821F";
const BRAND_NAVY = "#172238";
const LOGO_URL = "https://wisdombi.ai/images/logo-main.png";

export async function GET(request: NextRequest) {
  // Verify cron auth
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });
  }

  try {
    // Run health checks
    const health = await runHealthChecks();

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
      // Xero connections with issues
      supabase
        .from("xero_connections")
        .select("id, business_id, is_active, token_expires_at, last_synced_at"),
    ]);

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
      const activeConnections = xeroConnectionsResult.data.filter((c: any) => c.is_active);
      for (const conn of activeConnections) {
        if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < now.getTime() + oneDayMs) {
          xeroIssues.push(`Xero token expiring soon (business ${conn.business_id})`);
        }
        if (conn.last_synced_at && now.getTime() - new Date(conn.last_synced_at).getTime() > oneDayMs) {
          xeroIssues.push(`Xero sync stale (business ${conn.business_id})`);
        }
      }
    }

    const staleBusinessCount = staleBusinessesResult.data?.length ?? 0;

    // Build attention items
    const attentionItems: string[] = [];
    if (staleBusinessCount > 0) {
      attentionItems.push(`${staleBusinessCount} business${staleBusinessCount > 1 ? "es" : ""} inactive >30 days`);
    }
    xeroIssues.forEach((i) => attentionItems.push(i));

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

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="text-align:center;margin-bottom:24px;">
    <img src="${LOGO_URL}" alt="WisdomBI" style="max-width:160px;height:auto;" />
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
    WisdomBI - Daily Health Report<br>Generated at ${now.toISOString()}
  </p>
</body>
</html>`;

    const result = await sendEmail({
      to: adminEmail,
      subject: `WisdomBI Health Report — ${statusLabel} — ${dateStr}`,
      html,
    });

    return NextResponse.json({ success: result.success, health: health.overall });
  } catch (err) {
    console.error("[Daily Health Report] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
