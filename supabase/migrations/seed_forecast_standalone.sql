DO $$
DECLARE
  v_user_id UUID := '791ce5cf-3998-4161-9f81-7a2440c618af';
  v_business_id UUID;
  v_profile_id UUID;
  v_forecast_id UUID;
  v_ws_id UUID;
  v_steps jsonb;
  v_assumptions jsonb;
  v_a1 jsonb; v_a2 jsonb; v_a3 jsonb; v_a4 jsonb;
  v_b1 jsonb; v_b2 jsonb; v_b3 jsonb; v_b4 jsonb;
  v_c1 jsonb; v_c2 jsonb; v_c3 jsonb; v_c4 jsonb;
  v_d1 jsonb; v_d2 jsonb; v_d3 jsonb; v_d4 jsonb;
  v_e1 jsonb; v_e2 jsonb; v_e3 jsonb; v_e4 jsonb;
  v_f1 jsonb; v_f2 jsonb; v_f3 jsonb; v_f4 jsonb;
  v_g1 jsonb; v_g2 jsonb; v_g3 jsonb; v_g4 jsonb;
  v_h1 jsonb; v_h2 jsonb; v_h3 jsonb; v_h4 jsonb;
  v_i1 jsonb; v_i2 jsonb; v_i3 jsonb; v_i4 jsonb;
  v_j1 jsonb; v_j2 jsonb; v_j3 jsonb; v_j4 jsonb;
  v_k1 jsonb; v_k2 jsonb; v_k3 jsonb; v_k4 jsonb;
  v_m1 jsonb; v_m2 jsonb; v_m3 jsonb; v_m4 jsonb;
  v_n1 jsonb; v_n2 jsonb; v_n3 jsonb; v_n4 jsonb;
  v_p1 jsonb; v_p2 jsonb; v_p3 jsonb; v_p4 jsonb;
  v_q1 jsonb; v_q2 jsonb; v_q3 jsonb; v_q4 jsonb;
BEGIN

-- Get businesses.id (RLS checks this)
SELECT id INTO v_business_id
FROM businesses
WHERE owner_id = v_user_id LIMIT 1;

IF v_business_id IS NULL THEN
  RAISE EXCEPTION 'No business found';
END IF;

-- Get profile id (for child tables that FK to it)
SELECT id INTO v_profile_id
FROM business_profiles
WHERE user_id = v_user_id LIMIT 1;

-- Cleanup
DELETE FROM forecast_scenarios
WHERE base_forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM forecast_investments
WHERE forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM forecast_years
WHERE forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM forecast_payroll_summary
WHERE forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM forecast_employees
WHERE forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM forecast_pl_lines
WHERE forecast_id IN (
  SELECT id FROM financial_forecasts
  WHERE user_id = v_user_id
);
DELETE FROM financial_forecasts
WHERE user_id = v_user_id;
DELETE FROM forecast_wizard_sessions
WHERE user_id = v_user_id;

-- Build JSON values as variables
v_steps := jsonb_build_object(
  'setup', true,
  'team', true,
  'costs', true,
  'investments', true,
  'review', true
);

