-- ============================================================
-- DEMO ACCOUNT SEED SCRIPT
-- Email: demo@wisdombi.au
-- Business: Precision Electrical Group
-- Run this in Supabase SQL Editor (uses service role)
-- ============================================================
-- SAFE TO RE-RUN: This script performs a nuclear cleanup of ALL
-- demo user data before re-seeding, so it's fully idempotent.
-- After running this, run seed_demo_complete.sql for remaining pages.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := '791ce5cf-3998-4161-9f81-7a2440c618af';
  v_business_id UUID;
  v_profile_id UUID;
  v_swot_id UUID;
  v_review_id UUID;
  v_coach_id UUID;
  v_forecast_id UUID;
  v_wizard_session_id UUID;
  v_has_plan_snapshots BOOLEAN;
  v_week_monday DATE;
BEGIN

-- ============================================================
-- 0. FIND COACH (Matt Malouf's user ID)
-- ============================================================
SELECT id INTO v_coach_id FROM auth.users
WHERE email = 'matt@wisdombi.au' OR email = 'matt@wisdombi.ai' OR email = 'matt@wisdomconsultinggroup.com.au'
LIMIT 1;

IF v_coach_id IS NULL THEN
  SELECT user_id INTO v_coach_id FROM system_roles WHERE role = 'super_admin' LIMIT 1;
END IF;

-- Check if plan_snapshots table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_snapshots'
) INTO v_has_plan_snapshots;

-- ============================================================
-- 0b. NUCLEAR CLEANUP — delete ALL demo data before re-seeding
-- This ensures re-runs are safe and don't create duplicates.
-- Must delete child tables before parent tables (FK constraints).
-- ============================================================
RAISE NOTICE 'Starting nuclear cleanup for demo user %...', v_user_id;

-- Financial forecast children (must go before financial_forecasts)
DELETE FROM forecast_investments WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
DELETE FROM forecast_years WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
DELETE FROM forecast_scenario_lines WHERE scenario_id IN (SELECT id FROM forecast_scenarios WHERE base_forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id));
DELETE FROM forecast_scenarios WHERE base_forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
DELETE FROM forecast_payroll_summary WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
DELETE FROM forecast_employees WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
DELETE FROM forecast_pl_lines WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id);
BEGIN DELETE FROM forecast_audit_log WHERE forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = v_user_id); EXCEPTION WHEN undefined_table THEN NULL; END;
DELETE FROM forecast_wizard_sessions WHERE user_id = v_user_id;
BEGIN DELETE FROM subscription_budgets WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id); EXCEPTION WHEN undefined_table THEN NULL; END;
DELETE FROM financial_forecasts WHERE user_id = v_user_id;

-- SWOT children
BEGIN DELETE FROM swot_action_items WHERE swot_analysis_id IN (SELECT id FROM swot_analyses WHERE user_id = v_user_id); EXCEPTION WHEN undefined_table THEN NULL; END;
DELETE FROM swot_items WHERE swot_analysis_id IN (SELECT id FROM swot_analyses WHERE user_id = v_user_id);
DELETE FROM swot_analyses WHERE user_id = v_user_id;

-- Strategic planning
DELETE FROM strategic_initiatives WHERE user_id = v_user_id;
DELETE FROM operational_activities WHERE user_id = v_user_id;
DELETE FROM business_financial_goals WHERE user_id = v_user_id;
DELETE FROM business_kpis WHERE user_id = v_user_id;
DELETE FROM vision_targets WHERE user_id = v_user_id;
DELETE FROM annual_targets WHERE user_id = v_user_id;

-- Reviews
DELETE FROM quarterly_reviews WHERE user_id = v_user_id;
DELETE FROM weekly_reviews WHERE user_id = v_user_id;

-- Sessions & coaching (use business_id IN subquery to catch ALL businesses)
DELETE FROM session_actions WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);
DELETE FROM session_attendees WHERE session_note_id IN (SELECT id FROM session_notes WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id));
DELETE FROM session_notes WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);
DELETE FROM coaching_sessions WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);

-- Messages & notifications
DELETE FROM messages WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);
DELETE FROM notifications WHERE user_id = v_user_id;

-- Assessments & strategy
DELETE FROM assessments WHERE user_id = v_user_id;
DELETE FROM strategy_data WHERE user_id = v_user_id;
DELETE FROM onboarding_progress WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);

-- Action items
DELETE FROM action_items WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);

-- Supplementary module data (from seed_demo_complete.sql)
DELETE FROM kpi_actuals WHERE user_id = v_user_id;
DELETE FROM user_logins WHERE user_id = v_user_id;
DELETE FROM roadmap_progress WHERE user_id = v_user_id;
DELETE FROM weekly_metrics_snapshots WHERE user_id = v_user_id;
-- Process builder children then parent
DELETE FROM process_phases WHERE process_id IN (SELECT id FROM process_diagrams WHERE user_id = v_user_id);
DELETE FROM process_connections WHERE process_id IN (SELECT id FROM process_diagrams WHERE user_id = v_user_id);
DELETE FROM process_steps WHERE process_id IN (SELECT id FROM process_diagrams WHERE user_id = v_user_id);
DELETE FROM process_flows WHERE process_id IN (SELECT id FROM process_diagrams WHERE user_id = v_user_id);
DELETE FROM process_versions WHERE process_id IN (SELECT id FROM process_diagrams WHERE user_id = v_user_id);
DELETE FROM process_diagrams WHERE user_id = v_user_id;
DELETE FROM team_data WHERE user_id = v_user_id;
DELETE FROM marketing_data WHERE user_id = v_user_id;
DELETE FROM stop_doing_items WHERE user_id = v_user_id;
DELETE FROM stop_doing_time_logs WHERE user_id = v_user_id;
DELETE FROM stop_doing_activities WHERE user_id = v_user_id;
DELETE FROM stop_doing_hourly_rates WHERE user_id = v_user_id;
DELETE FROM daily_tasks WHERE user_id = v_user_id;
DELETE FROM todo_items WHERE created_by = v_user_id;
BEGIN DELETE FROM ideas_filter WHERE user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
DELETE FROM ideas WHERE user_id = v_user_id;
DELETE FROM issues_list WHERE user_id = v_user_id;
DELETE FROM open_loops WHERE user_id = v_user_id;

-- Plan snapshots (may not exist)
IF v_has_plan_snapshots THEN
  DELETE FROM plan_snapshots WHERE user_id = v_user_id;
END IF;

-- Quarterly snapshots (may not exist)
BEGIN EXECUTE 'DELETE FROM quarterly_snapshots WHERE user_id = $1' USING v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;

-- Core tables: business_users, profiles, business_profiles, businesses
DELETE FROM business_users WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);
DELETE FROM profiles WHERE id = v_user_id;
DELETE FROM business_profiles WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = v_user_id);
DELETE FROM businesses WHERE owner_id = v_user_id;
DELETE FROM system_roles WHERE user_id = v_user_id;
DELETE FROM users WHERE id = v_user_id;

RAISE NOTICE 'Nuclear cleanup complete. Starting fresh seed...';

-- ============================================================
-- 0c. DROP INCORRECT FK CONSTRAINTS
-- Several tables store business_profiles.id in their business_id column
-- (that's how the app works), but some have FK constraints pointing to
-- businesses(id). Drop those so seed inserts (and app saves) work.
-- ============================================================
ALTER TABLE vision_targets DROP CONSTRAINT IF EXISTS vision_targets_business_id_fkey;
ALTER TABLE kpi_actuals DROP CONSTRAINT IF EXISTS kpi_actuals_business_id_fkey;
ALTER TABLE quarterly_snapshots DROP CONSTRAINT IF EXISTS quarterly_snapshots_business_id_fkey;

-- ============================================================
-- 1. CREATE USERS TABLE ENTRY
-- ============================================================
INSERT INTO users (id, email, first_name, last_name, phone, system_role)
VALUES (
  v_user_id, 'demo@wisdombi.au', 'James', 'Mitchell', '0417 892 345', 'client'
) ON CONFLICT (id) DO UPDATE SET first_name = 'James', last_name = 'Mitchell';

-- ============================================================
-- 2. CREATE BUSINESS
-- ============================================================
INSERT INTO businesses (
  id, name, business_name, owner_id, owner_name, owner_email,
  assigned_coach_id, enabled_modules, status,
  invitation_sent, invitation_sent_at, industry, website, address
)
VALUES (
  gen_random_uuid(),
  'Precision Electrical Group',
  'Precision Electrical Group',
  v_user_id,
  'James Mitchell',
  'demo@wisdombi.au',
  v_coach_id,
  '{"plan": true, "forecast": true, "goals": true, "chat": true, "documents": true}'::jsonb,
  'active',
  true,
  NOW() - INTERVAL '90 days',
  'Electrical Contracting',
  'www.precisionelectrical.com.au',
  '18 Industrial Court, Brendale QLD 4500'
)
RETURNING id INTO v_business_id;

-- ============================================================
-- 3. CREATE BUSINESS PROFILE
-- ============================================================
INSERT INTO business_profiles (
  id, business_id, user_id, company_name, business_name, industry,
  annual_revenue, employee_count, website, profile_completed,
  gross_profit, gross_profit_margin, net_profit, net_profit_margin,
  years_in_operation, business_model, revenue_growth_rate, cash_in_bank,
  current_priorities,
  owner_info, key_roles, top_challenges, growth_opportunities,
  social_media, locations
)
VALUES (
  gen_random_uuid(), v_business_id, v_user_id,
  'Precision Electrical Group', 'Precision Electrical Group',
  'Electrical Contracting & Services',
  2800000, 15, 'www.precisionelectrical.com.au', true,
  1176000, 42.0, 280000, 10.0,
  12, 'Service-based', 18.5, 320000,
  ARRAY['Hire sales manager to free up owner time', 'Deploy SimPRO for job scheduling', 'Grow solar division'],
  '{
    "owner_name": "James Mitchell",
    "ownership_percentage": "100",
    "date_of_birth": "1982-06-15",
    "total_years_business": "12",
    "primary_goal": "Scale to $5.5M revenue with a self-managing team so I can step into a strategic leadership role",
    "time_horizon": "3 years",
    "exit_strategy": "Build to sell in 5-7 years — targeting 4x EBITDA multiple",
    "current_hours": "55",
    "desired_hours": "35",
    "desired_role": "CEO / Strategic Leadership — focusing on growth strategy, key client relationships, and team development",
    "love_doing": "Winning large commercial projects, mentoring the senior team, building client relationships, strategic planning days",
    "hate_doing": "Chasing late invoices, scheduling daily jobs, quoting small residential work, bookkeeping data entry, social media",
    "minimum_income": "180000",
    "target_income": "350000",
    "risk_tolerance": "moderate",
    "additional_context": "Wife Sarah handles office admin part-time. Looking to professionalise the business so it runs without me on the tools. Key focus is building a management layer (Ops Manager + Sales Manager) so I can work ON the business.",
    "partners": []
  }'::jsonb,
  '[
    {"name": "James Mitchell", "title": "Managing Director"},
    {"name": "Mark Thompson", "title": "Operations Manager"},
    {"name": "Sarah Mitchell", "title": "Office Manager"},
    {"name": "Lisa Chen", "title": "Accounts & Admin"}
  ]'::jsonb,
  ARRAY[
    'Owner still doing 60% of quoting — bottleneck on sales pipeline',
    'Apprentice retention — lost 2 in past 6 months to mining sector wages',
    'No dedicated sales function — relying on word of mouth and Google Ads'
  ],
  ARRAY[
    'Solar panel installations — QLD government rebates driving massive demand',
    'Strata maintenance contracts — predictable recurring revenue with 40%+ margins',
    'Commercial EV charger installations — first-mover advantage in Brisbane market'
  ],
  '{
    "website": "www.precisionelectrical.com.au",
    "linkedin": "linkedin.com/company/precision-electrical-group",
    "facebook": "facebook.com/PrecisionElectricalBrisbane",
    "instagram": "instagram.com/precisionelectrical_bne",
    "twitter": ""
  }'::jsonb,
  ARRAY['Brisbane CBD', 'South-East Queensland', 'Gold Coast (commercial only)']
)
RETURNING id INTO v_profile_id;

-- ============================================================
-- 4. SYSTEM ROLES & PERMISSIONS
-- ============================================================
INSERT INTO system_roles (user_id, role)
VALUES (v_user_id, 'client')
ON CONFLICT (user_id) DO UPDATE SET role = 'client';

INSERT INTO business_users (business_id, user_id, role, status)
VALUES (v_business_id, v_user_id, 'owner', 'active')
ON CONFLICT (business_id, user_id) DO NOTHING;

-- ============================================================
-- 5. STRATEGY DATA (uses vision_mission JSONB column)
-- ============================================================
INSERT INTO strategy_data (user_id, business_id, vision_mission)
VALUES (
  v_user_id, v_business_id,
  '{"mission_statement":"We deliver safe, professional electrical solutions that power homes and businesses with confidence. Through skilled craftsmanship, transparent communication, and a commitment to continuous improvement, we make electrical work stress-free and build lasting relationships with our customers.","vision_statement":"To be Queensland''s most trusted electrical contracting company by 2029, serving 3,000+ customers annually with a team of 30 skilled electricians, known for technical excellence, reliability, and innovation in sustainable energy solutions.","core_values":["Safety First","Reliability","Technical Excellence","Integrity","Team Growth"]}'::jsonb
)
ON CONFLICT (user_id) DO UPDATE SET vision_mission = EXCLUDED.vision_mission;

-- ============================================================
-- 6. ASSESSMENT (no business_id or assessment_type columns)
-- ============================================================
INSERT INTO assessments (user_id, status, percentage, total_score, health_status,
  attract_score, attract_max, convert_score, convert_max, deliver_score, deliver_max,
  people_score, people_max, systems_score, systems_max, finance_score, finance_max,
  leadership_score, leadership_max, time_score, time_max)
VALUES (
  v_user_id, 'completed', 72, 230, 'STRONG',
  29, 40, 31, 40, 33, 40, 26, 40, 24, 40, 28, 30, 25, 30, 24, 40
);

-- ============================================================
-- 7. VISION TARGETS
-- (Vision page queries with business_profiles.id, not businesses.id)
-- FK constraint dropped in section 0c above.
-- ============================================================
INSERT INTO vision_targets (business_id, user_id, timeframe, title, description, target_value, target_metric, kpis)
VALUES (
  v_profile_id, v_user_id, '3_year',
  '3-Year Vision: $5.5M Revenue, 30 Staff',
  'Market leader in residential and commercial electrical services across South-East Queensland with strong recurring revenue from maintenance contracts and solar installations. Full-service electrical, solar & battery, EV charging, smart home automation, 24/7 emergency response.',
  '5500000', 'revenue',
  '[
    {"name": "Jobs Completed", "target": 2800, "unit": "jobs/year"},
    {"name": "Average Job Value", "target": 1214, "unit": "$"},
    {"name": "Customer Satisfaction (NPS)", "target": 72, "unit": "score"},
    {"name": "Revenue per Electrician", "target": 226666, "unit": "$/year"}
  ]'::jsonb
);

