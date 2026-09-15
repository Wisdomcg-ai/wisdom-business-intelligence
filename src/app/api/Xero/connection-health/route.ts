/**
 * Phase 53-05 Task 2 — GET /api/Xero/connection-health
 *
 * Returns per-business Xero connection-health status for the coach
 * dashboard pill column (and any other surface that asks).
 *
 * The buckets and the thresholds live in `@/lib/xero/connection-status`, so
 * every surface classifies from the SAME code rather than copies that drift —
 * WisdomBI had ~5 competing inline definitions of "connected" before this.
 *
 * `status` spans seven tiers, not the old four, and separates "can we talk to
 * Xero" (auth axis) from "are the numbers current" (data axis).
 * `last_refresh_at` means the last time Xero actually granted a token — NOT
 * the last time the row was written. The old `max(last_synced_at, updated_at)`
 * predicate was corrupted by the unconditional updated_at trigger: the token
 * refresh writes the row twice before knowing whether Xero said yes, so a
 * connection failing its refresh every tick still looked one minute old and
 * 'stale' was unreachable.
 *
 * RBAC defense in depth:
 *   The endpoint independently re-validates each business_id against
 *   owner_id / assigned_coach_id / active business_users membership /
 *   super_admin. Even if the dashboard accidentally requests business_ids the
 *   user cannot access, the response silently filters them out — no
 *   per-business 403 leak that would let a bad actor probe membership.
 *
 * Dual-ID resolution:
 *   xero_connections rows can live under canonical `businesses.id` OR
 *   legacy `business_profiles.id`. We resolve in one batched query: read
 *   business_profiles for all requested ids, expand to (canonical, profile)
 *   pairs, then a single .in('business_id', allIdForms) on xero_connections.
 *
 * Multi-org businesses:
 *   Every org counts, each on its own data clock, and the worst one is the
 *   business's status (`classifyBusinessConnections`). A dead row is set aside
 *   only when a live row exists for the same Xero org. `tenant_name` and
 *   `status_scope` say which org the status is about.
 *
 * Quotas: 200 business_ids[] cap (sanity bound). Batched queries — total ≤5
 * Supabase round-trips regardless of input size.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { withQuerySchema } from '@/lib/api/with-schema';
import {
  classifyBusinessConnections,
  DATA_STALE_MS,
  OWNER_DATA_STALE_MS,
  type XeroConnectionStatus,
  type XeroConnectionStatusRow,
} from '@/lib/xero/connection-status';
import { getLastSyncByTenant } from '@/lib/health-checks';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const GetQuerySchema = z
  .object({
    'business_ids[]': z.union([z.string(), z.array(z.string())]).optional(),
    /**
     * Who is looking. Selects the DATA-staleness threshold, and nothing else —
     * the auth axis and every other tier are identical either way.
     *
     * The coach chases at 48h so they can raise it with the client before the
     * client ever sees a warning; the owner's own page waits until 72h so they
     * are not alarmed by something their coach has not looked at yet.
     *
     * Deliberately an enum of two fixed server-side values rather than a
     * caller-supplied number: a client that can name its own threshold can name
     * one that makes everything green.
     */
    audience: z.enum(['coach', 'owner']).optional(),
  })
  .passthrough();

// Service-role client to bypass RLS — endpoint enforces RBAC in code.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
);

export type ConnectionHealthStatus = XeroConnectionStatus;

export interface ConnectionHealthResult {
  business_id: string;
  status: ConnectionHealthStatus;
  last_refresh_at: string | null;
  last_sync_at: string | null;
  expires_at: string | null;
  connection_id: string | null;
  /** The headline org — the worst one, whose clocks the fields above report. Display `status_scope`, not this. */
  tenant_name: string | null;
  /** "IICT Group Pty Ltd" or "2 of 3 orgs" when only part of a multi-org business has the status; null when business-wide. */
  status_scope: string | null;
  /** Other orgs needing attention in a lesser state than `status` — so one broken org never hides another. */
  more_orgs_needing_attention: number;
}

const MAX_BUSINESS_IDS = 200;

type XeroConnectionRow = XeroConnectionStatusRow;