-- Full assumptions for KPI + multi-year + cashflow
v_assumptions := jsonb_build_object(
  'version', 4,
  'createdAt', to_char(NOW() - INTERVAL '64 days', 'YYYY-MM-DD'),
  'updatedAt', to_char(NOW(), 'YYYY-MM-DD'),
  'industry', 'electrical_contracting',
  'employeeCount', 15,
  'fiscalYearStart', '07',
  'forecastDuration', 3,
  'growthRate', 21.5,
  'grossMarginTarget', 45,
  'netMarginTarget', 13,
  'goals', jsonb_build_object(
    'year1', jsonb_build_object(
      'revenue', 3400000,
      'grossProfitPct', 45.0,
      'netProfitPct', 13.0
    ),
    'year2', jsonb_build_object(
      'revenue', 4500000,
      'grossProfitPct', 47.0,
      'netProfitPct', 15.0
    ),
    'year3', jsonb_build_object(
      'revenue', 5500000,
      'grossProfitPct', 48.0,
      'netProfitPct', 18.0
    )
  ),
  'revenue', jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object(
        'accountId', 'rev-residential',
        'accountName', 'Residential & Emergency',
        'priorYearTotal', 1053000,
        'growthType', 'percentage',
        'growthPct', 17,
        'year2Quarterly', jsonb_build_object(
          'q1', 420000, 'q2', 480000,
          'q3', 460000, 'q4', 440000
        ),
        'year3Quarterly', jsonb_build_object(
          'q1', 510000, 'q2', 580000,
          'q3', 560000, 'q4', 540000
        )
      ),
      jsonb_build_object(
        'accountId', 'rev-commercial',
        'accountName', 'Commercial & Maintenance',
        'priorYearTotal', 876000,
        'growthType', 'percentage',
        'growthPct', 22,
        'year2Quarterly', jsonb_build_object(
          'q1', 330000, 'q2', 380000,
          'q3', 370000, 'q4', 350000
        ),
        'year3Quarterly', jsonb_build_object(
          'q1', 410000, 'q2', 470000,
          'q3', 450000, 'q4', 430000
        )
      ),
      jsonb_build_object(
        'accountId', 'rev-solar',
        'accountName', 'Solar, Battery & EV',
        'priorYearTotal', 500000,
        'growthType', 'percentage',
        'growthPct', 38,
        'year2Quarterly', jsonb_build_object(
          'q1', 200000, 'q2', 230000,
          'q3', 220000, 'q4', 210000
        ),
        'year3Quarterly', jsonb_build_object(
          'q1', 260000, 'q2', 300000,
          'q3', 290000, 'q4', 270000
        )
      )
    ),
    'seasonalityPattern', jsonb_build_array(
      0.85, 0.90, 0.95, 1.05,
      1.12, 1.02, 0.92, 0.98,
      1.05, 1.10, 1.12, 1.05
    ),
    'seasonalitySource', 'manual'
  ),
  'cogs', jsonb_build_object(
    'overallCogsPct', 56.5,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'accountId', 'cogs-materials',
        'accountName', 'Materials & Supplies',
        'priorYearTotal', 669000,
        'costBehavior', 'variable',
        'percentOfRevenue', 23.5
      ),
      jsonb_build_object(
        'accountId', 'cogs-labour',
        'accountName', 'Direct Labour',
        'priorYearTotal', 600000,
        'costBehavior', 'variable',
        'percentOfRevenue', 22
      ),
      jsonb_build_object(
        'accountId', 'cogs-subs',
        'accountName', 'Subcontractors',
        'priorYearTotal', 111500,
        'costBehavior', 'variable',
        'percentOfRevenue', 4
      ),
      jsonb_build_object(
        'accountId', 'cogs-vehicle',
        'accountName', 'Vehicle & Equipment',
        'priorYearTotal', 189000,
        'costBehavior', 'variable',
        'percentOfRevenue', 7
      )
    )
  ),
  'team', jsonb_build_object(
    'existingTeam', jsonb_build_array(
      jsonb_build_object(
        'employeeId', 'emp-01',
        'name', 'James Mitchell',
        'role', 'Owner',
        'employmentType', 'full-time',
        'currentSalary', 204000,
        'salaryIncreasePct', 0,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-02',
        'name', 'Sarah Chen',
        'role', 'Office Manager',
        'employmentType', 'full-time',
        'currentSalary', 75000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-03',
        'name', 'Amy Watson',
        'role', 'Admin',
        'employmentType', 'part-time',
        'currentSalary', 52000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-04',
        'name', 'Mike Torres',
        'role', 'Lead Electrician',
        'employmentType', 'full-time',
        'currentSalary', 105000,
        'salaryIncreasePct', 4,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-05',
        'name', 'Dave Kowalski',
        'role', 'Sr Electrician',
        'employmentType', 'full-time',
        'currentSalary', 92000,
        'salaryIncreasePct', 4,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-06',
        'name', 'Ben Park',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'currentSalary', 82000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-07',
        'name', 'Jake Nguyen',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'currentSalary', 82000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-08',
        'name', 'Sam Wilson',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'currentSalary', 82000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-09',
        'name', 'Marcus Brown',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'currentSalary', 78000,
        'salaryIncreasePct', 3,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-10',
        'name', 'Luke Henderson',
        'role', 'Jr Electrician',
        'employmentType', 'full-time',
        'currentSalary', 68000,
        'salaryIncreasePct', 5,
        'includeInForecast', true,
        'isFromXero', false
      ),
      jsonb_build_object(
        'employeeId', 'emp-11',
        'name', 'Tom Blake',
        'role', 'Apprentice',
        'employmentType', 'full-time',
        'currentSalary', 48000,
        'salaryIncreasePct', 8,
        'includeInForecast', true,
        'isFromXero', false
      )
    ),
    'plannedHires', jsonb_build_array(
      jsonb_build_object(
        'id', 'hire-01',
        'role', 'Sales Manager',
        'employmentType', 'full-time',
        'salary', 110000,
        'startMonth', '2026-04'
      ),
      jsonb_build_object(
        'id', 'hire-02',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'salary', 82000,
        'startMonth', '2026-04'
      ),
      jsonb_build_object(
        'id', 'hire-03',
        'role', 'Electrician',
        'employmentType', 'full-time',
        'salary', 82000,
        'startMonth', '2026-05'
      )
    ),
    'superannuationPct', 11.5,
    'workCoverPct', 3.2,
    'payrollTaxPct', 0,
    'payrollTaxThreshold', 1300000
  ),
  'opex', jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object(
        'accountId', 'opex-rent',
        'accountName', 'Rent & Insurance',
        'priorYearTotal', 189600,
        'costBehavior', 'fixed',
        'monthlyAmount', 16800
      ),
      jsonb_build_object(
        'accountId', 'opex-marketing',
        'accountName', 'Marketing',
        'priorYearTotal', 84500,
        'costBehavior', 'fixed',
        'monthlyAmount', 12500
      ),
      jsonb_build_object(
        'accountId', 'opex-it',
        'accountName', 'IT & Software',
        'priorYearTotal', 57000,
        'costBehavior', 'fixed',
        'monthlyAmount', 7200
      ),
      jsonb_build_object(
        'accountId', 'opex-owner',
        'accountName', 'Owner Pay',
        'priorYearTotal', 210000,
        'costBehavior', 'fixed',
        'monthlyAmount', 18500
      ),
      jsonb_build_object(
        'accountId', 'opex-depreciation',
        'accountName', 'Depreciation',
        'priorYearTotal', 111600,
        'costBehavior', 'fixed',
        'monthlyAmount', 10200
      ),
      jsonb_build_object(
        'accountId', 'opex-accounting',
        'accountName', 'Accounting & Legal',
        'priorYearTotal', 50200,
        'costBehavior', 'fixed',
        'monthlyAmount', 4500
      ),
      jsonb_build_object(
        'accountId', 'opex-office',
        'accountName', 'Office & Consumables',
        'priorYearTotal', 30400,
        'costBehavior', 'fixed',
        'monthlyAmount', 2900
      ),
      jsonb_build_object(
        'accountId', 'opex-licences',
        'accountName', 'Licences & Compliance',
        'priorYearTotal', 37200,
        'costBehavior', 'fixed',
        'monthlyAmount', 3500
      ),
      jsonb_build_object(
        'accountId', 'opex-phone',
        'accountName', 'Phone & Internet',
        'priorYearTotal', 25200,
        'costBehavior', 'fixed',
        'monthlyAmount', 2500
      ),
      jsonb_build_object(
        'accountId', 'opex-training',
        'accountName', 'Training & Development',
        'priorYearTotal', 17300,
        'costBehavior', 'adhoc',
        'expectedAnnualAmount', 21600
      )
    )
  ),
  'capex', jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object(
        'id', 'capex-01',
        'name', 'Service Vehicle',
        'amount', 65000,
        'month', '2026-04',
        'category', 'vehicle',
        'notes', 'New Ford Ranger for 3rd crew',
        'depreciationYears', 5
      ),
      jsonb_build_object(
        'id', 'capex-02',
        'name', 'Solar Equipment',
        'amount', 18000,
        'month', '2026-01',
        'category', 'equipment',
        'notes', 'Battery testing and install gear',
        'depreciationYears', 5
      )
    )
  ),
  'subscriptions', jsonb_build_object(
    'auditedAt', to_char(NOW() - INTERVAL '60 days', 'YYYY-MM-DD'),
    'accountsIncluded', jsonb_build_array('opex-it'),
    'vendorCount', 12,
    'totalAnnual', 57000,
    'essentialAnnual', 38400,
    'reviewAnnual', 10800,
    'reduceAnnual', 4800,
    'cancelAnnual', 3000,
    'potentialSavings', 7800,
    'costPerEmployee', 3800
  ),
  'cashflow', jsonb_build_object(
    'dso_days', 32,
    'dso_auto_calculated', false,
    'dpo_days', 21,
    'dpo_auto_calculated', false,
    'gst_registered', true,
    'gst_rate', 0.10,
    'gst_reporting_frequency', 'quarterly',
    'gst_applicable_expense_pct', 0.80,
    'super_payment_frequency', 'quarterly',
    'payg_wh_reporting_frequency', 'monthly',
    'payg_instalment_amount', 12500,
    'payg_instalment_frequency', 'quarterly',
    'opening_bank_balance', 182000,
    'opening_trade_debtors', 245000,
    'opening_trade_creditors', 98000,
    'opening_gst_liability', 31500,
    'opening_payg_wh_liability', 24800,
    'opening_payg_instalment_liability', 12500,
    'opening_super_liability', 28600,
    'opening_stock', 42000,
    'planned_stock_changes', '{}'::jsonb,
    'loans', jsonb_build_array(
      jsonb_build_object(
        'name', 'Equipment Finance',
        'balance', 45000,
        'monthly_repayment', 1850,
        'interest_rate', 6.5,
        'is_interest_only', false
      )
    ),
    'balance_date', '2025-06-30'
  )
);

