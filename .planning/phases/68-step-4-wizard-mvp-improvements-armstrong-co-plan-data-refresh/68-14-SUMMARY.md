---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 14
status: complete
completed: 2026-05-29
---

# Plan 68-14 — B7: per-quarter notes — SUMMARY

## What was built

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx) — added a `"Why this quarter?"` textarea at the bottom of every quarter card (Q1-Q4 and `current_remainder` when visible). Persists to `quarterlyTargets['period_notes']` JSONB using the additive magic-metric-key pattern from the PLAN.

### Architecture (additive JSONB, zero type churn)

PLAN's Option C used here: a `period_notes` metric-key in the existing `quarterlyTargets` shape. Inner record matches the existing `{q1, q2, q3, q4, current_remainder?}` shape — no Step4Props type change needed. Tolerant read: `?? ''` defaults missing notes to empty string for backward compatibility with saved plans pre-Phase-68.

### Helpers

- `getQuarterNote(quarterId)` — reads from `quarterlyTargets['period_notes']?.[quarterId] ?? ''`
- `setQuarterNote(quarterId, value)` — writes into the same JSONB structure with the explicit cast preserved
- `draftQuarterNotes` state — local in-progress edits, keyed by quarterId
- `getQuarterNoteDraft(quarterId)` — returns the draft if focused, falls back to persisted value otherwise

### Commit-on-blur

Textarea fires `setQuarterlyTargets` only on blur, not on every keystroke. Prevents re-renders of the whole wizard while typing. Draft entry is removed on blur so future reads come from `quarterlyTargets` again.

## Backward compatibility

- Saved plans without `period_notes` metric-key: `getQuarterNote()` returns `''` → textarea shows empty placeholder. No crash.
- Persistence side (`strategic-planning-service.ts`): iterates all keys in `quarterlyTargets`, so `period_notes` rides through transparently.

## Acceptance criteria

### Static (all pass)
- ✓ File contains `period_notes` magic metric-key references
- ✓ File contains `getQuarterNote`, `setQuarterNote`, `getQuarterNoteDraft` helpers
- ✓ File contains `draftQuarterNotes` state
- ✓ File contains the textarea with `id={\`quarter-notes-${quarter.id}\`}` and `Why this quarter?` label
- ✓ commits on `onBlur`, not `onChange`
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint src/app/goals/components/Step4AnnualPlan.tsx` exits 0 (2 pre-existing warnings)
- ✓ `Step4Props.quarterlyTargets` type signature unchanged

## Deviations from PLAN

Used standard `delete next[quarter.id]` instead of the PLAN's destructuring approach (`const { [quarter.id]: _, ...rest } = prev`) to avoid an unused-variable lint warning. Same behaviour.

## Files

| Path | Change |
|---|---|
| `src/app/goals/components/Step4AnnualPlan.tsx` | +50 lines (helpers + draft state + textarea render block) |

## Next plan

**Plan 68-15** — B8: "Save plan version" button + `POST /api/plan-snapshots` server-side composition.

## Self-Check

PASSED. Notes ship as an additive JSONB metric-key; no type changes; tolerant on read; commit-on-blur for performance. tsc + lint clean.
