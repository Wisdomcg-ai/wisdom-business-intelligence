-- ============================================================
-- DEMO ACCOUNT SUPPLEMENTARY SEED SCRIPT
-- Fills every remaining empty page for Precision Electrical Group
-- Run AFTER seed_demo_account.sql in Supabase SQL Editor
-- ============================================================
-- Idempotent: uses ON CONFLICT DO NOTHING or conditional checks
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := '791ce5cf-3998-4161-9f81-7a2440c618af';
  v_business_id UUID;
  v_profile_id UUID;
  v_idea_id_1 UUID;
  v_idea_id_2 UUID;
  v_idea_id_3 UUID;
  v_idea_id_4 UUID;
  v_idea_id_5 UUID;
  v_idea_id_6 UUID;
  v_act_id_1 UUID;
  v_act_id_2 UUID;
  v_act_id_3 UUID;
  v_act_id_4 UUID;
  v_act_id_5 UUID;
  v_act_id_6 UUID;
  v_act_id_7 UUID;
  v_act_id_8 UUID;
  v_proc_id_1 UUID;
  v_proc_id_2 UUID;
  v_s1 UUID; v_s2 UUID; v_s3 UUID; v_s4 UUID; v_s5 UUID; v_s6 UUID; v_s7 UUID;
  v_week_monday DATE;
  v_i INTEGER;
  v_coach_id UUID;
  v_session_note_1 UUID;
  v_session_note_2 UUID;
  v_coaching_session_1 UUID;
  v_coaching_session_2 UUID;
  v_coaching_session_3 UUID;
BEGIN

-- ============================================================
-- 0. LOOK UP EXISTING IDs
-- ============================================================
SELECT id INTO v_business_id FROM businesses WHERE owner_id = v_user_id LIMIT 1;
SELECT id INTO v_profile_id FROM business_profiles WHERE business_id = v_business_id LIMIT 1;

IF v_business_id IS NULL OR v_profile_id IS NULL THEN
  RAISE EXCEPTION 'Demo account not found. Run seed_demo_account.sql first.';
END IF;

RAISE NOTICE 'Found business_id: %, profile_id: %', v_business_id, v_profile_id;

-- ============================================================
-- 0b. ENSURE PROFILES ROW EXISTS
-- Many tables (kpi_actuals, annual_snapshots, business_members, etc.)
-- FK user_id → profiles(id). Auth triggers normally create this row,
-- but seed scripts bypass auth, so we ensure it exists here.
-- ============================================================
INSERT INTO profiles (id, business_id, role, full_name)
VALUES (v_user_id, v_business_id, 'owner', 'James Mitchell')
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'Ensured profiles row exists for user %', v_user_id;

-- ============================================================
-- 0c. CLEAN UP OLD SUPPLEMENTARY DATA
-- Delete all data this script manages so re-runs always produce
-- clean results (fixes ON CONFLICT DO NOTHING skipping new data
-- when old wrong-format rows exist).
-- ============================================================
DELETE FROM kpi_actuals WHERE user_id = v_user_id;
DELETE FROM user_logins WHERE user_id = v_user_id;
DELETE FROM roadmap_progress WHERE user_id = v_user_id;
DELETE FROM weekly_metrics_snapshots WHERE user_id = v_user_id;
-- Delete process child tables before parent (FK constraints)
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
DELETE FROM ideas WHERE user_id = v_user_id;
DELETE FROM issues_list WHERE user_id = v_user_id;
DELETE FROM open_loops WHERE user_id = v_user_id;
-- New tables added for complete demo
DELETE FROM session_actions WHERE business_id = v_business_id;
DELETE FROM session_attendees WHERE session_note_id IN (SELECT id FROM session_notes WHERE business_id = v_business_id);
DELETE FROM action_items WHERE business_id = v_business_id;
DELETE FROM coaching_sessions WHERE business_id = v_business_id;
-- quarterly_snapshots — use IF EXISTS since table may not exist in all environments
-- Delete by user_id to match regardless of which ID was stored in business_id
BEGIN
  EXECUTE 'DELETE FROM quarterly_snapshots WHERE user_id = $1' USING v_user_id;
EXCEPTION WHEN undefined_table THEN NULL;
END;

-- Look up coach user ID
SELECT COALESCE(
  (SELECT id FROM auth.users WHERE email = 'matt@wisdombi.au' LIMIT 1),
  (SELECT id FROM auth.users WHERE email = 'matt@wisdombi.ai' LIMIT 1),
  (SELECT user_id FROM system_roles WHERE role = 'super_admin' LIMIT 1),
  v_user_id
) INTO v_coach_id;

-- Look up existing session_note IDs (created by seed_demo_account.sql)
SELECT id INTO v_session_note_1 FROM session_notes
  WHERE business_id = v_business_id ORDER BY session_date ASC LIMIT 1;
SELECT id INTO v_session_note_2 FROM session_notes
  WHERE business_id = v_business_id ORDER BY session_date DESC LIMIT 1;

RAISE NOTICE 'Coach ID: %, Session notes: %, %', v_coach_id, v_session_note_1, v_session_note_2;
RAISE NOTICE 'Cleaned up old supplementary data for user %', v_user_id;

-- ============================================================
-- 1. OPEN LOOPS — 6 entries
-- Production schema: start_date (NOT NULL), expected_completion_date, owner, status, blocker
-- Status values: 'in-progress', 'stuck', 'on-hold'
-- ============================================================
INSERT INTO open_loops (user_id, business_id, title, start_date, expected_completion_date, owner, status, blocker, created_at) VALUES
(v_user_id, v_business_id,
 'Waiting on supplier quote for Level 2 ASP equipment',
 (CURRENT_DATE - INTERVAL '12 days')::date, (CURRENT_DATE + INTERVAL '14 days')::date,
 'James Mitchell', 'in-progress', NULL,
 NOW() - INTERVAL '12 days'),
(v_user_id, v_business_id,
 'Pending council approval for Westfield substation upgrade',
 (CURRENT_DATE - INTERVAL '42 days')::date, (CURRENT_DATE + INTERVAL '21 days')::date,
 'James Mitchell', 'stuck', 'Council requesting additional documentation on electrical load calculations and environmental impact',
 NOW() - INTERVAL '42 days'),
(v_user_id, v_business_id,
 'Insurance renewal review with broker',
 (CURRENT_DATE - INTERVAL '18 days')::date, (CURRENT_DATE + INTERVAL '30 days')::date,
 'Sarah Mitchell', 'in-progress', NULL,
 NOW() - INTERVAL '18 days'),
(v_user_id, v_business_id,
 'New vehicle lease — comparing 3 dealer quotes',
 (CURRENT_DATE - INTERVAL '10 days')::date, (CURRENT_DATE + INTERVAL '45 days')::date,
 'James Mitchell', 'on-hold', NULL,
 NOW() - INTERVAL '10 days'),
(v_user_id, v_business_id,
 'SimPRO to Xero integration troubleshooting',
 (CURRENT_DATE - INTERVAL '21 days')::date, (CURRENT_DATE + INTERVAL '7 days')::date,
 'Sarah Mitchell', 'in-progress', NULL,
 NOW() - INTERVAL '21 days'),
(v_user_id, v_business_id,
 'Staff training schedule for Q4 safety compliance',
 (CURRENT_DATE - INTERVAL '8 days')::date, (CURRENT_DATE + INTERVAL '60 days')::date,
 'James Mitchell', 'in-progress', NULL,
 NOW() - INTERVAL '8 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. ISSUES LIST — 6 entries
-- Production schema: issue_type, priority (int 1-3), status, owner, solution, solved_date
-- Status values: 'new', 'identified', 'in-discussion', 'solving', 'solved'
-- Priority: 1 (high), 2 (medium), 3 (low)
-- ============================================================
INSERT INTO issues_list (user_id, business_id, title, issue_type, stated_problem, root_cause, solution, status, priority, owner, archived, solved_date, created_at) VALUES
(v_user_id, v_business_id,
 'Apprentice retention dropping — lost 2 in 6 months',
 'problem',
 'Two 2nd-year apprentices left in the past 6 months for competitor firms.',
 'Wages not competitive vs mining sector. Limited career progression visibility.',
 'Benchmark wages against market. Create clear career pathway document. Introduce quarterly mentoring sessions.',
 'in-discussion', 1, 'James Mitchell', false, NULL, NOW() - INTERVAL '45 days'),
(v_user_id, v_business_id,
 'Quote turnaround time exceeding 5 business days',
 'problem',
 'Clients complaining about slow quote response. Losing jobs to faster competitors.',
 'Manual quoting process requires James to visit site and hand-write quotes. No templates.',
 'Implementing templated quotes in SimPRO. Target: residential same-day, commercial 48 hours.',
 'solving', 1, 'Sarah Mitchell', false, NULL, NOW() - INTERVAL '30 days'),
(v_user_id, v_business_id,
 'First-time fix rate dropped to 89%',
 'problem',
 'Increasing number of return visits costing $200-400 each in unbilled labour.',
 'Incomplete diagnosis on first visit. Electricians not carrying full range of parts.',
 'Pre-kit standard parts per van. Implement diagnostic checklist in SimPRO.',
 'identified', 2, 'Mark Thompson', false, NULL, NOW() - INTERVAL '20 days'),
(v_user_id, v_business_id,
 'Cash flow gap in January/February',
 'challenge',
 'Cash reserves dropped to $45K in January. Struggled to meet payroll timing.',
 'Seasonal revenue dip combined with holiday period invoicing delays.',
 'Build $100K cash reserve by October. Offer early payment discount. Stagger supplier payments.',
 'new', 1, 'James Mitchell', false, NULL, NOW() - INTERVAL '60 days'),
(v_user_id, v_business_id,
 'Google reviews response rate below 30%',
 'problem',
 'Only responding to 28% of Google reviews. Negative reviews sitting unanswered.',
 'No assigned owner for online reputation. Reviews not monitored systematically.',
 'Assign Sarah to monitor and respond to all reviews within 24 hours. Template responses created.',
 'solved', 3, 'Sarah Mitchell', true, (CURRENT_DATE - INTERVAL '30 days')::date, NOW() - INTERVAL '90 days'),
(v_user_id, v_business_id,
 'Vehicle maintenance costs 40% over budget',
 'problem',
 'Fleet maintenance spending $8K/month vs $5.7K budget. 3 vehicles over 200K km.',
 'Aging fleet with 3 vehicles past optimal replacement cycle. Reactive vs preventive maintenance.',
 'Replace 2 oldest vehicles this FY. Implement preventive maintenance schedule. Track per-vehicle costs in SimPRO.',
 'in-discussion', 2, 'Mark Thompson', false, NULL, NOW() - INTERVAL '35 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. IDEAS JOURNAL — 6 entries
-- ============================================================
INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Launch solar panel installation division',
 'Dedicated solar team (2 electricians + 1 designer) to capture QLD government rebate-driven demand. Average solar job $12K with 48% margin. Could add $600K revenue in Year 1.',
 'Industry research', 'approved', 'product', 'high', NOW() - INTERVAL '55 days')
RETURNING id INTO v_idea_id_1;

INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Partner with property management companies for maintenance contracts',
 'Approach 10 property managers in Brisbane for recurring electrical maintenance contracts. Estimated $300K/year in predictable revenue with 40% margin.',
 'Networking event', 'under_review', 'marketing', 'high', NOW() - INTERVAL '40 days')
