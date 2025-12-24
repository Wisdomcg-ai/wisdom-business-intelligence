import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// POST - Record a decision
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
      session_id,
      business_id,
      decision_type,
      decision_data,
      reasoning,
      ai_suggestion,
      user_accepted_ai,
      ai_confidence,
      linked_initiative_id,
      linked_pl_line_id
    } = body;

    if (!business_id || !decision_type || !decision_data) {
      return NextResponse.json(
        { error: 'business_id, decision_type, and decision_data are required' },
        { status: 400 }
      );
    }

    const { data: decision, error } = await supabaseAdmin
      .from('forecast_decisions')
      .insert({
        forecast_id,
        session_id,
        user_id: user.id,
        business_id,
        decision_type,
        decision_data,
        reasoning,
        ai_suggestion,
        user_accepted_ai,
        ai_confidence,
        linked_initiative_id,
        linked_pl_line_id
      })
      .select()
      .single();

    if (error) {
      console.error('[Forecast Decisions] Error creating:', error);
      return NextResponse.json({ error: 'Failed to record decision' }, { status: 500 });
    }

    return NextResponse.json({ decision });

  } catch (error) {
    console.error('[Forecast Decisions] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - Retrieve decisions for a session/forecast
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id');
    const forecast_id = searchParams.get('forecast_id');
    const business_id = searchParams.get('business_id');

    let query = supabaseAdmin
      .from('forecast_decisions')
      .select('*')
      .order('created_at', { ascending: true });

    if (session_id) {
      query = query.eq('session_id', session_id);
    } else if (forecast_id) {
      query = query.eq('forecast_id', forecast_id);
    } else if (business_id) {
      query = query.eq('business_id', business_id);
    } else {
      return NextResponse.json({ error: 'session_id, forecast_id, or business_id required' }, { status: 400 });
    }

    const { data: decisions, error } = await query;

    if (error) {
      console.error('[Forecast Decisions] Error fetching:', error);
      return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
    }

    return NextResponse.json({
      decisions: decisions || [],
      count: decisions?.length || 0
    });

  } catch (error) {
    console.error('[Forecast Decisions] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
