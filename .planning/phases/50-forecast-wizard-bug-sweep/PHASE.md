# Phase 50: Forecast Wizard Bug Sweep

**Milestone:** post-v1.1 — emergent phase
**Status:** Not started
**Source:** Operator-reported bugs (2026-05-04) during Phase 49 work — review of forecast wizard surfaced 4 distinct broken behaviors plus a backlog of UX + Xero-integration items (those deferred to Phase 51 + 52)

## Goal

Restore correct behavior across 4 broken paths in the forecast wizard (`wizard-v4`). After this phase ships, every number a coach sees in Step 3, Step 5, and Step 7 is calculated correctly and displays what the operator actually typed. The most credibility-destroying issue — Step 7 lease/finance treating the **full payment** as a P&L expense — is fixed to split the payment correctly between P&L (interest) and balance sheet (principal), matching basic accrual accounting.

## Why now

- These are bugs producing **wrong numbers in front of clients today.** Same severity class as the Phase 44.3 COGS-not-calculating bug — every coaching conversation built on these numbers risks "the model says X but reality is Y."
- The Step 7 lease/finance display in particular looks like CFO-grade output but contains a textbook accounting error (treating capital expenditure as full operating expense). For a CFO-positioned product this is reputational risk.
- Bugs are diagnosable from code reading + a live wizard session. Same investigation pattern that worked for Phase 44.3.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening)** — CI gates catch regressions on the fixes.
- **Phase 44.3 (Forecast Step 3 — Year-1 Target Wiring)** — already shipped; informs the bug 1 investigation (Step 3 already had a fix shipped against it; this is a different bug at the input layer).

## Blast Radius

**Low to medium — one wizard, isolated steps, behind CI gate.** Each bug fix touches 1-3 files. No API contract changes, no schema changes, no migration required. CI (lint + typecheck + vitest + build) catches regressions. Existing forecasts saved in DB are unaffected — only the live calculation / display paths change. Worst-case rollback per bug: revert the PR; bug returns to its current (broken) state.

The Step 7 lease/finance fix specifically may need new fields on `CapExItem` / `Investment` for amortization period + interest rate; if so, the change is additive (new optional fields default to current behavior so older saved forecasts continue working).

## Requirements (1:1 from operator review)

- **FCST-BUG-01** — Step 3: when the operator types a digit in a Revenue or COGS cell, the value displayed must equal the value typed. Currently a different number appears on screen — likely a parse/format roundtrip bug at the input layer.
- **FCST-BUG-02** — Step 5: the OpEx summary formula at the top of the step must be (a) correct and (b) reactively recompute when any per-line OpEx value changes below. Currently it's wrong AND stale.
- **FCST-BUG-03** — Step 7: when the operator selects "from plan" for a CapEx item, they must be able to enter a value. Currently the input is locked / non-functional.
- **FCST-BUG-04** — Step 7: when the operator selects "lease" or "finance" payment type for a CapEx item, the **full payment must NOT** be expensed to the P&L. The fix splits the payment per accrual accounting:
  - **Operating lease:** the entire periodic payment is a P&L expense (lease expense). Acceptable as today's behavior IF and only if the user explicitly chose operating-lease semantics.
  - **Finance lease (capital lease):** the asset is capitalized on the balance sheet and depreciated; only depreciation + interest portion of the payment hit the P&L per period.
  - **Finance / loan:** principal repayment is a balance-sheet movement; only interest hits the P&L.
  
  The bug is that the wizard treats all 3 (lease / finance lease / finance loan) as if they were operating expenses. Either fix the math OR explicitly limit the dropdown to "operating lease" semantics with a clear label.

## Success Criteria (observable)

1. **Step 3 input integrity** — type "5", "0", "0", "0" into a cell; cell displays "5000" (or "5,000" with formatting); regression test asserts `onChange(5000)` fires after a 4-keystroke sequence. (Validates FCST-BUG-01.)
2. **Step 5 OpEx total reactivity** — open Step 5; observe top-of-step OpEx total = sum of per-line OpEx; change one line's value; total updates within the same render cycle. Vitest snapshot or RTL test confirms reactivity. (Validates FCST-BUG-02.)
3. **Step 7 from-plan input** — select "from plan" for a CapEx item; enter a value; value persists in state and shows in summary downstream. Vitest case asserts the input is editable + commits to state. (Validates FCST-BUG-03.)
4. **Step 7 lease/finance accounting** — for a finance-lease item with $100k asset over 60 months at 6% APR, the P&L impact for Year 1 is **NOT** $100k * (12/60) = $20k. It's ($100k / depreciation_period * 12 months) + (interest portion of 12 payments). Vitest assertion locks the new math; UI shows the breakdown so coaches can verify. (Validates FCST-BUG-04.)
5. **CI green** — PR merging into main with all 4 required checks passing. Validates FCST-BUG-* by construction.

## Out of scope for this phase (deferred to Phase 51 + 52)

UX improvements:
- Step 3 — more flexibility to set revenue + COGS (design call)
- Step 4 — "how to end someone" departure flow
- Step 4 — better part-time / casual handling
- Step 5 — `$` vs `%` toggle per OpEx line
- Step 5 — simpler / clearer OpEx table layout
- Step 6 — visibility on which subscription accounts are selected
- Step 6 — undo / revert subscription selection
- Step 6 — add subscriptions not in auto-detected list

Xero integration:
- Step 4 — pull pay cycle from Xero
- Step 4 — pull standard hours per employee from Xero
- Step 4 — pull hourly rate from Xero

These are tracked for Phase 51 (UX) and Phase 52 (Xero employee data) — not in scope here. Bug fixes only.

## Plans

TBD — to be drafted at `/gsd-plan-phase 50`.
