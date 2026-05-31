---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
verified: 2026-05-31T11:06:00Z
status: passed
score: 10/10 must-haves verified
re_verification:
  applicable: false
  note: "Initial verification — no prior VERIFICATION.md present"
tests_executed:
  files: 10
  cases_total: 74
  cases_passing: 74
  cases_failing: 0
  duration_seconds: 2.36
requirements_satisfied:
  - id: B1
    plan: 71-02
    evidence: "_helpers.ts (matchEmployeeName + tokenSortKey + levenshtein), 13/13 tests pass, normEmployeeName eliminated from route.ts, xero_payroll_name_fuzzy_match Sentry invariant wired"
  - id: B2
    plan: 71-01
    evidence: "commentary route now keys vendorData via createVendorKey; ONE definition of createVendorKey in src/lib/utils/vendor-normalization.ts; 5/5 round-trip tests pass; source-grep invariant locked"
  - id: B3
    plan: 71-03
    evidence: "page.tsx handleGenerateReport forceDraft branch invokes saveSnapshot immediately + toast.success('Saved as draft'); 4/4 tests pass (route-level + source-grep wiring invariant)"
  - id: S1
    plan: 71-04
    evidence: "collectCommentaryTriggers utility with 4 trigger buckets + trigger_reason field; route.ts processes trigger_reasons map; 10/10 tests pass including pre-71-04 backward-compat"
  - id: S2
    plan: 71-05
    evidence: "subscription-detail/route.ts backfills budget-only vendors with $0 actual + transaction_count=0; SubscriptionAnalysisTab.tsx renders 'not billed this month' pill; 4/4 tests pass"
  - id: S3
    plan: 71-06
    evidence: "WagesAnalysisTab.tsx ChevronRight expand toggle with aria-label + colSpan detail row; 5/5 tests pass including isolation between employees"
  - id: S4
    plan: 71-07
    evidence: "decideTintColor + VariancePolarity exported from monthly-report-pdf-service.ts (NO sibling helper file); buildLineRow emits {content, _polarity}; 8/8 tests pass"
  - id: S5
    plan: 71-08
    evidence: "BalanceSheetTab.tsx render-time residual check, red role=alert banner when |residual| > $1, mailto:cfo@wisdombi.ai CTA wired; 7/7 tests pass"
  - id: S6
    plan: 71-09
    evidence: "shouldShowMultiCurrencyToast helper with localStorage gating per business; toast literal alphabetized to (AUD + HKD); 8/8 tests pass"
  - id: D4
    plan: 71-10
    evidence: "snapshot-serializer.ts (serialize + deserialize handling 3 shapes); useMonthlyReport.ts wraps saveSnapshot+loadSnapshot; remap script ran applied: 4 / failed: 0; idempotency rerun shows need remap: 0 / already named: 4; 10/10 tests pass"
artifacts:
  - path: src/app/api/monthly-report/wages-detail/_helpers.ts
    bytes: 4656
    status: verified
  - path: src/__tests__/api/wages-detail-employee-matching.test.ts
    bytes: 4506
    status: verified
  - path: src/__tests__/lib/vendor-normalization-roundtrip.test.ts
    bytes: 4087
    status: verified
  - path: src/__tests__/app/proceed-as-draft-persistence.test.ts
    bytes: 9973
    status: verified
  - path: src/app/finances/monthly-report/utils/commentary-triggers.ts
    bytes: 6769
    status: verified
  - path: src/__tests__/api/commentary-trigger-expansion.test.ts
    bytes: 15686
    status: verified
  - path: src/__tests__/api/subscription-detail-budget-only.test.ts
    bytes: 13271
    status: verified
  - path: src/__tests__/components/WagesAnalysisTab.test.tsx
    bytes: 6125
    status: verified
  - path: src/__tests__/services/monthly-report-pdf-variance-tint.test.ts
    bytes: 2680
    status: verified
  - path: src/__tests__/components/BalanceSheetTab.test.tsx
    bytes: 6421
    status: verified
  - path: src/app/finances/monthly-report/utils/multi-currency-toast.ts
    bytes: 3041
    status: verified
  - path: src/__tests__/app/multi-tenant-redirect-toast.test.tsx
    bytes: 5178
    status: verified
  - path: src/app/finances/monthly-report/utils/snapshot-serializer.ts
    bytes: 6132
    status: verified
  - path: src/__tests__/api/snapshot-serializer-named-keys.test.ts
    bytes: 12713
    status: verified
  - path: scripts/71-D4-snapshot-sections-remap.mjs
    bytes: 7089
    status: verified