INSERT INTO vision_targets (business_id, user_id, timeframe, title, description, target_value, target_metric, kpis)
VALUES (
  v_profile_id, v_user_id, '1_year',
  '1-Year Target: $3.4M Revenue, 20 Staff',
  'Grow revenue to $3.4M with 45% gross margin and 13% net margin. Hire sales manager, deploy SimPRO, launch emergency service. Expand team to 20.',
  '3400000', 'revenue',
  '[
    {"name": "Quote Win Rate", "target": 68, "unit": "%"},
    {"name": "First-Time Fix Rate", "target": 94, "unit": "%"},
    {"name": "Leads Per Month", "target": 160, "unit": "leads"},
    {"name": "Team Utilisation", "target": 85, "unit": "%"}
  ]'::jsonb
);

-- ============================================================
-- 8. BUSINESS FINANCIAL GOALS
-- ============================================================
INSERT INTO business_financial_goals (
  business_id, user_id,
  revenue_current, revenue_year1, revenue_year2, revenue_year3,
  gross_profit_current, gross_profit_year1, gross_profit_year2, gross_profit_year3,
  gross_margin_current, gross_margin_year1, gross_margin_year2, gross_margin_year3,
  net_profit_current, net_profit_year1, net_profit_year2, net_profit_year3,
  net_margin_current, net_margin_year1, net_margin_year2, net_margin_year3,
  customers_current, customers_year1, customers_year2, customers_year3,
  employees_current, employees_year1, employees_year2, employees_year3,
  leads_per_month_current, leads_per_month_year1, leads_per_month_year2, leads_per_month_year3,
  conversion_rate_current, conversion_rate_year1, conversion_rate_year2, conversion_rate_year3,
  avg_transaction_value_current, avg_transaction_value_year1, avg_transaction_value_year2, avg_transaction_value_year3,
  team_headcount_current, team_headcount_year1, team_headcount_year2, team_headcount_year3,
  owner_hours_per_week_current, owner_hours_per_week_year1, owner_hours_per_week_year2, owner_hours_per_week_year3,
  quarterly_targets, year_type
)
VALUES (
  v_profile_id::text, v_user_id,
  2800000, 3400000, 4500000, 5500000,
  1176000, 1530000, 2115000, 2640000,
  42, 45, 47, 48,
  280000, 442000, 675000, 990000,
  10, 13, 15, 18,
  1800, 2200, 2800, 3200,
  15, 20, 25, 30,
  120, 160, 200, 240,
  62, 68, 72, 75,
  1050, 1214, 1350, 1500,
  15, 20, 25, 30,
  55, 45, 40, 35,
  '{
    "revenue":{"q1":"800000","q2":"900000","q3":"850000","q4":"850000"},
    "grossProfit":{"q1":"360000","q2":"405000","q3":"382500","q4":"382500"},
    "grossMargin":{"q1":"45","q2":"45","q3":"45","q4":"45"},
    "netProfit":{"q1":"104000","q2":"117000","q3":"110500","q4":"110500"},
    "netMargin":{"q1":"13","q2":"13","q3":"13","q4":"13"},
    "leadsPerMonth":{"q1":"140","q2":"155","q3":"170","q4":"175"},
    "conversionRate":{"q1":"65","q2":"67","q3":"69","q4":"71"},
    "avgTransactionValue":{"q1":"1100","q2":"1200","q3":"1250","q4":"1300"},
    "teamHeadcount":{"q1":"16","q2":"18","q3":"19","q4":"20"},
    "ownerHoursPerWeek":{"q1":"50","q2":"48","q3":"46","q4":"45"},
    "kpi-revenue":{"q1":"266667","q2":"300000","q3":"283333","q4":"283333"},
    "kpi-gm":{"q1":"44","q2":"45","q3":"45","q4":"45"},
    "kpi-npm":{"q1":"12","q2":"13","q3":"13","q4":"13"},
    "kpi-jobs":{"q1":"210","q2":"225","q3":"235","q4":"240"},
    "kpi-ajv":{"q1":"1100","q2":"1200","q3":"1214","q4":"1250"},
    "kpi-qwr":{"q1":"64","q2":"66","q3":"68","q4":"70"},
    "kpi-nps":{"q1":"68","q2":"70","q3":"72","q4":"72"},
    "kpi-ftfr":{"q1":"91","q2":"92","q3":"94","q4":"94"},
    "kpi-util":{"q1":"80","q2":"82","q3":"84","q4":"85"},
    "kpi-google":{"q1":"4.6","q2":"4.7","q3":"4.8","q4":"4.8"},
    "kpi-leads":{"q1":"140","q2":"155","q3":"170","q4":"175"},
    "kpi-rpe":{"q1":"16667","q2":"18000","q3":"18889","q4":"18889"}
  }'::jsonb,
  'FY'
);

-- ============================================================
-- 9. BUSINESS KPIs
-- (business_id is TEXT, kpi_id is NOT NULL, target/current are TEXT)
-- ============================================================
-- NOTE: business_kpis.business_id must use business_profiles.id (not businesses.id)
-- because the Goals wizard normal user flow queries with business_profiles.id
-- (useStrategicPlanning line 678: kpiBizId = overrideBusinessId || bizId, where bizId = profile.id)
-- Columns: target_value (TEXT legacy), current_value (TEXT), year1/2/3_target (NUMERIC — what the app actually reads)
INSERT INTO business_kpis (business_id, business_profile_id, user_id, kpi_id, name, category, unit, target_value, current_value, year1_target, year2_target, year3_target, frequency, is_active) VALUES
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-revenue', 'Monthly Revenue', 'financial', '$', '283333', '268000', 283333, 375000, 458333, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-gm', 'Gross Margin %', 'financial', '%', '45', '42.5', 45, 47, 48, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-npm', 'Net Profit Margin', 'financial', '%', '13', '10.8', 13, 15, 18, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-jobs', 'Jobs Completed', 'operations', 'jobs', '230', '215', 230, 280, 320, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-ajv', 'Average Job Value', 'sales', '$', '1214', '1085', 1214, 1350, 1500, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-qwr', 'Quote Win Rate', 'sales', '%', '68', '62', 68, 72, 75, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-nps', 'Customer Satisfaction (NPS)', 'customer', 'score', '72', '65', 72, 75, 80, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-ftfr', 'First-Time Fix Rate', 'operations', '%', '94', '89', 94, 96, 97, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-util', 'Team Utilisation', 'people', '%', '85', '78', 85, 88, 90, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-google', 'Google Reviews Rating', 'marketing', 'stars', '4.8', '4.6', 4.8, 4.9, 4.9, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-leads', 'Leads Per Month', 'marketing', 'leads', '160', '125', 160, 200, 240, 'monthly', true),
(v_profile_id::text, v_profile_id, v_user_id, 'kpi-rpe', 'Revenue Per Electrician', 'financial', '$', '18888', '17200', 18888, 22666, 26000, 'monthly', true);

-- ============================================================
-- 10. SWOT ANALYSIS
-- (business_id is UUID, created_by is NOT NULL)
-- ============================================================
INSERT INTO swot_analyses (id, business_id, user_id, created_by, type, quarter, year, title)
VALUES (
  gen_random_uuid(), v_user_id, v_user_id, v_user_id,
  'quarterly', 3, 2026, 'Q3 FY2026 SWOT Analysis'
)
ON CONFLICT ON CONSTRAINT unique_quarterly_swot DO UPDATE SET title = EXCLUDED.title
RETURNING id INTO v_swot_id;

DELETE FROM swot_items WHERE swot_analysis_id = v_swot_id;
INSERT INTO swot_items (swot_analysis_id, category, title, description, priority_order, status, created_by) VALUES
(v_swot_id, 'strength', 'Strong reputation', '4.6 star Google rating with 380+ reviews. Word of mouth drives 40% of leads.', 1, 'active', v_user_id),
(v_swot_id, 'strength', 'Experienced team', 'Core team of 8 electricians averaging 12+ years experience. Low turnover.', 2, 'active', v_user_id),
(v_swot_id, 'strength', 'Diverse service offering', 'Residential, commercial, solar, EV charging — multiple revenue streams reduce risk.', 3, 'active', v_user_id),
(v_swot_id, 'strength', 'Licensed and fully insured', 'Master Electrician licence, $20M liability, all compliance current.', 4, 'active', v_user_id),
(v_swot_id, 'strength', 'Strong cash position', '$180K operating cash reserves. No debt on vehicles or equipment.', 5, 'active', v_user_id),
(v_swot_id, 'weakness', 'No after-hours emergency service', 'Losing $15-20K/month in emergency callout revenue to competitors.', 1, 'active', v_user_id),
(v_swot_id, 'weakness', 'Manual quoting and scheduling', 'Paper-based job cards and Excel scheduling causing double-bookings and delays.', 2, 'active', v_user_id),
(v_swot_id, 'weakness', 'Owner-dependent sales', 'James handles 80% of commercial quotes. Single point of failure for growth.', 3, 'active', v_user_id),
(v_swot_id, 'weakness', 'Weak online presence', 'Website outdated, no active social media. Competitors outranking on Google.', 4, 'active', v_user_id),
(v_swot_id, 'weakness', 'Inconsistent project management', 'Larger jobs ($20K+) lack structured project tracking. Margin slippage on big jobs.', 5, 'active', v_user_id),
(v_swot_id, 'opportunity', 'Solar & battery boom', 'QLD government rebates driving 40% YoY growth in residential solar. Average job $12K.', 1, 'active', v_user_id),
(v_swot_id, 'opportunity', 'EV charger installations', 'EV sales growing 60% YoY. First-mover advantage in commercial EV charging.', 2, 'active', v_user_id),
(v_swot_id, 'opportunity', 'Strata maintenance contracts', '5 strata managers have approached us. Recurring revenue potential $300K/year.', 3, 'active', v_user_id),
(v_swot_id, 'opportunity', 'Smart home automation', 'High-margin segment ($5-15K per job). Growing demand from new builds and renovations.', 4, 'active', v_user_id),
(v_swot_id, 'opportunity', 'Apprenticeship program', 'Government subsidies available. Build pipeline of skilled electricians.', 5, 'active', v_user_id),
(v_swot_id, 'threat', 'National franchise competition', 'Mr Sparky and similar franchises expanding in Brisbane with heavy marketing spend.', 1, 'active', v_user_id),
(v_swot_id, 'threat', 'Skilled labour shortage', 'Electrician shortage across QLD. Wage pressure increasing 8-10% YoY.', 2, 'active', v_user_id),
(v_swot_id, 'threat', 'Material cost inflation', 'Copper, cable, switchgear prices up 18% in 12 months. Margin pressure.', 3, 'active', v_user_id),
(v_swot_id, 'threat', 'Construction slowdown', 'Residential building approvals down 12%. New build pipeline shrinking.', 4, 'active', v_user_id),
(v_swot_id, 'threat', 'Regulatory changes', 'New AS/NZS standards requiring additional certification. Training costs increasing.', 5, 'active', v_user_id);

-- ============================================================
-- 11. STRATEGIC INITIATIVES
-- ============================================================
-- Twelve-month strategic ideas
INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, priority, step_type, idea_type, selected, source, timeline, estimated_cost, is_monthly_cost) VALUES
(v_profile_id, v_user_id, 'Launch 24/7 Emergency Service', 'Implement after-hours emergency electrical response with dedicated on-call roster and premium pricing', 'product', 'high', 'twelve_month', 'strategic', true, 'twelve_month', 'Q3-Q4', 15000, false),
(v_profile_id, v_user_id, 'Deploy SimPRO Field Service Software', 'Replace paper-based system with SimPRO for scheduling, quoting, invoicing, and job tracking', 'systems', 'high', 'twelve_month', 'strategic', true, 'twelve_month', 'Q3', 2500, true),
(v_profile_id, v_user_id, 'Hire Dedicated Sales Manager', 'Recruit experienced sales manager to own commercial pipeline and reduce owner dependency', 'people', 'high', 'twelve_month', 'strategic', true, 'twelve_month', 'Q3-Q4', 120000, false),
(v_profile_id, v_user_id, 'Solar Division Expansion', 'Build dedicated solar team (2 electricians + 1 designer) to capture growing residential solar market', 'product', 'high', 'twelve_month', 'strategic', true, 'twelve_month', 'Q4-Q1', 45000, false),
(v_profile_id, v_user_id, 'Strata Maintenance Contracts Program', 'Develop service offering and win 5 strata management contracts for recurring revenue', 'marketing', 'medium', 'twelve_month', 'strategic', true, 'twelve_month', 'Q4', 8000, false),
(v_profile_id, v_user_id, 'Website & Digital Marketing Overhaul', 'New website, Google Ads campaign, SEO optimisation, and social media presence', 'marketing', 'high', 'twelve_month', 'strategic', true, 'twelve_month', 'Q3', 3500, true),
(v_profile_id, v_user_id, 'Apprenticeship Training Program', 'Recruit 2 apprentices and establish structured training program with government subsidies', 'people', 'medium', 'twelve_month', 'strategic', true, 'twelve_month', 'Q4', 8000, true),
(v_profile_id, v_user_id, 'Commercial EV Charger Partnerships', 'Partner with 3 EV charger manufacturers and become authorised installer', 'product', 'medium', 'twelve_month', 'strategic', true, 'twelve_month', 'Q4', 25000, false);

-- Q3 (Jan-Mar 2026) — Current quarter rocks with sprint planning
INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, priority, step_type, idea_type, selected, source, timeline, why, outcome, assigned_to, start_date, end_date, total_hours, milestones, tasks) VALUES
(v_profile_id, v_user_id, 'Deploy SimPRO Field Service Software', 'Phase 1: Implement scheduling, quoting, and job management modules', 'systems', 'high', 'q3', 'strategic', true, 'q3', 'Q3',
  'Manual scheduling costing 10+ hours/week and causing double-bookings. SimPRO will save $50K/year in admin time.',
  'All active jobs tracked in SimPRO. Team trained. Paper job cards eliminated.',
  'Sarah Chen (Office Manager)', '2026-01-06', '2026-03-28', 120,
  '[{"id":"m1","description":"SimPRO contract signed and onboarding started","targetDate":"2026-01-20","isCompleted":true},{"id":"m2","description":"Data migration complete","targetDate":"2026-02-14","isCompleted":true},{"id":"m3","description":"Team training complete","targetDate":"2026-03-07","isCompleted":false},{"id":"m4","description":"Go-live: paper job cards eliminated","targetDate":"2026-03-28","isCompleted":false}]'::jsonb,
  '[{"id":"t1","task":"Negotiate and sign SimPRO contract","assignedTo":"James Mitchell","minutesAllocated":480,"dueDate":"2026-01-17","status":"done","order":1},{"id":"t2","task":"Export customer database and clean data","assignedTo":"Sarah Chen","minutesAllocated":960,"dueDate":"2026-02-07","status":"done","order":2},{"id":"t3","task":"Configure pricing templates","assignedTo":"Sarah Chen","minutesAllocated":720,"dueDate":"2026-02-21","status":"in_progress","order":3},{"id":"t4","task":"Train office staff","assignedTo":"Sarah Chen","minutesAllocated":480,"dueDate":"2026-03-07","status":"not_started","order":4},{"id":"t5","task":"Train field team on mobile app","assignedTo":"Mike Torres","minutesAllocated":480,"dueDate":"2026-03-14","status":"not_started","order":5}]'::jsonb),
