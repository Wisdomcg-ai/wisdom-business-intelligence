-- Create notifications table for tracking email notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'session_reminder', 'chat_message', 'action_due', 'document_shared', 'welcome'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT, -- Optional deep link to relevant page
  read BOOLEAN DEFAULT false,
  sent_email BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  metadata JSONB, -- Store additional context (session_id, action_id, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_sent_email ON public.notifications(sent_email) WHERE sent_email = false;
CREATE INDEX idx_notifications_type ON public.notifications(type);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (via service role)
-- Only service role can insert, not regular users

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_session_reminders BOOLEAN DEFAULT true,
  email_chat_messages BOOLEAN DEFAULT true,
  email_action_due BOOLEAN DEFAULT true,
  email_document_shared BOOLEAN DEFAULT true,
  email_weekly_summary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own preferences
CREATE POLICY "Users can view own preferences" ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
