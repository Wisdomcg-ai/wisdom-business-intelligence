---
phase: 49-database-integrity-hygiene
plan: 02
subsystem: database
tags: [foreign-keys, on-delete, policy, cascade, set-null, restrict, audit-correction, fk-policy]

# Dependency graph
requires:
  - phase: 49-database-integrity-hygiene
    provides: RESEARCH.md DB-03 enumeration of all 56 orphan-prone FKs (verbatim source for the policy doc)
  - phase: 44-test-gate-and-ci-hardening
    provides: preview-branch / migration-test infrastructure pattern referenced for DB-04 verification
provides:
  - "docs/db/fk-policy.md (PROPOSED draft) — single source of truth for ON DELETE policy across all 56 orphan-prone FKs"
  - "Bucketed recommendations (49 SET NULL / 5 CASCADE / 2 RESTRICT-or-manual + optional 3rd) ready for operator sign-off"
  - "Per-FK Status field (proposed → approved → applied:<migration>) so 49-04..07 can mark migrations as applied without out-of-sync drift"
  - "Five project-wide FK convention principles future schema authors must follow"
affects: [49-04, 49-05, 49-06, 49-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FK ON DELETE policy doc with per-FK Status lifecycle (proposed → approved → applied:<migration-filename>)"
    - "Operator-blocking checkpoint pattern for product decisions (businesses.owner_id)"

key-files:
  created:
    - docs/db/fk-policy.md
  modified: []

key-decisions:
  - "Author docs/db/fk-policy.md as PROPOSED draft (Status flips to ACTIVE only after operator sign-off in Task 2 checkpoint)"
  - "Bucket A counted as 49 (not the ~48 in the plan's interfaces block) after applying RESEARCH.md's full re-bucketing pass — within the ±1-2 tolerance the planner allowed"
  - "Bucket C scoped to 2 explicit FKs (businesses.owner_id, custom_kpis_library.business_id) plus an optional 3rd placeholder slot for Matt to add during sign-off"
  - "Each FK row carries a Status column so plans 49-04..07 can flip rows from proposed → approved → applied:<migration-filename> without re-deriving the doc"

patterns-established:
  - "Authoritative DB policy doc: every downstream migration MUST cite the fk-policy.md row it implements via SQL header COMMENT"
  - "Two-checkpoint pattern for high-stakes product decisions: 49-02 captures the businesses.owner_id call, 49-07 re-confirms before the migration ships"

requirements-completed: []  # DB-03 not yet complete — pending operator sign-off (Task 2)

# Metrics
duration: in-progress
completed: pending
---

# Phase 49 Plan 02: FK Policy Doc (DB-03) Summary

**STATUS: AWAITING OPERATOR ACTION — Matt to review `docs/db/fk-policy.md` and sign off on each FK + make the `businesses.owner_id` product call (CASCADE / SET NULL / RESTRICT) before plans 49-04..07 can start.**

## Performance

- **Duration:** in-progress (handed off mid-flight at Task 2 operator checkpoint)
- **Started:** 2026-05-03T23:25:42Z
- **Completed:** pending (Tasks 2 + 3 await operator sign-off)
- **Tasks completed (so far):** 1 of 3
- **Files modified:** 1 (created `docs/db/fk-policy.md`)

## Accomplishments (Task 1)

- Authored `docs/db/fk-policy.md` as a PROPOSED draft — the single source of truth for ON DELETE behavior across all 56 orphan-prone FKs identified by RESEARCH.md DB-03.
- Doc opens with the **audit-correction reframing**: the 56 FKs are NOT predominantly on `businesses.id` (the audit summary was wrong); 77% reference `auth.users.id` for audit attribution. Every existing `business_id` FK already has `ON DELETE CASCADE`.
- Bucketed all 56 FKs:
  - **Bucket A — SET NULL: 49 FKs** (audit / attribution; user deletion preserves the record).
  - **Bucket B — CASCADE: 5 FKs** (process_flows × 3, process_phases.process_id, session_attendees.user_id; tightly-coupled children).
  - **Bucket C — RESTRICT or manual: 2 FKs** (`businesses.owner_id`, `custom_kpis_library.business_id`) **+ 1 optional placeholder slot** for Matt to add during sign-off.
- Each FK row carries: `Source table.column`, `Referenced`, `Baseline line`, `Recommended ON DELETE`, `Justification`, `Sign-off` checkbox, `Status` (`proposed` → `approved` → `applied:<migration>`).
- Established the 5 project-wide FK convention principles (verbatim from RESEARCH.md DB-03 lines 339-356) future schema authors must follow.
- Spot-checked 10 of the cited baseline line numbers against `supabase/migrations/00000000000000_baseline_schema.sql` — all matched exactly.
- **Did NOT make assumptions about operator decisions** — every Bucket C FK has empty `Operator decision`/`Reasoning`/`Sign-off date` lines; the doc Status is PROPOSED, not ACTIVE.

## Task Commits

1. **Task 1: Draft `docs/db/fk-policy.md`** — `ec81426` (docs)

**Plan metadata commit:** pending (deferred until Tasks 2+3 land after operator sign-off)

## Files Created/Modified

- `docs/db/fk-policy.md` (NEW, 214 lines) — PROPOSED draft FK ON DELETE policy doc covering all 56 orphan-prone FKs.

## Awaiting Operator Action (Task 2 — checkpoint:human-verify, BLOCKING)

Matt must complete the following before the executor can resume:

### Required decisions

1. **Bucket A (49 FKs — SET NULL):** confirm each row's recommendation, or annotate exceptions. Most should be obvious yeses (audit attribution preserved when a coach leaves the platform). The 9 re-bucketed FKs at the end of Bucket A (rows 41-49: the 4 `annual_snapshots` quarter pointers, 2 self-FKs, `coach_benchmarks.source_interaction_id`, `monthly_report_settings.budget_forecast_id`, `session_actions.strategic_initiative_id`) are worth a second look — they were originally in Bucket B in the audit framing.
2. **Bucket B (5 FKs — CASCADE):** confirm each row. The four `process_*` FKs are obvious yeses. **`session_attendees.user_id` is MEDIUM confidence** — researcher noted it's defensible either way (CASCADE if "an attendance record without a user is meaningless" wins; SET NULL if "preserve attendance counts even when the attendee is deleted" wins). This is the one Bucket B row to scrutinise.
3. **Bucket C-1: `businesses.owner_id`** — the load-bearing product decision. Three options spelled out in the doc:
   - **CASCADE** — destroys business + 26 downstream tables when owner deleted (existing `business_id` CASCADE chain). Destructive.
   - **SET NULL** — orphan business with no clear UI/RLS semantics.
   - **RESTRICT** — block user deletion until ownership transferred / business archived. **Researcher recommendation.**
4. **Bucket C-2: `custom_kpis_library.business_id`** — confirm CASCADE matches intent given this FK references `business_profiles` (NOT `businesses`) — the dual-id ambiguity from MEMORY.md `project_dual_id`.
5. **Bucket C-3 (optional):** if any Bucket A or B row should move to C, fill in the placeholder; otherwise the slot is removed before Status flips to ACTIVE.

### Resume signal

Per the plan's Task 2 `<resume-signal>`: type "policy approved" and include the `businesses.owner_id` decision (e.g., "policy approved; owner_id = RESTRICT"). List any inter-bucket moves. If anything is rejected, describe what to change in `fk-policy.md`.

## Decisions Made (so far)

- **Total Bucket A count is 49, not the ~48 in the plan's interfaces block.** RESEARCH.md DB-03 had a soft `~` tolerance because the re-bucketing pass moves several FKs from B → A. Counting from the verbatim enumeration (40 from original A − 1 for `session_attendees.user_id` moving to B + 9 re-bucketed from B back into A = 49). The plan-check anticipated this with the "± 1-2" tolerance.
- **Bucket C is sized to 2 explicit FKs + 1 optional placeholder.** This matches the plan-check Note 6 ("if Matt during 49-02 only surfaces 2 Bucket C items (not 3), 49-07 Task 2 should have 2 it() blocks not 3").
- **No operator decisions pre-filled.** Every `Operator decision`/`Reasoning`/`Sign-off date` line is empty; sign-off checkboxes are all `[ ]`; Status is `PROPOSED`.
- **Did NOT touch any of the 56 untracked files in the repo** (the `.claude/`, `scripts/diag-*`, fixture `* 2.json`, etc.) — out-of-scope per the orchestrator instructions.

## Deviations from Plan

None so far — Task 1 executed exactly as written. The Bucket A count is 49 vs the plan's "~48", but this is within the explicit `±1-2` tolerance the plan and plan-check both allow.

## Issues Encountered

None.

## User Setup Required

**This plan IS the user-setup step for DB-03.** Matt's sign-off on `docs/db/fk-policy.md` is the gate. No external services or env vars to configure.

## Next Phase Readiness

- **Plans 49-04, 49-05, 49-06, 49-07 are BLOCKED until this doc moves to Status ACTIVE.** Each has `depends_on: [44-05, 49-02]` (or 49-04 for 49-05/06/07's helpers chain).
- After operator sign-off, Task 3 will: apply Matt's decisions to the doc, flip Status to ACTIVE, tick all sign-off checkboxes, and commit. A fresh executor invocation (or resumption of this thread with the resume-signal) will handle Task 3.

---
*Phase: 49-database-integrity-hygiene*
*Status: HANDED OFF — Task 2 operator checkpoint pending*
*Last update: 2026-05-03*
