import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forecast/[id]
 * Fetches a specific forecast by ID, including its saved assumptions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const forecastId = params.id;

    if (!forecastId) {
      return NextResponse.json({ error: 'Forecast ID is required' }, { status: 400 });
    }

    // Fetch the forecast
    const { data: forecast, error } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecastId)
      .single();

    if (error) {
      console.error('[Forecast API] Error fetching forecast:', error);
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 });
    }

    // Verify user has access to this forecast's business
    const { data: business } = await supabase
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', forecast.business_id)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Check access (owner or coach)
    const hasAccess = business.owner_id === user.id || business.assigned_coach_id === user.id;
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      forecast: {
        id: forecast.id,
        name: forecast.name,
        business_id: forecast.business_id,
        fiscal_year: forecast.fiscal_year,
        assumptions: forecast.assumptions,
        is_active: forecast.is_active,
        is_completed: forecast.is_completed,
        created_at: forecast.created_at,
        updated_at: forecast.updated_at,
      }
    });

  } catch (error) {
    console.error('[Forecast API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