(v_profile_id, v_user_id, 'Website & Digital Marketing Launch', 'New website live + Google Ads campaign running + SEO foundation', 'marketing', 'high', 'q3', 'strategic', true, 'q3', 'Q3',
  'Current website generates only 15 leads/month. Need 50% increase in lead flow.',
  'New website live. Google Ads generating 30+ leads/month.',
  'External Agency (Digital Reach)', '2026-01-13', '2026-03-31', 80,
  '[{"id":"m5","description":"New website design approved","targetDate":"2026-01-31","isCompleted":true},{"id":"m6","description":"Website live","targetDate":"2026-02-28","isCompleted":true},{"id":"m7","description":"Google Ads launched","targetDate":"2026-03-07","isCompleted":true},{"id":"m8","description":"First month results reviewed","targetDate":"2026-03-31","isCompleted":false}]'::jsonb,
  '[{"id":"t6","task":"Brief agency on brand and target market","assignedTo":"James Mitchell","minutesAllocated":240,"dueDate":"2026-01-17","status":"done","order":1},{"id":"t7","task":"Review and approve designs","assignedTo":"James Mitchell","minutesAllocated":120,"dueDate":"2026-02-07","status":"done","order":2},{"id":"t8","task":"Write case studies","assignedTo":"James Mitchell","minutesAllocated":300,"dueDate":"2026-02-21","status":"done","order":3},{"id":"t9","task":"Set up Google Ads and tracking","assignedTo":"Digital Reach Agency","minutesAllocated":480,"dueDate":"2026-03-07","status":"done","order":4}]'::jsonb),
(v_profile_id, v_user_id, 'Hire Sales Manager', 'Recruit and onboard dedicated sales manager for commercial pipeline', 'people', 'high', 'q3', 'strategic', true, 'q3', 'Q3',
  'James spending 15+ hours/week on quotes. Growth capped at his capacity.',
  'Sales manager hired, onboarded, managing pipeline independently.',
  'James Mitchell', '2026-01-20', '2026-03-31', 60,
  '[{"id":"m9","description":"Job ad posted and recruiter briefed","targetDate":"2026-01-31","isCompleted":true},{"id":"m10","description":"Shortlist of 3 candidates interviewed","targetDate":"2026-02-28","isCompleted":true},{"id":"m11","description":"Offer accepted","targetDate":"2026-03-14","isCompleted":false},{"id":"m12","description":"Sales manager onboarded","targetDate":"2026-03-31","isCompleted":false}]'::jsonb,
  '[{"id":"t10","task":"Write job description and salary package","assignedTo":"James Mitchell","minutesAllocated":180,"dueDate":"2026-01-24","status":"done","order":1},{"id":"t11","task":"Brief recruiter and post on Seek","assignedTo":"Sarah Chen","minutesAllocated":120,"dueDate":"2026-01-31","status":"done","order":2},{"id":"t12","task":"Interview shortlisted candidates","assignedTo":"James Mitchell","minutesAllocated":360,"dueDate":"2026-02-28","status":"done","order":3},{"id":"t13","task":"Reference checks and offer","assignedTo":"James Mitchell","minutesAllocated":120,"dueDate":"2026-03-14","status":"in_progress","order":4}]'::jsonb);

-- Q4 initiatives (with milestones & tasks)
INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, priority, step_type, idea_type, selected, source, timeline, why, outcome, assigned_to, start_date, end_date, total_hours, milestones, tasks) VALUES
(v_profile_id, v_user_id, 'Launch 24/7 Emergency Service', 'Go live with after-hours emergency callout service with dedicated on-call roster and premium pricing ($250 callout + time & materials)', 'product', 'high', 'q4', 'strategic', true, 'q4', 'Q4',
  'Missing $200K+/year in emergency work going to competitors. Customers asking for after-hours service.',
  '24/7 emergency line live. On-call roster running. First 50 emergency callouts completed.',
  'Mark Thompson (Operations Manager)', '2026-04-01', '2026-06-30', 90,
  '[{"id":"m13","description":"After-hours phone system and routing set up","targetDate":"2026-04-14","isCompleted":false},{"id":"m14","description":"On-call roster agreed with team (4 electricians rotating)","targetDate":"2026-04-28","isCompleted":false},{"id":"m15","description":"Emergency service pricing and T&Cs finalised","targetDate":"2026-05-12","isCompleted":false},{"id":"m16","description":"Soft launch — existing clients only","targetDate":"2026-05-26","isCompleted":false},{"id":"m17","description":"Full public launch with Google Ads","targetDate":"2026-06-16","isCompleted":false}]'::jsonb,
  '[{"id":"t14","task":"Research after-hours phone/routing solutions","assignedTo":"Sarah Chen","minutesAllocated":240,"dueDate":"2026-04-07","status":"not_started","order":1},{"id":"t15","task":"Draft on-call roster and overtime rates","assignedTo":"Mark Thompson","minutesAllocated":180,"dueDate":"2026-04-21","status":"not_started","order":2},{"id":"t16","task":"Create emergency service pricing sheet","assignedTo":"James Mitchell","minutesAllocated":120,"dueDate":"2026-05-05","status":"not_started","order":3},{"id":"t17","task":"Set up emergency service Google Ads campaign","assignedTo":"Digital Reach Agency","minutesAllocated":360,"dueDate":"2026-06-09","status":"not_started","order":4},{"id":"t18","task":"Update website with 24/7 emergency page","assignedTo":"Digital Reach Agency","minutesAllocated":240,"dueDate":"2026-05-19","status":"not_started","order":5}]'::jsonb),

(v_profile_id, v_user_id, 'Win First 3 Strata Contracts', 'Close strata maintenance contracts with minimum $60K/year each for predictable recurring revenue', 'marketing', 'high', 'q4', 'strategic', true, 'q4', 'Q4',
  'Need predictable recurring revenue to smooth out seasonal dips. Strata contracts are 12-month with auto-renewal.',
  '3 signed strata contracts worth $180K+ total annual revenue. Monthly maintenance schedule running.',
  'James Mitchell', '2026-04-01', '2026-06-30', 70,
  '[{"id":"m18","description":"Strata service offering and pricing finalised","targetDate":"2026-04-14","isCompleted":false},{"id":"m19","description":"Target list of 15 property managers compiled","targetDate":"2026-04-28","isCompleted":false},{"id":"m20","description":"First 5 meetings booked","targetDate":"2026-05-12","isCompleted":false},{"id":"m21","description":"First contract signed","targetDate":"2026-05-31","isCompleted":false},{"id":"m22","description":"3 contracts signed","targetDate":"2026-06-30","isCompleted":false}]'::jsonb,
  '[{"id":"t19","task":"Research competitor strata service offerings","assignedTo":"James Mitchell","minutesAllocated":180,"dueDate":"2026-04-07","status":"not_started","order":1},{"id":"t20","task":"Create strata maintenance package and pricing","assignedTo":"James Mitchell","minutesAllocated":240,"dueDate":"2026-04-14","status":"not_started","order":2},{"id":"t21","task":"Build target list of property managers","assignedTo":"Sarah Chen","minutesAllocated":120,"dueDate":"2026-04-21","status":"not_started","order":3},{"id":"t22","task":"Book and attend introduction meetings","assignedTo":"James Mitchell","minutesAllocated":600,"dueDate":"2026-05-31","status":"not_started","order":4},{"id":"t23","task":"Draft and send contract proposals","assignedTo":"James Mitchell","minutesAllocated":300,"dueDate":"2026-06-15","status":"not_started","order":5}]'::jsonb),

(v_profile_id, v_user_id, 'Recruit 2 Apprentices', 'Hire and register 2 first-year electrical apprentices through TAFE partnership and industry recruitment', 'people', 'medium', 'q4', 'strategic', true, 'q4', 'Q4',
  'Team stretched thin. Need to build talent pipeline. Government incentives available for apprentice hiring.',
  '2 apprentices hired, registered with TAFE, and assigned mentors. Training plans in place.',
  'Mark Thompson (Operations Manager)', '2026-04-15', '2026-06-30', 40,
  '[{"id":"m23","description":"TAFE partnership agreement signed","targetDate":"2026-04-28","isCompleted":false},{"id":"m24","description":"Job ads posted and school visits scheduled","targetDate":"2026-05-12","isCompleted":false},{"id":"m25","description":"Interviews completed and offers made","targetDate":"2026-06-02","isCompleted":false},{"id":"m26","description":"2 apprentices started and registered","targetDate":"2026-06-30","isCompleted":false}]'::jsonb,
  '[{"id":"t24","task":"Contact TAFE about partnership program","assignedTo":"Mark Thompson","minutesAllocated":120,"dueDate":"2026-04-21","status":"not_started","order":1},{"id":"t25","task":"Write apprentice job descriptions and post on Seek","assignedTo":"Sarah Chen","minutesAllocated":120,"dueDate":"2026-05-05","status":"not_started","order":2},{"id":"t26","task":"Interview candidates","assignedTo":"Mark Thompson","minutesAllocated":360,"dueDate":"2026-05-26","status":"not_started","order":3},{"id":"t27","task":"Complete apprenticeship registration paperwork","assignedTo":"Sarah Chen","minutesAllocated":180,"dueDate":"2026-06-16","status":"not_started","order":4},{"id":"t28","task":"Create 90-day onboarding and mentor plan","assignedTo":"Mark Thompson","minutesAllocated":180,"dueDate":"2026-06-23","status":"not_started","order":5}]'::jsonb);