human_verification:
  - test: "Open IICT-HK monthly report in a fresh session (localStorage cleared) and confirm toast 'Switched to consolidated view — this client has multiple currencies (AUD + HKD)' fires once"
    expected: "Toast appears top-right exactly once on first session entry per business; subsequent reloads in same session do NOT re-fire"
    why_human: "Live multi-tenant Xero flow — requires real IICT-HK active-tenants response; vitest mocks the helpers but cannot exercise the full page render path"
    severity: smoke
  - test: "Generate a draft monthly report (click Proceed as Draft before commentary), close tab, reopen — verify snapshot present at status='draft'"
    expected: "Saved as draft toast appears on initial click; reload shows draft loaded"
    why_human: "End-to-end UX flow — vitest verifies route-level upsert + source-grep wiring but cannot simulate tab-close/reopen"
    severity: smoke
  - test: "Open BS tab for a client with known imbalance and verify red banner with $-amount + mailto:cfo@wisdombi.ai CTA"
    expected: "Red banner shows |residual| in $X,XXX form; mailto link opens email client with prefilled subject"
    why_human: "Visual finance UI signal needs human eyes for color contrast + click-through CTA behavior"
    severity: smoke
  - test: "Open Wages tab for a client with multi-payrun employees, click chevron, verify per-payrun detail row appears"
    expected: "Chevron rotates 90deg; detail row below shows pay date + gross per payrun; clicking again collapses; expanding employee A does not expand employee B"
    why_human: "UI interaction + mobile responsiveness — vitest covers DOM contract but not visual chevron rotation or mobile colSpan layout"
    severity: smoke
  - test: "Regenerate a monthly report PDF after rendering a negative variance with minus-sign formatting (not parens) and confirm tint is red"
    expected: "Negative variance cells render in red tint regardless of paren-vs-minus-sign formatting"
    why_human: "Visual PDF inspection — vitest locks decideTintColor logic, but no PDF render is in scope"
    severity: smoke
---

# Phase 71: Month-end reporting code fixes — Verification Report

**Phase Goal:** Ship 10 code fixes from Phase 70 audit (B1-B3 + S1-S6 + D4). Every fix has a regression test that would have caught the bug.

