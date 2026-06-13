# Dual-ID Remediation — Milestone Roadmap (proposed)

**Status:** PLAN for Matt's review. No code until approved.
**Source:** `.planning/codebase/DUAL-ID-AUDIT.md` (41 active + 38 latent bugs, system-wide).
**Goal:** make `business_profiles.id` the single, enforced key for every profile-keyed table —
so this bug class **cannot recur** — and fix every site that currently uses the wrong id.
**Decision (2026-06-13):** full remediation milestone; Phase 73 (annual reset) paused until done.

## The core idea (why a milestone, not patches)
Three id-spaces (`businesses.id`, `business_profiles.id` = canonical, auth `user_id`) get mixed
because (1) `resolveBusinessId()` returns a `businesses.id`, (2) most `business_id` columns are
`text` with no FK, (3) RLS accepts both ids, and (4) `profile?.id || businesses.id` fallback
chains hide wrong-key reads. Patching call sites alone will not stop recurrence (it just did —
Phase 73). The fix is a **foundation** (one resolver + branded types) that makes the wrong id a
**compile error**, then a sweep, then FK/RLS enforcement so any miss is a **loud** error.

## Proposed phases (ordered; each becomes a GSD phase)

### R-1 — Foundation: shared resolver + branded id types  ⟵ keystone, do first
- One `resolveBusinessProfileId(input): BusinessProfileId | null` — accepts any of the three
  id-spaces, returns the canonical `business_profiles.id`, or `null` (never a silent businesses.id).
- Brand `BusinessId` / `BusinessProfileId` / `UserId` as distinct nominal types; type the
  `business_id` param of profile-keyed service/query wrappers as `BusinessProfileId` so passing a
  `BusinessId` is a **compile error**. (Would have statically caught every active write bug.)
- Establish the regression-test harness (resolver unit tests; a lint/grep guard against new
  inline `business_profiles.select('id')` + `|| businesses.id` patterns).
- **No behaviour change yet** — pure foundation + tests.

### R-2 — Active-bug sweep, Wave 1 (live data loss — highest leverage)
- `useBusinessDashboard.ts:127` translation — **one fix cures 11 sites** (coach KPI + weekly dashboards all-zeros).
- `api/goals/save/route.ts:203/214/221` — coach Goals-Wizard KPI save (orphaned writes).
- `quarterly-review-service.ts:726` (kpi_actuals — FK-violation swallowed, 0 rows since 22 Apr) + `:824` (quarterly_snapshots — lost history).
- `strategic-initiatives.tsx:562/601/634` writes (no business_id → invisible everywhere) + `:201` read.

### R-3 — Active-bug sweep, Wave 2 (remaining active)
- user_id-read bugs: `api/annual-plan:102`, `api/analytics/client/[id]:66`, `swot/page.tsx:394`,
  QR `InitiativesReviewStep/InitiativeReviewStep`, weekly_reviews coach paths
  (`weekly-review-service:499/553`, `coach/clients` + `coach/dashboard`, `client-completion:359`),
  `vision_targets` coach feed (`coach/clients/[id]/page.tsx:651`).
- `ForecastSelector.tsx:115/220` (FK-violating duplicate/activate).
- `api/admin/demo-client` seed + schema fixes (KPIs, weekly_reviews, forecasts, vision_targets).

### R-4 — Latent hardening + dead-code removal
- Replace every `profile?.id || businesses.id` / `|| user.id` / id-try loop with the resolver →
  explicit empty/"no profile" state (promote profile.id to PRIMARY; drop the wrong-key attempt).
  Includes plan-data-assembler, strategic-sync-service (make profileBusinessId mandatory),
  plan_snapshots split-history, QR step fallbacks, api/kpis contract, goals resolve-business.
- Delete verified dead code (`SnapshotService`, `KPIService.updateKPIValue/deleteKPI`,
  `getIncompleteReviewsForWeek`, dead `/api/kpis` POST, sprint/operational user_id fallbacks).

### R-5 — Finish FK rollout (Phase B) + single-branch RLS
- Convert remaining `text business_id` columns (`activity_log`, `plan_snapshots`, the dual-column
  `business_financial_goals`/`business_kpis`, …) to uuid + FK → `business_profiles(id)`; rewrite
  the dual-tolerant RLS to single-branch on the canonical key. Makes future mis-keying a hard error.
  (This is the deferred FK Phase B from `.planning/codebase/FK-INTEGRITY-PLAN.md`.)

### R-6 — R14 data cleanse + backfill
- Backfill `strategic_initiatives` rows that have only `user_id` (no business_id) to the canonical
  key; confirm zero rows remain keyed by user_id / businesses.id across all tables; then remove the
  deliberately-deferred legacy user_id loops (`api/strategic-initiatives:81/98`).

### R-7 — Resume Phase 73 (annual reset)
- Finish Phase 73 W4 (retire annual steps) + W5 (integration tests) on the solid foundation;
  re-run the Precision dry-run; ship.

## Cross-cutting
- **Regression discipline:** full `vitest` at each phase gate; per-area integration tests proving
  the canonical key end-to-end; the FK tables (R-5) make wrong writes throw.
- **Prod-data verification:** for the live-data-loss fixes (R-2), verify against real client data
  read-only before/after (as we did for Precision), and confirm kpi_actuals/quarterly_snapshots
  start persisting again.
- **No blind prod migrations** (R-5 via the normal pipeline, never `db push`).

## Open questions for Matt
- **Naming:** new GSD milestone (e.g. `v1.1 — dual-ID remediation`) vs a phase block (74–80) in
  the current milestone? (Recommend: phase block 74+ — lighter, keeps history continuous.)
- **Urgency split:** OK to ship R-2 (live data-loss fixes) as its own fast PR ahead of the rest,
  or keep everything behind the R-1 foundation? (Recommend: R-1 then R-2, both quickly.)
- **R-5/R-6 scope:** confirm appetite for the FK/RLS conversion + data cleanse (the durable part),
  vs stopping after the code sweep (R-2..R-4).
