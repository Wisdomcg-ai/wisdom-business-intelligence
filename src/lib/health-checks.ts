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

/**
 * REL-N2: derive each tenant's most-recent successful sync time from
 * `sync_jobs.finished_at` — the timestamp the sync orchestrator + nightly cron
 * write via `finalize_xero_sync_job`. Keyed by the STABLE Xero `tenant_id`,
 * which sidesteps the dual business-id problem entirely (xero_connections and
 * sync_jobs may key business_id to different id-spaces, but both carry the same
 * Xero tenant_id).
 *
 * Why this exists: the nightly cron sync does NOT update
 * `xero_connections.last_synced_at`, so a freshness check that reads only that
 * column false-positives "stale" on every cron-only tenant. This map is the
 * authoritative freshness signal; `last_synced_at` is treated as a secondary
 * hint and the two are combined (most-recent-wins) by callers.
 *
 * Returns `Map<tenant_id, finished_at_ms>`. On query error returns an empty map
 * so callers degrade gracefully to the `last_synced_at`-only signal rather than
 * going dark.
 */
export async function getLastSyncByTenant(
  supabase: ReturnType<typeof createServiceRoleClient>,
  windowDays = 7,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  // `.gte("finished_at", ...)` also excludes NULL finished_at (a still-running
  // or never-finalized job), so no explicit not-null filter is needed.
  const { data, error } = await supabase
    .from("sync_jobs")
    .select("tenant_id, finished_at")
    .in("status", ["success", "partial"])
    .gte("finished_at", sinceIso);
  if (error || !data) return out;
  for (const row of data as Array<{ tenant_id: string | null; finished_at: string | null }>) {
    if (!row.tenant_id || !row.finished_at) continue;
    const ts = new Date(row.finished_at).getTime();
    const prev = out.get(row.tenant_id);
    if (prev == null || ts > prev) out.set(row.tenant_id, ts);
  }
  return out;
}

async function checkXero(supabase: ReturnType<typeof createServiceRoleClient>): Promise<CheckResult> {
  try {
    // REL-N1: the column is `expires_at`, NOT `token_expires_at`. The old name
    // does not exist on xero_connections, so PostgREST errored on every run and
    // the swallow-to-"ok" path below made this detector permanently DARK — the
    // product's #1 incident class (connected-but-not-syncing) had no working
    // alarm. Selecting tenant_id enables the sync_jobs freshness join (REL-N2).
    const { data: rawData, error } = await supabase
      .from("xero_connections")
      .select("id, business_id, tenant_id, is_active, expires_at, last_synced_at");

    if (error) {
      // REL-N1: previously returned status:"ok" here, hiding real failures
      // (including the dead-column bug above). A failed health query is itself a
      // problem worth surfacing — mirror checkDatabase/checkAuth semantics.
      return { status: "error", message: `Xero connection query failed: ${error.message}` };
    }

    const data = (rawData ?? []).filter((c) => c.is_active);

    if (data.length === 0) {
      return { status: "ok", message: "No active Xero connections" };
    }

    // REL-N2: freshness from sync_jobs.finished_at (cron-safe), joined on tenant_id.
    const lastSyncByTenant = await getLastSyncByTenant(supabase);

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const issues: string[] = [];

    for (const conn of data) {
      if (conn.expires_at && new Date(conn.expires_at).getTime() < now + oneDayMs) {
        issues.push(`Token expiring soon (business ${conn.business_id})`);
      }
      const lastConnSync = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0;
      const lastJobSync = conn.tenant_id ? lastSyncByTenant.get(conn.tenant_id) ?? 0 : 0;
      const freshest = Math.max(lastConnSync, lastJobSync);
      // Only flag tenants that HAVE synced before but not within the last day.
      // A never-synced brand-new connection (freshest === 0) is not "stale".
      if (freshest > 0 && now - freshest > oneDayMs) {
        issues.push(`Stale sync (business ${conn.business_id})`);
      }
    }

    if (issues.length > 0) {
      return { status: "warning", message: issues.join("; ") };
    }
    return { status: "ok", message: `${data.length} active connections` };
  } catch (err) {
    // REL-N1: previously swallowed to status:"ok". Surface the failure instead.
    return { status: "error", message: err instanceof Error ? err.message : "Xero check failed" };
  }
}
