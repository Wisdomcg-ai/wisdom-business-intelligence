import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/goals/save
 *
 * Saves all Goals Wizard data using the service role client (bypasses RLS).
 * This is the coach save path — the browser client's RLS policies may not
 * allow coaches to write to all the strategic planning tables, so this API
 * route handles it server-side with full access.
 *
 * The route still verifies that the caller is authorized (coach, owner,
 * admin, or super_admin) before performing any writes.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    // ownerUserId intentionally IGNORED even if the client sends it — ownership is
    // derived server-side from businesses.owner_id to prevent attribution tampering
    // by a coach or admin writing to the wrong user.
    const { businessId, profileId, data } = body

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Use service role client for all database operations
    const admin = createServiceRoleClient()

    // Verify access: owner, coach, team member, or super_admin
    const { data: business } = await admin
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', businessId)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const isOwner = business.owner_id === user.id
    const isCoach = business.assigned_coach_id === user.id

    const { data: superAdmin } = await admin
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle()

    if (!isOwner && !isCoach && !superAdmin) {
      // Also check business_users
      const { data: membership } = await admin
        .from('business_users')
        .select('user_id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Determine the correct IDs — ownership ALWAYS resolves to the client
    // who owns the business, never the caller. If the business has no owner_id
    // we refuse the write instead of silently attributing to the coach.
    const saveProfileId = profileId || businessId
    const saveUserId = business.owner_id
    if (!saveUserId) {
      return NextResponse.json(
        { error: 'Business has no owner — cannot save goals. Assign an owner first.' },
        { status: 422 },
      )
    }

    const errors: string[] = []
    const successes: string[] = []

    // ========================
    // SAVE FINANCIAL DATA
    // ========================
    if (data.financial) {
      try {
        const { financialData, coreMetrics, yearType, quarterlyTargets } = data.financial
        const financialPayload: Record<string, any> = {
          business_id: saveProfileId,
          user_id: saveUserId,
          year_type: yearType || 'FY',
          quarterly_targets: quarterlyTargets || {},
          updated_at: new Date().toISOString()
        }

        // Map financial fields
        if (financialData) {
          const metrics = ['revenue', 'gross_profit', 'gross_margin', 'net_profit', 'net_margin', 'customers', 'employees']
          const camelMap: Record<string, string> = {
            revenue: 'revenue', gross_profit: 'grossProfit', gross_margin: 'grossMargin',
            net_profit: 'netProfit', net_margin: 'netMargin', customers: 'customers', employees: 'employees'
          }
          for (const metric of metrics) {
            const camelKey = camelMap[metric]
            if (financialData[camelKey]) {
              financialPayload[`${metric}_current`] = financialData[camelKey].current || 0
              financialPayload[`${metric}_year1`] = financialData[camelKey].year1 || 0
              financialPayload[`${metric}_year2`] = financialData[camelKey].year2 || 0
              financialPayload[`${metric}_year3`] = financialData[camelKey].year3 || 0
            }
          }
        }

        // Map core metrics
        if (coreMetrics) {
          const coreMap: Record<string, string> = {
            leads_per_month: 'leadsPerMonth', conversion_rate: 'conversionRate',
            avg_transaction_value: 'avgTransactionValue', team_headcount: 'teamHeadcount',
            owner_hours_per_week: 'ownerHoursPerWeek'
          }
          for (const [dbKey, jsKey] of Object.entries(coreMap)) {
            if (coreMetrics[jsKey]) {
              financialPayload[`${dbKey}_current`] = coreMetrics[jsKey].current || 0
              financialPayload[`${dbKey}_year1`] = coreMetrics[jsKey].year1 || 0
              financialPayload[`${dbKey}_year2`] = coreMetrics[jsKey].year2 || 0
              financialPayload[`${dbKey}_year3`] = coreMetrics[jsKey].year3 || 0
            }
          }
        }

        const { error } = await admin
          .from('business_financial_goals')
          .upsert(financialPayload, { onConflict: 'business_id' })

        if (error) {
          console.error('[API /goals/save] Financial save error:', error)
          errors.push(`Financial: ${error.message}`)
        } else {
          successes.push('financial')
        }
      } catch (e: any) {
        errors.push(`Financial: ${e.message}`)
      }
    }

    // ========================
    // SAVE KPIs
    // ========================
    if (data.kpis && Array.isArray(data.kpis)) {
      try {
        // KPIs use businesses.id for the business_id column
        const kpiBusinessId = businessId
        const kpis = data.kpis

        // Get existing KPIs
        const { data: existingKPIs } = await admin
          .from('business_kpis')
          .select('kpi_id')
          .eq('business_id', kpiBusinessId)

        const existingKPIIds = new Set(existingKPIs?.map((k: any) => k.kpi_id) || [])
        const newKPIIds = new Set(kpis.map((k: any) => k.id))

        // Delete removed KPIs
        const toDelete = Array.from(existingKPIIds).filter(id => !newKPIIds.has(id))
        if (toDelete.length > 0) {
          await admin
            .from('business_kpis')
            .delete()
            .eq('business_id', kpiBusinessId)
            .in('kpi_id', toDelete as string[])
        }

        // Upsert KPIs
        if (kpis.length > 0) {
          const kpisToUpsert = kpis.map((kpi: any) => ({
            business_id: kpiBusinessId,
            user_id: saveUserId,
            kpi_id: kpi.id,
            name: kpi.name,
            friendly_name: kpi.friendlyName || kpi.name,
            description: kpi.description || null,
            category: kpi.category || null,
            frequency: kpi.frequency || null,
            unit: kpi.unit || null,
            current_value: kpi.currentValue || 0,
            year1_target: kpi.year1Target || 0,
            year2_target: kpi.year2Target || 0,
            year3_target: kpi.year3Target || 0,
            is_active: true,
            updated_at: new Date().toISOString()
          }))

          const { error } = await admin
            .from('business_kpis')
            .upsert(kpisToUpsert, { onConflict: 'business_id,kpi_id', ignoreDuplicates: false })

          if (error) {
            console.error('[API /goals/save] KPI save error:', error)
            errors.push(`KPIs: ${error.message}`)
          } else {
            successes.push('kpis')
          }
        } else {
          successes.push('kpis')
        }
      } catch (e: any) {
        errors.push(`KPIs: ${e.message}`)
      }
    }

    // ========================
    // SAVE INITIATIVES (all step types)
    // ========================
    if (data.initiatives) {
      const stepTypes = [
        { key: 'strategicIdeas', type: 'strategic_ideas' },
        { key: 'roadmapSuggestions', type: 'roadmap' },
        { key: 'twelveMonthInitiatives', type: 'twelve_month' },
        { key: 'q1', type: 'q1' },
        { key: 'q2', type: 'q2' },
        { key: 'q3', type: 'q3' },
        { key: 'q4', type: 'q4' },
        { key: 'sprintFocus', type: 'sprint' }
      ]

      for (const { key, type } of stepTypes) {
        const initiatives = data.initiatives[key]
        if (!initiatives || !Array.isArray(initiatives)) continue

        try {
          // Get existing for this step_type
          const { data: existing } = await admin
            .from('strategic_initiatives')
            .select('id')
            .eq('business_id', saveProfileId)
            .eq('step_type', type)

          const existingIds = new Set(existing?.map((e: any) => e.id) || [])

          // Separate new vs existing
          const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          const toInsert = initiatives.filter((i: any) => !i.id || !isValidUUID(i.id) || !existingIds.has(i.id))
          const toUpsert = initiatives.filter((i: any) => i.id && isValidUUID(i.id) && existingIds.has(i.id))

          // Insert new items
          if (toInsert.length > 0) {
            const insertPayload = toInsert.map((i: any, idx: number) => ({
              business_id: saveProfileId,
              user_id: saveUserId,
              title: i.title || '',
              description: i.description || '',
              notes: i.notes || '',
              category: i.category || '',
              priority: i.priority || 'medium',
              estimated_effort: i.estimatedEffort || '',
              step_type: type,
              source: i.source || 'manual',
              timeline: i.timeline || '',
              selected: i.selected !== false,
              order_index: i.orderIndex ?? idx,
              linked_kpis: typeof i.linkedKPIs === 'string' ? i.linkedKPIs : JSON.stringify(i.linkedKPIs || []),
              assigned_to: i.assignedTo || null,
              idea_type: i.ideaType || null,
              milestones: typeof i.milestones === 'string' ? i.milestones : JSON.stringify(i.milestones || []),
              tasks: typeof i.tasks === 'string' ? i.tasks : JSON.stringify(i.tasks || []),
              why: i.why || '',
              outcome: i.outcome || '',
              start_date: i.startDate || null,
              end_date: i.endDate || null,
              total_hours: i.totalHours || null,
              updated_at: new Date().toISOString()
            }))

            const { error: insertError } = await admin
              .from('strategic_initiatives')
              .insert(insertPayload)

            if (insertError) {
              console.error(`[API /goals/save] Insert ${type} error:`, insertError)
              errors.push(`${type} insert: ${insertError.message}`)
            }
          }

          // Upsert existing items
          if (toUpsert.length > 0) {
            const upsertPayload = toUpsert.map((i: any, idx: number) => ({
              id: i.id,
              business_id: saveProfileId,
              user_id: saveUserId,
              title: i.title || '',
              description: i.description || '',
              notes: i.notes || '',
              category: i.category || '',
              priority: i.priority || 'medium',
              estimated_effort: i.estimatedEffort || '',
              step_type: type,
              source: i.source || 'manual',
              timeline: i.timeline || '',
              selected: i.selected !== false,
              order_index: i.orderIndex ?? idx,
              linked_kpis: typeof i.linkedKPIs === 'string' ? i.linkedKPIs : JSON.stringify(i.linkedKPIs || []),
              assigned_to: i.assignedTo || null,
              idea_type: i.ideaType || null,
              milestones: typeof i.milestones === 'string' ? i.milestones : JSON.stringify(i.milestones || []),
              tasks: typeof i.tasks === 'string' ? i.tasks : JSON.stringify(i.tasks || []),
              why: i.why || '',
              outcome: i.outcome || '',
              start_date: i.startDate || null,
              end_date: i.endDate || null,
              total_hours: i.totalHours || null,
              updated_at: new Date().toISOString()
            }))

            const { error: upsertError } = await admin
              .from('strategic_initiatives')
              .upsert(upsertPayload, { onConflict: 'id', ignoreDuplicates: false })

            if (upsertError) {
              console.error(`[API /goals/save] Upsert ${type} error:`, upsertError)
              errors.push(`${type} upsert: ${upsertError.message}`)
            }
          }

          // Delete items that were removed
          const currentIds = initiatives.filter((i: any) => i.id && isValidUUID(i.id)).map((i: any) => i.id)
          const toRemove = Array.from(existingIds).filter(id => !currentIds.includes(id))
          if (toRemove.length > 0) {
            await admin
              .from('strategic_initiatives')
              .delete()
              .eq('business_id', saveProfileId)
              .eq('step_type', type)
              .in('id', toRemove as string[])
          }

          successes.push(type)
        } catch (e: any) {
          errors.push(`${type}: ${e.message}`)
        }
      }
    }

    // ========================
    // SAVE SPRINT KEY ACTIONS
    // ========================
    if (data.sprintKeyActions && Array.isArray(data.sprintKeyActions)) {
      try {
        const actions = data.sprintKeyActions

        if (actions.length > 0) {
          const actionsPayload = actions.map((a: any) => ({
            id: a.id && /^[0-9a-f]{8}-/i.test(a.id) ? a.id : undefined,
            business_id: saveProfileId,
            user_id: saveUserId,
            action: a.action || '',
            owner: a.owner || null,
            due_date: a.dueDate || null,
            status: a.status || 'not_started',
            updated_at: new Date().toISOString()
          }))

          const { error } = await admin
            .from('sprint_key_actions')
            .upsert(actionsPayload, { onConflict: 'id' })

          if (error) {
            console.error('[API /goals/save] Sprint actions error:', error)
            errors.push(`Sprint actions: ${error.message}`)
          } else {
            successes.push('sprintActions')
          }
        }

        // Delete removed actions
        const { data: existing } = await admin
          .from('sprint_key_actions')
          .select('id')
          .eq('business_id', saveProfileId)

        if (existing && existing.length > 0) {
          const currentIds = actions
            .filter((a: any) => a.id && /^[0-9a-f]{8}-/i.test(a.id))
            .map((a: any) => a.id)
          const toRemove = existing.filter((e: any) => !currentIds.includes(e.id)).map((e: any) => e.id)
          if (toRemove.length > 0) {
            await admin
              .from('sprint_key_actions')
              .delete()
              .in('id', toRemove)
          }
        }
      } catch (e: any) {
        errors.push(`Sprint actions: ${e.message}`)
      }
    }

    // ========================
    // SAVE OPERATIONAL ACTIVITIES
    // ========================
    if (data.operationalActivities && Array.isArray(data.operationalActivities)) {
      try {
        const activities = data.operationalActivities

        if (activities.length > 0) {
          const activitiesPayload = activities.map((a: any) => ({
            id: a.id && /^[0-9a-f]{8}-/i.test(a.id) ? a.id : undefined,
            business_id: saveProfileId,
            user_id: saveUserId,
            function_id: a.functionId || a.function_id || '',
            name: a.name || '',
            description: a.description || '',
            frequency: a.frequency || 'weekly',
            recommended_frequency: a.recommendedFrequency || a.recommended_frequency || null,
            source: a.source || 'manual',
            assigned_to: a.assignedTo || a.assigned_to || null,
            order_index: a.orderIndex ?? a.order_index ?? 0,
            updated_at: new Date().toISOString()
          }))

          const { error } = await admin
            .from('operational_activities')
            .upsert(activitiesPayload, { onConflict: 'id' })

          if (error) {
            console.error('[API /goals/save] Operational activities error:', error)
            errors.push(`Operational activities: ${error.message}`)
          } else {
            successes.push('operationalActivities')
          }
        }

        // Delete removed activities
        const { data: existing } = await admin
          .from('operational_activities')
          .select('id')
          .eq('business_id', saveProfileId)

        if (existing && existing.length > 0) {
          const currentIds = activities
            .filter((a: any) => a.id && /^[0-9a-f]{8}-/i.test(a.id))
            .map((a: any) => a.id)
          const toRemove = existing.filter((e: any) => !currentIds.includes(e.id)).map((e: any) => e.id)
          if (toRemove.length > 0) {
            await admin
              .from('operational_activities')
              .delete()
              .in('id', toRemove)
          }
        }
      } catch (e: any) {
        errors.push(`Operational activities: ${e.message}`)
      }
    }

    // Return results
    if (errors.length > 0) {
      console.error('[API /goals/save] Save completed with errors:', errors)
      return NextResponse.json({
        success: false,
        errors,
        successes,
        message: `${successes.length} sections saved, ${errors.length} failed`
      }, { status: 207 }) // 207 Multi-Status
    }

    return NextResponse.json({
      success: true,
      successes,
      message: `All ${successes.length} sections saved successfully`
    })
  } catch (err: any) {
    console.error('[API /goals/save] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
