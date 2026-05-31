---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 09
subsystem: monthly-report-multi-currency-ux
tags: [s6, multi-currency, toast, iict, redirect, ux]
requirements: [S6]
provides:
  - "shouldShowMultiCurrencyToast — pure decision helper, per-business localStorage gate"
  - "buildMultiCurrencyToastMessage — pure text builder, alphabetical/uppercased/deduped"
  - "Phase 67 redirect useEffect now fires sonner toast exactly once per session per business"
requires:
  - "Phase 67 multi-currency tab redirect (page.tsx:116-163)"
  - "sonner toast (already imported page.tsx:13)"
  - "/api/Xero/active-tenants returning per-tenant functional_currency + include_in_consolidation"
affects:
  - "IICT-HK and any future multi-currency tenant (HKD+AUD, NZD+AUD, etc.)"
  - "Single-tenant and all-AUD multi-tenant clients: unchanged (redirect never fires)"
tech_stack:
  added: []
  patterns:
    - "Pure helper + adapter Storage interface for testability without jsdom heavyweight imports"
    - "Side-effecting decision (returns true AND writes to storage in the same call) — keeps the call-site simple in the redirect useEffect"
key_files:
  created:
    - src/app/finances/monthly-report/utils/multi-currency-toast.ts
    - src/__tests__/app/multi-tenant-redirect-toast.test.tsx
  modified:
    - src/app/finances/monthly-report/page.tsx
decisions:
  - "Spec literal '(HKD + AUD)' was non-alphabetical, but the rule 'Always sorted alphabetically' is explicit — tests lock alphabetical (AUD + HKD). Documented in helper comment + test docstring."
  - "Side-effecting helper (writes to storage on the true-returning call) instead of a separate markMultiCurrencyToastShown. Single call-site, smaller surface, no race window between decision and persistence."
  - "localStorage NOT sessionStorage — the user should only see the explanation once per tenant per device, not once per browser tab. Matches Phase 67's own use of localStorage for the redirected tab."
  - "Capture activeCurrencies as a separate useState alongside isMultiCurrency — keeps the toast text accurate (shows the actual currencies present) without a separate fetch."
metrics:
  duration: "2m 5s"
  completed_date: "2026-05-31"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  commits: 2
  vitest_cases_added: 8
---

# Phase 71 Plan 09: S6 — Multi-tenant non-AUD redirect toast Summary

One-line: Phase 67's silent multi-currency tab-redirect now shows a one-time `toast.info("Switched to consolidated view — this client has multiple currencies (AUD + HKD)")` per session per business, gated by `localStorage['monthly-report:s6-toast-shown:<businessId>']`, with extracted pure helpers locked under 8 vitest cases.

## What Shipped

### 1. Pure helpers (`src/app/finances/monthly-report/utils/multi-currency-toast.ts`)

- `shouldShowMultiCurrencyToast(businessId, isMultiCurrency, storage)` — returns `true` exactly once per businessId per device. Side-effects on storage on the true-returning call so subsequent calls return `false`. Returns `false` immediately when `isMultiCurrency=false` or `businessId` is empty.
- `buildMultiCurrencyToastMessage(currencies)` — uppercases, deduplicates, sorts alphabetically, joins with `' + '`. Output: `Switched to consolidated view — this client has multiple currencies (AUD + HKD)`.
- `ToastStorage` interface (getItem + setItem only) so tests can pass a plain object instead of mocking the full DOM `Storage`.

### 2. Wire-in (`src/app/finances/monthly-report/page.tsx`)

- New `activeCurrencies: string[]` state, populated alongside `isMultiCurrency` from the same `/api/Xero/active-tenants` response. No new network call.
- The Phase 67 redirect `useEffect` now calls `shouldShowMultiCurrencyToast(...)` inside the existing `if (target)` block. On `true`, `toast.info(buildMultiCurrencyToastMessage(activeCurrencies))` fires.
- Dependency array extended with `businessId` and `activeCurrencies` — both are stable across renders (driven by URL + fetch) so no extra renders.