-- Wizard session
INSERT INTO forecast_wizard_sessions (
  id, forecast_id, user_id, business_id,
  started_at, completed_at,
  mode, current_step,
  steps_completed, years_selected
) VALUES (
  gen_random_uuid(), NULL,
  v_user_id, v_business_id,
  NOW() - INTERVAL '65 days',
  NOW() - INTERVAL '64 days',
  'guided', 'complete',
  v_steps, ARRAY[1, 2, 3]
) RETURNING id INTO v_ws_id;

-- Main forecast
INSERT INTO financial_forecasts (
  id, business_id, user_id,
  name, description,
  fiscal_year, year_type,
  actual_start_month, actual_end_month,
  forecast_start_month, forecast_end_month,
  baseline_start_month, baseline_end_month,
  is_completed, wizard_completed_at,
  revenue_goal, gross_profit_goal,
  net_profit_goal, goal_source,
  revenue_distribution_method,
  cogs_percentage,
  opex_wages, opex_fixed,
  opex_variable, opex_other,
  payroll_frequency, pay_day,
  superannuation_rate,
  forecast_type, version_number,
  is_active, is_base_forecast,
  wizard_session_id, assumptions
) VALUES (
  gen_random_uuid(),
  v_business_id, v_user_id,
  'FY2026 Growth Forecast',
  'Primary forecast',
  2026, 'FY',
  '2025-07', '2026-02',
  '2026-03', '2026-06',
  '2024-07', '2025-06',
  true,
  NOW() - INTERVAL '64 days',
  3400000, 1530000,
  442000, 'annual_plan',
  'seasonal',
  0.5650,
  322000, 199000,
  83000, 246000,
  'fortnightly', 'thursday',
  0.1150,
  'forecast', 1,
  true, true,
  v_ws_id, v_assumptions
) RETURNING id INTO v_forecast_id;

UPDATE forecast_wizard_sessions
SET forecast_id = v_forecast_id
WHERE id = v_ws_id;

-- ==============================
-- REVENUE LINE 1: Residential
-- ==============================
v_a1 := '{"2024-07":82000,"2024-08":86000}';
v_a2 := '{"2024-09":92000,"2024-10":98000}';
v_a3 := '{"2024-11":105000,"2024-12":96000}';
v_a4 := '{"2025-01":88000,"2025-02":94000}';
v_b1 := '{"2025-03":100000,"2025-04":104000}';
v_b2 := '{"2025-05":106000,"2025-06":102000}';
v_b3 := '{"2025-07":102000,"2025-08":109000}';
v_b4 := '{"2025-09":121000,"2025-10":131000}';
v_c1 := '{"2025-11":139000,"2025-12":123000}';
v_c2 := '{"2026-01":106000,"2026-02":123000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Residential & Emergency',
  'REVENUE', 'REVENUE',
  'Revenue', 'Services', 1,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":136000,"2026-04":148000,"2026-05":155000,"2026-06":143000}',
  true,
  '{"method":"seasonal","growthRate":17}'
);

