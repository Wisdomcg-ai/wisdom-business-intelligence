import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/** Map xero_pl_lines.account_type to the category names the cashflow engine expects */
function mapAccountTypeToCategory(accountType: string): string {
  switch (accountType) {
    case 'revenue': return 'Revenue'
    case 'other_income': return 'Other Income'
    case 'cogs': return 'Cost of Sales'
    case 'opex': return 'Operating Expenses'
    case 'other_expense': return 'Other Expenses'
    default: return 'Operating Expenses'
  }
}

function isRevenueType(accountType: string): boolean {
  return accountType === 'revenue' || accountType === 'other_income'
}

/**
 * GET /api/forecast/cashflow/xero-actuals?business_id=xxx
 *
 * Returns all xero_pl_lines for a business, formatted as PLLine-compatible
 * objects with actual_months populated from real Xero data.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = new URL(request.url).searchParams.get('business_id')
    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve business IDs (xero_pl_lines may be stored under either ID format)
    const ids = await resolveBusinessIds(supabase, businessId)

    const { data: xeroLines, error } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_code, account_type, monthly_values')
      .in('business_id', ids.all)

    if (error) {
      console.error('[Xero Actuals] Error:', error)
      return NextResponse.json({ error: 'Failed to load Xero actuals' }, { status: 500 })
    }

    // Convert to PLLine-compatible format
    const lines = (xeroLines || []).map((xl, i) => ({
      id: `xero-actual-${i}`,
      account_name: xl.account_name,
      account_code: xl.account_code,
      category: mapAccountTypeToCategory(xl.account_type),
      account_type: xl.account_type,
      is_revenue: isRevenueType(xl.account_type),
      is_from_xero: true,
      actual_months: xl.monthly_values || {},
      forecast_months: {},
    }))

    return NextResponse.json({ data: lines })
  } catch (err) {
    console.error('[Xero Actuals] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
