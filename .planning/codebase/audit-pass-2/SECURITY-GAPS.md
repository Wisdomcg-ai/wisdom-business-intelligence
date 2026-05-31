# Security Gap-Audit — Pass 2 (Net-New)

**Date:** 2026-05-31
**Branch/commit:** `main` @ `e1b4e7c7` (Phase 70 merged)
**Scope:** Security / access-control lane only. Diagnosis-only (no code run, no DB, no network).
**Goal:** Surface findings the first audit (C-01..C-40 / R1..R28) MISSED, plus Phase-70 drift. NET-NEW only.
**Method:** Enumerated all 130 `src/app/api/**/route.ts`, classified each by client type (service-role vs auth-bound/RLS) and access-check presence; read the Phase-65 section-permission layer, CSRF lib, middleware, report-token, cron auth, and all post-baseline RLS migrations.

---

## (a) Net-New Findings

### SEC-N1 · `monthly-report/templates` is not the only fully-unauthenticated service-role route — `Xero/employees` is worse
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **Evidence:** `src/app/api/Xero/employees/route.ts:8` (module note), `:55-64` service-role `getSupabaseAdmin()`, `:108-119` GET takes `business_id` from query with **zero** `auth.getUser()` / access check (confirmed: no `getAuthenticatedUser`, `verifyBusinessAccess`, `owner_id`, or `system_roles` anywhere in file). It resolves the tenant's Xero connection via service-role and calls the live Xero Payroll API.
- **Impact:** Any unauthenticated caller who supplies any tenant's `business_id` gets that tenant's **full payroll roster live from Xero** — employee full names, emails, job titles, annual salaries, hourly rates, hours, pay frequency. This is live PII + compensation data, arguably more sensitive than the report-template rows R24 covers, and it requires NO session at all.
- **Why pass 1 missed it:** R24/C-36 fixated on the `templates` route as "the worst instance of C-07"; the hunt for *other* no-auth service-role routes was deferred ("also audit the other 58 raw-client sites"). `employees` slipped through because it's framed as a Xero-integration GET, not a data route.

### SEC-N2 · Section-permission enforcement is LOG_ONLY by default → 8 service-role monthly-report routes are cross-tenant IDOR unless an env var is set
- **Sev:** CRITICAL (HIGH if `SECTION_PERMISSION_ENFORCE=true` is actually set in prod) · **Effort:** S · **Fork:** CODE
- **Evidence:**
  - Gate is set-but-soft: `src/lib/permissions/sectionPermissionConfig.ts:18-19` (`SECTION_PERMISSION_ENFORCE = process.env... === 'true'`, **default false**), `:50-76` (on `allow:false` it logs to Sentry and `return null` → route proceeds in LOG_ONLY).
  - The 8 routes whose ONLY access gate is this soft layer (confirmed: no `owner_id`/`assigned_coach`/`system_roles`/`verifyBusinessAccess` fallback, all use service-role client): `monthly-report/account-mappings/route.ts` (GET/POST/PUT), `auto-map/route.ts` (POST), `commentary/route.ts` (POST), `settings/route.ts` (GET/POST), `snapshot/route.ts` (GET/POST), `wages-detail/route.ts` (POST), `subscription-detail/route.ts` (POST), `full-year/route.ts` (POST). Representative: `account-mappings/route.ts:12-15,39-52,159-181`.
  - `SECTION_PERMISSION_ENFORCE` appears in NO committed config (`vercel.json`, repo `.env*`), so the deployed default is LOG_ONLY unless flipped in the Vercel dashboard.
- **Impact:** With the default, any authenticated user passing a foreign `business_id` can READ another tenant's account mappings / report settings / snapshots / wages detail / subscription detail / full-year P&L, and WRITE account mappings, auto-map, commentary, settings, and snapshots into another tenant — all via service-role (RLS cannot save these). The cross-tenant attempt is merely *logged*, not blocked.
- **Why pass 1 missed it:** The Phase-65 gate *looks* like enforcement at the call site; you have to read `enforceSectionPermission` to see it's a no-op by default. Pass 1's coverage check would have seen "a permission call exists" and moved on. The fail-open is in the helper, not the route.
- **Contrast (clean):** The sibling cashflow service-role routes (`forecast/cashflow/settings|capex|profiles|bank-balances|sync-balances|xero-actuals`) ALSO call the section gate but additionally hard-gate with `verifyBusinessAccess` — they are safe regardless of the env var. And `monthly-report/consolidated*`, `generate`, `sync-xero` hard-gate with `owner_id/assigned_coach/system_roles`. The 8 above are the unprotected subset.

