-- Fix RLS policies for financial_forecasts table
-- The issue is that SELECT queries fail when using FOR ALL policy

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their forecasts" ON financial_forecasts;

-- Create separate policies for different operations
CREATE POLICY "Users can view their forecasts"
  ON financial_forecasts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their forecasts"
  ON financial_forecasts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their forecasts"
  ON financial_forecasts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their forecasts"
  ON financial_forecasts FOR DELETE
  USING (auth.uid() = user_id);

-- Also fix forecast_pl_lines
DROP POLICY IF EXISTS "Users can manage forecast P&L lines" ON forecast_pl_lines;

CREATE POLICY "Users can view forecast P&L lines"
  ON forecast_pl_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert forecast P&L lines"
  ON forecast_pl_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update forecast P&L lines"
  ON forecast_pl_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete forecast P&L lines"
  ON forecast_pl_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

-- Fix forecast_employees
DROP POLICY IF EXISTS "Users can manage forecast employees" ON forecast_employees;

CREATE POLICY "Users can view forecast employees"
  ON forecast_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_employees.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert forecast employees"
  ON forecast_employees FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_employees.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update forecast employees"
  ON forecast_employees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_employees.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_employees.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete forecast employees"
  ON forecast_employees FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM financial_forecasts
      WHERE financial_forecasts.id = forecast_employees.forecast_id
      AND financial_forecasts.user_id = auth.uid()
    )
  );
