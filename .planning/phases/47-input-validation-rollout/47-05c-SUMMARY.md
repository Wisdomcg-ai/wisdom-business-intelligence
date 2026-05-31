---
phase: 47-input-validation-rollout
plan: 05c
subsystem: api-validation
tags: [zod, observe-mode, input-validation, VALID-05]
requires: ["47-01", "47-02"]
provides: ["misc/infra subtree observe-wrapped at verb level"]
affects:
  - "src/app/api/cron/**/route.ts"
  - "src/app/api/auth/**/route.ts"
  - "src/app/api/ai/**/route.ts"
  - "src/app/api/ai-assist/route.ts"
  - "src/app/api/chat/messages/route.ts"
  - "src/app/api/todos/**/route.ts"
  - "src/app/api/notifications/create/route.ts"
  - "src/app/api/ideas/**/route.ts"
  - "src/app/api/email/**/route.ts"
  - "src/app/api/documents/**/route.ts"
  - "src/app/api/activity-log/**/route.ts"
  - "src/app/api/processes/**/route.ts"
tech-stack:
  added: []
  patterns: ["Option B clone-and-forward withSchema/withQuerySchema; NextRequest→Request variance bridge at wiring site"]
key-files:
  created:
    - ".planning/phases/47-input-validation-rollout/47-05c-ROUTE-LIST.md"
  modified:
    - "src/app/api/activity-log/route.ts"
    - "src/app/api/activity-log/login/route.ts"
    - "src/app/api/auth/logout/route.ts"
    - "src/app/api/auth/reset-password/route.ts"
    - "src/app/api/auth/update-password/route.ts"
    - "src/app/api/ai-assist/route.ts"
    - "src/app/api/ai/advisor/route.ts"
    - "src/app/api/ai/forecast-assistant/route.ts"
    - "src/app/api/ai/forecast-insights/route.ts"
    - "src/app/api/chat/messages/route.ts"
    - "src/app/api/cron/daily-health-report/route.ts"
    - "src/app/api/cron/reconciliation-watch/route.ts"
    - "src/app/api/cron/refresh-xero-tokens/route.ts"
    - "src/app/api/cron/sync-all-xero/route.ts"
    - "src/app/api/cron/weekly-digest/route.ts"
    - "src/app/api/documents/route.ts"
    - "src/app/api/documents/[id]/download/route.ts"
    - "src/app/api/email/send/route.ts"
    - "src/app/api/email/test/route.ts"
    - "src/app/api/ideas/[id]/share/route.ts"
    - "src/app/api/ideas/[id]/status/route.ts"
    - "src/app/api/notifications/create/route.ts"
    - "src/app/api/processes/route.ts"
    - "src/app/api/processes/[id]/route.ts"
    - "src/app/api/processes/ai-mapper/route.ts"
    - "src/app/api/todos/[id]/complete/route.ts"
    - "src/app/api/todos/[id]/share/route.ts"
decisions:
  - "Full-surface count (criterion #1) cannot be met on this branch alone: sibling slices 05a/05b have not yet landed. The 24-file gap is entirely Xero/consolidation/forecast(s) — their claimed territory, NOT an unclaimed file."
metrics:
  duration: "~1 session"
  completed: "2026-06-01"
---

# Phase 47 Plan 05c: Input-Validation Rollout — misc/infra Subtree Summary

Observe-mode `withSchema`/`withQuerySchema` wrappers applied verb-by-verb across the misc/infra API surface (cron, auth, ai, ai-assist, chat, todos, notifications/create, ideas, email, documents, activity-log, processes), with substantive per-field Zod schemas and zero behavior change (ZOD_ENFORCE_ROUTES untouched).

## What shipped

27 route files wrapped (the 28th, `notifications/route.ts`, was already wrapped by 47-02 and left untouched — verb-level dedup respected). All via Option B clone-and-forward: handler bodies kept byte-identical, only the `export` line changed to a wrapper call. Handlers typed `NextRequest` were bridged to the wrapper's `Request` generic via `handler as unknown as (request: Request) => Promise<Response>`; `auth/update-password` GET kept `NextRequest` because it uses `request.nextUrl`.

## Per-route wrapped inventory (verb + modeled field count)

Body verbs (`withSchema`) — substantive typed schemas:

| Route | Verb | Wrapper | Fields |
|-------|------|---------|--------|
| activity-log | POST | withSchema | 10 (business_id, table_name, record_id, action, field_name?, old_value?, new_value?, changes?, description?, page_path?) |
| activity-log/login | POST | withSchema | 1 (business_id) |
| auth/reset-password | POST | withSchema | 1 (email) |
| auth/update-password | POST | withSchema | 2 (token, password) |
| ai-assist | POST | withSchema | 3 (fieldType, currentValue?, businessContext?) |
| ai/advisor | POST | withSchema | 6 (type, position?, employmentType?, projectType?, scope?, complexity?) |
| ai/advisor | PATCH | withSchema | 3 (interactionId?, action?, userValue?) |
| ai/forecast-assistant | POST | withSchema | 4 (message, systemPrompt?, context?, history?) |
| ai/forecast-insights | POST | withSchema | 2 (type, data) |
| chat/messages | POST | withSchema | 2 (business_id, message) |
| documents | POST | withSchema | 2 (business_id?, folder?) — multipart; json() no-ops, observe-only |
| email/send | POST | withSchema | 6 (type, to?, subject?, html?, from?, replyTo?, …passthrough per-type) |
| email/test | POST | withSchema | 4 (to, name?, type?, all?) |
| ideas/[id]/share | PATCH | withSchema | 2 (mode enum, userIds?) |
| ideas/[id]/status | PATCH | withSchema | 1 (status) |
| notifications/create | POST | withSchema | 7 (target_user_id, business_id?, type, title, message, link?, metadata?) |
| processes | POST | withSchema | 4 (name, description?, process_data?, user_id?) |
| processes/[id] | PUT | withSchema | 7 (name?, description?, status?, process_data?, step_count?, decision_count?, swimlane_count?) |
| processes/ai-mapper | POST | withSchema | 2 (messages array, currentProcess?) |
| todos/[id]/complete | PATCH | withSchema | 1 (completed boolean) |
| todos/[id]/share | PATCH | withSchema | 2 (mode enum, userIds?) |