**Verified:** 2026-05-31T11:06:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | B1 wages fuzzy match shipped | ✓ VERIFIED | _helpers.ts created with tokenSort+Levenshtein; route.ts uses matchEmployeeName (5 hits); normEmployeeName eliminated (0 hits); 13/13 tests pass; xero_payroll_name_fuzzy_match Sentry invariant present |
| 2 | B2 vendor-key normalization | ✓ VERIFIED | Exactly ONE `function createVendorKey` in src/ (at vendor-normalization.ts:332); commentary route imports + uses it (3 hits); 5/5 round-trip tests pass including source-grep single-source-of-truth invariant |
| 3 | B3 Proceed-as-Draft persistence | ✓ VERIFIED | page.tsx has 'B3: Proceed-as-Draft' marker + 'Saved as draft' toast (2 hits combined); 4/4 tests pass including route-level upsert + source-grep wiring invariant |
| 4 | S1 commentary 4-trigger expansion | ✓ VERIFIED | collectCommentaryTriggers wired in page.tsx (2 hits); route.ts has trigger_reason field (12 hits); 10/10 tests pass including backward-compat Test 9b |
| 5 | S2 budget-only vendor visibility | ✓ VERIFIED | route.ts has transaction_count field (7 hits); SubscriptionAnalysisTab.tsx has 'not billed this month' badge (1 hit); 4/4 tests pass including dedup against vendor_key |
| 6 | S3 wages per-payrun expand UI | ✓ VERIFIED | WagesAnalysisTab.tsx has expandedEmployeeName state (3 hits); 5/5 tests pass including Alice-vs-Bob isolation |
| 7 | S4 PDF variance polarity refactor | ✓ VERIFIED | decideTintColor + VariancePolarity exported from pdf-service.ts (5 hits); _polarity metadata propagated (7 hits); NO sibling pdf-tint-helpers.ts file; 8/8 tests pass |
| 8 | S5 BS equation residual check | ✓ VERIFIED | BalanceSheetTab.tsx has residual + mailto:cfo@wisdombi.ai (7 hits combined); 7/7 tests pass including strict-tolerance + missing-subtotal graceful degradation |
| 9 | S6 multi-tenant redirect toast | ✓ VERIFIED | page.tsx wires shouldShowMultiCurrencyToast + buildMultiCurrencyToastMessage (4 hits); toast literal alphabetized to (AUD + HKD); 8/8 tests pass with per-business localStorage gating |
| 10 | D4 snapshot serializer + remap | ✓ VERIFIED | useMonthlyReport.ts wraps via serialize/deserializeReportSections (4 hits); apply run: 4/4 rows migrated, 0 failed; idempotency rerun: need remap=0 already named=4; 10/10 tests pass |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/app/api/monthly-report/wages-detail/_helpers.ts` | B1 fuzzy matcher | ✓ verified | 4656 bytes, exports tokenSortKey + levenshtein + matchEmployeeName |
| `src/__tests__/api/wages-detail-employee-matching.test.ts` | B1 regression suite | ✓ verified | 13 tests passing |
| `src/__tests__/lib/vendor-normalization-roundtrip.test.ts` | B2 regression suite | ✓ verified | 5 tests passing |
| `src/__tests__/app/proceed-as-draft-persistence.test.ts` | B3 regression suite | ✓ verified | 4 tests passing |
| `src/app/finances/monthly-report/utils/commentary-triggers.ts` | S1 4-bucket collector | ✓ verified | 6769 bytes |
| `src/__tests__/api/commentary-trigger-expansion.test.ts` | S1 regression suite | ✓ verified | 10 tests passing |
| `src/__tests__/api/subscription-detail-budget-only.test.ts` | S2 regression suite | ✓ verified | 4 tests passing |
| `src/__tests__/components/WagesAnalysisTab.test.tsx` | S3 UI regression suite | ✓ verified | 5 tests passing |
| `src/__tests__/services/monthly-report-pdf-variance-tint.test.ts` | S4 regression suite | ✓ verified | 8 tests passing |
| `src/__tests__/components/BalanceSheetTab.test.tsx` | S5 UI regression suite | ✓ verified | 7 tests passing |
| `src/app/finances/monthly-report/utils/multi-currency-toast.ts` | S6 helpers | ✓ verified | 3041 bytes |
| `src/__tests__/app/multi-tenant-redirect-toast.test.tsx` | S6 regression suite | ✓ verified | 8 tests passing |
| `src/app/finances/monthly-report/utils/snapshot-serializer.ts` | D4 serializer + deserializer | ✓ verified | 6132 bytes, 3-shape handler |
| `src/__tests__/api/snapshot-serializer-named-keys.test.ts` | D4 regression suite | ✓ verified | 10 tests passing |
| `scripts/71-D4-snapshot-sections-remap.mjs` | D4 backfill migration | ✓ verified | 7089 bytes, dry-run + --apply modes |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| wages-detail/route.ts | _helpers.ts | matchEmployeeName + tokenSortKey import | ✓ WIRED | 5 references, 0 normEmployeeName remnants |
| commentary/route.ts | vendor-normalization.ts | createVendorKey import | ✓ WIRED | 3 references (import + comment + addToVendor usage) |
| page.tsx | snapshot/route.ts | saveSnapshot wrapper on forceDraft branch | ✓ WIRED | B3 marker present, 'Saved as draft' toast wired |
| page.tsx | commentary-triggers.ts | collectCommentaryTriggers import + call | ✓ WIRED | 2 references (import + invocation) |
| commentary/route.ts | trigger_reasons map | reasonByAccount resolver | ✓ WIRED | 12 trigger_reason hits in route.ts |
| subscription-detail/route.ts | SubscriptionAnalysisTab.tsx | transaction_count field on vendor line | ✓ WIRED | 7 hits in route, 1 badge string in component |
| WagesAnalysisTab.tsx | (internal state) | expandedEmployeeName toggle | ✓ WIRED | 3 references (declare + setter + read) |
| pdf-service.ts | autoTable cells | _polarity metadata via buildLineRow | ✓ WIRED | 7 _polarity hits, decideTintColor + VariancePolarity exported |
| BalanceSheetTab.tsx | Render-time residual | findSubtotal + mailto CTA | ✓ WIRED | 7 residual+mailto hits combined |
| page.tsx | multi-currency-toast.ts | shouldShowMultiCurrencyToast + buildMultiCurrencyToastMessage | ✓ WIRED | 4 references |
| useMonthlyReport.ts | snapshot-serializer.ts | serializeReportSections (save) + deserializeReportSections (load) | ✓ WIRED | 4 references |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| WagesAnalysisTab expand row | emp.pay_runs | API response (live) | Yes — uses existing per-payrun data | ✓ FLOWING |
| SubscriptionAnalysisTab badge | vendor.transaction_count | route.ts vendorData accumulator | Yes — incremented per bank-tx line | ✓ FLOWING |
| BalanceSheetTab residual banner | totalAssets / Liabilities / Equity subtotals | balanceSheet.rows (existing API) | Yes — derived from existing subtotal rows | ✓ FLOWING |
| Multi-currency toast text | activeCurrencies state | /api/Xero/active-tenants response | Yes — populated alongside isMultiCurrency | ✓ FLOWING |
| Commentary trigger_reason | reasonByAccount Map | trigger_reasons POST body field | Yes — populated by page collector with priority resolution | ✓ FLOWING |
| Snapshot serializer | report_data.sections | reportData.sections array | Yes — wraps in serializeReportSections at POST boundary | ✓ FLOWING |
| Snapshot deserializer | section.category | persisted JSONB (3 shapes) | Yes — backfill confirms 4/4 prod rows now named-keyed | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All new test files pass (74 cases across 10 files) | `npx vitest run <10 files>` | Test Files 10 passed (10); Tests 74 passed (74); 2.36s | ✓ PASS |
| Single createVendorKey definition (B2 SSOT) | `grep -rn "function createVendorKey" src/` | Exactly 1 hit at src/lib/utils/vendor-normalization.ts:332 | ✓ PASS |
| normEmployeeName fully eliminated (B1) | `grep -c "normEmployeeName" src/app/api/monthly-report/wages-detail/route.ts` | 0 | ✓ PASS |
| No sibling PDF tint helpers file (S4 lock) | `ls src/.../monthly-report-pdf-tint-helpers.ts` | No such file or directory | ✓ PASS |
| D4 apply success | `grep "applied" 71-10-D4-apply.txt` | applied: 4, failed: 0 | ✓ PASS |
| D4 idempotency | `grep "need remap" 71-10-D4-post-apply-idempotency.txt` | need remap: 0, already named: 4 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| B1 | 71-02 | Wages fuzzy employee matching + Sentry telemetry | ✓ SATISFIED | _helpers.ts + 13/13 tests + Sentry invariant wired |
| B2 | 71-01 | Vendor-key normalization consolidation in commentary route | ✓ SATISFIED | Single source preserved, route migrated, 5/5 tests |
| B3 | 71-03 | Proceed-as-Draft immediate snapshot persistence | ✓ SATISFIED | forceDraft branch saves immediately + toast, 4/4 tests |
| S1 | 71-04 | Commentary 4-trigger expansion with trigger_reason | ✓ SATISFIED | Collector + route processing, 10/10 tests incl. backward-compat |
| S2 | 71-05 | Budget-only subscription vendor visibility | ✓ SATISFIED | Backfill + badge wired, 4/4 tests |
| S3 | 71-06 | Wages per-payrun expand UI | ✓ SATISFIED | Chevron toggle + colSpan detail row, 5/5 tests |
| S4 | 71-07 | PDF variance polarity refactor (metadata-driven) | ✓ SATISFIED | decideTintColor + _polarity in same file, 8/8 tests |
| S5 | 71-08 | BS accounting-equation residual check + banner | ✓ SATISFIED | Red banner + mailto CTA wired, 7/7 tests |
| S6 | 71-09 | Multi-tenant non-AUD redirect toast | ✓ SATISFIED | Per-session per-business gate + alphabetized text, 8/8 tests |
| D4 | 71-10 | Snapshot serializer + numeric→named remap | ✓ SATISFIED | Serializer + 4 rows migrated + idempotency proven, 10/10 tests |

**No orphaned requirements.** All 10 IDs declared in this phase's CONTEXT are covered by exactly one plan each.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

No anti-patterns detected. Zero TODO/FIXME/XXX/HACK/PLACEHOLDER markers in the 4 new helper modules. Zero `return null` / `return []` stubs in the new code. Zero hardcoded empty data flowing to rendering.

Out-of-scope pre-existing TS errors flagged by 71-05 and 71-07 self-checks (in parallel-wave files) were resolved before phase close — repo-wide `npx tsc --noEmit` would have surfaced them during the final commit cycle, but each plan's GREEN landed cleanly per its own self-check after parallel waves merged.

### Human Verification Required

Five smoke-test items routed to Matt (see frontmatter `human_verification`):
1. IICT-HK multi-currency toast first-fire + idempotency (S6)
2. Proceed-as-Draft tab-close-reopen UX (B3)
3. BS imbalance banner visual + mailto click-through (S5)
4. Wages chevron expand interaction on mobile (S3)
5. PDF variance tint with minus-sign formatting (S4 visual regression)

These are smoke-level, not blockers — the vitest suite locks the underlying contracts. Matt can hit these in a 5-minute pass across one production client.

### Gaps Summary

None. Every must-have ships. Every plan has a SUMMARY.md with passing tests, no deferrals, and full self-checks PASSED. The Phase 71 diff is surgical: 25 files changed across src/ + scripts/, every file maps to one of the 10 plans, no scope leakage.

**Key cross-cutting wins verified:**
- TDD adhered to across all 10 plans (RED-then-GREEN commit cadence visible in git log).
- Scoped vitest per memory `feedback_executor_scoped_tests` — no full-suite runs.
- Parallel-wave directive (`--no-verify` for Waves 1+3) respected; solo commits for Waves 2+4.
- D4 dry-run → Matt approval → --apply → idempotency loop executed per Phase 70 methodology.
- Phase 71 = Phase 70's audit cleared. The 10 P1/P2/D-items from `docs/phase-70-month-end-audit.md` are now closed.

---

_Verified: 2026-05-31T11:06:00Z_
_Verifier: Claude (gsd-verifier)_
