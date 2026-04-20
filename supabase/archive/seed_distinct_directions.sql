-- ============================================================================
-- SEED DATA: Distinct Directions - Business Planning Data (v2)
-- ============================================================================
-- Rebuilt to match Goals Wizard data model exactly:
--   - strategic_ideas (step_type='strategic_ideas') → Step 2 brainstorm
--   - twelve_month (step_type='twelve_month') → Step 3 priorities NOT yet assigned to a quarter
--   - quarterly (step_type='q1'...'q4') → Step 4 assigned to specific quarters
--   - Items assigned to a quarter are REMOVED from twelve_month
--
-- HARDCODED IDs (verified from production Supabase 2026-03-14):
--   businesses.id:        c6c741db-6c09-45be-974c-5e6ca2cadf84
--   business_profiles.id: 7d3232db-6b12-45ca-ad7b-598147a93fb5
--   owner_id (user_id):   f5c433a6-53b5-4265-8eb3-b28fd96bfd73
--   email:                daniel.jarvis@distinctdirections.com.au
--
-- FY Quarter Mapping (Australian FY, July-June):
--   FY26 Q4 = Apr-Jun 2026 (current quarter)
--   FY27 Q1 = Jul-Sep 2026
--   FY27 Q2 = Oct-Dec 2026
-- ============================================================================

DO $$
DECLARE
    v_biz   UUID := 'c6c741db-6c09-45be-974c-5e6ca2cadf84';  -- businesses.id
    v_owner UUID := 'f5c433a6-53b5-4265-8eb3-b28fd96bfd73';  -- owner user_id
    v_prof  UUID := '7d3232db-6b12-45ca-ad7b-598147a93fb5';   -- business_profiles.id
    v_swot  UUID;
BEGIN

-- ========================================================================
-- STEP 1: FINANCIAL TARGETS
-- ========================================================================
RAISE NOTICE '=== Step 1: Financial Targets ===';

INSERT INTO business_financial_goals (
    business_id, user_id,
    revenue_current, revenue_year1, revenue_year2, revenue_year3,
    gross_profit_current, gross_profit_year1, gross_profit_year2, gross_profit_year3,
    net_profit_current, net_profit_year1, net_profit_year2, net_profit_year3,
    gross_margin_current, gross_margin_year1, gross_margin_year2, gross_margin_year3,
    net_margin_current, net_margin_year1, net_margin_year2, net_margin_year3,
    customers_current, customers_year1,
    employees_current, employees_year1, employees_year2, employees_year3,
    owner_hours_per_week_current, owner_hours_per_week_year1,
    year_type, quarterly_targets, updated_at
) VALUES (
    v_prof, v_owner,
    5613000, 5613000, 9704000, 9901000,      -- revenue
    4629000, NULL, NULL, NULL,                 -- gross profit (year1+ not discussed)
    600000, 750000, 2663000, 3672000,          -- net profit
    82.5, NULL, NULL, NULL,                    -- gross margin
    10.7, 12, 20, 20,                          -- net margin
    500, NULL,                                 -- customers
    36, 38, 50, 52,                            -- employees
    70, 40,                                    -- owner hours
    'FY',
    '{}'::jsonb,                               -- no quarterly breakdowns discussed
    NOW()
)
ON CONFLICT (business_id) DO UPDATE SET
    revenue_current = EXCLUDED.revenue_current,
    revenue_year1 = EXCLUDED.revenue_year1,
    revenue_year2 = EXCLUDED.revenue_year2,
    revenue_year3 = EXCLUDED.revenue_year3,
    gross_profit_current = EXCLUDED.gross_profit_current,
    net_profit_current = EXCLUDED.net_profit_current,
    net_profit_year1 = EXCLUDED.net_profit_year1,
    net_profit_year2 = EXCLUDED.net_profit_year2,
    net_profit_year3 = EXCLUDED.net_profit_year3,
    gross_margin_current = EXCLUDED.gross_margin_current,
    net_margin_current = EXCLUDED.net_margin_current,
    net_margin_year1 = EXCLUDED.net_margin_year1,
    net_margin_year2 = EXCLUDED.net_margin_year2,
    net_margin_year3 = EXCLUDED.net_margin_year3,
    customers_current = EXCLUDED.customers_current,
    employees_current = EXCLUDED.employees_current,
    employees_year1 = EXCLUDED.employees_year1,
    employees_year2 = EXCLUDED.employees_year2,
    employees_year3 = EXCLUDED.employees_year3,
    owner_hours_per_week_current = EXCLUDED.owner_hours_per_week_current,
    owner_hours_per_week_year1 = EXCLUDED.owner_hours_per_week_year1,
    year_type = EXCLUDED.year_type,
    quarterly_targets = EXCLUDED.quarterly_targets,
    updated_at = NOW();

RAISE NOTICE 'Financial targets done.';

-- ========================================================================
-- STEP 1b: VISION, MISSION & VALUES (strategy_data table)
-- ========================================================================
-- The app stores this as a single JSONB column 'vision_mission' on strategy_data
-- Unique constraint on user_id
-- ========================================================================
RAISE NOTICE '=== Step 1b: Vision, Mission & Values ===';

