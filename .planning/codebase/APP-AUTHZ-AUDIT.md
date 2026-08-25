# WisdomBI Application Authorization Audit — 24 Aug 2026

4-finder workflow over 135 routes (32 service-role) + authz helpers, every CRITICAL/HIGH adversarially verified. 0 refuted.
Full findings: app-authz-audit-findings.json

## SYNTHESIS

# WisdomBI — Application Authorization Layer Audit (Final)

## 1. Executive verdict

**The application authorization layer is mostly sound but NOT independently correct.** The dominant, correct pattern is present: per-business routes derive identity from the session, scope coaches to `assigned_coach_id`, check the right ID-space, and require `status='active'` membership (`verifyBusinessAccess`, `requireSectionPermission` both verified correct). Cron routes all carry the fail-closed CRON_SECRET gate. Every non-public route calls `getUser()` first. No unauthenticated cross-tenant path exists.

**The single worst thing: two service-role IDOR write holes reachable by ANY authenticated user today** — `goals/save` (AUTHZ-SR-01) and `team/remove-member` (AUTHZ-SR-02). Both pass an auth gate against a client-supplied `businessId`, then perform the actual RLS-bypassing write keyed on a *different*, unvalidated client id (`profileId` / `memberId`) that is never checked to belong to the authorized business. These are not gated behind the hypothetical second coach — any of the 21 client users who owns/belongs to one business can, with a victim's opaque UUID, overwrite another client's financial goals and strategic plan, or delete another client's team member (and with `deleteCompletely:true`, cascade to full auth-account destruction). The only barrier is knowledge of a non-enumerable UUID, which is why they are HIGH not CRITICAL — but there is **no RLS backstop** because the writes run on the service-role client.

**Reachable vs RLS-capped, quantified:**
- **Genuinely reachable today, no RLS protection:** AUTHZ-SR-01, AUTHZ-SR-02. Exploit needs only a known victim UUID + any single business membership. This is the real exposure.
- **Latent, opens the instant a second coach is provisioned, no RLS protection:** the subscription-budgets route (AUTHZ-SUBBUDGET-01 / AUTHZ-HELPER-01 / AUTHZ-B — three re-verifications of one defect at `subscription-budgets/route.ts:152`) and the two consolidation mutation routes (`tenants/[connectionId]` = AUTHZ-CONSOL-TENANT-03; `forecasts/[forecastId]` = AUTHZ-CONSOL-FORECAST-02). All gate a service-role write on the *global* `role==='coach'` check instead of `assigned_coach_id`. Prod `system_roles` = 1 coach / 2 super_admin / 21 client, so today the sole coach legitimately manages the whole fleet and no boundary is crossed. One `INSERT` into `system_roles` (routine for a coaching platform) makes all of these live cross-client read/write/delete.
- **RLS-capped (wrong pattern, but protected):** the ~11 per-business finance/forecast routes that use the same global-`coach` fallback but run on the *auth-bound* client (AUTHZ-01 group / AUTHZ-HELPER-02). RLS's `auth_get_accessible_business_ids` scopes coaches to assigned businesses, so these are latent best-practice gaps only.

Net: the DB RLS hardening is doing real work and caps a whole class of sloppy inline authz — but it cannot save the ~5 routes that reach for the service-role key, and those are exactly where the exploitable holes are.

## 2. Ranked remediation plan

### Tier A — fix now, safe, no model dependency (reachable today by any authenticated user)

1. **AUTHZ-SR-01 — `goals/save/route.ts:101`.** Stop accepting `profileId` as a write key. Derive it server-side from the already-authorized `businessId` via `resolveBusinessProfileIds(admin, businessId)` (already imported for the KPI branch). If a `profileId` is passed at all, verify `profile.business_id === businessId` and reject on mismatch. Low risk — the KPI branch already does exactly this in the same file.
2. **AUTHZ-SR-02 — `team/remove-member/route.ts:78,96`.** Add `.eq('business_id', businessId)` to both the member `select` and the `delete` (or fetch-then-403 if `member.business_id !== businessId`). Purely additive scoping; cannot lock out a legitimate caller who is acting on their own business.

### Tier B — fix now, but requires verifying the assigned-coach model first (latent; opens on 2nd coach)

