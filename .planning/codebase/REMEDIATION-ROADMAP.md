# WisdomBI Remediation Roadmap

**Generated:** 2026-05-30
**Scope:** Exhaustive, stability-first audit of the WisdomBI codebase — to harden WisdomBI in production and de-risk the inLIFE Pulse fork.
**Method:** Synthesis of the 7 codebase-map documents (`STACK`, `INTEGRATIONS`, `ARCHITECTURE`, `STRUCTURE`, `CONVENTIONS`, `TESTING`, `CONCERNS` — 33 findings C-01..C-33) plus the exhaustive read-only production dual-ID data audit (`scripts/audit-dual-id-full.mjs`, all 98 business_id/business_profile_id columns).
**Status:** Diagnosis only. No code has been changed. Nothing here is applied — this is a decision document.

---

## How to read this

Findings are ranked by **stability/correctness risk first** (the classes that have caused real prod incidents: dual-ID confusion, Xero durability, silent RLS failures, money-math, data integrity), then **maintainability/fork-readiness**, then **scalability**.

Each item carries:
- **Sev** — CRITICAL / HIGH / MEDIUM / LOW
- **Evidence** — file:line so you can verify before trusting
- **Effort** — S (<½ day) · M (½–2 days) · L (3–10 days) · XL (multi-week)
- **Fork split** — where the fix belongs:
  - **CODE** = fix once; the fork inherits it. Do this *before* forking.
  - **PROD** = WisdomBI-prod data/config cleanup only; the fork starts clean and skips it.
  - **BOTH** = code fix + a one-time prod cleanup.

The single most important strategic finding: **the code wart is separable from the data pollution.** Fix the code (resolvers, RLS, FKs, validation) once before the fork so both products inherit a clean spine. The per-row prod data cleanse (orphan user-IDs, mixed tables) is WisdomBI-only and can run on its own track — the fork never inherits the dirty rows.

---

> **Companion doc:** see `USER-IMPACT.md` for the live-user blast radius and safe-rollout plan for every item below, plus the read-only prod pre-flight checks to run first. **Deep-dive round 2 (2026-05-31)** added findings C-36–C-40 (items R24–R28) and corrected C-04 (downgraded to HIGH — fails closed for normal requests).
>
> **Deep-dive round 3 — second-pass gap audit (2026-05-31, branch `main`@e1b4e7c7).** A four-lane net-new audit (`audit-pass-2/CONSOLIDATED-GAPS.md`, with source-verified evidence) added **R29–R35** and produced **one roadmap-correcting fact:** the core money tables (`xero_pl_lines`, `xero_bs_lines`) are keyed to **`business_profiles.id`, NOT `businesses.id`** (FK-enforced + Phase-70 prod snapshot). **R1/R3's "canonical = businesses.id" guidance is corrected below.** Round 3 also confirmed Phase 70 mitigated R4 in code (crons now fail-closed for normal requests) and found a second live unauthenticated route (`Xero/employees`, folded into R24).

## Tier 0 — Fork-blocking. Fix in CODE before cutting inLIFE Pulse.

These are the issues that, if forked as-is, get copied into a second product and double your future remediation cost. Stability-ranked.

### R24 · Auth-guard the unauthenticated service-role routes: `monthly-report/templates` **and** `Xero/employees`  (C-36, SEC-N1/MNT-N1) — SHIP FIRST
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** TWO live, currently-open holes of the same class:
  1. `src/app/api/monthly-report/templates/route.ts` uses a module-level **service-role** client (lines 8–11) and **no verb checks auth** — GET/POST/PUT/DELETE gate only on `business_id` presence. Any caller with a valid `business_id` can read/create/overwrite/delete any tenant's report templates.
  2. **(round 3, SEC-N1/MNT-N1) `src/app/api/Xero/employees/route.ts` GET is worse** — service-role (`getSupabaseAdmin()`), gates only on `business_id` presence (verified `:108-119`, zero `getUser`/`verifyBusinessAccess`), and returns the tenant's **live payroll roster from Xero**: names, emails, job titles, annual salaries, hourly rates, hours. No session required at all. This leaks live compensation PII.
- **Evidence:** `monthly-report/templates/route.ts:8–11, 17–205`; `Xero/employees/route.ts:108–119` (both verified firsthand).
- **Fix:** Add `getAuthenticatedUser()` + `verifyBusinessAccess(user.id, business_id)` to all verbs on **both** routes. Zero-downtime. **Live, currently-open holes — do them before anything else.**
- **Why first:** Worst instances of the C-07 raw-service-role-client class. Also audit the other ~58 raw-client sites for the same missing-auth pattern (R29 covers the next-worst subset).