INSERT INTO strategy_data (user_id, business_id, vision_mission, updated_at)
VALUES (
    v_owner,
    v_biz,
    '{
      "vision_statement": "1,600 weekly service hours delivered by 65 clinicians across 3-5 locations in regional NSW — a scaled, owner-not-operator behavioural health practice.",
      "mission_statement": "Supporting deliberate lives through behavioural science.",
      "core_values": [
        "Compassionate Boundaries - We hold firm clinical and professional boundaries with empathy and care.",
        "Candor - We speak honestly and directly, even when it is uncomfortable.",
        "Excellence - We operate above market norms in clinical governance, documentation, and outcomes.",
        "Balance - We build a business that sustains the people inside it, not just the clients we serve."
      ]
    }'::jsonb,
    NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
    vision_mission = EXCLUDED.vision_mission,
    business_id = EXCLUDED.business_id,
    updated_at = NOW();

RAISE NOTICE 'Vision, mission & values done.';

-- ========================================================================
-- STEP 2: KPIs (9 KPIs with multi-year targets)
-- ========================================================================
RAISE NOTICE '=== Step 2: KPIs ===';

-- Delete existing KPIs for clean re-insert
DELETE FROM business_kpis WHERE business_id::text = v_prof::text;

INSERT INTO business_kpis (business_id, user_id, kpi_id, name, friendly_name, category, frequency, unit, current_value, year1_target, year2_target, year3_target, is_active, updated_at) VALUES
(v_prof, v_owner, 'billable-hours-per-clinician', 'Billable Hours per Full-Time Clinician', 'Clinician Billables', 'DELIVER', 'quarterly', 'hours per quarter', 0, 250, 250, 250, true, NOW()),
(v_prof, v_owner, 'active-service-agreements', 'Active Service Agreements', 'Active Clients', 'SALES', 'monthly', 'agreements', 500, 0, 0, 0, true, NOW()),
(v_prof, v_owner, 'net-profit-margin', 'Net Profit Margin', 'Net Margin', 'PROFIT', 'monthly', 'percent', 12, 12, 20, 20, true, NOW()),
(v_prof, v_owner, 'new-enquiries-per-month', 'New Client Enquiries per Month', 'New Enquiries', 'ATTRACT', 'monthly', 'enquiries', 0, 0, 0, 0, true, NOW()),
(v_prof, v_owner, 'enquiry-to-service-agreement-conversion', 'Enquiry to Service Agreement Conversion Rate', 'Lead Conversion', 'CONVERT', 'monthly', 'percent', 0, 0, 0, 0, true, NOW()),
(v_prof, v_owner, 'staff-attrition-rate', 'Staff Attrition / Churn Rate', 'Staff Churn', 'PEOPLE', 'quarterly', 'percent', 20, 0, 0, 0, true, NOW()),
(v_prof, v_owner, 'clinician-billables-rag', 'Clinician Billables vs Minimum Target (RAG)', 'Billables RAG', 'FINANCE', 'weekly', 'RAG status per clinician', 0, 0, 0, 0, true, NOW()),
(v_prof, v_owner, 'service-agreement-utilisation', 'Service Agreement Fund Utilisation Rate', 'Plan Utilisation', 'DELIVER', 'monthly', 'percent of allocated budget used', 0, 80, 80, 80, true, NOW()),
(v_prof, v_owner, 'clinician-caseload-value', 'Total Contract Value per Clinician Caseload (AE Report)', 'Caseload Value', 'FINANCE', 'weekly', 'AUD per clinician', 0, 250000, 250000, 250000, true, NOW());

RAISE NOTICE 'KPIs done (9).';

-- ========================================================================
-- STEP 3: STRATEGIC IDEAS (step_type='strategic_ideas') — Step 2 brainstorm
-- ========================================================================
-- ALL ideas go here. This is what populates the Ideas tab in the Goals Wizard.
-- ========================================================================
RAISE NOTICE '=== Step 3: Strategic Ideas ===';

DELETE FROM strategic_initiatives WHERE business_id::text = v_prof::text AND step_type = 'strategic_ideas';

