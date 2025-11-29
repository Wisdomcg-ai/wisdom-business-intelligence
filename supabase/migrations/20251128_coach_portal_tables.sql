-- =====================================================
-- COACH PORTAL DATABASE SETUP
-- Run this in your Supabase SQL Editor
-- Execute each section one at a time if you get errors
-- =====================================================

-- =====================================================
-- SECTION 1: SYSTEM ROLES (run this first!)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.system_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'coach', 'client')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.system_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own role" ON public.system_roles;
CREATE POLICY "Users can view their own role"
  ON public.system_roles FOR SELECT
  USING (auth.uid() = user_id);


-- =====================================================
-- SECTION 2: BUSINESS USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.business_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their business associations" ON public.business_users;
CREATE POLICY "Users can view their business associations"
  ON public.business_users FOR SELECT
  USING (user_id = auth.uid());


-- =====================================================
-- SECTION 3: UPDATE BUSINESSES TABLE
-- =====================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS assigned_coach_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';


-- =====================================================
-- SECTION 4: SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES auth.users(id),
  title TEXT,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  type TEXT DEFAULT 'video',
  location TEXT,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  agenda JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view their sessions" ON public.sessions;
CREATE POLICY "Coaches can view their sessions"
  ON public.sessions FOR SELECT
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can manage their sessions" ON public.sessions;
CREATE POLICY "Coaches can manage their sessions"
  ON public.sessions FOR ALL
  USING (coach_id = auth.uid());


-- =====================================================
-- SECTION 5: ACTION ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.action_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  category TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view client actions" ON public.action_items;
CREATE POLICY "Coaches can view client actions"
  ON public.action_items FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches can manage client actions" ON public.action_items;
CREATE POLICY "Coaches can manage client actions"
  ON public.action_items FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );


-- =====================================================
-- SECTION 6: MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  sender_type TEXT,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view client messages" ON public.messages;
CREATE POLICY "Coaches can view client messages"
  ON public.messages FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches can send messages" ON public.messages;
CREATE POLICY "Coaches can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );


-- =====================================================
-- SECTION 7: SESSION TEMPLATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.session_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'session',
  name TEXT NOT NULL,
  description TEXT,
  agenda JSONB,
  content TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage their templates" ON public.session_templates;
CREATE POLICY "Coaches can manage their templates"
  ON public.session_templates FOR ALL
  USING (coach_id = auth.uid());


-- =====================================================
-- SECTION 8: GOALS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'quarterly',
  status TEXT DEFAULT 'active',
  target_value NUMERIC,
  current_value NUMERIC,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view client goals" ON public.goals;
CREATE POLICY "Coaches can view client goals"
  ON public.goals FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );


-- =====================================================
-- SECTION 9: INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_system_roles_user_id ON public.system_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_coach_id ON public.businesses(assigned_coach_id);
CREATE INDEX IF NOT EXISTS idx_sessions_coach_id ON public.sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_sessions_business_id ON public.sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_action_items_business_id ON public.action_items(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON public.messages(business_id);
CREATE INDEX IF NOT EXISTS idx_business_users_user_id ON public.business_users(user_id);


-- =====================================================
-- DONE!
-- Now go to Authentication > Users and create a user
-- Then run this to make them a coach:
--
-- INSERT INTO public.system_roles (user_id, role)
-- VALUES ('paste-user-uuid-here', 'coach');
-- =====================================================