-- ==============================
-- REVENUE LINE 2: Commercial
-- ==============================
v_a1 := '{"2024-07":65000,"2024-08":69000}';
v_a2 := '{"2024-09":75000,"2024-10":81000}';
v_a3 := '{"2024-11":87000,"2024-12":78000}';
v_a4 := '{"2025-01":71000,"2025-02":76000}';
v_b1 := '{"2025-03":82000,"2025-04":88000}';
v_b2 := '{"2025-05":90000,"2025-06":86000}';
v_b3 := '{"2025-07":76000,"2025-08":81000}';
v_b4 := '{"2025-09":90000,"2025-10":97000}';
v_c1 := '{"2025-11":103000,"2025-12":92000}';
v_c2 := '{"2026-01":79000,"2026-02":92000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Commercial & Maintenance',
  'REVENUE', 'REVENUE',
  'Revenue', 'Services', 2,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":101000,"2026-04":110000,"2026-05":116000,"2026-06":107000}',
  true,
  '{"method":"seasonal","growthRate":22}'
);

-- ==============================
-- REVENUE LINE 3: Solar & EV
-- ==============================
v_a1 := '{"2024-07":34000,"2024-08":36000}';
v_a2 := '{"2024-09":38000,"2024-10":42000}';
v_a3 := '{"2024-11":46000,"2024-12":40000}';
v_a4 := '{"2025-01":36000,"2025-02":40000}';
v_b1 := '{"2025-03":44000,"2025-04":48000}';
v_b2 := '{"2025-05":50000,"2025-06":46000}';
v_b3 := '{"2025-07":40000,"2025-08":42000}';
v_b4 := '{"2025-09":47000,"2025-10":50000}';
v_c1 := '{"2025-11":53000,"2025-12":47000}';
v_c2 := '{"2026-01":40000,"2026-02":47000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Solar, Battery & EV',
  'REVENUE', 'REVENUE',
  'Revenue', 'Services', 3,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":53000,"2026-04":57000,"2026-05":59000,"2026-06":55000}',
  true,
  '{"method":"seasonal","growthRate":38}'
);

-- ==============================
-- COGS LINE 1: Materials
-- ==============================
v_a1 := '{"2024-07":47000,"2024-08":49000}';
v_a2 := '{"2024-09":53000,"2024-10":57000}';
v_a3 := '{"2024-11":61000,"2024-12":55000}';
v_a4 := '{"2025-01":50000,"2025-02":54000}';
v_b1 := '{"2025-03":58000,"2025-04":62000}';
v_b2 := '{"2025-05":63000,"2025-06":60000}';
v_b3 := '{"2025-07":51000,"2025-08":55000}';
v_b4 := '{"2025-09":61000,"2025-10":65000}';
v_c1 := '{"2025-11":69000,"2025-12":62000}';
v_c2 := '{"2026-01":53000,"2026-02":62000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Materials & Supplies',
  'EXPENSE', 'EXPENSE',
  'Cost of Sales', 'Materials', 10,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":68000,"2026-04":74000,"2026-05":78000,"2026-06":72000}',
  true,
  '{"method":"percentage","baseRate":23.5}'
);

-- ==============================
-- COGS LINE 2: Direct Labour
-- ==============================
v_a1 := '{"2024-07":41000,"2024-08":43000}';
v_a2 := '{"2024-09":47000,"2024-10":51000}';
v_a3 := '{"2024-11":55000,"2024-12":49000}';
v_a4 := '{"2025-01":44000,"2025-02":48000}';
v_b1 := '{"2025-03":51000,"2025-04":55000}';
v_b2 := '{"2025-05":57000,"2025-06":54000}';
v_b3 := '{"2025-07":48000,"2025-08":51000}';
v_b4 := '{"2025-09":57000,"2025-10":61000}';
v_c1 := '{"2025-11":65000,"2025-12":58000}';
v_c2 := '{"2026-01":50000,"2026-02":58000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Direct Labour',
  'EXPENSE', 'EXPENSE',
  'Cost of Sales', 'Labour', 11,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":64000,"2026-04":69000,"2026-05":73000,"2026-06":67000}',
  true,
  '{"method":"percentage","baseRate":22}'
);

-- ==============================
-- COGS LINE 3: Subcontractors
-- ==============================
v_a1 := '{"2024-07":7500,"2024-08":8000}';
v_a2 := '{"2024-09":8500,"2024-10":9000}';
v_a3 := '{"2024-11":10000,"2024-12":9000}';
v_a4 := '{"2025-01":8000,"2025-02":8500}';
v_b1 := '{"2025-03":9000,"2025-04":10000}';
v_b2 := '{"2025-05":10000,"2025-06":9500}';
v_b3 := '{"2025-07":9000,"2025-08":9500}';
v_b4 := '{"2025-09":10500,"2025-10":11000}';
v_c1 := '{"2025-11":12000,"2025-12":10500}';
v_c2 := '{"2026-01":9000,"2026-02":10500}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Subcontractors',
  'EXPENSE', 'EXPENSE',
  'Cost of Sales', 'Subcontractors', 12,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":12000,"2026-04":13000,"2026-05":13500,"2026-06":12500}',
  true,
  '{"method":"percentage","baseRate":4}'
);

-- ==============================
-- COGS LINE 4: Vehicle & Equip
-- ==============================
v_a1 := '{"2024-07":13000,"2024-08":14000}';
v_a2 := '{"2024-09":15000,"2024-10":16000}';
v_a3 := '{"2024-11":17000,"2024-12":15500}';
v_a4 := '{"2025-01":14000,"2025-02":15000}';
v_b1 := '{"2025-03":16000,"2025-04":17500}';
v_b2 := '{"2025-05":18000,"2025-06":17000}';
v_b3 := '{"2025-07":15000,"2025-08":16000}';
v_b4 := '{"2025-09":18000,"2025-10":19500}';
v_c1 := '{"2025-11":21000,"2025-12":18500}';
v_c2 := '{"2026-01":16000,"2026-02":18500}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Vehicle & Equipment',
  'EXPENSE', 'EXPENSE',
  'Cost of Sales', 'Other Direct', 13,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":20500,"2026-04":22000,"2026-05":23500,"2026-06":21500}',
  true,
  '{"method":"percentage","baseRate":7}'
);

