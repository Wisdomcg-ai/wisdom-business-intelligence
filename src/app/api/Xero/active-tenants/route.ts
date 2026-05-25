/**
 * GET /api/Xero/active-tenants?business_id=X
 *
 * Returns the list of active + included xero_connections for a business,
 * for the consolidated-members badge on Step 2 of the forecast wizard
 * (Phase 67 Tier B).
 *
 * Response:
 *   { tenants: Array<{
 *       tenant_id: string
 *       tenant_name: string
 *       display_name: string | null
 *       functional_currency: string  // ISO 4217, default 'AUD'
 *       include_in_consolidation: boolean
 *     }>
 *   }
 *
 * Empty array when no Xero connection exists. Multi-tenant-safe via
 * resolveBusinessIds (handles dual businesses.id / business_profiles.id).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
)

export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = request.nextUrl.searchParams.get('business_id')
    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const ids = await resolveBusinessIds(supabaseAdmin, businessId)
    const { data: conns, error } = await supabaseAdmin
      .from('xero_connections')
      .select('tenant_id, tenant_name, display_name, functional_currency, include_in_consolidation')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('display_name', { ascending: true })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'Xero/active-tenants' } } as any)
      return NextResponse.json({ error: 'Failed to load tenants', detail: error.message }, { status: 500 })
    }

    const tenants = (conns ?? []).map((c) => ({
      tenant_id: c.tenant_id,
      tenant_name: c.tenant_name,
      display_name: c.display_name,
      functional_currency: (c.functional_currency || 'AUD').toUpperCase(),
      include_in_consolidation: c.include_in_consolidation !== false,
    }))

    return NextResponse.json({ tenants })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'Xero/active-tenants' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
