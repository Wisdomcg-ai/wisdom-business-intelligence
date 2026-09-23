-- S3 (22 Sep 2026 system diagnostic) — notifications belong to their recipient.
--
-- THE DEFECT. notifications had one policy, rls_access, FOR ALL to
-- authenticated:
--   using      auth_is_super_admin() or business_id = any(auth_get_accessible_business_ids())
--   with check auth_is_super_admin() or auth_can_manage_business(business_id)
-- Neither side looked at user_id (the recipient). So any owner/admin/member of
-- business X could, straight through PostgREST:
--   * INSERT a notification addressed to X's coach or to Matt, with any title
--     and any link — the bell rendered the link as clickable (javascript: or a
--     phishing URL inside the trusted UI);
--   * read, edit or delete notifications addressed to anyone else in X.
-- And a notification with business_id NULL was invisible to its own recipient.
--
-- WHO LEGITIMATELY WRITES notifications — none of them as an authenticated user:
--   * src/lib/notifications.ts (service role) — actions / documents routes
--   * supabase/functions/check-actions-due, check-session-reminders (service role)
--   * public.notify_coach_forecast_complete (SECURITY DEFINER, runs as owner)
-- service_role bypasses RLS, so removing the authenticated INSERT path breaks
-- none of them. The only authenticated insert path, /api/notifications/create,
-- has no callers and is deleted in the same PR.
--
-- WHO READS: /api/notifications (GET filters user_id = auth.uid(); PUT marks
-- read with the same filter) and the bell's realtime INSERT subscription,
-- which RLS scopes to rows the subscriber can SELECT — now: their own.
--
-- The table held 0 rows in prod on 22 Sep 2026, so no data is affected.

drop policy if exists "rls_access" on public.notifications;

create policy notifications_recipient_select on public.notifications
  as permissive for select to authenticated
  using (user_id = (select auth.uid()) or auth_is_super_admin());

create policy notifications_recipient_update on public.notifications
  as permissive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_recipient_delete on public.notifications
  as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

-- Deliberately NO insert policy for authenticated: notifications are created
-- only by service_role and SECURITY DEFINER code (see above).
