-- Uploaded PDF pages for the monthly pack.
--
-- Some pages in a client's Calxa pack come from outside Xero and are not worth
-- building: Distinct Directions' Lumary income analysis (p2), Dragon's Cash vs
-- Accruals (p3-4), IICT's Employment Hero payroll (p16) and, until it is
-- built, IICT's HubSpot memberships (p3-4). A coach places an "Uploaded page"
-- in the layout editor and uploads that month's PDF against it; the export
-- merges the file's pages in at that position.
--
-- One row per upload. Replacing a month's file is a new row for the same
-- (business, month, placement); readers take the newest. Older rows and their
-- objects stay, so a pack sent last week can be explained.
--
-- ID SPACE: business_id is businesses.id, matching monthly_report_settings
-- (whose pdf_layout holds the placement ids) and monthly_report_snapshots.
--
-- Writes go through /api/monthly-report/inserts only — it checks the file is a
-- readable, unencrypted PDF before recording it — so authenticated users get
-- SELECT and nothing else, on the table and on the bucket.

create table public.monthly_report_inserts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 'YYYY-MM', as monthly_report_snapshots.report_month.
  report_month text not null,
  -- The placement's LayoutWidget.id in monthly_report_settings.pdf_layout.
  widget_id text not null,
  -- The placement's name when the file was uploaded ("Lumary Income Analysis").
  label text,
  -- <business_id>/<report_month>/<widget_id>/<id>.pdf in the report-inserts bucket.
  storage_path text not null unique,
  filename text not null,
  page_count integer not null,
  size_bytes integer not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint monthly_report_inserts_report_month_check check (report_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint monthly_report_inserts_page_count_check check (page_count > 0),
  constraint monthly_report_inserts_size_bytes_check check (size_bytes > 0)
);

create index monthly_report_inserts_month_idx
  on public.monthly_report_inserts (business_id, report_month, widget_id, created_at desc);

alter table public.monthly_report_inserts enable row level security;

create policy monthly_report_inserts_read on public.monthly_report_inserts
  as permissive for select to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy monthly_report_inserts_service_role on public.monthly_report_inserts
  as permissive for all to service_role using (true) with check (true);

comment on table public.monthly_report_inserts is
  'Uploaded PDF pages for the monthly pack: one row per upload against a layout placement (widget_id) for a month; the newest row per (business_id, report_month, widget_id) is the one the export merges. businesses-space business_id. Written only by /api/monthly-report/inserts.';

-- The files. Private; 20 MB is the storage-side ceiling, the route enforces the
-- pack's own (smaller) limit and names it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-inserts', 'report-inserts', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Read-only for anyone who can see the business: the first folder of every
-- object path is its businesses.id. No insert/update/delete policy — uploads
-- are made by the route with the service role.
create policy report_inserts_read on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'report-inserts'
    and (
      auth_is_super_admin()
      or (storage.foldername(name))[1] = any (auth_get_accessible_business_ids_text())
    )
  );