### R1 · Collapse the triple business-ID collision  (C-01, C-10, C-11, C-33)
- **Sev:** CRITICAL · **Effort:** L · **Fork:** BOTH
- **What:** Three id-spaces collide inside `business_id` columns — `businesses.id`, `business_profiles.id`, and polluting **user auth ids**. Three overlapping resolvers paper over it: `resolveBusinessIds` (55 files), `resolveXeroBusinessId` (14 files), role-aware `resolveBusinessId`. A branded-type system exists but is adopted in only ~4 files.
- **Evidence:** `src/lib/utils/resolve-business-ids.ts` (module-level `cache` line 21, never invalidated; fallback lines 67-73 sets bizId=profileId=inputId); `src/lib/utils/resolve-xero-business-id.ts` (stale comments claim profile-id storage); `src/lib/business/resolveBusinessId.ts` (`assertNotUserId`); `src/lib/types/ids.ts`.
- **Data proof:** `swot_analyses.business_id == created_by` (a user id) in 26/27 rows; orphan ids (52343ba5…, 8d214349…, 959aee74…) match `businesses.owner_id`.
- **Fix:** Pick ONE canonical id. **⚠ CORRECTION (round 3 / DM-N1):** the earlier recommendation of `businesses.id` is WRONG for the core money tables. `xero_pl_lines` and `xero_bs_lines` are written with, and FK-enforced to, **`business_profiles.id`** (`20260430000002_xero_pl_lines_business_id_fk.sql:48-52` RESTRICT; Phase-70 prod snapshot: "ALL xero_pl_lines for sampled clients keyed under business_profiles.id, 0 under businesses.id"). The right canonicalization splits by table family: **money/Xero tables → `business_profiles.id`**; membership/coaching tables (`business_users`, `xero_connections`, RLS owner/coach checks) already use `businesses.id`. The resolver must map between the two families, not flatten both to one. Make **`src/lib/business/resolveBusinessId.ts` the authoritative resolver** — it is the only role-aware one (takes a `role` param, enforces the `assertNotUserId` invariant, returns a branded `BusinessId`, documents the coach→user-id masquerade). Retire the two role-blind resolvers (`resolveBusinessIds`, `resolveXeroBusinessId`) onto it. Route everything through it, adopt branded types at API boundaries so a `UserId` can never be passed where a `BusinessId` is expected. Delete the module-level cache or give it a TTL/invalidation.
- **⚠ Dual-FK to resolve (DM-N1):** `xero_pl_lines.business_id` carries TWO contradictory FKs at once — the baseline `→businesses(id) CASCADE` (`baseline_schema.sql:9685`, never dropped) AND the 44.2 `→business_profiles(id) RESTRICT`. Before any R1 migration, run a read-only prod check of which FK is actually live (`pg_constraint`), drop the wrong one (keep `→business_profiles(id)`), and reconcile delete semantics.
- **Four-role note:** The canonical resolver must keep handling all four roles — client/owner (`businesses.owner_id`), team member (`business_users` where `status='active'`), coach (`businesses.assigned_coach_id`), super_admin (`system_roles`). See R23 for the single-coach-column decision that should be made alongside this.
- **Why before fork:** This is the #1 recurring incident class. Forking three resolvers + a half-adopted type system means fixing it twice.

### R2 · RLS silent-failure on orphan / user-ID-polluted rows  (C-02, C-32)
- **Sev:** HIGH _(corrected down from CRITICAL — see note)_ · **Effort:** M · **Fork:** BOTH (code forks clean; data is prod-only)
- **CORRECTION (four-role re-audit):** The original framing — "profile-keyed rows return empty" — was disproven by reading the function body. `auth_get_accessible_business_ids()` (`baseline_schema.sql:158`) is **dual-role AND dual-ID tolerant**: it `UNION`s owned + coached (`assigned_coach_id`) + active team + the user's own profile + profile IDs of any business they own/coach/are-a-member-of. So **clean profile-keyed rows ARE visible to all four roles.** The downgrade reflects this narrower surface.
- **What (corrected):** The genuine silent-empty surface is **orphan / user-ID-polluted rows** — a `business_id` matching neither a `businesses.id` nor a valid `business_profiles.id`. These return 200-empty under RLS. In the TEXT variant the failure is *masked* for the writing user by `auth.uid()::TEXT` (C-32), which is exactly why the pollution never errored. Plus: any **new** table whose policy omits the `bp.id` bridge reverts to the broad failure.
- **Evidence:** `baseline_schema.sql:158` (UUID, dual-tolerant), `:171` (TEXT, with the `auth.uid()::TEXT` mask); the 12 MIXED tables from the data audit.
- **Fix:** R1's canonicalization lets the helpers drop the `business_profiles.id` UNION branches. Standardise every new policy on the canonical helper so the bridge is never re-omitted. **Ordering: do NOT remove the `auth.uid()::TEXT` mask until R14 cleanses the orphan/user-ID rows** — pulling it first makes those rows inaccessible to whoever wrote them (looks like "my data vanished").
- **⚠ Round-3 concrete offender (SEC-N6):** the abstract "any new table that omits the bridge" risk has a real instance — `xero_balance_sheet_lines`'s `_coach_all` policy is hand-rolled (`20260420032941_consolidation_bs_translation.sql:98-104`) and does **not** call `auth_get_accessible_business_ids()`, so **active team members can't see consolidated BS rows** and any profile-keyed row is invisible to all but super-admin. Its siblings `xero_pl_lines`/`xero_bs_lines` use the helper correctly. Standardise this policy onto the helper as part of R2. (Same table also flagged for missing RLS / two-BS-tables under R3/DM-N3.)
- **Why before fork:** The dual-tolerant *helper code* forks clean; baking the mask in without the cleanup dependency documented would let the fork re-introduce the silent surface.

