# WisdomBI Production DB Security Audit — 24 Aug 2026

Read-only catalog + code sweep, 5 dimensions, every CRITICAL/HIGH adversarially verified.
Method: 12-agent workflow. 0 findings refuted. Full raw: db-security-audit-findings.json

## Self-verified facts (re-run against live catalog after the workflow)
- 164/164 public tables have RLS ENABLED. All 5 public views are security_invoker=on.
- Dual-ID hazard NEUTRALIZED: auth_get_accessible_business_ids() unions BOTH businesses.id
  AND business_profiles.id into one uuid[], so `business_id = ANY(...)` is correct in every
  policy regardless of id-space. No cross-tenant READ leak found.
- The 5 account-management functions revoked 23 Aug are STILL {postgres,service_role} only.
- CONFIRMED anon-granted (this audit's headline): save_assumptions_and_materialize AND
  create_active_forecast_locked (both true/true). Sibling activate_forecast_locked = anon:false.
- ROOT CAUSE (GRANT-03) CONFIRMED: pg_default_acl for postgres AND supabase_admin grant anon
  EXECUTE on every FUTURE public function, and anon=arwdDxtm (full DML) on every future table.
  That is why the definer-leaks-to-anon class keeps recurring.

## SYNTHESIS

Catalog confirmed live. Producing the final audit.

---

# WISDOMBI PRODUCTION DATABASE — FINAL SECURITY AUDIT (uudfstpvndurzwnapibf, 24 Aug 2026)

Access: read-only catalog + code reasoning. No function was executed against prod. All ACL/prosecdef/proconfig facts below re-confirmed live in one consolidated `pg_proc` query at audit close (oids cited).

## 1. EXECUTIVE VERDICT

**The read side is tight; the write side is not.** Tenant isolation for *reads* is soundly built and I found no cross-tenant read leak: 164/164 public tables have RLS enabled, all 5 public views are `security_invoker=on` (no owner-privilege view bypass), and — critically for this codebase — the dual-ID hazard is **neutralized at the RLS layer**, not exploitable: `auth_get_accessible_business_ids()` unions both `businesses.id` and `business_profiles.id` into one uuid[], so `business_id = ANY(...)` is correct regardless of which id-space a table's column uses (verified for `xero_connections`/businesses-space and `sync_jobs`/profiles-space). The five account-management definers fixed 23 Aug are **confirmed still revoked, no regression** (reset_user_password/create_app_user/create_client_account/complete_user_setup/create_test_user all now `{postgres, service_role}` only, anon_exec=false, auth_exec=false — oids 16519/16497/16499/16496/16501). [BASE-01, VIEW-05, RLS dim, DEF-00]

**The single worst thing:** a class of `SECURITY DEFINER` write RPCs in the PostgREST-exposed `public` schema that carry `EXECUTE` to `anon` (and several to `PUBLIC`) with **no internal authorization check**. Because a definer function runs as `postgres` and bypasses RLS, a direct `POST /rest/v1/rpc/<fn>` with the public anon key (which ships in the browser bundle) sidesteps every app-route ownership check. The two most dangerous are **`save_assumptions_and_materialize`** (oid 147803 — overwrites `financial_forecasts.assumptions` and, on `p_force_full_replace=true`, DELETEs non-manual `forecast_pl_lines` then rewrites caller-supplied P&L) and **`create_active_forecast_locked`** (oid 148881 — deactivates a business's live forecast and injects an attacker-shaped `is_active=true` row). Both confirmed anon_exec=true AND auth_exec=true, SECURITY DEFINER.

**Why HIGH, not CRITICAL (non-inflated):** the destructive write is gated on supplying a *valid existing id* the attacker does not have a reachable way to enumerate. `financial_forecasts` reads are RLS-scoped to `authenticated` only (no anon policy → anon SELECT default-denies), forecast_ids are 122-bit random UUIDs, and `financial_forecasts.business_id` FKs to `business_profiles(id)` so a guessed id fails the FK and the whole single-transaction body rolls back. So there is **no self-contained unauthenticated-to-specific-victim path** — it requires an out-of-band known id (or an authenticated tenant who already holds another tenant's business_profiles.id, which appears in app URLs/payloads). That is exactly the rubric's HIGH band ("definer write primitive with weak guard" AND "needs a known id"). **Caveat that would escalate to CRITICAL:** if *any* anon-readable view/function elsewhere leaks a forecast_id or business_profiles.id, the gate falls and these return to CRITICAL. None was found in this review, but the systemic default-privilege posture (GRANT-03) means new leaks can appear silently.

Bottom line: not a breach-in-progress, but a standing set of unauthenticated write/DoS/tamper primitives against client financial data that should be closed promptly. Confidence high on the catalog facts; the "not CRITICAL" rests on the absence of an id-leak, which is an ongoing invariant to protect, not a permanent guarantee.

## 2. RANKED REMEDIATION PLAN

### Group A — Quick-win REVOKEs (migration; safe, no legitimate caller relies on the anon/PUBLIC grant)
Every function below is called only from server routes that already run their own `getUser()` + business-access check via the RLS-respecting or service-role client; the anon/PUBLIC EXECUTE grant is superfluous attack surface. Pattern: `REVOKE EXECUTE ON FUNCTION public.<fn>(<sig>) FROM anon, authenticated, PUBLIC;` leaving `{postgres, service_role}` (mirror the 23-Aug account-function fix). **Re-issue the REVOKE after any DROP+CREATE** (DROP discards the ACL — CLAUDE.md invariant). Order by severity:

1. **`save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean)`** — HIGH. [RLS-01, DEF-01, GRANT-02] oid 147803. Highest priority: it is the one with a destructive DELETE path.
2. **`create_active_forecast_locked(uuid,integer,text,jsonb)`** — HIGH. [RLS-02, DEF-02, GRANT-01] oid 148881. Match its sibling `activate_forecast_locked`, which already has anon_exec=false (oid 156095).
3. **`begin_xero_sync_job(uuid)` / `finalize_xero_sync_job(uuid,text,int,int,int,jsonb,jsonb,text)`** — MEDIUM. [RLS-04, DEF-07] oids 147697/147698. Cron/service-role primitives; sync-pipeline DoS. service_role-only.
4. **`upsert_category_pattern(uuid,text,text,text)`** — MEDIUM. [RLS-03, DEF-03] oid 16540 (also holds a `PUBLIC` grant). Poisons P&L account categorization.
5. **`lock_forecast_version(uuid)`** [DEF-04, oid 16516], **`create_version_snapshot(uuid,text)`** [DEF-05, oid 16502] — MEDIUM. Both also `PUBLIC`-granted. Forecast tamper/DoS/clone-by-id.
6. **`assign_coach_to_process(uuid,uuid)`** [DEF-06, oid 16491], **`create_quarterly_swot(uuid,text,integer)`** [DEF-08, oid 16500] — MEDIUM. Both `PUBLIC`-granted.
7. **`cleanup_old_audit_logs()` / `cleanup_expired_password_tokens()`** — LOW. [RLS-07] oids 16495/16494. Both `PUBLIC`-granted maintenance deletes; service_role-only.
8. **`get_or_create_business_profile(uuid)`** [RLS-05, DEF-10, oid 16507], **`get_todo_stats`/`get_user_role`/`get_coach_for_process`** [DEF-09], **`upsert_user_preference`/`increment_custom_kpi_usage`** [DEF-10] — LOW. Low-impact writes / per-id read leaks; revoke anon/PUBLIC.

### Group B — Changes needing care (do NOT bulk-REVOKE; verify the legitimate caller first)
1. **`activate_forecast_locked(uuid)` — authenticated still holds EXECUTE** (anon already gone; oid 156095). MEDIUM. [RLS-06] Any logged-in user can flip *another* tenant's active forecast by id. Preferred fix is defense-in-depth **inside** the function (add `IF NOT public.auth_can_manage_business((SELECT business_id FROM financial_forecasts WHERE id=p_forecast_id)) THEN RAISE`), because the authenticated grant may be load-bearing for the route calling it as the authenticated role — confirm the route path (`forecast-wizard-v4/generate`, `forecast/[id]/recompute`) before removing the grant outright. The same internal-guard hardening is the belt-and-suspenders complement for A.1/A.2 even after the REVOKE.
2. **`conversation_history.rls_access` policy** — INFO/LOW id-space type confusion. [RLS-09] Compares a user_id column against a business-id array; rewrite to match sibling `process_*` policies (`process_id IN (SELECT id FROM process_diagrams pd WHERE can_access_process(pd.user_id))`). Policy edit — test process-diagram access after.
3. **`cashflow_schedules_system_read`** grants `SELECT USING is_system=true` to role public/anon. [RLS-08] Scope to `authenticated`; confirm no future tenant row can carry `is_system=true`. Policy edit — low risk, reference data.
4. **AUTHZ-01 coach-global scoping** — LOW, app code (`verifyBusinessAccess` + inline authorise* in kpis/forecast/annual-plan/subscription-budgets/goals/monthly-report). Not reachable today (single coach). Add `assigned_coach_id`/`business_users` scoping to the coach branch **and a regression test before onboarding a second coach**. Decision needed: is "coach" a global principal?

### Group C — Systemic root cause (migration; do after Group A or the same class recurs)
- **`GRANT-03` — default privileges auto-grant EXECUTE-to-anon on every future public function and full DML-to-anon on every future postgres-owned table.** This is *why* the "definer leaks to anon" incident class keeps recurring (each of the above functions inherited anon at CREATE time). `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;` on both the `postgres` and `supabase_admin` default-ACL rows, so new definers default closed. Keep/add the CI gate that fails any migration granting anon on a SECURITY DEFINER function, and a lint asserting `relrowsecurity` on every new public table. **Test carefully** — this changes the baseline for all future objects; verify no existing deploy step depends on the open default.

### Group D — Hardening / dashboard (LOW/INFO)
- `ADV-02` enable Leaked Password Protection (Auth dashboard — Matt). `ADV-01` add `SET search_path` to the 9 `update_*_updated_at` invoker triggers. `SCHEMA-04` revoke `SELECT` on `extensions.pg_stat_statements*` from PUBLIC. `ADV-03` review/drop the 3 `deprecated_*_backup` tables (retired client data; currently RLS-with-no-policy = fail-closed, safe). `AUTHZ-02` wrap 6 read routes in withSchema/withQuerySchema. `AUTHZ-03` UUID-validate ids before `.or()` template interpolation (injection-shaped, currently trusted-input-only).

## 3. WHAT THIS AUDIT DID NOT COVER (honest coverage boundary)
- **Supabase Auth dashboard config** beyond the two lints surfaced (JWT/session settings, MFA enforcement, email/SMS provider config, redirect allow-lists, RLS on `auth.*`, SAML/SSO) — not inspectable from the SQL catalog.
- **Secrets management & rotation** — whether CRON_SECRET, the service-role/secret key, or Xero OAuth client secrets have leaked or need rotation; only that the secret key is confined to server-only code (AUTHZ-04) was verified.
- **Network / transport / platform** — Vercel edge config, CORS, rate-limiting/WAF, PostgREST server config (the actual `db-schemas`/`pgrst.*` GUCs were not readable from the DB; anon reachability of `public` RPCs is *inferred* from Supabase defaults + the fact the 5 prior account RPCs were anon-exploitable — treat as confirmed but not GUC-verified).
- **No live penetration testing / no exploit execution** — every finding is reasoned from catalog + code per the read-only mandate; no function was called to confirm, so exploitability is argued, not demonstrated.
- **`storage.*` and non-`public` exposed schemas** (`graphql_public`, `realtime`) policies — only `public` was audited in depth.
- **The 3 trigger-return definers** (`audit_employee_changes`, `log_forecast_change`, `notify_coach_forecast_complete`) — not usefully RPC-callable, judged low-risk, not deep-analyzed.
- **Xero OAuth connect-initiation route** (which HMAC-signs `state`) was not fully read; the callback trusts the signed business_id, so any missing check would live at the connect route — flagged as a residual, not cleared.
- **Data-content review** (PII minimization, retention, encryption-at-rest posture of the deprecated backup tables' contents) — out of scope.

Confidence: catalog facts HIGH (re-confirmed at close, oids cited). Severity ratings deliberately non-inflated — the two headline items are HIGH because the cross-tenant-enumeration path required to make them CRITICAL was searched for and not found; that absence is an invariant to protect (GRANT-03), not a proof of permanent safety.

## CONFIRMED CRITICAL/HIGH

### [HIGH] RLS-01 — Unauthenticated SECURITY DEFINER RPC overwrites/deletes ANY tenant's forecast (no auth check)
- object: public.save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean) → writes financial_forecasts, forecast_pl_lines
- exploit: unauthenticated
- remediation: REVOKE EXECUTE ON FUNCTION public.save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean) FROM anon, authenticated; grant only to service_role (the API route already runs server-side and should assert auth_can_manage_business on the forecast's business_id). Re-issue the REVOKE after every DROP+CREATE. Optionally add an internal guard: SELECT business_id INTO v_biz FROM financial_forecasts WHERE id=p_forecast_id; IF NOT auth_can_manage_business(v_biz) THEN RAISE EXCEPTION.

### [HIGH] RLS-02 — Unauthenticated SECURITY DEFINER RPC deactivates/injects active forecasts for ANY business (no auth check)
- object: public.create_active_forecast_locked(uuid,integer,text,jsonb) → writes financial_forecasts
- exploit: unauthenticated
- remediation: REVOKE EXECUTE ... FROM anon, authenticated (leave service_role). The calling API route must assert auth_can_manage_business(p_business_id) before invoking, or add that check inside the function. Re-issue REVOKE after any DROP+CREATE.

### [HIGH] DEF-01 — save_assumptions_and_materialize: anon-granted, no internal auth — overwrites/DELETEs any tenant's forecast P&L by forecast_id
- object: public.save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean)
- exploit: unauthenticated
- remediation: REVOKE EXECUTE ON FUNCTION public.save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean) FROM anon, authenticated; and call it only from the service-role client (like the 5 account fns fixed today), OR add an internal guard: `IF NOT public.auth_can_manage_business((SELECT business_id FROM financial_forecasts WHERE id=p_forecast_id)) THEN RAISE EXCEPTION` and keep the grant. Re-issue the REVOKE after any DROP+CREATE.

### [HIGH] DEF-02 — create_active_forecast_locked: anon-granted, no internal auth — deactivates + inserts financial_forecasts for any business_id
- object: public.create_active_forecast_locked(uuid,integer,text,jsonb)
- exploit: unauthenticated
- remediation: REVOKE EXECUTE … FROM anon, authenticated and invoke via service-role only, OR add `IF NOT public.auth_can_manage_business(p_business_id) THEN RAISE EXCEPTION USING ERRCODE='42501'` at the top. Its sibling activate_forecast_locked already has no anon grant — match that.

### [HIGH] GRANT-01 — SECURITY DEFINER write RPC create_active_forecast_locked is EXECUTE-granted to anon with no internal authorization check — unauthenticated cross-tenant forecast hijack
- object: public.create_active_forecast_locked(uuid,integer,text,jsonb) → financial_forecasts
- exploit: unauthenticated
- remediation: REVOKE EXECUTE ON FUNCTION public.create_active_forecast_locked(uuid,integer,text,jsonb) FROM anon, authenticated; leave only service_role/postgres (the legit caller runs server-side). If the authenticated path must keep DB-level EXECUTE, add an internal guard: verify auth.uid() owns/can-access p_business_id via auth_can_access_business(p_business_id) and RAISE on failure. Sibling activate_forecast_locked already omits anon — match it.

### [HIGH] GRANT-02 — SECURITY DEFINER write/delete RPC save_assumptions_and_materialize is EXECUTE-granted to anon with no authorization check — unauthenticated can wipe and rewrite any forecast's P&L lines
- object: public.save_assumptions_and_materialize(uuid,jsonb,jsonb,boolean) → financial_forecasts, forecast_pl_lines
- exploit: unauthenticated
- remediation: REVOKE EXECUTE ... FROM anon, authenticated; keep service_role/postgres only, OR add an internal guard resolving the forecast's business and calling auth_can_access_business(...) before any write. p_force_full_replace makes the destructive DELETE reachable by an unauthenticated caller — highest priority to close.

## MEDIUM/LOW/INFO
- [INFO] BASE-01 — Baseline: PostgREST exposure is RLS-gated, not bare — 164/164 public tables have RLS enabled, all 5 views are security_invoker | fix: No action from the exposure lints alone. The linter cannot see RLS; treat these 338 WARNs as expected noise for a Supabase app that relies on RLS. Residual risk lives in per-policy correctness (handed
- [INFO] BASE-02 — Baseline + regression PASS: 48 SECURITY DEFINER functions in public, 40 grant anon / 42 grant authenticated; the five fixed today are confirmed revoked | fix: None here — baseline handoff. Definer-function finder should adjudicate the 40 anon-executable + 42 authenticated-executable definers for internal auth guards and write primitives.
- [LOW] ADV-01 — Advisor: 9 updated_at trigger functions have mutable search_path (but all are SECURITY INVOKER, so no privilege escalation) | fix: Defense-in-depth: add `SET search_path = ''` (or `pg_catalog, public`) to each trigger function via ALTER FUNCTION. Low priority given they are invoker-context triggers, not definers.
- [LOW] ADV-02 — Advisor: leaked-password protection (HaveIBeenPwned) disabled in Supabase Auth | fix: Enable Leaked Password Protection in Auth > Policies (Matt to toggle in the WisdomBI Supabase dashboard). Consider a minimum password strength policy at the same time.
- [INFO] ADV-03 — Advisor: 3 deprecated_*_backup tables have RLS enabled but no policy — fail-closed (safe), but they still hold retired client data | fix: Confirm these backups are still needed; if not, drop them to shrink the sensitive-data blast radius. If retained, leave RLS-with-no-policy (fail-closed) as-is — do NOT add a permissive policy.
- [INFO] ADV-04 — Permissive USING(true) SELECT policies grant every authenticated user 3 reference/catalog tables (not tenant financial data) | fix: No change if these remain pure shared-reference/append-log tables. RLS finder should confirm kpi_definitions/benchmarks contain no business_id-scoped rows; if they ever gain a tenant column, replace U
- [MEDIUM] RLS-03 — Unauthenticated SECURITY DEFINER RPC poisons any business's account→category mappings | fix: REVOKE EXECUTE ... FROM anon, authenticated; call only from a server route that has verified auth_can_manage_business(p_business_id), or add the guard inside the function.
- [MEDIUM] RLS-04 — Unauthenticated SECURITY DEFINER RPC injects/manipulates Xero sync jobs for any business (sync DoS) | fix: REVOKE EXECUTE ON begin_xero_sync_job(uuid), finalize_xero_sync_job(...) FROM anon, authenticated — these are cron/service-role primitives and should be service_role-only.
- [MEDIUM] RLS-05 — Unauthenticated SECURITY DEFINER RPC creates business_profiles rows for arbitrary user_ids | fix: REVOKE EXECUTE ... FROM anon (keep authenticated only if the app relies on self-provisioning, and add WHERE p_user_id = auth.uid() enforcement); prefer service_role-only.
- [MEDIUM] RLS-06 — Any authenticated user can flip the active forecast of another tenant (no auth check) | fix: REVOKE EXECUTE ... FROM authenticated; call from service_role after asserting auth_can_manage_business on the forecast's business_id, or add that guard internally.
- [LOW] RLS-07 — Anon can trigger maintenance-delete RPCs (audit_log / password_reset_tokens) | fix: REVOKE EXECUTE ... FROM anon, authenticated; restrict to service_role (invoked by the cron).
- [INFO] RLS-08 — Permissive USING(true)/is_system SELECT policies expose reference tables broadly (non-tenant data) | fix: Acceptable as reference data; if tightening, scope cashflow_schedules_system_read to role authenticated instead of public (remove anon), and confirm no future tenant rows can carry is_system=true.
- [INFO] RLS-09 — conversation_history policy compares a user_id column against a business-id array (id-space type confusion) | fix: Rewrite to: process_id IN (SELECT id FROM process_diagrams pd WHERE public.can_access_process(pd.user_id)) — matching the other process_* policies.
- [MEDIUM] DEF-03 — upsert_category_pattern: PUBLIC/anon-granted, no guard — poisons P&L account categorization for any business_id | fix: REVOKE EXECUTE FROM PUBLIC, anon, authenticated; call via service-role, or guard with auth_can_manage_business(p_business_id).
- [MEDIUM] DEF-04 — lock_forecast_version: PUBLIC/anon-granted, no guard — locks any tenant's forecast (tamper/DoS) | fix: REVOKE FROM PUBLIC/anon/authenticated and call via service-role, or guard on the forecast's business_id via auth_can_manage_business.
- [MEDIUM] DEF-05 — create_version_snapshot: PUBLIC/anon-granted, no guard — clones any forecast row by forecast_id | fix: REVOKE FROM PUBLIC/anon/authenticated; call via service-role or add an ownership guard on the source forecast's business_id.
- [MEDIUM] DEF-06 — assign_coach_to_process: PUBLIC/anon-granted, no guard — sets coach_id on unclaimed process_diagrams | fix: REVOKE FROM PUBLIC/anon/authenticated; call via service-role, or guard with auth_is_super_admin()/coach-of check.
- [MEDIUM] DEF-07 — begin_xero_sync_job / finalize_xero_sync_job: anon-granted, no guard — inject/complete sync_jobs rows (pipeline DoS) | fix: REVOKE FROM anon, authenticated; the cron already runs server-side with elevated creds, so call these via service-role only.
- [MEDIUM] DEF-08 — create_quarterly_swot: PUBLIC/anon-granted, no guard — inserts swot_analyses for any user_id | fix: REVOKE FROM PUBLIC/anon; call via service-role or require auth.uid() = p_user_id / coach-of check.
- [LOW] DEF-09 — Read-only definer helpers leak per-id data to anon (todo counts, role assignments, coach id) | fix: REVOKE FROM PUBLIC/anon; either gate on auth.uid() (return only the caller's own data) or call via service-role from guarded routes.
- [LOW] DEF-10 — upsert_user_preference / get_or_create_business_profile / increment_custom_kpi_usage: unguarded low-impact writes | fix: REVOKE the anon/authenticated grants and call via service-role, or add auth.uid()=p_user_id guards; lowest priority.
- [INFO] DEF-00 — CONFIRMED: five account-management definers correctly revoked; RLS/role helpers safe-by-guard; all definers have search_path | fix: No action on these. Use them as the template: the DEF-01..DEF-10 fixes should mirror the {postgres,service_role}-only ACL applied to the five account functions today.
- [MEDIUM] GRANT-03 — Default privileges auto-grant EXECUTE-to-anon on every future public function and full DML-to-anon on every future postgres-owned table — the systemic root cause of the recurring 'definer function leaks to anon' incident class | fix: ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated; (for both the postgres and supabase_admin default-ACL rows) so new definer functions default to closed a
- [LOW] SCHEMA-04 — extensions.pg_stat_statements is SELECT-granted to PUBLIC and anon holds USAGE on the extensions schema — query-text/parameter leak, but not PostgREST-exposed | fix: Defense-in-depth: REVOKE SELECT ON extensions.pg_stat_statements, extensions.pg_stat_statements_info FROM PUBLIC. No exposed path today, so low urgency.
- [INFO] VIEW-05 — All public views are security_invoker=on and all public tables have RLS enabled — no RLS-bypassing view or exposed table found (coverage/clean) | fix: No action. Maintain the invariant: any new public view over client data must set security_invoker=on, and any new table must ENABLE ROW LEVEL SECURITY (see GRANT-03).
- [INFO] EXT-06 — No outbound/capability extension (http, pg_net, dblink, pg_cron) installed; supabase_vault schema is not anon/authenticated-usable | fix: No action. If pg_net or http is ever added, install it in a non-exposed schema and withhold EXECUTE from anon/authenticated.
- [LOW] AUTHZ-01 — Per-business data endpoints trust the coach role globally, not scoped to assigned_coach_id (latent cross-coach exposure) | fix: Decide explicitly whether 'coach' is a global principal. If coaches should only see assigned clients, add an assigned_coach_id / business_users scope to the coach branch of verifyBusinessAccess and th
- [LOW] AUTHZ-02 — Six service-role routes bypass the Phase-47 withSchema/withQuerySchema Zod wrappers | fix: Wrap these handlers in withQuerySchema/withSchema for consistency with the rest of the API surface, or update the CLAUDE.md invariant to acknowledge these read-only exceptions.
- [INFO] AUTHZ-03 — PostgREST .or() filters built by template interpolation (injection-shaped, currently safe) | fix: Defense-in-depth: prefer discrete .eq()/.in() calls or validate interpolated ids as UUIDs before building .or() strings, so a future refactor that pipes a client-supplied value into one of these filte
- [INFO] AUTHZ-04 — Service-role secret key is correctly confined to server-only code (coverage confirmation) | fix: None required; documented to confirm the boundary was verified in this dimension.