### SEC-N3 · `monthly-report/debug` dumps a tenant's full P&L with auth-only, no access check
- **Sev:** HIGH · **Effort:** S · **Fork:** CODE
- **Evidence:** `src/app/api/monthly-report/debug/route.ts:14-17` module-level service-role client; `:19-32` checks `auth.getUser()` then takes `business_id` from query — and has **no** access check and does **not** even call the section gate (confirmed: 0 `enforceSectionPermission`, 0 owner/coach refs). `:37-67` reads `financial_forecasts`, `forecast_pl_lines`, `xero_pl_lines_wide_compat` (with `monthly_values`), and `account_mappings` for that `business_id` via service-role.
- **Impact:** Any logged-in user (any client of any tenant) can pass another tenant's `business_id` and receive a full diagnostic dump: forecast lines, live Xero P&L monthly values, sample actuals, and mappings. Pure cross-tenant financial IDOR.
- **Why pass 1 missed it:** It's a "debug" route, easy to assume it's dev-only, but it ships in `src/app/api` with `export const dynamic` and no env guard.

### SEC-N4 · Split-brain super-admin source: 4 high-privilege routes gate on `users.system_role` while everything else uses the `system_roles` table
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **Evidence:** Canonical source is the `system_roles` table — used by ~50 routes and every RLS helper (`baseline_schema.sql:116,132,250,306,349`, `auth_is_super_admin()`). But these gate on a DIFFERENT store, the `users.system_role` column: `admin/reset-password/route.ts:64-71`, `email/send/route.ts:89-95`, `admin/activity/route.ts:125-131`, `admin/coaches/route.ts:43-45`.
- **Impact:** Two authorization stores that can drift. If `users.system_role` is ever populated/updatable independently of `system_roles` (the codebase already has a documented "`public.users` assumption" hazard — see MEMORY `feedback_executor_schema_deviations`), then: (a) a true super_admin present only in `system_roles` is wrongly 403'd on **password reset for any user** (`admin/reset-password` is the highest-privilege route — it resets arbitrary user passwords); or worse (b) anyone whose `users.system_role` says `super_admin` but who is NOT in `system_roles` gains super-admin on these 4 routes — a privilege-escalation surface invisible to the canonical RLS model. A single source of super-admin truth is an access-control invariant; two is a bug.
- **Why pass 1 missed it:** R16/C-12/C-16 scoped the *divergent-impl* finding to `verifyBusinessAccess`. The super_admin-source divergence is a separate axis and wasn't enumerated.

### SEC-N5 · `email/send` lets any authenticated user send WisdomBI-branded transactional email (incl. "password-reset"/"invitation") to an arbitrary recipient with attacker-controlled links
- **Sev:** HIGH · **Effort:** S · **Fork:** CODE
- **Evidence:** `src/app/api/email/send/route.ts:46-85` — for `type` in `client-invitation`, `password-reset`, `session-reminder`, `message-notification`, it sends to `params.to` (caller-supplied) with caller-supplied `resetUrl`/`loginUrl`/`tempPassword`/`messagePreview`/names. Only `type: 'custom'` is gated to super_admin (`:87-100`). Auth + CSRF + (in-memory, ineffective per C-08) rate-limit are present, but **no** check that `params.to` or the named business relates to the caller.
- **Impact:** A phishing primitive. Any client account can emit a legitimately-signed email from the trusted `cfo@wisdombi.ai` sender (MEMORY `project_resend_sender`) that says "Reset your password" / "You've been invited" and points the victim at an attacker URL. SPF/DKIM pass; it's indistinguishable from a real WisdomBI email. The C-08 rate limiter offers near-zero throttle in prod.
- **Why pass 1 missed it:** The email route was treated as infra plumbing; recipient/parameter authorization wasn't examined.