-- ==============================
-- OPEX LINE 1: Admin Wages
-- ==============================
v_a1 := '{"2024-07":22500,"2024-08":22500}';
v_a2 := '{"2024-09":23000,"2024-10":23000}';
v_a3 := '{"2024-11":23000,"2024-12":23500}';
v_a4 := '{"2025-01":23000,"2025-02":23000}';
v_b1 := '{"2025-03":23000,"2025-04":23500}';
v_b2 := '{"2025-05":23500,"2025-06":23500}';
v_b3 := '{"2025-07":23500,"2025-08":23500}';
v_b4 := '{"2025-09":24000,"2025-10":24000}';
v_c1 := '{"2025-11":24000,"2025-12":24500}';
v_c2 := '{"2026-01":25000,"2026-02":25000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Admin Wages',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'People', 20,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":25500,"2026-04":34000,"2026-05":34500,"2026-06":34500}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 2: Rent & Insurance
-- ==============================
v_a1 := '{"2024-07":15200,"2024-08":15200}';
v_a2 := '{"2024-09":15200,"2024-10":15500}';
v_a3 := '{"2024-11":15500,"2024-12":15500}';
v_a4 := '{"2025-01":15800,"2025-02":15800}';
v_b1 := '{"2025-03":15800,"2025-04":16000}';
v_b2 := '{"2025-05":16000,"2025-06":16000}';
v_b3 := '{"2025-07":16200,"2025-08":16200}';
v_b4 := '{"2025-09":16200,"2025-10":16500}';
v_c1 := '{"2025-11":16500,"2025-12":16500}';
v_c2 := '{"2026-01":16800,"2026-02":16800}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Rent & Insurance',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Premises', 21,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":16800,"2026-04":17000,"2026-05":17000,"2026-06":17000}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 3: Marketing
-- ==============================
v_a1 := '{"2024-07":5800,"2024-08":6000}';
v_a2 := '{"2024-09":6200,"2024-10":6500}';
v_a3 := '{"2024-11":6800,"2024-12":6200}';
v_a4 := '{"2025-01":6000,"2025-02":6500}';
v_b1 := '{"2025-03":7000,"2025-04":7500}';
v_b2 := '{"2025-05":7800,"2025-06":7500}';
v_b3 := '{"2025-07":7200,"2025-08":7500}';
v_b4 := '{"2025-09":8000,"2025-10":9500}';
v_c1 := '{"2025-11":10000,"2025-12":10500}';
v_c2 := '{"2026-01":11000,"2026-02":12000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Marketing',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Marketing', 22,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":12500,"2026-04":12500,"2026-05":12500,"2026-06":12000}',
  true,
  '{"method":"stepped"}'
);

-- ==============================
-- OPEX LINE 4: IT & Software
-- ==============================
v_a1 := '{"2024-07":3800,"2024-08":3800}';
v_a2 := '{"2024-09":3800,"2024-10":4000}';
v_a3 := '{"2024-11":4000,"2024-12":4000}';
v_a4 := '{"2025-01":4200,"2025-02":4200}';
v_b1 := '{"2025-03":4200,"2025-04":4500}';
v_b2 := '{"2025-05":4500,"2025-06":4500}';
v_b3 := '{"2025-07":4800,"2025-08":4800}';
v_b4 := '{"2025-09":5000,"2025-10":5200}';
v_c1 := '{"2025-11":5500,"2025-12":6800}';
v_c2 := '{"2026-01":7000,"2026-02":7000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'IT & Software',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Technology', 23,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":7200,"2026-04":7200,"2026-05":7200,"2026-06":7200}',
  true,
  '{"method":"stepped"}'
);