async function getHandler(request: NextRequest) {
  // 1. Auth — must be a logged-in user.
  const supabase = await createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse business_ids[] query param. Empty array short-circuits to {results: []}.
  const url = new URL(request.url);
  const requested = url.searchParams.getAll('business_ids[]');
  // Unrecognised audience falls back to the STRICTER coach threshold. If we
  // cannot tell who is asking, warn earlier rather than later.
  const dataStaleMs =
    url.searchParams.get('audience') === 'owner' ? OWNER_DATA_STALE_MS : DATA_STALE_MS;
  if (requested.length === 0) {
    return NextResponse.json({ results: [] });
  }
  if (requested.length > MAX_BUSINESS_IDS) {
    return NextResponse.json(
      { error: `Too many business_ids (max ${MAX_BUSINESS_IDS})` },
      { status: 400 },
    );
  }

  // 3. RBAC filter — owner / coach / team member / super_admin.
  const { data: roleRow } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  const isSuperAdmin = roleRow?.role === 'super_admin';

  let allowedIds: string[];
  if (isSuperAdmin) {
    // Super admin bypass — see all requested ids without per-row check.
    allowedIds = requested;
  } else {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .in('id', requested);
    // Team members live in business_users, not businesses.owner_id, and were
    // previously filtered out here — so their business silently vanished from
    // the health list. This route is list-shaped, so one extra query beats N
    // helper calls. status='active' matches the access convention used by the
    // forecast routes.
    const { data: memberships } = await supabaseAdmin
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('business_id', requested);
    const memberIds = new Set((memberships ?? []).map((m: { business_id: string }) => m.business_id));
    allowedIds = (businesses ?? [])
      .filter(
        (b: { id: string; owner_id: string | null; assigned_coach_id: string | null }) =>
          b.owner_id === user.id || b.assigned_coach_id === user.id || memberIds.has(b.id),
      )
      .map((b: { id: string }) => b.id);
  }

  if (allowedIds.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // 4. Dual-ID expansion — collect business_profiles.id forms so legacy
  // rows under the profile id are visible alongside canonical rows.
  const { data: profiles } = await supabaseAdmin
    .from('business_profiles')
    .select('id, business_id')
    .in('business_id', allowedIds);
  const profileIdToBizId = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; business_id: string }[]) {
    profileIdToBizId.set(p.id, p.business_id);
  }
  const allIdForms = [
    ...allowedIds,
    ...((profiles ?? []) as { id: string }[]).map((p) => p.id),
  ];

  // 5. Single batched xero_connections query for all relevant id forms, dead
  // rows included. Ordered by columns no write touches — the classifier does not
  // depend on order, and updated_at (bumped by every refresh and sync) is what
  // once let the last-written org stand in for the whole business.
  const { data: connections, error: connectionsError } = await supabaseAdmin
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, include_in_consolidation, is_active, last_synced_at, updated_at, expires_at, created_at')
    .in('business_id', allIdForms)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });
  if (connectionsError) {
    // A failed read would otherwise bucket every business as 'none' — the grey
    // "No Xero" pill for a business that may be connected and broken. The
    // dashboard renders a failed fetch as 'unknown'.
    Sentry.captureException(connectionsError, { tags: { route: 'Xero/connection-health' } } as any);
    return NextResponse.json({ error: 'Failed to load Xero connections' }, { status: 500 });
  }

  // The data clock. This route previously had NO freshness signal at all — it
  // reported whether the token pipe was open and nothing about whether the
  // numbers were current, which is the question every consumer of it was
  // actually asking. 60 days rather than the 7-day default so a genuinely cold
  // tenant returns a real (old) timestamp instead of collapsing to "never" and
  // being misread as a brand-new connection.
  const syncClock = await getLastSyncByTenant(supabaseAdmin as never, 60);

  // 6. Bucket EVERY row by canonical business_id — a multi-org business is all
  // of its orgs, not one representative.
  const rowsByBizId = new Map<string, XeroConnectionRow[]>();
  for (const id of allowedIds) rowsByBizId.set(id, []);
  for (const conn of (connections ?? []) as XeroConnectionRow[]) {
    const canonicalId = profileIdToBizId.get(conn.business_id) ?? conn.business_id;
    // Absent from the map = not in allowedIds (shouldn't happen post-filter).
    rowsByBizId.get(canonicalId)?.push(conn);
  }

  // 7. Compute status per requested business — ONE shared definition. Each org
  // is judged on its own data clock (the stamped column folded with sync_jobs
  // for its tenant) and the worst org is the business's status.
  const now = Date.now();
  const results: ConnectionHealthResult[] = allowedIds.map((business_id) => {
    const c = classifyBusinessConnections(rowsByBizId.get(business_id) ?? [], syncClock, now, dataStaleMs);
    return {
      business_id,
      status: c.status,
      last_refresh_at: c.lastTokenRefreshAt,
      last_sync_at: c.lastSyncAt,
      expires_at: c.expiresAt,
      connection_id: c.connectionId,
      tenant_name: c.tenantName,
      status_scope: c.statusScope,
      more_orgs_needing_attention: c.moreOrgsNeedingAttention,
    };
  });

  return NextResponse.json({ results });
}

export const GET = withQuerySchema(
  'Xero/connection-health',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
);