-- Strategic ideas pool (source = 'strategic_ideas' for orange cards, NOT 'roadmap' which shows navy)
INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, priority, step_type, idea_type, selected, source) VALUES
(v_profile_id, v_user_id, 'Fleet GPS Tracking System', 'Install GPS in all vehicles for route optimisation', 'systems', 'low', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Customer Loyalty Program', 'Annual service agreement with priority booking and discount', 'marketing', 'medium', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Smart Home Automation Division', 'Dedicated team for smart home installations', 'product', 'medium', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Partnership with 3 Builders', 'Preferred electrician agreements with volume builders', 'marketing', 'medium', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'ISO 9001 Certification', 'Quality management system certification', 'systems', 'low', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Sunshine Coast Expansion', 'Open satellite office on Sunshine Coast', 'product', 'low', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Internal Training Academy', 'Structured CPD program with monthly workshops', 'people', 'medium', 'strategic_ideas', 'strategic', false, 'strategic_ideas'),
(v_profile_id, v_user_id, 'Commercial Lighting Upgrades', 'LED retrofit service with energy savings guarantee', 'product', 'medium', 'strategic_ideas', 'strategic', false, 'strategic_ideas');

-- ============================================================
-- 12. OPERATIONAL ACTIVITIES (business_id is UUID)
-- ============================================================
INSERT INTO operational_activities (business_id, user_id, name, frequency, recommended_frequency, source, function_id, description, order_index) VALUES
(v_profile_id, v_user_id, 'Review Google Ads performance', 'weekly', 'weekly', 'suggested', 'attract', 'Check CTR, cost per lead, and conversion rates.', 1),
(v_profile_id, v_user_id, 'Post project photos on social media', 'weekly', '3x_week', 'suggested', 'attract', 'Share before/after photos on Instagram and Facebook.', 2),
(v_profile_id, v_user_id, 'Request Google reviews from happy customers', 'daily', 'daily', 'suggested', 'attract', 'Send review request within 24 hours of job completion.', 3),
(v_profile_id, v_user_id, 'Follow up on outstanding quotes', 'daily', 'daily', 'suggested', 'convert', 'Call or text all quotes older than 3 days.', 4),
(v_profile_id, v_user_id, 'Review quote pipeline in SimPRO', 'weekly', 'weekly', 'suggested', 'convert', 'Check all open quotes, update status, identify stalled deals.', 5),
(v_profile_id, v_user_id, 'Quality check completed jobs', 'daily', 'daily', 'suggested', 'deliver', 'Review 2-3 completed job cards for quality and compliance.', 6),
(v_profile_id, v_user_id, 'Morning team huddle', 'daily', 'daily', 'suggested', 'deliver', '15-min standup: today''s jobs, any issues, materials needed.', 7),
(v_profile_id, v_user_id, 'Weekly team meeting', 'weekly', 'weekly', 'suggested', 'people', '1-hour team meeting: wins, issues, training, schedule review.', 8),
(v_profile_id, v_user_id, 'Monthly 1:1 with each team lead', 'monthly', 'monthly', 'suggested', 'people', 'Career development, feedback, and performance discussion.', 9),
(v_profile_id, v_user_id, 'Review P&L and cash position', 'weekly', 'weekly', 'suggested', 'finance', 'Check bank balance, outstanding invoices, upcoming expenses.', 10),
(v_profile_id, v_user_id, 'Invoice within 24 hours of completion', 'daily', 'daily', 'suggested', 'finance', 'Ensure all completed jobs are invoiced same day.', 11),
(v_profile_id, v_user_id, 'Update job costing spreadsheet', 'weekly', 'weekly', 'suggested', 'systems', 'Track actual vs quoted costs on all jobs >$5K.', 12),
(v_profile_id, v_user_id, 'Vehicle and tool maintenance check', 'weekly', 'weekly', 'suggested', 'systems', 'Inspect vehicles, test equipment, restock consumables.', 13),
(v_profile_id, v_user_id, 'Strategic thinking time (90 min block)', 'weekly', 'weekly', 'suggested', 'leadership', 'Uninterrupted time for planning and big-picture thinking.', 14),
(v_profile_id, v_user_id, 'Delegate 3 tasks from your plate', 'weekly', 'weekly', 'suggested', 'time', 'Identify tasks you''re doing that should be done by team.', 15),
(v_profile_id, v_user_id, 'Time audit — track where hours go', 'weekly', 'weekly', 'suggested', 'time', 'Log your time for the week. Identify time drains.', 16);

-- ============================================================
-- 13. ANNUAL TARGETS
-- (Production: year, revenue_target, gross_profit_target, net_profit_target)
-- ============================================================
INSERT INTO annual_targets (business_id, user_id, year, revenue_target, gross_profit_target, net_profit_target, notes)
VALUES (
  v_business_id, v_user_id, 2026,
  3400000, 1530000, 442000,
  'FY2026 targets: 20 staff, 2200 customers, $1214 avg job value. Q1: $800K, Q2: $900K, Q3: $850K, Q4: $850K.'
);

-- ============================================================
-- 14. COMPLETED QUARTERLY REVIEW (Q3 FY2026 = Jan-Mar 2026)
-- ============================================================
INSERT INTO quarterly_reviews (
  id, business_id, user_id, quarter, year, review_type, status,
  current_step, steps_completed, started_at, completed_at, prework_completed_at,
  last_quarter_rating, biggest_win, biggest_challenge, key_learning,
  hours_worked_avg, days_off_taken, energy_level, purpose_alignment,
  one_thing_for_success, coach_support_needed,
  dashboard_snapshot, scorecard_commentary, action_replay, rocks_review,
  feedback_loop_mode, feedback_loop,
  open_loops_decisions, issues_resolved,
  customer_pulse, people_review,
  assessment_snapshot, roadmap_snapshot,
  swot_analysis_id,
  annual_target_confidence, confidence_notes, targets_adjusted,
  ytd_revenue_annual, ytd_gross_profit_annual, ytd_net_profit_annual,
  annual_plan_snapshot, realignment_decision,
  initiative_decisions, quarterly_targets, initiatives_changes, quarterly_rocks,
  personal_commitments, one_thing_answer,
  coach_notes, action_items
)
VALUES (
  gen_random_uuid(), v_business_id, v_user_id, 3, 2026, 'quarterly', 'completed',
  'complete',
  '["prework","1.1","1.2","1.3","1.4","2.1","2.2","2.3","2.4","2.5","3.1","3.2","4.1","4.2","4.3"]'::jsonb,
  '2026-03-15 09:00:00+10'::timestamptz,
  '2026-03-15 13:30:00+10'::timestamptz,
  '2026-03-14 20:00:00+10'::timestamptz,
  7,
  'Won $85K commercial fit-out for new office building in Fortitude Valley. Largest single job in company history.',
  'Lost 2 electricians to a competitor offering 15% higher wages. Had to defer 3 commercial quotes.',
  'Need a formal retention strategy — competitive wages alone won''t keep people. Culture, training, and career paths matter more.',
  52, 4, 7, 8,
  'Hire the sales manager and get SimPRO fully operational so I can step back from day-to-day quoting.',
  'Help me build a structured interview process for the sales manager role and create a 90-day onboarding plan.',

  '{"revenue":{"target":850000,"actual":795000,"variance":-55000,"percentageAchieved":93.5},"grossProfit":{"target":382500,"actual":342000,"variance":-40500,"percentageAchieved":89.4},"netProfit":{"target":110500,"actual":87000,"variance":-23500,"percentageAchieved":78.7},"kpis":[{"id":"kpi-leads","name":"Leads Per Month","target":160,"actual":125,"unit":"leads"},{"id":"kpi-conversion","name":"Quote Win Rate","target":68,"actual":62,"unit":"%"},{"id":"kpi-atv","name":"Average Job Value","target":1214,"actual":1085,"unit":"$"},{"id":"kpi-nps","name":"NPS Score","target":72,"actual":65,"unit":"score"},{"id":"kpi-ftfr","name":"First-Time Fix Rate","target":94,"actual":89,"unit":"%"}],"coreMetrics":{"leadsPerMonth":{"target":160,"actual":125,"variance":-35},"conversionRate":{"target":68,"actual":62,"variance":-6},"avgTransactionValue":{"target":1214,"actual":1085,"variance":-129},"teamHeadcount":{"target":20,"actual":15,"variance":-5},"ownerHoursPerWeek":{"target":45,"actual":52,"variance":7}},"rocksCompletion":{"completed":1,"total":3,"percentage":33,"rocks":[{"title":"Deploy SimPRO","completed":false,"percentage":65},{"title":"Website & Marketing Launch","completed":true,"percentage":100},{"title":"Hire Sales Manager","completed":false,"percentage":55}]}}'::jsonb,

  'Revenue 6.5% below quarterly target driven by 2 electricians leaving mid-quarter. Leads are below target — new website and Google Ads only launched in March. Positive: largest single job won ($85K).',

  '{"worked":["SimPRO implementation on track — scheduling module already saving 5 hours/week","New website and Google Ads launched — 38 leads in first 3 weeks","Won $85K Fortitude Valley commercial fit-out","Morning team huddles improved job completion rate by 12%"],"didntWork":["Lost 2 electricians to competitor — no retention strategy","Commercial quoting still bottlenecked through James","Material cost tracking was reactive — 4 jobs under-quoted"],"plannedButDidnt":["Didn''t start apprenticeship recruitment — deferred to Q4","Didn''t complete SimPRO mobile rollout","Didn''t set up formal customer feedback survey"],"newIdeas":["Material cost escalation clause in quotes >$10K","Employee referral bonus program ($2K per hire)","Bundle solar + battery quotes for higher average job value"],"keyInsight":"Growth is being capped by people capacity and owner dependency on sales."}'::jsonb,

  '[{"rockId":"rock-simpro","title":"Deploy SimPRO","owner":"Sarah Chen","successCriteria":"All jobs tracked in SimPRO.","progressPercentage":65,"decision":"carry_forward","outcomeNarrative":"Scheduling and quoting modules live. Mobile app training pending.","lessonsLearned":"Data migration always takes longer than expected."},{"rockId":"rock-website","title":"Website & Marketing Launch","owner":"Digital Reach Agency","successCriteria":"New website live. Google Ads generating 30+ leads/month.","progressPercentage":100,"decision":"completed","outcomeNarrative":"New website launched Feb 28. Google Ads live March 7. 38 leads in first 3 weeks.","lessonsLearned":"Agency partnership worked well. Clear brief made the difference."},{"rockId":"rock-sales","title":"Hire Sales Manager","owner":"James Mitchell","successCriteria":"Sales manager hired, managing pipeline independently.","progressPercentage":55,"decision":"carry_forward","outcomeNarrative":"Top candidate accepted verbally. Start date April 14. Offer: $110K + commission.","lessonsLearned":"Good sales managers are in high demand. Move faster on offers."}]'::jsonb,

  'by_area',
  '{"marketing":{"stop":["Letterbox drops — zero ROI"],"less":["Facebook organic posts"],"continue":["Google Ads","Builder networking"],"more":["Case studies on website","Google review requests"],"start":["Monthly email newsletter","YouTube electrical tips"]},"sales":{"stop":["Quoting jobs under $500"],"less":["Tyre-kicker quotes"],"continue":["Same-day commercial quotes","Relationship selling"],"more":["Upselling maintenance agreements","Follow-up on old quotes"],"start":["SimPRO quote follow-up process","Commercial tender tracking"]},"operations":{"stop":["Jobs outside service area"],"less":["Reactive scheduling"],"continue":["Morning huddles","Photo documentation"],"more":["First-time fix focus"],"start":["Project management for jobs >$20K"]},"finances":{"stop":["30-day terms for new customers"],"less":["Manual data entry"],"continue":["Weekly cash flow review","Monthly P&L review"],"more":["Accurate job costing"],"start":["Material cost escalation clauses"]},"people":{"stop":["Tolerating lateness"],"less":["Micromanaging"],"continue":["Monthly team meetings","Safety toolbox talks"],"more":["Recognition and rewards","Training opportunities"],"start":["Employee referral bonus","Quarterly team social"]},"owner":{"stop":["Phone during family time","Admin Sarah can handle"],"less":["On-site electrical work"],"continue":["Weekly strategy time","Coaching sessions"],"more":["Delegation to team leads","Commercial relationships"],"start":["Exercise 3x/week","Business book monthly"]},"topPriorities":["Complete SimPRO rollout","Onboard sales manager","Launch emergency service"]}'::jsonb,

  '[{"loopId":"ol-1","title":"Brendale workshop lease renewal","decision":"complete","notes":"Negotiate 3-year renewal. Due June 30."},{"loopId":"ol-2","title":"Replace aging vehicle (Van #3)","decision":"delegate","notes":"Mike to research. Budget $65K.","delegateTo":"Mike Torres"},{"loopId":"ol-3","title":"Evaluate Xero vs MYOB","decision":"defer","notes":"Wait for SimPRO integration. Revisit Q1 FY2027.","deferToQuarter":"Q1 2027"},{"loopId":"ol-4","title":"Update uniform supplier","decision":"complete","notes":"Sarah to get 3 quotes."},{"loopId":"ol-5","title":"Old solar panel supplier","decision":"delete","notes":"No longer competitive. Already moved to new supplier."}]'::jsonb,

  '[{"issueId":"iss-1","issue":"Quote response time averaging 5 days","solution":"Implement SimPRO mobile quoting. Same-day for standard, 48hrs commercial.","owner":"Sarah Chen","dueDate":"2026-04-30"},{"issueId":"iss-2","issue":"Material wastage ~$3K/month","solution":"Pre-kit materials per job. Track wastage in SimPRO.","owner":"Mike Torres","dueDate":"2026-05-15"},{"issueId":"iss-3","issue":"No structured onboarding for new hires","solution":"Create 2-week onboarding checklist.","owner":"James Mitchell","dueDate":"2026-04-15"}]'::jsonb,

  '{"compliments":["Multiple 5-star reviews praising punctuality","Builder referred 3 new clients after Fortitude Valley project","Strata manager: most professional electrical company"],"complaints":["2 complaints about quote wait time (>5 days)","1 complaint about late invoice","Customer wants online booking"],"trends":["EV charger enquiries up 4x","Solar battery enquiries up 50%","Strata managers asking for maintenance packages"],"notes":"Overall sentiment very positive. SimPRO should fix quoting speed."}'::jsonb,

  '{"assessments":[{"name":"Mike Torres","role":"Lead Electrician","action":"retain","notes":"Outstanding. Ready for Ops Manager title."},{"name":"Sarah Chen","role":"Office Manager","action":"retain","notes":"Driving SimPRO brilliantly. Key to business."},{"name":"Dave Kowalski","role":"Senior Electrician","action":"develop","notes":"Great on tools, needs leadership skills."},{"name":"Ben Park","role":"Electrician","action":"retain","notes":"Reliable. Good candidate for solar division."},{"name":"Chris Woods","role":"Electrician (resigned)","action":"replace","notes":"Left for competitor. Fill urgently."},{"name":"Tom Blake","role":"Apprentice (3rd year)","action":"develop","notes":"Fast learner. Licensed in 12 months."}],"hiringNeeds":[{"role":"Sales Manager","priority":"urgent","notes":"Offer pending. April 14 start."},{"role":"Licensed Electrician x2","priority":"urgent","notes":"Replace Chris + growth hire."},{"role":"1st Year Apprentice x2","priority":"next_quarter","notes":"Government subsidy confirmed."}],"capacityNotes":"85% capacity with 13 field staff. Need 2 replacements within 6 weeks.","trainingNeeds":"Dave: leadership course. All staff: SimPRO mobile. Ben: solar certification."}'::jsonb,

  '{"totalScore":230,"maxScore":320,"percentage":72,"engines":{"attract":{"score":29,"max":40},"convert":{"score":31,"max":40},"deliver":{"score":33,"max":40},"people":{"score":26,"max":40},"systems":{"score":24,"max":40},"finance":{"score":28,"max":30},"leadership":{"score":25,"max":30},"time":{"score":24,"max":40}}}'::jsonb,

  '{"currentStage":3,"stageName":"Accelerate","revenue":2800000,"buildItemsComplete":14,"buildItemsTotal":20,"stageConfirmed":true}'::jsonb,

  v_swot_id,
  7,
  'Revenue tracking slightly below target but website and Google Ads should close the gap. Main risk is hiring.',
  false,
  1650000, 693000, 195000,

  '{"yearType":"FY","planYear":2026,"currentQuarter":3,"remainingQuarters":1,"annualTargets":{"revenue":3400000,"grossProfit":1530000,"netProfit":442000},"ytdActuals":{"revenue":1650000,"grossProfit":693000,"netProfit":195000},"remaining":{"revenue":1750000,"grossProfit":837000,"netProfit":247000},"runRateNeeded":{"revenue":875000,"grossProfit":418500,"netProfit":123500}}'::jsonb,

  '{"choice":"keep_targets","rationale":"Despite losing 2 electricians, new hires and sales manager should accelerate Q4. Keep annual target.","executionChanges":["Fast-track hiring — offer sign-on bonus","Push strata contracts into early Q4","Increase Google Ads budget by 30%"]}'::jsonb,

  '[{"initiativeId":"init-simpro","title":"Deploy SimPRO","category":"Systems","currentStatus":"in_progress","progressPercentage":65,"decision":"keep","notes":"On track for Q4 completion."},{"initiativeId":"init-website","title":"Website & Marketing","category":"Marketing","currentStatus":"completed","progressPercentage":100,"decision":"keep","notes":"Completed. Optimisation mode."},{"initiativeId":"init-sales","title":"Hire Sales Manager","category":"Team","currentStatus":"in_progress","progressPercentage":55,"decision":"accelerate","notes":"Critical hire. Push for April start."},{"initiativeId":"init-emergency","title":"24/7 Emergency Service","category":"Growth","currentStatus":"not_started","progressPercentage":0,"decision":"keep","notes":"Q4 launch as planned."},{"initiativeId":"init-strata","title":"Strata Contracts","category":"Sales","currentStatus":"not_started","progressPercentage":0,"decision":"keep","notes":"3 strata managers in pipeline."},{"initiativeId":"init-apprentice","title":"Apprenticeship Program","category":"Team","currentStatus":"not_started","progressPercentage":0,"decision":"keep","notes":"Government subsidy confirmed."}]'::jsonb,

  '{"revenue":850000,"grossProfit":382500,"netProfit":110500,"kpis":[{"id":"kpi-leads","name":"Leads Per Month","target":180,"unit":"leads"},{"id":"kpi-conversion","name":"Quote Win Rate","target":68,"unit":"%"},{"id":"kpi-atv","name":"Average Job Value","target":1200,"unit":"$"}]}'::jsonb,

  '{"carriedForward":["init-simpro","init-sales"],"removed":[],"deferred":[],"added":[{"title":"Employee Referral Bonus Program","category":"People","description":"$2K bonus for successful electrician referrals"}]}'::jsonb,

  '[{"id":"rock-q4-1","title":"Complete SimPRO Rollout","description":"Finish mobile training. Eliminate paper job cards.","owner":"Sarah Chen","status":"on_track","progressPercentage":65,"successCriteria":"100% of jobs through SimPRO","targetDate":"2026-04-30","priority":1},{"id":"rock-q4-2","title":"Onboard Sales Manager","description":"Complete hiring, onboard, transition pipeline","owner":"James Mitchell","status":"on_track","progressPercentage":55,"successCriteria":"Managing all commercial quotes by June 30","targetDate":"2026-06-30","priority":1},{"id":"rock-q4-3","title":"Launch 24/7 Emergency Service","description":"Design on-call roster, pricing, marketing","owner":"Mike Torres","status":"not_started","progressPercentage":0,"successCriteria":"$15K+ revenue in first month","targetDate":"2026-05-31","priority":2},{"id":"rock-q4-4","title":"Win 3 Strata Contracts","description":"Close recurring maintenance agreements","owner":"James Mitchell","status":"not_started","progressPercentage":0,"successCriteria":"$180K combined annual value","targetDate":"2026-06-30","priority":2},{"id":"rock-q4-5","title":"Hire 2 Licensed Electricians","description":"Replace departed staff, add capacity","owner":"James Mitchell","status":"not_started","progressPercentage":0,"successCriteria":"2 electricians onboarded","targetDate":"2026-05-31","priority":1}]'::jsonb,

  '{"hoursPerWeekTarget":45,"daysOffPlanned":8,"daysOffScheduled":["2026-04-18","2026-04-21","2026-05-26","2026-06-09","2026-06-16"],"personalGoal":"Reduce hours from 52 to 45 by delegating sales. Hamilton Island family break in June."}'::jsonb,

  'Hire the right people and get the systems working. Everything else follows.',

  '{"prework":"James is honest about challenges. Good self-awareness.","1.1":"Dashboard shows revenue gap clearly.","1.2":"KPIs tell the story — leads below target but website just launched.","1.3":"Website completed on time. SimPRO slightly delayed. Sales hire critical.","1.4":"Key insight about people capacity bottleneck is spot on.","2.1":"Feedback loop very thorough. Owner section shows good self-awareness.","2.2":"Open loops cleaned up well.","2.3":"Quote response time is #1 issue — SimPRO will fix this.","2.4":"Customer feedback very positive. EV and solar demand is real.","2.5":"Good team with clear development paths. Hiring urgency is real.","3.1":"Systems and Time are areas to focus on.","3.2":"SWOT comprehensive and actionable.","4.1":"Conservative but achievable targets.","4.2":"Good decision to keep targets. Practical execution changes.","4.3":"Five rocks is ambitious — need to stay focused."}'::jsonb,

  '[{"id":"ai-1","description":"Finalise sales manager offer — April 14 start","owner":"James Mitchell","dueDate":"2026-03-22","sourceStep":"4.3","completed":false},{"id":"ai-2","description":"Post 2 electrician roles on Seek with sign-on bonus","owner":"Sarah Chen","dueDate":"2026-03-20","sourceStep":"2.5","completed":false},{"id":"ai-3","description":"Complete SimPRO mobile training for all field staff","owner":"Sarah Chen","dueDate":"2026-04-11","sourceStep":"4.3","completed":false},{"id":"ai-4","description":"Design on-call roster and pricing for emergency service","owner":"Mike Torres","dueDate":"2026-04-30","sourceStep":"4.3","completed":false},{"id":"ai-5","description":"Schedule meetings with 3 strata managers","owner":"James Mitchell","dueDate":"2026-04-07","sourceStep":"4.3","completed":false}]'::jsonb
)
RETURNING id INTO v_review_id;

-- ============================================================
-- 15. ONBOARDING PROGRESS
-- ============================================================
INSERT INTO onboarding_progress (business_id, profile_completed, first_plan_created, first_forecast_created, first_goal_set, first_session_scheduled, completed_at)
VALUES (v_business_id, true, true, true, true, true, NOW() - INTERVAL '60 days')
ON CONFLICT DO NOTHING;

-- Calculate most recent Monday for week alignment
v_week_monday := (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::integer - 1)))::date;

