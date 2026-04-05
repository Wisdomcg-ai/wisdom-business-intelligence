import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * GET /api/Xero/reconciliation?business_id=xxx[&month=YYYY-MM]
 * Checks unreconciled transaction count from Xero
 */
export async function GET(request: NextRequest) {
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
      console.error('[Reconciliation] Token refresh failed:', tokenResult.error)
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
      console.error('[Reconciliation] BankTransactions fetch failed:', txnResponse.status)
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
      console.error('[Reconciliation] Error fetching bank accounts:', err)
    }

    const isClean = unreconciledCount === 0

    // Update financial_metrics with reconciliation data
    try {
      await supabase
        .from('financial_metrics')
        .upsert(
          {
            business_id: businessId,
            unreconciled_count: unreconciledCount,
            last_bank_rec_date: isClean ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'business_id' }
        )
    } catch (err) {
      console.error('[Reconciliation] Error updating financial_metrics:', err)
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
    console.error('[Reconciliation] Error:', error)
    return NextResponse.json({ error: 'Failed to check reconciliation status' }, { status: 500 })
  }
}
