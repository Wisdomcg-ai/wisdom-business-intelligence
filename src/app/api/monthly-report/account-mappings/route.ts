import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

// VALID-05a (observe mode): GET filters by business; POST patches one mapping; PUT confirms mappings.
const AccountMappingsGetQuerySchema = z.object({
  business_id: z.string().optional(),
})

// Every field but the three identifying ones is optional AND nullable, which
// is the shape the handler honours: absent = keep what is stored, null = clear.
const AccountMappingsPostSchema = z.object({
  business_id: z.string(),
  xero_account_name: z.string(),
  xero_account_code: z.string().nullable().optional(),
  xero_account_type: z.string().nullable().optional(),
  report_category: z.string(),
  report_subcategory: z.string().nullable().optional(),
  forecast_pl_line_id: z.string().nullable().optional(),
  forecast_pl_line_name: z.string().nullable().optional(),
  is_confirmed: z.boolean().optional(),
})

const AccountMappingsPutSchema = z.object({
  business_id: z.string(),
  mapping_ids: z.array(z.string()),
})

/**
 * GET /api/monthly-report/account-mappings?business_id=xxx
 * Returns all mappings for the business plus any unmapped Xero accounts
 */
async function getHandler(request: Request) {
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
    const ids = await resolveBusinessProfileIds(supabase, businessId)

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
 *
 * Save one mapping. The body is a PATCH: a field the caller omits keeps the
 * value already stored, an explicit `null` clears it, and the row is created
 * when (business_id, xero_account_name) has none. See the write block below
 * for why — the mapping editor saves one control at a time.
 */
async function postHandler(request: Request) {
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

    // ── The body is a patch, not a replacement ───────────────────────────
    //
    // This was one blanket upsert that spelled out every column with
    // `|| null`, so every field the caller did not mention was written as an
    // explicit NULL. The mapping editor saves one control at a time, so each
    // save quietly destroyed what the other controls held:
    //
    //   change an account's report category -> erased forecast_pl_line_id and
    //     forecast_pl_line_name (the coach's budget-line pin, which
    //     monthly-report/generate reads as the TOP tier of budget matching,
    //     above the account code) and report_subcategory (the expense group)
    //   link an account to a budget line    -> erased xero_account_code,
    //     xero_account_type and report_subcategory
    //
    // Both are one click in the mapping editor, and the damage is invisible
    // there: the control you touched shows the value you chose, and the column
    // you wiped is a different column of the same table.
    //
    // So: write the columns the caller actually sent, and create the row only
    // when there isn't one. Presence is `!== undefined`, not truthiness —
    // an explicit `null` still clears, because "unlink this budget line" has
    // to stay expressible.
    //
    // Written as UPDATE-then-INSERT rather than a narrower upsert so the
    // "omitted means untouched" rule is a property of this code and not of
    // PostgREST's conflict-resolution semantics.
    const now = new Date().toISOString()

    const patch: Record<string, unknown> = {
      business_id,
      xero_account_name,
      report_category,
      updated_at: now,
    }
    if (xero_account_code !== undefined) patch.xero_account_code = xero_account_code || null
    if (xero_account_type !== undefined) patch.xero_account_type = xero_account_type || null
    if (report_subcategory !== undefined) patch.report_subcategory = report_subcategory || null
    if (forecast_pl_line_id !== undefined) patch.forecast_pl_line_id = forecast_pl_line_id || null
    if (forecast_pl_line_name !== undefined) patch.forecast_pl_line_name = forecast_pl_line_name || null
    if (is_confirmed !== undefined) {
      patch.is_confirmed = is_confirmed
      // mapped_at records WHEN the mapping was confirmed, so it moves with
      // is_confirmed — and only when the caller says something about it.
      patch.mapped_at = is_confirmed ? now : null
    }

    const updateExisting = () =>
      supabase
        .from('account_mappings')
        .update(patch)
        .eq('business_id', business_id)
        .eq('xero_account_name', xero_account_name)
        .select()
        .maybeSingle()

    const updated = await updateExisting()
    let mapping = updated.data
    let error = updated.error

    if (!error && !mapping) {
      // No row for this (business, account) yet. Columns the caller omitted
      // take the table's defaults — all NULL bar is_confirmed/is_auto_mapped
      // (false) — which is the same first-save row the old upsert produced.
      const inserted = await supabase
        .from('account_mappings')
        .insert(patch)
        .select()
        .single()

      if (inserted.error?.code === '23505') {
        // Another save created the row between the update and the insert
        // (UNIQUE (business_id, xero_account_name)). Re-run the update so this
        // request's fields still land, and still only on its own columns.
        const retried = await updateExisting()
        mapping = retried.data
        error = retried.error
      } else {
        mapping = inserted.data
        error = inserted.error
      }
    }

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/account-mappings' }, extra: { context: "[Account Mappings] Error saving mapping" } } as any)
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
async function putHandler(request: Request) {
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

export const GET = withQuerySchema('monthly-report/account-mappings', AccountMappingsGetQuerySchema, getHandler)
export const POST = withSchema('monthly-report/account-mappings', AccountMappingsPostSchema, postHandler)
export const PUT = withSchema('monthly-report/account-mappings', AccountMappingsPutSchema, putHandler)
