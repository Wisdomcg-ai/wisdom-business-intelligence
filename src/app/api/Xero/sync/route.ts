/**
 * POST /api/Xero/sync — the KPI dashboard's "Sync Xero" button.
 *
 * A thin shim over the canonical orchestrator, like /api/Xero/refresh-pl and
 * /api/Xero/sync-forecast. This route used to run its own "sync", wrong in
 * every direction that matters:
 *   - it took ONE connection (resolveXeroBusinessId → connections[0]), so Dragon
 *     Roofing (2 orgs) and IICT Group (3) synced only their lowest-id org;
 *   - it fetched api.xro/2.0/BankSummary (not an endpoint) and a current-month
 *     P&L into financial_metrics — which nothing on the dashboard charts — and
 *     never refreshed the xero_pl_lines mirror that the charts DO read;
 *   - a failed P&L fetch still wrote revenue/cogs/expenses = 0;
 *   - it then stamped xero_connections.last_synced_at = now whatever Xero had
 *     said, 403 included. That column is the data clock classifyBusinessConnections
 *     reads (coach pill, /cfo board, /api/Xero/status), so one click made a
 *     stale or refused org read fresh for 48 hours;
 *   - its access check looked the id up in businesses.id only, and the dashboard
 *     posts business_profiles.id — everyone but a super admin got a 403.
 *
 * Now every active org goes through the pipeline the 6-hourly cron runs, and an
 * org's clock moves only when THAT org's data landed. The response names each
 * org's outcome — including an org that is switched off, which no sync touches —
 * so a partial sync is never reported as a green tick.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { withSchema } from '@/lib/api/with-schema'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import {
  classifyBusinessConnections,
  type XeroConnectionStatusRow,
  type XeroOrgClassification,
} from '@/lib/xero/connection-status'
import {
  syncBusinessXeroPL,
  SYNC_IN_FLIGHT,
  SYNC_NO_CONNECTIONS,
  type SyncResult,
  type TenantSyncOutcome,
} from '@/lib/xero/sync-orchestrator'
import type { ManualSyncOrg, ManualSyncOutcome, ManualSyncResponse } from '@/lib/xero/manual-sync-response'

export const dynamic = 'force-dynamic'
// The Fluid Compute ceiling, as the sync cron uses: a whole-business run has
// taken 232s, and a kill mid-run leaves its sync_jobs lock 'running' for 15
// minutes — every press in that window would read "already running".
export const maxDuration = 800

// VALID-04 (observe mode): POST triggers a Xero data sync for a business.
const SyncPostSchema = z
  .object({
    business_id: z.string(),
  })
  .passthrough()

const CONNECTION_COLUMNS =
  'id, business_id, tenant_id, tenant_name, include_in_consolidation, is_active, last_synced_at, updated_at, expires_at, created_at'

const UNNAMED_ORG = 'Unnamed Xero organisation'

function respond(
  outcome: ManualSyncOutcome,
  tenants: TenantSyncOutcome[],
  disconnected: XeroOrgClassification[],
  status: number,
) {
  const orgs: ManualSyncOrg[] = [
    ...tenants.map((t) => ({ name: t.tenant_name?.trim() || UNNAMED_ORG, status: t.status })),
    ...disconnected.map((o) => ({ name: o.tenantName || UNNAMED_ORG, status: 'disconnected' as const })),
  ]
  const body: ManualSyncResponse = { outcome, orgs }
  return NextResponse.json(body, { status })
}

async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // withSchema validates a clone and never passes the body on — read it here.
  const body = await request.json().catch(() => null)
  const businessId = typeof body?.business_id === 'string' ? body.business_id : ''
  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  // The dashboard posts business_profiles.id; team membership (business_users)
  // is keyed on businesses.id, so check access against the resolved business.
  const ids = await resolveBusinessProfileIds(admin, businessId)
  if (!(await verifyBusinessAccess(user.id, ids.businessId))) {
    return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 })
  }

  // The resolver echoes an id it could not resolve, and a failed read looks the
  // same. With one id-space missing, every lookup below misses the connection
  // rows and a connected business would be told it is not connected.
  if (String(ids.businessId) === String(ids.profileId)) {
    return respond('failed', [], [], 500)
  }

  const { data: rows, error: rowsError } = await admin
    .from('xero_connections')
    .select(CONNECTION_COLUMNS)
    .in('business_id', ids.all)
  if (rowsError) {
    Sentry.captureException(rowsError, {
      tags: { route: 'Xero/sync', invariant: 'xero_manual_sync_connections_read' },
      extra: { business_id: businessId },
    } as any)
    return respond('failed', [], [], 500)
  }
  const connections = (rows ?? []) as XeroConnectionStatusRow[]

  // Orgs no sync touches: switched off with no live row for the same org, unless
  // retired on purpose — connection-status's 'dead'. That is decided from the
  // rows alone, before any clock is read, so no sync clock is needed here.
  const disconnected = classifyBusinessConnections(connections, { ok: true, byTenant: new Map() })
    .orgs.filter((o) => o.status === 'dead')

  // Nothing switched on: say so without claiming a sync job there is nothing to run.
  if (!connections.some((c) => c.is_active === true)) {
    return respond('not_connected', [], disconnected, 404)
  }

  const tenants: TenantSyncOutcome[] = []
  let result: SyncResult
  try {
    result = await syncBusinessXeroPL(businessId, {
      onTenantOutcome: (outcome) => tenants.push(outcome),
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'Xero/sync' },
      extra: { context: '[Xero Sync] orchestrator threw', business_id: businessId },
    } as any)
    return respond('failed', tenants, disconnected, 500)
  }

  if (result.error === SYNC_IN_FLIGHT) return respond('in_progress', tenants, disconnected, 409)
  // The rows above include an active org, so "no active connections" here means
  // the orchestrator's own id lookup missed them (its resolver echoes on a failed
  // read) — a sync that could not run, not a business without Xero.
  if (result.error === SYNC_NO_CONNECTIONS) return respond('failed', tenants, disconnected, 500)

  // No org's data landed: a failed sync, whatever the rollup says. A business
  // whose only org hit Xero's daily limit rolls up as 'partial'.
  const landed = tenants.filter((t) => t.status === 'success' || t.status === 'partial')
  if (result.status === 'error' || landed.length === 0) {
    return respond('failed', tenants, disconnected, 502)
  }

  // Green needs the rollup and every org the sync reached to say success, and
  // no org it could not reach.
  if (
    result.status === 'success' &&
    tenants.every((t) => t.status === 'success') &&
    disconnected.length === 0
  ) {
    return respond('synced', tenants, disconnected, 200)
  }
  return respond('partial', tenants, disconnected, 200)
}

export const POST = withSchema('Xero/sync', SyncPostSchema, postHandler)
