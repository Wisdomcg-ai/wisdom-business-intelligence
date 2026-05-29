---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 15
status: complete
completed: 2026-05-29
---

# Plan 68-15 — B8: Save plan version + /api/plan-snapshots — SUMMARY

## What was built

### Task 1 — `POST /api/plan-snapshots` route (server-side composition)

[src/app/api/plan-snapshots/route.ts](src/app/api/plan-snapshots/route.ts) — new Next.js App Router POST handler.

**Request body:**
```json
{
  "business_id": "<business_profiles.id>",
  "label": "<optional override>",
  "step4_plan_data": { /* Step-4 owned slice of OnePagePlanData */ }
}
```

**Server logic:**
1. Auth: `supabase.auth.getUser()` → 401 if no session.
2. Validate body — 400 if `business_id` or `step4_plan_data` missing.
3. Read `business_profiles` for RLS-backed authorization + grab `company_name`, `owner_info`, `business_id` linkage column.
4. **Parallel fetch** `strategy_data` (by user_id), `swot_analyses` latest (by user_id), `businesses` (by `business_profiles.business_id`).
5. **Sequential fetch** `swot_items` once we have the analysis id.
6. **Compose final `plan_data`**: merge server-read vision/mission/coreValues/strengths/weaknesses/opportunities/threats/companyName/ownerGoals with the client's `step4_plan_data`. The client's slice wins for any overlapping key.
7. Compute next `version_number` (max for this `business_id` + 1).
8. INSERT `plan_snapshots` row with `snapshot_type='goals_wizard_complete'`.

Mirrors the composition logic from `scripts/68-08-armstrong-plan-snapshot-baseline.mjs` exactly — server-issued snapshots have the same `plan_data` shape as the Workstream-A baseline.

**Response:**
- 200: `{ ok: true, id, version_number, label }`
- 4xx/5xx: `{ ok: false, error: '...' }`

### Task 2 — "Save plan version" UI in Step 4

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx):

- **Imports**: `OnePagePlanData` type
- **State**: `savingSnapshot`, `lastSavedVersion`
- **`composePlanData()`** typed as `Step4PartialPlanData` (Pick of OnePagePlanData) — returns ONLY Step-4 fields. No vision/mission/SWOT/ownerGoals — those are server-side concerns now.
- **`handleSaveSnapshot()`** — POSTs to `/api/plan-snapshots`, shows `alert()` on success ("Plan version N saved.") and failure. Updates `lastSavedVersion` so the panel shows "Last saved: vN" until the next save.
- **Save panel** rendered at the bottom of the Step 4 return: title, hint text, and "Save plan version" button with `disabled={savingSnapshot}` while in-flight.

### Architecture note

Per the PLAN's verification-loop revision: server-side composition (chosen over option (a) — threading 8+ extra props through `/goals/page.tsx`). Keeps the wizard component lean and matches the 68-08 baseline composition pattern exactly, so any future snapshot diff between operator-triggered and script-triggered snapshots will be apples-to-apples.

### Toast fallback

Used `alert()` for success/failure feedback. No existing toast library (sonner, react-hot-toast, etc.) found in this component or its parent. Safe explicit fallback per PLAN guidance. Future improvement: swap to a proper toast once one is adopted project-wide.

## Acceptance criteria

### Static — Task 1 (all pass)
- ✓ `src/app/api/plan-snapshots/route.ts` exists
- ✓ Contains `export async function POST(req: NextRequest)`
- ✓ Contains `snapshot_type: 'goals_wizard_complete'`
- ✓ Contains `version_number`
- ✓ Contains `auth.getUser()`
- ✓ Contains 400 branch for missing `business_id` / `step4_plan_data`
- ✓ Contains references to `strategy_data`, `swot_items`, `business_profiles`, `businesses` (server-side composition)
- ✓ Contains `step4_plan_data` (proves client sends partial only)

### Static — Task 2 (all pass)
- ✓ Contains `composePlanData` function
- ✓ Contains `handleSaveSnapshot` async function
- ✓ Contains `'/api/plan-snapshots'`
- ✓ Contains `step4_plan_data` in POST body
- ✓ Contains button label `'Save plan version'`
- ✓ Contains state `savingSnapshot`, `lastSavedVersion`
- ✓ `composePlanData` does NOT include `vision`/`mission`/`coreValues`/`strengths`/`weaknesses`/`opportunities`/`threats`/`companyName`/`ownerGoals` (server merges those)
- ✓ Button rendered once with `disabled={savingSnapshot}`

### Live
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint` clean on both files (2 pre-existing warnings on Step4 unrelated)
- ✓ `npm run build` succeeds; route shows as `ƒ /api/plan-snapshots` (dynamic)
- ⏳ Browser smoke (post-deploy): click button → success alert with version number → re-click shows "Last saved: vN" hint → GET `plan_snapshots` shows the row

## Deviations from PLAN

- **`strategy_data` keyed by user_id, not business_id** — matches the live row (business_id is null on Armstrong's strategy_data per 68-06 deviation). The PLAN's pseudo-code suggested `business_id=eq.${business_id}` but the live row is filterable only by user_id; route uses `user.id` from the auth context.
- **SWOT join via `swot_analyses.user_id`, not embed** — the embed pattern (`swot_analyses!inner(business_id)`) suggested in PLAN is fragile; used the 2-step pattern from 68-08 instead.
- **SWOT category values singular** (`strength`, `weakness`, etc.) — verified live in 68-06.

## Files

| Path | Change |
|---|---|
| `src/app/api/plan-snapshots/route.ts` | NEW (165 lines) |
| `src/app/goals/components/Step4AnnualPlan.tsx` | +120 lines (import + state + composePlanData + handleSaveSnapshot + UI panel) |

## Wave 8 + Phase 68 status

**Phase 68 Workstream B complete.** 7 plans (68-09 → 68-15) plus B-FOLLOWUP-1 (defensive bucket fallback) all shipped on the `phase-68-step4-armstrong` branch.

**Phase 68 totals across both workstreams:**
- **8 A plans** (Wave 1) — Armstrong production data refreshed
- **7 B plans** (Waves 2–8) — Step 4 wizard improvements
- **2 follow-ups** — defensive category buckets (shipped), within-step twelve_month dedupe (deferred)
- **1 ramp-aware quarterly split** (shipped as an extra during Wave 1)
- **Phase 69 documented** (forecast wizard extended-period bug — same family as B15/B16)

## Self-Check

PASSED. Save button POSTs to a working API route; server-side composition mirrors 68-08; tsc + lint + build clean; safe `alert()` fallback documented for future toast adoption.
