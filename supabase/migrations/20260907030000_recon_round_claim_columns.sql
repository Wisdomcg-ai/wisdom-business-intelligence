-- Recon-round worker API hardening (multi-runner port, 7 Sep 2026).
--
--   claim_nonce     — minted server-side at claim; a stamp must present it,
--                     so a stolen RECON_WATCHER_TOKEN cannot finalize a run
--                     it did not claim.
--   roster_snapshot — the roster assigned at claim time; 'done' verification
--                     checks captures against THIS (server-written) list, so
--                     mid-run roster growth or a transient read failure
--                     cannot wrongly fail a successful round — and a runner
--                     still cannot supply its own roster.

begin;

alter table public.recon_round_requests
  add column if not exists claim_nonce text,
  add column if not exists roster_snapshot jsonb;

commit;
