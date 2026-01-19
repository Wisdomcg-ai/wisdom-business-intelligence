-- Fix the notify_coach_on_forecast_completion trigger
-- The coach_id is on the businesses table as assigned_coach_id, NOT on business_profiles

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS notify_coach_on_forecast_complete ON financial_forecasts;
DROP FUNCTION IF EXISTS notify_coach_on_forecast_completion();

-- Recreate with correct column reference
CREATE OR REPLACE FUNCTION notify_coach_on_forecast_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id UUID;
  v_business_name TEXT;
BEGIN
  -- Only proceed if forecast was just marked complete
  IF NEW.is_completed = true AND (OLD.is_completed IS NULL OR OLD.is_completed = false) THEN
    -- Get the coach for this business (assigned_coach_id is on businesses table)
    SELECT b.assigned_coach_id, b.name INTO v_coach_id, v_business_name
    FROM businesses b
    WHERE b.id = NEW.business_id;

    -- If there's a coach, create a notification
    IF v_coach_id IS NOT NULL THEN
      BEGIN
        INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
        VALUES (
          v_coach_id,
          'forecast_completed',
          'Forecast Completed',
          COALESCE(v_business_name, 'A business') || ' has completed their financial forecast',
          jsonb_build_object(
            'forecast_id', NEW.id,
            'business_id', NEW.business_id,
            'fiscal_year', NEW.fiscal_year
          ),
          NOW()
        );

        -- Update the coach_notified_at field
        NEW.coach_notified_at := NOW();
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the main transaction if notification fails
        RAISE WARNING 'Failed to create coach notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION notify_coach_on_forecast_completion() IS
'Triggers when a forecast is marked complete, notifying the assigned coach';

-- Create trigger (only fires on UPDATE when is_completed changes)
CREATE TRIGGER notify_coach_on_forecast_complete
  BEFORE UPDATE ON financial_forecasts
  FOR EACH ROW
  WHEN (NEW.is_completed IS DISTINCT FROM OLD.is_completed)
  EXECUTE FUNCTION notify_coach_on_forecast_completion();
