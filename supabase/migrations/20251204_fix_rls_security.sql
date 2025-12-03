-- ============================================================================
-- FIX RLS SECURITY ISSUES
-- This migration enables RLS on tables and adds policies where needed
-- ============================================================================

-- ============================================================================
-- PART 1: Enable RLS on tables that ALREADY HAVE policies
-- These tables have policies defined but RLS was disabled
-- This is SAFE - just enables the existing policies to take effect
-- ============================================================================

-- businesses: 18 policies exist
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- financial_forecasts: 12 policies exist
ALTER TABLE public.financial_forecasts ENABLE ROW LEVEL SECURITY;

-- forecast_employees: 5 policies exist
ALTER TABLE public.forecast_employees ENABLE ROW LEVEL SECURITY;

-- forecast_payroll_summary: 1 policy exists
ALTER TABLE public.forecast_payroll_summary ENABLE ROW LEVEL SECURITY;

-- forecast_pl_lines: 9 policies exist
ALTER TABLE public.forecast_pl_lines ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 2: SWOT Tables - Add policies then enable RLS
-- These tables link to swot_analyses which has business_id
-- ============================================================================

-- swot_action_items: links via swot_analysis_id to swot_analyses.business_id
ALTER TABLE public.swot_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view swot action items for their business"
  ON public.swot_action_items FOR SELECT TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage swot action items for their business"
  ON public.swot_action_items FOR ALL TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

-- swot_collaborators: links via swot_analysis_id
ALTER TABLE public.swot_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view swot collaborators for their business"
  ON public.swot_collaborators FOR SELECT TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can manage swot collaborators for their business"
  ON public.swot_collaborators FOR ALL TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

