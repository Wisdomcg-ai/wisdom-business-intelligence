---
phase: 47-input-validation-rollout
plan: 03
subsystem: api-input-validation
tags: [zod, observe-mode, admin, team, write-routes, VALID-03]
requires: [47-01]
provides: ["observe-mode schemas on admin/team write tier"]
affects:
  - src/app/api/admin/clients/route.ts
  - src/app/api/admin/coaches/route.ts
  - src/app/api/admin/reset-password/route.ts
  - src/app/api/admin/clients/resend-invitation/route.ts
  - src/app/api/team/invite/route.ts
  - src/app/api/team/remove-member/route.ts
  - src/app/api/clients/send-invitation/route.ts
  - src/app/api/coach/clients/[id]/route.ts
tech-stack:
  added: []
  patterns: ["Option B clone-and-forward wrapper (withSchema/withQuerySchema)", "inline per-verb z.object schemas"]
key-files:
  created: []
  modified:
    - src/app/api/admin/clients/route.ts
    - src/app/api/admin/coaches/route.ts
    - src/app/api/admin/reset-password/route.ts
    - src/app/api/admin/clients/resend-invitation/route.ts
    - src/app/api/team/invite/route.ts
    - src/app/api/team/remove-member/route.ts
    - src/app/api/clients/send-invitation/route.ts
    - src/app/api/coach/clients/[id]/route.ts
decisions:
  - "DELETE verbs on admin/clients and admin/coaches read no JSON body (id from query) — left unwrapped; only body-bearing verbs get withSchema."
  - "coach/clients/[id] GET has no body — wrapped with withQuerySchema(z.object({})); PUT wrapped with withSchema."
  - "Switched NextRequest-typed handler params to Request where verbs were wrapped (rate-limiter/csrf helpers already accept Request); DELETE on admin/coaches kept native but param widened to Request."
metrics:
  duration: ~20m
  completed: 2026-06-01
---

# Phase 47 Plan 03: Observe-Mode Schemas on 8 Admin/Team Write Routes Summary

Attached Zod schemas in OBSERVE mode (zero behavior change) to the 8 highest-risk
admin/team write routes via the 47-01 `withSchema`/`withQuerySchema` Option-B wrapper.
Each body-bearing verb gets its own inline `z.object` modeling the route's real
destructured fields. The legacy sync-params route `coach/clients/[id]` proves ctx
is forwarded verbatim through the wrapper's `...rest`.

## Per-route modeled field counts

| Route | Verb(s) wrapped | Schema | Fields |
| ----- | --------------- | ------ | ------ |
| admin/clients | POST | AdminClientsPostSchema | 8 (businessName, firstName, lastName, email, position, accessLevel?, sendInvitation?, teamMembers?) |
| admin/clients | PATCH | AdminClientsPatchSchema | 1 (status enum) |
| admin/coaches | POST | AdminCoachesPostSchema | 5 (email, firstName, lastName, phone?, password?) |
| admin/coaches | PATCH | AdminCoachesPatchSchema | 4 (firstName, lastName, email, phone?) |
| admin/reset-password | POST | AdminResetPasswordPostSchema | 3 (userId, email, action?) |
| admin/clients/resend-invitation | POST | ResendInvitationPostSchema | 1 (email) |
| team/invite | POST | InviteBodySchema | 9 (businessId, firstName, lastName?, email, phone?, position?, role, sectionPermissions?, createAccount?) |
| team/remove-member | POST | RemoveMemberPostSchema | 3 (memberId, businessId, deleteCompletely?) |
| clients/send-invitation | POST | SendInvitationPostSchema | 1 (businessId) |
| coach/clients/[id] | GET | CoachClientGetQuerySchema (withQuerySchema) | 0 (no body; permissive query) |
| coach/clients/[id] | PUT | CoachClientPutSchema | 4 (status?, program_type?, session_frequency?, enabled_modules?) |

All 8 route files import + call a wrapper for every body-bearing verb. DELETE on
admin/clients and admin/coaches read no JSON body (id from query string) and are
intentionally left unwrapped.

## Critical-spec confirmations

- **team/invite guard preserved**: the hand-rolled `if (!businessId || !firstName || !email || !role)`
  guard remains in `postHandler` verbatim. Observe mode runs alongside it; nothing removed.
- **coach/clients/[id] sync-params forwarded**: handlers keep `{ params: { id } }` (legacy SYNC
  signature, not awaited). The wrapper's `...rest` forwards ctx verbatim; tsc clean proves the
  generic accepts the sync-params ctx.
- **No route added to ZOD_ENFORCE_ROUTES** — pure observe mode, no auth/CSRF/structure changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Handler param types widened from NextRequest to Request**
- **Found during:** Tasks 1-2 (admin/coaches, admin/reset-password)
- **Issue:** The wrapper's handler signature is `(request: Request, ...rest)`. Handlers typed
  `(request: NextRequest)` are not assignable (Request is not assignable to NextRequest), so tsc
  would fail when wrapped.
- **Fix:** Changed the wrapped handlers' `request` param to `Request`. Verified `getClientIP`
  and `csrfProtection` already accept `Request`, so no runtime change. Removed the now-unused
  `NextRequest` import where applicable; widened admin/coaches DELETE param to `Request` too.
- **Files modified:** admin/coaches/route.ts, admin/reset-password/route.ts
- **Commit:** 32081705

## Gates

- All 8 route files import + call a wrapper for every body-bearing verb (grep = 8).
- Schema-substance spot-check: all 8 routes report OK (non-empty typed fields).
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint <8 routes>`: clean (exit 0).
- `npx vitest run` (full suite): 1733 passed, 1 failed — the only failure is the known
  timezone flake at `src/__tests__/goals/plan-period-banner.test.tsx` (`2026-03-31` vs
  `2026-04-01`). The R31 super-admin reset-password route test passed unchanged, confirming
  observe-mode wrapping is zero-behavior.

## Known Stubs

None introduced by this plan. (Pre-existing `unreadMessages = 0` placeholder in
coach/clients/[id] GET is untouched — out of scope.)

## Self-Check: PASSED

- All 8 route files exist and were committed in 32081705 (git: 8 files changed).
- Commit 32081705 present on branch feat/47-03-observe-admin-writes.