-- ============================================================
-- 16. WEEKLY REVIEWS — 13 weeks (business_id = business_profiles.id)
-- Weeks 12–1: completed. Week 0: current week, in progress.
-- Dates aligned to Monday–Sunday (matching weekly_metrics_snapshots).
-- ============================================================
INSERT INTO weekly_reviews (
  business_id, user_id, week_start_date, week_end_date,
  is_completed, completed_at,
  energy_rating, week_rating, rating_reason,
  wins, challenges, key_learning,
  disciplines_completed,
  quarterly_revenue_target, quarterly_gp_target, quarterly_np_target,
  rock_progress, top_priorities, other_priorities,
  coach_questions
) VALUES
-- Week 12 (~Dec 22): Christmas shutdown
(v_profile_id, v_user_id, (v_week_monday - 84)::date, (v_week_monday - 78)::date,
  true, NOW() - INTERVAL '83 days',
  5, 5, 'Christmas shutdown week. Skeleton crew handling emergencies only.',
  ARRAY['Year-end invoicing completed on time','All safety refreshers done before break','Secured 3 carry-over jobs for January'],
  ARRAY['Lost 2 days to storm damage callouts','Holiday cover stretched thin with only 3 electricians'],
  'Use quiet periods for planning — mapped out full Q3 rock plan over the break.',
  '[{"discipline":"Dashboard updated","completed":false},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":false}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":0},{"title":"Website & Digital Marketing","progress":5},{"title":"Hire Sales Manager","progress":0}]'::jsonb,
  '[{"id":"p1","text":"Complete year-end invoicing","completed":true},{"id":"p2","text":"Draft Q3 rocks and priorities","completed":true},{"id":"p3","text":"Review Q2 financial results with bookkeeper","completed":true}]'::jsonb,
  '["Order 2026 PPE stock"]'::jsonb,
  '[]'::jsonb),
-- Week 11 (~Dec 29): New Year''s week
(v_profile_id, v_user_id, (v_week_monday - 77)::date, (v_week_monday - 71)::date,
  true, NOW() - INTERVAL '76 days',
  6, 6, 'New Year''s. Most of the team still on leave.',
  ARRAY['Finalised Q3 budget and targets','Locked in SimPRO demo for next week','Cleared maintenance backlog from December'],
  ARRAY['Only 5 staff back this week','Supplier still closed — can''t order parts'],
  'Starting the year with a written plan makes the first real week much more productive.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":false},{"discipline":"Team check-in","completed":false}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":3},{"title":"Website & Digital Marketing","progress":8},{"title":"Hire Sales Manager","progress":0}]'::jsonb,
  '[{"id":"p1","text":"Finalise Q3 budget allocation","completed":true},{"id":"p2","text":"Confirm SimPRO demo date","completed":true},{"id":"p3","text":"Send website agency brief","completed":false}]'::jsonb,
  '["Follow up outstanding December invoices"]'::jsonb,
  '[]'::jsonb),
-- Week 10 (~Jan 5): First proper week back — all hands on deck
(v_profile_id, v_user_id, (v_week_monday - 70)::date, (v_week_monday - 64)::date,
  true, NOW() - INTERVAL '69 days',
  7, 7, 'Good energy. Full team back. SimPRO demo went well.',
  ARRAY['SimPRO demo completed — team excited about mobile app','Sent brief to Digital Reach for website redesign','Won residential rewire $18K in Ascot'],
  ARRAY['Parts supply delays on switchgear — 2 week backorder','January schedule already 80% full'],
  'Starting the year with clear priorities makes a big difference.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":8},{"title":"Website & Digital Marketing","progress":12},{"title":"Hire Sales Manager","progress":5}]'::jsonb,
  '[{"id":"p1","text":"Complete SimPRO data migration planning","completed":true},{"id":"p2","text":"Brief agency on website redesign","completed":true},{"id":"p3","text":"Write sales manager job description","completed":false}]'::jsonb,
  '["Order new test equipment for solar jobs"]'::jsonb,
  '[]'::jsonb),
-- Week 9 (~Jan 12): SimPRO contract signed
(v_profile_id, v_user_id, (v_week_monday - 63)::date, (v_week_monday - 57)::date,
  true, NOW() - INTERVAL '62 days',
  7, 7, 'SimPRO contract signed. Website wireframes received.',
  ARRAY['Signed SimPRO contract — onboarding starts next week','Received 3 website wireframe concepts','Landed $22K solar installation in Paddington'],
  ARRAY['Rainy week delayed 3 outdoor jobs','Customer complaint on Ascot rewire — return visit needed'],
  'Need better wet-weather contingency planning for field teams.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":15},{"title":"Website & Digital Marketing","progress":22},{"title":"Hire Sales Manager","progress":10}]'::jsonb,
  '[{"id":"p1","text":"Sign SimPRO contract and schedule onboarding","completed":true},{"id":"p2","text":"Review website wireframes with Sarah","completed":true},{"id":"p3","text":"Start drafting sales manager role ad","completed":true}]'::jsonb,
  '["Resolve Ascot customer complaint"]'::jsonb,
  '["Should we include a car allowance or company vehicle for the sales manager role?"]'::jsonb),
-- Week 8 (~Jan 19): Data export + sales mgr screening
(v_profile_id, v_user_id, (v_week_monday - 56)::date, (v_week_monday - 50)::date,
  true, NOW() - INTERVAL '55 days',
  6, 7, 'Data export taking longer than expected. Good progress otherwise.',
  ARRAY['SimPRO customer data export started — 2400 records','Website wireframe selected — modern clean design','3 strong sales manager CVs received on Seek'],
  ARRAY['Amy (admin) sick all week — invoicing fell behind','Data cleanup taking longer than planned'],
  'Cross-training the admin team is essential — one person sick shouldn''t stall invoicing.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":false},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":25},{"title":"Website & Digital Marketing","progress":32},{"title":"Hire Sales Manager","progress":18}]'::jsonb,
  '[{"id":"p1","text":"Complete customer data export and cleanup","completed":false},{"id":"p2","text":"Approve website wireframe selection","completed":true},{"id":"p3","text":"Screen sales manager applications","completed":true}]'::jsonb,
  '["Catch up on overdue invoices"]'::jsonb,
  '[]'::jsonb),
-- Week 7 (~Jan 26): Data migration underway + website design phase
(v_profile_id, v_user_id, (v_week_monday - 49)::date, (v_week_monday - 43)::date,
  true, NOW() - INTERVAL '48 days',
  7, 7, 'Data migration progressing. Website design phase starting.',
  ARRAY['SimPRO data import 50% complete','Website full design mockups received','Phone screened 3 sales manager candidates'],
  ARRAY['2 data import errors required manual fixes','Quote turnaround still averaging 4.5 days'],
  'Implementation projects need dedicated focus time — can''t just do them between jobs.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":35},{"title":"Website & Digital Marketing","progress":42},{"title":"Hire Sales Manager","progress":25}]'::jsonb,
  '[{"id":"p1","text":"Finish SimPRO data migration","completed":false},{"id":"p2","text":"Review website design mockups","completed":true},{"id":"p3","text":"Schedule sales manager interviews","completed":true}]'::jsonb,
  '["Order replacement MCBs for Southbank project"]'::jsonb,
  '[]'::jsonb),
-- Week 6 (~Feb 2): Migration complete! Website design approved.
(v_profile_id, v_user_id, (v_week_monday - 42)::date, (v_week_monday - 36)::date,
  true, NOW() - INTERVAL '41 days',
  8, 8, 'Website design approved. SimPRO data migration complete.',
  ARRAY['SimPRO data migration finished — 2400 records clean','Website design looks amazing — approved for build','Won $85K commercial fit-out in Fortitude Valley'],
  ARRAY['Dave called in sick 3 days','Quote backlog building up — 8 outstanding'],
  'Winning big commercial jobs validates our investment in professionalism and systems.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":45},{"title":"Website & Digital Marketing","progress":58},{"title":"Hire Sales Manager","progress":30}]'::jsonb,
  '[{"id":"p1","text":"Review website copy and case studies","completed":true},{"id":"p2","text":"Interview 2 sales manager candidates","completed":true},{"id":"p3","text":"Follow up on Fortitude Valley commercial quote","completed":true}]'::jsonb,
  '["Update insurance policy for larger commercial work"]'::jsonb,
  '["How should I structure commission for the sales manager?"]'::jsonb),
-- Week 5 (~Feb 9): SimPRO templates + website build
(v_profile_id, v_user_id, (v_week_monday - 35)::date, (v_week_monday - 29)::date,
  true, NOW() - INTERVAL '34 days',
  7, 7, 'Solid progress on all three rocks. Sales manager shortlisted.',
  ARRAY['SimPRO pricing templates configured','Sales manager shortlisted to 2 candidates','Completed $22K solar job with great feedback'],
  ARRAY['Lost a $45K quote to competitor on price','Supplier late on switchgear delivery again'],
  'Need to focus on value-based selling — competing on price is a losing game.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":false},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":52},{"title":"Website & Digital Marketing","progress":70},{"title":"Hire Sales Manager","progress":38}]'::jsonb,
  '[{"id":"p1","text":"Finalise website content review","completed":true},{"id":"p2","text":"Second round sales manager interviews","completed":true},{"id":"p3","text":"Push supplier on switchgear delivery timeline","completed":false}]'::jsonb,
  '["Send case study copy to web agency"]'::jsonb,
  '[]'::jsonb),
-- Week 4 (~Feb 16): Website almost ready + Google Ads prep
(v_profile_id, v_user_id, (v_week_monday - 28)::date, (v_week_monday - 22)::date,
  true, NOW() - INTERVAL '27 days',
  8, 8, 'Website launching next week! SimPRO mobile ready for testing.',
  ARRAY['Website in final QA — launching next Monday','SimPRO mobile app installed on 3 test devices','Google Ads campaign built and ready to go live'],
  ARRAY['Website had minor mobile display bugs — agency fixing','Google Ads initial CPL estimate higher than budgeted'],
  'Launch early, iterate fast — don''t wait for perfection.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":58},{"title":"Website & Digital Marketing","progress":85},{"title":"Hire Sales Manager","progress":42}]'::jsonb,
  '[{"id":"p1","text":"Final website QA and sign-off","completed":true},{"id":"p2","text":"Set up Google Ads tracking and conversion goals","completed":true},{"id":"p3","text":"Reference check top sales manager candidate","completed":false}]'::jsonb,
  '["Prepare team announcement about new website"]'::jsonb,
  '[]'::jsonb),
-- Week 3 (~Feb 23): Website launched! But lost 2 team members.
(v_profile_id, v_user_id, (v_week_monday - 21)::date, (v_week_monday - 15)::date,
  true, NOW() - INTERVAL '20 days',
  6, 6, 'Website live and Google Ads started — but lost Chris and Ryan.',
  ARRAY['New website launched — looks professional','Google Ads live — 12 leads in first week','Sales manager top candidate identified'],
  ARRAY['Chris and Ryan both resigned this week','Cash flow tight with SimPRO and website payments landing together'],
  'Losing 2 team members is a wake-up call. Need formal retention strategy beyond just wages.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":62},{"title":"Website & Digital Marketing","progress":100},{"title":"Hire Sales Manager","progress":48}]'::jsonb,
  '[{"id":"p1","text":"Prepare sales manager offer letter","completed":true},{"id":"p2","text":"Post electrician job ads on Seek","completed":true},{"id":"p3","text":"Review Google Ads first week performance","completed":true}]'::jsonb,
  '["Exit interviews with Chris and Ryan"]'::jsonb,
  '["What sign-on bonus should I offer to attract experienced electricians?"]'::jsonb),
-- Week 2 (~Mar 2): Quarterly review week
(v_profile_id, v_user_id, (v_week_monday - 14)::date, (v_week_monday - 8)::date,
  true, NOW() - INTERVAL '13 days',
  7, 8, 'Quarterly review completed. Clear Q4 plan. Google Ads pumping.',
  ARRAY['Q3 quarterly review completed — great clarity on next 90 days','Google Ads generating 30+ leads this month','Redistributed Chris and Ryan''s jobs across team'],
  ARRAY['Still 2 electricians short — team working overtime','SimPRO mobile training pushed back due to resignations'],
  'Quarterly reviews force you to step back and see the big picture. Worth every minute.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":65},{"title":"Website & Digital Marketing","progress":100},{"title":"Hire Sales Manager","progress":52}]'::jsonb,
  '[{"id":"p1","text":"Complete quarterly review pre-work","completed":true},{"id":"p2","text":"Pull Q3 financial data from Xero","completed":true},{"id":"p3","text":"Draft Q4 rocks and priorities","completed":true}]'::jsonb,
  '["Send employee referral bonus announcement to team"]'::jsonb,
  '[]'::jsonb),
