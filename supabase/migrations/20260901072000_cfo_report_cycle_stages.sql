-- CFO Production Board — report cycle stages on cfo_report_status.
--
-- The board's 5-stage pipeline (Data ready → Generated → Reviewed → Sent →
-- Discussed) is tracked on cfo_report_status rather than a new table: it
-- already keys uniquely on (business_id, period_month), carries approved_at /
-- sent_at and the status machine (draft → ready_for_review → approved → sent),
-- and has all the writer paths. Adding a third status machine was the
-- alternative and was rejected for complexity — this table IS the cycle record.
--
-- New stages:
--   generated_at — first time a monthly_report_snapshots row was saved for the
--                  month (stamped by the snapshot route from now on; backfilled
--                  below for history).
--   discussed_at / discussed_by — the coach walked the client through the
--                  report (manual tick via report-status action mark_discussed).
--
-- ID-space: businesses-space throughout (cfo_report_status.business_id FKs
-- businesses.id). Month-key bridge: monthly_report_snapshots.report_month is
-- 'YYYY-MM' text while period_month is a date — joined as report_month || '-01'.

begin;

alter table public.cfo_report_status
  add column if not exists generated_at timestamptz,
  add column if not exists discussed_at timestamptz,
  add column if not exists discussed_by uuid references auth.users(id) on delete set null;

-- Backfill: an existing snapshot proves the month's report was generated.
-- Creates draft cycle rows for generated-but-never-workflow'd months, and
-- fills generated_at on existing rows without overwriting anything already set.
insert into public.cfo_report_status (business_id, period_month, status, generated_at)
select
  m.business_id,
  (m.report_month || '-01')::date,
  'draft',
  coalesce(m.generated_at, m.created_at)
from public.monthly_report_snapshots m
where m.report_month ~ '^[0-9]{4}-[0-9]{2}$'
on conflict (business_id, period_month) do update
  set generated_at = coalesce(cfo_report_status.generated_at, excluded.generated_at);

comment on column public.cfo_report_status.generated_at is
  'First time a monthly report snapshot was saved for this month (CFO board '
  '"Generated" stage). Autosaves after the first do not move it.';
comment on column public.cfo_report_status.discussed_at is
  'Coach marked the report as discussed with the client (CFO board final '
  'stage; manual tick via report-status action mark_discussed).';

commit;
