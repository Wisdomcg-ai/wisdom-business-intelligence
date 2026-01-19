-- Fix the notify_coach_on_forecast_completion trigger to use correct column name
-- The notifications table has 'metadata' column, not 'data'

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS notify_coach_on_forecast_complete ON financial_forecasts;
DROP FUNCTION IF EXISTS notify_coach_on_forecast_completion();

-- Recreate with correct column name
CREATE OR REPLACE FUNCTION notify_coach_on_forecast_completion()
RETURNS TRIGGER AS $$
DECLARE
  coach_id UUID;
  business_name TEXT;
BEGIN
  -- Only proceed if forecast was just marked complete
  IF NEW.is_completed = true AND (OLD.is_completed IS NULL OR OLD.is_completed = false) THEN
    -- Get the coach for this business
    SELECT bp.coach_id, b.name INTO coach_id, business_name
    FROM businesses b
    LEFT JOIN business_profiles bp ON bp.business_id = b.id
    WHERE b.id = NEW.business_id;

    -- If there's a coach, create a notification
    IF coach_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
      VALUES (
        coach_id,
        'forecast_completed',
        'Forecast Completed',
        business_name || ' has completed their financial forecast',
        jsonb_build_object(
          'forecast_id', NEW.id,
          'business_id', NEW.business_id,
          'fiscal_year', NEW.fiscal_year
        ),
        NOW()
      );

      -- Update the coach_notified_at field
      NEW.coach_notified_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (only if notifications table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
    CREATE TRIGGER notify_coach_on_forecast_complete
      BEFORE UPDATE ON financial_forecasts
      FOR EACH ROW
      EXECUTE FUNCTION notify_coach_on_forecast_completion();
  END IF;
END $$;
