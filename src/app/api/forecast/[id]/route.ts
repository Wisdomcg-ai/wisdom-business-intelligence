import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { archiveBeforeDelete, deleteArchiveRow, FORECAST_CASCADE_CHILDREN } from '@/lib/data/archive-before-delete'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z.object({}).passthrough()
// R27: `confirm=true` is required to proceed with the destructive delete.
const DeleteQuerySchema = z.object({ confirm: z.string().optional() }).passthrough()

async function getHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params

    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // Fetch the forecast
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError) {
      Sentry.captureException(forecastError, { tags: { route: 'forecast/[id]' }, extra: { context: "[API /forecast/[id]] Error fetching forecast" } } as any)
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
    }

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Verify access: user owns the business, is a team member, or is a coach/admin
    // forecast.business_id is business_profiles.id (FK), so look up the actual business
    let businessId = forecast.business_id
    let ownerId: string | null = null

    // Try direct lookup in businesses table first
    const { data: bizDirect } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', forecast.business_id)
      .maybeSingle()

    if (bizDirect) {
      businessId = bizDirect.id
      ownerId = bizDirect.owner_id
    } else {
      // forecast.business_id is likely business_profiles.id — resolve to businesses.id
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('business_id, user_id')
        .eq('id', forecast.business_id)
        .maybeSingle()

      if (profile?.business_id) {
        businessId = profile.business_id
        const { data: biz } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', profile.business_id)
          .maybeSingle()
        ownerId = biz?.owner_id || null
      }
      // Also check if the profile user matches
      if (profile?.user_id === user.id) {
        ownerId = user.id // treat profile owner as business owner
      }
    }

    const isOwner = ownerId === user.id

    if (!isOwner) {
      // Check if user is a team member of this business
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!teamMember) {
        // Check if user is a coach/admin
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/forecast/[id]',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // Fallback: if assumptions were previously saved in category_assumptions, map them
    if (!forecast.assumptions && forecast.category_assumptions?.wizard_v4?.assumptions) {
      forecast.assumptions = forecast.category_assumptions.wizard_v4.assumptions
    }

    return NextResponse.json({ forecast })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecast/[id]' }, extra: { context: "[API /forecast/[id]] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE — permanently remove a forecast.
 *
 * Cascades via DB FKs to forecast_pl_lines, forecast_employees,
 * forecast_payroll_summary, cashflow_* and other child tables. The few
 * tables with SET NULL semantics (forecast_audit_log, monthly_report_settings)
 * keep their rows with a null forecast_id pointer — intentional, those rows
 * are historical / cross-forecast artifacts.
 *
 * Access: owner of the business OR coach/super_admin. Team members get 403
 * — deletion is destructive and stays an owner-level capability.
 */
async function deleteHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: forecastId } = await params
    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 })
    }

    // Load the forecast to resolve its owning business (mirrors the GET
    // handler's dual-ID resolution since financial_forecasts.business_id
    // points at business_profiles.id, not businesses.id).
    const { data: forecast, error: fetchError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecastId)
      .maybeSingle()

    if (fetchError) {
      Sentry.captureException(fetchError, { tags: { route: 'forecast/[id]' }, extra: { context: '[API DELETE /forecast/[id]] fetch error' } } as any)
      return NextResponse.json({ error: 'Failed to load forecast' }, { status: 500 })
    }
    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    let ownerId: string | null = null
    const { data: bizDirect } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', forecast.business_id)
      .maybeSingle()
    if (bizDirect) {
      ownerId = bizDirect.owner_id
    } else {
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('business_id, user_id')
        .eq('id', forecast.business_id)
        .maybeSingle()
      if (profile?.business_id) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', profile.business_id)
          .maybeSingle()
        ownerId = biz?.owner_id || null
      }
      if (profile?.user_id === user.id) {
        ownerId = user.id
      }
    }

    const isOwner = ownerId === user.id
    if (!isOwner) {
      const { data: roleData } = await supabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
      if (!isCoachOrAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdictDel = await requireSectionPermission(
      supabase,            // auth-bound client (assigned from createRouteHandlerClient() above)
      user.id,
      forecast.business_id,
      'finances',
    )
    const _sectionBlockedDel = enforceSectionPermission(
      _sectionVerdictDel,
      'finances',
      'api/forecast/[id]',
      user.id,
      forecast.business_id,
    )
    if (_sectionBlockedDel) return _sectionBlockedDel

    // R27: require explicit confirmation for this destructive, cascading delete.
    const confirm = new URL(request.url).searchParams.get('confirm')
    if (confirm !== 'true') {
      return NextResponse.json(
        { error: 'Confirmation required: pass ?confirm=true to delete this forecast.' },
        { status: 400 },
      )
    }

    // R27: archive the forecast + all cascade-deleted children BEFORE deleting,
    // so the deletion is recoverable. If archiving fails, abort — never hard
    // delete without a snapshot.
    const admin = createServiceRoleClient()
    const { data: fullForecast, error: fullErr } = await admin
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecastId)
      .maybeSingle()
    if (fullErr || !fullForecast) {
      Sentry.captureException(fullErr ?? new Error('forecast vanished before archive'), { tags: { route: 'forecast/[id]' }, extra: { context: '[API DELETE /forecast/[id]] pre-archive fetch' } } as any)
      return NextResponse.json({ error: 'Failed to load forecast for archiving' }, { status: 500 })
    }

    const archived = await archiveBeforeDelete({
      admin,
      entityType: 'forecast',
      entityId: forecastId,
      businessId: forecast.business_id,
      deletedBy: user.id,
      parent: fullForecast as Record<string, unknown>,
      children: FORECAST_CASCADE_CHILDREN,
    })
    if (!archived.ok) {
      Sentry.captureMessage('R27: forecast delete aborted — archive failed', {
        level: 'error',
        tags: { route: 'forecast/[id]', invariant: 'archive_before_delete_failed' },
        extra: { forecastId, error: archived.error },
      } as any)
      return NextResponse.json({ error: 'Deletion aborted: could not archive forecast' }, { status: 500 })
    }

    const { error: deleteError } = await supabase
      .from('financial_forecasts')
      .delete()
      .eq('id', forecastId)

    if (deleteError) {
      // Roll back the now-orphaned archive snapshot (best effort).
      await deleteArchiveRow(admin, archived.archiveId)
      Sentry.captureException(deleteError, { tags: { route: 'forecast/[id]' }, extra: { context: '[API DELETE /forecast/[id]] delete error' } } as any)
      return NextResponse.json({ error: 'Failed to delete forecast' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: forecastId, archiveId: archived.archiveId })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecast/[id]' }, extra: { context: '[API DELETE /forecast/[id]] unexpected error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'forecast/[id]',
  GetQuerySchema,
  getHandler as unknown as (
    request: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
)

export const DELETE = withQuerySchema(
  'forecast/[id]',
  DeleteQuerySchema,
  deleteHandler as unknown as (
    request: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
)
