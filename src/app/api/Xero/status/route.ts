/**
 * GET /api/Xero/status?business_id=
 *
 * One business's Xero connection — every org of it. Read by the banner above the
 * monthly report, the forecast and cashflow pages, the integrations page, and the
 * token keepalive those pages run every ten minutes.
 *
 * ── Why this was rewritten (2026-09-15) ─────────────────────────────────────
 * This route used `resolveXeroBusinessId`, which returns `connections[0]` of the
 * business's ACTIVE rows, and reported that one org as the business: connected,
 * expired, "Last synced". A multi-org business shares one created_at across its
 * rows, so the org was simply the lowest row id. For IICT Group that is IICT
 * Group Limited, which syncs fine — so the monthly report read "Connected to
 * Xero: IICT Group Limited · Last synced today" while IICT Group Pty Ltd had not
 * synced since 10 Sep 2026, and the /cfo board (#531) said data_stale for the
 * same business. Only that one org's token was kept fresh; dead rows were
 * invisible, so a business whose every org had died read "Not connected"; and a
 * failed read of xero_connections came back as "Not connected" too.
 *
 * Now:
 *   - every row under both id forms is read, dead rows included, and a failed
 *     read is a 500 — the pages render that as "couldn't check", never as
 *     "not connected";
 *   - EVERY live org's token is refreshed, then the rows are re-read, because a
 *     refresh moves expires_at and a refusal deactivates the row;
 *   - the business is classified by `classifyBusinessConnections` — each org on
 *     its own tenant's data clock, worst org wins — the same definition as the
 *     coach pill and the /cfo board;
 *   - the owner and team members get the owner's 72h data threshold, a coach or
 *     super admin the coach's 48h, exactly as /api/Xero/connection-health splits
 *     them by audience.
 *
 * Response: `status`, `status_scope`, `more_orgs_needing_attention`,
 * `last_sync_at`, `orgs`, `retired_orgs` are the answer. `connected`, `expired`,
 * `needsReconnect`, `connection` and `health` keep their names for older readers
 * and are now derived from the whole business (see XeroStatusResponse).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSupabaseSecretKey } from '@/lib/supabase/keys';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getValidAccessToken, checkConnectionHealth, type TokenRefreshResult } from '@/lib/xero/token-manager';
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds';
import { withQuerySchema } from '@/lib/api/with-schema';
import { getLastSyncByTenant } from '@/lib/health-checks';
import {
  classifyBusinessConnections,
  DATA_STALE_MS,
  OWNER_DATA_STALE_MS,
  type XeroConnectionStatusRow,
  type XeroOrgClassification,
} from '@/lib/xero/connection-status';
import type { XeroStatusOrg, XeroStatusResponse } from '@/lib/xero/business-status-view';

export const dynamic = 'force-dynamic';

// Use service key to bypass RLS — access is enforced in code below.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
  })
  .passthrough();

const CONNECTION_COLUMNS =
  'id, business_id, tenant_id, tenant_name, display_name, include_in_consolidation, is_active, last_synced_at, updated_at, expires_at, created_at';

type ConnectionRow = XeroConnectionStatusRow & { display_name?: string | null };

/** Same window as the pill and the board, so a cold tenant reads old rather than never. */
const SYNC_CLOCK_WINDOW_DAYS = 60;

const CHECK_FAILED = 'Could not check the Xero connection';

interface RefreshFailure {
  row: XeroConnectionStatusRow;
  result: TokenRefreshResult;
}

const orgName = (row: Pick<XeroConnectionStatusRow, 'tenant_name'>) => row.tenant_name?.trim() || 'Xero organisation';

function toOrgView(org: XeroOrgClassification, rows: readonly ConnectionRow[]): XeroStatusOrg {
  return {
    connection_id: org.connectionId,
    tenant_id: org.tenantId,
    tenant_name: org.tenantName,
    display_name: rows.find((r) => r.id === org.connectionId)?.display_name?.trim() || null,
    status: org.status,
    last_sync_at: org.lastSyncAt,
    last_refresh_at: org.lastTokenRefreshAt,
  };
}

