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
 *   Active row preferred over dead row when both exist for one business.
 *
 * Quotas: 200 business_ids[] cap (sanity bound). Batched queries — total ≤5
 * Supabase round-trips regardless of input size.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { withQuerySchema } from '@/lib/api/with-schema';
import {
  classifyXeroConnection,
  preferConnection,
  DATA_STALE_MS,
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

/** Owner-facing surfaces tolerate one extra missed day before warning. */
const OWNER_DATA_STALE_MS = 72 * 60 * 60 * 1000;

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

  // 5. Single batched xero_connections query for all relevant id forms.
  // Order by updated_at DESC so the most-recently-touched row wins ties.
  const { data: connections } = await supabaseAdmin
    .from('xero_connections')
    .select('id, business_id, tenant_id, is_active, last_synced_at, updated_at, expires_at, created_at')
    .in('business_id', allIdForms)
    .order('updated_at', { ascending: false });

  // The data clock. This route previously had NO freshness signal at all — it
  // reported whether the token pipe was open and nothing about whether the
  // numbers were current, which is the question every consumer of it was
  // actually asking. 60 days rather than the 7-day default so a genuinely cold
  // tenant returns a real (old) timestamp instead of collapsing to "never" and
  // being misread as a brand-new connection.
  const { ok: syncLookupOk, byTenant: lastSyncByTenant } = await getLastSyncByTenant(
    supabaseAdmin as never,
    60,
  );

  // 6. Bucket connections by canonical business_id with active-preferred policy.
  const byBizId = new Map<string, XeroConnectionRow | null>();
  for (const id of allowedIds) byBizId.set(id, null);
  for (const conn of (connections ?? []) as XeroConnectionRow[]) {
    const canonicalId = profileIdToBizId.get(conn.business_id) ?? conn.business_id;
    if (!byBizId.has(canonicalId)) continue; // not in allowedIds (shouldn't happen post-filter)
    // Active-preferred over more-recently-updated dead; otherwise the
    // order('updated_at', desc) clause has already put the winner first.
    byBizId.set(canonicalId, preferConnection(byBizId.get(canonicalId), conn));
  }

  // 7. Compute status per requested business — ONE shared definition.
  const now = Date.now();
  const results: ConnectionHealthResult[] = allowedIds.map((business_id) => {
    const conn = byBizId.get(business_id) ?? null;
    // Fold the two freshness sources: the column the orchestrator now stamps,
    // and sync_jobs joined on tenant_id. The join is on tenant_id rather than
    // business_id on purpose — xero_connections.business_id is in the
    // businesses.id space while sync_jobs.business_id is business_profiles.id,
    // so a business_id join silently returns zero rows for every connection.
    const fromColumn = conn?.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0;
    const fromJobs = conn?.tenant_id ? lastSyncByTenant.get(conn.tenant_id) ?? 0 : 0;
    const freshest = Math.max(fromColumn, fromJobs);
    const c = classifyXeroConnection(
      conn,
      { lastSyncMs: freshest > 0 ? freshest : null, lookupOk: syncLookupOk },
      now,
      dataStaleMs,
    );
    return {
      business_id,
      status: c.status,
      last_refresh_at: c.lastTokenRefreshAt,
      last_sync_at: c.lastSyncAt,
      expires_at: c.expiresAt,
      connection_id: c.connectionId,
    };
  });

  return NextResponse.json({ results });
}

export const GET = withQuerySchema(
  'Xero/connection-health',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
);
