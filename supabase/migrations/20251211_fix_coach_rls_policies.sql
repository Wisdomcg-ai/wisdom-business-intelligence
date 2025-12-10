-- =====================================================
-- FIX COACH RLS POLICIES FOR ALL TABLES
-- =====================================================
-- Coaches need to view AND create/update data for their assigned clients

-- weekly_reviews - coaches need SELECT and INSERT
DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON weekly_reviews;
CREATE POLICY "Coaches can view client weekly reviews" ON weekly_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.id = weekly_reviews.business_id
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = weekly_reviews.business_id
        )
    );

DROP POLICY IF EXISTS "Coaches can create client weekly reviews" ON weekly_reviews;
CREATE POLICY "Coaches can create client weekly reviews" ON weekly_reviews
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.id = weekly_reviews.business_id
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = weekly_reviews.business_id
        )
    );

DROP POLICY IF EXISTS "Coaches can update client weekly reviews" ON weekly_reviews;
CREATE POLICY "Coaches can update client weekly reviews" ON weekly_reviews
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.id = weekly_reviews.business_id
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
            AND bp.id = weekly_reviews.business_id
        )
    );

-- Super admin policies for weekly_reviews
DROP POLICY IF EXISTS "Super admins can manage weekly reviews" ON weekly_reviews;
CREATE POLICY "Super admins can manage weekly reviews" ON weekly_reviews
    FOR ALL USING (
        EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

-- stop_doing_hourly_rates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stop_doing_hourly_rates') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client stop doing rates" ON stop_doing_hourly_rates';
        EXECUTE '
            CREATE POLICY "Coaches can view client stop doing rates" ON stop_doing_hourly_rates
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.owner_id = stop_doing_hourly_rates.user_id
                    )
                )
        ';
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all stop doing rates" ON stop_doing_hourly_rates';
        EXECUTE '
            CREATE POLICY "Super admins can view all stop doing rates" ON stop_doing_hourly_rates
                FOR SELECT USING (
                    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
                )
        ';
    END IF;
END $$;

-- business_financial_goals
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'business_financial_goals') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client financial goals" ON business_financial_goals';
        EXECUTE '
            CREATE POLICY "Coaches can view client financial goals" ON business_financial_goals
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE b.assigned_coach_id = auth.uid()
                        AND bp.id::text = business_financial_goals.business_id::text
                    )
                    OR EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.id::text = business_financial_goals.business_id::text
                    )
                )
        ';
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all financial goals" ON business_financial_goals';
        EXECUTE '
            CREATE POLICY "Super admins can view all financial goals" ON business_financial_goals
                FOR SELECT USING (
                    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
                )
        ';
    END IF;
END $$;

-- swot_analyses - fix for coaches
DROP POLICY IF EXISTS "Coaches can view client swot analyses" ON swot_analyses;
CREATE POLICY "Coaches can view client swot analyses" ON swot_analyses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = swot_analyses.user_id
        )
    );

-- stage_transitions (uses business_id referencing business_profiles)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stage_transitions') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage client stage transitions" ON stage_transitions';
        EXECUTE '
            CREATE POLICY "Coaches can manage client stage transitions" ON stage_transitions
                FOR ALL USING (
                    EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE b.assigned_coach_id = auth.uid()
                        AND bp.id = stage_transitions.business_id
                    )
                    OR EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.owner_id = bp.user_id
                        WHERE b.assigned_coach_id = auth.uid()
                        AND bp.id = stage_transitions.business_id
                    )
                )
        ';
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can manage all stage transitions" ON stage_transitions';
        EXECUTE '
            CREATE POLICY "Super admins can manage all stage transitions" ON stage_transitions
                FOR ALL USING (
                    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
                )
        ';
    END IF;
END $$;

-- strategy_data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'strategy_data') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client strategy data" ON strategy_data';
        EXECUTE '
            CREATE POLICY "Coaches can view client strategy data" ON strategy_data
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.owner_id = strategy_data.user_id
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE b.assigned_coach_id = auth.uid()
                        AND bp.id::text = strategy_data.business_id::text
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.assigned_coach_id = auth.uid()
                        AND b.id::text = strategy_data.business_id::text
                    )
                )
        ';
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all strategy data" ON strategy_data';
        EXECUTE '
            CREATE POLICY "Super admins can view all strategy data" ON strategy_data
                FOR SELECT USING (
                    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
                )
        ';
    END IF;
END $$;

-- business_users - ensure coaches can view their clients' team members
DROP POLICY IF EXISTS "Coaches can view client team members" ON business_users;
CREATE POLICY "Coaches can view client team members" ON business_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = business_users.business_id
            AND b.assigned_coach_id = auth.uid()
        )
    );