async function getHandler(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('business_id');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', businessId)
      .maybeSingle();

    // 22P02: not a uuid, so no such business — a malformed id, not a failed check.
    if (businessError && businessError.code !== '22P02') {
      Sentry.captureException(businessError, { tags: { route: 'Xero/status' }, extra: { context: '[Xero Status] businesses read failed' } } as any);
      return NextResponse.json({ error: CHECK_FAILED }, { status: 500 });
    }
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Owner, assigned coach, active team member, or super_admin — the same people
    // the xero_connections RLS policy and /api/Xero/connection-health admit.
    const isOwner = business.owner_id === user.id;
    let isTeamMember = false;
    let allowed = isOwner || business.assigned_coach_id === user.id;
    if (!allowed) {
      const { data: memberships } = await supabaseAdmin
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
      isTeamMember = (memberships ?? []).length > 0;
      allowed = isTeamMember;
    }
    if (!allowed) {
      const { data: roleRow } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleRow?.role === 'super_admin') allowed = true;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Both id forms, dead rows included, in an order no write changes. The
    // classification does not depend on order; the refresh-failure message does.
    const ids = await resolveBusinessProfileIds(supabaseAdmin, businessId);
    const readConnections = () =>
      supabaseAdmin
        .from('xero_connections')
        .select(CONNECTION_COLUMNS)
        .in('business_id', ids.all)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

    const initial = await readConnections();
    if (initial.error) {
      // Reading this as "no rows" is how a failed check used to render as
      // "Not connected to Xero" above a report built from Xero data.
      Sentry.captureException(initial.error, { tags: { route: 'Xero/status' }, extra: { context: '[Xero Status] xero_connections read failed' } } as any);
      return NextResponse.json({ error: CHECK_FAILED }, { status: 500 });
    }
    const initialRows = (initial.data ?? []) as ConnectionRow[];

    // Keep EVERY live org's token fresh — the keepalive relies on this route, and
    // it used to refresh only the one org it reported.
    const liveRows = initialRows.filter((r) => r.is_active === true);
    const failures = (
      await Promise.all(
        liveRows.map(async (row): Promise<RefreshFailure | null> => {
          try {
            const result = await getValidAccessToken({ id: row.id }, supabaseAdmin);
            return result.success ? null : { row, result };
          } catch (err) {
            Sentry.captureException(err, { tags: { route: 'Xero/status', connection_id: row.id }, extra: { context: '[Xero Status] token refresh threw' } } as any);
            return { row, result: { success: false, error: 'unknown', message: 'Token refresh failed' } };
          }
        }),
      )
    ).filter((f): f is RefreshFailure => f !== null);

    // A refresh moves expires_at and a refusal deactivates the row, so classify
    // what the rows say now. If they cannot be re-read, the check did not finish.
    let rows = initialRows;
    if (liveRows.length > 0) {
      const reread = await readConnections();
      if (reread.error) {
        Sentry.captureException(reread.error, { tags: { route: 'Xero/status' }, extra: { context: '[Xero Status] xero_connections re-read failed' } } as any);
        return NextResponse.json({ error: CHECK_FAILED }, { status: 500 });
      }
      rows = (reread.data ?? []) as ConnectionRow[];
    }

    // The data clock, read for this business's orgs only. Raw and trimmed forms
    // both, matching how dataClockFor looks a tenant up.
    const tenantIds = [
      ...new Set(rows.flatMap((r) => [r.tenant_id, r.tenant_id?.trim()]).filter((t): t is string => !!t)),
    ];
    const syncClock = await getLastSyncByTenant(supabaseAdmin as never, SYNC_CLOCK_WINDOW_DAYS, tenantIds);

    const dataStaleMs = isOwner || isTeamMember ? OWNER_DATA_STALE_MS : DATA_STALE_MS;
    const c = classifyBusinessConnections(rows, syncClock, Date.now(), dataStaleMs);

    const liveNow = rows.filter((r) => r.is_active === true);
    const expired = c.status === 'dead' || c.status === 'auth_stale';

    let health: XeroStatusResponse['health'];
    if (liveNow.length > 0) {
      const perOrg = await Promise.all(liveNow.map((r) => checkConnectionHealth(r as never)));
      const minutes = perOrg.map((h) => h.expiresIn).filter((m) => Number.isFinite(m));
      health = {
        isHealthy: perOrg.every((h) => h.isHealthy),
        expiresInMinutes: minutes.length > 0 ? Math.min(...minutes) : null,
        warnings: perOrg.flatMap((h, i) =>
          h.warnings.map((w) => (liveNow.length > 1 ? `${orgName(liveNow[i])}: ${w}` : w)),
        ),
      };
    }

    const firstFailure = failures[0];
    const body: XeroStatusResponse = {
      status: c.status,
      status_scope: c.statusScope,
      more_orgs_needing_attention: c.moreOrgsNeedingAttention,
      last_sync_at: c.lastSyncAt,
      orgs: c.orgs.map((o) => toOrgView(o, rows)),
      retired_orgs: c.retiredOrgs.map((o) => toOrgView(o, rows)),
      connected: c.orgs.some((o) => o.status !== 'dead'),
      expired,
      needsReconnect: expired || failures.some((f) => f.result.shouldDeactivate === true),
      connection:
        c.orgs.length > 0
          ? {
              id: c.connectionId,
              tenant_name: c.tenantName,
              is_active: c.status !== 'dead',
              last_synced_at: c.lastSyncAt,
              expires_at: c.expiresAt,
            }
          : null,
      ...(health ? { health } : {}),
      ...(firstFailure
        ? {
            error: firstFailure.result.error,
            message:
              liveRows.length > 1
                ? `${orgName(firstFailure.row)}: ${firstFailure.result.message ?? 'Token refresh failed'}`
                : firstFailure.result.message ?? 'Token refresh failed',
          }
        : {}),
    };

    return NextResponse.json(body);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/status' }, extra: { context: "[Xero Status] Error" } } as any);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withQuerySchema(
  'Xero/status',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
);