### R3 · Add the missing `xero_connections.business_id` foreign key  (C-03)
- **Sev:** CRITICAL · **Effort:** S (code) / M (prod backfill) · **Fork:** BOTH
- **What:** `xero_connections.business_id` has no FK constraint. Nothing at the DB level prevents an orphaned or mis-spaced connection row — exactly the class of bug behind "connected but not found" Xero states.
- **Evidence:** `supabase/migrations/baseline_schema.sql:5545`.
- **Fix:** Add `FK xero_connections.business_id → businesses.id` (prod is already 100% businesses.id here, so the fork gets it free). For prod, validate no orphans first, then add `NOT VALID` → `VALIDATE`.
- **Why before fork:** Xero durability is a top incident class; the fork should be born with the constraint.
- **Round-3 extensions (DM-N2/N3, SEC-N6):** the FK gap is wider than `xero_connections` alone — see the full enumeration in `audit-pass-2/DATA-MONEY-GAPS.md §(b)` (10+ money tables, uuid NOT NULL, no FK). Separately, there are **two divergent balance-sheet tables** keyed to opposite id-spaces with no sync between them: `xero_balance_sheet_lines` (`businesses.id`, CASCADE, **no RLS policy in its creation migration** — SEC-N6) read by the monthly report/consolidation, vs `xero_bs_lines` (`business_profiles.id`, RESTRICT, RLS-enabled) written by the orchestrator/reconciliation. Canonicalization (R1) must pick ONE BS table + id-space and add the missing RLS. Folds with R14.

### R4 · Cron routes fail-OPEN when `CRON_SECRET` is undefined  (C-04)
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** 4 of 5 cron routes authorize the request when `CRON_SECRET` is unset — an unauthenticated caller can trigger syncs/digests. Only `refresh-xero-tokens` does it correctly.
- **Evidence:** `sync-all-xero/route.ts:34`, `reconciliation-watch/route.ts:44`, `weekly-digest/route.ts:17`, `daily-health-report/route.ts:17`; correct pattern at `refresh-xero-tokens/route.ts:126-129`.
- **Fix:** Fail-closed: if `CRON_SECRET` is undefined or mismatched, return 401. Copy the `refresh-xero-tokens` guard into the other four.
- **Why before fork:** One-line-class bug, security-sensitive, copies straight into the fork.
- **⬇ Round-3 update (downgrade to LOW residual):** Phase 70 changed all four crons to the **negated-compare** form (`if (auth !== \`Bearer ${CRON_SECRET}\`) return 401`), which **fails closed for normal/empty requests even when `CRON_SECRET` is unset**. The only residual is an attacker sending the literal string `Bearer undefined` while the secret is unset — a 1-line hardening (add the explicit `if (!cronSecret) return 401` guard to the 4 routes), not a live critical.

### R5 · Introduce schema validation at the API boundary  (C-17)
- **Sev:** HIGH · **Effort:** L · **Fork:** CODE
- **What:** Zero request-body validation (no Zod or equivalent) across 82+ routes. Malformed payloads reach business logic and the DB unchecked — a correctness and injection-surface risk for a money product.
- **Evidence:** absence across `src/app/api/**`; ~130 routes total, 82 mutating.
- **Fix:** Adopt one validation lib (Zod), establish a `validate(schema)` wrapper, apply to mutating routes first (financial writes before reads). Doesn't need to be all-at-once, but the *pattern* must exist before the fork so new fork routes inherit it.
- **Why before fork:** A missing convention is the most expensive thing to retrofit across two codebases.
- **Round-3 sharpening (MNT-N11):** `zod` is **already a dependency** (`package.json`, v4) but imported in **0 files** — so no install is needed, and there's **no existing validated route to copy a pattern from** (107/130 routes call `req.json()` unvalidated). The fix is to establish the `validate(schema)` convention from scratch; apply first to financial-write routes (`forecasts/scenarios`, `monthly-report/*`, `kpis`, `goals`).

### R6 · Money-math correctness: cashflow classification & hardcoded currency  (C-05, C-14, C-25)
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** Cashflow engine classifies GST/depreciation by **keyword matching** on account names (fragile, locale/naming-dependent); `presentation_currency` is hardcoded `'AUD'`; per-tenant consolidation cashflow is a TODO.
- **Evidence:** `cashflow/engine.ts:54-78` (keyword match), `consolidation/engine.ts:136` (`'AUD'`), C-25 TODO.
- **Fix:** Classify by Xero account `xero_type`/system-account flags, not name strings. Thread presentation currency from org config. These are correctness bugs in the core value-prop (the numbers).
- **Why before fork:** inLIFE Pulse will show different numbers; baking in AUD/keyword assumptions guarantees a fork-time bug.
- **⚠ Round-3 additions (DM-N6/N7/N8):**
  - **DM-N6:** cashflow `getLineValue` (`cashflow/engine.ts:805-812`) treats a genuine **$0 actual** as "no actual" (`actual !== 0` guard) and substitutes the *forecast* figure → overstates actualized cash for any account that legitimately printed zero in a closed month.
  - **DM-N7:** Xero report parsers key accounts by **display name** (`sync-xero/route.ts:111-114,167-173`) → two same-named accounts overwrite each other → understated section totals. Key by `account_id`/`account_code`.
  - **DM-N8:** FX translation is short-circuited when `functional_currency === presentation_currency`; `functional_currency` **defaults to `'AUD'` when NULL** (`consolidation/engine.ts:123`), so a tenant whose Xero org genuinely reports in NZD/USD but whose column is NULL is summed 1:1 into AUD with no conversion — a wrong number, no error.

