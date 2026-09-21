/**
 * Did every business that SHOULD have synced actually sync?
 *
 * Nothing in this codebase asked that question, and its absence is why a broken
 * Xero pipeline could stay invisible. Every existing check looks at one
 * connection and asks "does this look alright?" — a question that a dead
 * connection can pass, and that a connection nobody even attempted never gets
 * asked at all.
 *
 * This asks the complementary question, which is a set difference rather than a
 * per-row predicate:
 *
 *     expected = active connections that could have synced
 *     covered  = connections with a successful sync_jobs row in the window
 *     missing  = expected − covered
 *
 * That single comparison catches every failure mode the per-connection checks
 * are structurally blind to:
 *
 *   - the sync cron ran out of budget part-way through the fleet (businesses past the
 *     cutoff leave NO trace: no result, no sync_jobs row, no heartbeat entry)
 *   - the cron was never invoked at all
 *   - the orchestrator threw before the loop
 *   - one tenant's token died while the rest carried on
 *   - a connection exists but nothing has ever tried to sync it
 *
 * The window is deliberately 26h: with the 6-hourly schedule a healthy
 * connection syncs at least 4× inside it, so a miss means an entire DAY of
 * runs skipped that connection — ordinary drift never trips it.
 */

import { createServiceRoleClient } from '@/lib/supabase/admin';
import { getLastSyncByTenantSince } from '@/lib/health-checks';

/** 26h — see the module note. One tolerated late run, not two skipped nights. */
export const SYNC_COVERAGE_WINDOW_MS = 26 * 60 * 60 * 1000;

export interface MissingSync {
  connectionId: string;
  businessId: string;
  tenantId: string;
  tenantName: string | null;
}

export interface SyncCoverage {
  /** False when a query failed — the numbers below are then meaningless. */
  ok: boolean;
  error: string | null;
  expected: number;
  covered: number;
  missing: MissingSync[];
  /** Active connections with a blank tenant_id: they cannot be checked at all. */
  uncheckable: number;
}

export async function getXeroSyncCoverage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  nowMs: number = Date.now(),
  windowMs: number = SYNC_COVERAGE_WINDOW_MS,
): Promise<SyncCoverage> {
  const empty: SyncCoverage = { ok: true, error: null, expected: 0, covered: 0, missing: [], uncheckable: 0 };

  const { data: conns, error: connError } = await supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name')
    .eq('is_active', true);

  // A failed query must not read as "nothing is missing". That equivalence —
  // between "no problems found" and "could not look" — is the single mistake
  // this whole area kept making.
  if (connError) {
    return { ...empty, ok: false, error: `connection query failed: ${connError.message}` };
  }

  const active = (conns ?? []) as Array<{
    id: string;
    business_id: string;
    tenant_id: string | null;
    tenant_name: string | null;
  }>;

  // A blank tenant_id cannot be joined to sync_jobs, so such a row can be
  // neither confirmed nor faulted. Counted separately rather than quietly
  // dropped from the denominator, which would flatter the coverage number.
  const checkable = active.filter((c) => (c.tenant_id ?? '').trim() !== '');
  const uncheckable = active.length - checkable.length;

  if (checkable.length === 0) {
    return { ...empty, uncheckable };
  }

  // Which tenants synced in the window comes from the per-tenant sync clock the
  // CFO board and the connection pills read: one reply, one entry per tenant.
  // This used to read the jobs themselves, unordered and unpaged. PostgREST
  // returns at most 1,000 rows, and an unordered read that hits the cap gets
  // the OLDEST ones — so a busy window would drop the newest tenants and list
  // connections that did sync as "did NOT sync".
  const clock = await getLastSyncByTenantSince(supabase, nowMs - windowMs);

  if (!clock.ok) {
    return { ...empty, ok: false, error: `sync clock lookup failed: ${clock.error}`, uncheckable };
  }

  // The clock never includes the outer per-BUSINESS sync_jobs row (tenant_id
  // = ''). Trim and drop blanks anyway, so the keys join the trimmed ids below.
  const syncedTenants = new Set(
    [...clock.byTenant.keys()].map((t) => t.trim()).filter((t) => t !== ''),
  );

  const missing: MissingSync[] = checkable
    .filter((c) => !syncedTenants.has((c.tenant_id ?? '').trim()))
    .map((c) => ({
      connectionId: c.id,
      businessId: c.business_id,
      tenantId: (c.tenant_id ?? '').trim(),
      tenantName: c.tenant_name,
    }));

  return {
    ok: true,
    error: null,
    expected: checkable.length,
    covered: checkable.length - missing.length,
    missing,
    uncheckable,
  };
}

/** One line for the daily email. Null when there is genuinely nothing to say. */
export function describeSyncCoverage(c: SyncCoverage): string | null {
  if (!c.ok) {
    return `Xero sync coverage UNKNOWN — ${c.error ?? 'check failed'}`;
  }
  const parts: string[] = [];
  if (c.missing.length > 0) {
    const names = c.missing.map((m) => m.tenantName || m.tenantId).slice(0, 10);
    const overflow = c.missing.length - names.length;
    parts.push(
      `${c.missing.length} of ${c.expected} Xero connections did NOT sync in the last 26h: ` +
        names.join(', ') +
        (overflow > 0 ? ` (+${overflow} more)` : ''),
    );
  }
  if (c.uncheckable > 0) {
    parts.push(`${c.uncheckable} active connection${c.uncheckable > 1 ? 's have' : ' has'} no tenant id and cannot be checked`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
