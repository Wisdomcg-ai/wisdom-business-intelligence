---
phase: 47-input-validation-rollout
plan: 05a
subsystem: api-input-validation
tags: [zod, observe-mode, valid-05, coaching, admin, monthly-report]
requirements: [VALID-05]
provides: "Observe-mode Zod wrapping for the admin/coach/clients/sessions/team/monthly-report/coach-questions route subtree (slice a of 3)"
key-files:
  modified:
    - src/app/api/admin/activity/route.ts
    - src/app/api/admin/clients/route.ts
    - src/app/api/admin/coaches/route.ts
    - src/app/api/admin/demo-client/route.ts
    - src/app/api/coach/client-completion/route.ts
    - src/app/api/coach/clients/route.ts
    - src/app/api/coach-questions/route.ts
    - src/app/api/sessions/route.ts
    - src/app/api/sessions/[id]/route.ts
    - src/app/api/sessions/[id]/actions/route.ts
    - src/app/api/sessions/[id]/analyze-transcript/route.ts
    - src/app/api/team/org-chart/route.ts
    - src/app/api/monthly-report/account-mappings/route.ts
    - src/app/api/monthly-report/auto-map/route.ts
    - src/app/api/monthly-report/commentary/route.ts
    - src/app/api/monthly-report/consolidated-bs/route.ts
    - src/app/api/monthly-report/consolidated-cashflow/route.ts
    - src/app/api/monthly-report/consolidated/route.ts
    - src/app/api/monthly-report/debug/route.ts
    - src/app/api/monthly-report/full-year/route.ts
    - src/app/api/monthly-report/generate/route.ts
    - src/app/api/monthly-report/settings/route.ts
    - src/app/api/monthly-report/snapshot/route.ts
    - src/app/api/monthly-report/subscription-detail/route.ts
    - src/app/api/monthly-report/sync-xero/route.ts
    - src/app/api/monthly-report/templates/route.ts
    - src/app/api/monthly-report/wages-detail/route.ts
    - src/app/api/coach/client-completion/__tests__/route.test.ts
  created:
    - .planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md
---

# Phase 47 Plan 05a: Admin/Coach/Clients/Sessions/Team/Monthly-Report Observe Sweep Summary

Wrapped every previously-unwrapped mutating verb and query GET in the admin / coach / clients /
sessions / team / monthly-report / coach-questions subtree with `withSchema` / `withQuerySchema`
in OBSERVE mode (Option B clone-and-forward), modeling each verb's real destructured fields.
`ZOD_ENFORCE_ROUTES` stays empty — zero behavior change.

## Verb-level dedup (left untouched — already wrapped in waves 2b/3)

- admin/check-auth GET
- admin/clients POST, PATCH
- admin/clients/resend-invitation POST
- admin/coaches POST, PATCH
- admin/reset-password POST
- clients/send-invitation POST
- coach/clients/[id] GET, PUT
- coach/stats GET
- team/invite POST
- team/remove-member POST

For multi-verb files (admin/clients, admin/coaches) only the MISSING verbs were wrapped; the
already-wrapped exports were never re-wrapped (tsc clean proves no double-wrap).

## Routes wrapped this slice (verb + modeled field count)

### admin/
- `admin/activity` GET (query) — 2 fields (range, limit)
- `admin/clients` DELETE (query) — 1 field (id)
- `admin/coaches` GET — 0 fields (input-less, permissive z.object({}))
- `admin/coaches` DELETE (query) — 1 field (id)
- `admin/demo-client` POST — 0 fields (no inbound body; permissive)
- `admin/demo-client` GET — 0 fields (input-less; permissive)
- `admin/demo-client` DELETE — 0 fields (input-less; permissive)

### coach/
- `coach/client-completion` GET — 0 fields (input-less; permissive)
- `coach/clients` POST (body) — 22 fields (full create-client wizard)
- `coach/clients` GET — 0 fields (input-less; permissive)

### coach-questions/
- `coach-questions` POST (body) — 3 fields (question, priority enum, businessId)
- `coach-questions` GET (query) — 2 fields (businessId, status)

### sessions/
- `sessions` GET (query) — 1 field (business_id)
- `sessions` POST (body) — 5 fields (business_id, title, scheduled_at, duration_minutes, agenda)
- `sessions/[id]` GET — 0 fields (input-less; permissive; dynamic ctx forwarded)
- `sessions/[id]` PUT (body) — 7 fields (title, scheduled_at, duration_minutes, status, notes, agenda, summary)
- `sessions/[id]` DELETE — UNWRAPPED (no body, no query; file carried by GET/PUT wrappers)
- `sessions/[id]/actions` POST (body) — 2 fields (description, due_date)
- `sessions/[id]/analyze-transcript` POST (body) — 1 field (transcript_text)

### team/
- `team/org-chart` GET (query) — 1 field (user_id)
- `team/org-chart` POST (body) — 3 fields (org_chart, user_id, business_id)

