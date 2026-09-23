-- SECURITY — close unauthenticated access to five dead account-management
-- SECURITY DEFINER functions (found 23 Aug 2026 while verifying the grants on
-- save_assumptions_and_materialize).
--
-- THE HOLE. `reset_user_password(p_user_id uuid, p_new_password text)` is
-- SECURITY DEFINER with NO authorization check of any kind:
--     UPDATE auth.users SET encrypted_password = crypt(p_new_password, ...)
--     WHERE id = p_user_id;
-- and `anon` — the unauthenticated PostgREST role, whose key ships publicly in
-- the client bundle — held EXECUTE on it. Anyone with a user's UUID could set
-- that user's password and sign in as them. `create_app_user` is the same
-- shape: no check, INSERTs straight into auth.users with the email
-- pre-confirmed.
--
-- Revoking `anon` alone is NOT sufficient: with only that removed, any
-- logged-in client could still reset a coach's or super-admin's password by
-- UUID. `authenticated` is revoked too. service_role keeps EXECUTE, so a
-- legitimate server-side admin flow (and the skipped-in-CI SEC-05 SQL test,
-- which authenticates as service_role) is unaffected.
--
-- SAFE TO APPLY: all five have ZERO callers anywhere in the codebase
-- (src/ and scripts/, all file types), and every supabase.rpc() name in the
-- repo is a string literal, so none can be reached by dynamic dispatch.
-- These are dead functions with a live attack surface.
--
-- NOTE: the exposure was documented in passing back in Phase 46 — the SEC-05
-- test header records "granted to anon/authenticated/service_role ... so anyone
-- with the anon key can call them" — but only input VALIDATION was added then;
-- the grants were never tightened.
--
-- Reversible: re-GRANT EXECUTE to the roles if a caller is ever added. The
-- better long-term move is to DROP these five outright (they are dead), which
-- is deliberately left as a separate decision.

revoke all on function public.reset_user_password(uuid, text) from public, anon, authenticated;
revoke all on function public.create_app_user(text, text, text) from public, anon, authenticated;
revoke all on function public.create_client_account(text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_user_setup(uuid) from public, anon, authenticated;
revoke all on function public.create_test_user(text, text) from public, anon, authenticated;

grant execute on function public.reset_user_password(uuid, text) to service_role;
grant execute on function public.create_app_user(text, text, text) to service_role;
grant execute on function public.create_client_account(text, text, uuid) to service_role;
grant execute on function public.complete_user_setup(uuid) to service_role;
grant execute on function public.create_test_user(text, text) to service_role;

comment on function public.reset_user_password(uuid, text) is
  'DANGEROUS: sets any user password with no authorization check. service_role only — never grant to anon or authenticated. Currently uncalled; prefer dropping it.';
comment on function public.create_app_user(text, text, text) is
  'DANGEROUS: inserts into auth.users with no authorization check. service_role only. Currently uncalled; prefer dropping it.';