-- ==============================
-- OPEX LINE 5: Owner Pay
-- ==============================
v_a1 := '{"2024-07":17000,"2024-08":17000}';
v_a2 := '{"2024-09":17000,"2024-10":17000}';
v_a3 := '{"2024-11":17000,"2024-12":17000}';
v_a4 := '{"2025-01":17500,"2025-02":17500}';
v_b1 := '{"2025-03":17500,"2025-04":17500}';
v_b2 := '{"2025-05":17500,"2025-06":17500}';
v_b3 := '{"2025-07":18000,"2025-08":18000}';
v_b4 := '{"2025-09":18000,"2025-10":18000}';
v_c1 := '{"2025-11":18000,"2025-12":18000}';
v_c2 := '{"2026-01":18500,"2026-02":18500}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Owner Pay',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'People', 24,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":18500,"2026-04":18500,"2026-05":18500,"2026-06":18500}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 6: Depreciation
-- ==============================
v_a1 := '{"2024-07":8500,"2024-08":8500}';
v_a2 := '{"2024-09":8500,"2024-10":8800}';
v_a3 := '{"2024-11":8800,"2024-12":8800}';
v_a4 := '{"2025-01":9000,"2025-02":9000}';
v_b1 := '{"2025-03":9000,"2025-04":9200}';
v_b2 := '{"2025-05":9200,"2025-06":9200}';
v_b3 := '{"2025-07":9500,"2025-08":9500}';
v_b4 := '{"2025-09":9500,"2025-10":9800}';
v_c1 := '{"2025-11":9800,"2025-12":9800}';
v_c2 := '{"2026-01":10000,"2026-02":10000}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Depreciation',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Other', 25,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":10200,"2026-04":10200,"2026-05":10200,"2026-06":10200}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 7: Accounting & Legal
-- ==============================
v_a1 := '{"2024-07":3800,"2024-08":3800}';
v_a2 := '{"2024-09":4200,"2024-10":3800}';
v_a3 := '{"2024-11":3800,"2024-12":5200}';
v_a4 := '{"2025-01":3800,"2025-02":3800}';
v_b1 := '{"2025-03":4500,"2025-04":3800}';
v_b2 := '{"2025-05":3800,"2025-06":5500}';
v_b3 := '{"2025-07":4000,"2025-08":4000}';
v_b4 := '{"2025-09":4500,"2025-10":4000}';
v_c1 := '{"2025-11":4000,"2025-12":5800}';
v_c2 := '{"2026-01":4200,"2026-02":4200}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Accounting & Legal',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Professional', 26,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":4500,"2026-04":4500,"2026-05":4500,"2026-06":6000}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 8: Office & Consumables
-- ==============================
v_a1 := '{"2024-07":2200,"2024-08":2400}';
v_a2 := '{"2024-09":2300,"2024-10":2500}';
v_a3 := '{"2024-11":2600,"2024-12":2200}';
v_a4 := '{"2025-01":2400,"2025-02":2500}';
v_b1 := '{"2025-03":2600,"2025-04":2700}';
v_b2 := '{"2025-05":2500,"2025-06":2500}';
v_b3 := '{"2025-07":2600,"2025-08":2700}';
v_b4 := '{"2025-09":2800,"2025-10":2900}';
v_c1 := '{"2025-11":2800,"2025-12":2600}';
v_c2 := '{"2026-01":2900,"2026-02":2800}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Office & Consumables',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Office', 27,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":2900,"2026-04":2900,"2026-05":2900,"2026-06":2900}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 9: Licences & Compliance
-- ==============================
v_a1 := '{"2024-07":2800,"2024-08":2800}';
v_a2 := '{"2024-09":2800,"2024-10":3000}';
v_a3 := '{"2024-11":3000,"2024-12":3000}';
v_a4 := '{"2025-01":3000,"2025-02":3000}';
v_b1 := '{"2025-03":3200,"2025-04":3200}';
v_b2 := '{"2025-05":3200,"2025-06":3200}';
v_b3 := '{"2025-07":3200,"2025-08":3200}';
v_b4 := '{"2025-09":3400,"2025-10":3400}';
v_c1 := '{"2025-11":3400,"2025-12":3400}';
v_c2 := '{"2026-01":3500,"2026-02":3500}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Licences & Compliance',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Compliance', 28,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":3500,"2026-04":3500,"2026-05":3500,"2026-06":3500}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 10: Phone & Internet
-- ==============================
v_a1 := '{"2024-07":1900,"2024-08":1900}';
v_a2 := '{"2024-09":1900,"2024-10":2000}';
v_a3 := '{"2024-11":2000,"2024-12":2000}';
v_a4 := '{"2025-01":2100,"2025-02":2100}';
v_b1 := '{"2025-03":2100,"2025-04":2200}';
v_b2 := '{"2025-05":2200,"2025-06":2200}';
v_b3 := '{"2025-07":2300,"2025-08":2300}';
v_b4 := '{"2025-09":2400,"2025-10":2400}';
v_c1 := '{"2025-11":2400,"2025-12":2400}';
v_c2 := '{"2026-01":2500,"2026-02":2500}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Phone & Internet',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'Communications', 29,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":2500,"2026-04":2500,"2026-05":2700,"2026-06":2700}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- OPEX LINE 11: Training & Development
-- ==============================
v_a1 := '{"2024-07":1200,"2024-08":1500}';
v_a2 := '{"2024-09":1800,"2024-10":1200}';
v_a3 := '{"2024-11":1500,"2024-12":800}';
v_a4 := '{"2025-01":1800,"2025-02":2000}';
v_b1 := '{"2025-03":1500,"2025-04":1200}';
v_b2 := '{"2025-05":1800,"2025-06":1000}';
v_b3 := '{"2025-07":1500,"2025-08":1800}';
v_b4 := '{"2025-09":2000,"2025-10":1500}';
v_c1 := '{"2025-11":1800,"2025-12":1200}';
v_c2 := '{"2026-01":2000,"2026-02":1800}';

INSERT INTO forecast_pl_lines (
  forecast_id, account_name,
  account_type, account_class,
  category, subcategory, sort_order,
  actual_months, forecast_months,
  is_manual, forecast_method
) VALUES (
  v_forecast_id,
  'Training & Development',
  'OVERHEADS', 'EXPENSE',
  'Operating Expenses', 'People', 30,
  v_a1||v_a2||v_a3||v_a4||v_b1||v_b2||v_b3||v_b4||v_c1||v_c2,
  '{"2026-03":2000,"2026-04":1800,"2026-05":1800,"2026-06":1500}',
  true,
  '{"method":"fixed"}'
);

-- ==============================
-- EMPLOYEES
-- ==============================
INSERT INTO forecast_employees (
  forecast_id, employee_name,
  position, category,
  classification, start_date,
  annual_salary, hourly_rate,
  standard_hours_per_week,
  super_rate, is_active,
  is_planned_hire, sort_order
) VALUES
(v_forecast_id, 'James Mitchell',
  'Owner', 'Wages Admin',
  'opex', '2015-03-01',
  204000, NULL, 40,
  11.50, true, false, 1),
(v_forecast_id, 'Sarah Chen',
  'Office Mgr', 'Wages Admin',
  'opex', '2022-06-15',
  75000, NULL, 38,
  11.50, true, false, 2),
(v_forecast_id, 'Amy Watson',
  'Admin', 'Wages Admin',
  'opex', '2024-02-01',
  52000, NULL, 30,
  11.50, true, false, 3),
(v_forecast_id, 'Mike Torres',
  'Lead Elec', 'Wages COGS',
  'cogs', '2018-01-15',
  105000, NULL, 40,
  11.50, true, false, 4),
(v_forecast_id, 'Dave Kowalski',
  'Sr Elec', 'Wages COGS',
  'cogs', '2019-08-01',
  92000, NULL, 40,
  11.50, true, false, 5),
