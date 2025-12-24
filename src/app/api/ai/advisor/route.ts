import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { aiAdvisor } from '@/lib/ai/advisor'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, ...params } = body

    // Get business context
    let businessContext = {
      businessId: params.businessId,
      userId: user.id,
      coachId: undefined as string | undefined,
      industry: params.industry,
      revenueRange: params.revenueRange,
      state: params.state,
    }

    // Try to get coach ID from business
    if (params.businessId) {
      const { data: business } = await supabase
        .from('businesses')
        .select('assigned_coach_id, industry')
        .eq('id', params.businessId)
        .single()

      if (business) {
        businessContext.coachId = business.assigned_coach_id || undefined
        businessContext.industry = businessContext.industry || business.industry
      }
    }

    let result

    switch (type) {
      case 'salary_estimate':
        result = await aiAdvisor.getSalaryEstimate(
          params.position,
          businessContext,
          {
            experience: params.experience,
            location: params.location,
          }
        )
        break

      case 'project_cost':
        result = await aiAdvisor.getProjectCostEstimate(
          params.projectType,
          businessContext,
          {
            scope: params.scope,
            complexity: params.complexity,
          }
        )
        break

      case 'forecast_validation':
        result = await aiAdvisor.validateForecast(
          {
            revenue: params.revenue,
            grossProfit: params.grossProfit,
            netProfit: params.netProfit,
            teamCosts: params.teamCosts,
            opexCosts: params.opexCosts,
          },
          businessContext
        )
        break

      default:
        return NextResponse.json(
          { error: 'Invalid request type' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('AI Advisor error:', error)
    return NextResponse.json(
      { error: 'Failed to get AI suggestion' },
      { status: 500 }
    )
  }
}

// Record user action on a suggestion
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { interactionId, action, userValue } = body

    if (!interactionId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    await aiAdvisor.recordAction(interactionId, action, userValue)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('AI Advisor action recording error:', error)
    return NextResponse.json(
      { error: 'Failed to record action' },
      { status: 500 }
    )
  }
}