INSERT INTO strategic_initiatives (business_id, user_id, title, description, notes, category, step_type, source, selected, order_index, idea_type, priority, updated_at) VALUES
-- Strategic ideas (one-off projects)
(v_prof, v_owner, 'Odoo HR Module Go-Live', 'Launch Odoo HR module to replace Cintra. Covers attendances (ID scanner + phone clock-in), employee files, leave management, Thursday self-certification pop-up, help desk ticketing for sick leave, and document sign-off via Odoo Sign. Hard deadline: Cintra contract expires 28 April 2026.', 'Go-live 13 April. Dev freeze after Easter (6 April). All staff data in system by 7 April. Testing 7-13 April.', 'systems', 'strategic_ideas', 'strategic_ideas', true, 0, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Zoho Migration (Sign + eLearning to Odoo)', 'Migrate Zoho Sign and Zoho Trainer Central (eLearning LMS) into Odoo Sign and Odoo eLearning modules. Benson (VA) to execute data migration using Trainer Central API.', 'Target: 30 June 2026. API migration script needed for enrollment/completion data.', 'systems', 'strategic_ideas', 'strategic_ideas', true, 1, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Odoo Clinical Module Launch', 'Full clinical module go-live: intake/referrals pipeline, behavioural data collection, project/case management, progress notes (mandatory, gates billing), billing toggle, report generation, psych module.', 'Target January 2027. Migration window: Christmas/New Year shutdown. Lumary contract extended 12 months; hard deadline May 2027.', 'systems', 'strategic_ideas', 'strategic_ideas', true, 2, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Odoo On-Premise Migration', 'Transition Odoo from cloud-hosted to on-premise server before clinical module launch. Enables Python code-level customisation required for clinical document expansion and Claude Code integration.', 'Required before clinical module go-live.', 'systems', 'strategic_ideas', 'strategic_ideas', true, 3, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'AI Sherpa Clinical Model', 'Develop and implement a new clinical delivery structure where AI-assisted workflows and junior support workers (Sherpas) enable senior clinicians to operate at greater scale. Intended to increase net margin from 12% to 20%+.', 'Primary leverage opportunity for FY27. Begin Q1 FY27 once CEO exits clinical role.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 4, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Adam Exit and Bathurst PM Replacement', 'Formalise Adam exit from Bathurst Practice Manager role by 31 July 2026. Begin advertising May/June 2026. New PM onboarded before Odoo clinical go-live.', 'Adam has self-identified as not enjoying the role. Brad (Orange PM) is the benchmark.', 'people', 'strategic_ideas', 'strategic_ideas', true, 5, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'CEO Exits Clinical Practice', 'Daniel to cease seeing clients in Q4 FY26. Maintain psychologist registration via identified supervising psych. Clear 3 overdue reports and ~40 unbilled appointments.', 'Non-negotiable for business to reach next level. Reduction from ~70 hrs/week to 40 hrs/week.', 'product', 'strategic_ideas', 'strategic_ideas', true, 6, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Meeting Governance Structure', 'Implement mandatory agenda, minutes, and purpose for every meeting. AI-assisted minutes generation. Filed on staff or client files.', 'Replace ad hoc Fireflies use with structured AI prompting. Team leaders accountable.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 7, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'QFT Process Implementation', 'Implement Quality Feedback & Transparency process to surface and address clinical quality issues. Forces accountability at clinician level.', 'Bathurst team leaders consistently red on billables due to miscoding. Expected dollar improvement.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 8, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'CEO Takes Over Recruitment', 'Daniel to assume primary recruitment responsibility. Use psychology background for better screening. Always-recruiting model. Develop pass/fail onboarding matrix.', 'At 50+ headcount, transition to dedicated part-time in-house recruiter.', 'people', 'strategic_ideas', 'strategic_ideas', true, 9, 'strategic', 'high', NOW()),
(v_prof, v_owner, 'Support Coordinator and GP Referral CRM', 'Build centralised database of support coordinators and GPs who refer clients. Systematise outreach and relationship management.', 'Currently started but not done consistently. Primary referral sources.', 'marketing', 'strategic_ideas', 'strategic_ideas', true, 10, 'strategic', 'medium', NOW()),
(v_prof, v_owner, 'Intake Pipeline Optimisation', 'Systematise the intake process so the team operates with a sales and conversion mindset. Track new enquiry volume and conversion rate.', 'Current waitlist data unreliable. Retrain intake team as conversion-focused.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 11, 'strategic', 'medium', NOW()),
(v_prof, v_owner, 'Financial Flow Calendar and Operating Budgets', 'Create predictable financial flow calendar and introduce department-level operating budgets to prevent unplanned cash hits.', 'Unbudgeted items like Odoo investment created cash flow pressure.', 'finance', 'strategic_ideas', 'strategic_ideas', true, 12, 'strategic', 'medium', NOW()),
(v_prof, v_owner, 'Head Office Feasibility Study', 'Investigate whether a dedicated head office (separate from Bathurst clinic) makes sense. Estimated ~$80K/year additional rent.', 'Decision deferred to investigate further. Seating pressure is real.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 13, 'strategic', 'low', NOW()),
(v_prof, v_owner, 'Vehicle Strategy (EV + Fleet Management)', 'Manage company vehicle fleet strategically. Blue car to Orange. New EV for Angela. Investigate hybrid hire for Dubbo during fuel rationing.', 'Fuel rationing active in Dubbo (March 2026).', 'finance', 'strategic_ideas', 'strategic_ideas', true, 14, 'operational', 'low', NOW()),
-- Operational ideas (recurring activities — also appear in Step 5 operational plan)
(v_prof, v_owner, 'Weekly Billables Review', 'Practice managers review all clinician billable hours against minimum targets each week. RAG status reported.', 'Currently done via Lumary AE Report. Will transition to Odoo.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 15, 'operational', 'high', NOW()),
(v_prof, v_owner, 'Expiring Service Agreements Review', 'Monthly review of all service agreements expiring in 30/60/90 days. Identify at-risk clients, flag budget underutilisation.', 'Plan utilisation target: 80% booked, 20% buffer.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 16, 'operational', 'high', NOW()),
(v_prof, v_owner, 'Clinical Supervision (Individual)', 'Fortnightly individual supervision sessions between team leaders and their BizPracs. Progress notes filed on staff file.', 'Will move into Odoo supervision module post HR go-live.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 17, 'operational', 'high', NOW()),
(v_prof, v_owner, 'Group Supervision Sessions', 'Monthly group supervision sessions for clinical staff. Structured agenda, case presentations, governance review.', 'Part of broader meeting governance implementation.', 'operations', 'strategic_ideas', 'strategic_ideas', true, 18, 'operational', 'medium', NOW()),
(v_prof, v_owner, 'Support Coordinator Relationship Outreach', 'Regular proactive outreach to support coordinators and GPs in Central West NSW referral network.', 'Primary marketing lever.', 'marketing', 'strategic_ideas', 'strategic_ideas', true, 19, 'operational', 'high', NOW()),
(v_prof, v_owner, 'ATO/Payroll Compliance Calendar', 'Fixed monthly calendar for PAYG/IAS lodgements and payment dates. Coordinated with external bookkeeper.', 'Eliminates surprise payment timing and ATO friction.', 'finance', 'strategic_ideas', 'strategic_ideas', true, 20, 'operational', 'medium', NOW()),
(v_prof, v_owner, 'One-on-One Meetings (PM with Direct Reports)', 'Regular structured one-on-one meetings between practice managers and their direct reports. File noted.', 'To be tracked in Odoo employee file under One-on-One Notes tab.', 'people', 'strategic_ideas', 'strategic_ideas', true, 21, 'operational', 'medium', NOW());

RAISE NOTICE 'Strategic ideas done (22).';

-- ========================================================================
-- STEP 4: TWELVE-MONTH INITIATIVES (step_type='twelve_month') — Step 3 priorities
-- ========================================================================
-- ONLY initiatives NOT assigned to a quarter go here.
-- The 5 assigned to Q4 are EXCLUDED (they go in step_type='q4' below).
-- ========================================================================
RAISE NOTICE '=== Step 4: Twelve-Month Initiatives ===';

DELETE FROM strategic_initiatives WHERE business_id::text = v_prof::text AND step_type = 'twelve_month';

INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, step_type, source, selected, order_index, assigned_to, idea_type, priority, timeline, updated_at) VALUES
(v_prof, v_owner, 'AI Sherpa Clinical Model', 'Design and begin implementing the AI Sherpa leverage model. Primary FY27 margin lever.', 'operations', 'twelve_month', 'strategic_ideas', true, 0, 'Daniel (CEO)', 'strategic', 'high', 'FY27 Q1 (July-September 2026)', NOW()),
(v_prof, v_owner, 'CEO Takes Over Recruitment', 'Daniel assumes recruitment function from Adam. Implements always-recruiting model with psychology-informed screening.', 'people', 'twelve_month', 'strategic_ideas', true, 1, 'Daniel (CEO)', 'strategic', 'high', 'FY27 Q1 onwards', NOW()),
(v_prof, v_owner, 'Adam Exit and Bathurst PM Replacement', 'Formalise exit by 31 July 2026. Advertise from May/June. New PM onboarded before January 2027 Odoo clinical go-live.', 'people', 'twelve_month', 'strategic_ideas', true, 2, 'Daniel (CEO)', 'strategic', 'high', 'FY26 Q4 - FY27 Q1', NOW()),
(v_prof, v_owner, 'Support Coordinator and GP Referral CRM', 'Build centralised referral database. Systematise outreach to support coordinators and GPs.', 'marketing', 'twelve_month', 'strategic_ideas', true, 3, 'Practice Managers / Daniel (CEO)', 'strategic', 'medium', 'FY27 Q1 onwards', NOW()),
(v_prof, v_owner, 'Intake Pipeline Optimisation', 'Systematise intake-to-conversion process. Track enquiry volume and conversion rate. Launch in Odoo CRM simultaneously with clinical modules.', 'operations', 'twelve_month', 'strategic_ideas', true, 4, 'Intake Team / Daniel (CEO)', 'strategic', 'medium', 'FY27 Q2 (aligned with Odoo clinical launch)', NOW()),
(v_prof, v_owner, 'Financial Flow Calendar and Operating Budgets', 'Create predictable financial flow calendar and introduce department-level operating budgets.', 'finance', 'twelve_month', 'strategic_ideas', true, 5, 'Daniel (CEO) / Chris (Bookkeeper)', 'strategic', 'medium', 'FY27 Q1', NOW()),
(v_prof, v_owner, 'Odoo On-Premise Migration', 'Transition Odoo from cloud to on-premise before clinical module launch for Python-level customisation.', 'systems', 'twelve_month', 'strategic_ideas', true, 6, 'Daniel (CEO)', 'strategic', 'high', 'FY26 Q4 - FY27 Q1 (before clinical go-live)', NOW()),
(v_prof, v_owner, 'Head Office Feasibility Study', 'Investigate dedicated head office viability. Cost ~$80K/year, revenue upside from freed clinic offices.', 'operations', 'twelve_month', 'strategic_ideas', true, 7, 'Daniel (CEO)', 'strategic', 'low', 'FY27 Q1-Q2', NOW());

RAISE NOTICE 'Twelve-month initiatives done (8 — excludes 5 assigned to Q4).';

-- ========================================================================
-- STEP 5: QUARTERLY ASSIGNMENTS (step_type='q4') — Step 4 assigned
-- ========================================================================
-- These 5 initiatives are assigned to Q4 FY26 (Apr-Jun 2026).
-- They do NOT also appear in twelve_month.
-- ========================================================================
RAISE NOTICE '=== Step 5: Q4 Assignments ===';

DELETE FROM strategic_initiatives WHERE business_id::text = v_prof::text AND step_type IN ('q1','q2','q3','q4');

INSERT INTO strategic_initiatives (business_id, user_id, title, description, category, step_type, source, selected, order_index, assigned_to, idea_type, priority, outcome, timeline, updated_at) VALUES
(v_prof, v_owner, 'Odoo HR Module Go-Live', 'Launch Odoo HR module to replace Cintra by 13 April 2026.', 'systems', 'q4', 'strategic_ideas', true, 0, 'Daniel (CEO)', 'strategic', 'high', 'All staff clocked in via Odoo by 13 April 2026. Cintra contract not renewed. Leave management, document sign-off, and help desk ticketing all operational.', 'FY26 Q4 - go-live 13 April 2026', NOW()),
(v_prof, v_owner, 'CEO Exits Clinical Practice', 'Daniel to cease seeing clients in Q4 FY26. Clear overdue reports and unbilled appointments.', 'product', 'q4', 'strategic_ideas', true, 1, 'Daniel (CEO)', 'strategic', 'high', 'Zero new clients taken on. All existing clients transitioned. 3 overdue clinical reports cleared. ~40 unbilled appointments closed. Registration maintained via supervising psych.', 'FY26 Q4 - complete by 30 June 2026', NOW()),
(v_prof, v_owner, 'Meeting Governance Structure', 'Mandatory agenda, minutes, and purpose for every meeting. AI-assisted minutes generation.', 'operations', 'q4', 'strategic_ideas', true, 2, 'Daniel (CEO) / All Team Leaders', 'strategic', 'high', 'Every standard meeting has agenda, minutes, purpose. AI-assisted minutes in use and filed on staff or client files consistently.', 'FY26 Q4', NOW()),
(v_prof, v_owner, 'QFT Process Implementation', 'Implement Quality Feedback & Transparency process. Fix Bathurst team leader billables miscoding.', 'operations', 'q4', 'strategic_ideas', true, 3, 'Daniel (CEO) / Linda (Clinical Director)', 'strategic', 'high', 'QFT framework documented and communicated. Bathurst team leader billables move from red toward amber/green. Clinical accountability conversations occurring systematically.', 'FY26 Q4', NOW()),
(v_prof, v_owner, 'Zoho Migration (Sign + eLearning to Odoo)', 'Migrate Zoho Sign and Trainer Central into Odoo by 30 June 2026.', 'systems', 'q4', 'strategic_ideas', true, 4, 'Daniel (CEO) / Benson (VA)', 'strategic', 'high', 'Zoho Sign and Trainer Central decommissioned by 30 June 2026. All content and enrollments migrated to Odoo. No parallel paths running.', 'FY26 Q4 - complete by 30 June 2026', NOW());

RAISE NOTICE 'Q4 assignments done (5).';

-- ========================================================================
-- STEP 6: OPERATIONAL ACTIVITIES
-- ========================================================================
RAISE NOTICE '=== Step 6: Operational Activities ===';

DELETE FROM operational_activities WHERE business_id::text = v_prof::text;

INSERT INTO operational_activities (business_id, user_id, function_id, name, description, frequency, source, assigned_to, order_index, updated_at) VALUES
(v_prof, v_owner, 'finance', 'Weekly Billables Review', 'Practice managers review all clinician billable hours against minimum targets. RAG status reported. Team leaders accountable for clinicians consistently below minimum.', 'weekly', 'custom', 'Brad (Orange PM) / New PM (Bathurst)', 0, NOW()),
(v_prof, v_owner, 'deliver', 'Expiring Service Agreements Review', 'Review of all service agreements expiring in 30/60/90 days. Identify at-risk clients, flag budget underutilisation, plan renewal. At 90 days out, begin using the 20% buffer.', 'monthly', 'custom', 'Linda (Clinical Director)', 1, NOW()),
(v_prof, v_owner, 'deliver', 'Clinical Supervision (Individual)', 'One-on-one supervision sessions between team leaders and their BizPracs. Progress notes filed on staff file in Odoo.', 'fortnightly', 'custom', 'Team Leaders / Linda', 2, NOW()),
(v_prof, v_owner, 'deliver', 'Group Supervision Sessions', 'Group clinical supervision with structured agenda, case presentations, and governance review. Mandatory minutes.', 'monthly', 'custom', 'Linda / Team Leaders', 3, NOW()),
(v_prof, v_owner, 'attract', 'Support Coordinator Relationship Outreach', 'Proactive outreach to support coordinators and GPs in Central West NSW referral network. Maintain presence and deepen relationships.', 'monthly', 'custom', 'Practice Managers', 4, NOW()),
(v_prof, v_owner, 'finance', 'ATO / Payroll Compliance Calendar', 'Fixed monthly calendar for PAYG/IAS lodgements and payment dates. Coordinated with external bookkeeper. Eliminates surprise payment timing.', 'monthly', 'custom', 'Daniel (CEO) / Chris (Bookkeeper)', 5, NOW()),
(v_prof, v_owner, 'people', 'One-on-One Meetings (PM with Direct Reports)', 'Structured one-on-one meetings between practice managers and their direct reports. Outcomes documented and filed in Odoo employee file.', 'monthly', 'custom', 'Practice Managers', 6, NOW()),
(v_prof, v_owner, 'operations', 'Vehicle Fleet Log and Management', 'Manage company vehicle logbooks, kilometre tracking, and fleet cost allocation across Orange, Bathurst and Dubbo offices.', 'monthly', 'custom', 'Admin / Kate', 7, NOW()),
(v_prof, v_owner, 'systems', 'Odoo Development and Configuration', 'Ongoing Odoo build: customisation, workflow automation, testing. Prioritised list worked through one item at a time.', 'weekly', 'custom', 'Daniel (CEO) / Benson (VA)', 8, NOW()),
(v_prof, v_owner, 'operations', 'Team Site Meetings', 'Regular clinic team meetings with mandatory agenda, minutes, and purpose. Covers WHS, clinical governance, team updates. AI-assisted minutes generation.', 'monthly', 'custom', 'Practice Managers / Team Leaders', 9, NOW());

RAISE NOTICE 'Operational activities done (10).';

-- ========================================================================
-- STEP 7: SWOT ANALYSIS
-- ========================================================================
-- swot_analyses.business_id stores the OWNER's user_id (legacy pattern)
-- ========================================================================
RAISE NOTICE '=== Step 7: SWOT Analysis ===';

INSERT INTO swot_analyses (business_id, user_id, quarter, year, type, title, status, created_by)
VALUES (v_owner, v_owner, 3, 2026, 'quarterly', 'Distinct Directions - Q3 FY26 SWOT', 'in-progress', v_owner)
ON CONFLICT DO NOTHING;

SELECT id INTO v_swot FROM swot_analyses
WHERE business_id = v_owner AND quarter = 3 AND year = 2026 AND type = 'quarterly'
LIMIT 1;

IF v_swot IS NULL THEN
    RAISE NOTICE 'Warning: Could not find/create SWOT analysis. Skipping SWOT items.';
ELSE
    DELETE FROM swot_items WHERE swot_analysis_id = v_swot;

    -- Strengths (8)
    INSERT INTO swot_items (swot_analysis_id, category, title, description, impact_level, likelihood, priority_order, status, created_by) VALUES
    (v_swot, 'strength', 'Strong team leader cohort', 'Growing group of capable middle clinical managers. Amy and Rebecca identified as high performers. Bianca progressing toward Clinical Director role.', 5, 3, 0, 'active', v_owner),
    (v_swot, 'strength', 'Excellent reputation', 'Well-regarded in Central West NSW. Reputation is a core referral driver and differentiator from lower-quality remote/Sydney providers.', 5, 3, 1, 'active', v_owner),
    (v_swot, 'strength', 'Clinical processes above market norms', 'Governance structure, documentation standards, and clinical oversight significantly above industry benchmarks.', 5, 3, 2, 'active', v_owner),
    (v_swot, 'strength', 'Year-on-year revenue growth', 'Revenue grown from ~$2.5M to ~$5.6M in approximately two years. Active service agreements up from ~200 to ~500.', 5, 3, 3, 'active', v_owner),
    (v_swot, 'strength', 'Odoo IP being built in-house', 'Proprietary practice management system under development. Significant competitive asset.', 4, 3, 4, 'active', v_owner),
    (v_swot, 'strength', 'Orange clinic consistently performing', 'Brad (Orange PM) delivering above-minimum billables for every staff member consistently. Orange is green.', 4, 3, 5, 'active', v_owner),
    (v_swot, 'strength', 'Diverse and growing service footprint', 'Three locations (Bathurst, Orange, Dubbo) plus virtual/remote clinicians across Central West NSW.', 4, 3, 6, 'active', v_owner),
    (v_swot, 'strength', 'Proven clinical leadership in Linda', 'Clinical Director provides deep clinical expertise and governance oversight. Bianca being developed as successor.', 4, 3, 7, 'active', v_owner);

    -- Weaknesses (10)
    INSERT INTO swot_items (swot_analysis_id, category, title, description, impact_level, likelihood, priority_order, status, created_by) VALUES
    (v_swot, 'weakness', 'High key-person dependency', 'Business heavily dependent on Daniel (CEO) and Linda (Clinical Director). CEO currently bottleneck for most decisions.', 5, 4, 0, 'active', v_owner),
    (v_swot, 'weakness', 'Net margin too low at 12%', 'Current net margin of ~12% creates cash flow pressure and limits investment. Target is 20%.', 5, 5, 1, 'active', v_owner),
    (v_swot, 'weakness', 'CEO still doing clinical work', 'Daniel doing ~70 hrs/week with clinical work as significant component. 3 overdue reports, ~40 unbilled appointments.', 5, 5, 2, 'active', v_owner),
    (v_swot, 'weakness', 'Vision not communicated to staff', 'Business vision exists but not effectively communicated across the organisation. Staff not aligned.', 3, 4, 3, 'active', v_owner),
    (v_swot, 'weakness', 'Staff churn rate increased to ~20%+', 'Attrition doubled from ~10% to ~20%+. Entire recruitment cohorts have failed. Industry average ~40%.', 4, 4, 4, 'active', v_owner),
    (v_swot, 'weakness', 'Poor data and metrics', 'Waitlist data unreliable. Enquiry volume and conversion not tracked. Decision-making hampered by lack of real data.', 4, 4, 5, 'active', v_owner),
    (v_swot, 'weakness', 'Bathurst Practice Manager ineffective', 'Adam is disengaged, not performing core role functions. Recruitment outcomes under his tenure have been poor.', 4, 5, 6, 'active', v_owner),
    (v_swot, 'weakness', 'Administrative process gaps', 'Intake and reception processes have gaps causing client frustration and potential client loss.', 3, 4, 7, 'active', v_owner),
    (v_swot, 'weakness', 'Clinical team misclassifying billable time', 'Team leaders (particularly Bathurst) coding review time as non-billable when it should be billable.', 4, 4, 8, 'active', v_owner),
    (v_swot, 'weakness', 'CEO below market salary', 'Daniel paying himself below market rate. Creates personal financial pressure.', 3, 4, 9, 'active', v_owner);

    -- Opportunities (8)
    INSERT INTO swot_items (swot_analysis_id, category, title, description, impact_level, likelihood, priority_order, status, created_by) VALUES
    (v_swot, 'opportunity', 'AI Sherpa model', 'Leverage AI-assisted workflows and junior Sherpa workers to multiply senior clinician output. Primary mechanism to reach 20%+ net margins.', 5, 4, 0, 'active', v_owner),
    (v_swot, 'opportunity', 'Odoo platform launch', 'In-house practice management system creates single source of truth, enforces workflows, provides real data. Significant operational leverage.', 5, 4, 1, 'active', v_owner),
    (v_swot, 'opportunity', 'Effective Bathurst Practice Manager', 'Replacing Adam with a Brad-calibre PM in Bathurst will unlock significant billable hours and reduce CEO bottleneck.', 5, 4, 2, 'active', v_owner),
    (v_swot, 'opportunity', 'Non-NDIS contracts and tenders', 'Government-funded programs outside mainstream NDIS (e.g. Thriving Children program) represent diversification.', 4, 3, 3, 'active', v_owner),
    (v_swot, 'opportunity', 'Quality differentiation in saturating market', 'Above-market clinical processes and local presence differentiate as clients and referrers become more discerning.', 4, 3, 4, 'active', v_owner),
    (v_swot, 'opportunity', 'CEO strategic time post-clinical exit', 'Once Daniel exits clinical work, significant strategic capacity opens for AI model design, Odoo, recruitment, leadership.', 5, 4, 5, 'active', v_owner),
    (v_swot, 'opportunity', 'Support coordinator and GP referral network expansion', 'Getting name in front of support coordinators and GPs more consistently is the highest-leverage marketing activity.', 4, 4, 6, 'active', v_owner),
    (v_swot, 'opportunity', 'Dedicated HR/Recruitment role at 50+ headcount', 'At FY27/FY28 headcount a dedicated part-time recruiter becomes viable. Removes recruitment as CEO bottleneck.', 4, 3, 7, 'active', v_owner);

    -- Threats (9)
    INSERT INTO swot_items (swot_analysis_id, category, title, description, impact_level, likelihood, priority_order, status, created_by) VALUES
    (v_swot, 'threat', 'Increased market saturation', 'More behaviour support providers entering market, including remote Sydney operators doing poor-quality work. Supply has grown to meet demand for first time.', 4, 4, 0, 'active', v_owner),
    (v_swot, 'threat', 'NDIS policy and price guide uncertainty', 'New NDIS price guide expected June/July 2026. Policy changes could affect billing rates, service types, or participant access.', 5, 4, 1, 'active', v_owner),
    (v_swot, 'threat', 'Key person risk (Daniel and Linda)', 'If Daniel or Linda exit, significant disruption. Succession planning in progress but not complete.', 5, 3, 2, 'active', v_owner),
    (v_swot, 'threat', 'Recruitment failures and cohort churn', 'Entire cohorts of new clinicians have failed to meet standards. High early attrition damages capacity.', 4, 4, 3, 'active', v_owner),
    (v_swot, 'threat', 'Client churn from clinician turnover', 'When clinicians leave, clients often follow or look elsewhere. First-service-agreement retention is most vulnerable.', 4, 4, 4, 'active', v_owner),
    (v_swot, 'threat', 'Lumary IP and transition risk', 'Lumary has incorporated internally developed features. Clinical transition to Odoo carries execution risk.', 3, 3, 5, 'active', v_owner),
    (v_swot, 'threat', 'SaaS cost escalation', 'Zapier pricing increases. Broader SaaS/AI tool costs rising. Need cost-efficient tech stack.', 3, 4, 6, 'active', v_owner),
    (v_swot, 'threat', 'Fuel rationing and regional infrastructure risk', 'Fuel rationing active in Dubbo and surrounding regions. Threatens home visits and outreach. Likely to recur.', 3, 3, 7, 'active', v_owner),
    (v_swot, 'threat', 'Legal proceedings consuming CEO time', 'Humphreys employment matter and Christopher case consuming significant CEO time. Court date April 18, 2026.', 3, 4, 8, 'active', v_owner);

    RAISE NOTICE 'SWOT done (8 strengths, 10 weaknesses, 8 opportunities, 9 threats).';
END IF;

-- ========================================================================
-- STEP 8: ACTION ITEMS
-- ========================================================================
RAISE NOTICE '=== Step 8: Action Items ===';

DELETE FROM action_items WHERE business_id = v_biz;

INSERT INTO action_items (business_id, title, description, status, priority, due_date, assigned_to, created_by, category) VALUES
(v_biz, 'Respond to Cheryl''s email re advertising credits', 'Cheryl has been chasing for months. Has advertising credits she wants to use.', 'pending', 'medium', '2026-03-15', v_owner, v_owner, 'Marketing'),
(v_biz, 'Sign and return Grace''s letter', 'Letter needs to be signed and returned to Grace or Kate.', 'pending', 'high', '2026-03-13', v_owner, v_owner, 'Operations'),
(v_biz, 'Send all planning day transcripts to Matt', 'Download all AI-recorded transcripts from the planning day.', 'pending', 'high', '2026-03-13', v_owner, v_owner, 'Leadership'),
(v_biz, 'Clear and enter all staff data into Odoo HR module', 'All staff records must be in Odoo by 7 April for final testing week before go-live.', 'pending', 'high', '2026-04-07', v_owner, v_owner, 'Systems'),
(v_biz, 'Turn off auto lunch-break deduction in Odoo attendances', 'Currently auto-deducting lunch — needs to be disabled. ~30 min of dev work.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Build Thursday self-certification pop-up in Odoo', 'Weekly pop-up for staff to certify hours worked. Legal driver: Humphreys employment matter.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Build employee file tab structure in Odoo', 'Configure tabs: Work, Personal, Skills & Certs, File Notes, Supervision, One-on-One Notes. Mandatory Work fields first.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Remove second-tier leave approval in Odoo', 'Remove team leader approval tier. Staff self-certify via checklist. Single PM approval only.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Configure sick leave help desk ticket with auto-notifications', 'When clinician submits sick leave: auto-notify PM and admin. Include cancel-appointments checkbox.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Freeze Odoo HR development after Easter', 'No new features after Easter Monday (6 April). Final testing week 7-13 April.', 'pending', 'high', '2026-04-06', v_owner, v_owner, 'Systems'),
(v_biz, 'Set up Claude Code / Odoo MCP Studio integration', 'Configure Claude Code with Odoo MCP Studio for conversational workflow configuration. Test on duplicate DB first.', 'pending', 'high', '2026-04-13', v_owner, v_owner, 'Systems'),
(v_biz, 'Benson to begin Zoho-to-Odoo migration research', 'Research and execute Zoho Trainer Central data migration. Use API for enrollment/completion records.', 'pending', 'high', '2026-04-30', v_owner, v_owner, 'Systems'),
(v_biz, 'Adam to cost hybrid/EV hire for Dubbo office', 'Fuel rationing active in Dubbo. Cost the option of hiring a hybrid for Dubbo clinicians.', 'pending', 'medium', '2026-03-20', v_owner, v_owner, 'Operations'),
(v_biz, 'Conversation with Adam to agree exit timeline', 'Confirm 31 July 2026 exit date. Document handover plan.', 'pending', 'high', '2026-03-31', v_owner, v_owner, 'People'),
(v_biz, 'Begin advertising for Bathurst Practice Manager', 'Start recruitment for Adam''s replacement. Advertising May/June 2026 for 4-month onboarding lead time.', 'pending', 'high', '2026-05-01', v_owner, v_owner, 'People'),
(v_biz, 'Clear 3 overdue clinical reports', 'Daniel has 3 client clinical reports overdue. Must be completed this quarter.', 'pending', 'high', '2026-06-30', v_owner, v_owner, 'Operations'),
(v_biz, 'Close and bill ~40 outstanding appointments', 'Approximately 40 appointments completed but not yet closed for billing in Lumary.', 'pending', 'high', '2026-04-30', v_owner, v_owner, 'Finance'),
(v_biz, 'Fix Practice Protect — update Benson''s IP address', 'Benson''s IP changed and Daniel couldn''t update it. Sort out admin access.', 'pending', 'medium', '2026-03-27', v_owner, v_owner, 'Systems'),
(v_biz, 'Account mapping for Xero with Chris (bookkeeper)', 'Complete Xero account mapping to avoid ATO compliance issues.', 'pending', 'high', '2026-03-31', v_owner, v_owner, 'Finance'),
(v_biz, 'Investigate head office feasibility', 'Research available commercial spaces in Bathurst. Model cost (~$80K/year) and revenue upside.', 'pending', 'low', '2026-06-30', v_owner, v_owner, 'Operations'),
(v_biz, 'Update Wisdom BI with Distinct Directions planning data', 'Load planning session data into Wisdom BI software. Assigned to: Matt (Coach).', 'pending', 'high', '2026-03-14', v_owner, v_owner, 'Systems');

RAISE NOTICE 'Action items done (21).';

-- ========================================================================
-- SUMMARY
-- ========================================================================
RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '=== SEED COMPLETE: Distinct Directions ===';
RAISE NOTICE '========================================';
RAISE NOTICE 'Financial targets:     1 record (FY26-FY28)';
RAISE NOTICE 'Vision/Mission/Values: 1 record (4 core values)';
RAISE NOTICE 'KPIs:                  9';
RAISE NOTICE 'Strategic ideas:       22 (step_type=strategic_ideas)';
RAISE NOTICE 'Twelve-month plan:     8 (step_type=twelve_month, NOT assigned to quarter)';
RAISE NOTICE 'Q4 assignments:        5 (step_type=q4)';
RAISE NOTICE 'Operational activities: 10';
RAISE NOTICE 'SWOT items:            35 (8S + 10W + 8O + 9T)';
RAISE NOTICE 'Action items:          21';

END $$;