### R7 · Decouple brand/URL from code  (C-26, C-27)
- **Sev:** HIGH (for fork) · **Effort:** M · **Fork:** CODE
- **What:** "WisdomBI" brand strings and `wisdombi.ai` URLs are hardcoded in email templates and 6+ routes. The fork can't change identity without hunting every literal.
- **Evidence:** `src/lib/email/resend.ts:7,24-30`; `wisdombi.ai` fallback in 6 routes.
- **Fix:** Centralize brand/name/URL/sender into a single config module (env-driven). This is the cheapest highest-leverage fork-enablement change.
- **Why before fork:** This is literally the fork's blocker — do it first so inLIFE Pulse is a config flip.
- **⬆ Round-3 widening (MNT-N5/N6/N7/N8/N10):** the coupling is ~3× wider than stated above — **40+ files / 121 hits**, not "7 email files + 6 routes." The single config module must also cover: app title/metadata + favicon (`layout.tsx:13`), all sidebar/layout UI chrome (7 components), the ICS calendar generator (`ics-generator.ts`), the `/bali-retreat` + `/ai-advantage` marketing funnels, a hardcoded Vimeo embed + an unused `js.stripe.com` CSP grant (`middleware.ts:202,207`), four inconsistent sender/support domains (`.ai`/`.au`/`.com.au`), and the `NEXT_PUBLIC_APP_URL` fallback that silently splits between `wisdombi.ai` (invites) and `localhost:3000` (Xero OAuth — fork-breaking, fails silently). **Plus a legal blocker (MNT-N5):** the legal entity name + ABN are hardcoded in `terms/page.tsx` + `privacy/page.tsx` ("Envisage Australia Pty Ltd … ABN 11 331 804 705 t/a Wisdom Coaching") — and "Envisage" is also a live tenant name. Parameterize + flag for legal review. Full inventory in `audit-pass-2/MAINTAINABILITY-GAPS.md §(b)`.

### R29 · Hard-gate the LOG_ONLY monthly-report routes  (SEC-N2, SEC-N3)
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** 8 service-role monthly-report routes (`account-mappings`, `auto-map`, `commentary`, `settings`, `snapshot`, `wages-detail`, `subscription-detail`, `full-year`) have as their ONLY access gate the Phase-65 section-permission layer — which ships in **LOG_ONLY mode by default** (`sectionPermissionConfig.ts:18`, default `false`; `enforceSectionPermission` returns `null`→route proceeds, verified `:51,68`). So today any authenticated user passing a foreign `business_id` can READ another tenant's mappings/settings/snapshots/wages/subscription/full-year P&L and WRITE mappings/auto-map/commentary/settings/snapshots — the cross-tenant attempt is merely *logged*. Sibling cashflow routes are safe because they additionally hard-gate with `verifyBusinessAccess`. **Also (SEC-N3):** `monthly-report/debug` dumps a full tenant P&L with auth-only, no access check, no section gate.
- **Evidence:** `sectionPermissionConfig.ts:18,51,68` (verified); 8 routes per `audit-pass-2/SECURITY-GAPS.md §SEC-N2`; `monthly-report/debug/route.ts:19-32`.
- **Fix:** Add `verifyBusinessAccess` hard-gates to all 8 routes + `debug` (the durable, fork-safe fix). Same-day stopgap: set `SECTION_PERMISSION_ENFORCE=true` in Vercel — but the hard-gate is the real fix, since the env switch is a single point of failure.
- **Why before fork:** Live cross-tenant IDOR on financial data; copies straight into the fork.

### R30 · Fix the dead Xero health check + freshness signal  (REL-N1, REL-N2)
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** `checkXero()` and the daily-health-report select `token_expires_at` from `xero_connections` — **a column that does not exist there** (the TTL column is `expires_at`). The resulting PostgREST error is swallowed into an early `return { status: "ok" }` (`health-checks.ts:92,94-95`, verified). Net effect: token-expiry detection AND stale-sync detection are **permanently dark** — for a product whose #1 incident class is "connected but not syncing," the dedicated detector has never worked. **Compounding (REL-N2):** the nightly cron sync never updates `xero_connections.last_synced_at` (only user/legacy paths do), so once the column is fixed the stale-sync warning would false-positive on cron-only tenants.
- **Evidence:** `health-checks.ts:92,94-95` (verified); `daily-health-report/route.ts:73,91,94`; `baseline_schema.sql:5543-5560` (no `token_expires_at` on `xero_connections`).
- **Fix:** Use `expires_at`; on query error return `warning`/`error` (NOT `ok`) so a real failure screams; derive freshness from `sync_jobs.finished_at` (the true sync event) or have the orchestrator bump `last_synced_at`. Add a test asserting the selected columns exist.
- **Why before fork:** The observability that's supposed to catch the top incident class is non-functional; the fork should inherit a working detector.

### R31 · Single source of super-admin truth  (SEC-N4)
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** Canonical super-admin store is the `system_roles` table (~50 routes + every RLS helper). But 4 high-privilege routes gate on a DIFFERENT store, the `users.system_role` column: `admin/reset-password:64-71` (resets arbitrary user passwords — the highest-privilege route), `email/send:89-95`, `admin/activity:125-131`, `admin/coaches:43-45`. Two drift-prone authz stores → either a real super-admin is wrongly 403'd, or someone in `users.system_role` but not `system_roles` gains super-admin invisibly to the RLS model.
- **Fix:** Repoint the 4 routes to `system_roles` (or `auth_is_super_admin()`); make `system_roles` the single source.

