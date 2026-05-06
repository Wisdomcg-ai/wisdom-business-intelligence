/**
 * Phase 53-05 Task 2 — GET /api/Xero/connection-health
 *
 * Returns per-business Xero connection-health status for the coach
 * dashboard pill column. Status buckets:
 *   - verified: is_active=true AND (last refresh within 12h OR expires_at >
 *     now+30min). The 12h window is intentional defense-in-depth — see
 *     "Threshold rationale" below.
 *   - stale:    is_active=true AND last refresh >12h ago AND expires_at past
 *     30min grace. Connection alive but not freshly verified — surfaces
 *     missed cron runs / paused-client connections drifting toward death.
 *   - dead:     is_active=false. The token-manager (53-03) flipped this row
 *     because Xero refused the refresh terminally. Coach can click the pill
 *     to launch the OAuth reconnect flow.
 *   - none:     no xero_connections row exists for this business under
 *     either ID form. Greys out the pill — coach knows the business never
 *     connected (vs disconnected). No reconnect CTA.
 *
 * Threshold rationale (Issue B from 53-05-PLAN-CHECK.md):
 *   53-04's refresh cron runs every 6h ("0 *\/6 * * *"). A healthy
 *   connection's `updated_at` should advance every 6h. The original plan
 *   defaulted to a 24h "verified" window — but 24h means a connection
 *   where the cron has FAILED 3× in a row would still show verified. We
 *   tighten to 12h (= 2× cron period) so a single missed cron run is
 *   tolerated but a sustained cron failure surfaces within 12h.
 *
 * RBAC defense in depth:
 *   The endpoint independently re-validates each business_id against
 *   owner_id / assigned_coach_id / super_admin via the system_roles table.
 *   Even if the dashboard accidentally requests business_ids the user
 *   cannot access, the response silently filters them out — no per-business
 *   403 leak that would let a bad actor probe membership.
 *
 * Dual-ID resolution:
 *   xero_connections rows can live under canonical `businesses.id` OR
 *   legacy `business_profiles.id`. We resolve in one batched query: read
 *   business_profiles for all requested ids, expand to (canonical, profile)
 *   pairs, then a single .in('business_id', allIdForms) on xero_connections.
 *   Active row preferred over dead row when both exist for one business
 *   (matches the connection-lookup heuristic in employees/route.ts).
 *
 * Quotas: 200 business_ids[] cap (sanity bound; real coach dashboards
 * carry <100 in practice). Single batched query per table — total ≤3
 * Supabase round-trips regardless of input size.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Service-role client to bypass RLS — endpoint enforces RBAC in code.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export type ConnectionHealthStatus = 'verified' | 'stale' | 'dead' | 'none';

export interface ConnectionHealthResult {
  business_id: string;
  status: ConnectionHealthStatus;
  last_refresh_at: string | null;
  expires_at: string | null;
  connection_id: string | null;
}

// Threshold constants — see "Threshold rationale" comment block above.
const VERIFIED_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h (2× the 6h cron period)
const EXPIRES_GRACE_MS = 30 * 60 * 1000; // 30min — Xero access tokens last 30min
const MAX_BUSINESS_IDS = 200;

interface XeroConnectionRow {
  id: string;
  business_id: string;
  is_active: boolean;
  last_synced_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

export async function GET(request: NextRequest) {
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
  if (requested.length === 0) {
    return NextResponse.json({ results: [] });
  }
  if (requested.length > MAX_BUSINESS_IDS) {
    return NextResponse.json(
      { error: `Too many business_ids (max ${MAX_BUSINESS_IDS})` },
      { status: 400 },
    );
  }

  // 3. RBAC filter — owner / coach / super_admin.
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
    allowedIds = (businesses ?? [])
      .filter(
        (b: { id: string; owner_id: string | null; assigned_coach_id: string | null }) =>
          b.owner_id === user.id || b.assigned_coach_id === user.id,
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
    .select('id, business_id, is_active, last_synced_at, updated_at, expires_at')
    .in('business_id', allIdForms)
    .order('updated_at', { ascending: false });

  // 6. Bucket connections by canonical business_id with active-preferred policy.
  const byBizId = new Map<string, XeroConnectionRow | null>();
  for (const id of allowedIds) byBizId.set(id, null);
  for (const conn of (connections ?? []) as XeroConnectionRow[]) {
    const canonicalId = profileIdToBizId.get(conn.business_id) ?? conn.business_id;
    if (!byBizId.has(canonicalId)) continue; // not in allowedIds (shouldn't happen post-filter)
    const existing = byBizId.get(canonicalId);
    if (!existing) {
      byBizId.set(canonicalId, conn);
    } else if (!existing.is_active && conn.is_active) {
      // Prefer an active row over a dead row even if the dead row is
      // more recently updated. (See Test 12.)
      byBizId.set(canonicalId, conn);
    }
    // else: keep existing (already prefer active OR same-status more-recent
    // due to the order('updated_at', { ascending: false }) clause).
  }

  // 7. Compute status per requested business.
  const now = Date.now();
  const results: ConnectionHealthResult[] = allowedIds.map((business_id) => {
    const conn = byBizId.get(business_id) ?? null;
    if (!conn) {
      return {
        business_id,
        status: 'none',
        last_refresh_at: null,
        expires_at: null,
        connection_id: null,
      };
    }
    if (!conn.is_active) {
      return {
        business_id,
        status: 'dead',
        last_refresh_at: conn.updated_at ?? null,
        expires_at: conn.expires_at ?? null,
        connection_id: conn.id,
      };
    }
    const lastRefreshMs = Math.max(
      conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0,
      conn.updated_at ? new Date(conn.updated_at).getTime() : 0,
    );
    const expiresAtMs = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
    const ageMs = lastRefreshMs > 0 ? now - lastRefreshMs : Number.POSITIVE_INFINITY;
    const isFresh =
      ageMs < VERIFIED_WINDOW_MS || expiresAtMs > now + EXPIRES_GRACE_MS;
    const status: ConnectionHealthStatus = isFresh ? 'verified' : 'stale';
    return {
      business_id,
      status,
      last_refresh_at:
        lastRefreshMs > 0 ? new Date(lastRefreshMs).toISOString() : null,
      expires_at: conn.expires_at ?? null,
      connection_id: conn.id,
    };
  });

  return NextResponse.json({ results });
}
