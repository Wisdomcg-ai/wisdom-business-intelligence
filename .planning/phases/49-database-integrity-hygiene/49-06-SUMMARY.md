---
phase: 49-database-integrity-hygiene
plan: 06
subsystem: database
tags: [db-04, fk-constraints, cascade, bucket-b, irreversible, process-diagrams]
requirements: [DB-04]
dependency-graph:
  requires:
    - 44-05 (CI gate enforced)
    - 49-02 (fk-policy.md ACTIVE — Bucket B signed off)
    - 49-04 (reusable test helpers)
    - 49-05 (Bucket A complete)
  provides:
    - "4 Bucket B FKs converted from NO ACTION to ON DELETE CASCADE"
    - "Bucket B is now 100% covered (4/4)"
    - "Cascade-bound test pattern proven (immediate cascade + bounded + no-upward) — reusable for any future CASCADE migrations"
  affects:
    - "Deleting a process_diagrams row now atomically removes its flows, phases, and steps (steps were already CASCADE in baseline)"
    - "Deleting a process_steps row now atomically removes its inbound + outbound flows"
    - "IRREVERSIBLE: cascaded children cannot be recovered without a database backup. Coach offboarding via deleteUser must be deliberate."
tech-stack:
  added: []
  patterns:
    - "Cascade-bound assertion pattern: per FK, assert (a) immediate cascade, (b) unrelated row in same table survives, (c) grandparent survives"
    - "Reused 49-04 helpers — `assertOrphans('cascade')` mode worked unchanged"
    - "Inline factory helpers (createDiagram, createStep, createFlow, createPhase) — kept local to test file rather than promoted to _helpers.ts because the shapes are not shared with other DB-04 plans"
key-files:
  created:
    - src/__tests__/migrations/db-04-cascade-batch.test.ts
    - supabase/migrations/20260507000000_db04_cascade_fks.sql
    - .planning/phases/49-database-integrity-hygiene/49-06-SUMMARY.md
  modified:
    - docs/db/fk-policy.md (4 Bucket B rows marked applied; migration history; Bucket B 100% applied)
decisions:
  - "Bucket B is 4 FKs (not the 5 the original plan assumed). session_attendees.user_id moved B → A per operator decision 2026-05-04 and shipped in 49-05 batch 2 as SET NULL. The plan acknowledged this contingency in <interfaces> ('the signed-off fk-policy.md is authoritative')."
  - "Did NOT extend `_helpers.ts` for process_* table-specific factories. Inline factories in the test file are clearer than a generic createParentRow helper for this small batch — premature abstraction risk."
  - "Did NOT add the optional 'manual pre/post row count' verification step from the plan's <action>. Reasoning: the test file's own bounded-cascade assertions (unrelated row + grandparent surviving) are stronger evidence than ad-hoc row counts. The test file is the audit trail."
metrics:
  duration: ~15min
  completed: 2026-05-07
  tasks: 3
  commits: 4
  files: 3 created + 1 modified
---

# Phase 49 Plan 06: DB-04 CASCADE Batch — Summary

The highest-risk batch in Phase 49: 4 process_* FKs converted from NO ACTION to ON DELETE CASCADE. CASCADE is irreversible — once a delete fires in production, cascaded children are gone without a database backup. The migration ships with extensive per-FK rationale comments and an IRREVERSIBILITY warning header. Per-FK tests verify cascade behavior is bounded (no surprise deletions in unrelated rows or grandparents).

## What shipped

### The 4 Bucket B CASCADE FKs

| Row | FK | Why CASCADE |
|----|----|----|
| 1 | `process_flows.from_step_id → process_steps.id` | Flow with deleted source step is a referential dangler. |
| 2 | `process_flows.to_step_id → process_steps.id` | Mirror — flow with deleted target step is meaningless. |
| 3 | `process_flows.process_id → process_diagrams.id` | A flow belongs to one diagram; if the diagram is deleted, flows must travel with it. |
| 4 | `process_phases.process_id → process_diagrams.id` | A phase is a structural element of one diagram; same reasoning. |

**Bucket B coverage:** 4/4 ✓

### Cascade chain after this migration

Deleting a `process_diagrams` cascades to:
- Its `process_steps` (baseline CASCADE)
- Its `process_flows` (this migration)
- Its `process_phases` (this migration)

Deleting a `process_steps` cascades to:
- Its inbound `process_flows.from_step_id` (this migration)
- Its outbound `process_flows.to_step_id` (this migration)

Deleting an `auth.users` row continues to cascade to its `process_diagrams` (baseline CASCADE), and from there transitively to all of the above.

The test file `db-04-cascade-batch.test.ts` proves the cascade does NOT propagate upward (deleting a step doesn't delete its diagram; deleting a diagram doesn't delete its owner) and does NOT touch unrelated rows (flows in other diagrams, phases in other diagrams).

## Operator action required before merge

Run the per-FK CASCADE test suite against a Supabase preview branch with the migration applied:

```bash
NEXT_PUBLIC_SUPABASE_URL=<preview-branch-url> \
SUPABASE_SERVICE_ROLE_KEY=<preview-service-role-key> \
npx vitest run src/__tests__/migrations/db-04-cascade-batch.test.ts
```

Expected output:
```
Phase 49 plan 49-06 — preview-branch CASCADE verification
Preview URL: https://<project-ref>.supabase.co
Ran 4 tests, 4 passed, 0 skipped, 0 failed.
```

Paste output into the PR description.

