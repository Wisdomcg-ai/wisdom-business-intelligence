import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// This is a one-time fix endpoint - should be removed after use
export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { db: { schema: 'public' } }
  );

  try {
    // We can't run raw SQL via the client, but we can try to drop/recreate via RPC
    // if there's an exec_sql function. Otherwise, we'll return instructions.

    // For now, let's try to check if the trigger exists
    const { data, error } = await supabase
      .from('financial_forecasts')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Error:', error);
      return NextResponse.json({
        error: error.message,
        instructions: 'Please run the following SQL in the Supabase Dashboard SQL Editor',
        sql: `
-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS notify_coach_on_forecast_complete ON financial_forecasts;
DROP FUNCTION IF EXISTS notify_coach_on_forecast_completion();

-- Recreate with correct column name (metadata instead of data)
CREATE OR REPLACE FUNCTION notify_coach_on_forecast_completion()
RETURNS TRIGGER AS $$
DECLARE
  coach_id UUID;
  business_name TEXT;
BEGIN
  IF NEW.is_completed = true AND (OLD.is_completed IS NULL OR OLD.is_completed = false) THEN
    SELECT bp.coach_id, b.name INTO coach_id, business_name
    FROM businesses b
    LEFT JOIN business_profiles bp ON bp.business_id = b.id
    WHERE b.id = NEW.business_id;

    IF coach_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
      VALUES (
        coach_id,
        'forecast_completed',
        'Forecast Completed',
        business_name || ' has completed their financial forecast',
        jsonb_build_object('forecast_id', NEW.id, 'business_id', NEW.business_id, 'fiscal_year', NEW.fiscal_year),
        NOW()
      );
      NEW.coach_notified_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notify_coach_on_forecast_complete
  BEFORE UPDATE ON financial_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION notify_coach_on_forecast_completion();
`
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Database connection works. The trigger fix needs to be run manually.',
      instructions: 'Please run the SQL in the Supabase Dashboard SQL Editor at: https://supabase.com/dashboard'
    });

  } catch (error) {
    console.error('Fix trigger error:', error);
    return NextResponse.json({ error: 'Failed to fix trigger' }, { status: 500 });
  }
}