RETURNING id INTO v_idea_id_2;

INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Implement AI-powered job scheduling',
 'Use AI scheduling tool to optimise daily routes and job allocation. Could save 45 min per electrician per day in travel time. Annual saving ~$80K.',
 'Tech conference', 'captured', 'technology', 'medium', NOW() - INTERVAL '15 days')
RETURNING id INTO v_idea_id_3;

INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Offer electrical safety audit packages to commercial clients',
 'Annual electrical safety audit + thermal imaging + RCD testing package for commercial buildings. Price: $2,500-$5,000 per building. Recurring revenue model.',
 'Client request', 'approved', 'product', 'high', NOW() - INTERVAL '35 days')
RETURNING id INTO v_idea_id_4;

INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Create YouTube channel for DIY electrical safety tips',
 'Educational content on electrical safety, switchboard basics, when to call an electrician. Build brand awareness and trust. 1 video per week.',
 'Marketing agency suggestion', 'parked', 'marketing', 'low', NOW() - INTERVAL '25 days')
RETURNING id INTO v_idea_id_5;

INSERT INTO ideas (id, user_id, business_id, title, description, source, status, category, estimated_impact, created_at)
VALUES
(gen_random_uuid(), v_user_id, v_business_id,
 'Develop apprentice mentoring program with TAFE partnership',
 'Partner with local TAFE for structured apprentice mentoring. Government funding available. Builds talent pipeline and reduces recruitment costs long-term.',
 'Industry association', 'under_review', 'people', 'medium', NOW() - INTERVAL '20 days')
RETURNING id INTO v_idea_id_6;

