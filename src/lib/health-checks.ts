import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  ACCESS_TOKEN_TTL_MS,
  TOKEN_VERIFIED_WINDOW_MS,
  FIRST_SYNC_GRACE_MS,
} from "@/lib/xero/connection-status";

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

type SyncClockLookup = {
  ok: boolean;
  byTenant: Map<string, number>;
  /** Why the lookup failed, so a caller can name the cause; null when it answered. */
  error: string | null;
};

/** The database function behind the lookup (migration 20260915050000). */
const SYNC_CLOCK_RPC = "last_xero_sync_by_tenant";

/** A job in either state landed its numbers. Must match the function's status filter. */
const SYNCED_STATUSES = ["success", "partial"];

/**
 * Rows the fallback asks for per page. PostgREST may cap a page lower; the read
 * advances by the rows it actually received, so a lower cap costs pages, never rows.
 */
const FALLBACK_PAGE_ROWS = 1000;

/**
 * Past this many pages the fallback gives up and reports a failed lookup rather
 * than read without bound. 50 full pages is 15× the 60-day window's rows on
 * 15 Sep 2026.
 */
const FALLBACK_MAX_PAGES = 50;

/**
 * REL-N2: each Xero tenant's most recent successful sync — `sync_jobs.finished_at`
 * of a success or partial job. Keyed by the STABLE Xero `tenant_id`, which
 * sidesteps the dual business-id problem entirely (xero_connections and
 * sync_jobs key business_id to different id-spaces, but both carry the same
 * tenant_id). Callers fold it with `xero_connections.last_synced_at`, most
 * recent wins, so either clock moving is enough.
 *
 * The database computes it: `last_xero_sync_by_tenant` returns one jsonb value,
 * one entry per tenant. This used to fetch every successful row in the window
 * and reduce them here, but PostgREST returns at most 1,000 rows per request.
 * On 15 Sep 2026 the 60-day window held 3,214, and a read of that shape takes
 * the oldest 1,000: run on prod, 12 of 15 tenants read ~3 weeks stale and 3
 * were missing — under ok:true.
 *
 * Code deploys on merge and the migration is applied by hand afterwards. Until
 * it is, the function is missing (PGRST202/42883), and this reads the window
 * page by page instead: more requests, never a partial answer.
 *
 * Returns `{ok, byTenant}`. `ok` is false when the lookup failed or did not
 * read the whole window, and the map is then empty.
 *
 * This used to return a bare empty Map on error, described as degrading
 * gracefully. It wasn't graceful — an empty map is indistinguishable from "no
 * tenant has synced", and every caller read that as a reason to say nothing.
 * "Degrade gracefully" meant "degrade to green". Callers must now branch on `ok`
 * and report `unknown` rather than inventing freshness they could not measure.
 */
export async function getLastSyncByTenant(
  supabase: ReturnType<typeof createServiceRoleClient>,
  windowDays = 7,
): Promise<{ ok: boolean; byTenant: Map<string, number> }> {
  return getLastSyncByTenantSince(supabase, Date.now() - windowDays * 24 * 60 * 60 * 1000);
}

/**
 * The same lookup from an explicit instant instead of `windowDays` back from
 * now: each tenant's latest success/partial finish at or after `sinceMs`. For a
 * caller that measures its window from its own clock — sync coverage takes
 * `nowMs`. A failed lookup also carries `error`, so that caller can report why.
 */
export async function getLastSyncByTenantSince(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sinceMs: number,
): Promise<SyncClockLookup> {
  const sinceIso = new Date(sinceMs).toISOString();
  const { data, error } = await supabase.rpc(SYNC_CLOCK_RPC, { p_since: sinceIso });
  if (!error) return syncClockFromRpc(data);
  if (error.code !== "PGRST202" && error.code !== "42883") {
    return failedLookup(`${SYNC_CLOCK_RPC}: ${error.message}`);
  }

  // Correct, but many requests where one would do — and a migration left
  // unapplied would otherwise go unnoticed, because the pills stay right.
  Sentry.captureMessage(`[health-checks] ${SYNC_CLOCK_RPC} is missing — reading sync_jobs page by page`, {
    level: "warning",
    tags: { invariant: "sync_clock_rpc_missing" },
    extra: { code: error.code, message: error.message },
  } as never);
  return readSyncClockByPages(supabase, sinceIso);
}

function failedLookup(error: string): SyncClockLookup {
  return { ok: false, byTenant: new Map(), error };
}