(v_forecast_id, 'Ben Park',
  'Electrician', 'Wages COGS',
  'cogs', '2021-03-15',
  82000, NULL, 40,
  11.50, true, false, 6),
(v_forecast_id, 'Jake Nguyen',
  'Electrician', 'Wages COGS',
  'cogs', '2021-11-01',
  82000, NULL, 40,
  11.50, true, false, 7),
(v_forecast_id, 'Sam Wilson',
  'Electrician', 'Wages COGS',
  'cogs', '2022-04-15',
  82000, NULL, 40,
  11.50, true, false, 8),
(v_forecast_id, 'Marcus Brown',
  'Electrician', 'Wages COGS',
  'cogs', '2023-02-01',
  78000, NULL, 40,
  11.50, true, false, 9),
(v_forecast_id, 'Luke Henderson',
  'Jr Elec', 'Wages COGS',
  'cogs', '2023-09-01',
  68000, NULL, 40,
  11.50, true, false, 10),
(v_forecast_id, 'Tom Blake',
  'Apprentice', 'Wages COGS',
  'cogs', '2023-07-01',
  48000, NULL, 38,
  11.50, true, false, 11),
(v_forecast_id, 'Chris Woods',
  'Resigned', 'Wages COGS',
  'cogs', '2020-06-01',
  82000, NULL, 40,
  11.50, false, false, 12),
(v_forecast_id, 'Ryan Cooper',
  'Resigned', 'Wages COGS',
  'cogs', '2021-09-01',
  78000, NULL, 40,
  11.50, false, false, 13),
(v_forecast_id, 'TBH Sales Mgr',
  'Sales Mgr', 'Wages Admin',
  'opex', '2026-04-14',
  110000, NULL, 40,
  11.50, true, true, 14),
(v_forecast_id, 'TBH Elec 1',
  'Electrician', 'Wages COGS',
  'cogs', '2026-04-01',
  82000, NULL, 40,
  11.50, true, true, 15),
(v_forecast_id, 'TBH Elec 2',
  'Electrician', 'Wages COGS',
  'cogs', '2026-05-01',
  82000, NULL, 40,
  11.50, true, true, 16);

UPDATE forecast_employees
SET end_date = '2026-02-21'
WHERE forecast_id = v_forecast_id
AND employee_name = 'Chris Woods';

UPDATE forecast_employees
SET end_date = '2026-02-14'
WHERE forecast_id = v_forecast_id
AND employee_name = 'Ryan Cooper';

-- ==============================
-- PAYROLL SUMMARY
-- ==============================
v_d1 := '{"2025-07":2,"2025-08":2}';
v_d2 := '{"2025-09":2,"2025-10":3}';
v_d3 := '{"2025-11":2,"2025-12":2}';
v_d4 := '{"2026-01":2,"2026-02":2}';
v_e1 := '{"2026-03":2,"2026-04":2}';
v_e2 := '{"2026-05":3,"2026-06":2}';

v_f1 := '{"2025-07":23500,"2025-08":23500}';
v_f2 := '{"2025-09":24000,"2025-10":24000}';
v_f3 := '{"2025-11":24000,"2025-12":24500}';
v_f4 := '{"2026-01":25000,"2026-02":25000}';
v_g1 := '{"2026-03":25500,"2026-04":34000}';
v_g2 := '{"2026-05":34500,"2026-06":34500}';

v_h1 := '{"2025-07":48000,"2025-08":51000}';
v_h2 := '{"2025-09":57000,"2025-10":61000}';
v_h3 := '{"2025-11":65000,"2025-12":58000}';
v_h4 := '{"2026-01":50000,"2026-02":58000}';
v_i1 := '{"2026-03":64000,"2026-04":69000}';
v_i2 := '{"2026-05":73000,"2026-06":67000}';

v_j1 := '{"2025-07":8200,"2025-08":8600}';
v_j2 := '{"2025-09":9300,"2025-10":9800}';
v_j3 := '{"2025-11":10200,"2025-12":9500}';
v_j4 := '{"2026-01":8600,"2026-02":9500}';
v_k1 := '{"2026-03":10300,"2026-04":11800}';
v_k2 := '{"2026-05":12400,"2026-06":11700}';

INSERT INTO forecast_payroll_summary (
  forecast_id,
  pay_runs_per_month,
  wages_admin_monthly,
  wages_cogs_monthly,
  superannuation_monthly
) VALUES (
  v_forecast_id,
  v_d1||v_d2||v_d3||v_d4||v_e1||v_e2,
  v_f1||v_f2||v_f3||v_f4||v_g1||v_g2,
  v_h1||v_h2||v_h3||v_h4||v_i1||v_i2,
  v_j1||v_j2||v_j3||v_j4||v_k1||v_k2
);

-- ==============================
-- FORECAST YEARS
-- ==============================
INSERT INTO forecast_years (
  forecast_id, user_id, business_id,
  year_number, fiscal_year,
  granularity,
  revenue_target,
  revenue_growth_percent,
  gross_margin_percent,
  net_profit_percent,
  headcount_start, headcount_end,
  headcount_change,
  team_cost_estimate,
  opex_estimate, notes
) VALUES
(v_forecast_id, v_user_id, v_business_id,
  1, 2026, 'monthly',
  3400000, 21.5, 45.0, 13.0,
  15, 20, 5,
  1024000, 990000, 'Year 1'),
(v_forecast_id, v_user_id, v_business_id,
  2, 2027, 'quarterly',
  4500000, 32.4, 47.0, 15.0,
  20, 25, 5,
  1350000, 1150000, 'Year 2'),
(v_forecast_id, v_user_id, v_business_id,
  3, 2028, 'annual',
  5500000, 22.2, 48.0, 18.0,
  25, 30, 5,
  1650000, 1280000, 'Year 3');