-- ============================================================
-- 4. DAILY TASKS — 8 entries
-- App reads from daily_tasks table (NOT todo_items)
-- Priority: 'critical' | 'important' | 'nice-to-do'
-- Status: 'to-do' | 'in-progress' | 'done'
-- Due date: 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'custom'
-- ============================================================
INSERT INTO daily_tasks (user_id, business_id, title, priority, status, due_date, specific_date, completed_at, created_at, updated_at) VALUES
(v_user_id, v_business_id,
 'Review monthly P&L with bookkeeper',
 'critical', 'to-do', 'today', CURRENT_DATE, NULL, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
(v_user_id, v_business_id,
 'Call back Westfield PM about Stage 2 quote',
 'critical', 'in-progress', 'today', CURRENT_DATE, NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour'),
(v_user_id, v_business_id,
 'Sign off on apprentice timesheets',
 'important', 'done', 'today', CURRENT_DATE, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '30 minutes'),
(v_user_id, v_business_id,
 'Review Google Ads campaign performance',
 'nice-to-do', 'to-do', 'this-week', NULL, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(v_user_id, v_business_id,
 'Order replacement MCBs for Southbank project',
 'important', 'to-do', 'tomorrow', (CURRENT_DATE + INTERVAL '1 day')::date, NULL, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'),
(v_user_id, v_business_id,
 'Prepare agenda for Monday team meeting',
 'important', 'to-do', 'this-week', NULL, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(v_user_id, v_business_id,
 'Update SimPRO job notes for completed projects',
 'nice-to-do', 'in-progress', 'this-week', NULL, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '6 hours'),
(v_user_id, v_business_id,
 'Follow up outstanding invoices > 30 days',
 'critical', 'to-do', 'today', CURRENT_DATE, NULL, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. STOP DOING MODULE (4 tables)
-- ============================================================

-- 5a. Hourly Rate Calculation
INSERT INTO stop_doing_hourly_rates (business_id, user_id, target_annual_income, working_weeks_per_year, hours_per_week, calculated_hourly_rate)
VALUES (v_profile_id, v_user_id, 250000.00, 48, 45, 115.74)
ON CONFLICT (business_id) DO NOTHING;

-- 5b. Activities — 8 entries
INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Checking & responding to email', 'daily', 90, 'competence', 'delegate', 'medium', false, 35.00, 1, true)
RETURNING id INTO v_act_id_1;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Quoting small residential jobs', 'daily', 120, 'competence', 'delegate', 'high', false, 45.00, 2, true)
RETURNING id INTO v_act_id_2;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Bookkeeping data entry', 'weekly', 180, 'incompetence', 'eliminate', 'low', false, 30.00, 3, true)
RETURNING id INTO v_act_id_3;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Scheduling team roster', 'weekly', 60, 'competence', 'automate', 'medium', true, 0.00, 4, false)
RETURNING id INTO v_act_id_4;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Ordering materials & supplies', 'daily', 45, 'competence', 'delegate', 'medium', false, 35.00, 5, true)
RETURNING id INTO v_act_id_5;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Social media content creation', 'weekly', 90, 'incompetence', 'delegate', 'low', false, 50.00, 6, true)
RETURNING id INTO v_act_id_6;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Vehicle fleet maintenance coordination', 'weekly', 60, 'competence', 'delegate', 'medium', false, 35.00, 7, false)
RETURNING id INTO v_act_id_7;

INSERT INTO stop_doing_activities (id, business_id, user_id, activity_name, frequency, duration_minutes, zone, focus_funnel_outcome, importance, has_system, delegation_hourly_rate, order_index, is_selected_for_stop_doing)
VALUES
(gen_random_uuid(), v_profile_id, v_user_id, 'Client relationship building', 'daily', 60, 'genius', 'concentrate', 'high', false, 0.00, 8, false)
RETURNING id INTO v_act_id_8;

-- 5c. Stop Doing Items — 5 items linked to activities marked for action
INSERT INTO stop_doing_items (business_id, user_id, activity_id, item_name, zone, focus_funnel_outcome, monthly_hours, hourly_rate_used, delegation_rate, net_gain_loss, opportunity_cost_monthly, suggested_decision, delegate_to, target_date, notes, status, order_index) VALUES
(v_profile_id, v_user_id, v_act_id_1, 'Checking & responding to email', 'competence', 'delegate', 30.00, 115.74, 35.00, 80.74, 2422.20,
 'Delegate to Sarah — she can handle 80% of email', 'Sarah Mitchell (Office Manager)', (CURRENT_DATE + INTERVAL '30 days')::date,
 'Set up shared inbox. James only handles commercial client emails.', 'planned', 1),
(v_profile_id, v_user_id, v_act_id_2, 'Quoting small residential jobs', 'competence', 'delegate', 40.00, 115.74, 45.00, 70.74, 2829.60,
 'Delegate to new Sales Manager once onboarded', 'TBH - Sales Manager', (CURRENT_DATE + INTERVAL '60 days')::date,
 'Create quote templates in SimPRO. Sales manager handles all residential quotes under $5K.', 'identified', 2),
(v_profile_id, v_user_id, v_act_id_3, 'Bookkeeping data entry', 'incompetence', 'eliminate', 12.00, 115.74, 30.00, 85.74, 1028.88,
 'Eliminate through SimPRO-Xero auto-sync', NULL, (CURRENT_DATE + INTERVAL '14 days')::date,
 'Once SimPRO-Xero integration is fixed, this task goes to zero.', 'in_progress', 3),
(v_profile_id, v_user_id, v_act_id_5, 'Ordering materials & supplies', 'competence', 'delegate', 15.00, 115.74, 35.00, 80.74, 1211.10,
 'Delegate to lead electrician for standard orders', 'Mike Torres (Lead Electrician)', (CURRENT_DATE + INTERVAL '21 days')::date,
 'Create approved supplier list and spending limits in SimPRO. Mike approves orders under $2K.', 'planned', 4),
(v_profile_id, v_user_id, v_act_id_6, 'Social media content creation', 'incompetence', 'delegate', 6.00, 115.74, 50.00, 65.74, 394.44,
 'Delegate to digital marketing agency', 'Digital Reach Agency', (CURRENT_DATE + INTERVAL '7 days')::date,
 'Agency already handling Google Ads. Add social content to retainer ($500/mo extra).', 'in_progress', 5);

-- 5d. Time Log — 1 week of entries (Mon-Fri)
-- Use the most recent completed Monday
SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::integer + 6) % 7))::date - 7 INTO v_week_monday;

INSERT INTO stop_doing_time_logs (business_id, user_id, week_start_date, entries, total_minutes, is_complete)
VALUES (
  v_profile_id, v_user_id, v_week_monday,
  jsonb_build_object(
    'mon', jsonb_build_object(
      '0600', 'Email & messages', '0615', 'Email & messages', '0630', 'Email & messages',
      '0645', 'Email & messages', '0700', 'Morning huddle', '0715', 'Morning huddle',
      '0730', 'Scheduling team', '0745', 'Quoting residential', '0800', 'Quoting residential',
      '0815', 'Quoting residential', '0830', 'Quoting residential', '0845', 'Client calls',
      '0900', 'Client calls', '0915', 'Site visit', '0930', 'Site visit',
      '0945', 'Site visit', '1000', 'Site visit', '1015', 'Commercial quote',
      '1030', 'Commercial quote', '1045', 'Commercial quote', '1100', 'Commercial quote',
      '1115', 'Team management', '1130', 'Team management', '1145', 'Lunch',
      '1200', 'Lunch', '1215', 'Email & messages', '1230', 'Ordering materials',
      '1245', 'Ordering materials', '1300', 'Client relationship', '1315', 'Client relationship',
      '1330', 'Bookkeeping', '1345', 'Bookkeeping', '1400', 'Strategic thinking',
      '1415', 'Strategic thinking', '1430', 'Strategic thinking', '1445', 'Email & messages'
    ),
    'tue', jsonb_build_object(
      '0600', 'Email & messages', '0615', 'Email & messages', '0630', 'Morning huddle',
      '0645', 'Morning huddle', '0700', 'Quoting residential', '0715', 'Quoting residential',
      '0730', 'Quoting residential', '0745', 'Quoting residential', '0800', 'Client calls',
      '0815', 'Client calls', '0830', 'Client calls', '0845', 'Site visit',
      '0900', 'Site visit', '0915', 'Site visit', '0930', 'Site visit',
      '0945', 'Site visit', '1000', 'Commercial quote', '1015', 'Commercial quote',
      '1030', 'Commercial quote', '1045', 'Team management', '1100', 'Team management',
      '1115', 'Ordering materials', '1130', 'Lunch', '1145', 'Lunch',
      '1200', 'Email & messages', '1215', 'Email & messages', '1230', 'Client relationship',
      '1245', 'Client relationship', '1300', 'Vehicle maintenance', '1315', 'Vehicle maintenance',
      '1330', 'Invoicing follow-up', '1345', 'Invoicing follow-up', '1400', 'Quoting residential',
      '1415', 'Quoting residential', '1430', 'Email & messages', '1445', 'Email & messages'
    ),
    'wed', jsonb_build_object(
      '0600', 'Email & messages', '0615', 'Email & messages', '0630', 'Email & messages',
      '0645', 'Morning huddle', '0700', 'Morning huddle', '0715', 'Weekly team meeting',
      '0730', 'Weekly team meeting', '0745', 'Weekly team meeting', '0800', 'Weekly team meeting',
      '0815', 'Quoting residential', '0830', 'Quoting residential', '0845', 'Quoting residential',
      '0900', 'Client calls', '0915', 'Client calls', '0930', 'Site visit',
      '0945', 'Site visit', '1000', 'Site visit', '1015', 'Commercial quote',
      '1030', 'Commercial quote', '1045', 'Commercial quote', '1100', 'Bookkeeping',
      '1115', 'Bookkeeping', '1130', 'Lunch', '1145', 'Lunch',
      '1200', 'P&L review', '1215', 'P&L review', '1230', 'Ordering materials',
      '1245', 'Ordering materials', '1300', 'Social media', '1315', 'Social media',
      '1330', 'Client relationship', '1345', 'Client relationship', '1400', 'Email & messages',
      '1415', 'Email & messages', '1430', 'Scheduling team', '1445', 'Email & messages'
    ),
    'thu', jsonb_build_object(
      '0600', 'Email & messages', '0615', 'Email & messages', '0630', 'Morning huddle',
      '0645', 'Morning huddle', '0700', 'Quoting residential', '0715', 'Quoting residential',
      '0730', 'Quoting residential', '0745', 'Client calls', '0800', 'Client calls',
      '0815', 'Site visit', '0830', 'Site visit', '0845', 'Site visit',
      '0900', 'Site visit', '0915', 'Commercial quote', '0930', 'Commercial quote',
      '0945', 'Commercial quote', '1000', 'Team management', '1015', 'Team management',
      '1030', 'Team management', '1045', 'Ordering materials', '1100', 'Ordering materials',
      '1115', 'Email & messages', '1130', 'Lunch', '1145', 'Lunch',
      '1200', 'Client relationship', '1215', 'Client relationship', '1230', 'Bookkeeping',
      '1245', 'Bookkeeping', '1300', 'Invoicing follow-up', '1315', 'Invoicing follow-up',
      '1330', 'Quoting residential', '1345', 'Quoting residential', '1400', 'Strategic thinking',
      '1415', 'Strategic thinking', '1430', 'Email & messages', '1445', 'Email & messages'
    ),
    'fri', jsonb_build_object(
      '0600', 'Email & messages', '0615', 'Email & messages', '0630', 'Morning huddle',
      '0645', 'Morning huddle', '0700', 'Quoting residential', '0715', 'Quoting residential',
      '0730', 'Client calls', '0745', 'Client calls', '0800', 'Site visit',
      '0815', 'Site visit', '0830', 'Site visit', '0845', 'Site visit',
      '0900', 'Commercial quote', '0915', 'Commercial quote', '0930', 'Team management',
      '0945', 'Ordering materials', '1000', 'Scheduling team', '1015', 'Scheduling team',
      '1030', 'Social media', '1045', 'Vehicle maintenance', '1100', 'Email & messages',
      '1115', 'Email & messages', '1130', 'Lunch', '1145', 'Lunch',
      '1200', 'Client relationship', '1215', 'Client relationship', '1230', 'Weekly review prep',
      '1245', 'Weekly review prep', '1300', 'Strategic thinking', '1315', 'Strategic thinking',
      '1330', 'Email & messages', '1345', 'Admin catchup', '1400', 'Admin catchup',
      '1415', 'Wrap up', '1430', 'Wrap up'
    )
  ),
  2700, -- 45 hours = 2700 minutes
  true
)
ON CONFLICT (business_id, week_start_date) DO NOTHING;

-- ============================================================
-- 6. MARKETING VALUE PROPOSITION — 1 row
-- ============================================================
INSERT INTO marketing_data (user_id, business_id, value_proposition)
VALUES (
  v_user_id, v_business_id,
  '{
    "target_demographics": "Homeowners, builders, and property managers in Brisbane and South-East Queensland. Primary: homeowners aged 35-65 with properties valued $600K+. Secondary: commercial property managers and strata companies managing 10+ properties. Tertiary: builders and developers doing 5+ projects per year.",
    "target_problems": "Unreliable electricians who don''t show up on time, poor communication about job progress and costs, lack of proper qualifications and insurance for complex work, slow quote response times (industry average 5-7 days), difficulty finding electricians who do both residential and commercial work, no after-hours emergency service available from trusted provider.",
    "target_location": "Brisbane CBD, North Brisbane (Brendale, Strathpine, Chermside), Moreton Bay Region, and Sunshine Coast corridor. 45-minute radius from Brendale workshop.",
    "uvp_statement": "Brisbane''s most reliable electrical team — licensed, insured, and on time, every time. We turn up when we say we will, quote within 24 hours, and back every job with a 5-year workmanship guarantee.",
    "competitive_advantage": "Master Electrician licence with $20M liability cover. SimPRO-powered scheduling means real-time ETAs and digital job tracking. 15-person team covers residential, commercial, solar, and EV charging — one trusted provider for everything electrical.",
    "competitors": [
      {"name": "Mr Sparky", "strengths": "Strong brand, national franchise, heavy marketing spend", "weaknesses": "Higher prices, franchise model means variable quality, no commercial work"},
      {"name": "Fallon Solutions", "strengths": "Large team, 24/7 service, strong online presence", "weaknesses": "Impersonal service, long wait times, expensive"},
      {"name": "Local solo operators", "strengths": "Cheap pricing, personal service, flexible", "weaknesses": "Limited capacity, no insurance/compliance, unreliable availability"}
    ],
    "key_differentiators": [
      "Master Electrician licence — highest industry qualification",
      "5-year workmanship guarantee on all jobs",
      "Same-day quotes for residential, 48-hour for commercial",
      "Real-time job tracking via SimPRO customer portal",
      "Full-service: residential, commercial, solar, EV, emergency",
      "380+ five-star Google reviews"
    ],
    "usp_list": [
      "On time, every time — or $50 off your bill",
      "5-year workmanship guarantee",
      "Same-day residential quotes",
      "Master Electrician qualified team",
      "One call for all electrical needs"
    ]
  }'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 7. TEAM DATA — 1 row with 3 JSONB columns
-- ============================================================
INSERT INTO team_data (user_id, business_id, accountability_chart, org_chart, hiring_roadmap)
VALUES (
  v_user_id, v_business_id,
  -- Accountability Chart: 6 roles
  '{
    "roles": [
      {"function": "Leadership & Strategy", "person": "James Mitchell", "role_title": "Managing Director", "responsibilities": ["Set company vision and strategy", "Key client relationships", "Financial oversight", "Team culture and values"], "success_metric": "Revenue growth >20% YoY, team retention >85%"},
      {"function": "Sales & Business Development", "person": "James Mitchell (transitioning to Sales Manager)", "role_title": "Sales Lead", "responsibilities": ["Commercial quote pipeline", "New client acquisition", "Builder partnerships", "Strata contract negotiation"], "success_metric": "Quote win rate >65%, pipeline >$500K"},
      {"function": "Operations & Delivery", "person": "Mark Thompson", "role_title": "Operations Manager", "responsibilities": ["Daily job scheduling", "Quality assurance", "Safety compliance", "Field team coordination"], "success_metric": "First-time fix rate >94%, on-time completion >95%"},
      {"function": "Finance & Administration", "person": "Sarah Mitchell", "role_title": "Office Manager", "responsibilities": ["Invoicing and accounts receivable", "Payroll processing", "SimPRO administration", "Supplier management"], "success_metric": "Debtor days <30, invoicing within 24hrs"},
      {"function": "Customer Success", "person": "Mark Thompson", "role_title": "Operations Manager", "responsibilities": ["Customer communication", "Complaint resolution", "Review management", "Post-job follow-up"], "success_metric": "NPS >70, Google rating >4.7"},
      {"function": "Marketing & Lead Generation", "person": "External — Digital Reach Agency", "role_title": "Marketing Partner", "responsibilities": ["Google Ads management", "Website optimisation", "Social media content", "SEO and local search"], "success_metric": "Leads >160/month, CPL <$100"}
    ],
    "culture_description": "Safety-first, team-oriented culture where every electrician takes pride in quality workmanship. We show up on time, communicate clearly, and leave every job site cleaner than we found it."
  }'::jsonb,

  -- Org Chart: OrgChartData type with version, activeVersionId, versions[], settings
  '{
    "version": 1,
    "activeVersionId": "v1-current",
    "versions": [
      {
        "id": "v1-current",
        "label": "Current Structure",
        "date": "2026-03-15",
        "createdAt": "2026-03-15T00:00:00Z",
        "updatedAt": "2026-03-15T00:00:00Z",
        "people": [
          {"id": "n1", "name": "James Mitchell", "title": "Managing Director", "department": "Leadership", "employmentType": "full-time", "startDate": "2015-03-01", "salary": 204000, "parentId": null, "sortOrder": 0},
          {"id": "n2", "name": "Mark Thompson", "title": "Operations Manager", "department": "Operations", "employmentType": "full-time", "startDate": "2019-06-15", "salary": 110000, "parentId": "n1", "sortOrder": 0},
          {"id": "n3", "name": "Sarah Mitchell", "title": "Office Manager", "department": "Administration", "employmentType": "full-time", "startDate": "2016-01-10", "salary": 75000, "parentId": "n1", "sortOrder": 1},
          {"id": "n4", "name": "Vacant", "title": "Solar Division Lead", "department": "Solar", "employmentType": "full-time", "startDate": "", "salary": 105000, "parentId": "n1", "sortOrder": 2, "isVacant": true, "plannedHireDate": "2027-01-15", "notes": "New solar division — requires CEC accreditation"},
          {"id": "n5", "name": "Dave Kowalski", "title": "Senior Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2018-02-20", "salary": 95000, "parentId": "n2", "sortOrder": 0},
          {"id": "n6", "name": "Ben Park", "title": "Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2020-08-10", "salary": 82000, "parentId": "n2", "sortOrder": 1},
          {"id": "n7", "name": "Jake Nguyen", "title": "Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2021-03-01", "salary": 82000, "parentId": "n2", "sortOrder": 2},
          {"id": "n8", "name": "Sam Wilson", "title": "Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2022-01-17", "salary": 78000, "parentId": "n2", "sortOrder": 3},
          {"id": "n9", "name": "Marcus Brown", "title": "Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2023-07-03", "salary": 78000, "parentId": "n2", "sortOrder": 4},
          {"id": "n10", "name": "Luke Henderson", "title": "Junior Electrician", "department": "Operations", "employmentType": "full-time", "startDate": "2024-11-04", "salary": 65000, "parentId": "n2", "sortOrder": 5},
          {"id": "n11", "name": "Tom Blake", "title": "3rd Year Apprentice", "department": "Operations", "employmentType": "full-time", "startDate": "2024-01-29", "salary": 38000, "parentId": "n2", "sortOrder": 6},
          {"id": "n12", "name": "Lisa Chen", "title": "Accounts & Admin Assistant", "department": "Administration", "employmentType": "full-time", "startDate": "2025-04-14", "salary": 55000, "parentId": "n3", "sortOrder": 0}
        ]
      }
    ],
    "settings": {
      "showSalaries": false,
      "showHeadcount": true,
      "companyName": "Precision Electrical Group",
      "departmentColors": {
        "Leadership": "bg-amber-500",
        "Operations": "bg-blue-500",
        "Administration": "bg-emerald-500",
        "Solar": "bg-orange-500"
      },
      "viewMode": "detailed"
    }
  }'::jsonb,

  -- Hiring Roadmap: 3 planned hires + retention
  '{
    "hiring_priorities": [
      {"role": "Senior Electrician", "salary_range": "$90,000 - $100,000", "target_salary": 95000, "start_quarter": "Q4 2026", "status": "sourcing", "justification": "Replace departed staff and increase capacity for commercial work. Need 10+ years experience and A-grade licence.", "reporting_to": "Mark Thompson"},
      {"role": "Solar Installation Lead", "salary_range": "$95,000 - $115,000", "target_salary": 105000, "start_quarter": "Q1 2027", "status": "planning", "justification": "Lead new solar division. Requires CEC accreditation, battery storage experience, and team management skills.", "reporting_to": "James Mitchell"},
      {"role": "Office Administrator", "salary_range": "$50,000 - $60,000", "target_salary": 55000, "start_quarter": "Q2 2027", "status": "planning", "justification": "Support Sarah with growing admin load. SimPRO data entry, phone reception, and customer bookings.", "reporting_to": "Sarah Mitchell"}
    ],
    "recognition_rewards": "Employee of the Month with $200 gift card. Annual team Christmas party. Tool allowance ($500/year). Friday afternoon BBQ after safety toolbox talks.",
    "growth_opportunities": "Structured career pathway from Apprentice → Electrician → Senior Electrician → Lead/Supervisor. Annual training budget $2K per person. Support for additional certifications (solar CEC, Level 2 ASP, data/comms).",
    "work_environment": "Modern workshop in Brendale with full amenities. Well-maintained fleet vehicles. Quality tools and equipment provided. Safety-first culture with zero tolerance for shortcuts.",
    "compensation_strategy": "Market-rate base salary benchmarked annually. Overtime at 1.5x standard rate. Tool allowance. Vehicle and fuel card for senior staff. Phone allowance. Annual salary review linked to performance and certifications gained."
  }'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 8. PROCESS DIAGRAMS — 2 diagrams
-- App reads ALL data from process_data JSONB (ProcessSnapshot type)
-- ProcessSnapshot: { notes[], swimlanes[], phases[], steps[], flows[] }
-- Separate tables (process_steps, process_connections, process_phases) are NOT used by the client
-- ============================================================

-- Process 1: New Job Quoting Process
INSERT INTO process_diagrams (id, user_id, name, description, industry, status, step_count, decision_count, swimlane_count, process_data, created_at)
VALUES (
  gen_random_uuid(), v_user_id,
  'New Job Quoting Process',
  'End-to-end process from initial customer enquiry through to quote delivery. Covers lead qualification, site visits, quote preparation, and client follow-up.',
  'Electrical Contracting',
  'published',
  7, 1, 2,
  '{
    "notes": [],
    "swimlanes": [
      {"id": "sw-sales", "name": "Sales", "color": {"name": "Amber", "primary": "#F59E0B", "border": "#B45309", "tint": "#FFFBEB"}, "order": 0},
      {"id": "sw-ops", "name": "Operations", "color": {"name": "Cyan", "primary": "#06B6D4", "border": "#0891B2", "tint": "#ECFEFF"}, "order": 1}
    ],
    "phases": [
      {"id": "ph-ltq", "name": "Lead to Quote", "color": {"name": "Blue", "primary": "#2563EB", "border": "#1D4ED8", "tint": "#EFF6FF", "text": "#FFFFFF"}, "order": 0}
    ],
    "steps": [
      {"id": "p1-s1", "swimlane_id": "sw-sales", "order_num": 0, "action_name": "Receive enquiry", "step_type": "action", "phase_id": "ph-ltq", "description": "Customer contacts us via phone, web form, email, or Google Ads. Log all details in SimPRO.", "estimated_duration": "5 minutes", "success_criteria": "All contact details and job requirements captured in SimPRO", "systems_used": ["SimPRO", "Phone system"], "documents_needed": ["Enquiry form"]},
      {"id": "p1-s2", "swimlane_id": "sw-sales", "order_num": 1, "action_name": "Qualify lead", "step_type": "action", "phase_id": "ph-ltq", "description": "Assess job size, urgency, location, and budget. Categorise as residential (<$5K), commercial ($5K+), or emergency.", "estimated_duration": "10 minutes", "success_criteria": "Lead categorised and prioritised in SimPRO pipeline", "systems_used": ["SimPRO"], "documents_needed": []},
      {"id": "p1-s3", "swimlane_id": "sw-sales", "order_num": 2, "action_name": "Residential or Commercial?", "step_type": "decision", "phase_id": "ph-ltq", "description": "Route to appropriate quoting process based on job category and value.", "systems_used": [], "documents_needed": [], "decision_options": [{"label": "Residential", "color": "green"}, {"label": "Commercial", "color": "blue"}]},
      {"id": "p1-s4", "swimlane_id": "sw-ops", "order_num": 3, "action_name": "Schedule site visit", "step_type": "action", "phase_id": "ph-ltq", "description": "For commercial jobs: schedule site visit with qualified electrician. Provide customer with visit window.", "estimated_duration": "15 minutes", "success_criteria": "Site visit scheduled within 48 hours", "systems_used": ["SimPRO", "Google Calendar"], "documents_needed": ["Site visit checklist"]},
      {"id": "p1-s5", "swimlane_id": "sw-sales", "order_num": 4, "action_name": "Prepare quote", "step_type": "action", "phase_id": "ph-ltq", "description": "Build detailed quote using SimPRO templates. Include materials, labour, timeline, terms and conditions. Apply correct margin.", "estimated_duration": "30-120 minutes", "success_criteria": "Quote accurate, professional, and within margin guidelines", "systems_used": ["SimPRO"], "documents_needed": ["Quote template", "Terms and conditions"]},
      {"id": "p1-s6", "swimlane_id": "sw-sales", "order_num": 5, "action_name": "Review & approve", "step_type": "action", "phase_id": "ph-ltq", "description": "For quotes over $10K: James reviews pricing, margin, and terms before sending. Under $10K: auto-approved.", "estimated_duration": "15 minutes", "success_criteria": "Quote approved with correct pricing and terms", "systems_used": ["SimPRO"], "documents_needed": []},
      {"id": "p1-s7", "swimlane_id": "sw-sales", "order_num": 6, "action_name": "Send to client", "step_type": "action", "phase_id": "ph-ltq", "description": "Email professional quote PDF to client via SimPRO. Set follow-up reminder for 3 business days.", "estimated_duration": "5 minutes", "success_criteria": "Quote sent and follow-up task created", "systems_used": ["SimPRO", "Email"], "documents_needed": ["Quote PDF"]}
    ],
    "flows": [
      {"id": "f1-1", "from_step_id": "p1-s1", "to_step_id": "p1-s2", "flow_type": "sequential"},
      {"id": "f1-2", "from_step_id": "p1-s2", "to_step_id": "p1-s3", "flow_type": "sequential"},
      {"id": "f1-3", "from_step_id": "p1-s3", "to_step_id": "p1-s5", "flow_type": "decision", "condition_label": "Residential", "condition_color": "green"},
      {"id": "f1-4", "from_step_id": "p1-s3", "to_step_id": "p1-s4", "flow_type": "decision", "condition_label": "Commercial", "condition_color": "blue"},
      {"id": "f1-5", "from_step_id": "p1-s4", "to_step_id": "p1-s5", "flow_type": "sequential"},
      {"id": "f1-6", "from_step_id": "p1-s5", "to_step_id": "p1-s6", "flow_type": "sequential"},
      {"id": "f1-7", "from_step_id": "p1-s6", "to_step_id": "p1-s7", "flow_type": "sequential"}
    ]
  }'::jsonb,
  NOW() - INTERVAL '25 days'
)
RETURNING id INTO v_proc_id_1;

