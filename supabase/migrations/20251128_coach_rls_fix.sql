-- =====================================================
-- FIX: Add missing RLS policies for coach portal
-- Run this in Supabase SQL Editor
-- =====================================================

-- Allow coaches to view businesses assigned to them
DROP POLICY IF EXISTS "Coaches can view assigned businesses" ON public.businesses;
CREATE POLICY "Coaches can view assigned businesses"
  ON public.businesses FOR SELECT
  USING (assigned_coach_id = auth.uid());

-- Allow coaches to update businesses assigned to them (for notes, status, etc.)
DROP POLICY IF EXISTS "Coaches can update assigned businesses" ON public.businesses;
CREATE POLICY "Coaches can update assigned businesses"
  ON public.businesses FOR UPDATE
  USING (assigned_coach_id = auth.uid());

-- Also ensure owners can still view their own business
DROP POLICY IF EXISTS "Owners can view their own business" ON public.businesses;
CREATE POLICY "Owners can view their own business"
  ON public.businesses FOR SELECT
  USING (owner_id = auth.uid());

-- Allow clients to view action items for their business
DROP POLICY IF EXISTS "Clients can view their action items" ON public.action_items;
CREATE POLICY "Clients can view their action items"
  ON public.action_items FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Allow clients to update action items (mark complete)
DROP POLICY IF EXISTS "Clients can update their action items" ON public.action_items;
CREATE POLICY "Clients can update their action items"
  ON public.action_items FOR UPDATE
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Allow clients to view messages for their business
DROP POLICY IF EXISTS "Clients can view their messages" ON public.messages;
CREATE POLICY "Clients can view their messages"
  ON public.messages FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Allow clients to send messages
DROP POLICY IF EXISTS "Clients can send messages" ON public.messages;
CREATE POLICY "Clients can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Allow clients to view their sessions
DROP POLICY IF EXISTS "Clients can view their sessions" ON public.sessions;
CREATE POLICY "Clients can view their sessions"
  ON public.sessions FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Allow clients to view goals for their business
DROP POLICY IF EXISTS "Clients can view their goals" ON public.goals;
CREATE POLICY "Clients can view their goals"
  ON public.goals FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- =====================================================
-- DONE! Now refresh the page and try logging in again
-- =====================================================
