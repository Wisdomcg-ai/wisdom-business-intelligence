-- Allow coaches to INSERT assessments for their assigned clients
DROP POLICY IF EXISTS "Coaches can insert client assessments" ON assessments;
CREATE POLICY "Coaches can insert client assessments" ON assessments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = assessments.user_id
        )
    );

-- Allow coaches to UPDATE assessments for their assigned clients
DROP POLICY IF EXISTS "Coaches can update client assessments" ON assessments;
CREATE POLICY "Coaches can update client assessments" ON assessments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = assessments.user_id
        )
    );