-- Process 2: Job Completion & Invoicing
INSERT INTO process_diagrams (id, user_id, name, description, industry, status, step_count, decision_count, swimlane_count, process_data, created_at)
VALUES (
  gen_random_uuid(), v_user_id,
  'Job Completion & Invoicing',
  'Process from job completion through quality checks, documentation, invoicing, and payment collection.',
  'Electrical Contracting',
  'published',
  6, 0, 2,
  '{
    "notes": [],
    "swimlanes": [
      {"id": "sw-field", "name": "Field Team", "color": {"name": "Cyan", "primary": "#06B6D4", "border": "#0891B2", "tint": "#ECFEFF"}, "order": 0},
      {"id": "sw-office", "name": "Office", "color": {"name": "Amber", "primary": "#F59E0B", "border": "#B45309", "tint": "#FFFBEB"}, "order": 1}
    ],
    "phases": [
      {"id": "ph-ctp", "name": "Completion to Payment", "color": {"name": "Emerald", "primary": "#059669", "border": "#047857", "tint": "#ECFDF5", "text": "#FFFFFF"}, "order": 0}
    ],
    "steps": [
      {"id": "p2-s1", "swimlane_id": "sw-field", "order_num": 0, "action_name": "Complete work on site", "step_type": "action", "phase_id": "ph-ctp", "description": "Electrician completes all work per job scope. Tests all circuits. Ensures compliance with AS/NZS 3000.", "estimated_duration": "Varies", "success_criteria": "All work completed and tested to standard", "systems_used": ["SimPRO Mobile"], "documents_needed": ["Job card", "Test sheets"]},
      {"id": "p2-s2", "swimlane_id": "sw-field", "order_num": 1, "action_name": "Quality checklist", "step_type": "action", "phase_id": "ph-ctp", "description": "Complete the job completion checklist in SimPRO Mobile: all items tested, site clean, customer walkthrough done.", "estimated_duration": "15 minutes", "success_criteria": "All checklist items completed and signed", "systems_used": ["SimPRO Mobile"], "documents_needed": ["Completion checklist", "Compliance certificate"]},
      {"id": "p2-s3", "swimlane_id": "sw-field", "order_num": 2, "action_name": "Photo documentation", "step_type": "action", "phase_id": "ph-ctp", "description": "Take before/after photos of all work. Upload to job record in SimPRO. Minimum 4 photos per job.", "estimated_duration": "10 minutes", "success_criteria": "Photos uploaded to SimPRO job record", "systems_used": ["SimPRO Mobile", "Phone camera"], "documents_needed": []},
      {"id": "p2-s4", "swimlane_id": "sw-office", "order_num": 3, "action_name": "Generate invoice", "step_type": "action", "phase_id": "ph-ctp", "description": "Sarah generates invoice in SimPRO from completed job. Verify materials used, hours logged, and any variations.", "estimated_duration": "10 minutes", "success_criteria": "Accurate invoice generated matching job scope and variations", "systems_used": ["SimPRO"], "documents_needed": ["Invoice"]},
      {"id": "p2-s5", "swimlane_id": "sw-office", "order_num": 4, "action_name": "Send to client", "step_type": "action", "phase_id": "ph-ctp", "description": "Email invoice to client via SimPRO with payment terms (7 days residential, 14 days commercial). Include compliance certificate.", "estimated_duration": "5 minutes", "success_criteria": "Invoice sent within 24 hours of job completion", "systems_used": ["SimPRO", "Email"], "documents_needed": ["Invoice PDF", "Compliance certificate"]},
      {"id": "p2-s6", "swimlane_id": "sw-office", "order_num": 5, "action_name": "Payment follow-up", "step_type": "action", "phase_id": "ph-ctp", "description": "If payment not received within terms: Day 7 — friendly reminder. Day 14 — phone call. Day 30 — formal demand. Day 60 — debt collection.", "estimated_duration": "Ongoing", "success_criteria": "Payment received within 30 days for 95% of invoices", "systems_used": ["SimPRO", "Xero"], "documents_needed": ["Reminder templates"]}
    ],
    "flows": [
      {"id": "f2-1", "from_step_id": "p2-s1", "to_step_id": "p2-s2", "flow_type": "sequential"},
      {"id": "f2-2", "from_step_id": "p2-s2", "to_step_id": "p2-s3", "flow_type": "sequential"},
      {"id": "f2-3", "from_step_id": "p2-s3", "to_step_id": "p2-s4", "flow_type": "sequential"},
      {"id": "f2-4", "from_step_id": "p2-s4", "to_step_id": "p2-s5", "flow_type": "sequential"},
      {"id": "f2-5", "from_step_id": "p2-s5", "to_step_id": "p2-s6", "flow_type": "sequential"}
    ]
  }'::jsonb,
  NOW() - INTERVAL '20 days'
)
RETURNING id INTO v_proc_id_2;