/** The function's reply: one object of tenant_id → ISO finished_at, or the lookup failed. */
function syncClockFromRpc(data: unknown): SyncClockLookup {
  // null (the function is STRICT), an array or a scalar is not the object it returns.
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return failedLookup(`${SYNC_CLOCK_RPC}: the reply is not a {tenant_id: finished_at} object`);
  }
  const byTenant = new Map<string, number>();
  for (const [tenantId, finishedAt] of Object.entries(data)) {
    const ts = typeof finishedAt === "string" ? new Date(finishedAt).getTime() : NaN;
    // Skipping an unreadable entry would leave that tenant looking unsynced.
    if (!tenantId || !Number.isFinite(ts)) {
      return failedLookup(`${SYNC_CLOCK_RPC}: unreadable entry for tenant "${tenantId}"`);
    }
    byTenant.set(tenantId, ts);
  }
  return { ok: true, byTenant, error: null };
}

/**
 * The same answer from the rows themselves, for as long as the function is not
 * deployed. Pages follow a total order (finished_at, then id) so an offset means
 * the same row on every request. A job finishing mid-read can only add a row,
 * which at worst repeats one already seen — harmless to a maximum. Nothing
 * deletes sync_jobs rows or moves one out of success/partial.
 */
async function readSyncClockByPages(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sinceIso: string,
): Promise<SyncClockLookup> {
  const byTenant = new Map<string, number>();
  let offset = 0;
  for (let page = 0; page < FALLBACK_MAX_PAGES; page++) {
    // `.gte("finished_at", ...)` also excludes NULL finished_at (a still-running
    // or never-finalized job), so no explicit not-null filter is needed.
    const { data, error } = await supabase
      .from("sync_jobs")
      .select("tenant_id, finished_at")
      .in("status", SYNCED_STATUSES)
      .gte("finished_at", sinceIso)
      .order("finished_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + FALLBACK_PAGE_ROWS - 1);
    // The pages already read are only part of the window.
    if (error || !Array.isArray(data)) {
      return failedLookup(`sync_jobs page ${page + 1}: ${error?.message ?? "no rows array in the reply"}`);
    }
    // Only an EMPTY page ends the read: a short one can be PostgREST's row cap.
    if (data.length === 0) return { ok: true, byTenant, error: null };
    for (const row of data as Array<{ tenant_id: string | null; finished_at: string | null }>) {
      // tenant_id '' is the outer per-business row, which names no org.
      if (!row.tenant_id || !row.finished_at) continue;
      const ts = new Date(row.finished_at).getTime();
      const prev = byTenant.get(row.tenant_id);
      if (prev == null || ts > prev) byTenant.set(row.tenant_id, ts);
    }
    offset += data.length;
  }
  return failedLookup(`sync_jobs: the window did not end within ${FALLBACK_MAX_PAGES} pages`);
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
      .select("id, business_id, tenant_id, is_active, expires_at, last_synced_at, created_at");

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
    const { ok: syncLookupOk, byTenant: lastSyncByTenant } = await getLastSyncByTenant(supabase);
    if (!syncLookupOk) {
      return { status: "error", message: "Xero sync-freshness lookup failed — connection health is unknown" };
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const issues: string[] = [];

    for (const conn of data) {
      // Was: `expires_at < now + 24h`. Xero access tokens live THIRTY MINUTES, so
      // that was true for every active connection on every run — a spurious
      // "Token expiring soon" line per client in every daily email, drowning the
      // one line that would matter. The real question is whether the refresh pipe
      // is still producing tokens, which is the auth axis: expires_at minus the
      // token TTL is when Xero last granted one.
      const expiresMs = conn.expires_at ? new Date(conn.expires_at).getTime() : NaN;
      if (!Number.isFinite(expiresMs)) {
        issues.push(`Token expiry unreadable (business ${conn.business_id})`);
      } else if (now - (expiresMs - ACCESS_TOKEN_TTL_MS) > TOKEN_VERIFIED_WINDOW_MS) {
        issues.push(`Token not refreshing (business ${conn.business_id})`);
      }

      const lastConnSync = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0;
      const lastJobSync = conn.tenant_id ? lastSyncByTenant.get(conn.tenant_id) ?? 0 : 0;
      const freshest = Math.max(lastConnSync, lastJobSync);
      if (freshest === 0) {
        // Was exempted outright, on the reasoning that a brand-new connection is
        // not "stale". True for an hour, false forever after — a connection that
        // NEVER synced was invisible to this check for the rest of time. The
        // exemption now expires after the first-sync grace window.
        const connectedMs = conn.created_at ? new Date(conn.created_at).getTime() : 0;
        if (connectedMs > 0 && now - connectedMs > FIRST_SYNC_GRACE_MS) {
          issues.push(`Never synced since connecting (business ${conn.business_id})`);
        }
      } else if (now - freshest > oneDayMs) {
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