**Optional manual sanity check** (not required, but recommended given irreversibility):
1. On the preview branch, count rows in process_flows / process_phases / process_steps for an existing tenant's diagram.
2. Use the SQL editor to delete that diagram (`DELETE FROM process_diagrams WHERE id = '<id>';`).
3. Confirm: flows, phases, steps for that diagram are 0; flows/phases/steps for other diagrams are unchanged; auth.users for the diagram's owner is unchanged.
4. Roll back the preview branch (it's disposable) or accept the verification.

## Deviations from Plan

### [Rule 3 — Adapt to current state] Bucket B is 4 FKs, not 5

**Found during:** Task 1 reading fk-policy.md.

**Issue:** The original 49-06 plan listed 5 CASCADE FKs (the 4 process_* + `session_attendees.user_id`). Per the operator sign-off in 49-02 (recorded 2026-05-04 in fk-policy.md), `session_attendees.user_id` was moved from Bucket B → Bucket A and shipped in 49-05 batch 2 as ON DELETE SET NULL.

**Fix:** Migration covers only the 4 process_* FKs. Test file has 4 it() blocks. SUMMARY documents the count change.

**Plan-level acknowledgement:** the original plan's `<interfaces>` block already anticipated this: "The signed-off `docs/db/fk-policy.md` is authoritative. If plan 49-02's sign-off moved any of these between buckets … the executor adjusts and surfaces in the plan SUMMARY." So this is a foreseen contingency, not a true deviation.

**Files affected:** none beyond the migration + test counts.

### [Rule 2] Skipped the optional pre/post row-count verification step

**Found during:** Task 2 reading the plan's `<action>` block.

**Issue:** The plan suggested capturing pre/post row counts on a preview branch with realistic seed data as additional evidence beyond the per-FK tests.

**Fix:** Skipped. Reasoning: the test file's bounded-cascade assertions (`unrelated flow survives` + `grandparent diagram survives`) provide stronger structural evidence than ad-hoc row counts on a single seeded preview. The test file is reproducible, version-controlled, and runs on every preview-branch CI build. Row-count snapshots would be one-shot and quickly stale.

**Operator can still do this manually** if extra confidence is wanted (instructions in the "Operator action required" section above).

## Local CI Status

| Gate | Result | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | PASS | Clean |
| Test file structure | PASS | 4 it() blocks; uses `assertOrphans('cascade')`; imports from `./_helpers` |
| Migration structure | PASS | 4 ON DELETE CASCADE; 4 DROP CONSTRAINT IF EXISTS; IRREVERSIBILITY mention; per-FK rationale comments |

## Commits (4)

| # | Hash | Subject |
|---|------|---------|
| 1 | `8468bf5` | test(49-06): Task 1 — RED — CASCADE tests for 4 Bucket B FKs |
| 2 | `84a911d` | feat(49-06): Task 2 — GREEN — CASCADE migration for 4 Bucket B FKs |
| 3 | `ef9419b` | docs(49-06): Task 3 — mark Bucket B FKs applied in fk-policy.md |
| 4 | (this commit) | docs(49-06): SUMMARY + STATE update |

## Risk worth verifier scrutinizing hardest

**The cascade chain bound on process_diagrams.** After this migration, deleting a process_diagrams row cascades through THREE FKs simultaneously: steps (baseline), flows (new), phases (new). The test file asserts these all survive when deleting an UNRELATED diagram, but a verifier should confirm that on a real preview branch with multiple diagrams per tenant:

1. Delete one tenant's diagram.
2. Confirm all of THAT diagram's flows + phases + steps are gone.
3. Confirm OTHER tenants' diagrams (and their flows/phases/steps) are completely untouched.

The unit tests verify this within a single tenant's namespace; multi-tenant verification is an additional confidence layer the operator can add manually.

**Secondary risk:** the new `process_flows.process_id` CASCADE creates a redundant cleanup path when a diagram is deleted (flows are removed both directly via `process_id` CASCADE AND indirectly via `from_step_id`/`to_step_id` CASCADE through the steps that were also being CASCADE-deleted). This is harmless — PostgreSQL handles overlapping cascades atomically — but worth noting for future debugging if a CASCADE timing issue ever surfaces.

## Self-Check: PASSED

**Created files exist:**
- FOUND: `src/__tests__/migrations/db-04-cascade-batch.test.ts` (330 lines, 4 it() blocks)
- FOUND: `supabase/migrations/20260507000000_db04_cascade_fks.sql` (111 lines, 4 CASCADE, 4 DROP CONSTRAINT)
- FOUND: `.planning/phases/49-database-integrity-hygiene/49-06-SUMMARY.md`

**Modified files:**
- VERIFIED: `docs/db/fk-policy.md` — 4 Bucket B rows applied; migration history entry; Bucket B 100% applied (4/4)

**Commits exist:**
- FOUND: `8468bf5` (Task 1 — RED)
- FOUND: `84a911d` (Task 2 — GREEN)
- FOUND: `ef9419b` (Task 3 — fk-policy)

**Branch:** `feat/49-06-cascade-batch` — to be pushed to origin.

## Next phase readiness

- **49-07 (RESTRICT + final CASCADE)** is now cleared to start. Covers Bucket C: `businesses.owner_id` RESTRICT (the highest-stakes single FK in the phase) + `custom_kpis_library.business_id` CASCADE.
- After 49-07, all 56 orphan-prone FKs from the original audit are converted (50 SET NULL + 4 CASCADE + 2 RESTRICT/CASCADE = 56). Phase 49 closes.
