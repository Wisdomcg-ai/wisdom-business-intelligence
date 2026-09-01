import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'
import { UNRECONCILED_AUTHORISED, monthRangeWhere } from '@/lib/reconciliation/where-clauses'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    month: z.string().optional(),
  })
  .passthrough()

/**
 * GET /api/Xero/reconciliation?business_id=xxx[&month=YYYY-MM]
 * Checks unreconciled transaction count from Xero
 */
async function getHandler(request: NextRequest) {
  try {
    // Auth check
    const authClient = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const month = searchParams.get('month')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/Xero/reconciliation',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Get EVERY active Xero connection for this business.
    //
    // FLEET-04 (26 Aug 2026): this used `.maybeSingle()` three times, which
    // returns NULL when a business has more than one connection (PGRST116).
    // Dragon Roofing has 2 orgs and IICT Group has 3 — the two largest CFO
    // clients — so `connection` was always null for them, the route fell into
    // the no-connection branch below, and that branch returned
    // `is_clean: true`. Both businesses were told "All transactions reconciled"
    // unconditionally, and the monthly report was allowed to finalise on it.
    // A FINAL-stamped Dragon July report already exists carrying that tick.
    const { connections } = await resolveXeroConnections(supabase, businessId)

    if (connections.length === 0) {
      // No connection is NOT "clean" — it is UNKNOWN. Returning is_clean:true
      // here is what let a missing connection read as a green tick.
      return NextResponse.json({
        unreconciled_count: 0,
        unreconciled_total: 0,
        has_more: false,
        bank_accounts: [],
        is_clean: false,
        check_failed: true,
        no_connection: true,
        failure_reason: 'No active Xero connection for this business.',
      })
    }

    // Build where clause for unreconciled bank transactions.
    //
    // THE DELETED TRAP (see lib/reconciliation/where-clauses.ts): a deleted
    // Xero bank transaction keeps IsReconciled=false FOREVER while appearing
    // in no reconciliation report and no reconcile badge. Without the
    // Status=="AUTHORISED" filter, every deleted duplicate haunted this count
    // permanently — a business whose bank rec reports tied to the cent could
    // still show "4 unreconciled" here. Also note: this counts unreconciled
    // TRANSACTIONS recorded in Xero, not the bank-feed statement lines behind
    // Xero's per-account reconcile badge (unreachable without the
    // addendum-gated Bank Statement scope) — label it accordingly.
    const monthRange = month ? monthRangeWhere(month) : null
    if (month && !monthRange) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    const whereClause = monthRange
      ? `${UNRECONCILED_AUTHORISED} AND ${monthRange}`
      : UNRECONCILED_AUTHORISED

    let unreconciledCount = 0
    let unreconciledTotal = 0
    let hasMore = false
    // Per-account attribution: Xero's reconcile badge is PER ACCOUNT, so a
    // nonzero org-wide count with a clean-looking Xero is routinely one
    // secondary account nobody runs reports for. Naming it closes that gap.
    const perAccount = new Map<string, { count: number; total: number }>()
    // Any org we could not check makes the whole answer indeterminate. We must
    // never present a partial count as a clean bill of health.
    const failedTenants: string[] = []
    const okTenants: string[] = []
    // 5 pages × 100 = 500-transaction cap per org, mirroring the board sweep.
    const MAX_PAGES = 5

    for (const connection of connections) {
      const tenantLabel = connection.tenant_name || connection.tenant_id

      const tokenResult = await getValidAccessToken(connection, supabase)
      if (!tokenResult.success) {
        Sentry.captureException(tokenResult.error, {
          tags: { route: 'Xero/reconciliation', invariant: 'reconciliation_check_failed' },
          extra: { context: '[Reconciliation] Token refresh failed', tenant: tenantLabel },
        } as any)
        failedTenants.push(tenantLabel)
        continue
      }

      let tenantFailed = false
      for (let page = 1; page <= MAX_PAGES; page++) {
        const txnUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}&page=${page}`
        const txnResponse = await fetch(txnUrl, {
          headers: {
            'Authorization': `Bearer ${tokenResult.accessToken!}`,
            'xero-tenant-id': connection.tenant_id,
            'Accept': 'application/json',
          },
        })

        if (!txnResponse.ok) {
          // A failed fetch (Xero outage, revoked grant, or a 400 rejecting the
          // where clause) must surface as a named per-org failure — leaving
          // the count at 0 would render as "all reconciled".
          Sentry.captureException(new Error(`BankTransactions ${txnResponse.status}`), {
            tags: { route: 'Xero/reconciliation', invariant: 'reconciliation_check_failed' },
            extra: { context: '[Reconciliation] BankTransactions fetch failed', tenant: tenantLabel, status: txnResponse.status },
          } as any)
          failedTenants.push(tenantLabel)
          tenantFailed = true
          break
        }

        const txnData = await txnResponse.json()
        const transactions = txnData.BankTransactions || []
        unreconciledCount += transactions.length
        for (const t of transactions) {
          const amount = Math.abs(parseFloat(t.Total || '0'))
          unreconciledTotal += amount
          // Multi-org: prefix the org so two "Business Cheque" accounts from
          // different entities stay distinguishable in the UI.
          const accountName = t.BankAccount?.Name ?? '(unknown account)'
          const key = connections.length > 1
            ? `${connection.tenant_name ?? 'Org'} — ${accountName}`
            : accountName
          const entry = perAccount.get(key) ?? { count: 0, total: 0 }
          entry.count += 1
          entry.total += amount
          perAccount.set(key, entry)
        }
        if (transactions.length < 100) break
        if (page === MAX_PAGES) hasMore = true
      }
      if (!tenantFailed) okTenants.push(tenantLabel)
    }

    const checkFailed = failedTenants.length > 0

    const bankAccounts = Array.from(perAccount.entries())
      .map(([name, v]) => ({ name, count: v.count, total: Math.round(v.total * 100) / 100 }))
      .sort((a, b) => b.count - a.count)

    // FAIL CLOSED: "clean" now requires that every org was actually checked.
    // A partial answer is not a clean bill of health.
    const isClean = unreconciledCount === 0 && !checkFailed

    // Update financial_metrics with reconciliation data.
    //
    // Phase D (CFO-only clients): this write was broken since inception —
    // it omitted `metric_date` (NOT NULL, no default) and named a
    // non-existent conflict target (`business_id`; the unique constraint is
    // `(business_id, metric_date)`), so every call errored. And because
    // supabase-js returns errors rather than throwing, the try/catch never
    // fired: the failure was fully silent and the /cfo dashboard's
    // unreconciled column + badge rules never saw fresh data. One row per
    // (business, day); repeat checks the same day update in place.
    try {
      const nowIso = new Date().toISOString()
      const { error: metricsError } = await supabase
        .from('financial_metrics')
        .upsert(
          {
            business_id: businessId,
            metric_date: nowIso.slice(0, 10),
            unreconciled_count: unreconciledCount,
            last_bank_rec_date: isClean ? nowIso : null,
            // financial_metrics has no updated_at column — writing one failed
            // the whole upsert (WISDOM-BI-1F), which is the exact silent-write
            // failure the comment above says this block exists to prevent.
          },
          { onConflict: 'business_id,metric_date' }
        )
      if (metricsError) {
        // Non-fatal for the response, but never silent (invariant rule).
        Sentry.captureException(metricsError, {
          tags: { route: 'Xero/reconciliation', invariant: 'financial_metrics_write_failed' },
          extra: { context: '[Reconciliation] financial_metrics upsert failed', business_id: businessId },
        } as any)
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'Xero/reconciliation', invariant: 'financial_metrics_write_failed' }, extra: { context: "[Reconciliation] Error updating financial_metrics" } } as any)
      // Non-fatal
    }

    return NextResponse.json({
      unreconciled_count: unreconciledCount,
      unreconciled_total: unreconciledTotal,
      has_more: hasMore,
      bank_accounts: bankAccounts,
      is_clean: isClean,
      // Multi-org transparency: how many orgs were checked, and which (if any)
      // could not be. The UI must not show a green tick when this is set.
      check_failed: checkFailed,
      orgs_checked: okTenants.length,
      orgs_total: connections.length,
      failure_reason: checkFailed
        ? `Could not check ${failedTenants.length} of ${connections.length} connected Xero ${connections.length === 1 ? 'organisation' : 'organisations'}: ${failedTenants.join(', ')}.`
        : undefined,
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'Xero/reconciliation' }, extra: { context: "[Reconciliation] Error" } } as any)
    return NextResponse.json({ error: 'Failed to check reconciliation status' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'Xero/reconciliation',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)
