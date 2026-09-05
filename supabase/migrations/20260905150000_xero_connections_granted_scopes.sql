-- Xero connections — record which OAuth scopes each connection actually holds.
--
-- Context (XERO-BUDGET-SEED-PLAN.md, PR 1): the forecast wizard is gaining an
-- opt-in "Start from Xero budget" seed, which needs the
-- `accounting.budgets.read` scope. Adding a scope to the app only takes effect
-- for an org once that org re-consents, so during the reconnect round Matt
-- needs to see which of the 13 orgs have granted it. Nothing recorded this
-- before: the callback stored tokens only.
--
--   granted_scopes    — the scopes on the most recent token we received for
--                       this connection (from the token response's `scope`, or
--                       the access token's JWT `scope` claim). Null = not yet
--                       observed (rows predating this column, until their next
--                       6-hourly refresh writes it).
--   scopes_granted_at — when granted_scopes was last written.
--
-- The runtime truth for any feature is still the API response (a 403 from the
-- gated endpoint); these columns are the fleet view, not the gate.

begin;

alter table public.xero_connections
  add column if not exists granted_scopes text[],
  add column if not exists scopes_granted_at timestamptz;

comment on column public.xero_connections.granted_scopes is
  'OAuth scopes held by the most recent token for this connection (sorted, '
  'de-duplicated). Written on connect and on every token refresh. Null until '
  'first observed. Fleet visibility only — features gate on the API response.';
comment on column public.xero_connections.scopes_granted_at is
  'When granted_scopes was last written.';

commit;