Query GETs (`withQuerySchema`) — searchParams modeled:

| Route | Verb | Wrapper | Fields |
|-------|------|---------|--------|
| activity-log | GET | withQuerySchema | 5 (business_id?, table_name?, user_id?, limit?, offset?) |
| activity-log/login | GET | withQuerySchema | 1 (business_id?) |
| auth/update-password | GET | withQuerySchema | 1 (token?) — keeps NextRequest (nextUrl) |
| chat/messages | GET | withQuerySchema | 2 (business_id?, limit?) |
| documents | GET | withQuerySchema | 1 (business_id?) |
| processes | GET | withQuerySchema | 1 (user_id?) |

Input-less verbs (`z.object({})`, exempt from substance check):

| Route | Verb | Wrapper | Reason |
|-------|------|---------|--------|
| auth/logout | POST | withQuerySchema(z.object({})) | no body read; observe only — NOT an auth behavior change |
| cron/daily-health-report | GET | withQuerySchema(z.object({})) | Bearer-header auth, no body/query |
| cron/reconciliation-watch | GET | withQuerySchema(z.object({})) | Bearer-header auth |
| cron/refresh-xero-tokens | GET | withQuerySchema(z.object({})) | Bearer-header auth |
| cron/sync-all-xero | GET | withQuerySchema(z.object({})) | Bearer-header auth |
| cron/weekly-digest | GET | withQuerySchema(z.object({})) | Bearer-header auth |
| documents/[id]/download | GET | withQuerySchema(z.object({})) | param-only, no body/query |
| processes/[id] | GET | withQuerySchema(z.object({})) | param-only |
| processes/[id] | DELETE | withSchema(z.object({})) | mutating verb, no body |

## Skipped because already wrapped (47-02)

- `notifications/route.ts` GET (`withQuerySchema('notifications', …)`) and PUT (`withSchema('notifications', …)`) — left byte-identical. No double-wrap.

## Test files adapted

None. Cron tests (`cron-sync-all`, `reconciliation-watch-cron`, `cron-refresh-xero-tokens*`, etc.) call the route's `GET` export directly with `new Request('http://localhost/...')`; the wrapper transparently reads `searchParams` and forwards to the handler. All passed unchanged.

## FULL-SURFACE count (criterion #1)

- Live route count: `find src/app/api -name route.ts | wc -l` = **130**
- Wrapped after 05c: `grep -rln "withSchema\|withQuerySchema" src/app/api/ | wc -l` = **106** (79 pre-05c + 27 this slice)
- **Result: 106 < 130 on this branch.** This is EXPECTED and NOT an unclaimed-file gap.

The 24 unwrapped files are entirely sibling-slice territory that has not yet merged into this branch:
- 13× `src/app/api/Xero/**` (05a/05b)
- 2× `src/app/api/consolidation/**` (05b)
- 9× `src/app/api/forecast(s)/**` (05b)

None of this slice's 12 subtree dirs appear in the gap — every one of my 28 subtree files carries a wrapper. The full-surface ≥130 target will be satisfied once 05a + 05b land alongside 05c (the orchestrator merges all three). Reported here per the plan's "if short, REPORT the gap, do not silently double-claim" — I did not touch any Xero/consolidation/forecast file.

## Gates

- `npx tsc --noEmit`: clean (run after every batch).
- Subtree wrap loop: every route.ts in the 12 subtree dirs contains a wrapper call (no UNWRAPPED output).
- Schema-substance spot-check: 6 sampled non-exempt routes each carry ≥1 typed field (ai-assist 3, chat 4, notifications/create 6, ideas/share 2, email/test 4, activity-log 12). Input-less routes exempt and listed above.
- `npx vitest run`: **1733 passed, 1 failed, 97 skipped, 7 todo (1838 total)**. The single failure is the pre-existing/ignorable timezone flake `src/__tests__/goals/plan-period-banner.test.tsx` (`expected '2026-03-31' to be '2026-04-01'`). No other failures — no regression from the rollout.
- ZOD_ENFORCE_ROUTES untouched → observe mode, zero behavior change. No upstream-response `.json()` wrapped.

## Deviations from Plan

None — plan executed as written. One reportable condition (full-surface count short on this branch because sibling slices 05a/05b have not yet landed); handled per the plan's instruction to report rather than double-claim.

## Commits (11, one per top-level subdir)

| SHA | Subdir |
|-----|--------|
| 6ddde3bd | activity-log |
| 0e2def0e | auth |
| a2b09b4c | ai + ai-assist |
| 82bafabc | chat |
| 653ae5a2 | cron |
| dd8b8ae7 | email |
| acb3b11b | documents |
| de9b979d | ideas |
| 977ce53b | notifications/create |
| fac0bac6 | processes |
| 6e193531 | todos |

## Self-Check: PASSED

All sampled modified files exist on disk; all sampled batch commits exist in git history.