### 3. Regression test (`src/__tests__/app/multi-tenant-redirect-toast.test.tsx`)

- 8 cases (the plan listed 6; Test 6 covers 3 sub-cases — 2 currencies, 3 currencies, lowercase normalization).
- Tests the pure helpers (NOT the full page) — keeps the test fast, deterministic, and decoupled from heavy imports (Xero hooks, Recharts, pdf generators).
- Locks: first-load fires, second-load gates, non-multi-currency never fires, per-business independence, exact storage key format, exact toast text contract.

## Verification

- `npx vitest run src/__tests__/app/multi-tenant-redirect-toast.test.tsx --reporter=verbose` — **8/8 pass** in 342ms.
- `npx tsc --noEmit` — **clean** on `multi-currency-toast.ts` and `page.tsx`.
- `grep -c "Switched to consolidated view" src/app/finances/monthly-report/utils/multi-currency-toast.ts` → 2 (string literal + docstring reference; plan expected 1 but both occurrences are intentional).
- `grep -c "shouldShowMultiCurrencyToast" src/app/finances/monthly-report/page.tsx` → 2 (import + call site).

## Commits

- `51846502` — `test(71-09): add failing tests for S6 multi-currency redirect toast` (RED, 1 file, 119 insertions)
- `5f53df22` — `feat(71-09): wire S6 one-time multi-currency redirect toast` (GREEN, 2 files, 104 insertions, 7 deletions)

Both committed with `--no-verify` per the parallel-execution directive (71-01, 71-02, 71-07, 71-08 are in-flight on the same branch).

## Deviations from Plan

### Annotations (not behavior changes)

**1. [Spec ambiguity — locked to the explicit rule] Toast text ordering**

- **Found during:** Task 1
- **Issue:** The plan's example string read `"(HKD + AUD)"` (non-alphabetical), but the rule on the same line said `"Always sorted alphabetically"`. The two contradict.
- **Resolution:** Locked the alphabetical rule (output is `(AUD + HKD)` for the IICT-HK case). The plan's literal example string was treated as imprecise spec prose, not a binding contract.
- **Documented in:** test docstring + helper module docstring + commit message.

**2. [Done-criteria interpretation] grep count expectations**

- **Plan said:** `grep -c "shouldShowMultiCurrencyToast" page.tsx` returns `1 (import + 1 use)`.
- **Reality:** The import statement and the call site are TWO grep matches (line count, not "uses"). Final value is `2`. The spirit of the check — "symbol is referenced exactly where expected" — is satisfied.

### Auto-fixes

None — plan executed exactly as written for both tasks.

## Known Stubs

None. The toast text, storage key, and gating logic are all wired to real data sources (live `/api/Xero/active-tenants` response, real `window.localStorage`). No placeholders.

## Operational Notes

- **No data writes.** Code-only fix. Existing localStorage entries for unrelated keys are untouched.
- **First-fire test plan for IICT-HK** (post-merge smoke): `localStorage.removeItem('monthly-report:s6-toast-shown:<iict-business-id>')` in DevTools → reload `/finances/monthly-report?business_id=<iict>&tab=report` → toast appears top-right with text `"Switched to consolidated view — this client has multiple currencies (AUD + HKD)"` → reload page → toast does NOT re-appear. Switch to a different multi-currency client (none today, but if added) → toast re-fires for that new business.
- **Rollback** is trivial — revert the two commits; no DB state.

## Self-Check: PASSED

- File: `src/app/finances/monthly-report/utils/multi-currency-toast.ts` — FOUND
- File: `src/__tests__/app/multi-tenant-redirect-toast.test.tsx` — FOUND
- Commit: `51846502` — FOUND
- Commit: `5f53df22` — FOUND
- Test run: 8/8 pass
- Typecheck: clean on touched files
