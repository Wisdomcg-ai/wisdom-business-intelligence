# Phase 51 — Deferred Items

Out-of-scope discoveries during plan execution. Track here, do NOT fix in the
discovering plan (per gsd executor scope-boundary rule).

## From 51-04a (Step 4 termination + PT/casual)

- **`renderSalaryInput` is dead code** in `Step4Team.tsx` (defined ~L1752, no
  callers). Pre-existing — not introduced by 51-04a. Leaving in place; the
  active salary cell renders inputs inline at L2053. Safe to delete in a
  future cleanup pass.
