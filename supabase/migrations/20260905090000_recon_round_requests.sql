-- CFO Production Board — recon-round request queue.
--
-- The Xero badge counts can only be captured by Claude driving Matt's
-- logged-in Chrome on his Mac (no API exposes the badge — Xero, 2 Sep 2026).
-- The board's "Update from Xero" button and the weekday-morning launchd job
-- both INSERT a request here; the Mac-side watcher
-- (scripts/recon-round-watcher.mjs) picks pending rows up, runs the round,
-- and stamps the outcome. The board renders the latest row's status.

begin;

create table if not exists public.recon_round_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  requested_by uuid,
  -- 'button' | 'schedule' — where the request came from.
  source text not null default 'button',
  -- pending -> running -> done | failed; pending never picked up -> expired.
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'expired')),
  started_at timestamptz,
  finished_at timestamptz,
  -- Human-readable outcome ("13 orgs captured", "Xero session expired — log
  -- in", "Chrome not running"). Never carries figures.
  result_note text
);

comment on table public.recon_round_requests is
  'Queue for Xero badge recon-round runs. Written by the coach-gated API '
  'route and the morning schedule; consumed by the Mac-side watcher that '
  'launches the Chrome-driven capture. Service-role only.';

-- Server-only table: the API route and the local watcher both use the
-- service key. RLS on with no policies = no access for anon/authenticated.
alter table public.recon_round_requests enable row level security;

create index if not exists recon_round_requests_status_idx
  on public.recon_round_requests (status, requested_at desc);

-- At most ONE live (pending/running) request at a time — DB-level backstop
-- for the read-then-insert dedupe in the route and the watcher. The claim
-- UPDATE (pending -> running) mutates the same row, so it never violates.
create unique index if not exists recon_round_requests_one_live
  on public.recon_round_requests ((true))
  where status in ('pending', 'running');

commit;