-- ============================================================
-- 9. WEEKLY METRICS SNAPSHOTS — 13 rows (past 13 weeks)
-- Production schema: week_ending_date, revenue_actual, gross_profit_actual, etc.
-- Unique constraint: (business_id, week_ending_date)
-- App uses business_profiles.id for business_id (not businesses.id)
-- ============================================================
FOR v_i IN 0..12 LOOP
  INSERT INTO weekly_metrics_snapshots (
    business_id, user_id,
    week_ending_date,
    revenue_actual, gross_profit_actual, net_profit_actual,
    leads_actual, conversion_rate_actual, avg_transaction_value_actual,
    team_headcount_actual, owner_hours_actual,
    kpi_actuals, notes
  )
  VALUES (
    v_profile_id, v_user_id,
    -- week_ending_date = upcoming Friday minus (v_i * 7)
    -- Dashboard defaults to weekPreference='ending' (Friday), so dates must be Fridays
    (CURRENT_DATE + ((5 - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7) % 7)::integer - (v_i * 7))::date,
    -- Revenue: ~$62K-$72K/week, trending up (most recent first)
    CASE v_i
      WHEN 0 THEN 71500 WHEN 1 THEN 69200 WHEN 2 THEN 72100
      WHEN 3 THEN 67800 WHEN 4 THEN 65400 WHEN 5 THEN 68900
      WHEN 6 THEN 66200 WHEN 7 THEN 64800 WHEN 8 THEN 63500
      WHEN 9 THEN 67100 WHEN 10 THEN 62400 WHEN 11 THEN 64200
      WHEN 12 THEN 62800
    END,
    -- Gross profit: ~45% margin
    CASE v_i
      WHEN 0 THEN 32200 WHEN 1 THEN 31100 WHEN 2 THEN 32400
      WHEN 3 THEN 30500 WHEN 4 THEN 29400 WHEN 5 THEN 31000
      WHEN 6 THEN 29800 WHEN 7 THEN 29200 WHEN 8 THEN 28600
      WHEN 9 THEN 30200 WHEN 10 THEN 28100 WHEN 11 THEN 28900
      WHEN 12 THEN 28300
    END,
    -- Net profit
    CASE v_i
      WHEN 0 THEN 9300 WHEN 1 THEN 8500 WHEN 2 THEN 9600
      WHEN 3 THEN 7800 WHEN 4 THEN 7100 WHEN 5 THEN 8200
      WHEN 6 THEN 7500 WHEN 7 THEN 7000 WHEN 8 THEN 6400
      WHEN 9 THEN 7800 WHEN 10 THEN 5900 WHEN 11 THEN 6500
      WHEN 12 THEN 6100
    END,
    -- Leads: 35-45/week
    CASE v_i
      WHEN 0 THEN 44 WHEN 1 THEN 42 WHEN 2 THEN 45
      WHEN 3 THEN 40 WHEN 4 THEN 38 WHEN 5 THEN 41
      WHEN 6 THEN 39 WHEN 7 THEN 37 WHEN 8 THEN 36
      WHEN 9 THEN 40 WHEN 10 THEN 35 WHEN 11 THEN 37
      WHEN 12 THEN 36
    END,
    -- Conversion rate: 0.58-0.68
    CASE v_i
      WHEN 0 THEN 0.64 WHEN 1 THEN 0.64 WHEN 2 THEN 0.64
      WHEN 3 THEN 0.63 WHEN 4 THEN 0.61 WHEN 5 THEN 0.63
      WHEN 6 THEN 0.62 WHEN 7 THEN 0.62 WHEN 8 THEN 0.61
      WHEN 9 THEN 0.63 WHEN 10 THEN 0.60 WHEN 11 THEN 0.62
      WHEN 12 THEN 0.61
    END,
    -- Average transaction value: $950-$1300
    CASE v_i
      WHEN 0 THEN 1245 WHEN 1 THEN 1180 WHEN 2 THEN 1285
      WHEN 3 THEN 1120 WHEN 4 THEN 1065 WHEN 5 THEN 1150
      WHEN 6 THEN 1090 WHEN 7 THEN 1050 WHEN 8 THEN 985
      WHEN 9 THEN 1120 WHEN 10 THEN 960 WHEN 11 THEN 1015
      WHEN 12 THEN 975
    END,
    -- Team headcount
    CASE WHEN v_i >= 6 THEN 15 ELSE 14 END,
    -- Owner hours
    CASE v_i
      WHEN 0 THEN 44 WHEN 1 THEN 46 WHEN 2 THEN 43
      WHEN 3 THEN 48 WHEN 4 THEN 50 WHEN 5 THEN 47
      WHEN 6 THEN 49 WHEN 7 THEN 51 WHEN 8 THEN 48
      WHEN 9 THEN 46 WHEN 10 THEN 50 WHEN 11 THEN 52
      WHEN 12 THEN 49
    END,
    -- kpi_actuals JSONB — all 12 KPIs (plain numbers, targets come from business_kpis)
    jsonb_build_object(
      'kpi-revenue', CASE v_i
        WHEN 0 THEN 71500 WHEN 1 THEN 69200 WHEN 2 THEN 72100
        WHEN 3 THEN 67800 WHEN 4 THEN 65400 WHEN 5 THEN 68900
        WHEN 6 THEN 66200 WHEN 7 THEN 64800 WHEN 8 THEN 63500
        WHEN 9 THEN 67100 WHEN 10 THEN 62400 WHEN 11 THEN 64200
        WHEN 12 THEN 62800
      END,
      'kpi-gm', CASE v_i
        WHEN 0 THEN 45.0 WHEN 1 THEN 44.9 WHEN 2 THEN 44.9
        WHEN 3 THEN 45.0 WHEN 4 THEN 44.9 WHEN 5 THEN 45.0
        WHEN 6 THEN 45.0 WHEN 7 THEN 45.1 WHEN 8 THEN 45.0
        WHEN 9 THEN 45.0 WHEN 10 THEN 45.0 WHEN 11 THEN 45.0
        WHEN 12 THEN 45.1
      END,
      'kpi-npm', CASE v_i
        WHEN 0 THEN 13.0 WHEN 1 THEN 12.3 WHEN 2 THEN 13.3
        WHEN 3 THEN 11.5 WHEN 4 THEN 10.9 WHEN 5 THEN 11.9
        WHEN 6 THEN 11.3 WHEN 7 THEN 10.8 WHEN 8 THEN 10.1
        WHEN 9 THEN 11.6 WHEN 10 THEN 9.5 WHEN 11 THEN 10.1
        WHEN 12 THEN 9.7
      END,
      'kpi-jobs', CASE v_i
        WHEN 0 THEN 57 WHEN 1 THEN 55 WHEN 2 THEN 58
        WHEN 3 THEN 53 WHEN 4 THEN 50 WHEN 5 THEN 54
        WHEN 6 THEN 51 WHEN 7 THEN 49 WHEN 8 THEN 48
        WHEN 9 THEN 52 WHEN 10 THEN 46 WHEN 11 THEN 49
        WHEN 12 THEN 47
      END,
      'kpi-ajv', CASE v_i
        WHEN 0 THEN 1245 WHEN 1 THEN 1180 WHEN 2 THEN 1285
        WHEN 3 THEN 1120 WHEN 4 THEN 1065 WHEN 5 THEN 1150
        WHEN 6 THEN 1090 WHEN 7 THEN 1050 WHEN 8 THEN 985
        WHEN 9 THEN 1120 WHEN 10 THEN 960 WHEN 11 THEN 1015
        WHEN 12 THEN 975
      END,
      'kpi-qwr', CASE v_i
        WHEN 0 THEN 64 WHEN 1 THEN 63 WHEN 2 THEN 65
        WHEN 3 THEN 63 WHEN 4 THEN 62 WHEN 5 THEN 63
        WHEN 6 THEN 61 WHEN 7 THEN 61 WHEN 8 THEN 60
        WHEN 9 THEN 62 WHEN 10 THEN 59 WHEN 11 THEN 60
        WHEN 12 THEN 58
      END,
      'kpi-nps', CASE v_i
        WHEN 0 THEN 68 WHEN 1 THEN 66 WHEN 2 THEN 69
        WHEN 3 THEN 65 WHEN 4 THEN 64 WHEN 5 THEN 67
        WHEN 6 THEN 63 WHEN 7 THEN 65 WHEN 8 THEN 62
        WHEN 9 THEN 66 WHEN 10 THEN 61 WHEN 11 THEN 63
        WHEN 12 THEN 62
      END,
      'kpi-ftfr', CASE v_i
        WHEN 0 THEN 92 WHEN 1 THEN 91 WHEN 2 THEN 93
        WHEN 3 THEN 90 WHEN 4 THEN 89 WHEN 5 THEN 91
        WHEN 6 THEN 88 WHEN 7 THEN 90 WHEN 8 THEN 87
        WHEN 9 THEN 89 WHEN 10 THEN 88 WHEN 11 THEN 90
        WHEN 12 THEN 89
      END,
      'kpi-util', CASE v_i
        WHEN 0 THEN 82 WHEN 1 THEN 80 WHEN 2 THEN 83
        WHEN 3 THEN 79 WHEN 4 THEN 77 WHEN 5 THEN 80
        WHEN 6 THEN 78 WHEN 7 THEN 76 WHEN 8 THEN 75
        WHEN 9 THEN 78 WHEN 10 THEN 73 WHEN 11 THEN 75
        WHEN 12 THEN 74
      END,
      'kpi-google', CASE v_i
        WHEN 0 THEN 4.7 WHEN 1 THEN 4.6 WHEN 2 THEN 4.6
        WHEN 3 THEN 4.6 WHEN 4 THEN 4.6 WHEN 5 THEN 4.6
        WHEN 6 THEN 4.6 WHEN 7 THEN 4.6 WHEN 8 THEN 4.6
        WHEN 9 THEN 4.5 WHEN 10 THEN 4.5 WHEN 11 THEN 4.5
        WHEN 12 THEN 4.5
      END,
      'kpi-leads', CASE v_i
        WHEN 0 THEN 44 WHEN 1 THEN 42 WHEN 2 THEN 45
        WHEN 3 THEN 40 WHEN 4 THEN 38 WHEN 5 THEN 41
        WHEN 6 THEN 39 WHEN 7 THEN 37 WHEN 8 THEN 36
        WHEN 9 THEN 40 WHEN 10 THEN 35 WHEN 11 THEN 37
        WHEN 12 THEN 36
      END,
      'kpi-rpe', CASE v_i
        WHEN 0 THEN 18500 WHEN 1 THEN 18100 WHEN 2 THEN 18800
        WHEN 3 THEN 17600 WHEN 4 THEN 17200 WHEN 5 THEN 17800
        WHEN 6 THEN 17400 WHEN 7 THEN 17000 WHEN 8 THEN 16800
        WHEN 9 THEN 17400 WHEN 10 THEN 16500 WHEN 11 THEN 16900
        WHEN 12 THEN 16700
      END
    ),
    CASE v_i
      WHEN 0 THEN 'Strong week — 2 commercial jobs completed. Google Ads performing well.'
      WHEN 3 THEN 'Slower week — 2 electricians out sick. Deferred 3 jobs.'
      WHEN 6 THEN 'Chris resigned this week. Need to redistribute his jobs.'
      WHEN 9 THEN 'Good recovery after holiday period. New website driving more leads.'
      WHEN 12 THEN 'First week back from Christmas break. Slow start.'
      ELSE NULL
    END
  )
  ON CONFLICT (business_id, week_ending_date) DO NOTHING;