### R32 · Lock down `email/send` recipient authorization  (SEC-N5)
- **Sev:** HIGH · **Effort:** S · **Fork:** CODE
- **What:** `email/send` lets any authenticated user send WisdomBI-branded templated email (`client-invitation`, `password-reset`, `session-reminder`, `message-notification`) to a **caller-supplied recipient** with caller-supplied `resetUrl`/`loginUrl`/`tempPassword` (`:46-85`); only `type:'custom'` is super-admin gated. A phishing primitive: a legitimately-signed "Reset your password" email from the trusted `cfo@wisdombi.ai` sender pointing at an attacker URL (SPF/DKIM pass).
- **Fix:** Verify `params.to` / the named business belongs to the caller (or restrict templated sends to coach/super-admin). The C-08 in-memory rate limiter is near-useless here (see R11).

---

## Tier 1 — Production stability hardening (WisdomBI now)

Fix these in prod regardless of the fork. CODE fixes also flow to the fork.

### R8 · Xero token-refresh cron timeout risk at scale  (C-19, C-16)
- **Sev:** MEDIUM→HIGH (grows with tenant count) · **Effort:** M · **Fork:** CODE
- **What:** Sequential token refresh; at ~400 connections this approaches the 300s function limit. `sync-orchestrator.ts` is 1286 lines with 11 bare `catch {}` swallowing failures silently.
- **Evidence:** `refresh-xero-tokens` sequential loop; `sync-orchestrator.ts` (1286 lines, bare catches).
- **Fix:** Batch/parallelize refresh with concurrency cap; replace bare catches with logged, typed error handling so silent Xero drops surface. Durability is the recurring complaint.
- **⚠ Round-3 corrections + additions (REL-N3/N4/N5/N6):**
  - **REL-N5 (HIGH — highest-danger silent disconnect):** `refreshTokenWithRetry` returns `success:true` after a **failed DB save** of a rotated token (`token-manager.ts:402-422`). Xero has already invalidated the old refresh token, but the new one was never persisted → the next refresh uses the dead DB token → `invalid_grant` → a **healthy tenant is deactivated by a transient write blip**. Fix: on `updateError` return `success:false` (transient, `shouldDeactivate:false`) so the caller retries rather than committing to an unpersisted rotation.
  - **REL-N3:** the token-refresh path uses a raw `fetch` to `identity.xero.com` that **ignores Xero's `Retry-After` on 429** (the rate-limit-aware client is only used by the sync data path). Route the identity call through a backoff helper that honors `Retry-After`.
  - **REL-N4:** lock-contention fallback sleeps a fixed 2s once then **self-refreshes without the lock** — under backoff (>2s) every concurrent caller refreshes in parallel → rotated-token stampede. Loop the wait+refetch up to ~lock-TTL before self-refreshing.
  - **REL-N6:** `sync-all-xero` runs ~52 sequential Xero calls/tenant × ~27 tenants against a 300s budget; a mid-run Vercel kill loses the end-of-run heartbeat, making truncation **indistinguishable from non-invocation** (the exact Phase-69 failure heartbeats were meant to disambiguate). Add a wall-clock budget check that stops cleanly and records a `partial`/`truncated` heartbeat.
  - **Re-point R8's danger characterization:** the 11 bare catches in `sync-orchestrator.ts` are all Sentry-guard wrappers (benign by design). The genuinely dangerous silent swallows are in **`token-manager.ts`** (the REL-N5 success-masks-failure above, plus `:259` stale-rt swallow and `:501` FY-start default-to-month-7).

### R9 · Report share tokens never expire  (C-15)
- **Sev:** HIGH (security) · **Effort:** S · **Fork:** CODE
- **What:** Share tokens have no expiry — a leaked link grants permanent access to financials.
- **Evidence:** `src/lib/.../report-token.ts:7`.
- **Fix:** Add `expires_at`, validate on access, default 30–90 days.

### R10 · `fetch` cache + raw-client bypass review  (C-07)
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** 59 raw `createClient` call sites bypass the standardized `cache: 'no-store'` wrapper — risk of stale financial reads served from Next.js fetch cache.
- **Evidence:** 59 sites flagged in CONCERNS C-07.
- **Fix:** Funnel through the standard client factory; assert `no-store` for financial reads.

### R11 · Rate limiter is in-memory & IP-spoofable  (C-08, C-13)
- **Sev:** MEDIUM · **Effort:** M · **Fork:** CODE
- **What:** Rate limiter holds state in process memory (useless across Fluid Compute instances) and trusts `x-forwarded-for` (spoofable).
- **Evidence:** `rate-limiter.ts:23` (in-memory Map), `:114-117` (x-forwarded-for).
- **Fix:** Back with Redis/Upstash or Vercel's primitives; use the platform-verified client IP.

### R12 · Per-request schema probing  (C-09, C-20)
- **Sev:** MEDIUM · **Effort:** M · **Fork:** CODE
- **What:** `strategic_initiatives` does a schema-probe + 3-4 serial queries per request — latency and DB load that scales with traffic.
- **Evidence:** C-09 schema-probe, C-20 serial queries.
- **Fix:** Resolve schema once at boot/cache; collapse serial queries into a single round-trip.

