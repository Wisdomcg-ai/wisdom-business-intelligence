import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/**
 * GET /api/monthly-report/account-mappings?business_id=xxx
 * Returns all mappings for the business plus any unmapped Xero accounts
 */
export async function GET(request: NextRequest) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
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
      'api/monthly-report/account-mappings',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Resolve dual business IDs (businesses.id vs business_profiles.id)
    const ids = await resolveBusinessIds(supabase, businessId)

    // Fetch all existing mappings for this business (search both ID formats)
    const { data: mappings, error: mappingsError } = await supabase
      .from('account_mappings')
      .select('*')
      .in('business_id', ids.all)
      .order('report_category', { ascending: true })
      .order('xero_account_name', { ascending: true })

    if (mappingsError) {
      Sentry.captureException(mappingsError, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "[Account Mappings] Error fetching mappings" } } as any)
      return NextResponse.json({ error: 'Failed to fetch account mappings' }, { status: 500 })
    }

    // Fetch all distinct Xero accounts from xero_pl_lines for this business
    const { data: xeroAccounts, error: xeroError } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_name, account_type, section')
      .in('business_id', ids.all)

    if (xeroError) {
      Sentry.captureException(xeroError, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "[Account Mappings] Error fetching xero_pl_lines" } } as any)
      return NextResponse.json({ error: 'Failed to fetch Xero accounts' }, { status: 500 })
    }

    // Deduplicate xero accounts by account_name
    const uniqueXeroAccounts = new Map<string, { account_name: string; account_type: string; section: string }>()
    for (const acc of xeroAccounts || []) {
      if (acc.account_name && !uniqueXeroAccounts.has(acc.account_name)) {
        uniqueXeroAccounts.set(acc.account_name, {
          account_name: acc.account_name,
          account_type: acc.account_type || '',
          section: acc.section || '',
        })
      }
    }

    // Find unmapped accounts (those with no mapping row)
    const mappedNames = new Set((mappings || []).map(m => m.xero_account_name))
    const unmapped = Array.from(uniqueXeroAccounts.values()).filter(
      acc => !mappedNames.has(acc.account_name)
    )

    return NextResponse.json({
      mappings: mappings || [],
      unmapped,
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "Error in GET /api/monthly-report/account-mappings" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/monthly-report/account-mappings
 * Upsert a single mapping
 */
export async function POST(request: NextRequest) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_id,
      xero_account_name,
      xero_account_code,
      xero_account_type,
      report_category,
      report_subcategory,
      forecast_pl_line_id,
      forecast_pl_line_name,
      is_confirmed,
    } = body

    if (!business_id || !xero_account_name || !report_category) {
      return NextResponse.json(
        { error: 'business_id, xero_account_name, and report_category are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/account-mappings',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: mapping, error } = await supabase
      .from('account_mappings')
      .upsert(
        {
          business_id,
          xero_account_name,
          xero_account_code: xero_account_code || null,
          xero_account_type: xero_account_type || null,
          report_category,
          report_subcategory: report_subcategory || null,
          forecast_pl_line_id: forecast_pl_line_id || null,
          forecast_pl_line_name: forecast_pl_line_name || null,
          is_confirmed: is_confirmed ?? false,
          mapped_at: is_confirmed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'business_id,xero_account_name',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "[Account Mappings] Error upserting mapping" } } as any)
      return NextResponse.json(
        { error: error.message || 'Failed to save account mapping' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, mapping })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "Error in POST /api/monthly-report/account-mappings" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/monthly-report/account-mappings
 * Bulk update — "Confirm All" flow
 * Sets is_confirmed = true and mapped_at = now() for all given mapping IDs
 */
export async function PUT(request: NextRequest) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, mapping_ids } = body

    if (!business_id || !mapping_ids || !Array.isArray(mapping_ids) || mapping_ids.length === 0) {
      return NextResponse.json(
        { error: 'business_id and mapping_ids[] are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/account-mappings',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error } = await supabase
      .from('account_mappings')
      .update({
        is_confirmed: true,
        mapped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', business_id)
      .in('id', mapping_ids)
      .select()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "[Account Mappings] Error confirming mappings" } } as any)
      return NextResponse.json(
        { error: error.message || 'Failed to confirm mappings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      confirmed_count: updated?.length || 0,
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "Error in PUT /api/monthly-report/account-mappings" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
