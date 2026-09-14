-- The monthly pack's mark: the WisdomBI lockup, or the business's own image.
--
-- Calxa's Urban Road pack carries Wisdom Consulting Group's grey square "W" on
-- its cover and in the corner of every page; ours prints the WisdomBI lockup.
-- Matt's decision (14 Sep 2026): a setting, the lockup by default.
--
-- Its own column rather than a key inside an existing jsonb. There is no
-- coach-level settings table, so the home is monthly_report_settings; of its
-- jsonb columns, `sections` is rewritten with defaults by any settings save
-- that omits it and replaced by applying a template, and `pdf_layout` is
-- replaced by the layout editor and by templates — a logo in either would be
-- deleted by a coach toggling a page.
--
-- Shape (validated by the settings POST, lib/monthly-report/pack-logo-setting):
--   {"kind":"wisdombi"}
--   {"kind":"custom","image":"data:image/png;base64,…","label":"…"}
-- NULL = the lockup, which is every business today. Nothing reads a column
-- list, and the settings read is select('*'), so code deployed before this is
-- applied simply sees no setting; the POST drops the key on 42703/PGRST204.

alter table public.monthly_report_settings
  add column if not exists pack_logo jsonb;

comment on column public.monthly_report_settings.pack_logo is
  'The monthly PDF pack''s mark: {"kind":"wisdombi"} or {"kind":"custom","image":"data:image/(png|jpeg);base64,…","label":…}. NULL = the WisdomBI lockup.';

-- Direct-SQL DDL leaves PostgREST's schema cache stale.
notify pgrst, 'reload schema';