### monthly-report/
- `monthly-report/account-mappings` GET (query) — 1 field (business_id)
- `monthly-report/account-mappings` POST (body) — 9 fields
- `monthly-report/account-mappings` PUT (body) — 2 fields (business_id, mapping_ids)
- `monthly-report/auto-map` POST (body) — 1 field (business_id)
- `monthly-report/commentary` POST (body) — 7 fields
- `monthly-report/consolidated-bs` POST (body) — 3 fields (optional; body may be empty)
- `monthly-report/consolidated-cashflow` POST (body) — 2 fields (optional; body may be empty)
- `monthly-report/consolidated` POST (body) — 3 fields (optional; body may be empty)
- `monthly-report/debug` GET (query) — 1 field (business_id)
- `monthly-report/full-year` POST (body) — 2 fields (business_id, fiscal_year)
- `monthly-report/generate` POST (body) — 4 fields (business_id, report_month, fiscal_year, force_draft)
- `monthly-report/settings` GET (query) — 1 field (business_id)
- `monthly-report/settings` POST (body) — 12 fields
- `monthly-report/snapshot` GET (query) — 2 fields (business_id, report_month)
- `monthly-report/snapshot` POST (body) — 11 fields
- `monthly-report/subscription-detail` POST (body) — 3 fields (business_id, report_month, account_codes)
- `monthly-report/sync-xero` POST (body) — 1 field (business_id)
- `monthly-report/templates` GET (query) — 1 field (business_id)
- `monthly-report/templates` POST (body) — 8 fields
- `monthly-report/templates` PUT (body) — 2 modeled keys + .passthrough() (handler spreads `...fields`)
- `monthly-report/templates` DELETE (query) — 2 fields (id, business_id)
- `monthly-report/wages-detail` POST (body) — 5 fields

### Input-less / permissive (legitimately no input — listed for audit)
- admin/coaches GET, admin/demo-client POST/GET/DELETE, coach/client-completion GET,
  coach/clients GET, sessions/[id] GET — all permissive `z.object({})`, intentional.

### Substantive (non-blanket) note on passthrough usage
- `coach/clients` POST and `monthly-report/templates` PUT use `.passthrough()` but ONLY on top of
  22 and 2 explicitly modeled fields respectively (templates PUT handler spreads `...fields`).
  These are NOT blanket `z.object({}).passthrough()` — the destructured fields are typed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated zero-arg GET() test calls for coach/client-completion**
- **Found during:** Task 3 (tsc gate)
- **Issue:** `coach/client-completion` GET handler took zero params. Wrapping it with
  `withQuerySchema` produces an export with signature `(request: Request) => ...`, so the 14
  `await GET()` calls in `src/app/api/coach/client-completion/__tests__/route.test.ts` failed
  tsc with TS2554 "Expected 1 arguments, but got 0".
- **Fix:** Passed a throwaway `new Request('http://localhost/api/coach/client-completion')` to
  each `GET()` call. The handler ignores `request`, so behavior is identical; no handler/wrapper
  logic was altered. This is the documented observe-mode pattern for previously-arg-less GETs.
- **Files modified:** src/app/api/coach/client-completion/__tests__/route.test.ts
- **Commit:** see coach subdir commit

**2. [Rule 3 - Blocking] team/org-chart GET widened from NextRequest to Request**
- **Found during:** Task 2
- **Issue:** `team/org-chart` GET used `request.nextUrl` and passed `request` to a local
  `getAuthUser(request: NextRequest)`. The wrapper generic requires a `Request`-typed handler;
  a `NextRequest`-typed handler is not assignable under strictFunctionTypes.
- **Fix:** `getAuthUser` ignores its `request` arg (it reads `cookies()`), so widened its param
  to `Request`; widened the GET handler to `Request` and switched `request.nextUrl.searchParams`
  to `new URL(request.url).searchParams` (behavior-identical). Removed the now-unused
  `NextRequest` import. No auth/structure change.
- **Files modified:** src/app/api/team/org-chart/route.ts
- **Commit:** see team subdir commit

All other `monthly-report/*` handlers were typed `NextRequest` but only used `new URL(request.url)`
(never `.nextUrl`), so they were widened to `Request` and the unused `NextRequest` import dropped —
behavior-identical, required to satisfy the wrapper generic.

## Authentication Gates

None — no auth gates hit during execution.

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- Task 2 loop — every route.ts in the subtree carries a `withSchema`/`withQuerySchema` call; no
  duplicate verb exports; the only remaining `export async function` verb is the intentional
  input-less `sessions/[id]` DELETE (file already carried by GET/PUT wrappers).
- Schema-substance spot-check — sampled monthly-report/generate (4 typed), snapshot (11), settings
  (12), coach/clients (22), sessions (6), coach-questions (5) — all non-empty typed field schemas.
- `npx vitest run` — 1733 passed, 1 failed, 97 skipped, 7 todo. The single failure is the known
  pre-existing timezone flake `src/__tests__/goals/plan-period-banner.test.tsx`
  ("expected '2026-03-31' to be '2026-04-01'") — unrelated to this slice. No regressions.
- `ZOD_ENFORCE_ROUTES` untouched (empty) — observe mode, zero behavior change. No upstream-response
  `.json()` wrapped.

## Self-Check: PASSED
