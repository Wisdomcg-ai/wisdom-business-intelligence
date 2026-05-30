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

## Tier 0 — Fork-blocking. Fix in CODE before cutting inLIFE Pulse.

These are the issues that, if forked as-is, get copied into a second product and double your future remediation cost. Stability-ranked.

### R24 · Auth-guard the `monthly-report/templates` route  (C-36) — SHIP FIRST
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** `src/app/api/monthly-report/templates/route.ts` uses a module-level **service-role** client (lines 8–11) and **no verb checks auth** — GET/POST/PUT/DELETE gate only on `business_id` presence. Service-role bypasses RLS, so any caller with a valid `business_id` UUID can read/create/overwrite/delete any tenant's report templates.
- **Evidence:** `monthly-report/templates/route.ts:8–11, 17–205` (verified firsthand).
- **Fix:** Add `getAuthenticatedUser()` + `verifyBusinessAccess(user.id, business_id)` to all four verbs. Zero-downtime. **This is a live, currently-open hole — do it before anything else.**
- **Why first:** It's the worst instance of the C-07 raw-service-role-client class. Also audit the other 58 raw-client sites for the same missing-auth pattern.

### R1 · Collapse the triple business-ID collision  (C-01, C-10, C-11, C-33)
- **Sev:** CRITICAL · **Effort:** L · **Fork:** BOTH
- **What:** Three id-spaces collide inside `business_id` columns — `businesses.id`, `business_profiles.id`, and polluting **user auth ids**. Three overlapping resolvers paper over it: `resolveBusinessIds` (55 files), `resolveXeroBusinessId` (14 files), role-aware `resolveBusinessId`. A branded-type system exists but is adopted in only ~4 files.
- **Evidence:** `src/lib/utils/resolve-business-ids.ts` (module-level `cache` line 21, never invalidated; fallback lines 67-73 sets bizId=profileId=inputId); `src/lib/utils/resolve-xero-business-id.ts` (stale comments claim profile-id storage); `src/lib/business/resolveBusinessId.ts` (`assertNotUserId`); `src/lib/types/ids.ts`.
- **Data proof:** `swot_analyses.business_id == created_by` (a user id) in 26/27 rows; orphan ids (52343ba5…, 8d214349…, 959aee74…) match `businesses.owner_id`.
- **Fix:** Pick ONE canonical id (recommend `businesses.id` as the tenancy root — it's already what xero_connections, business_users, and RLS use). Make **`src/lib/business/resolveBusinessId.ts` the authoritative resolver** — it is the only role-aware one (takes a `role` param, enforces the `assertNotUserId` invariant, returns a branded `BusinessId`, and documents the coach→user-id masquerade). The other two (`resolveBusinessIds`, `resolveXeroBusinessId`) are role-blind; retire them onto it. Route everything through it, adopt branded types at API boundaries so a `UserId` can never be passed where a `BusinessId` is expected. Delete the module-level cache or give it a TTL/invalidation.
- **Four-role note:** The canonical resolver must keep handling all four roles — client/owner (`businesses.owner_id`), team member (`business_users` where `status='active'`), coach (`businesses.assigned_coach_id`), super_admin (`system_roles`). See R23 for the single-coach-column decision that should be made alongside this.
- **Why before fork:** This is the #1 recurring incident class. Forking three resolvers + a half-adopted type system means fixing it twice.

### R2 · RLS silent-failure on orphan / user-ID-polluted rows  (C-02, C-32)
- **Sev:** HIGH _(corrected down from CRITICAL — see note)_ · **Effort:** M · **Fork:** BOTH (code forks clean; data is prod-only)
- **CORRECTION (four-role re-audit):** The original framing — "profile-keyed rows return empty" — was disproven by reading the function body. `auth_get_accessible_business_ids()` (`baseline_schema.sql:158`) is **dual-role AND dual-ID tolerant**: it `UNION`s owned + coached (`assigned_coach_id`) + active team + the user's own profile + profile IDs of any business they own/coach/are-a-member-of. So **clean profile-keyed rows ARE visible to all four roles.** The downgrade reflects this narrower surface.
- **What (corrected):** The genuine silent-empty surface is **orphan / user-ID-polluted rows** — a `business_id` matching neither a `businesses.id` nor a valid `business_profiles.id`. These return 200-empty under RLS. In the TEXT variant the failure is *masked* for the writing user by `auth.uid()::TEXT` (C-32), which is exactly why the pollution never errored. Plus: any **new** table whose policy omits the `bp.id` bridge reverts to the broad failure.
- **Evidence:** `baseline_schema.sql:158` (UUID, dual-tolerant), `:171` (TEXT, with the `auth.uid()::TEXT` mask); the 12 MIXED tables from the data audit.
- **Fix:** R1's canonicalization lets the helpers drop the `business_profiles.id` UNION branches. Standardise every new policy on the canonical helper so the bridge is never re-omitted. **Ordering: do NOT remove the `auth.uid()::TEXT` mask until R14 cleanses the orphan/user-ID rows** — pulling it first makes those rows inaccessible to whoever wrote them (looks like "my data vanished").
- **Why before fork:** The dual-tolerant *helper code* forks clean; baking the mask in without the cleanup dependency documented would let the fork re-introduce the silent surface.

### R3 · Add the missing `xero_connections.business_id` foreign key  (C-03)
- **Sev:** CRITICAL · **Effort:** S (code) / M (prod backfill) · **Fork:** BOTH
- **What:** `xero_connections.business_id` has no FK constraint. Nothing at the DB level prevents an orphaned or mis-spaced connection row — exactly the class of bug behind "connected but not found" Xero states.
- **Evidence:** `supabase/migrations/baseline_schema.sql:5545`.
- **Fix:** Add `FK xero_connections.business_id → businesses.id` (prod is already 100% businesses.id here, so the fork gets it free). For prod, validate no orphans first, then add `NOT VALID` → `VALIDATE`.
- **Why before fork:** Xero durability is a top incident class; the fork should be born with the constraint.

### R4 · Cron routes fail-OPEN when `CRON_SECRET` is undefined  (C-04)
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** 4 of 5 cron routes authorize the request when `CRON_SECRET` is unset — an unauthenticated caller can trigger syncs/digests. Only `refresh-xero-tokens` does it correctly.
- **Evidence:** `sync-all-xero/route.ts:34`, `reconciliation-watch/route.ts:44`, `weekly-digest/route.ts:17`, `daily-health-report/route.ts:17`; correct pattern at `refresh-xero-tokens/route.ts:126-129`.
- **Fix:** Fail-closed: if `CRON_SECRET` is undefined or mismatched, return 401. Copy the `refresh-xero-tokens` guard into the other four.
- **Why before fork:** One-line-class bug, security-sensitive, copies straight into the fork.

### R5 · Introduce schema validation at the API boundary  (C-17)
- **Sev:** HIGH · **Effort:** L · **Fork:** CODE
- **What:** Zero request-body validation (no Zod or equivalent) across 82+ routes. Malformed payloads reach business logic and the DB unchecked — a correctness and injection-surface risk for a money product.
- **Evidence:** absence across `src/app/api/**`; ~130 routes total, 82 mutating.
- **Fix:** Adopt one validation lib (Zod), establish a `validate(schema)` wrapper, apply to mutating routes first (financial writes before reads). Doesn't need to be all-at-once, but the *pattern* must exist before the fork so new fork routes inherit it.
- **Why before fork:** A missing convention is the most expensive thing to retrofit across two codebases.

### R6 · Money-math correctness: cashflow classification & hardcoded currency  (C-05, C-14, C-25)
- **Sev:** HIGH · **Effort:** M · **Fork:** CODE
- **What:** Cashflow engine classifies GST/depreciation by **keyword matching** on account names (fragile, locale/naming-dependent); `presentation_currency` is hardcoded `'AUD'`; per-tenant consolidation cashflow is a TODO.
- **Evidence:** `cashflow/engine.ts:54-78` (keyword match), `consolidation/engine.ts:136` (`'AUD'`), C-25 TODO.
- **Fix:** Classify by Xero account `xero_type`/system-account flags, not name strings. Thread presentation currency from org config. These are correctness bugs in the core value-prop (the numbers).
- **Why before fork:** inLIFE Pulse will show different numbers; baking in AUD/keyword assumptions guarantees a fork-time bug.

### R7 · Decouple brand/URL from code  (C-26, C-27)
- **Sev:** HIGH (for fork) · **Effort:** M · **Fork:** CODE
- **What:** "WisdomBI" brand strings and `wisdombi.ai` URLs are hardcoded in email templates and 6+ routes. The fork can't change identity without hunting every literal.
- **Evidence:** `src/lib/email/resend.ts:7,24-30`; `wisdombi.ai` fallback in 6 routes.
- **Fix:** Centralize brand/name/URL/sender into a single config module (env-driven). This is the cheapest highest-leverage fork-enablement change.
- **Why before fork:** This is literally the fork's blocker — do it first so inLIFE Pulse is a config flip.

---

## Tier 1 — Production stability hardening (WisdomBI now)

Fix these in prod regardless of the fork. CODE fixes also flow to the fork.

### R8 · Xero token-refresh cron timeout risk at scale  (C-19, C-16)
- **Sev:** MEDIUM→HIGH (grows with tenant count) · **Effort:** M · **Fork:** CODE
- **What:** Sequential token refresh; at ~400 connections this approaches the 300s function limit. `sync-orchestrator.ts` is 1286 lines with 11 bare `catch {}` swallowing failures silently.
- **Evidence:** `refresh-xero-tokens` sequential loop; `sync-orchestrator.ts` (1286 lines, bare catches).
- **Fix:** Batch/parallelize refresh with concurrency cap; replace bare catches with logged, typed error handling so silent Xero drops surface. Durability is the recurring complaint.

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

### R26 · Forecast-ownership check on `scenarios` POST  (C-38)
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** POST (`forecasts/scenarios/route.ts:91–153`) doesn't verify the caller can access the `forecast_id`'s business, allowing cross-tenant scenario write-pollution. (PATCH/DELETE are correctly user-scoped.)
- **Fix:** Add the same business-access check GET already performs, before insert.

### R27 · Soft-delete clients + backup-before-cascade  (C-39)
- **Sev:** MEDIUM · **Effort:** M · **Fork:** CODE
- **What:** Super-admin client delete triggers `ON DELETE CASCADE` that silently wipes `xero_pl_lines` + ~40 cascaded tables with no soft-delete/backup/confirmation. Also audit the manual-delete table names (`kpis`, `messages`, `annual_goals`) — possibly legacy/no-op.
- **Fix:** `deleted_at` soft-delete + export-to-archive before any hard delete + confirmation token.

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

### R15 · Drop/scope backup & legacy tables  (C-23, C-24, C-30, C-31)
- **Sev:** LOW · **Effort:** S · **Fork:** PROD (fork omits them)
- **What:** `strategic_initiatives_backup`, `helpers-backup.ts`, `kpi-definitions-legacy.ts`, a duplicate index, 3 dead edge functions, `lambda/` dir.
- **Fix:** Don't migrate these into the fork. In prod, archive and drop after confirming non-reference.

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

> **Note on R16:** the C-34 half (status/role-blind membership in the *canonical* `verifyBusinessAccess`) is a genuine access-control bug — a deactivated team member retains app-layer access via the service-role path. Treat that half as **Tier 1 / security-grade**, not cleanup. The C-12 half (the kpis weak copy) is the lower-urgency consolidation.

---

## Recommended sequencing

**Phase A — Code spine (before fork):** R1 → R2 → R3 → R4 → R5 → R6 → R7, plus **R16's C-34 half** (security-grade access fix) and the **R23 fork decision** (single-coach vs join table — decide alongside R1 since both touch the resolver/RLS). This is the fork gate. Land these and the fork inherits a clean, validated, single-id, role-correct, brand-decoupled spine.

**Phase B — Prod hardening (parallel, WisdomBI):** R8, R9, R10, R11, R12, R13. Ship continuously to prod; CODE items also flow to the fork branch.

**Phase C — Prod data cleanse (after A):** R14 → C-32 mask removal → R15. **Hard ordering: R14 must precede the C-32 `auth.uid()::TEXT` removal** (R2), or polluted rows vanish from their authors. Separate migration track, gated on R1–R3 landing first. Fork skips entirely.

**Phase D — Cleanup (fork-prep window):** R16 (C-12 half) → R17–R22.

**Fork cut point:** after Phase A completes and Phase B's CODE items are in. Phase C never blocks the fork.

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