-- Week 1 (~Mar 9): Sales manager accepted offer
(v_profile_id, v_user_id, (v_week_monday - 7)::date, (v_week_monday - 1)::date,
  true, NOW() - INTERVAL '6 days',
  8, 8, 'Sales manager signed! Google Ads hitting stride. Feeling optimistic.',
  ARRAY['Sales manager signed contract — starts April 1','Google Ads hit 38 leads this month at $82 CPL','First strata manager meeting booked for next week'],
  ARRAY['2 urgent callouts disrupted planned SimPRO training','Team fatigue — overtime catching up after resignations'],
  'Building capacity through hiring is the right move — can''t scale by working harder alone.',
  '[{"discipline":"Dashboard updated","completed":true},{"discipline":"90 day plan reviewed","completed":true},{"discipline":"Reviewed Financials","completed":true},{"discipline":"Team check-in","completed":true}]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":65},{"title":"Website & Digital Marketing","progress":100},{"title":"Hire Sales Manager","progress":55}]'::jsonb,
  '[{"id":"p1","text":"Send formal offer to sales manager","completed":true},{"id":"p2","text":"Schedule SimPRO mobile training for team","completed":false},{"id":"p3","text":"Call 3 strata managers for Q4 meetings","completed":true}]'::jsonb,
  '["Update employee handbook with referral bonus"]'::jsonb,
  '[]'::jsonb),
