# 61-06 PLAN-CHECK

**Verdict:** FLAG (proceed with semantics decision pinned)

## Coverage analysis
Delivers the coach-dashboard split: `/api/coach/client-completion` gains `ideas_breakdown: { owned, team_shared, total }` per client, and `/coach/clients/[id]/page.tsx` renders the decomposition next to the existing total. Pre-phase aggregates (`captured`, `under_review`, `approved`) are explicitly preserved.

## Decision compliance
- `owned` = ideas where `user_id === client_owner_id`; `team_shared` = teammate-owned ideas visible to client via Phase 61 sharing. Matches the goal's "Coach dashboard surfaces owned vs team-shared idea counts."
- Pre-phase fields untouched (D-5 — coexistence with existing aggregates).
- Sentry fallback path prevents the route from 500ing — degraded but non-broken (Phase 46 SEC-07 norm).
- No DB changes, no service-layer changes, surgical edit only — appropriate scope.

## Test coverage
≥10 cases across Groups A-F: pre-phase shape preserved, owned/team-shared split, specific-share included, teammate-not-shared excluded, Sentry on failure, pre-existing fields unchanged. Task 4 is a blocking human checkpoint visually verifying one client with shared ideas and one without.

## Issues found
**One unresolved semantics decision** (flagged, not blocking):

Plan explicitly punts on (a) preserve-headline-total vs (b) adopt-new-semantics-total. The CONTEXT.md hint says "values won't shift" which points to (a), but the in-memory filter described in Task 2 actually changes the count to "visible to the client" — which is (b). The two are not equivalent if the pre-phase `ownerOrBizFilter` was returning business-wide ideas the client couldn't actually see.

Line 181-184 documents both options and asks the executor to pick. The Group D test (line 113-117) actively pins the new semantics (excludes teammate ideas the client can't see). So the implementation will land on (b), but the planner labels it (a) as the default. **The executor needs to recognize this tension and update the tests, the SUMMARY.md, or both.**

Recommendation: pin semantics (b) in the test fixtures since that matches the UI intent ("what this client can see"), and document in 61-06-SUMMARY.md that the headline total may differ slightly from the pre-phase number for clients whose business has unshared teammate ideas. The roadmap's "Coach dashboard surfaces owned vs team-shared idea counts" supports (b).

## Nice-to-haves
- Consider an additional regression test: client whose business has NO ideas at all → `{ owned: 0, team_shared: 0, total: 0 }`, no crash.
- The render snippet on line 213 hides team-shared when `=== 0` — good UX, but make sure the page also collapses when `total === 0` (no "Total: 0" noise either).
