-- WC.3 — saved pack layouts on report templates.
--
-- report_templates has carried full CRUD, a picker and a save modal since
-- Phase 23 with ZERO rows ever created in production — because a template
-- captured everything about a report EXCEPT the thing coaches would actually
-- want to reuse: the PDF page layout. monthly_report_settings.pdf_layout is
-- per-business only, so a layout built for one client had to be rebuilt by
-- hand for the next.
--
-- One nullable column: a template may now carry a PDFLayout (same JSONB shape
-- as monthly_report_settings.pdf_layout — versioned {version:1, pages:[...]}).
-- NULL means "this template does not manage the layout" and applying it leaves
-- the business's existing layout untouched — templates saved before this
-- migration keep exactly their old behaviour.
alter table public.report_templates
  add column if not exists pdf_layout jsonb;

comment on column public.report_templates.pdf_layout is
  'WC.3 — optional saved PDF page layout ({version:1,pages:[...]}, same shape as monthly_report_settings.pdf_layout). NULL = template does not manage layout; applying leaves the business layout untouched.';
