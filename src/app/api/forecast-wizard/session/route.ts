import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { WizardSession, WizardStep } from '@/app/finances/forecast/types';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// GET - Retrieve or create a wizard session
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const business_id = searchParams.get('business_id');
    const forecast_id = searchParams.get('forecast_id');

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    // Look for existing incomplete session
    const { data: existingSession, error: sessionError } = await supabaseAdmin
      .from('forecast_wizard_sessions')
      .select('*')
      .eq('business_id', business_id)
      .is('completed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error('[Wizard Session] Error fetching session:', sessionError);
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }

    if (existingSession) {
      return NextResponse.json({
        session: existingSession,
        isNew: false
      });
    }

    // Create new session
    const newSession = {
      user_id: user.id,
      business_id,
      forecast_id: forecast_id || null,
      mode: 'guided',
      current_step: 'setup',
      steps_completed: {},
      years_selected: [1],
      started_at: new Date().toISOString()
    };

    const { data: createdSession, error: createError } = await supabaseAdmin
      .from('forecast_wizard_sessions')
      .insert(newSession)
      .select()
      .single();

    if (createError) {
      console.error('[Wizard Session] Error creating session:', createError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({
      session: createdSession,
      isNew: true
    });

  } catch (error) {
    console.error('[Wizard Session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update session progress
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { session_id, current_step, step_completed, years_selected, mode, forecast_id } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    // Get current session to update steps_completed
    const { data: currentSession, error: fetchError } = await supabaseAdmin
      .from('forecast_wizard_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !currentSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const updates: Partial<WizardSession> = {
      updated_at: new Date().toISOString()
    };

    // Update current step
    if (current_step) {
      updates.current_step = current_step as WizardStep;
    }

    // Update mode
    if (mode) {
      updates.mode = mode;
    }

    // Update years selected
    if (years_selected) {
      updates.years_selected = years_selected;
    }

    // Update forecast_id
    if (forecast_id) {
      updates.forecast_id = forecast_id;
    }

    // Mark a step as completed
    if (step_completed) {
      const currentStepsCompleted = currentSession.steps_completed || {};
      currentStepsCompleted[step_completed] = {
        completed: true,
        completed_at: new Date().toISOString(),
        time_spent_seconds: 0 // Could calculate this based on step start time
      };
      // Need to cast to any since Supabase expects JSONB
      (updates as any).steps_completed = currentStepsCompleted;
    }

    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('forecast_wizard_sessions')
      .update(updates)
      .eq('id', session_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Wizard Session] Error updating:', updateError);
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

    return NextResponse.json({ session: updatedSession });

  } catch (error) {
    console.error('[Wizard Session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Complete the wizard session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { session_id, forecast_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    // Mark session as completed
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('forecast_wizard_sessions')
      .update({
        completed_at: new Date().toISOString(),
        forecast_id: forecast_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', session_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (sessionError) {
      console.error('[Wizard Session] Error completing:', sessionError);
      return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 });
    }

    // If we have a forecast_id, mark it as wizard completed
    if (forecast_id) {
      await supabaseAdmin
        .from('financial_forecasts')
        .update({
          wizard_completed_at: new Date().toISOString(),
          wizard_session_id: session_id
        })
        .eq('id', forecast_id);
    }

    return NextResponse.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[Wizard Session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