These change coach authorization, so confirm the `businesses.assigned_coach_id` model is populated for the live coach before tightening, or you will lock out the platform's one working coach. `verifyBusinessAccess` already implements the correct predicate, so the safest change is to *delegate to it* rather than hand-roll.

3. **subscription-budgets (`route.ts:152`) — one defect, three finding ids (AUTHZ-SUBBUDGET-01, AUTHZ-HELPER-01, AUTHZ-B).** Replace the global `role==='coach'||'super_admin'` clause in `authoriseBusinessAccess` with `businesses.assigned_coach_id === user.id` for the coach path (keep `super_admin` as the only global bypass), or call `verifyBusinessAccess()`. This is the highest-value Tier-B item: it guards GET/POST/DELETE (read, upsert, delete of another client's budgets), all on the service-role client.
4. **AUTHZ-CONSOL-TENANT-03 — `consolidation/tenants/[connectionId]/route.ts:106`.** After the role gate, resolve the connection's owning business (`xero_connections.business_id` is businesses-space) and require caller == that business's `assigned_coach_id` (or super_admin) before the `adminDb` update. Prevents cross-client edits to Xero connection flags (`is_active`, `include_in_consolidation`, `functional_currency`).
5. **AUTHZ-CONSOL-FORECAST-02 / AUTHZ-C — `consolidation/forecasts/[forecastId]/route.ts:146`.** Same fix: load the forecast's `business_id`, resolve dual-ID, verify assigned-coach/super_admin before the service-role `tenant_id` retag. (One verifier rated this MEDIUM — narrower blast radius, single `tenant_id` field — but the pattern and fix are identical to #4; do them together. The sibling `consolidation/businesses/[id]` route already shows the correct `.or()` owner/assigned_coach scoping to copy.)

### Tier C — hardening / correctness (no proven cross-tenant path)

6. **AUTHZ-02 / VALID-D — confirm `ZOD_ENFORCE_ROUTES` in prod (`with-schema.ts`).** The withSchema/withQuerySchema wrappers run observe-only by default; validation is inert unless the env var is set. Set it to `'*'` (or at minimum the id-bearing service-role routes). Until confirmed, treat each handler's own UUID checks as the only gate — which is why the consolidation routes' inline `UUID_REGEX` matters and should be adopted everywhere.
7. **AUTHZ-01 group / AUTHZ-HELPER-02 — the ~11 auth-bound routes with a global `role==='coach'` fallback** (`forecast/[id]` et al.). Standardize on `verifyBusinessAccess()` and delete the inline global-coach clause. RLS-capped today, so this is defense-in-depth, but it removes the latent footgun and makes the app layer correct without leaning on RLS.
8. **AUTHZ-A — `Xero/sync-all` POST.** Any authenticated user can trigger a sync for any business or the whole fleet. Gate `postHandler` via `verifyBusinessAccess`; restrict `all=true` to super_admin. (No data disclosure — a resource/side-effect issue.)
9. **Low/info:** AUTHZ-SR-03 (add `status='active'` to goals/save membership fallback), AUTHZ-SR-04 / ACTIVITY-LOGIN-07 (`activity-log/login` GET+POST — add `verifyBusinessAccess` on the client-supplied `business_id`), AUTHZ-HELPER-04 (forecast DELETE passes a `business_profiles.id` to `requireSectionPermission` — wrong id-space but fails *closed*, false-deny only), AUTHZ-HELPER-03 (section-permission gate ships LOG_ONLY — confirm intended), FXRATES-COACHGLOBAL-08 (fx-rates coach-global on a non-tenant table — acceptable, document). AUTHZ-03 / INJ-E (`.or()` template interpolation) was chased to ground on every instance — no attacker-controlled unvalidated value reaches a filter; UUID-validate before interpolation as cheap defense-in-depth.

## 3. Not covered by this audit

- **DB layer** (out of scope by design): RLS policy correctness, definer-RPC ACLs, cross-tenant DB guards — audited and hardened separately. This audit assumes those hold and only flags where the *app layer* bypasses them via the service-role client.
- **Session/JWT issuance internals** — Supabase Auth token minting, cookie signing, refresh-token rotation, session fixation. Only presence-of-session (`getUser()`) was checked, not the issuance mechanism.
- **Rate-limiting / brute-force / enumeration** beyond noting that the two IDOR paths depend on non-enumerable UUIDs; no audit of whether those UUIDs leak through other endpoints (reports, resolve, URLs) at a rate that makes enumeration practical.
- **Supabase Auth dashboard config** — email-confirmation, password policy, allowed redirect URLs, provider settings.
- **The one unverifiable prod fact:** whether `ZOD_ENFORCE_ROUTES` is actually set in Vercel prod env (finding VALID-D/AUTHZ-02). Read-only prod access confirmed only FK/PK/`system_roles` counts, not env vars.
- **Exhaustive line-by-line read of all ~74 service-role routes** — the ~15 taking a client-supplied business/forecast/connection id under a service-role query were read in full; the remainder were classified by import + gate pattern, not deep-read.

## CONFIRMED CRITICAL/HIGH

### [HIGH] AUTHZ-SR-01 — goals/save trusts client-supplied profileId as the write key — cross-tenant overwrite of financial goals & strategic plans
- src/app/api/goals/save/route.ts:101
- exploit: any-authenticated | rls_capped: False
- fix: Do not accept profileId from the client as a write key. Derive it server-side from the already-authorized businessId via resolveBusinessProfileIds(admin, businessId) (already imported and used for KPIs), or, if a profileId is passed, verify profile.business_id === businessId before use. Reject the request on mismatch.
- evidence: The auth gate (lines 63-96) verifies the caller against `businessId` only (owner / assigned_coach / super_admin / any business_users membership of businessId). It then computes `const saveProfileId = profileId || businessId` (line 101) where `profileId` is an unvalidated, client-supplied field from the request body (destructured line 54, schema `profileId: z.string().optional()` line 16). `saveProfileId` is used verbatim as `business_id` for every subsequent SERVICE-ROLE (RLS-bypassing, `admin = createServiceRoleClient()` line 61) write: business_financial_goals upsert onConflict business_id (

### [HIGH] AUTHZ-SR-02 — team/remove-member never checks that memberId belongs to the authorized business — cross-tenant member removal & account deletion (IDOR)
- src/app/api/team/remove-member/route.ts:78
- exploit: any-authenticated | rls_capped: False
- fix: Scope the member lookup and delete to the authorized business: add `.eq('business_id', businessId)` to both the select (line 78-82) and delete (line 96-99), or fetch the member first and 403/404 if member.business_id !== businessId before any delete.
- evidence: canRemove (lines 50-75) authorizes the caller against the client-supplied `businessId` (owner/assigned_coach/super_admin/business_users admin of businessId). But the member is then loaded and deleted by `memberId` ALONE, with a SERVICE-ROLE client: `.from('business_users').select('user_id').eq('id', memberId).single()` (lines 78-82) and `.from('business_users').delete().eq('id', memberId)` (lines 96-99). There is NO predicate tying memberId's row to businessId. Schema confirms business_users.id is a standalone PK (business_users.business_id FK→businesses, unrelated to the id used here). So an 

### [HIGH] AUTHZ-SUBBUDGET-01 — subscription-budgets trusts the GLOBAL coach role + uses the service-role client, bypassing RLS for cross-client read/write
- src/app/api/subscription-budgets/route.ts:152
- exploit: any-coach-cross-client | rls_capped: False
- fix: Replace the global coach branch with an assigned-coach check: after resolving the business, require biz.assigned_coach_id === user.id for the coach path (mirror cfo/flag-client lines 60-66), or route reads/writes through verifyBusinessAccess() which already scopes coach per-business. Keep super_admin as the only global bypass.
- evidence: authoriseBusinessAccess() falls back to a GLOBAL role check: `if (roleData?.role === 'coach' || roleData?.role === 'super_admin') { return { ok: true } }` (line 845/152 region) — it never scopes the coach to `assigned_coach_id` of the requested business. All GET/POST/DELETE data access then runs through the module-level service-role client `const supabase = createClient(URL, getSupabaseSecretKey())` (line 42), which BYPASSES RLS. So any user whose system_roles.role='coach' can pass ANY business_id/forecast_id and read, upsert, or delete another client's subscription_budgets. RLS on subscriptio

### [MEDIUM] AUTHZ-CONSOL-FORECAST-02 — consolidation/forecasts/[forecastId] PATCH lets ANY coach retag ANY forecast's tenant via the service-role client
- src/app/api/consolidation/forecasts/[forecastId]/route.ts:146
- exploit: any-coach-cross-client | rls_capped: False
- fix: Load the forecast's business_id, resolve dual-ID, and verify the caller is the assigned coach (or super_admin) before the update — or perform the update through an auth-bound client so RLS applies. The sibling consolidation/businesses/[id] route already does the owner/assigned_coach `.or()` scoping; apply the same here.
- evidence: requireCoachOrSuperAdmin() (lines 35-58) only checks system_roles.role in ('coach','super_admin') — no per-business/per-forecast ownership check. The write `adminDb.from('financial_forecasts').update({ tenant_id: normalized }).eq('id', forecastId)` (lines 146-149) uses the service-role client `adminDb` (line 27), bypassing RLS. forecastId is any UUID from the path. A second coach could PATCH the tenant_id of a forecast belonging to another coach's client, corrupting that client's consolidation/budget math. No assigned_coach scoping anywhere in the handler.

### [HIGH] AUTHZ-CONSOL-TENANT-03 — consolidation/tenants/[connectionId] PATCH lets ANY coach edit ANY xero_connections row (service-role, no business scoping)
- src/app/api/consolidation/tenants/[connectionId]/route.ts:106
- exploit: any-coach-cross-client | rls_capped: False
- fix: Resolve the connection's business_id (xero_connections.business_id is businesses-space) and require the caller be that business's assigned coach or super_admin before updating. Do not trust the global coach role for a per-connection mutation.
- evidence: Role gate is global: `if (role !== 'coach' && role !== 'super_admin')` (line 56), and the file header explicitly states 'No business-ownership check at this layer — any coach/super_admin is trusted with any connection.' The write `adminDb.from('xero_connections').update(validation.value).eq('id', connectionId)` (lines 106-109) uses the service-role client (line 30) so RLS is bypassed. connectionId is any UUID from the path. A second coach could rename, reorder, change functional_currency, or toggle include_in_consolidation/is_active on another client's Xero connection — cross-client write affe

### [HIGH] AUTHZ-HELPER-01 — subscription-budgets: service-role reads/writes/deletes gated only by a GLOBAL coach check (any coach reaches any client's budgets)
- src/app/api/subscription-budgets/route.ts:152
- exploit: any-coach-cross-client | rls_capped: False
- fix: Replace the global role check in authoriseBusinessAccess with a per-business predicate: for a coach, require `businesses.assigned_coach_id === user.id` for the resolved businessId (mirror goals/save line 75 or call verifyBusinessAccess(user.id, businessId)). Keep the super_admin global bypass. Since the data ops run on the service-role client, this app-layer check is the ONLY tenant boundary — it must scope the coach.
- evidence: The route builds its DB client with the SECRET key at module scope (line 42-45: `const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, getSupabaseSecretKey())`) so every GET/POST/DELETE query BYPASSES RLS. The only authorization is `authoriseBusinessAccess(businessId)`, whose coach branch is unscoped:
  line 146-154: `const { data: roleData } = await sb.from('system_roles').select('role').eq('user_id', user.id)...; if (roleData?.role === 'coach' || roleData?.role === 'super_admin') { return { ok: true, userId: user.id } }`
There is no `assigned_coach_id === user.id` predicate — ANY user whos

### [HIGH] AUTHZ-B — subscription-budgets grants cross-client read/write/delete to ANY user holding the global 'coach' role (service-role, RLS bypassed)
- src/app/api/subscription-budgets/route.ts:152
- exploit: any-coach-cross-client | rls_capped: False
- fix: Replace the global coach clause with a per-business check (businesses.assigned_coach_id === user.id) — or call the shared verifyBusinessAccess() helper — before any service-role query.
- evidence: authoriseBusinessAccess() falls through to `if (roleData?.role === 'coach' || roleData?.role === 'super_admin') return { ok: true }` (line 152) — a GLOBAL role check, not scoped to businesses.assigned_coach_id. All three handlers then query the service-role client `supabase` (createClient with secret key, line 42) keyed on the caller-supplied business_id: GET (line 174-177), POST upsert (line 255-258), DELETE (line 304-307). Because the query is service-role it bypasses RLS, so a second coach could read, overwrite (onConflict business_id,vendor_key) or delete any other client's subscription_bu

### [HIGH] AUTHZ-C — consolidation tenant + forecast mutation routes trust the global coach/super_admin role with no per-business scoping (service-role writes to any client's Xero connection)
- src/app/api/consolidation/tenants/[connectionId]/route.ts:86
- exploit: any-coach-cross-client | rls_capped: False
- fix: After the role gate, resolve the connection's owning business and require the caller be its assigned_coach_id (or super_admin) before the service-role update; apply the same per-business scoping to consolidation/forecasts/[forecastId].
- evidence: requireCoachOrSuperAdmin() only checks system_roles.role in ('coach','super_admin') globally (route header comment: "No business-ownership check at this layer — any coach/super_admin is trusted with any connection"). PATCH then does service-role `adminDb.from('xero_connections').update(validation.value).eq('id', connectionId)` (line ~86) with only a UUID-format check on connectionId — no verification the connection belongs to the coach's assigned client. Editable fields include is_active and include_in_consolidation, so a second coach could deactivate/alter another coach's client's Xero connec

## MEDIUM/LOW/INFO
- [MEDIUM] AUTHZ-01 — Per-business endpoints grant access on the GLOBAL 'coach' role instead of assigned_coach_id — any coach can reach any client | src/app/api/forecast/[id]/route.ts:109
- [LOW] AUTHZ-SR-03 — goals/save membership fallback omits the status='active' filter | src/app/api/goals/save/route.ts:86
- [LOW] AUTHZ-SR-04 — activity-log/login POST writes user_logins for an arbitrary client-supplied business_id | src/app/api/activity-log/login/route.ts:41
- [INFO] AUTHZ-03 — PostgREST .or() filters built by template interpolation — reviewed, not exploitable | src/app/api/coach/client-completion/route.ts:248
- [MEDIUM] AUTHZ-01-FORECAST-GROUP-04 — Global coach-role fallback (broader than RLS's assigned-coach scope) in several forecast/plan routes | src/app/api/forecast/[id]/route.ts:110
- [MEDIUM] AUTHZ-02-ZOD-OBSERVE-05 — withSchema/withQuerySchema run in OBSERVE mode by default — Zod validation is not enforced at runtime | src/lib/api/with-schema.ts:56
- [INFO] AUTHZ-03-OR-INTERP-06 — PostgREST .or() filters built by template interpolation — reviewed, no attacker-controlled unvalidated value reaches them | src/app/api/Xero/callback/route.ts:64
- [LOW] ACTIVITY-LOGIN-07 — activity-log/login GET reads user_logins by client-supplied business_id with no app-layer access check | src/app/api/activity-log/login/route.ts:108
- [LOW] FXRATES-COACHGLOBAL-08 — consolidation/fx-rates writes are coach-global on shared FX data (service-role) | src/app/api/consolidation/fx-rates/route.ts:50
- [MEDIUM] AUTHZ-HELPER-02 — Global 'role === coach' fallback repeated in 5 per-business finance routes (RLS-capped today, but wrong pattern) | src/app/api/forecast/[id]/route.ts:109
- [LOW] AUTHZ-HELPER-03 — Section-permission gate ships in LOG_ONLY mode — section_permissions.finances=false is not enforced | src/lib/permissions/sectionPermissionConfig.ts:18
- [INFO] AUTHZ-HELPER-04 — requireSectionPermission called with a business_profiles.id (wrong id-space) in forecast DELETE — false-deny only | src/app/api/forecast/[id]/route.ts:235
- [MEDIUM] AUTHZ-A — Xero/sync-all POST lets any authenticated user trigger a sync for ANY business or the entire fleet (no object-level authz) | src/app/api/Xero/sync-all/route.ts:73
- [MEDIUM] VALID-D — withSchema/withQuerySchema run in observe-only mode fleet-wide — invalid input is logged, never rejected | src/lib/api/with-schema.ts:58
- [LOW] INJ-E — PostgREST .or() filters built by raw template interpolation — safe today (values are session/DB-derived), but not UUID-guarded | src/app/api/Xero/callback/route.ts:64
