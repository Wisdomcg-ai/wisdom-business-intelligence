import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'

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

    // Get Xero connection — try all ID formats
    let connection: any = null;
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', businessId).eq('is_active', true).maybeSingle();
    if (c1) connection = c1;
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', businessId).maybeSingle();
      if (p?.id) { const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle(); if (c2) connection = c2; }
    }
    if (!connection) {
      const { data: bp } = await supabase.from('business_profiles').select('business_id').eq('id', businessId).maybeSingle();
      if (bp?.business_id) { const { data: c3 } = await supabase.from('xero_connections').select('*').eq('business_id', bp.business_id).eq('is_active', true).maybeSingle(); if (c3) connection = c3; }
    }

    if (!connection) {
      return NextResponse.json({
        unreconciled_count: 0,
        unreconciled_total: 0,
        has_more: false,
        bank_accounts: [],
        is_clean: true,
        no_connection: true,
      })
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      Sentry.captureException(tokenResult.error, { tags: { route: 'Xero/reconciliation' }, extra: { context: "[Reconciliation] Token refresh failed" } } as any)
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = connection.tenant_id

    // Build where clause for unreconciled bank transactions
    let whereClause = 'IsReconciled==false'
    if (month) {
      const [y, m] = month.split('-').map(Number)
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`
      whereClause += `&&Date>= DateTime(${y},${m},1)&&Date<=DateTime(${y},${m},${lastDay})`
    }

    // Fetch unreconciled bank transactions (page 1 only for performance)
    const txnUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}&page=1`
    const txnResponse = await fetch(txnUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    })

    let unreconciledCount = 0
    let unreconciledTotal = 0
    let hasMore = false

    if (txnResponse.ok) {
      const txnData = await txnResponse.json()
      const transactions = txnData.BankTransactions || []
      unreconciledCount = transactions.length
      unreconciledTotal = transactions.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.Total || '0')), 0)
      // Xero returns up to 100 per page; if exactly 100, there are likely more
      hasMore = transactions.length >= 100
      if (hasMore) unreconciledCount = 100 // Show "100+" in the UI
    } else {
      Sentry.captureException(txnResponse.status, { tags: { route: 'Xero/reconciliation' }, extra: { context: "[Reconciliation] BankTransactions fetch failed" } } as any)
    }

    // Fetch bank accounts for context
    const bankAccounts: { name: string; count: number; balance: number }[] = []
    try {
      const acctUrl = 'https://api.xero.com/api.xro/2.0/Accounts?where=Type=="BANK"'
      const acctResponse = await fetch(acctUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          'Accept': 'application/json',
        },
      })

      if (acctResponse.ok) {
        const acctData = await acctResponse.json()
        for (const acc of (acctData.Accounts || [])) {
          if (acc.Status === 'ACTIVE') {
            bankAccounts.push({
              name: acc.Name,
              count: 0,
              balance: parseFloat(acc.BankAccountType === 'CREDITCARD' ? acc.CurrencyCode : '0'),
            })
          }
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'Xero/reconciliation' }, extra: { context: "[Reconciliation] Error fetching bank accounts" } } as any)
    }

    const isClean = unreconciledCount === 0

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
            updated_at: nowIso,
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