END LOOP;

-- ============================================================
-- 10. ROADMAP PROGRESS — 1 row
-- ============================================================
INSERT INTO roadmap_progress (user_id, completed_builds, completion_checks, view_mode, has_seen_intro)
VALUES (
  v_user_id,
  '["business-profile", "assessment", "vision-mission", "swot-analysis", "goals-targets", "financial-forecast", "one-page-plan", "weekly-reviews", "quarterly-review", "operational-rhythm", "coaching-sessions", "stop-doing-list", "issues-list", "ideas-journal", "open-loops", "marketing", "team", "process-builder", "kpi-dashboard", "todo-list"]'::jsonb,
  '{
    "business-profile": true,
    "assessment": true,
    "vision-mission": true,
    "swot-analysis": true,
    "goals-targets": true,
    "financial-forecast": true,
    "one-page-plan": true,
    "weekly-reviews": true,
    "quarterly-review": true,
    "operational-rhythm": true,
    "coaching-sessions": true,
    "stop-doing-list": true,
    "issues-list": true,
    "ideas-journal": true,
    "open-loops": true,
    "marketing": true,
    "team": true,
    "process-builder": true,
    "kpi-dashboard": true,
    "todo-list": true
  }'::jsonb,
  'full',
  true
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 11. USER LOGINS — 1 row (so "Last login" shows today)
-- ============================================================
INSERT INTO user_logins (user_id, business_id, login_at)
VALUES (v_user_id, v_business_id, NOW())
ON CONFLICT (user_id, business_id) DO UPDATE SET login_at = NOW();