### SEC-N6 · RLS: `xero_balance_sheet_lines` policy bypasses the canonical `auth_get_accessible_business_ids()` bridge — omits team members and the dual-ID path
- **Sev:** MEDIUM · **Effort:** S · **Fork:** BOTH
- **Evidence:** `supabase/migrations/20260420032941_consolidation_bs_translation.sql:98-104` — the `_coach_all` policy is hand-rolled: `EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()))`. It does NOT call `auth_get_accessible_business_ids()`. Its sibling `xero_pl_lines` (`20260428000006_xero_pl_lines_rls.sql:27-32`) and `xero_bs_lines` (`20260430000010_xero_bs_lines.sql:113-119`) DO use the helper.
- **Impact:** This is exactly the R2/C-02 "new table omits the bridge" pattern, on a specific table the first pass never enumerated. Consequences: (a) **active team members** (`business_users`) cannot see consolidated balance-sheet rows for their own business; (b) any BS row keyed by `business_profiles.id` instead of `businesses.id` (the dual-ID problem this codebase is steeped in) is invisible to everyone except super_admin/service-role — a silent-empty surface. Also `:136` `GRANT ALL ... TO "anon"` is over-broad (benign today because no anon-matching USING clause exists, but sloppy).
- **Why pass 1 missed it:** R2 corrected the *helper* to be dual-tolerant and flagged the risk abstractly ("any new table whose policy omits the bridge"); it did not grep the post-baseline migrations to find the concrete offender.

