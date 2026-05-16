# Phase 65: Section-permission API enforcement — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Source:** Discussion captured in chat following the monthly-report alignment audit (Pass 1 + Pass 2). Phase 61 incident drove the precision-first framing.

<domain>
## Phase boundary

Close the section-permission gap on sensitive API routes. Today members with `section_permissions.<key>: false` (e.g. `finances: false`) cannot SEE the affected pages in the sidebar (UI gates), but they CAN call the underlying API routes directly (devtools, curl, scripts) and receive full data back. The API routes today only check business membership, not the section flag.

After this phase, the section flag is enforced at the API layer for every sensitive route — preserving the same UI behavior but closing the data-leak path.

**In scope**
- New shared helper `requireSectionPermission(supabase, userId, businessId, sectionKey)` returning a verdict object suitable for both log-only and enforce paths
- Wiring the helper into every route that reads or writes data gated by a section permission
- Two-mode rollout pattern (LOG_ONLY → ENFORCE) controlled by env var, with a documented soak window between modes
- Per-route Sentry events tagged so we can monitor noise in log mode

**Out of scope (deferred)**
- New section keys beyond what already exists in `business_users.section_permissions` JSONB
- UI changes (the sidebar already filters correctly; this phase only closes the API-side gap)
- DB migrations (we use the existing `section_permissions` JSONB)
- Phase 65 (monthly report drift cleanup) — separate concern, separate phase
- Refactoring the existing `auth_can_access_business` semantics

</domain>

<decisions>
## Implementation decisions (locked)

### Helper signature
```ts
type SectionPermissionVerdict =
  | { allow: true; reason: 'owner' | 'admin' | 'coach' | 'super_admin' | 'permission_granted' }
  | { allow: false; reason: 'permission_denied' | 'not_a_member'; sectionKey: string }

requireSectionPermission(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  sectionKey: 'finances' | string,
): Promise<SectionPermissionVerdict>
```

### Allow / deny rules
- **Allow:** business owner (matches existing `auth_can_access_business` allow set)
- **Allow:** business admin (`business_users.role = 'admin'` with status `active`)
- **Allow:** assigned coach for the business
- **Allow:** super_admin (matches existing system-roles check)
- **Allow:** `business_users` member with `status = 'active'` AND `section_permissions[sectionKey] = true`
- **Deny:** `business_users` member with `status = 'active'` AND `section_permissions[sectionKey] = false`
- **Deny:** any other unauthenticated / non-member case (returns `not_a_member`, which existing access checks already handle — out of scope here)

### Two-mode rollout
- **Env var:** `SECTION_PERMISSION_ENFORCE` (boolean, default `false`)
- **LOG_ONLY mode** (default): helper returns the verdict, route still proceeds even if `allow: false`. Sentry capturedmessage with tags `{ route, user_id, business_id, section_key, verdict_reason }`.
- **ENFORCE mode** (after soak): if verdict is `allow: false`, route returns 403 with body `{ error: 'Insufficient permissions', section: sectionKey }`. Sentry log still fires (now tagged `enforced: true`).
- **Toggle is a SINGLE env var across all routes** — easier to roll back than per-route flags

### Soak window
- After LOG_ONLY ships to prod, wait **24-48h** before flipping ENFORCE
- **Acceptance criterion for flip:** Sentry shows zero unexpected `allow: false` events for known-good users (owners, admins, members-with-permission). Some `allow: false` from genuinely-restricted members is expected and acceptable.
- **If unexpected denies occur:** investigate (likely a route not in our inventory, or an edge-case role we missed), fix, restart soak. Don't flip ENFORCE until clean.

### Section keys (initial set)
- `finances` — guards routes that read/write P&L, forecast, monthly report, Xero P&L data
- Other section keys exist in `business_users.section_permissions` JSONB but this phase only wires `finances`. Future phases extend to other keys (`business_plan`, `execute`, etc.) as needed.

### Route inventory (initial — to be confirmed by researcher/planner)
The PLAN must enumerate routes explicitly. Initial best guess:

