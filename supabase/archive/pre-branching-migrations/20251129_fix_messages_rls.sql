-- =====================================================
-- FIX MESSAGES TABLE RLS FOR CLIENT ACCESS
-- =====================================================

-- Add recipient_id column if not exists
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id);

-- Update is_read to read for consistency
ALTER TABLE public.messages
  RENAME COLUMN is_read TO read;

-- =====================================================
-- CLIENT RLS POLICIES
-- =====================================================

-- Clients can view messages for their business
DROP POLICY IF EXISTS "Clients can view their messages" ON public.messages;
CREATE POLICY "Clients can view their messages"
  ON public.messages FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- Clients can send messages
DROP POLICY IF EXISTS "Clients can send messages" ON public.messages;
CREATE POLICY "Clients can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- Clients can mark messages as read
DROP POLICY IF EXISTS "Clients can update read status" ON public.messages;
CREATE POLICY "Clients can update read status"
  ON public.messages FOR UPDATE
  USING (
    recipient_id = auth.uid()
  )
  WITH CHECK (
    recipient_id = auth.uid()
  );

-- Coaches can update read status too
DROP POLICY IF EXISTS "Coaches can update read status" ON public.messages;
CREATE POLICY "Coaches can update read status"
  ON public.messages FOR UPDATE
  USING (
    recipient_id = auth.uid() OR
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON public.messages(read);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
