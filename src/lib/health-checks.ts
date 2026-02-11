import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface CheckResult {
  status: "ok" | "warning" | "error";
  latency?: number;
  message?: string;
}

export interface HealthCheckResults {
  overall: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: CheckResult;
    auth: CheckResult;
    errorRate: CheckResult;
    xero: CheckResult;
  };
  timestamp: string;
}

export async function runHealthChecks(): Promise<HealthCheckResults> {
  const supabase = createServiceRoleClient();

  const [database, auth, errorRate, xero] = await Promise.all([
    checkDatabase(supabase),
    checkAuth(supabase),
    checkErrorRate(supabase),
    checkXero(supabase),
  ]);

  const checks = { database, auth, errorRate, xero };

  const hasError = Object.values(checks).some((c) => c.status === "error");
  const hasWarning = Object.values(checks).some((c) => c.status === "warning");

  return {
    overall: hasError ? "unhealthy" : hasWarning ? "degraded" : "healthy",
    checks,
    timestamp: new Date().toISOString(),
  };
}

async function checkDatabase(supabase: ReturnType<typeof createServiceRoleClient>): Promise<CheckResult> {
  try {
    const start = Date.now();
    const { error } = await supabase.from("businesses").select("id").limit(1);
    const latency = Date.now() - start;
    if (error) return { status: "error", latency, message: error.message };
    return { status: "ok", latency };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function checkAuth(supabase: ReturnType<typeof createServiceRoleClient>): Promise<CheckResult> {
  try {
    const start = Date.now();
    const { error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const latency = Date.now() - start;
    if (error) return { status: "error", latency, message: error.message };
    return { status: "ok", latency };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function checkErrorRate(supabase: ReturnType<typeof createServiceRoleClient>): Promise<CheckResult> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("client_error_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo);

    if (error) {
      // Table may not exist — treat as OK
      return { status: "ok", message: "Error log table unavailable" };
    }

    const rate = count ?? 0;
    if (rate > 50) return { status: "error", message: `${rate} errors/hr` };
    if (rate > 10) return { status: "warning", message: `${rate} errors/hr` };
    return { status: "ok", message: `${rate} errors/hr` };
  } catch {
    return { status: "ok", message: "Error log check unavailable" };
  }
}

async function checkXero(supabase: ReturnType<typeof createServiceRoleClient>): Promise<CheckResult> {
  try {
    const { data: rawData, error } = await supabase
      .from("xero_connections")
      .select("id, business_id, is_active, token_expires_at, last_synced_at");

    if (error) {
      return { status: "ok", message: "Xero table unavailable" };
    }

    const data = rawData?.filter(c => c.is_active) || [];

    if (data.length === 0) {
      return { status: "ok", message: "No active Xero connections" };
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const issues: string[] = [];

    for (const conn of data) {
      if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < now + oneDayMs) {
        issues.push(`Token expiring soon (business ${conn.business_id})`);
      }
      if (conn.last_synced_at && now - new Date(conn.last_synced_at).getTime() > oneDayMs) {
        issues.push(`Stale sync (business ${conn.business_id})`);
      }
    }

    if (issues.length > 0) {
      return { status: "warning", message: issues.join("; ") };
    }
    return { status: "ok", message: `${data.length} active connections` };
  } catch {
    return { status: "ok", message: "Xero check unavailable" };
  }
}
