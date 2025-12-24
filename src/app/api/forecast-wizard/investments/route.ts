import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// POST - Create investment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      forecast_id,
      business_id,
      initiative_id,
      name,
      description,
      investment_type,
      amount,
      start_month,
      is_recurring,
      recurrence,
      end_month,
      pl_account_category,
      pl_line_id,
      depreciation_years,
      reasoning
    } = body;

    if (!business_id || !name || !investment_type || !amount || !start_month) {
      return NextResponse.json(
        { error: 'business_id, name, investment_type, amount, and start_month are required' },
        { status: 400 }
      );
    }

    const { data: investment, error } = await supabaseAdmin
      .from('forecast_investments')
      .insert({
        forecast_id,
        user_id: user.id,
        business_id,
        initiative_id,
        name,
        description,
        investment_type,
        amount,
        start_month,
        is_recurring: is_recurring || false,
        recurrence,
        end_month,
        pl_account_category,
        pl_line_id,
        depreciation_years,
        reasoning
      })
      .select()
      .single();

    if (error) {
      console.error('[Forecast Investments] Error creating:', error);
      return NextResponse.json({ error: 'Failed to create investment' }, { status: 500 });
    }

    return NextResponse.json({ investment });

  } catch (error) {
    console.error('[Forecast Investments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - Retrieve investments
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const forecast_id = searchParams.get('forecast_id');
    const business_id = searchParams.get('business_id');

    let query = supabaseAdmin
      .from('forecast_investments')
      .select('*, strategic_initiatives(id, title)')
      .order('created_at', { ascending: true });

    if (forecast_id) {
      query = query.eq('forecast_id', forecast_id);
    } else if (business_id) {
      query = query.eq('business_id', business_id);
    } else {
      return NextResponse.json({ error: 'forecast_id or business_id required' }, { status: 400 });
    }

    const { data: investments, error } = await query;

    if (error) {
      console.error('[Forecast Investments] Error fetching:', error);
      return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 });
    }

    return NextResponse.json({
      investments: investments || [],
      count: investments?.length || 0
    });

  } catch (error) {
    console.error('[Forecast Investments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update investment
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: investment, error } = await supabaseAdmin
      .from('forecast_investments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Forecast Investments] Error updating:', error);
      return NextResponse.json({ error: 'Failed to update investment' }, { status: 500 });
    }

    return NextResponse.json({ investment });

  } catch (error) {
    console.error('[Forecast Investments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove investment
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('forecast_investments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Forecast Investments] Error deleting:', error);
      return NextResponse.json({ error: 'Failed to delete investment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Forecast Investments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