-- ==============================
-- INVESTMENTS
-- ==============================
INSERT INTO forecast_investments (
  forecast_id, user_id, business_id,
  name, description,
  investment_type, amount,
  start_month, is_recurring,
  recurrence, end_month,
  pl_account_category,
  reasoning
) VALUES
(v_forecast_id, v_user_id, v_business_id,
  'SimPRO', 'Software',
  'opex', 1800,
  '2025-12', true,
  'monthly', '2026-06',
  'Operating Expenses',
  'Field service'),
(v_forecast_id, v_user_id, v_business_id,
  'Website', 'Build',
  'opex', 15000,
  '2025-10', false,
  NULL, NULL,
  'Operating Expenses',
  'Lead gen'),
(v_forecast_id, v_user_id, v_business_id,
  'Google Ads', 'Monthly',
  'opex', 3000,
  '2025-11', true,
  'monthly', '2026-06',
  'Operating Expenses',
  'Lead gen'),
(v_forecast_id, v_user_id, v_business_id,
  'Vehicle', 'Van #8',
  'capex', 65000,
  '2026-04', false,
  NULL, NULL,
  NULL,
  'New hire'),
(v_forecast_id, v_user_id, v_business_id,
  'Solar Gear', 'Test equip',
  'capex', 18000,
  '2026-01', false,
  NULL, NULL,
  NULL,
  'Solar div'),
(v_forecast_id, v_user_id, v_business_id,
  'Recruiting', 'Sales Mgr',
  'opex', 22000,
  '2026-03', false,
  NULL, NULL,
  'Operating Expenses',
  'Hire cost');

-- ==============================
-- SCENARIOS
-- ==============================
INSERT INTO forecast_scenarios (
  base_forecast_id, name,
  description,
  assumption_overrides,
  is_active, created_by
) VALUES (
  v_forecast_id,
  'Baseline',
  'Conservative',
  '{"revenueGrowth":21.5}',
  true, v_user_id
), (
  v_forecast_id,
  'Optimistic',
  'Full growth',
  '{"revenueGrowth":28}',
  false, v_user_id
);

-- ============================
-- Subscription Budgets (for demo manual entry mode)
-- ============================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_budgets') THEN
  DELETE FROM subscription_budgets WHERE business_id = v_business_id;

  INSERT INTO subscription_budgets (
    business_id, vendor_name, vendor_key, frequency,
    monthly_budget, last_12_months_spend, transaction_count,
    avg_transaction_amount, is_active
  ) VALUES
    (v_business_id, 'Xero',                    'xero',                   'monthly',    65,    780,  12, 65,    true),
    (v_business_id, 'Microsoft 365 Business',  'microsoft-365-business', 'monthly',    330,   3960, 12, 330,   true),
    (v_business_id, 'SimPRO',                  'simpro',                 'monthly',    299,   3588, 12, 299,   true),
    (v_business_id, 'Deputy',                  'deputy',                 'monthly',    90,    1080, 12, 90,    true),
    (v_business_id, 'SafetyCulture (iAuditor)','safetyculture-iauditor', 'monthly',    49,    588,  12, 49,    true),
    (v_business_id, 'HubSpot CRM',             'hubspot-crm',            'monthly',    50,    600,  12, 50,    true),
    (v_business_id, 'Canva Pro',               'canva-pro',              'monthly',    20,    240,  12, 20,    true),
    (v_business_id, 'Zoom Business',           'zoom-business',          'monthly',    21,    252,  12, 21,    true),
    (v_business_id, 'Dropbox Business',        'dropbox-business',       'monthly',    165,   1980, 12, 165,   true),
    (v_business_id, 'Google Ads',              'google-ads',             'monthly',    2500,  30000,12, 2500,  true),
    (v_business_id, 'Adobe Creative Cloud',    'adobe-creative-cloud',   'monthly',    55,    660,  12, 55,    true),
    (v_business_id, 'ServiceM8',               'servicem8',              'monthly',    49,    588,  12, 49,    true);

  RAISE NOTICE 'Seeded 12 subscription budgets';
ELSE
  RAISE NOTICE 'subscription_budgets table does not exist - skipping';
END IF;

-- ============================
-- Add estimated_cost columns to strategic_initiatives (if missing)
-- and seed costs for demo initiatives
-- ============================
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'strategic_initiatives' AND column_name = 'estimated_cost'
  ) THEN
    ALTER TABLE strategic_initiatives ADD COLUMN estimated_cost NUMERIC;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'strategic_initiatives' AND column_name = 'is_monthly_cost'
  ) THEN
    ALTER TABLE strategic_initiatives ADD COLUMN is_monthly_cost BOOLEAN DEFAULT false;
  END IF;

  -- Update existing initiatives with estimated costs
  UPDATE strategic_initiatives SET
    estimated_cost = CASE title
      WHEN 'Solar & Battery Division Expansion' THEN 35000
      WHEN 'Strata Contracts Program Launch' THEN 18000
      WHEN 'Digital Job Management Overhaul' THEN 22000
      WHEN 'Apprentice Pipeline Program' THEN 8000
      WHEN 'Fleet Electrification (2 EVs)' THEN 65000
      WHEN 'Google Ads & Local SEO Campaign' THEN 3000
      WHEN 'SafeWork NSW Compliance Audit' THEN 5000
      WHEN 'Customer Loyalty & Referral Program' THEN 4500
      ELSE estimated_cost
    END,
    is_monthly_cost = CASE title
      WHEN 'Google Ads & Local SEO Campaign' THEN true
      WHEN 'Apprentice Pipeline Program' THEN true
      ELSE false
    END
  WHERE user_id = v_user_id
    AND estimated_cost IS NULL;

  RAISE NOTICE 'Updated strategic initiatives with estimated costs';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update strategic initiatives costs: %', SQLERRM;
END;

RAISE NOTICE 'Done! Forecast: %', v_forecast_id;

END $$;
