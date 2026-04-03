-- AI Interactions table for capturing client questions and building coach knowledge base
-- This enables:
-- 1. Transparent AI suggestions with confidence levels
-- 2. Coach override and benchmark building
-- 3. Insights dashboard for learning patterns
-- 4. Progressive improvement of AI responses

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),

  -- Relationships
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  coach_id uuid,  -- The assigned coach at time of interaction

  -- The interaction
  question text not null,
  question_type text not null,  -- 'salary_estimate', 'cost_estimate', 'margin_advice', 'general'
  context text not null,  -- 'forecast_wizard.step3.team', 'forecast_wizard.step5.projects'
  context_data jsonb,  -- Additional context like position, industry, etc.

  -- AI response
  ai_response jsonb not null,  -- { suggestion: "$85K-$100K", reasoning: "...", sources: [...] }
  confidence text not null default 'medium',  -- 'high', 'medium', 'low'

  -- What the user did
  action_taken text,  -- 'used', 'adjusted', 'ignored', 'asked_coach'
  user_value numeric,  -- The actual value they entered (if applicable)
  user_feedback text,  -- Optional feedback from user

  -- Coach input
  coach_reviewed boolean default false,
  coach_override jsonb,  -- { value: 95000, note: "Melbourne market premium" }
  coach_notes text,
  added_to_library boolean default false,
  library_entry_id uuid,  -- Reference to coach_benchmarks if added

  -- Business context for pattern analysis
  business_industry text,
  business_revenue_range text,  -- 'under_500k', '500k_1m', '1m_2m', '2m_5m', 'over_5m'
  business_state text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  coach_reviewed_at timestamptz
);

-- Coach benchmarks library - stores approved benchmarks from coach overrides
create table if not exists public.coach_benchmarks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references auth.users(id) on delete cascade,

  -- Benchmark details
  benchmark_type text not null,  -- 'salary', 'project_cost', 'margin', 'expense_ratio'
  category text not null,  -- 'project_manager', 'website_redesign', 'marketing_budget'

  -- The benchmark values
  min_value numeric,
  max_value numeric,
  typical_value numeric,

  -- Context for when to apply
  industry_filter text,  -- Simple industry filter (e.g., 'construction', 'retail')
  applicable_industries text[],  -- null means all industries
  applicable_revenue_ranges text[],  -- null means all sizes
  applicable_states text[],  -- null means all states

  -- Coach notes
  notes text,
  source text,  -- 'manual', 'from_interaction', 'research'
  source_interaction_id uuid references public.ai_interactions(id),

  -- Usage tracking
  times_used integer default 0,
  last_used_at timestamptz,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Ensure unique benchmarks per coach
  unique(coach_id, benchmark_type, category)
);

-- Indexes for performance
create index idx_ai_interactions_business on public.ai_interactions(business_id);
create index idx_ai_interactions_coach on public.ai_interactions(coach_id);
create index idx_ai_interactions_type on public.ai_interactions(question_type);
create index idx_ai_interactions_created on public.ai_interactions(created_at desc);
create index idx_ai_interactions_needs_review on public.ai_interactions(coach_reviewed, confidence)
  where coach_reviewed = false;

create index idx_coach_benchmarks_coach on public.coach_benchmarks(coach_id);
create index idx_coach_benchmarks_type on public.coach_benchmarks(benchmark_type, category);

-- RLS policies
alter table public.ai_interactions enable row level security;
alter table public.coach_benchmarks enable row level security;

-- AI Interactions: Users can see their own, coaches can see their clients'
create policy "ai_interactions_select_own" on public.ai_interactions
  for select using (
    user_id = auth.uid()
    or coach_id = auth.uid()
    or exists (
      select 1 from public.businesses b
      where b.id = ai_interactions.business_id
      and b.assigned_coach_id = auth.uid()
    )
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

create policy "ai_interactions_insert" on public.ai_interactions
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role in ('super_admin', 'coach')
    )
  );

create policy "ai_interactions_update" on public.ai_interactions
  for update using (
    user_id = auth.uid()
    or coach_id = auth.uid()
    or exists (
      select 1 from public.businesses b
      where b.id = ai_interactions.business_id
      and b.assigned_coach_id = auth.uid()
    )
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

-- Coach Benchmarks: Coaches can manage their own
create policy "coach_benchmarks_select" on public.coach_benchmarks
  for select using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

create policy "coach_benchmarks_insert" on public.coach_benchmarks
  for insert with check (
    coach_id = auth.uid()
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

create policy "coach_benchmarks_update" on public.coach_benchmarks
  for update using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

create policy "coach_benchmarks_delete" on public.coach_benchmarks
  for delete using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.system_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

-- Function to update timestamps
create or replace function update_ai_tables_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ai_interactions_updated_at
  before update on public.ai_interactions
  for each row execute function update_ai_tables_updated_at();

create trigger coach_benchmarks_updated_at
  before update on public.coach_benchmarks
  for each row execute function update_ai_tables_updated_at();

-- Add helpful comments
comment on table public.ai_interactions is 'Captures all AI advisor interactions for learning and improvement';
comment on table public.coach_benchmarks is 'Coach-curated benchmarks that override AI suggestions';
comment on column public.ai_interactions.confidence is 'AI confidence level: high (use benchmark), medium (market data), low (needs coach input)';
comment on column public.ai_interactions.action_taken is 'What the user did with the suggestion: used, adjusted, ignored, asked_coach';
