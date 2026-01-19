import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET endpoint to fetch the active forecast for a business and fiscal year
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('business_id');
    const fiscalYear = searchParams.get('fiscal_year');

    if (!businessId || !fiscalYear) {
      return NextResponse.json({ error: 'business_id and fiscal_year required' }, { status: 400 });
    }

    // Try to find an active forecast first
    let { data: forecast, error } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('business_id', businessId)
      .eq('fiscal_year', parseInt(fiscalYear))
      .eq('is_active', true)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no active forecast, look for any forecast (draft, etc.)
    if (!forecast && !error) {
      const { data: anyForecast, error: anyError } = await supabase
        .from('financial_forecasts')
        .select('*')
        .eq('business_id', businessId)
        .eq('fiscal_year', parseInt(fiscalYear))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!anyError) {
        forecast = anyForecast;
      }
    }

    if (error) {
      console.error('Error fetching forecast:', error);
      return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 });
    }

    // Return null forecast if none found (not a 404, just no forecast yet)
    return NextResponse.json({ forecast: forecast || null });

  } catch (error) {
    console.error('Error in forecast GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