-- ============================================================
-- 12. KPI ACTUALS — quarterly actuals for Q3 FY2026
-- ============================================================
-- App reads kpi_actuals with business_profiles.id (from /reviews/quarterly page)
INSERT INTO kpi_actuals (business_id, user_id, kpi_id, period_year, period_quarter, period_month, period_type, actual_value, target_value, variance, variance_percentage, notes)
VALUES
(v_profile_id, v_user_id, 'kpi-revenue', 2026, 'Q3', NULL, 'quarterly',
 795000.00, 850000.00, -55000.00, -6.47,
 'Revenue 6.5% below target. Lost 2 electricians mid-quarter impacted capacity.'),
(v_profile_id, v_user_id, 'kpi-gm', 2026, 'Q3', NULL, 'quarterly',
 43.00, 45.00, -2.00, -4.44,
 'Gross margin slightly below target due to material cost increases and subcontractor use.'),
(v_profile_id, v_user_id, 'kpi-leads', 2026, 'Q3', NULL, 'quarterly',
 375.00, 480.00, -105.00, -21.88,
 'Leads below target — Google Ads only launched in March. Expecting catch-up in Q4.'),
(v_profile_id, v_user_id, 'kpi-qwr', 2026, 'Q3', NULL, 'quarterly',
 62.00, 68.00, -6.00, -8.82,
 'Quote win rate below target. Manual quoting process still a bottleneck. SimPRO templates in progress.')
ON CONFLICT (business_id, kpi_id, period_year, period_quarter, period_month, period_type) DO NOTHING;

-- ============================================================
-- 12b. PRIOR QUARTER REVIEWS (Q1 & Q2 FY2026) — for YTD calculations
-- Step 4.1 sums quarterly_targets from completed prior-quarter reviews.
-- Without Q1+Q2 completed reviews, YTD always shows $0.
-- These are minimal "completed" reviews — just enough to feed YTD calcs.
-- ============================================================
DELETE FROM quarterly_reviews
  WHERE business_id = v_business_id AND year = 2026 AND quarter IN (1, 2);

INSERT INTO quarterly_reviews (
  id, business_id, user_id, quarter, year, review_type, status,
  current_step, steps_completed, started_at, completed_at,
  last_quarter_rating, biggest_win, biggest_challenge, key_learning,
  hours_worked_avg, energy_level, purpose_alignment,
  annual_target_confidence, confidence_notes, targets_adjusted,
  ytd_revenue_annual, ytd_gross_profit_annual, ytd_net_profit_annual,
  dashboard_snapshot, quarterly_targets,
  quarterly_rocks
) VALUES
-- Q1 FY2026 (Jul-Sep 2025)
(gen_random_uuid(), v_business_id, v_user_id, 1, 2026, 'quarterly', 'completed',
 'complete',
 '["prework","1.1","1.2","1.3","1.4","2.1","2.2","2.3","2.4","2.5","3.1","3.2","4.1","4.2","4.3"]'::jsonb,
 '2025-09-26 09:00:00+10'::timestamptz,
 '2025-09-26 13:00:00+10'::timestamptz,
 6,
 'Secured $65K government contract for school electrical upgrade.',
 'Two sick days per electrician this quarter — need to review workload.',
 'Early investment in systems pays off — SimPRO scheduling already saving hours.',
 55, 6, 7,
 6,
 'Early in the year. Revenue on track but margins need attention. Material costs up.',
 false,
 780000, 327600, 78000,
 '{"revenue":{"target":850000,"actual":780000,"variance":-70000,"percentageAchieved":91.8},"grossProfit":{"target":382500,"actual":327600,"variance":-54900,"percentageAchieved":85.6},"netProfit":{"target":110500,"actual":78000,"variance":-32500,"percentageAchieved":70.6}}'::jsonb,
 '{"revenue":780000,"grossProfit":327600,"netProfit":78000,"kpis":[{"id":"kpi-leads","name":"Leads Per Month","target":120,"unit":"leads"},{"id":"kpi-conversion","name":"Quote Win Rate","target":62,"unit":"%"},{"id":"kpi-atv","name":"Average Job Value","target":1050,"unit":"$"}]}'::jsonb,
 '[{"id":"rock-q1-1","title":"Launch SimPRO Scheduling Module","owner":"Sarah Chen","status":"completed","progressPercentage":100,"successCriteria":"All jobs scheduled through SimPRO"},{"id":"rock-q1-2","title":"Hire 2 Replacement Electricians","owner":"James Mitchell","status":"on_track","progressPercentage":60,"successCriteria":"2 licensed electricians onboarded"},{"id":"rock-q1-3","title":"Set Up Google Business Profile","owner":"Sarah Chen","status":"completed","progressPercentage":100,"successCriteria":"Profile optimised with 50+ reviews"}]'::jsonb
),
-- Q2 FY2026 (Oct-Dec 2025)
(gen_random_uuid(), v_business_id, v_user_id, 2, 2026, 'quarterly', 'completed',
 'complete',
 '["prework","1.1","1.2","1.3","1.4","2.1","2.2","2.3","2.4","2.5","3.1","3.2","4.1","4.2","4.3"]'::jsonb,
 '2025-12-19 09:00:00+10'::timestamptz,
 '2025-12-19 13:00:00+10'::timestamptz,
 7,
 'Won Westfield substation upgrade ($120K). Strongest commercial pipeline ever.',
 'Christmas shutdown planning caused scheduling chaos. Need better holiday process.',
 'Commercial work is where the margins are — focus sales effort there.',
 50, 7, 8,
 7,
 'Strong quarter. Revenue ahead of target. Team settling in well after new hires.',
 false,
 1650000, 693000, 195000,
 '{"revenue":{"target":850000,"actual":870000,"variance":20000,"percentageAchieved":102.4},"grossProfit":{"target":382500,"actual":365400,"variance":-17100,"percentageAchieved":95.5},"netProfit":{"target":110500,"actual":117000,"variance":6500,"percentageAchieved":105.9}}'::jsonb,
 '{"revenue":870000,"grossProfit":365400,"netProfit":117000,"kpis":[{"id":"kpi-leads","name":"Leads Per Month","target":140,"unit":"leads"},{"id":"kpi-conversion","name":"Quote Win Rate","target":65,"unit":"%"},{"id":"kpi-atv","name":"Average Job Value","target":1150,"unit":"$"}]}'::jsonb,
 '[{"id":"rock-q2-1","title":"Win 2 Commercial Contracts >$50K","owner":"James Mitchell","status":"completed","progressPercentage":100,"successCriteria":"2+ commercial contracts signed"},{"id":"rock-q2-2","title":"Complete SimPRO Quoting Module","owner":"Sarah Chen","status":"on_track","progressPercentage":75,"successCriteria":"All quotes generated through SimPRO"},{"id":"rock-q2-3","title":"Launch New Website","owner":"Digital Reach Agency","status":"on_track","progressPercentage":80,"successCriteria":"New website live with SEO optimised content"}]'::jsonb
);

-- ============================================================
-- 13. COACHING SESSIONS — 3 entries (for coach schedule page)
-- coaching_sessions: coach_id, client_id, business_id, title, scheduled_at,
-- duration_minutes, status, session_type, prep_completed, meeting_url, notes
-- ============================================================
INSERT INTO coaching_sessions (id, coach_id, business_id, title, scheduled_at, duration_minutes, status, notes)
VALUES
(gen_random_uuid(), v_coach_id, v_business_id,
 'Q3 Quarterly Review Workshop',
 (NOW() - INTERVAL '14 days')::timestamptz, 240, 'completed',
 'Full 4-hour quarterly review workshop. Covered action replay, SWOT update, rocks review, and Q4 planning.')
RETURNING id INTO v_coaching_session_1;

INSERT INTO coaching_sessions (id, coach_id, business_id, title, scheduled_at, duration_minutes, status, notes)
VALUES
(gen_random_uuid(), v_coach_id, v_business_id,
 'Weekly Coaching — Sales Pipeline Review',
 (NOW() - INTERVAL '3 days')::timestamptz, 60, 'completed',
 'Reviewed sales pipeline. 8 active quotes totalling $185K. Discussed hiring timeline for sales manager.')
RETURNING id INTO v_coaching_session_2;

INSERT INTO coaching_sessions (id, coach_id, business_id, title, scheduled_at, duration_minutes, status, notes)
VALUES
(gen_random_uuid(), v_coach_id, v_business_id,
 'Weekly Coaching — Operations & Team',
 (NOW() + INTERVAL '4 days')::timestamptz, 60, 'scheduled',
 NULL)
RETURNING id INTO v_coaching_session_3;

-- ============================================================
-- 14. SESSION ATTENDEES — link users to existing session_notes
-- ============================================================
IF v_session_note_1 IS NOT NULL THEN
  INSERT INTO session_attendees (session_note_id, user_id, user_type, added_by)
  VALUES
  (v_session_note_1, v_coach_id, 'coach', v_coach_id),
  (v_session_note_1, v_user_id, 'client', v_coach_id)
  ON CONFLICT (session_note_id, user_id) DO NOTHING;
END IF;

IF v_session_note_2 IS NOT NULL THEN
  INSERT INTO session_attendees (session_note_id, user_id, user_type, added_by)
  VALUES
  (v_session_note_2, v_coach_id, 'coach', v_coach_id),
  (v_session_note_2, v_user_id, 'client', v_coach_id)
  ON CONFLICT (session_note_id, user_id) DO NOTHING;
END IF;

-- ============================================================
-- 15. SESSION ACTIONS — 6 actions linked to session_notes
-- Status: 'pending', 'completed', 'missed', 'carried_over'
-- ============================================================
IF v_session_note_1 IS NOT NULL THEN
  INSERT INTO session_actions (session_note_id, business_id, action_number, description, due_date, status, completed_at, created_by) VALUES
  (v_session_note_1, v_business_id, 1,
   'Finalise Sales Manager job description and send to recruiter',
   (CURRENT_DATE - INTERVAL '23 days')::date, 'completed',
   NOW() - INTERVAL '20 days', v_coach_id),
  (v_session_note_1, v_business_id, 2,
   'Set up SimPRO mobile app for 3 field electricians as trial',
   (CURRENT_DATE - INTERVAL '21 days')::date, 'completed',
   NOW() - INTERVAL '18 days', v_coach_id),
  (v_session_note_1, v_business_id, 3,
   'Brief recruitment agency on Sales Manager role requirements',
   (CURRENT_DATE - INTERVAL '20 days')::date, 'completed',
   NOW() - INTERVAL '19 days', v_coach_id);
