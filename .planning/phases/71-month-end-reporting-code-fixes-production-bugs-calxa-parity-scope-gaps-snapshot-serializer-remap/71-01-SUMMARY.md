---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 01
subsystem: monthly-report / vendor-normalization
tags: [B2, vendor-normalization, commentary, subscription-detail, regression-test]
requirements: [B2]
provides:
  - canonical-vendor-keying-in-commentary-route
requires:
  - phase-70-04-canonical-vendor-normalization-util
affects:
  - src/app/api/monthly-report/commentary/route.ts
  - src/__tests__/lib/vendor-normalization-roundtrip.test.ts
tech_stack:
  added: []
  patterns:
    - "map-key normalization via canonical helper (single source of truth)"
    - "fs-readFileSync regression guard against inline duplicates"
key_files:
  created:
    - src/__tests__/lib/vendor-normalization-roundtrip.test.ts
  modified:
    - src/app/api/monthly-report/commentary/route.ts
decisions:
  - "Map value now carries display_name explicitly (not derived from key) so response payload preserves human-readable vendor names"
  - "Test 5 (route-source inspection) chosen over a mock-based integration test — keeps tests pure, no network/supabase, and locks B2 invariant at the file-source level"
metrics:
  duration_minutes: 2
  duration_human: "~2 min"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  tests_added: 5
  tests_passing: 5
  completed_at: "2026-05-31T09:46:59Z"
---

# Phase 71 Plan 01: B2 — Vendor-key normalization fix in commentary route — Summary

**One-liner:** Commentary route now keys its `vendorData` map by `createVendorKey(vendor)` (instead of the raw display name) so budgeted vendors in `subscription_budgets` actually key-match against extracted Xero vendors — closes the long-standing B2 mismatch and locks the invariant with a 5-test regression file.

## What changed

**`src/app/api/monthly-report/commentary/route.ts`** — three surgical edits inside the existing handler:
1. Import line (route.ts:6) now pulls `createVendorKey` alongside `extractVendorInfo`.
2. `addToVendor(vendor, txn)` (route.ts:280-293) now keys the map by `createVendorKey(vendor)` and stores `display_name` on first insert so the human-readable vendor name survives into the response.
3. Output loop (route.ts:327-336) iterates `vendorData.values()` and reads `data.display_name` instead of the prior `[vendor, data]` map-entry destructure.

Subscription-detail route was already canonical (`createVendorKey` for keying at route.ts:184) — no change needed there. The B2 mismatch lived entirely in commentary.

**`src/__tests__/lib/vendor-normalization-roundtrip.test.ts`** (new) — 5 tests under `describe('B2 — vendor-normalization single source of truth')`:
1. Round-trip / idempotence: `createVendorKey(extractVendorName('', vendor))` is stable under re-application across `['Stripe Au', 'STRIPE AU PTY LTD', '  stripe  ', 'Paypal Australia 1043714034893']`.
2. Whitespace/punctuation/case collapse: `createVendorKey('Stripe Au') === createVendorKey('STRIPE AU') === createVendorKey('  stripe-au  ')`.
3. Single-source-of-truth grep guard: `fs.readFileSync` of both monthly-report routes, assert ZERO matches for `/^\s*(function|const)\s+createVendorKey\b/gm` — fails loudly if any future executor inlines a duplicate.
4. Helper alignment: `createVendorKey(extractVendorInfo(raw, '').vendor) === createVendorKey(extractVendorName(raw, ''))` across 4 vendor samples.
5. Route-source invariant: commentary route source must contain the canonical import (`import { ..., createVendorKey, ... } from '@/lib/utils/vendor-normalization'`) AND at least one usage of `createVendorKey(`.

## Tasks completed

| # | Task                                                                | Status | Commit     |
| - | ------------------------------------------------------------------- | ------ | ---------- |
| 1 | Write round-trip + single-source-of-truth regression tests (RED)    | done   | `b1672881` |
| 2 | Migrate commentary route to use createVendorKey for keying (GREEN)  | done   | `12670b10` |

## Verification

- `npx vitest run src/__tests__/lib/vendor-normalization-roundtrip.test.ts --reporter=verbose` → **5/5 PASS** (350ms).
- `grep -rn "function createVendorKey" src/` → exactly ONE hit at `src/lib/utils/vendor-normalization.ts:332`.
- `grep -n "createVendorKey" src/app/api/monthly-report/commentary/route.ts` → 3 hits (import + comment + use in `addToVendor`).
- `npx tsc --noEmit` → clean on the two touched files (no new diagnostics introduced).
- Per memory `feedback_executor_scoped_tests`: scoped vitest run only (no full suite).

## Deviations from Plan

None — the plan's intent was achieved exactly. One micro-clarification: the plan's Test 4 ("extractVendorInfo + createVendorKey alignment") would have passed even WITHOUT the route fix because `extractVendorName` is a thin wrapper around `extractVendorInfo` (both pre-normalize via `matchKnownVendor`). To capture the actual route-level B2 bug as a RED-then-GREEN test, an additional Test 5 was added that inspects the commentary route's source for the `createVendorKey` import + usage. The four plan-spec tests + the one route-source test all live in the same file. Net result: stronger invariant, same shape.

## Auth gates

None encountered (pure helper + route source-inspection — no Supabase, no Xero, no network).

## Self-Check: PASSED

- File `src/__tests__/lib/vendor-normalization-roundtrip.test.ts` — FOUND
- File `src/app/api/monthly-report/commentary/route.ts` modification — FOUND (import line + addToVendor body + output loop all reflect the keying fix)
- Commit `b1672881` — FOUND in git log
- Commit `12670b10` — FOUND in git log
- Test suite — 5/5 PASS verified by direct `vitest run` invocation
- Grep gate — exactly ONE `function createVendorKey` definition in `src/`
