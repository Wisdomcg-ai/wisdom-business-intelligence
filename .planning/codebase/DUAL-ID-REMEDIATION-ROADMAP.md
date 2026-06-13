# Dual-ID Remediation — Milestone Roadmap (v2, evidence-based)

**Status:** PLAN for Matt's review. No code until approved.
**Sources:** `DUAL-ID-VERIFIED.md` (the measured 23 confirmed bugs — authoritative) and
`DUAL-ID-AUDIT.md` (the wider AI sweep — directional only).
**Decision (2026-06-13):** full remediation; Phase 73 (annual reset) paused until the foundation lands.

## What changed from v1 (why this is trustworthy now)
v1 was scoped on the AI audit's **41 "active bugs."** Independent verification against code +
prod data corrected that to **23 confirmed-active** (12 nuanced, 10 latent, 13 false-positive),
collapsing to **~8 root causes**. Key facts that reshape the plan:
- **No silent data corruption.** The FKs added on 2026-06-11 *reject* the wrong-key writes
  (fail-closed). The harm is **broken features + empty coach views + swallowed errors**, not
  cross-tenant data loss. (The audit's "data loss since 2026-04-22" date was fabricated.)
- **Every confirmed write-bug was hidden by a discarded error.** That's *why* none surfaced.
  → "stop swallowing FK/PostgREST errors" becomes a cross-cutting workstream.
- **Two confirmed items aren't dual-ID at all** — they're **column-name bugs** (`/api/annual-plan`
  + the strategic-initiatives create flow). Split into their own phase.
- **Canonical key confirmed** = `business_profiles.id`; `businesses ↔ business_profiles` is 1:1.

This is **not a fire** (no corruption) but it is real: coach dashboards/weekly-reviews show empty
for live clients, KPI-actuals/snapshots stop saving on workshop completion, and a few buttons fail.

## Foundation, then root-cause fixes (verify each against prod data, Precision-style)

### R-1 — Foundation (keystone; no behaviour change)
- **Shared `resolveBusinessProfileId(input): BusinessProfileId | null`** — accepts any of the three
  id-spaces, returns the canonical `business_profiles.id`, or `null` (never a silent businesses.id).
- **Branded ID types** (`BusinessId` / `BusinessProfileId` / `UserId`) — type the `business_id` param
  of every profile-keyed service/query wrapper as `BusinessProfileId` so passing a `BusinessId` is a
  **compile error** (would have statically caught most confirmed writes).
- **Error-surfacing discipline** — a small wrapper/lint so Supabase/PostgREST errors are logged to
  Sentry, never silently discarded. (The mechanism that hid all 23.)
- Resolver unit tests + a grep guard against new inline `business_profiles.select('id')` + `|| businesses.id`.

### R-2 — Confirmed dual-ID fixes, by root cause (customer-facing, prioritised)
1. **Coach KPI dashboard** — `useBusinessDashboard.ts:127` translate override→profile id. **One fix
   cures 5 findings** (coach sees real targets/KPIs/snapshots instead of $0/empty).
2. **Quarterly-review write path** — `quarterly-review-service.ts:726` (kpi_actuals) + `:824`
   (quarterly_snapshots): resolve profile id before upsert **and stop swallowing the FK error**.
   Restores KPI-actuals + snapshot persistence on workshop completion. *Highest data value.*
3. **Coach weekly-review reads** (one pattern, 6 sites): pass the resolved profile id, not
   `clientId`/businesses.id — `weekly-review-service.ts:499/553`, `coach/clients/[id]/page.tsx:449/812`,
   `coach/dashboard/page.tsx:152`, `api/coach/client-completion/route.ts:359`. Fixes empty coach
   review views, false "inactive" flags, completion scores, and live auto-refresh.
4. **Analytics financial chart** — `api/analytics/client/[id]/route.ts:66`: reuse the route's own
   `resolveBusinessProfileIds` (already at L70) for the goals query.
5. **Forecast selector** — `ForecastSelector.tsx:115/220`: resolve profile id before duplicate /
   deactivate (mirror `loadForecasts` in the same file). Fixes Duplicate + Set-Active.
6. **Demo seeder** (demo-only) — `demo-client/route.ts:364/579/588`: write `profileId`; fix teardown
   in lockstep.

### R-3 — Column-name / schema bugs (NOT dual-ID; found en route, real feature breakage)
- `api/annual-plan/route.ts:103` — `selected_for_annual_plan` column doesn't exist → use `selected`
  (returns empty for 100% of users today). Surface the discarded error.
- `strategic-initiatives.tsx:562/601/634` (Add Initiative / from-assessment / from-roadmap) — inserts
  omit NOT-NULL `business_id`/`step_type` and reference nonexistent columns → every insert hard-fails.
  Insert canonical `business_id = profileId`, valid `step_type`, real columns only.

### R-4 — Latent hardening + dead-code removal (track separately; not urgent)
- Replace fragile `profile?.id || businesses.id` / `|| user.id` / id-try loops with the resolver →
  explicit empty state (plan-data-assembler, strategic-sync-service, plan_snapshots split-history,
  the QR step fallbacks, `api/kpis` contract, goals resolve-business). The 10 latent + the nuanced.
- Delete verified dead code (`SnapshotService`, `KPIService.updateKPIValue/deleteKPI`,
  `getIncompleteReviewsForWeek`, dead `/api/kpis` POST, sprint/operational user_id fallbacks).
- **Drop the 13 false-positives** from the backlog entirely.

### R-5 — Finish FK rollout (Phase B) + single-branch RLS (durable backstop)
- Convert remaining `text business_id` columns (`activity_log`, `plan_snapshots`, the dual-column
  `business_kpis`/`business_financial_goals`, …) to uuid + FK → `business_profiles(id)`; rewrite the
  dual-tolerant RLS to single-branch. Makes any future/missed mis-key a **loud** error. (FK Phase B
  from `FK-INTEGRITY-PLAN.md`.)

### R-6 — Data cleanse + backfill (R14)
- Backfill `strategic_initiatives` rows keyed only by `user_id`; confirm zero rows keyed by
  user_id/businesses.id across all profile-keyed tables; then remove the deferred legacy user_id loops.

### R-7 — Resume Phase 73 (annual reset)
- Finish W4 (retire annual steps) + W5 (integration tests) on the foundation; re-run the Precision
  dry-run; ship.

## Cross-cutting (every phase)
- **Verify against prod data before/after** for each customer-facing fix (read-only, demo client) —
  the Precision method that already caught the bug and the audit's overstatements.
- **Surface swallowed errors** (R-1 discipline) applied as each path is touched.
- Full `vitest` at each phase gate; FK tables (R-5) make wrong writes throw in tests.
- No blind prod migrations (R-5 via the normal pipeline).

## Open questions for Matt
- **Naming:** phase block 74+ in the current milestone (recommend — continuous history) vs a new
  `v1.1` milestone.
- **Sequencing:** R-1 → R-2 (customer fixes) first, R-3 alongside; R-4/R-5/R-6 as the durable tail.
  Given there's **no corruption**, is the durable FK/RLS/cleanse tail (R-5/R-6) in scope now, or a
  follow-up after the visible fixes land?
- **Effort basis:** estimate from **8 root causes / 23 confirmed**, NOT 41. Any plan built on "41" or
  the fabricated data-loss date is overstated.