### R25 · Make balance-sheet sync atomic  (C-37)
- **Sev:** HIGH · **Effort:** S–M · **Fork:** CODE
- **What:** `monthly-report/sync-xero/route.ts:338–371` deletes all BS rows then inserts; if the insert fails after the delete, it logs a Sentry *warning* and still returns `success: true` — leaving the tenant's balance sheet silently empty.
- **Fix:** Insert-then-swap or wrap in a transaction/RPC; return `success:false` on insert error. Mirror the P&L path's `ON CONFLICT` upsert (idempotent). Pure correctness win, no user-visible change except fewer silent wipes.
- **⚠ Round-3 extension (DM-N5):** the same block has an **id-space asymmetry** on top of the atomicity bug — it deletes across `ids.all` (every resolved id-space, `:338-345`) but re-inserts under a single `business_id = ids.bizId` (`:318`). So a partial failure or id-space mismatch can wipe the broad set and rewrite under one space, leaving the BS empty *and* keyed inconsistently vs `xero_pl_lines` (profileId). Fix must align the insert id-space with R1's canonical money-table choice (`business_profiles.id`).

### R26 · Forecast-ownership check on `scenarios` POST  (C-38)
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** POST (`forecasts/scenarios/route.ts:91–153`) doesn't verify the caller can access the `forecast_id`'s business, allowing cross-tenant scenario write-pollution. (PATCH/DELETE are correctly user-scoped.)
- **Fix:** Add the same business-access check GET already performs, before insert.

### R27 · Soft-delete clients + backup-before-cascade  (C-39)
- **Sev:** MEDIUM · **Effort:** M · **Fork:** CODE
- **What:** Super-admin client delete triggers `ON DELETE CASCADE` that silently wipes `xero_pl_lines` + ~40 cascaded tables with no soft-delete/backup/confirmation. Also audit the manual-delete table names (`kpis`, `messages`, `annual_goals`) — possibly legacy/no-op.
- **Fix:** `deleted_at` soft-delete + export-to-archive before any hard delete + confirmation token.
- **⚠ Round-3 extension (DM-N10/N11/N12):** R27 covered only the *business* delete. The **forecast** delete is a separate, more-frequently-hit path (coaches delete/recreate forecasts routinely) and CASCADE-wipes all child money rows — `cashflow_assumptions`, `cashflow_settings`, `forecast_decisions`, `forecast_investments`, `forecast_years` — with no soft-delete. Plus SET-NULL fan-out silently unlinks provenance: `subscription_budgets.forecast_id` (budget detaches from the plan it was sized against) and `financial_forecasts.xero_connection_id` (forecast loses its Xero source on the reconnect/disconnect cycles that are themselves an incident class). Extend the soft-delete/backup pattern to the forecast-delete path.

### R13 · Widget correctness stubs  (C-06, C-28, C-29)
- **Sev:** MEDIUM · **Effort:** S–M · **Fork:** CODE
- **What:** `AnnualPlanProgressWidget` YTD hardcoded `0`; `ReportSnapshotView` stub; AI CFO forecast not persisted.
- **Evidence:** `AnnualPlanProgressWidget.tsx:59-61`; C-28, C-29.
- **Fix:** Wire real values or hide the widgets — a hardcoded 0 in a CFO dashboard reads as a real (wrong) number.

---

## Tier 2 — Data cleanse (WisdomBI-PROD only — fork starts clean)

These are **PROD** items. The fork begins with empty/clean tables and skips them entirely. Run as a separate migration track, not blocking the fork.

### R14 · Per-row cleanse of the 12 MIXED tables  (C-01 data half, C-18)
- **Sev:** HIGH · **Effort:** L · **Fork:** PROD-only
- **What:** 12 tables have rows split across all three id-spaces. This is NOT a mechanical profile→biz rewrite — it must detect and quarantine user-id rows and dangling refs.
- **Evidence (from audit):**
  - `activity_log` — 2503 prof / 11 biz / 31 orphan (`business_id` is `text`, no FK — C-18)
  - `strategic_initiatives` — 439 / 9 / 36
  - `business_kpis` — 41 / 43 / 2
  - `financial_forecasts` — 8 / 26 / 2
  - `business_financial_goals` — 1 / 14 / 1
  - `weekly_reviews`, `weekly_metrics_snapshots`, `kpi_actuals`, `quarterly_snapshots`, `forecast_wizard_sessions`, `strategic_initiatives_backup`
  - `swot_analyses` — 26/27 rows are user-ids, not businesses at all