-- Week 0 (current week): In progress
(v_profile_id, v_user_id, v_week_monday::date, (v_week_monday + 6)::date,
  false, NULL,
  NULL, NULL, NULL,
  ARRAY[]::text[], ARRAY[]::text[], NULL,
  '[]'::jsonb,
  850000.00, 382500.00, 110500.00,
  '[{"title":"SimPRO Implementation","progress":65},{"title":"Website & Digital Marketing","progress":100},{"title":"Hire Sales Manager","progress":55}]'::jsonb,
  '[{"id":"p1","text":"SimPRO mobile training session with field team","completed":false},{"id":"p2","text":"Prepare strata maintenance proposal","completed":false},{"id":"p3","text":"Interview 2 electrician candidates from Seek","completed":false}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb);

-- ============================================================
-- 17. SESSION NOTES
-- ============================================================
INSERT INTO session_notes (business_id, coach_id, session_date, status, duration_minutes,
  discussion_points, client_commitments, coach_action_items, private_observations, next_session_prep) VALUES
(v_business_id, COALESCE(v_coach_id, v_user_id), (CURRENT_DATE - INTERVAL '30 days')::date, 'completed', 60,
  'Reviewed Q2 results and SimPRO progress. Discussed sales manager compensation. Google Ads strategy.',
  'James will: (1) Finalise sales manager JD, (2) Brief recruiter, (3) Set up SimPRO mobile for 3 trial users',
  'Coach to: send interview template and commission structure examples',
  'James is stretched thin but motivated. Sales manager hire is critical. Watch for burnout.',
  'Review sales manager candidate shortlist. Check SimPRO mobile adoption.'),
(v_business_id, COALESCE(v_coach_id, v_user_id), (CURRENT_DATE - INTERVAL '14 days')::date, 'completed', 60,
  'Quarterly review preparation. KPI dashboard review. Team departures discussion. Google Ads results.',
  'James will: (1) Complete pre-work, (2) Prepare team review notes, (3) Pull Q3 financial data',
  'Coach to: prepare quarterly review workshop agenda',
  'Losing 2 electricians is a significant setback. James handling it well but needs to move fast.',
  'Full quarterly review workshop - 4 hours blocked.');

-- ============================================================
-- 18. MESSAGES (column is "read" not "is_read")
-- ============================================================
INSERT INTO messages (business_id, sender_id, content, read, created_at) VALUES
(v_business_id, COALESCE(v_coach_id, v_user_id), 'Hi James, great session today. Here''s the sales manager interview template. Focus on: commercial sales experience, trades industry knowledge, and CRM proficiency.', true, NOW() - INTERVAL '28 days'),
(v_business_id, v_user_id, 'Thanks! Got the template. 15 applications on Seek already. Quick question — car allowance or company vehicle for the sales role?', true, NOW() - INTERVAL '27 days'),
(v_business_id, COALESCE(v_coach_id, v_user_id), 'I''d recommend car allowance ($15-18K) rather than company vehicle. Lower admin, more flexibility. Total comp: base $100-110K + allowance + commission = $140-160K for a good performer.', true, NOW() - INTERVAL '27 days'),
(v_business_id, v_user_id, 'Makes sense. Also — we lost Chris today. Resigned for more money. That''s 2 electricians gone this quarter. Feeling the pressure.', true, NOW() - INTERVAL '18 days'),
(v_business_id, COALESCE(v_coach_id, v_user_id), 'Tough but it happens in a tight market. Two things: (1) Exit interview — understand what really drove it. (2) Employee referral bonus — $2K per hire pays for itself. We''ll work on retention strategy in the quarterly review.', true, NOW() - INTERVAL '18 days'),
(v_business_id, v_user_id, 'Did the exit interview — it wasn''t just money, they wanted clearer career progression. Good insight. Positive note — Google Ads generated 38 leads in first 3 weeks!', true, NOW() - INTERVAL '5 days'),
(v_business_id, COALESCE(v_coach_id, v_user_id), 'That''s the ROI we love to see! Now make sure the conversion process is solid — how quickly are you responding to those leads? Looking forward to the quarterly review.', true, NOW() - INTERVAL '4 days');

-- ============================================================
-- 19. PLAN SNAPSHOT (only if table exists)
-- ============================================================
IF v_has_plan_snapshots THEN
  INSERT INTO plan_snapshots (business_id, user_id, version_number, snapshot_type, quarter, year, label, plan_data)
  VALUES (
    v_profile_id::text, v_user_id, 1, 'goals_wizard_complete', 'Q3', 2026,
    'Goals Wizard Complete - FY2026',
    '{"vision":"To be Queensland''s most trusted electrical contracting company by 2029","mission":"We deliver safe, professional electrical solutions","coreValues":[{"title":"Safety First"},{"title":"Reliability"},{"title":"Technical Excellence"},{"title":"Integrity"},{"title":"Team Growth"}],"financialTargets":{"year1":{"revenue":3400000,"grossProfit":1530000,"netProfit":442000},"year2":{"revenue":4500000,"grossProfit":2115000,"netProfit":675000},"year3":{"revenue":5500000,"grossProfit":2640000,"netProfit":990000}}}'::jsonb
  );
END IF;

-- ============================================================
-- 20. FINANCIAL FORECAST (FY2026 = Jul 2025 - Jun 2026)
-- ============================================================
-- Wizard session first (referenced by forecast)
INSERT INTO forecast_wizard_sessions (
  id, forecast_id, user_id, business_id, started_at, completed_at,
  mode, current_step, steps_completed, years_selected
)
VALUES (
  gen_random_uuid(), NULL, v_user_id, v_profile_id,
  NOW() - INTERVAL '65 days', NOW() - INTERVAL '64 days',
  'guided', 'complete',
  '{"setup": true, "team": true, "costs": true, "investments": true, "review": true}'::jsonb,
  ARRAY[1, 2, 3]
)
RETURNING id INTO v_wizard_session_id;

-- Main forecast record
INSERT INTO financial_forecasts (
  id, business_id, user_id, name, description,
  fiscal_year, year_type,
  actual_start_month, actual_end_month,
  forecast_start_month, forecast_end_month,
  baseline_start_month, baseline_end_month,
  is_completed, wizard_completed_at,
  revenue_goal, gross_profit_goal, net_profit_goal,
  goal_source,
  revenue_distribution_method,
  cogs_percentage,
  opex_wages, opex_fixed, opex_variable, opex_other,
  payroll_frequency, pay_day, superannuation_rate,
  forecast_type, version_number, is_active, is_base_forecast,
  wizard_session_id,
  assumptions,
  five_ways_data,
  wizard_opex_categories,
  wizard_team_summary,
  forecast_duration
)
VALUES (
  gen_random_uuid(), v_profile_id, v_user_id,
  'FY2026 Growth Forecast',
  'Primary forecast for Precision Electrical Group - targeting $3.4M revenue with 45% gross margin',
  2026, 'FY',
  '2025-07', '2026-02',
  '2026-03', '2026-06',
  '2024-07', '2025-06',
  true, NOW() - INTERVAL '64 days',
  3400000, 1530000, 442000,
  'annual_plan',
  'seasonal',
  0.5650,
  322000, 199000, 83000, 246000,
  'fortnightly', 'thursday', 0.1150,
  'forecast', 1, true, true,
  v_wizard_session_id,
  '{
    "version": 1,
    "createdAt": "2026-01-15T09:00:00Z",
    "updatedAt": "2026-03-15T14:30:00Z",
    "industry": "trade-services",
    "employeeCount": 15,
    "fiscalYearStart": "07",
    "goals": {
      "year1": {"revenue": 3400000, "grossProfitPct": 45, "netProfitPct": 13},
      "year2": {"revenue": 4250000, "grossProfitPct": 47, "netProfitPct": 15},
      "year3": {"revenue": 5500000, "grossProfitPct": 48, "netProfitPct": 17}
    },
    "revenue": {
      "lines": [
        {
          "accountId": "residential",
          "accountName": "Residential & Emergency Services",
          "priorYearTotal": 1153000,
          "growthType": "percentage",
          "growthPct": 17,
          "notes": "Core residential market + new emergency service launching Q4",
          "year1Monthly": {"2025-07":102000,"2025-08":109000,"2025-09":121000,"2025-10":131000,"2025-11":139000,"2025-12":123000,"2026-01":106000,"2026-02":123000,"2026-03":136000,"2026-04":148000,"2026-05":155000,"2026-06":143000}
        },
        {
          "accountId": "commercial",
          "accountName": "Commercial & Maintenance",
          "priorYearTotal": 948000,
          "growthType": "percentage",
          "growthPct": 22,
          "notes": "Growth from strata contracts and commercial tenders",
          "year1Monthly": {"2025-07":76000,"2025-08":81000,"2025-09":90000,"2025-10":97000,"2025-11":103000,"2025-12":92000,"2026-01":79000,"2026-02":92000,"2026-03":101000,"2026-04":110000,"2026-05":116000,"2026-06":107000}
        },
        {
          "accountId": "solar",
          "accountName": "Solar, Battery & EV Installations",
          "priorYearTotal": 500000,
          "growthType": "percentage",
          "growthPct": 38,
          "notes": "Fastest growing segment - solar boom + EV charger demand",
          "year1Monthly": {"2025-07":40000,"2025-08":42000,"2025-09":47000,"2025-10":50000,"2025-11":53000,"2025-12":47000,"2026-01":40000,"2026-02":47000,"2026-03":53000,"2026-04":57000,"2026-05":59000,"2026-06":55000}
        }
      ],
      "seasonalityPattern": [7.0, 7.3, 7.9, 8.5, 9.2, 8.2, 7.5, 8.1, 8.7, 9.2, 9.5, 9.0],
      "seasonalitySource": "manual"
    },
    "cogs": {
      "lines": [
        {"accountId": "materials", "accountName": "Materials & Supplies", "priorYearTotal": 669000, "costBehavior": "variable", "percentOfRevenue": 23.5, "notes": "Cable, switchgear, MCBs, solar panels, batteries"},
        {"accountId": "direct-labour", "accountName": "Direct Labour - Field Staff", "priorYearTotal": 595000, "costBehavior": "variable", "percentOfRevenue": 22, "notes": "8 field electricians + 1 apprentice"},
        {"accountId": "subcontractors", "accountName": "Subcontractors", "priorYearTotal": 107000, "costBehavior": "variable", "percentOfRevenue": 4, "notes": "Specialist subcontractors for large commercial jobs"},
        {"accountId": "vehicle-equipment", "accountName": "Vehicle, Equipment & Field Super", "priorYearTotal": 188000, "costBehavior": "variable", "percentOfRevenue": 7, "notes": "Fleet fuel, vehicle maintenance, power tools, PPE, field super"}
      ],
      "overallCogsPct": 56.5
    },
    "team": {
      "existingTeam": [
        {"employeeId": "emp-1", "name": "James Mitchell", "role": "Owner / Director", "employmentType": "full-time", "currentSalary": 204000, "hoursPerWeek": 40, "salaryIncreasePct": 3, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-2", "name": "Sarah Chen", "role": "Office Manager", "employmentType": "full-time", "currentSalary": 75000, "hoursPerWeek": 38, "salaryIncreasePct": 4, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-3", "name": "Amy Watson", "role": "Admin Assistant", "employmentType": "part-time", "currentSalary": 52000, "hoursPerWeek": 30, "salaryIncreasePct": 3, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-4", "name": "Mike Torres", "role": "Lead Electrician", "employmentType": "full-time", "currentSalary": 105000, "hoursPerWeek": 40, "salaryIncreasePct": 5, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-5", "name": "Dave Kowalski", "role": "Senior Electrician", "employmentType": "full-time", "currentSalary": 92000, "hoursPerWeek": 40, "salaryIncreasePct": 4, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-6", "name": "Ben Park", "role": "Electrician", "employmentType": "full-time", "currentSalary": 82000, "hoursPerWeek": 40, "salaryIncreasePct": 3, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-7", "name": "Jake Nguyen", "role": "Electrician", "employmentType": "full-time", "currentSalary": 82000, "hoursPerWeek": 40, "salaryIncreasePct": 3, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-8", "name": "Sam Wilson", "role": "Electrician", "employmentType": "full-time", "currentSalary": 82000, "hoursPerWeek": 40, "salaryIncreasePct": 3, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-9", "name": "Marcus Brown", "role": "Electrician", "employmentType": "full-time", "currentSalary": 78000, "hoursPerWeek": 40, "salaryIncreasePct": 4, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-10", "name": "Luke Henderson", "role": "Junior Electrician", "employmentType": "full-time", "currentSalary": 68000, "hoursPerWeek": 40, "salaryIncreasePct": 5, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false},
        {"employeeId": "emp-11", "name": "Tom Blake", "role": "3rd Year Apprentice", "employmentType": "full-time", "currentSalary": 48000, "hoursPerWeek": 38, "salaryIncreasePct": 8, "increaseMonth": "2026-07", "includeInForecast": true, "isFromXero": false}
      ],
      "plannedHires": [
        {"id": "hire-1", "role": "Sales Manager", "employmentType": "full-time", "salary": 110000, "hoursPerWeek": 40, "startMonth": "2026-04", "notes": "Dedicated sales role to free up James from quoting"},
        {"id": "hire-2", "role": "Licensed Electrician", "employmentType": "full-time", "salary": 82000, "hoursPerWeek": 40, "startMonth": "2026-04", "notes": "Replace departed electrician + handle growth"},
        {"id": "hire-3", "role": "Licensed Electrician", "employmentType": "full-time", "salary": 82000, "hoursPerWeek": 40, "startMonth": "2026-05", "notes": "Growth hire for solar division expansion"}
      ],
      "departures": [
        {"id": "dep-1", "teamMemberId": "emp-departed-1", "endMonth": "2026-02", "notes": "Chris Woods - resigned for mining job"},
        {"id": "dep-2", "teamMemberId": "emp-departed-2", "endMonth": "2026-02", "notes": "Ryan Cooper - relocated interstate"}
      ],
      "bonuses": [],
      "commissions": [],
      "superannuationPct": 12,
      "workCoverPct": 1.5,
      "payrollTaxPct": 4.85,
      "payrollTaxThreshold": 1300000
    },
    "opex": {
      "lines": [
        {"accountId": "wages-admin", "accountName": "Wages & Salaries - Admin/Office", "priorYearTotal": 277000, "costBehavior": "fixed", "monthlyAmount": 25000, "annualIncreasePct": 3, "notes": "Sales manager ($9.2K/mo) starts April 2026"},
        {"accountId": "rent-insurance", "accountName": "Rent, Insurance & Utilities", "priorYearTotal": 187500, "costBehavior": "fixed", "monthlyAmount": 16800, "annualIncreasePct": 3, "notes": "Brendale workshop lease + workers comp + public liability"},
        {"accountId": "marketing", "accountName": "Marketing & Professional Services", "priorYearTotal": 79800, "costBehavior": "fixed", "monthlyAmount": 12000, "annualIncreasePct": 0, "notes": "Google Ads ($3K/mo) + agency retainer from Nov 2025"},
        {"accountId": "it-software", "accountName": "IT, Software & Communications", "priorYearTotal": 49500, "costBehavior": "fixed", "monthlyAmount": 7000, "annualIncreasePct": 3, "isSubscription": true, "notes": "SimPRO subscription ($1.8K/mo) added Dec 2025"},
        {"accountId": "owner-remu", "accountName": "Owner Remuneration & Super", "priorYearTotal": 207000, "costBehavior": "fixed", "monthlyAmount": 18500, "annualIncreasePct": 0, "notes": "$204K base + $18.7K super"},
        {"accountId": "depreciation", "accountName": "Depreciation & Other Operating", "priorYearTotal": 106500, "costBehavior": "fixed", "monthlyAmount": 10000, "annualIncreasePct": 3, "notes": "Fleet depreciation $3.5K/mo + sundry operating"}
      ]
    },
    "capex": {
      "items": [
        {"id": "capex-1", "name": "New service van (Ford Transit)", "amount": 65000, "month": "2026-04", "category": "vehicle", "notes": "For new electrician hire"},
        {"id": "capex-2", "name": "Solar installation equipment", "amount": 28000, "month": "2026-05", "category": "equipment", "notes": "Racking, crimpers, DC isolators for solar division"},
        {"id": "capex-3", "name": "SimPRO mobile tablets (x8)", "amount": 12000, "month": "2025-12", "category": "technology", "notes": "iPad Pro for field crew - SimPRO mobile app"}
      ]
    },
    "subscriptions": {
      "auditedAt": "2026-01-20T10:00:00Z",
      "accountsIncluded": ["it-software"],
      "vendorCount": 12,
      "totalAnnual": 71628,
      "essentialAnnual": 50628,
      "reviewAnnual": 12000,
      "reduceAnnual": 6000,
      "cancelAnnual": 3000,
      "potentialSavings": 9000,
      "costPerEmployee": 4775
    },
    "growthRate": 21.5,
    "grossMarginTarget": 45,
    "netMarginTarget": 13,
    "headcountGrowth": {"current": 15, "target": 20},
    "keyDrivers": ["Google Ads lead generation", "Sales manager hire", "Solar boom", "Strata contracts"],
    "risks": ["Electrician shortage", "Material cost inflation", "Construction slowdown"],
    "seasonality": {"peak": ["Oct", "Nov", "Apr", "May"], "low": ["Jan", "Jul"]}
  }'::jsonb,
  '{"leads":{"current":125,"target":160},"conversionRate":{"current":0.62,"target":0.68},"transactions":{"current":1800,"target":2200},"avgSaleValue":{"current":1050,"target":1214},"margin":{"current":0.42,"target":0.45},"calculatedRevenue":3400000,"calculatedGrossProfit":1530000,"industryId":"trade-services"}'::jsonb,
  '[{"id":"rent","name":"Rent, Insurance & Utilities","priorYearAmount":190000,"forecastAmount":202800,"method":"fixed","notes":"Brendale workshop lease + workers comp"},{"id":"marketing","name":"Marketing & Professional Services","priorYearAmount":84000,"forecastAmount":133500,"method":"stepped","notes":"Google Ads + agency retainer from Oct 2025"},{"id":"it","name":"IT, Software & Communications","priorYearAmount":51600,"forecastAmount":82400,"method":"stepped","notes":"SimPRO added Dec 2025"},{"id":"owner","name":"Owner Remuneration & Super","priorYearAmount":210000,"forecastAmount":222000,"method":"fixed","notes":"$204K base + $18.7K super"},{"id":"depreciation","name":"Depreciation & Other Operating","priorYearAmount":109200,"forecastAmount":121200,"method":"fixed","notes":"Fleet depreciation + sundry"}]'::jsonb,
  '{"totalWagesCOGS":746000,"totalWagesOpEx":441000,"teamCount":16}'::jsonb,
  3
)
RETURNING id INTO v_forecast_id;

-- Update wizard session with forecast_id
UPDATE forecast_wizard_sessions SET forecast_id = v_forecast_id WHERE id = v_wizard_session_id;

-- ============================================================
-- 20a. FORECAST P&L LINES
-- Month format: "YYYY-MM". Baseline (FY2025) + Actuals (FY2026 YTD) in actual_months.
-- Forecast (remaining FY2026) in forecast_months.
-- ============================================================

-- REVENUE LINES
INSERT INTO forecast_pl_lines (forecast_id, account_name, account_type, account_class, category, subcategory, sort_order, actual_months, forecast_months, is_manual, forecast_method) VALUES
-- Residential & Emergency Services (~47% of revenue)
(v_forecast_id, 'Residential & Emergency Services', 'REVENUE', 'REVENUE', 'Revenue', 'Services', 1,
  '{"2024-07":82000,"2024-08":86000,"2024-09":92000,"2024-10":98000,"2024-11":105000,"2024-12":96000,"2025-01":88000,"2025-02":94000,"2025-03":100000,"2025-04":104000,"2025-05":106000,"2025-06":102000,"2025-07":102000,"2025-08":109000,"2025-09":121000,"2025-10":131000,"2025-11":139000,"2025-12":123000,"2026-01":106000,"2026-02":123000}'::jsonb,
  '{"2026-03":136000,"2026-04":148000,"2026-05":155000,"2026-06":143000}'::jsonb,
  true, '{"method":"seasonal","growthRate":17}'::jsonb),

-- Commercial & Maintenance (~35% of revenue)
(v_forecast_id, 'Commercial & Maintenance', 'REVENUE', 'REVENUE', 'Revenue', 'Services', 2,
  '{"2024-07":65000,"2024-08":69000,"2024-09":75000,"2024-10":81000,"2024-11":87000,"2024-12":78000,"2025-01":71000,"2025-02":76000,"2025-03":82000,"2025-04":88000,"2025-05":90000,"2025-06":86000,"2025-07":76000,"2025-08":81000,"2025-09":90000,"2025-10":97000,"2025-11":103000,"2025-12":92000,"2026-01":79000,"2026-02":92000}'::jsonb,
  '{"2026-03":101000,"2026-04":110000,"2026-05":116000,"2026-06":107000}'::jsonb,
  true, '{"method":"seasonal","growthRate":22}'::jsonb),

-- Solar, Battery & EV (~18% of revenue, fastest growth)
(v_forecast_id, 'Solar, Battery & EV Installations', 'REVENUE', 'REVENUE', 'Revenue', 'Services', 3,
  '{"2024-07":34000,"2024-08":36000,"2024-09":38000,"2024-10":42000,"2024-11":46000,"2024-12":40000,"2025-01":36000,"2025-02":40000,"2025-03":44000,"2025-04":48000,"2025-05":50000,"2025-06":46000,"2025-07":40000,"2025-08":42000,"2025-09":47000,"2025-10":50000,"2025-11":53000,"2025-12":47000,"2026-01":40000,"2026-02":47000}'::jsonb,
  '{"2026-03":53000,"2026-04":57000,"2026-05":59000,"2026-06":55000}'::jsonb,
  true, '{"method":"seasonal","growthRate":38}'::jsonb);

-- COGS LINES
INSERT INTO forecast_pl_lines (forecast_id, account_name, account_type, account_class, category, subcategory, sort_order, actual_months, forecast_months, is_manual, forecast_method) VALUES
-- Materials & Supplies (~25% of revenue baseline, improving to 23.5%)
(v_forecast_id, 'Materials & Supplies', 'EXPENSE', 'EXPENSE', 'COGS', 'Materials', 10,
  '{"2024-07":47000,"2024-08":49000,"2024-09":53000,"2024-10":57000,"2024-11":61000,"2024-12":55000,"2025-01":50000,"2025-02":54000,"2025-03":58000,"2025-04":62000,"2025-05":63000,"2025-06":60000,"2025-07":51000,"2025-08":55000,"2025-09":61000,"2025-10":65000,"2025-11":69000,"2025-12":62000,"2026-01":53000,"2026-02":62000}'::jsonb,
  '{"2026-03":68000,"2026-04":74000,"2026-05":78000,"2026-06":72000}'::jsonb,
  true, '{"method":"percentage","baseRate":23.5}'::jsonb),

-- Direct Labour (field electricians, ~22% of revenue)
(v_forecast_id, 'Direct Labour - Field Staff', 'EXPENSE', 'EXPENSE', 'COGS', 'Labour', 11,
  '{"2024-07":41000,"2024-08":43000,"2024-09":47000,"2024-10":51000,"2024-11":55000,"2024-12":49000,"2025-01":44000,"2025-02":48000,"2025-03":51000,"2025-04":55000,"2025-05":57000,"2025-06":54000,"2025-07":48000,"2025-08":51000,"2025-09":57000,"2025-10":61000,"2025-11":65000,"2025-12":58000,"2026-01":50000,"2026-02":58000}'::jsonb,
  '{"2026-03":64000,"2026-04":69000,"2026-05":73000,"2026-06":67000}'::jsonb,
  true, '{"method":"percentage","baseRate":22}'::jsonb),

-- Subcontractors (~4% of revenue)
(v_forecast_id, 'Subcontractors', 'EXPENSE', 'EXPENSE', 'COGS', 'Subcontractors', 12,
  '{"2024-07":7500,"2024-08":8000,"2024-09":8500,"2024-10":9000,"2024-11":10000,"2024-12":9000,"2025-01":8000,"2025-02":8500,"2025-03":9000,"2025-04":10000,"2025-05":10000,"2025-06":9500,"2025-07":9000,"2025-08":9500,"2025-09":10500,"2025-10":11000,"2025-11":12000,"2025-12":10500,"2026-01":9000,"2026-02":10500}'::jsonb,
  '{"2026-03":12000,"2026-04":13000,"2026-05":13500,"2026-06":12500}'::jsonb,
  true, '{"method":"percentage","baseRate":4}'::jsonb),

-- Vehicle, Equipment & Field Super (~7% of revenue)
(v_forecast_id, 'Vehicle, Equipment & Field Super', 'EXPENSE', 'EXPENSE', 'COGS', 'Other Direct', 13,
  '{"2024-07":13000,"2024-08":14000,"2024-09":15000,"2024-10":16000,"2024-11":17000,"2024-12":15500,"2025-01":14000,"2025-02":15000,"2025-03":16000,"2025-04":17500,"2025-05":18000,"2025-06":17000,"2025-07":15000,"2025-08":16000,"2025-09":18000,"2025-10":19500,"2025-11":21000,"2025-12":18500,"2026-01":16000,"2026-02":18500}'::jsonb,
  '{"2026-03":20500,"2026-04":22000,"2026-05":23500,"2026-06":21500}'::jsonb,
  true, '{"method":"percentage","baseRate":7}'::jsonb);

-- OPERATING EXPENSE LINES
INSERT INTO forecast_pl_lines (forecast_id, account_name, account_type, account_class, category, subcategory, sort_order, actual_months, forecast_months, is_manual, forecast_method) VALUES
-- Admin & Office Wages (includes owner salary)
(v_forecast_id, 'Wages & Salaries - Admin/Office', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'People', 20,
  '{"2024-07":22500,"2024-08":22500,"2024-09":23000,"2024-10":23000,"2024-11":23000,"2024-12":23500,"2025-01":23000,"2025-02":23000,"2025-03":23000,"2025-04":23500,"2025-05":23500,"2025-06":23500,"2025-07":23500,"2025-08":23500,"2025-09":24000,"2025-10":24000,"2025-11":24000,"2025-12":24500,"2026-01":25000,"2026-02":25000}'::jsonb,
  '{"2026-03":25500,"2026-04":34000,"2026-05":34500,"2026-06":34500}'::jsonb,
  true, '{"method":"fixed","note":"Sales manager ($9.2K/mo) starts April 2026"}'::jsonb),

-- Rent, Insurance & Utilities
(v_forecast_id, 'Rent, Insurance & Utilities', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'Premises', 21,
  '{"2024-07":15200,"2024-08":15200,"2024-09":15200,"2024-10":15500,"2024-11":15500,"2024-12":15500,"2025-01":15800,"2025-02":15800,"2025-03":15800,"2025-04":16000,"2025-05":16000,"2025-06":16000,"2025-07":16200,"2025-08":16200,"2025-09":16200,"2025-10":16500,"2025-11":16500,"2025-12":16500,"2026-01":16800,"2026-02":16800}'::jsonb,
  '{"2026-03":16800,"2026-04":17000,"2026-05":17000,"2026-06":17000}'::jsonb,
  true, '{"method":"fixed","note":"Brendale workshop lease + workers comp + public liability"}'::jsonb),

-- Marketing & Professional Services
(v_forecast_id, 'Marketing & Professional Services', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'Marketing', 22,
  '{"2024-07":5800,"2024-08":6000,"2024-09":6200,"2024-10":6500,"2024-11":6800,"2024-12":6200,"2025-01":6000,"2025-02":6500,"2025-03":7000,"2025-04":7500,"2025-05":7800,"2025-06":7500,"2025-07":7200,"2025-08":7500,"2025-09":8000,"2025-10":9500,"2025-11":10000,"2025-12":10500,"2026-01":11000,"2026-02":12000}'::jsonb,
  '{"2026-03":12500,"2026-04":12500,"2026-05":12500,"2026-06":12000}'::jsonb,
  true, '{"method":"stepped","note":"Google Ads launched Oct 2025 ($3K/mo). Agency retainer from Nov."}'::jsonb),

-- IT, Software & Communications
(v_forecast_id, 'IT, Software & Communications', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'Technology', 23,
  '{"2024-07":3800,"2024-08":3800,"2024-09":3800,"2024-10":4000,"2024-11":4000,"2024-12":4000,"2025-01":4200,"2025-02":4200,"2025-03":4200,"2025-04":4500,"2025-05":4500,"2025-06":4500,"2025-07":4800,"2025-08":4800,"2025-09":5000,"2025-10":5200,"2025-11":5500,"2025-12":6800,"2026-01":7000,"2026-02":7000}'::jsonb,
  '{"2026-03":7200,"2026-04":7200,"2026-05":7200,"2026-06":7200}'::jsonb,
  true, '{"method":"stepped","note":"SimPRO subscription ($1.8K/mo) added Dec 2025"}'::jsonb),

-- Owner Remuneration & Super
(v_forecast_id, 'Owner Remuneration & Super', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'People', 24,
  '{"2024-07":17000,"2024-08":17000,"2024-09":17000,"2024-10":17000,"2024-11":17000,"2024-12":17000,"2025-01":17500,"2025-02":17500,"2025-03":17500,"2025-04":17500,"2025-05":17500,"2025-06":17500,"2025-07":18000,"2025-08":18000,"2025-09":18000,"2025-10":18000,"2025-11":18000,"2025-12":18000,"2026-01":18500,"2026-02":18500}'::jsonb,
  '{"2026-03":18500,"2026-04":18500,"2026-05":18500,"2026-06":18500}'::jsonb,
  true, '{"method":"fixed","note":"$204K base + $18.7K super"}'::jsonb),

-- Depreciation & Other Operating
(v_forecast_id, 'Depreciation & Other Operating', 'OVERHEADS', 'EXPENSE', 'Operating Expenses', 'Other', 25,
  '{"2024-07":8500,"2024-08":8500,"2024-09":8500,"2024-10":8800,"2024-11":8800,"2024-12":8800,"2025-01":9000,"2025-02":9000,"2025-03":9000,"2025-04":9200,"2025-05":9200,"2025-06":9200,"2025-07":9500,"2025-08":9500,"2025-09":9500,"2025-10":9800,"2025-11":9800,"2025-12":9800,"2026-01":10000,"2026-02":10000}'::jsonb,
  '{"2026-03":10200,"2026-04":10200,"2026-05":10200,"2026-06":10200}'::jsonb,
  true, '{"method":"fixed","note":"Fleet depreciation $3.5K/mo + sundry operating"}'::jsonb);

-- ============================================================
-- 20b. FORECAST EMPLOYEES (team of 15 + planned hires)
-- ============================================================
INSERT INTO forecast_employees (forecast_id, employee_name, position, category, classification, start_date, annual_salary, hourly_rate, standard_hours_per_week, super_rate, is_active, is_planned_hire, sort_order) VALUES
-- Owner
(v_forecast_id, 'James Mitchell', 'Owner / Director', 'Wages Admin', 'opex', '2015-03-01', 204000, NULL, 40, 11.50, true, false, 1),
-- Office / Admin
(v_forecast_id, 'Sarah Chen', 'Office Manager', 'Wages Admin', 'opex', '2022-06-15', 75000, NULL, 38, 11.50, true, false, 2),
(v_forecast_id, 'Amy Watson', 'Admin Assistant', 'Wages Admin', 'opex', '2024-02-01', 52000, NULL, 30, 11.50, true, false, 3),
-- Field Electricians (COGS)
(v_forecast_id, 'Mike Torres', 'Lead Electrician', 'Wages COGS', 'cogs', '2018-01-15', 105000, NULL, 40, 11.50, true, false, 4),
(v_forecast_id, 'Dave Kowalski', 'Senior Electrician', 'Wages COGS', 'cogs', '2019-08-01', 92000, NULL, 40, 11.50, true, false, 5),
(v_forecast_id, 'Ben Park', 'Electrician', 'Wages COGS', 'cogs', '2021-03-15', 82000, NULL, 40, 11.50, true, false, 6),
(v_forecast_id, 'Jake Nguyen', 'Electrician', 'Wages COGS', 'cogs', '2021-11-01', 82000, NULL, 40, 11.50, true, false, 7),
(v_forecast_id, 'Sam Wilson', 'Electrician', 'Wages COGS', 'cogs', '2022-04-15', 82000, NULL, 40, 11.50, true, false, 8),
(v_forecast_id, 'Marcus Brown', 'Electrician', 'Wages COGS', 'cogs', '2023-02-01', 78000, NULL, 40, 11.50, true, false, 9),
(v_forecast_id, 'Luke Henderson', 'Junior Electrician', 'Wages COGS', 'cogs', '2023-09-01', 68000, NULL, 40, 11.50, true, false, 10),
(v_forecast_id, 'Tom Blake', '3rd Year Apprentice', 'Wages COGS', 'cogs', '2023-07-01', 48000, NULL, 38, 11.50, true, false, 11),
-- Departed staff (end_date set)
(v_forecast_id, 'Chris Woods', 'Electrician (Resigned)', 'Wages COGS', 'cogs', '2020-06-01', 82000, NULL, 40, 11.50, false, false, 12),
(v_forecast_id, 'Ryan Cooper', 'Electrician (Resigned)', 'Wages COGS', 'cogs', '2021-09-01', 78000, NULL, 40, 11.50, false, false, 13),
-- Planned hires
(v_forecast_id, 'TBH - Sales Manager', 'Sales Manager', 'Wages Admin', 'opex', '2026-04-14', 110000, NULL, 40, 11.50, true, true, 14),
(v_forecast_id, 'TBH - Licensed Electrician #1', 'Electrician', 'Wages COGS', 'cogs', '2026-04-01', 82000, NULL, 40, 11.50, true, true, 15),
(v_forecast_id, 'TBH - Licensed Electrician #2', 'Electrician', 'Wages COGS', 'cogs', '2026-05-01', 82000, NULL, 40, 11.50, true, true, 16);

-- Set end dates for departed staff
UPDATE forecast_employees SET end_date = '2026-02-21' WHERE forecast_id = v_forecast_id AND employee_name = 'Chris Woods';
UPDATE forecast_employees SET end_date = '2026-02-14' WHERE forecast_id = v_forecast_id AND employee_name = 'Ryan Cooper';

-- ============================================================
-- 20c. FORECAST PAYROLL SUMMARY (monthly aggregates)
-- ============================================================
INSERT INTO forecast_payroll_summary (forecast_id, pay_runs_per_month, wages_admin_monthly, wages_cogs_monthly, superannuation_monthly)
VALUES (
  v_forecast_id,
  '{"2025-07":2,"2025-08":2,"2025-09":2,"2025-10":3,"2025-11":2,"2025-12":2,"2026-01":2,"2026-02":2,"2026-03":2,"2026-04":2,"2026-05":3,"2026-06":2}'::jsonb,
  '{"2025-07":23500,"2025-08":23500,"2025-09":24000,"2025-10":24000,"2025-11":24000,"2025-12":24500,"2026-01":25000,"2026-02":25000,"2026-03":25500,"2026-04":34000,"2026-05":34500,"2026-06":34500}'::jsonb,
  '{"2025-07":48000,"2025-08":51000,"2025-09":57000,"2025-10":61000,"2025-11":65000,"2025-12":58000,"2026-01":50000,"2026-02":58000,"2026-03":64000,"2026-04":69000,"2026-05":73000,"2026-06":67000}'::jsonb,
  '{"2025-07":8200,"2025-08":8600,"2025-09":9300,"2025-10":9800,"2025-11":10200,"2025-12":9500,"2026-01":8600,"2026-02":9500,"2026-03":10300,"2026-04":11800,"2026-05":12400,"2026-06":11700}'::jsonb
);

-- ============================================================
-- 20d. FORECAST YEARS (3-year outlook)
-- ============================================================
INSERT INTO forecast_years (forecast_id, user_id, business_id, year_number, fiscal_year, granularity, revenue_target, revenue_growth_percent, gross_margin_percent, net_profit_percent, headcount_start, headcount_end, headcount_change, team_cost_estimate, opex_estimate, notes) VALUES
(v_forecast_id, v_user_id, v_profile_id, 1, 2026, 'monthly', 3400000, 21.5, 45.0, 13.0, 15, 20, 5, 1024000, 990000,
  'Year 1: Hire sales manager + 2 electricians. Deploy SimPRO. Launch emergency service. Google Ads at $3K/mo.'),
(v_forecast_id, v_user_id, v_profile_id, 2, 2027, 'quarterly', 4500000, 32.4, 47.0, 15.0, 20, 25, 5, 1350000, 1150000,
  'Year 2: Expand solar division (2 dedicated electricians + designer). Win 5 strata contracts. Launch smart home automation.'),
(v_forecast_id, v_user_id, v_profile_id, 3, 2028, 'annual', 5500000, 22.2, 48.0, 18.0, 25, 30, 5, 1650000, 1280000,
  'Year 3: Sunshine Coast satellite office. ISO 9001 certification. Full 24/7 service. 30 staff target.');

-- ============================================================
-- 20e. FORECAST INVESTMENTS (strategic CapEx & OpEx)
-- ============================================================
INSERT INTO forecast_investments (forecast_id, user_id, business_id, name, description, investment_type, amount, start_month, is_recurring, recurrence, end_month, pl_account_category, reasoning) VALUES
(v_forecast_id, v_user_id, v_profile_id, 'SimPRO Field Service Software', 'Annual licence + implementation for scheduling, quoting, invoicing, job tracking', 'opex', 1800, '2025-12', true, 'monthly', '2026-06', 'Operating Expenses', 'Replacing paper-based system. ROI: save $50K/year in admin time, reduce scheduling errors.'),
(v_forecast_id, v_user_id, v_profile_id, 'Website & Digital Marketing', 'New website build ($15K one-off) + Google Ads ($3K/mo ongoing)', 'opex', 15000, '2025-10', false, NULL, NULL, 'Operating Expenses', 'Current website generates 15 leads/mo. Target: 50+ leads/mo within 3 months of launch.'),
(v_forecast_id, v_user_id, v_profile_id, 'Google Ads - Ongoing', 'Monthly Google Ads spend for lead generation', 'opex', 3000, '2025-11', true, 'monthly', '2026-06', 'Operating Expenses', 'Targeting residential + solar keywords in Brisbane. Expected 30+ leads/month at $100 CPL.'),
(v_forecast_id, v_user_id, v_profile_id, 'New Service Vehicle (Van #8)', 'Isuzu NPR fitted out for new electrician', 'capex', 65000, '2026-04', false, NULL, NULL, NULL, 'Required for replacement hire. Depreciate over 5 years = $13K/year impact on P&L.'),
(v_forecast_id, v_user_id, v_profile_id, 'Solar Test Equipment', 'IV curve tracer + thermal imaging camera for solar division', 'capex', 18000, '2026-01', false, NULL, NULL, NULL, 'Required for solar division expansion. Enables in-house testing instead of outsourcing ($8K/year savings).'),
(v_forecast_id, v_user_id, v_profile_id, 'Sales Manager Recruitment', 'Recruiter fees + onboarding costs', 'opex', 22000, '2026-03', false, NULL, NULL, 'Operating Expenses', 'Recruiter fee ~$18K (15% of $120K package) + $4K onboarding/training costs.');

-- ============================================================
-- 20f. FORECAST SCENARIO (Baseline)
-- ============================================================
INSERT INTO forecast_scenarios (base_forecast_id, name, description, assumption_overrides, is_active, created_by)
VALUES (
  v_forecast_id,
  'Baseline - Conservative',
  'Current trajectory with planned hires and investments. Assumes 2 electrician departures are replaced by April.',
  '{"revenueGrowth": 21.5, "grossMargin": 43.5, "notes": "Conservative - based on current run rate with moderate uplift from Google Ads and sales manager"}'::jsonb,
  true,
  v_user_id
);

INSERT INTO forecast_scenarios (base_forecast_id, name, description, assumption_overrides, is_active, created_by)
VALUES (
  v_forecast_id,
  'Optimistic - Full Growth',
  'All hires land on time, strata contracts close Q4, emergency service launches May. Google Ads scales to $5K/mo.',
  '{"revenueGrowth": 28, "grossMargin": 45, "notes": "Optimistic - assumes all growth initiatives land on schedule"}'::jsonb,
  false,
  v_user_id
);

-- ============================================================
-- 20g. SUBSCRIPTION BUDGETS (for forecast wizard Step 6)
-- Uses v_business_id (businesses.id) as business_id
-- ============================================================
INSERT INTO subscription_budgets (
  business_id, vendor_name, vendor_key, frequency,
  monthly_budget, last_12_months_spend, transaction_count,
  avg_transaction_amount, is_active, notes
) VALUES
(v_business_id, 'Xero',                    'xero',                   'monthly',  65,    780,   12, 65,    true, 'Accounting software - essential'),
(v_business_id, 'Microsoft 365 Business',  'microsoft-365-business', 'monthly',  330,   3960,  12, 330,   true, '15 licences x $22/user/mo'),
(v_business_id, 'SimPRO',                  'simpro',                 'monthly',  1800,  21600, 12, 1800,  true, 'Field service management - 15 users'),
(v_business_id, 'Deputy',                  'deputy',                 'monthly',  90,    1080,  12, 90,    true, 'Roster and time tracking'),
(v_business_id, 'SafetyCulture (iAuditor)','safetyculture-iauditor', 'monthly',  49,    588,   12, 49,    true, 'Safety inspection checklists'),
(v_business_id, 'HubSpot CRM',             'hubspot-crm',            'monthly',  50,    600,   12, 50,    true, 'Free tier + marketing starter'),
(v_business_id, 'Canva Pro',               'canva-pro',              'monthly',  20,    240,   12, 20,    true, 'Social media content design'),
(v_business_id, 'Zoom Business',           'zoom-business',          'monthly',  21,    252,   12, 21,    true, 'Video conferencing for client meetings'),
(v_business_id, 'Dropbox Business',        'dropbox-business',       'monthly',  165,   1980,  12, 165,   true, 'File storage and sharing - job photos'),
(v_business_id, 'Google Ads',              'google-ads',             'monthly',  3000,  36000, 12, 3000,  true, 'Lead generation - residential + solar keywords'),
(v_business_id, 'MYOB PayGlobal',          'myob-payglobal',         'monthly',  199,   2388,  12, 199,   true, 'Payroll processing for 15 staff'),
(v_business_id, 'Verizon Connect (GPS)',   'verizon-connect-gps',    'monthly',  180,   2160,  12, 180,   true, 'Fleet GPS tracking - 8 vehicles');

-- ============================================================
-- DONE!
-- ============================================================
RAISE NOTICE '============================================================';
RAISE NOTICE 'DEMO ACCOUNT CREATED SUCCESSFULLY';
RAISE NOTICE '============================================================';
RAISE NOTICE 'User ID:      %', v_user_id;
RAISE NOTICE 'Business ID:  %', v_business_id;
RAISE NOTICE 'Profile ID:   %', v_profile_id;
RAISE NOTICE 'SWOT ID:      %', v_swot_id;
RAISE NOTICE 'Review ID:    %', v_review_id;
RAISE NOTICE 'Coach ID:     %', v_coach_id;
RAISE NOTICE '============================================================';
RAISE NOTICE 'Login: demo@wisdombi.au';
RAISE NOTICE '============================================================';

END $$;