**Forecast / financial routes (finances)**
- `/api/forecast/**` — all routes that read or write forecast data
- `/api/monthly-report/**` — all routes (generate, full-year, consolidated, snapshot, account-mappings, subscription-detail, wages-detail, settings, sync-xero, commentary)
- `/api/Xero/pl-summary` — P&L summary endpoint
- `/api/Xero/balance-sheet` — BS endpoint
- `/api/forecast/cashflow/**` — cashflow forecast routes
- Any other route that surfaces $ figures

**NOT in this phase's scope (or already covered)**
- `/api/Xero/connect`, `/api/Xero/callback`, `/api/Xero/complete-connection` — connection management, not data reads
- `/api/Xero/sync-*` — sync infrastructure, not data reads
- Non-finance routes (`/api/goals`, `/api/issues`, `/api/todos`, etc.)

### Logging shape
Every helper invocation logs to Sentry **only when verdict is `allow: false`** to avoid noise:
```ts
Sentry.captureMessage('section_permission_check', {
  level: enforcing ? 'warning' : 'info',
  tags: {
    route: routePathConstant,
    section_key: sectionKey,
    verdict_reason: verdict.reason,
    enforced: enforcing,
  },
  extra: { user_id, business_id },
})
```

### Service-role bypass policy (revised 2026-05-15)

**The permission helper MUST be called with an auth-bound supabase client** — i.e., the result of `createRouteHandlerClient()` from `@/lib/supabase/server`, which is tied to the logged-in user via cookies. Passing a service-role client to `requireSectionPermission` would let the helper read `business_users.section_permissions` RLS-bypassed, which defeats the precision policy.

**Data fetching after the gate may continue to use service-role clients** where the route legitimately needs cross-business or system-level reads (e.g., the canonical pattern in `src/app/api/Xero/reconciliation/route.ts:1-25` — auth-bound client for auth + gate, separate service-role client for Xero data writes). Removing service-role data-fetching from finance routes wholesale is a separate concern and is captured as a Phase 66+ audit.

**Routes that have no `auth.getUser()` today** (e.g., `monthly-report/{auto-map,snapshot,wages-detail,commentary,full-year}` — they accept `business_id` from the request body with no caller identity) MUST gain a `createRouteHandlerClient()` + `auth.getUser()` check in Plan 65-02 before the helper call is wired. That auth-introduction is part of 65-02 scope (not deferred), because the alternative — wiring the helper with no `userId` — is unexecutable.

**Routes that legitimately use `createServiceRoleClient()` for ops scripts** (admin tools, cron) are still NOT in scope. The helper is for user-facing routes only. If a service-role ops route exists that should also check section permissions, that's a Phase 66+ concern.

### Backward compatibility guarantees
- No DB schema changes
- No UI changes
- LOG_ONLY mode is a 100% no-op for user behavior. Only Sentry sees anything new.
- ENFORCE mode only blocks users who already cannot see the affected page in the sidebar
- ENFORCE mode is reversible by toggling the env var back to `false` and redeploying — no migration to undo

</decisions>

<canonical_refs>
## Canonical references

**Downstream agents MUST read these before planning or implementing.**

### Existing permission model
- `supabase/migrations/00000000000000_baseline_schema.sql` — search for `business_users` table definition (line ~1919), `section_permissions` JSONB column, `business_users_role_check` constraint
- `auth_can_access_business()` Postgres function — defines who can access a business (allowlist baseline we must match)
- `auth_get_accessible_business_ids()` — returns array of accessible business IDs
- `src/lib/permissions/index.ts` — `DEFAULT_MEMBER_PERMISSIONS` shape and existing TS-side helpers; `finances: false` is the default for `member` role
- `src/app/api/team/invite/route.ts` — shows the canonical role / status / permission write path

### Routes the helper must wire into
- `src/app/api/forecast/**/*.ts` — all forecast routes
- `src/app/api/monthly-report/**/*.ts` — all monthly report routes
- `src/app/api/Xero/pl-summary/route.ts` — P&L summary
- `src/app/api/Xero/balance-sheet/route.ts` — BS (if exists)
- `src/app/api/coach/client-completion/route.ts` — coach surfaces that show $ data

The planner MUST grep for `from('xero_pl_lines'`, `from('financial_forecasts'`, `from('forecast_pl_lines'` to be sure no route is missed.