END IF;

IF v_session_note_2 IS NOT NULL THEN
  INSERT INTO session_actions (session_note_id, business_id, action_number, description, due_date, status, completed_at, created_by) VALUES
  (v_session_note_2, v_business_id, 1,
   'Complete quarterly review pre-work worksheet before workshop',
   (CURRENT_DATE - INTERVAL '7 days')::date, 'completed',
   NOW() - INTERVAL '5 days', v_coach_id),
  (v_session_note_2, v_business_id, 2,
   'Pull Q3 financial data from Xero and prepare variance notes',
   (CURRENT_DATE - INTERVAL '7 days')::date, 'pending',
   NULL, v_coach_id),
  (v_session_note_2, v_business_id, 3,
   'Schedule interviews with 2 shortlisted Sales Manager candidates',
   (CURRENT_DATE + INTERVAL '7 days')::date, 'pending',
   NULL, v_coach_id);
END IF;

-- ============================================================
-- 16. ACTION ITEMS — 5 general business action items (for dashboard)
-- action_items: business_id, title, description, status, priority, due_date,
-- assigned_to, created_by, category
-- ============================================================
INSERT INTO action_items (business_id, title, description, status, priority, due_date, assigned_to, created_by, category) VALUES
(v_business_id,
 'Implement quote templates in SimPRO',
 'Create standardised quote templates for residential (<$5K) and commercial ($5K+) jobs to reduce turnaround from 5 days to same-day/48hr.',
 'in_progress', 'high', (CURRENT_DATE + INTERVAL '14 days')::date,
 v_user_id, v_coach_id, 'operations'),
(v_business_id,
 'Review and update employee handbook',
 'Annual review of employee handbook including updated safety protocols, leave policies, and career pathway document.',
 'pending', 'medium', (CURRENT_DATE + INTERVAL '30 days')::date,
 v_user_id, v_coach_id, 'people'),
(v_business_id,
 'Set up automated invoice reminders in Xero',
 'Configure Xero to auto-send payment reminders at 7, 14, and 30 days overdue. Currently done manually by Sarah.',
 'completed', 'high', (CURRENT_DATE - INTERVAL '7 days')::date,
 v_user_id, v_coach_id, 'finance'),
(v_business_id,
 'Research solar panel installation training providers',
 'Identify CEC-accredited training programs for the planned solar division. Need 2 electricians trained before Q1 2027 launch.',
 'pending', 'medium', (CURRENT_DATE + INTERVAL '45 days')::date,
 v_user_id, v_coach_id, 'growth'),
(v_business_id,
 'Build cash reserve plan — target $100K by October',
 'Work with bookkeeper to model monthly savings targets. Reduce discretionary spending and negotiate extended supplier terms.',
 'in_progress', 'high', (CURRENT_DATE + INTERVAL '60 days')::date,
 v_user_id, v_coach_id, 'finance');

-- ============================================================
-- 17. QUARTERLY SNAPSHOTS — Q3 FY2026 (for quarterly review steps)
-- quarterly_snapshots: business_id, user_id, snapshot_year, snapshot_quarter,
-- total_initiatives, completed_initiatives, in_progress_initiatives, cancelled_initiatives,
-- completion_rate, initiatives_snapshot, kpis_snapshot, financial_snapshot,
-- wins, challenges, learnings, overall_reflection
-- ============================================================
BEGIN
  EXECUTE $sql$
    INSERT INTO quarterly_snapshots (
      business_id, user_id, snapshot_year, snapshot_quarter,
      total_initiatives, completed_initiatives, in_progress_initiatives, cancelled_initiatives,
      completion_rate, initiatives_snapshot, kpis_snapshot, financial_snapshot,
      wins, challenges, learnings, overall_reflection
    ) VALUES (
      $1, $2, 2026, 'Q3',
      5, 3, 1, 1,
      60.0,
      $3::jsonb,
      $4::jsonb,
      $5::jsonb,
      $6, $7, $8, $9
    )
    ON CONFLICT (business_id, snapshot_year, snapshot_quarter) DO UPDATE SET
      total_initiatives = EXCLUDED.total_initiatives,
      completed_initiatives = EXCLUDED.completed_initiatives,
      financial_snapshot = EXCLUDED.financial_snapshot,
      initiatives_snapshot = EXCLUDED.initiatives_snapshot,
      kpis_snapshot = EXCLUDED.kpis_snapshot
  $sql$
  USING
    v_profile_id,  -- quarterly_snapshots.business_id stores business_profiles.id per app convention
    v_user_id,
    -- $3: initiatives_snapshot
    '[
      {"id": "rock-1", "title": "Hire Sales Manager", "owner": "James Mitchell", "status": "completed", "progressPercentage": 100, "successCriteria": "Sales Manager onboarded and managing residential pipeline"},
      {"id": "rock-2", "title": "Implement SimPRO Mobile for Field Team", "owner": "Mark Thompson", "status": "completed", "progressPercentage": 100, "successCriteria": "All field staff using SimPRO mobile daily"},
      {"id": "rock-3", "title": "Reduce Quote Turnaround to 48hrs", "owner": "James Mitchell", "status": "on_track", "progressPercentage": 65, "successCriteria": "Average quote turnaround under 48 hours"},
      {"id": "rock-4", "title": "Launch Google Ads Campaign", "owner": "External Agency", "status": "completed", "progressPercentage": 100, "successCriteria": "Google Ads live with 40+ leads per month"},
      {"id": "rock-5", "title": "Achieve Master Electrician Certification", "owner": "James Mitchell", "status": "cancelled", "progressPercentage": 20, "successCriteria": "Master Electrician certification obtained"}
    ]',
    -- $4: kpis_snapshot
    '[
      {"id": "kpi-revenue", "name": "Revenue", "target": 850000, "actual": 795000, "unit": "$", "trend": "up"},
      {"id": "kpi-gm", "name": "Gross Margin", "target": 45, "actual": 43, "unit": "%", "trend": "flat"},
      {"id": "kpi-leads", "name": "Leads per Month", "target": 160, "actual": 125, "unit": "#", "trend": "up"},
      {"id": "kpi-ftfr", "name": "First Time Fix Rate", "target": 94, "actual": 91, "unit": "%", "trend": "up"},
      {"id": "kpi-nps", "name": "Net Promoter Score", "target": 72, "actual": 67, "unit": "#", "trend": "up"},
      {"id": "kpi-qwr", "name": "Quote Win Rate", "target": 68, "actual": 62, "unit": "%", "trend": "flat"}
    ]',
    -- $5: financial_snapshot
    '{
      "revenue": {"target": 850000, "actual": 795000, "variance": -55000},
      "grossProfit": {"target": 382500, "actual": 341850, "variance": -40650},
      "netProfit": {"target": 127500, "actual": 103350, "variance": -24150},
      "coreMetrics": {
        "grossMargin": {"target": 45.0, "actual": 43.0},
        "netMargin": {"target": 15.0, "actual": 13.0},
        "avgJobValue": {"target": 1200, "actual": 1150}
      }
    }',
    -- $6: wins
    E'Successfully onboarded Sales Manager \u2014 taking over residential quoting pipeline\nSimPRO Mobile fully deployed \u2014 all field staff using it daily, reducing paperwork by 3hrs/week\nGoogle Ads campaign launched \u2014 generating 40+ leads per month at $85 CPL\nWon $120K Westfield commercial contract',
    -- $7: challenges
    E'Lost 2 experienced electricians to mining sector (higher wages)\nQuote turnaround still averaging 3.5 days (target was 2 days)\nJanuary cash flow gap \u2014 dipped to $45K reserves\nFirst-time fix rate dropped from 93% to 89%',
    -- $8: learnings
    E'Need to invest in retention strategy \u2014 competitive wages alone won''t solve it. Career pathway visibility and team culture matter more. Also learned that SimPRO adoption requires hands-on training, not just rollout.',
    -- $9: overall_reflection
    E'Solid quarter despite losing 2 key staff. Revenue slightly below target but trending in right direction. Google Ads investment paying off. Q4 focus needs to be on retention, quote speed, and building cash reserves for seasonal dip.';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'quarterly_snapshots table not found — skipping';
END;

-- ============================================================
-- DONE!
-- ============================================================
RAISE NOTICE '============================================================';
RAISE NOTICE 'DEMO ACCOUNT SUPPLEMENTARY SEED COMPLETE';
RAISE NOTICE '============================================================';
RAISE NOTICE 'Business ID:  %', v_business_id;
RAISE NOTICE 'Profile ID:   %', v_profile_id;
RAISE NOTICE 'Coach ID:     %', v_coach_id;
RAISE NOTICE '============================================================';
RAISE NOTICE 'Seeded: Open Loops (6), Issues (6), Ideas (6), Tasks (8)';
RAISE NOTICE 'Seeded: Stop Doing (hourly rate + 8 activities + 5 items + time log)';
RAISE NOTICE 'Seeded: Marketing Value Prop, Team Data (accountability + org + hiring)';
RAISE NOTICE 'Seeded: Process Diagrams (2 with steps + connections + phases)';
RAISE NOTICE 'Seeded: Weekly Metrics (13 weeks, all 12 KPIs), Roadmap Progress, User Login';
RAISE NOTICE 'Seeded: KPI Actuals (4 quarterly)';
RAISE NOTICE 'Seeded: Coaching Sessions (3), Session Attendees (4), Session Actions (6)';
RAISE NOTICE 'Seeded: Action Items (5), Quarterly Snapshots (Q3 FY2026)';
RAISE NOTICE '============================================================';

END $$;
