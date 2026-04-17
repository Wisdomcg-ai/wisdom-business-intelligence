import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * Map Xero's account Type field into high-level classes used by our settings UI.
 * Xero types reference: https://developer.xero.com/documentation/api/accounts
 */
function classifyAccount(xeroType: string | undefined): string {
  const t = (xeroType || '').toUpperCase()
  if (t === 'BANK') return 'ASSET'
  if (t === 'CURRENT' || t === 'FIXED' || t === 'INVENTORY' ||
      t === 'NONCURRENT' || t === 'PREPAYMENT') return 'ASSET'
  if (t === 'CURRLIAB' || t === 'LIABILITY' || t === 'TERMLIAB') return 'LIABILITY'
  if (t === 'EQUITY') return 'EQUITY'
  if (t === 'REVENUE' || t === 'OTHERINCOME' || t === 'SALES') return 'REVENUE'
  if (t === 'EXPENSE' || t === 'OVERHEADS' || t === 'DIRECTCOSTS' ||
      t === 'DEPRECIATN' || t === 'OTHEREXPENSE') return 'EXPENSE'
  return 'OTHER'
}

/** Ensure we always pick the freshest row across potential dual-business_id data */
const STALE_AFTER_HOURS = 24

async function fetchFromXeroAndCache(businessId: string, accessToken: string, tenantId: string) {
  const xeroResp = await fetch(
    'https://api.xero.com/api.xro/2.0/Accounts',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    }
  )

  if (!xeroResp.ok) {
    const errText = await xeroResp.text()
    console.error('[COA Full] Xero API error:', xeroResp.status, errText)
    throw new Error(`Xero API returned ${xeroResp.status}`)
  }

  const xeroData = await xeroResp.json()
  const accounts = (xeroData.Accounts ?? []) as any[]

  if (accounts.length === 0) {
    console.warn('[COA Full] Xero returned 0 accounts — possibly a permissions issue')
    return []
  }

  // Upsert into xero_accounts cache
  const rows = accounts.map(a => ({
    business_id: businessId,
    xero_account_id: a.AccountID,
    account_code: a.Code ?? null,
    account_name: a.Name ?? '',
    xero_type: a.Type ?? null,
    xero_class: classifyAccount(a.Type),
    xero_status: a.Status ?? null,
    tax_type: a.TaxType ?? null,
    description: a.Description ?? null,
    last_synced_at: new Date().toISOString(),
  }))

  // Upsert by (business_id, xero_account_id)
  const { error: upsertError } = await supabase
    .from('xero_accounts')
    .upsert(rows, { onConflict: 'business_id,xero_account_id' })

  if (upsertError) {
    console.error('[COA Full] Upsert error:', upsertError)
    throw new Error(upsertError.message)
  }

  return rows
}

/**
 * GET /api/Xero/chart-of-accounts-full?business_id=xxx&refresh=false
 *
 * Returns the full Xero Chart of Accounts for a business.
 * Uses a local cache (xero_accounts table) to avoid hitting Xero on every request.
 * Re-syncs from Xero if cache is >24h old or refresh=true is passed.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const businessId = url.searchParams.get('business_id')
    const forceRefresh = url.searchParams.get('refresh') === 'true'

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Use the same business ID that xero_pl_lines uses (businesses.id)
    const ids = await resolveBusinessIds(supabase, businessId)
    const canonicalBusinessId = ids.bizId

    // Check cache
    const { data: cached } = await supabase
      .from('xero_accounts')
      .select('*')
      .eq('business_id', canonicalBusinessId)
      .order('xero_type', { ascending: true })
      .order('account_code', { ascending: true })

    const latestSync = cached?.[0]?.last_synced_at
    const isStale = !latestSync ||
      (Date.now() - new Date(latestSync).getTime()) > STALE_AFTER_HOURS * 60 * 60 * 1000

    if (!forceRefresh && cached && cached.length > 0 && !isStale) {
      return NextResponse.json({ data: cached, source: 'cache' })
    }

    // Refresh from Xero
    let connection: any = null
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', canonicalBusinessId).eq('is_active', true).maybeSingle()
    if (c1) connection = c1
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', canonicalBusinessId).maybeSingle()
      if (p?.id) {
        const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle()
        if (c2) connection = c2
      }
    }
    if (!connection) {
      // If we have stale cache, return it with a warning rather than failing outright
      if (cached && cached.length > 0) {
        return NextResponse.json({ data: cached, source: 'cache_stale_no_xero', warning: 'No active Xero connection — returning cached COA' })
      }
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      if (cached && cached.length > 0) {
        return NextResponse.json({ data: cached, source: 'cache_stale_token_expired', warning: 'Xero token expired — returning cached COA' })
      }
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    await fetchFromXeroAndCache(canonicalBusinessId, tokenResult.accessToken!, connection.tenant_id)

    // Return fresh data
    const { data: fresh } = await supabase
      .from('xero_accounts')
      .select('*')
      .eq('business_id', canonicalBusinessId)
      .order('xero_type', { ascending: true })
      .order('account_code', { ascending: true })

    return NextResponse.json({ data: fresh ?? [], source: 'xero_refresh' })
  } catch (err) {
    console.error('[COA Full] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/Xero/chart-of-accounts-full
 *
 * Forces an immediate refresh from Xero, ignoring cache freshness.
 * Returns the new accounts list.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  url.searchParams.set('refresh', 'true')
  const newReq = new NextRequest(url.toString(), { method: 'GET', headers: request.headers })
  return GET(newReq)
}