### Existing similar patterns (reference, do not duplicate)
- The freshness-invariant pattern at `src/lib/services/forecast-read-service.ts:514-563` — illustrates the log-then-enforce env-var-gated pattern (Phase 44.1 D-44.1-08). We mirror this structure.
- Phase 61's `business_users` + RLS checks — same business-membership model

### Things we will NOT touch
- `business_users` table schema
- `section_permissions` JSONB shape
- The `auth_can_*` Postgres functions
- Any existing access-control RLS policy

</canonical_refs>

<specifics>
## Precision pattern (NON-NEGOTIABLE)

Learned from the Phase 61 incident. The plan-checker and executor MUST honor every item here.

### Pre-implementation
1. **Verify every schema/table/column assumption** against `supabase/migrations/00000000000000_baseline_schema.sql` before writing code. Specifically: confirm `business_users.section_permissions` JSONB exists with the keys we reference. Phase 61 broke because an executor assumed `public.users` existed; this guardrail prevents repeat.
2. **Plan-checker veto.** Any plan with a FLAG must have a resolved-flag block written by the user (Matt), not auto-resolved by an executor.
3. **Test against the actual `business_users` shape** (status='active' check, role check, section_permissions JSONB lookup) — no fixture-only assumptions.

### During implementation
4. **Logging mode before enforcement.** Wave 65-02 logs only; Wave 65-04 enforces. There must be at least 24h between them, with explicit Sentry readout as the checkpoint.
5. **Env-var-gated toggle.** `SECTION_PERMISSION_ENFORCE` default `false`. Flipping to `true` is the only enforcement switch.
6. **Atomic commits.** Each wave is independently revertable.
7. **Helper receives auth-bound client.** Every wired route MUST pass an auth-bound supabase client (from `createRouteHandlerClient()`) to `requireSectionPermission`, never a service-role client. Grep-assert: every changed route imports `createRouteHandlerClient` from `@/lib/supabase/server` AND the symbol resolved by `createRouteHandlerClient()` (or equivalent auth-bound client) is what's passed as the first argument to `requireSectionPermission(`. Service-role clients may continue to exist in the same file for data fetching — that is intentional and out-of-scope for 65-02 cleanup.

### Pre-merge
8. **CI must include** typecheck + vitest + Supabase preview (already configured)
9. **Plan-checker re-runs after final commit**
10. **PR description includes risk-assessment block:** what can go wrong, what's the rollback (a one-liner: `vercel env rm SECTION_PERMISSION_ENFORCE production && vercel --prod` or toggle to `false`)

### Post-merge
11. **Don't auto-promote.** Use `vercel promote` manually after spot-checking the preview deploy.
12. **Sentry monitoring** for 24h between LOG_ONLY ship and ENFORCE flip.
13. **Rollback recipe** in SUMMARY: exact commands to set env var to `false` and roll forward.

## Test matrix (representative cases)

For each route covered:
- Owner → allow (verdict reason `owner`)
- Admin → allow (`admin`)
- Coach → allow (`coach`)
- Super_admin → allow (`super_admin`)
- Member with `finances: true` → allow (`permission_granted`)
- Member with `finances: false`, LOG_ONLY mode → request proceeds, Sentry log fires
- Member with `finances: false`, ENFORCE mode → 403 with structured body, Sentry log fires
- Non-member → existing access check returns 401/403, helper not reached
- Pending invite (status='pending') → treated as not-a-member by the helper

Cover at least 3 routes in integration tests; the rest are covered by unit tests on the helper.

</specifics>

<deferred>
## Deferred ideas (Phase 66+)

- Extend enforcement to other section keys (`business_plan`, `execute`, `coaching_messages`, etc.) — same helper, new keys
- Monthly report drift cleanup (separate phase already queued as Phase 65)
- Audit ops/admin routes that use service-role client; decide if any should also check section permissions
- Add a `permissions_audit_log` table for compliance — out of scope; would be a separate phase
- Add UI surface for super_admins to see "who has been denied access" — out of scope

</deferred>

---

*Phase: 65-section-permission-api-enforcement*
*Context captured: 2026-05-14*
