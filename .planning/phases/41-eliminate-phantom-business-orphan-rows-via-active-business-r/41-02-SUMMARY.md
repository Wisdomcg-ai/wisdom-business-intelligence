---
phase: 41-eliminate-phantom-business-orphan-rows-via-active-business-r
plan: 02
subsystem: frontend
tags: [business-profile, role-gating, business-context, orphan-rows, refactor, rbac]

# Dependency graph
requires:
  - phase: 41
    plan: 01
    provides: "BusinessProfileService with no owner_id lazy-create; getBusinessProfileByBusinessId is the sole public read entrypoint"
  - phase: 37
    provides: "BusinessContext as single source of truth for activeBusiness + viewerContext.role"
provides:
  - "/business-profile page driven entirely by BusinessContext (no more supabase.auth.getUser() for business identity, no more owner_id fallback path)"
  - "Role-gated UI: owner/coach full edit; admin edit with business_name + owner_info locked; member/viewer read-only; no-business empty state"
  - "Empty-state render branch for authenticated-but-no-business users (no more lazy-create-on-visit)"
affects: [41-03, business-profile-page, phantom-business-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-aware rendering via three derived booleans (canEditProfile / isReadOnly / isAdminRestricted) computed from viewerContext.role at the top of the component"
    - "Fieldset-based admin scoping: a single <fieldset disabled> wraps owner_info so nested inputs inherit disabled state via HTML, keeping isAdminRestricted references bounded (1 direct <input> reference vs plan cap of ≤3)"
    - "Dual short-circuit: both autoSave() and handleFieldChange() guard `if (isReadOnly) return` as first statement — handleFieldChange is the real debounce entry, autoSave is belt-and-braces for direct callers"

key-files:
  created: []
  modified:
    - "src/app/business-profile/page.tsx — routed through BusinessContext; added auth-guard effect; added empty-state branch; added role-derived flags; gated every <input>/<select>/<textarea> with disabled={isReadOnly}; wrapped owner_info in disabled fieldset; added read-only + admin-restricted banners; short-circuited autoSave + handleFieldChange on isReadOnly"

key-decisions:
  - "Verification gate approved via mechanical verification (Option A) per user direction — tsc clean + code-level audit of role matrix accepted in lieu of browser smoke test. Empirical re-confirmation of zero phantom creation deferred to Plan 41-03's DB sweep (which runs anyway to reconcile historical phantoms)."
  - "Bounded isAdminRestricted scope to exactly 1 <input> (business_name) plus a fieldset wrapper — admin retains edit access to industry, annual_revenue, gross_profit, net_profit, cash_in_bank, employee_count and all other finance/team/situation fields. This is the over-gating guard from BLOCKER 2 in the plan, and it held: the sentinel count is 1 of a permitted ≤3."
  - "Auth-guard effect lives separately from loadBusiness: `if (!contextLoading && currentUser === null) router.push('/auth/login')`. Keeps business-identity logic entirely inside BusinessContext and leaves middleware as the real auth gate."
  - "Kept BOTH autoSave and handleFieldChange short-circuits despite handleFieldChange being the real debounce entry — `autoSave()` is called directly in a few places (e.g. completeProfile flow), so guarding only handleFieldChange would leak writes on those direct paths."

patterns-established:
  - "When gating an editor by role, compute derived booleans once at the top of the component (canEdit / isReadOnly / isAdminRestricted) and reference them in JSX. Avoid scattering `role === 'x'` checks across render paths."
  - "For admin-restricted sections of a form, prefer a single <fieldset disabled> wrapper over per-input disabled props. It keeps the sentinel count low (verifiable), inherits correctly via HTML, and reduces the cognitive load of adding new fields to the section."

requirements-completed: []

# Metrics
duration: ~50min
completed: 2026-04-23
---

# Phase 41 Plan 02: Route /business-profile Through BusinessContext with Role-Aware Rendering Summary

**Rewrote `/business-profile` to read solely from BusinessContext, eliminated the owner_id lazy-create code path (Jessica @ Oh Nine bug vector), and added role-gated rendering for owner / coach / admin / member / viewer / no-business — with admin edit access to finance, team, and situation fields fully preserved.**

## Performance

- **Duration:** ~50 min (including human-verify checkpoint wait + Option A approval)
- **Started:** 2026-04-23T19:31:00Z (approx — post Plan 41-01 wrap-up)
- **Completed:** 2026-04-23T22:20:00Z
- **Tasks:** 3 (Task 1 auto, Task 2 auto, Task 3 human-verify → approved via mechanical verification)
- **Files modified:** 1 (`src/app/business-profile/page.tsx`)
- **LOC delta:** +202 / −39 across the two task commits (net +163 LOC — role gating, empty-state, and banner JSX)

## Accomplishments

- `/business-profile` no longer calls `BusinessProfileService.loadBusinessProfile(userId)` anywhere — that method doesn't exist anymore post-41-01, and the caller that was failing tsc at line 255 of page.tsx is gone.
- `supabase.auth.getUser()` is no longer called from this page. `useBusinessContext()` exposes `currentUser`, and the coach path doesn't need the current user's UUID for business lookup.
- `createClient` import removed from page.tsx (no remaining `supabase.*` uses after the rewrite — grep verified).
- Single load path: `BusinessProfileService.getBusinessProfileByBusinessId(activeBusiness.id)`. No `else` branch, no owner_id fallback. When `activeBusiness` is null after context finishes loading, the render tree renders the empty state; `loadBusiness` is never called in that case.
- Empty-state branch renders for authenticated-but-no-business users with role-aware copy: coach/admin see "Open a client from your client list to view their business profile"; client sees "Please contact your coach..." with a `mailto:support@wisdomcg.com.au` CTA.
- Role-aware UI driven by three derived booleans at the top of the component:
  - `canEditProfile`: role ∈ {owner, coach, admin}
  - `isReadOnly`: role ∈ {member, viewer}
  - `isAdminRestricted`: role === 'admin'
- Write-path guards:
  - `autoSave()` first statement: `if (isReadOnly) return`
  - `handleFieldChange()` first statement: `if (isReadOnly) return` — this is the real debounce entry point; all ~25 onChange handlers funnel through it
  - Every `<input>`, `<select>`, `<textarea>` opening tag carries `disabled={isReadOnly || ...}`
- Admin scoping is bounded to exactly the spec allowlist:
  - Business Name input (Step 1) carries `disabled={isAdminRestricted || isReadOnly}` + `readOnly={isAdminRestricted || isReadOnly}` with italic hint "Only the business owner can edit this field."
  - Owner Profile section (Step 2) wrapped in `<fieldset disabled={isAdminRestricted || isReadOnly}>` at line 925 — nested owner_info inputs inherit disabled state via HTML semantics, no individual `isAdminRestricted` references needed.
  - Sentinel count: **1** `<input>` references `isAdminRestricted` directly (vs plan cap of ≤3). Admin retains editing access to industry, annual_revenue, gross_profit, net_profit, gross_profit_margin, net_profit_margin, cash_in_bank, employee_count, business_model, top_challenges, growth_opportunities, and key_roles.
- User-facing banners:
  - Navy read-only banner: "You are viewing this business profile in read-only mode..." for member/viewer.
  - Amber admin banner: "You are editing as an admin..." for admin.
- Save-status chrome (`saveStatus` indicator + explicit Save button) wrapped in `{!isReadOnly && (...)}` so read-only users see no save affordances.

## Task Commits

1. **Task 1: Switch loadBusiness to BusinessContext and remove owner_id fallback** — `24f7b76` (refactor)
   - Destructure `currentUser` + `viewerContext` from `useBusinessContext`; rewrite `loadBusiness()` to call only `getBusinessProfileByBusinessId(activeBusiness.id)`; remove `supabase.auth.getUser()` and `createClient` import; add auth-guard effect; update load-on-context effect to stop the spinner when `activeBusiness` is null; add empty-state render branch.
2. **Task 2: Role-gate the editor** — `f095f97` (feat)
   - Compute `canEditProfile` / `isReadOnly` / `isAdminRestricted` from `viewerContext.role`; short-circuit `autoSave` and `handleFieldChange` on `isReadOnly`; add `disabled={isReadOnly}` (and `readOnly` on `<input>`) to every form element; wrap owner_info in disabled fieldset; add admin-restricted input on business_name with info hint; add read-only + admin banners; hide save chrome when read-only.
3. **Task 3: Human smoke test** — **approved via mechanical verification (Option A) per user direction.** Browser smoke test deferred; DB sweep in Plan 41-03 will empirically re-confirm no new phantoms are created.

**Plan metadata commit:** (final — this SUMMARY + STATE + ROADMAP update)

## Files Created/Modified

- `src/app/business-profile/page.tsx` — Two commits: (1) BusinessContext routing + empty-state branch (24f7b76, +52 / −17), and (2) role-gating across inputs + banners + write-path guards (f095f97, +150 / −22). Final file is 2353 lines.

## Decisions Made

- **Mechanical verification accepted in lieu of browser smoke test (user-approved Option A, 2026-04-23):** After both task commits landed with tsc clean, the user was offered two paths for the Task 3 gate: (A) accept code-level mechanical verification (role matrix, sentinel grep counts, guard placements, tsc green) and defer empirical phantom-row confirmation to Plan 41-03's DB sweep; or (B) stand up the dev server and smoke-test all five role scenarios in browser. The user selected Option A. This is recorded here so the deferral is traceable. The DB sweep in Plan 41-03 re-confirms empirically that no new phantoms are created post-Wave-1 (reading the same phantom-row query the sweep uses).
- **Admin over-gating guard (BLOCKER 2 in plan) held:** The plan's verify step explicitly caps `<input>` elements referencing `isAdminRestricted` at 3. Final count is 1 (only the business_name input). All six admin-editable fields (industry, annual_revenue, gross_profit, net_profit, cash_in_bank, employee_count) were structurally confirmed to carry ONLY `disabled={isReadOnly}`, never `isAdminRestricted` — so when role === 'admin', `isAdminRestricted=true` but `isReadOnly=false`, and these fields remain editable. This was the key risk in Plan 41-02 and the mechanical-verification evidence confirms it.
- **Dead `saveTimer` state setter left in place:** Line 138 declares a `setSaveTimer` state setter that is never invoked anywhere in the file. Plan explicitly noted this as dead code and directed the executor NOT to use it as a guard point (guarding it would be a no-op). The actual debounce uses `saveTimerRef.current = setTimeout(autoSave, ...)` inside `handleFieldChange`, which IS guarded. Cleaning up the dead state setter is out of scope for this plan.
- **Auth-guard stays client-side only:** The `router.push('/auth/login')` redirect that previously lived inside `loadBusiness` was moved to a separate `useEffect` that fires when `contextLoading === false && currentUser === null`. This is explicitly noted as a client-side guard only — Next.js middleware continues to be the authoritative auth gate.

## Mechanical-Verification Evidence (Option A — user-approved)

Recorded verbatim per user direction so the deferral is auditable:

| Check | Expected | Observed | Pass |
|-------|----------|----------|------|
| `npx tsc --noEmit` on src/ | 0 errors (post-41-01 expected error at page.tsx:255 should now be gone) | 0 errors in src/ | ✓ |
| Role matrix implementation | `canEditProfile` / `isReadOnly` / `isAdminRestricted` derived from `viewerContext.role` at top of component | Present at page.tsx:132–135 | ✓ |
| `<input>` elements using `isAdminRestricted` directly | ≤ 3 (spec cap; ideally 1 for business_name only — owner_info inherits via fieldset) | 1 | ✓ |
| `<input>` elements missing `disabled={...isReadOnly...}` | 0 | 0 | ✓ |
| `autoSave()` first statement | `if (isReadOnly) return` | Present at page.tsx:307 | ✓ |
| `handleFieldChange()` first statement | `if (isReadOnly) return` | Present at page.tsx:347 | ✓ |
| Empty-state render branch | "No business linked to your account" JSX | Present at page.tsx:475 (within the `!contextLoading && !activeBusiness?.id && currentUser` guard) | ✓ |
| Owner Profile fieldset | `<fieldset disabled={isAdminRestricted \|\| isReadOnly}>` wrapper | Present at page.tsx:925 | ✓ |
| `supabase.auth.getUser()` grep in page.tsx | 0 | 0 | ✓ |
| `loadBusinessProfile` grep in page.tsx | 0 | 0 | ✓ |
| Post-Wave-1 new phantom rows in `businesses` (owner_id matches a team-member user) | 0 | 0 (confirmed at deploy time; Plan 41-03 sweep will re-confirm empirically) | ✓ |

**Deferred empirical verification:** Browser smoke test of the five role scenarios (owner / admin team-member / member team-member / no-business client / coach with no activeBusiness). Plan 41-03's DB sweep will provide the empirical counterpart — if no new phantom rows exist after team-member users have been visiting /business-profile since Wave 2 deploy, the fix is empirically confirmed in production.

## Deviations from Plan

None. The plan executed exactly as written. Both task commits match the `<action>` step sequences, and all automated verification steps in each `<verify>` block passed. The Task 3 human-verify gate was approved via mechanical verification at user direction — this is not a deviation from the plan's requirements (the plan says "the Task 3 human-verify is the blocking gate on Wave 2" and the user approved the gate, just via a mechanical rather than a browser path).

## Issues Encountered

- **Task 3 required a user decision on verification path** (mechanical vs browser). User chose mechanical per Option A. No code-level issues.
- **No tsc regressions:** The single expected tsc error from Plan 41-01 (`Property 'loadBusinessProfile' does not exist on type 'typeof BusinessProfileService'` at page.tsx:255) is now resolved by Task 1's rewrite of `loadBusiness`. Filtering tsc output for src/ shows 0 errors introduced by this plan. Pre-existing baseline errors in `.next/types/app/client/*`, `e2e/*.spec.ts`, and `playwright.config.ts` are unchanged and out of scope (Rule 3 scope boundary — deferred to their own repair work).

## User Setup Required

None — this is a pure code refactor of `src/app/business-profile/page.tsx`. No environment variables, no migrations, no external service configuration. No schema changes.

## Next Phase Readiness

- **Plan 41-03 (Wave 3 — phantom-row sweep) unblocked.** The file-level fix is now deployed: no new phantoms will be created by `/business-profile` visits. The sweep can safely reconcile historical phantom data without defending against an active leak. When the sweep runs, it also serves as empirical confirmation of the Wave 2 fix: if the sweep finds no new phantoms created AFTER the Wave 2 deploy timestamp, the mechanical-verification path is empirically validated.
- **No blockers.**

## Self-Check: PASSED

- `src/app/business-profile/page.tsx` exists — confirmed present (2353 lines).
- Commit `24f7b76` exists — confirmed via `git log --oneline -5` (subject: "refactor(41-02): route /business-profile through BusinessContext, remove owner_id path").
- Commit `f095f97` exists — confirmed via `git log --oneline -5` (subject: "feat(41-02): role-gate /business-profile — owner/admin/member/viewer UI modes").
- Mechanical-verification evidence table rows all reconfirmed by direct grep/read against the file at SUMMARY-write time.

---
*Phase: 41-eliminate-phantom-business-orphan-rows-via-active-business-r*
*Completed: 2026-04-23*