### SEC-N7 · CSRF double-submit token exists but is enforced on only 5 of ~80 mutating routes
- **Sev:** MEDIUM (defense-in-depth; partly mitigated by `sameSite:'strict'`) · **Effort:** M · **Fork:** CODE
- **Evidence:** Working impl at `src/lib/security/csrf.ts:32-85` (timing-safe double-submit, sensible skip-list). Cookie set in `src/middleware.ts:24-32`. But `csrfProtection()` is called in only: `auth/reset-password`, `admin/reset-password`, `team/remove-member`, `team/invite`, `email/send`. The other ~75 mutating routes never call it.
- **Impact:** The CSRF control is real but ~94% unapplied. The blast radius is limited because the `csrf_token` cookie is `sameSite:'strict'` and Supabase auth is cookie-based (browsers won't send auth cookies cross-site for state-changing top-level POSTs in modern defaults), so this is defense-in-depth, not a standalone hole. Still: a stated security control applied to 5/80 routes is a finding, and any future relaxation of sameSite (or a sameSite-bypass technique) exposes the unprotected 75.
- **Why pass 1 missed it:** "CSRF cookie exists in middleware" was noted as present; the per-route *application* coverage wasn't audited.

### SEC-N8 · Any coach can mutate ANY tenant's Xero tenant-connection mapping (cross-coach horizontal IDOR)
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **Evidence:** `src/app/api/consolidation/tenants/[connectionId]/route.ts:14-15` (documented: "No business-ownership check at this layer — any coach/super_admin is trusted with any connection") and `:49-58` (role gate is coach-OR-super_admin only).
- **Impact:** A coach assigned only to client A can PATCH the Xero connection-to-business mapping of client B (whom they don't coach). Within the multi-coach model this is a horizontal privilege issue — one coach can repoint/relabel another coach's client's Xero linkage. Marked "intentional" in code, but the "any coach → any connection" scope was never surfaced for a decision.
- **Why pass 1 missed it:** Consolidation routes were assumed coach-gated = safe; the *intra-coach* scope wasn't examined.

### SEC-N9 · Xero access-token prefix logged
- **Sev:** LOW · **Effort:** S · **Fork:** CODE
- **Evidence:** `src/app/api/Xero/subscription-transactions/route.ts:599` — `console.log('[Subscription Txns] Fetching accounts with token:', accessToken?.substring(0, 20) + '...')`.
- **Impact:** First 20 chars of a Xero JWT (header + start of payload) reach logs. Not directly exploitable (truncated), but token material in logs is a hygiene violation and a bad pattern to fork. No full tokens/secrets are logged anywhere (verified) and no secrets appear in URL params (verified).
- **Why pass 1 missed it:** Sub-finding granularity; the log-hygiene sweep wasn't run.

---

## (b) Route-by-Route Auth Coverage Table

Legend — Client: `SVC`=service-role (RLS-bypassing, needs app-layer authz) · `RLS`=auth-bound client (RLS-protected). Gate: `hard`=owner/coach/super_admin or `verifyBusinessAccess` · `soft`=Phase-65 section gate ONLY (LOG_ONLY default) · `rls`=relies on RLS · `role`=role-only (coach/super_admin) · `self`=user-scoped · `none`=auth only, no access check · `n/a`=public/OAuth/cron by design.

| Route | Verbs | Client | Auth? | Gate | Note |
|---|---|---|---|---|---|
| Xero/employees | GET | SVC | **NO** | **none** | **SEC-N1** live payroll PII, no auth |
| Xero/callback | GET | SVC | n/a | n/a | OAuth, signed-state validated (clean) |
| Xero/complete-connection | POST | SVC | yes | hard | owner/coach (clean) |
| Xero/sync, sync/all | GET/POST | SVC/RLS | yes | hard | owner/coach |
| Xero/disconnect, reactivate, status, accounts, balance-sheet, reconciliation, pl-summary, refresh-pl, chart-of-accounts*, subscription-transactions, sync-forecast | mixed | mixed | yes | hard | verifyBusinessAccess / owner-coach (clean; N9 log nit in subscription-transactions) |
| monthly-report/templates | GET/POST/PUT/DELETE | SVC | **NO** | **none** | R24/C-36 (still open) |
| monthly-report/debug | GET | SVC | yes | **none** | **SEC-N3** full P&L IDOR |
| monthly-report/account-mappings | GET/POST/PUT | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/auto-map | POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/commentary | POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/settings | GET/POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/snapshot | GET/POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/wages-detail | POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/subscription-detail | POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/full-year | POST | SVC | yes | **soft** | **SEC-N2** |
| monthly-report/consolidated, consolidated-bs, consolidated-cashflow, generate, sync-xero | POST | SVC | yes | hard | owner/coach/super_admin (clean) |
| forecast/cashflow/{settings,capex,profiles,bank-balances,sync-balances,xero-actuals} | mixed | SVC | yes | hard | verifyBusinessAccess (clean; soft gate is bonus) |
| forecast/cashflow/{assumptions,payroll-summary}, dashboard-actuals, quarterly-summary, [id]/*, seed-from-prior | mixed | RLS | yes | rls/soft | auth-bound, RLS-protected |
| forecasts/scenarios | POST | SVC | yes | none (POST) | R26/C-38 (still open) |
| forecasts/versions | POST/GET | RLS | yes | rls | no explicit check but auth-bound → RLS limits (acceptable, note) |
| forecasts/{export,import-csv,apply-scenario,audit-log} | mixed | mixed | yes | hard | forecast-ownership + owner/coach (clean) |
| admin/clients, coaches, demo-client, activity, check-auth, resend-invitation | mixed | SVC | yes | role | super_admin via system_roles (clean) |
| admin/reset-password | POST | SVC | yes | role | **SEC-N4** gates on `users.system_role` not system_roles; +CSRF |
| email/send | POST | RLS | yes | self+role | **SEC-N5** arbitrary recipient on templated types; custom→super_admin |
| email/test | POST | — | yes | role | super_admin (clean) |
| consolidation/businesses/[id], forecasts/[forecastId], fx-rates* | mixed | SVC | yes | role+access | coach/super_admin + business access (clean) |
| consolidation/tenants/[connectionId] | PATCH | SVC | yes | role | **SEC-N8** any coach → any connection |
| documents, documents/[id]/download | GET/POST | RLS | yes | hard | owner/coach + 60s signed URL (clean) |
| notifications/create | POST | RLS | yes | hard | coach/team relationship verified (clean) |
| cron/{sync-all-xero,reconciliation-watch,weekly-digest,daily-health-report} | GET | SVC | n/a | bearer | R4 residual — negated-compare form, fails closed for normal req (see drift) |
| cron/refresh-xero-tokens | GET | SVC | n/a | bearer | explicit `!cronSecret` guard (correct) |
| auth/reset-password, update-password | POST/GET | SVC | n/a | token | password-reset token table w/ expiry+used_at +CSRF (clean) |
| auth/logout | POST | RLS | yes | self | clean |
| health | GET | — | n/a | n/a | public health (clean) |
| reports/view/[token] (page) | — | n/a | token | HMAC | signed token, NO EXPIRY = R9/C-15 (still open) |
| kpis | GET/POST/DELETE/PATCH | SVC | yes | hard | weak local verifyBusinessAccess = R16/C-12 (still open) |
| coach/*, analytics/*, cfo/* | mixed | RLS | yes | hard/role | owner/coach/super_admin (clean) |
| chat/messages, coach-questions, ideas/[id]/*, todos/[id]/*, processes*, sessions*, strategic-initiatives, plan-snapshots, goals*, annual-plan, business-profile, activity-log*, subscription-budgets, team/org-chart, ai/*, ai-assist, wizard/chat, forecast-wizard-v4, actions, business-profile | mixed | RLS | yes | rls/self | auth-bound → RLS-protected (no SVC bypass) |

*Routes not individually listed were verified to use the auth-bound RLS client; RLS provides the tenant boundary even where explicit app-layer checks are thin.*

---

## (c) Confirmations (checked — already-covered or genuinely clean)

- **R24/C-36** (`monthly-report/templates` no-auth service-role): **still open, unchanged.** `route.ts:8-11` module-level service-role; all four verbs gate only on `business_id` presence.
- **R26/C-38** (`forecasts/scenarios` POST forecast-ownership): **still open.** Service-role, POST lacks the access check GET performs.
- **R4/C-04** (cron fail-open): see Phase-70 drift below — code now uses the negated-compare form (fails closed for normal requests); residual `Bearer undefined` edge remains on 4 routes.
- **R9/C-15** (report tokens never expire): **confirmed still true** — `report-token.ts:6-7` documents "tokens do NOT encode an expiry."
- **R16/C-12** (kpis weak `verifyBusinessAccess`): **still present** (`kpis/route.ts` local copy).
- **RLS new-table bridge:** `xero_pl_lines`, `xero_bs_lines`, `sync_jobs`, `cfo_email_log`, `cron_heartbeats` all correctly scope `USING(true)` to `service_role` and use `auth_get_accessible_business_ids()` for authenticated. Only `xero_balance_sheet_lines` deviates → **SEC-N6**.
- **No RLS-disabled tables** found in post-baseline migrations. No authenticated-facing `USING(true)` policies (all are `TO service_role`).
- **Secrets in URLs:** none found. **Full tokens/secrets in logs:** none (only the 20-char prefix in SEC-N9).
- **Open-redirect (`?next=`):** **clean.** Middleware sets `next` to internal `pathname+search` only (`middleware.ts:105`); the authenticated bounce-back validates `rawNext.startsWith('/') && !startsWith('//')` (`:133-135`).
- **OAuth state (Xero callback):** **clean** — signed state with 10-minute max-age (`Xero/callback` ~`:290-300`), and `xero-client.ts:70-73` rejects state mismatch.
- **Password-reset flow:** **clean** — dedicated `password_reset_tokens` table with `expires_at`/`used_at` enforcement, +CSRF, +rate-limit.
- **Document download:** **clean** — owner/coach check + 60-second Supabase signed URL.
- **Encryption (R18/C-22):** not re-examined in depth; out of this pass's net-new scope.

---

## (d) Phase-70 Drift

- **Cron auth pattern changed (favorable).** R4/C-04 originally described a *positive-match* fail-open. The current tree shows all four routes using the **negated** compare `if (auth !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`:
  `cron/sync-all-xero:34`, `cron/reconciliation-watch:44`, `cron/weekly-digest:17`, `cron/daily-health-report:17`. This **fails closed for normal/empty requests** even when `CRON_SECRET` is unset. The only residual is an attacker sending the literal string `Bearer undefined` while `CRON_SECRET` is unset — the narrow window R4's "CORRECTED" note already acknowledged. `cron/refresh-xero-tokens:126-129` remains the gold standard with an explicit `if (!cronSecret) return 401` and an inline comment (`:123`) calling out the looser form as inferior. **Net:** R4 is largely mitigated in code; the remaining gap is the 4 routes lacking the explicit `!cronSecret` guard. Treat as a 1-line hardening, not a live critical.
- **Phase 69 added `cron_heartbeats`** (`20260530000000`): RLS correct (super_admin SELECT, explicit no-update/no-delete `USING(false)`, service_role writes). Clean.
- **Phase 70 (data backfill / migration-debt)** introduced no new routes and no new authenticated-facing RLS policies; no access-control regressions observed from the merge itself. The SEC-N1..N6 holes pre-date Phase 70 (Phases 35/44/52/54/65).
- **No new service-role routes** were added that lack auth beyond the pre-existing set.

---

## Ranked net-new severity roll-up

1. SEC-N1 (CRITICAL) — Xero/employees no-auth live payroll PII.
2. SEC-N2 (CRITICAL/HIGH) — 8 monthly-report routes fail-open via LOG_ONLY section gate.
3. SEC-N3 (HIGH) — monthly-report/debug full-P&L IDOR.
4. SEC-N4 (HIGH) — split-brain super-admin source (`users.system_role` vs `system_roles`).
5. SEC-N5 (HIGH) — email/send arbitrary-recipient phishing primitive.
6. SEC-N6 (MEDIUM) — xero_balance_sheet_lines RLS omits canonical bridge.
7. SEC-N7 (MEDIUM) — CSRF applied to 5/80 routes.
8. SEC-N8 (MEDIUM) — any coach can PATCH any tenant's Xero connection.
9. SEC-N9 (LOW) — Xero token prefix logged.