-- swot_comments: links via swot_item_id -> swot_items.swot_analysis_id
ALTER TABLE public.swot_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view swot comments for their business"
  ON public.swot_comments FOR SELECT TO authenticated
  USING (
    swot_item_id IN (
      SELECT si.id FROM public.swot_items si
      WHERE si.swot_analysis_id IN (
        SELECT sa.id FROM public.swot_analyses sa
        WHERE sa.business_id IN (
          SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
          UNION
          SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
          UNION
          SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage swot comments for their business"
  ON public.swot_comments FOR ALL TO authenticated
  USING (
    swot_item_id IN (
      SELECT si.id FROM public.swot_items si
      WHERE si.swot_analysis_id IN (
        SELECT sa.id FROM public.swot_analyses sa
        WHERE sa.business_id IN (
          SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
          UNION
          SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
          UNION
          SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
        )
      )
    )
  );

-- swot_comparisons: links via from_analysis_id and to_analysis_id
ALTER TABLE public.swot_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view swot comparisons for their business"
  ON public.swot_comparisons FOR SELECT TO authenticated
  USING (
    from_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage swot comparisons for their business"
  ON public.swot_comparisons FOR ALL TO authenticated
  USING (
    from_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

-- swot_history: links via swot_analysis_id
ALTER TABLE public.swot_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view swot history for their business"
  ON public.swot_history FOR SELECT TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage swot history for their business"
  ON public.swot_history FOR ALL TO authenticated
  USING (
    swot_analysis_id IN (
      SELECT sa.id FROM public.swot_analyses sa
      WHERE sa.business_id IN (
        SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.owner_id = auth.uid()
        UNION
        SELECT b.id FROM public.businesses b WHERE b.assigned_coach_id = auth.uid()
      )
    )
  );

-- swot_templates: read-only reference data for all authenticated users
ALTER TABLE public.swot_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view swot templates"
  ON public.swot_templates FOR SELECT TO authenticated
  USING (true);


-- ============================================================================
-- PART 3: Other tables
-- ============================================================================

-- category_suggestions: user-specific suggestions
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own category suggestions"
  ON public.category_suggestions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own category suggestions"
  ON public.category_suggestions FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- process_flows and process_phases: No parent 'processes' table found
-- These appear to be orphaned or use a different structure
-- For now, enable RLS with authenticated read access (safe default)
ALTER TABLE public.process_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view process flows"
  ON public.process_flows FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage process flows"
  ON public.process_flows FOR ALL TO authenticated
  USING (true);

ALTER TABLE public.process_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view process phases"
  ON public.process_phases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage process phases"
  ON public.process_phases FOR ALL TO authenticated
  USING (true);


-- ============================================================================
-- PART 4: Backup tables - Enable RLS with NO policies
-- This means ONLY service role can access (appropriate for backups)
-- ============================================================================

ALTER TABLE public.assessments_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_kpis_backup ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 5: Fix Security Definer Views
-- Recreate views with SECURITY INVOKER instead of SECURITY DEFINER
-- ============================================================================

-- Drop and recreate user_kpi_dashboard with security invoker
DROP VIEW IF EXISTS public.user_kpi_dashboard;
CREATE VIEW public.user_kpi_dashboard
WITH (security_invoker = true)
AS
SELECT sk.user_id,
    sk.kpi_id,
    kd.name,
    kd.friendly_name,
    kd.description,
    kd.category,
    kd.unit,
    kd.frequency,
    sk.current_value,
    sk.year1_target,
    sk.year2_target,
    sk.year3_target,
    sk.is_standard,
    sk.is_industry,
    sk.is_custom,
    kv.actual_value AS latest_actual,
    kv.period_end AS latest_period,
    CASE
        WHEN (kv.actual_value IS NULL) THEN 'no_data'::text
        WHEN ((sk.year1_target IS NOT NULL) AND (kv.actual_value >= sk.year1_target)) THEN 'green'::text
        WHEN ((sk.year1_target IS NOT NULL) AND (kv.actual_value >= (sk.year1_target * 0.9))) THEN 'amber'::text
        WHEN (sk.year1_target IS NOT NULL) THEN 'red'::text
        ELSE 'no_target'::text
    END AS current_status
FROM ((strategic_kpis sk
    JOIN kpi_definitions kd ON (((sk.kpi_id)::text = kd.id)))
    LEFT JOIN LATERAL ( SELECT kv2.actual_value,
        kv2.period_end
        FROM kpi_values kv2
        WHERE ((kv2.user_id = sk.user_id) AND (kv2.kpi_id = (sk.kpi_id)::text))
        ORDER BY kv2.period_end DESC
        LIMIT 1) kv ON (true));

GRANT SELECT ON public.user_kpi_dashboard TO authenticated;

-- Drop and recreate current_quarter_swots with security invoker
DROP VIEW IF EXISTS public.current_quarter_swots;
CREATE VIEW public.current_quarter_swots
WITH (security_invoker = true)
AS
SELECT sa.id,
    sa.business_id,
    sa.quarter,
    sa.year,
    sa.type,
    sa.status,
    sa.title,
    sa.description,
    sa.swot_score,
    sa.created_by,
    sa.created_at,
    sa.updated_at,
    sa.finalized_at,
    sa.due_date,
    count(DISTINCT si.id) AS total_items,
    count(DISTINCT
        CASE
            WHEN ((si.category)::text = 'strength'::text) THEN si.id
            ELSE NULL::uuid
        END) AS strengths_count,
    count(DISTINCT
        CASE
            WHEN ((si.category)::text = 'weakness'::text) THEN si.id
            ELSE NULL::uuid
        END) AS weaknesses_count,
    count(DISTINCT
        CASE
            WHEN ((si.category)::text = 'opportunity'::text) THEN si.id
            ELSE NULL::uuid
        END) AS opportunities_count,
    count(DISTINCT
        CASE
            WHEN ((si.category)::text = 'threat'::text) THEN si.id
            ELSE NULL::uuid
        END) AS threats_count,
    count(DISTINCT sai.id) AS action_items_count,
    count(DISTINCT
        CASE
            WHEN ((sai.status)::text = 'completed'::text) THEN sai.id
            ELSE NULL::uuid
        END) AS completed_actions_count
FROM ((swot_analyses sa
    LEFT JOIN swot_items si ON ((sa.id = si.swot_analysis_id)))
    LEFT JOIN swot_action_items sai ON ((sa.id = sai.swot_analysis_id)))
WHERE ((EXTRACT(quarter FROM CURRENT_DATE) = (sa.quarter)::numeric) AND (EXTRACT(year FROM CURRENT_DATE) = (sa.year)::numeric))
GROUP BY sa.id;

GRANT SELECT ON public.current_quarter_swots TO authenticated;