- **Fix:** Write a per-table migration that (a) rewrites known profile↔biz rows to canonical, (b) quarantines user-id rows (likely re-key to the owner's business via `businesses.owner_id`), (c) isolates dangling refs for manual review. Needs the `auth.users` table (service-role SQL) to split user-id vs hard-deleted.
- **Sequencing:** Run AFTER R1/R2/R3 land the canonical id + FK, so the cleansed rows land in a schema that enforces correctness. Run **BEFORE** removing the `auth.uid()::TEXT` RLS mask (C-32) — that mask is currently the only thing keeping the polluted rows visible to their authors.
- **Four-role note:** Re-keying is role-dependent — a coach-authored orphan resolves to its business via `assigned_coach_id`, an owner-authored one via `owner_id`. The migration cannot blindly map user→business; it must consult the writer's role.
- **⚠ Round-3 addition (DM-N4):** the cleanse must also **restore the `unique_active_forecast_per_fy` invariant**, which dual-ID pollution currently defeats — two "active" forecasts for the same real business (one keyed `businesses.id`, one `business_profiles.id`) have different `business_id` values and both pass the partial unique index (`20260427000000_unique_active_forecast_per_fy.sql:8-11`). "Find the active forecast" stays non-deterministic until the rows are canonicalized. The small first real fix (`ORPHAN-REMEDIATION-PLAN.md`, 3 orphan IDs) is the rehearsal for this larger per-table cleanse.

### R15 · Drop/scope backup & legacy tables  (C-23, C-24, C-30, C-31)
- **Sev:** LOW · **Effort:** S · **Fork:** PROD (fork omits them)
- **What:** `strategic_initiatives_backup`, `helpers-backup.ts`, `kpi-definitions-legacy.ts`, a duplicate index, 3 dead edge functions, `lambda/` dir.
- **Fix:** Don't migrate these into the fork. In prod, archive and drop after confirming non-reference.
- **⬆ Round-3 widening (MNT-N2/N3/N4):** the dead-table field is far larger than the one backup table named — **~15 zero-code-reference tables** including 3 backup tables (`assessments_backup`, `kpi_definitions_backup`, `strategic_kpis_backup`) and abandoned feature tables (`life_goals`, `forecast_insights`, `forecast_values`, `annual_snapshots`, …). Two concepts are **fragmented with no documented canonical**: KPIs across **13 tables** (~9 dead; canonical = `business_kpis`) and Goals across **6 tables** (canonical = `business_financial_goals`). Generate the drop list mechanically (schema tables minus `.from()` refs) so nothing is missed, and **declare + document the canonical table for KPIs and Goals before the fork** (a fork engineer asking "where do KPIs live?" currently has no answer). Full list in `audit-pass-2/MAINTAINABILITY-GAPS.md §MNT-N2/N3/N4`.

---

## Tier 3 — Maintainability / fork-readiness cleanup (CODE)

Lower urgency; do during the fork prep window. All CODE → fork inherits.

| Item | Sev | Effort | Evidence |
|---|---|---|---|
| R16 · Consolidate `verifyBusinessAccess` to ONE canonical, role- and status-aware implementation — fold `kpis/route.ts` weak copy (C-12) **and** fix the canonical's status/role-blind membership check (C-34) | HIGH | M | `api/kpis/route.ts:15-35`; `verify-business-access.ts:48-57` (no `status='active'` filter); RLS contract at `baseline_schema.sql:158` |
| R17 · Normalize Xero credential access (`process.env.X!` → validated config) (C-21) | MEDIUM | S | bare `process.env` in Xero client |
| R18 · Unify three encryption key env names + remove PBKDF2 fallback (C-22) | MEDIUM | M | C-22 |
| R19 · Resolve two `forecasts` tables / three wizard versions / `wide_compat` view ambiguity (ARCH) | MEDIUM | M | ARCHITECTURE.md |
| R20 · Fix `src/app/api/Xero/` capital-X casing anomaly (ARCH) | LOW | S | ARCHITECTURE.md |
| R21 · Remove vestigial `check_business_id = auth.uid()` RLS branches (ARCH) | LOW | S | ARCHITECTURE.md |
| R22 · Delete dead `helpers-backup.ts`, `lambda/` (C-23, C-31) | LOW | S | C-23, C-31 |
| R28 · Guard KPI target validator divide-by-zero when current=0 (C-40) | LOW | S | `kpi/utils/validators.ts:147` |
| R23 · **Fork decision:** coach↔business is a single `assigned_coach_id` column — decide pre-fork whether to move to a `business_coaches` join table (co-coaches, history, handoff) or document single-coach as intentional (C-35) | MEDIUM | M (if changed) | `baseline_schema.sql:158`; `verify-business-access.ts:22` |
| R33 · Extend the CSRF double-submit check (working impl) beyond the 5/~80 mutating routes it currently guards (SEC-N7) — defense-in-depth, partly mitigated by `sameSite:'strict'` | MEDIUM | M | `security/csrf.ts:32-85`; applied only in 5 routes |
| R34 · Reconciliation-gate classification hardening (SEC/verifier): Gate 2 sums earnings by **name substring** (double-counts sub-accounts, misses renamed system accounts); Gate 4 silently drops BS rows whose `account_type` isn't exactly asset/liability/equity (DM-N9) | MEDIUM | S | `reconciliation-gates.ts:71-85,258-268` |
| R35 · Cron per-item failures must page, not bury: `weekly-digest`/`daily-health-report` per-item email failures produce only a heartbeat counter, no Sentry (REL-N7); 429s on the token cron emit a misleading generic `failed` invariant (REL-N8) | LOW–MED | S | `weekly-digest/route.ts:199-203`; `daily-health-report/route.ts:196-200`; `token-manager.ts:672-679` |
| R36 · Insecure baked-in defaults: demo-client default password literal `'DemoPassword123!'` (MNT-N9); no Node `engines` pin (MNT-N12); `forecast/cashflow/settings/route.ts:34` still defaults `super_rate:0.115` not the locked 0.12 | MEDIUM/LOW | S | `admin/demo-client/route.ts:32-33`; `package.json`; `forecast/cashflow/settings/route.ts:34` |
| SEC-N8 (decision) · Any coach can PATCH **any** tenant's Xero connection mapping (intra-coach horizontal IDOR; marked "intentional" in code) — surface for an explicit keep/restrict decision | MEDIUM | S | `consolidation/tenants/[connectionId]/route.ts:14-15,49-58` |

> **Note on R16:** the C-34 half (status/role-blind membership in the *canonical* `verifyBusinessAccess`) is a genuine access-control bug — a deactivated team member retains app-layer access via the service-role path. Treat that half as **Tier 1 / security-grade**, not cleanup. The C-12 half (the kpis weak copy) is the lower-urgency consolidation.

---

## Recommended sequencing

**Phase 0 — Live-exposure hotfixes (do NOW, before everything):** **R24** (auth-gate `templates` + `Xero/employees`) → **R29** (hard-gate the 8 LOG_ONLY monthly-report routes + `debug`) → **R30** (fix the dead Xero health check) → **R32** (lock down `email/send`) → **R31** (single super-admin source). These are currently-open holes / dark detectors, each Effort-S, independent of the big canonicalization. The `email/send` and section-gate items can ship the same day. _Round-3 promoted R29/R30/R32 into this tier alongside the original R24._

**Phase A — Code spine (before fork):** R1 → R2 → R3 → R5 → R6 → R7, plus **R16's C-34 half** (security-grade access fix) and the **R23 fork decision** (single-coach vs join table — decide alongside R1 since both touch the resolver/RLS). **⚠ R1 is corrected (round 3):** canonical id for money/Xero tables is **`business_profiles.id`**, not `businesses.id`; resolve the `xero_pl_lines` dual-FK and the two-BS-tables split (R3/DM-N1/N2/N3) inside this phase. (R4 demoted to a 1-line hardening per the Phase-70 mitigation.) This is the fork gate. Land these and the fork inherits a clean, validated, correctly-id'd, role-correct, brand-decoupled spine.

**Phase B — Prod hardening (parallel, WisdomBI):** R8 (now incl. the REL-N5 token-deactivation fix — treat that sub-item as Phase-0-grade if disconnects recur), R9, R10, R11, R12, R13, R33, R34, R35, R36. Ship continuously to prod; CODE items also flow to the fork branch.

**Phase C — Prod data cleanse (after A):** R14 → C-32 mask removal → R15. **Hard ordering: R14 must precede the C-32 `auth.uid()::TEXT` removal** (R2), or polluted rows vanish from their authors. Separate migration track, gated on R1–R3 landing first. Fork skips entirely.

**Phase D — Cleanup (fork-prep window):** R16 (C-12 half) → R17–R22.

**Fork cut point:** after Phase A completes and Phase B's CODE items are in. Phase C never blocks the fork.

> **Round-3 net:** the audit added five fork-blocking-grade items (R24-expanded, R29, R30, R31, R32) and corrected the single most consequential planning assumption (money-table canonical id). The recommended *first real action* is unchanged in spirit — start small and reversible — but the smallest highest-value first step is now **Phase 0 R24** (two unauthenticated routes, Effort-S, live PII exposure), with the orphan-remediation fix (`ORPHAN-REMEDIATION-PLAN.md`) as the data-track rehearsal that de-risks R14.

---

## Testing posture (gap that amplifies every item above)

Per `TESTING.md`: coverage is thin relative to the financial-correctness surface. **Before** executing R1/R2/R6/R14/R16 (the id + money-math + data + access changes), add characterization tests that pin current correct outputs for: resolver id-mapping, RLS row visibility, cashflow classification, and consolidation currency. Without these, the canonicalization migration has no safety net. This is the highest-leverage non-feature investment for both products.

**The access tests must be a 4×2 matrix** (the four-role re-audit makes this explicit). Every id/RLS/resolver/access change (R1, R2, R16) is verified across **4 roles × 2 ID-spaces**:

| Role | Resolves via | Expected visibility | Test with `businesses.id` input | Test with `business_profiles.id` input |
|---|---|---|---|---|
| Client / owner | `businesses.owner_id` | own business only | ✓ sees own | ✓ sees own (profile bridge) |
| Team member | `business_users` where `status='active'` | only **active**-membership business; **deactivated/pending → denied** (R16/C-34) | ✓ / ✗ when inactive | ✓ / ✗ when inactive |
| Coach | `businesses.assigned_coach_id` | only assigned clients | ✓ assigned, ✗ unassigned | ✓ assigned (profile bridge) |
| Super admin | `system_roles.role='super_admin'` | all businesses | ✓ all | ✓ all |

Add an explicit negative case for the **orphan / user-ID row** (R2/C-02): assert it is *not* visible after the `auth.uid()::TEXT` mask is removed — and that R14 has re-keyed it first.

---

## One-paragraph executive summary

WisdomBI is structurally sound but carries one dominant, recurring defect class — **three business-id spaces colliding across 98 tables, papered over by three resolvers and silent RLS failures** — plus a cluster of security/correctness sharp edges (fail-open crons, no schema validation, never-expiring share tokens, keyword-based money classification). Critically, the **code wart is separable from the data pollution**: fixing the resolvers, RLS, FKs, validation, and brand-decoupling once (Phase A) lets the inLIFE Pulse fork inherit a clean spine, while the messy per-row prod data cleanse (12 mixed tables, user-id orphans) stays a WisdomBI-only track the fork never touches. Do Phase A before forking; everything else can run in parallel or after.
