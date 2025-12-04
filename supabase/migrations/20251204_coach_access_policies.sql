-- Add RLS policies for coaches to view their clients' data

-- Coaches can view assessments of their assigned clients
DROP POLICY IF EXISTS "Coaches can view client assessments" ON assessments;
CREATE POLICY "Coaches can view client assessments" ON assessments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = assessments.user_id
        )
    );

-- Coaches can view strategic_initiatives of their assigned clients
-- strategic_initiatives uses business_id which is business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Coaches can view client strategic initiatives" ON strategic_initiatives
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = strategic_initiatives.business_id
        )
    );

-- Coaches can view messages for their assigned clients' businesses
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client messages" ON messages';
        EXECUTE '
            CREATE POLICY "Coaches can view client messages" ON messages
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.id = messages.business_id
                    )
                )
        ';
    END IF;
END $$;

-- Coaches can view action_items for their assigned clients' businesses
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'action_items') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client action items" ON action_items';
        EXECUTE '
            CREATE POLICY "Coaches can view client action items" ON action_items
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.id = action_items.business_id
                    )
                )
        ';
    END IF;
END $$;

-- Coaches can view business_profiles of their assigned clients
DROP POLICY IF EXISTS "Coaches can view client business profiles" ON business_profiles;
CREATE POLICY "Coaches can view client business profiles" ON business_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = business_profiles.user_id
        )
    );

-- Coaches can view weekly_reviews of their assigned clients
DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON weekly_reviews;
CREATE POLICY "Coaches can view client weekly reviews" ON weekly_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.id = weekly_reviews.business_id
        )
    );

-- Coaches can view session_actions of their assigned clients (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_actions') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client session actions" ON session_actions';
        EXECUTE '
            CREATE POLICY "Coaches can view client session actions" ON session_actions
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.id = session_actions.business_id
                    )
                )
        ';
    END IF;
END $$;

-- Coaches can view open_loops of their assigned clients
DROP POLICY IF EXISTS "Coaches can view client open loops" ON open_loops;
CREATE POLICY "Coaches can view client open loops" ON open_loops
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = open_loops.user_id
        )
    );

-- Coaches can view issues_list of their assigned clients
DROP POLICY IF EXISTS "Coaches can view client issues" ON issues_list;
CREATE POLICY "Coaches can view client issues" ON issues_list
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = issues_list.user_id
        )
    );

-- Coaches can view stop_doing_list of their assigned clients (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stop_doing_list') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client stop doing list" ON stop_doing_list';
        EXECUTE '
            CREATE POLICY "Coaches can view client stop doing list" ON stop_doing_list
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.owner_id = stop_doing_list.user_id
                    )
                )
        ';
    END IF;
END $$;

-- Coaches can view weekly_metrics_snapshots of their assigned clients
-- weekly_metrics_snapshots.business_id references business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client weekly metrics" ON weekly_metrics_snapshots;
CREATE POLICY "Coaches can view client weekly metrics" ON weekly_metrics_snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = weekly_metrics_snapshots.business_id
        )
    );

-- Fix financial_forecasts RLS policy - business_id is business_profiles.id, NOT businesses.id
DROP POLICY IF EXISTS "Coaches can view client forecasts" ON financial_forecasts;
CREATE POLICY "Coaches can view client forecasts" ON financial_forecasts
    FOR SELECT USING (
        -- User owns the forecast
        user_id = auth.uid()
        OR
        -- Coach assigned to the client
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = financial_forecasts.business_id
        )
        OR
        -- Super admin
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );
