# Phase 74: Dual-ID Remediation (foundation + verified fixes) — Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Source:** PRD Express Path — from `.planning/codebase/DUAL-ID-VERIFIED.md` (authoritative bug
list) + `.planning/codebase/DUAL-ID-REMEDIATION-ROADMAP.md` (scope/sequence).

<domain>
## Phase Boundary
The app uses three id-spaces for one business — `businesses.id`, `business_profiles.id`
(CANONICAL for the affected tables), and auth `user_id`. Code mixes them, causing wrong-key
reads (0 rows) and wrong-key writes (now FK-rejected → swallowed errors → broken features).
This phase builds the FOUNDATION that makes the wrong id impossible, then fixes the 23 VERIFIED
bugs grouped by ~8 root causes, plus 2 adjacent column-name bugs found en route.

**Delivers:**
- R-1 (foundation, no behaviour change): one shared `resolveBusinessProfileId()`; branded id
  types; an error-surfacing discipline.
- R-2: the 23 verified dual-ID fixes (see DUAL-ID-VERIFIED.md §2), by root cause.
- R-3: the 2 column-name bugs (annual-plan + strategic-initiatives create) — NOT dual-ID.

**OUT OF SCOPE (Phase 75 follow-up):** finish FK rollout (Phase B) + single-branch RLS + R14
data cleanse + removing latent fallbacks. The 13 false-positives are dropped; the 10 latent are
tracked separately.
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not re-litigate)

### Canonical key
- `business_profiles.id` is the canonical key for ALL affected tables (business_kpis,
  strategic_initiatives, business_financial_goals, kpi_actuals, quarterly_snapshots,
  weekly_reviews, weekly_metrics_snapshots, financial_forecasts, vision_targets, …). Verified in
  prod (e.g. business_kpis 55/55, strategic_initiatives 448/448 profile-keyed; 0 businesses-keyed).
- `businesses ↔ business_profiles` is 1:1 (27/27; one business has no profile → resolver returns null).

### R-1 Foundation
- **`resolveBusinessProfileId(input): BusinessProfileId | null`** — accepts a businesses.id,
  business_profiles.id, or user_id and returns the canonical business_profiles.id; returns `null`
  on miss (NEVER a silent businesses.id). One implementation; ban inline `business_profiles.select('id')`
  + `|| businesses.id` fallbacks in feature code.
- **Branded id types**: `BusinessId`, `BusinessProfileId`, `UserId` as distinct nominal types
  (the codebase already brands `BusinessId`/`UserId`). Type the `business_id` param of every
  profile-keyed service/query wrapper as `BusinessProfileId` so passing a `BusinessId` is a
  COMPILE ERROR.
- **Error-surfacing discipline**: a small helper/lint so Supabase/PostgREST errors are logged to
  Sentry and never silently discarded (every confirmed write-bug was hidden by a swallowed error).
- No behaviour change in R-1 itself; ship with resolver unit tests + a grep guard.

### R-2 Fixes (the 23 verified — group by root cause; full evidence in DUAL-ID-VERIFIED.md §2)
- **Coach KPI dashboard**: `useBusinessDashboard.ts:127` — translate override (businesses.id) →
  profile id; do NOT fall back to the raw override. One fix cures 5 findings (159/160/178/185).
- **Quarterly-review completion writes**: `quarterly-review-service.ts:726` (kpi_actuals) + `:824`
  (quarterly_snapshots) — resolve profile id before upsert AND stop swallowing the FK error.
- **Coach weekly-review reads** (one pattern, 6 sites): pass resolved profile id, not clientId —
  `weekly-review-service.ts:499/553`, `coach/clients/[id]/page.tsx:449/812`,
  `coach/dashboard/page.tsx:152`, `api/coach/client-completion/route.ts:359` (+ its :611 lookup).
- **Analytics chart**: `api/analytics/client/[id]/route.ts:66` — reuse the route's own
  `resolveBusinessProfileIds` (already at L70) for the goals query.
- **Forecast selector**: `ForecastSelector.tsx:115/220` — resolve profile id before duplicate /
  deactivate (mirror `loadForecasts` in the same file).
- **Demo seeder** (demo-only): `demo-client/route.ts:364/579/588` — write `profileId`; fix the
  paired teardown in lockstep.

### R-3 Column-name bugs (NOT dual-ID)
- `api/annual-plan/route.ts:103` — `selected_for_annual_plan` does not exist → use `selected`
  (`.eq('selected', true)`); surface the discarded error at L99.
- `strategic-initiatives.tsx:562/601/634` (Add Initiative / from-assessment / from-roadmap) —
  inserts omit NOT-NULL `business_id`/`step_type` and reference nonexistent columns → hard fail.
  Insert canonical `business_id = profileId`, valid `step_type`, real columns only; surface errors.

### Hard rules
- Each customer-facing fix is VERIFIED against PROD DATA read-only (Precision-style) before/after.
- Do NOT blindly trust the AI audit — it fabricated the "2026-04-22 data-loss" date. Use
  DUAL-ID-VERIFIED.md.
- NOT urgent corruption — the live FKs fail-closed. Prioritise by customer impact, not panic.
- No schema migrations in this phase (those are Phase 75).

### Claude's Discretion
- Exact resolver location (e.g. `src/lib/business/`), caching, and how each call site obtains the
  resolved id (thread a prop vs resolve in-handler). Test structure. Wave/plan grouping.
</decisions>

<canonical_refs>
## Canonical References (downstream agents MUST read)
- `.planning/codebase/DUAL-ID-VERIFIED.md` — THE bug list: 23 confirmed, file:line, prod-data
  evidence, and the fix per item. Authoritative.
- `.planning/codebase/DUAL-ID-REMEDIATION-ROADMAP.md` — scope + sequence (R-1..R-7).
- `.planning/codebase/DUAL-ID-AUDIT.md` — wider sweep; DIRECTIONAL ONLY (overstated; one fabricated date).
- Existing id helper: `src/lib/business/resolveBusinessId.ts` (returns businesses.id — the new
  resolver complements it; do not break it). Branded ids live near `BusinessContext` / `lib/types/ids`.
- Touch points per fix: see the file:line list in DUAL-ID-VERIFIED.md §2 (Areas A–F).
</canonical_refs>

<specifics>
## Specific Ideas
- The same dual-ID class was just fixed narrowly in Phase 73 (annual-reset services, branch
  plan/phase-73-annual-reset) — use the same direction (profile id) and the Precision dry-run method.
- Verify each customer fix against prod (read-only) on the **Precision Electrical Group** demo
  client (profile 86e9d84f / businesses 6cb999b5) before/after.
- Full `vitest` at the phase gate.
</specifics>

<deferred>
## Deferred (Phase 75)
- Finish FK rollout (Phase B) + single-branch RLS; R14 data cleanse + backfill; remove the 10
  latent fallbacks + dead code. The 13 false-positives are out entirely.
</deferred>

---
*Phase: 74-dual-id-remediation · Context via PRD Express Path 2026-06-13*
