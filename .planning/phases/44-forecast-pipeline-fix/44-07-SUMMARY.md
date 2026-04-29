---
phase: 44-forecast-pipeline-fix
plan: 07
subsystem: forecast-wizard-atomic-save
status: complete (retroactive close-out)
sub_phase: B
wave: 7
completed_at: 2026-04-27
closed_out_at: 2026-04-28
tags: [forecast, atomic-save, RPC, D-12, retroactive, incident-recovery]
requirements:
  - PHASE-44-D-12
forward_pointer: 44.1-atomic-save-hardening-and-staged-rollout
dependency_graph:
  requires:
    - 44-06 (save_assumptions_and_materialize RPC + forecast_pl_lines.computed_at)
  provides:
    - "Atomic wizard save path (replaces serial UPDATE-then-INSERT with non-fatal silent-failure swallowing)"
    - "POST /api/forecast/[id]/recompute recovery hatch"
    - "sync-forecast route retired to 410 Gone shim"
  affects:
    - 44-08 (ForecastReadService — D-18 invariants assume RPC freshness contract holds)
    - 44.1 (structural hardening of the same RPC body)
key_files:
  created:
    - src/app/api/forecast/[id]/recompute/route.ts
  modified:
    - src/app/api/forecast-wizard-v4/generate/route.ts
    - src/app/api/Xero/sync-forecast/route.ts
    - src/__tests__/services/save-and-materialize.test.ts
decisions:
  - "44-07's RPC body uses DELETE-then-INSERT-from-derived-array semantics — structurally vulnerable to shorter-input loss but NOT the proximate cause of the Apr 28 incident. Phase 44.1 restructures to UPSERT."
  - "Apr 28 incident root cause: Wave 5 xero_pl_lines wide → long migration broke 12 read paths AND dropped RLS policies — read-path failure presenting as 'missing accounts' symptom. Already hotfixed."
  - "44-07 marked complete (not abandoned) per D-44.1-19: shipped tasks are correct in spirit; the latent data-loss vector lives on in the RPC body and is closed structurally in 44.1-02."
metrics:
  duration_minutes: 0
  tasks_completed: 3
  files_modified: 4
---

# Plan 44-07 — Sub-phase B Wizard Wiring: SUMMARY (retroactive close-out)

## Status

Plan 44-07 shipped its tasks (atomic RPC wiring + recompute endpoint + sync-forecast retire). Initial post-deploy assessment flagged it as abandoned after the Apr 28 morning incident; corrected diagnosis on Apr 28 afternoon attributes the incident to read-path breaks + RLS drops from Wave 5, NOT atomic save. 44-07's shipped commits are correct in spirit; the residual data-loss vector (DELETE-then-INSERT-from-derived-array) is structurally fixed in Phase 44.1.

## What shipped

| Artifact | Status | Commit |
|----------|--------|--------|
| Wizard generate route → atomic RPC call | live | 19ea32e |
| POST /api/forecast/[id]/recompute | live | dba3766 |
| Legacy sync-forecast route retired (thin shim) | live | 1003a9e |

## Apr 28 incident — timeline

- **06:05** — Phase 44 Sub-phases A and B deployed to main.
- **08:30** — First coach reports of "missing accounts" after a wizard save.
- **09:15** — Working hypothesis: 44-07's RPC's DELETE-then-INSERT body lost accounts.
- **10:39** — Hotfixes applied: `29730f6` (wide-compat redirect for 12 read paths), `ec5055e` (xero_pl_lines RLS restore), `e641a8b` (WIZARD_VERSION bump to clear stale localStorage).
- **Afternoon (Apr 28)** — Post-incident diagnosis: actual root cause was Wave 5's `xero_pl_lines` wide → long migration breaking 12 read paths AND dropping RLS policies on the renamed table. The "missing accounts" symptom was a read-path failure, not a save-path failure.
- **Late afternoon (Apr 28)** — Phase 44.1 scope agreed: restructure 44-07's RPC body from DELETE-then-INSERT to UPSERT (eliminates the latent data-loss vector that was always there but wasn't the proximate cause), gate Wave 8/9 freshness invariants behind soft-fail flag, canary on a single tenant before pushing.

## The misdiagnosis

The "atomic save lost data" hypothesis was REJECTED:

1. The wizard save's RPC `DELETE WHERE is_manual=false` + `INSERT FROM jsonb_array_elements(p_pl_lines)` is structurally vulnerable to shorter-input loss. BUT in the Apr 28 reports, the symptom was "accounts not visible" not "accounts deleted from DB" — direct DB queries showed the rows were still present.
2. The actual symptom traced to `monthly_values` column queries against the now-renamed `xero_pl_lines` table. The Wave 5 long-format migration renamed the column but 12 read paths still queried the old shape. The hotfix `29730f6` redirected reads to `xero_pl_lines_wide_compat` view.
3. RLS dropped during the rename — `ec5055e` restored.
4. Stale localStorage from a prior wizard version was returning empty arrays — `e641a8b` bumped WIZARD_VERSION to invalidate.

The latent data-loss risk in 44-07's DELETE-then-INSERT body remained real; Phase 44.1 fixes it structurally even though it was not the Apr 28 incident's cause.

## Forward pointer to Phase 44.1

Phase 44.1 (`atomic-save-hardening-and-staged-rollout`) is the structural close-out of this plan. Specifically:

| 44-07 residual risk | 44.1 mitigation |
|---------------------|-----------------|
| RPC's DELETE-then-INSERT-from-derived-array → silently loses accounts on shorter input | 44.1-02: restructured to UPSERT keyed on `(forecast_id, account_code) WHERE is_manual = false` |
| No regression test coverage for shorter-input loss vectors | 44.1-03: 5 multi-vector tests added to `save-and-materialize.test.ts` |
| Wave 8/9 freshness invariants would 500 on legacy-saved forecasts | 44.1-04: soft-fail mode behind `FORECAST_INVARIANTS_STRICT` env flag |
| No documented PITR rollback recipe for production data loss | 44.1-06: `PITR-RUNBOOK.md` in this phase directory |

## Code touchpoints (live in main as of 2026-04-27)

- `src/app/api/forecast-wizard-v4/generate/route.ts` — atomic RPC call (lines 174-231).
- `src/app/api/forecast/[id]/recompute/route.ts` — recompute recovery hatch.
- `src/app/api/Xero/sync-forecast/route.ts` — thin shim returning 410 Gone.

## Acceptance criteria (closed-out)

- [x] Wizard generate route calls `save_assumptions_and_materialize` RPC. Verified by `grep -c "save_assumptions_and_materialize" src/app/api/forecast-wizard-v4/generate/route.ts` returning >= 1.
- [x] `POST /api/forecast/[id]/recompute` exists and is auth-gated.
- [x] Legacy sync-forecast route is a thin shim.
- [x] Forward-pointer to 44.1 documented above.
- [x] ROADMAP.md marks 44-07 complete (per D-44.1-19) — performed in Task 3.

## Self-Check: PASSED

```bash
[ -f "src/app/api/forecast/[id]/recompute/route.ts" ] && echo "FOUND"
# FOUND
git log --oneline | grep -E "19ea32e|dba3766|1003a9e"
# 19ea32e feat(44-07): wizard generate uses atomic save_assumptions_and_materialize RPC
# dba3766 feat(44-07): add POST /api/forecast/[id]/recompute recovery endpoint
# 1003a9e refactor(44-07): retire legacy sync-forecast route to thin shim
```
