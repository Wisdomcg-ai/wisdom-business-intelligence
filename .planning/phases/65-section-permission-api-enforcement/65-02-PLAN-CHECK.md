# 65-02-PLAN-CHECK

**Verdict:** BLOCK

Plan 65-02 has TWO BLOCKER issues that are direct repeats of the Phase 61 class-of-failure the precision pattern was designed to prevent. Both must be resolved before execution.

## Coverage analysis

Plan 65-02 intends to:
- Add `sectionPermissionConfig.ts` with the env-var-gated `enforceSectionPermission` wrapper
- Wire `requireSectionPermission` + `enforceSectionPermission` into 32 finance-gated routes in LOG_ONLY mode
- Ship 3 integration tests on representative routes

The wrapper module (Task 1) is correctly specified. The route wiring (Task 2) is where the blockers sit.

## Precision compliance — BLOCKER

### BLOCKER 1: Service-role bypass policy violated (precision pattern item 7)

CONTEXT.md says: "No service-role bypass in any of the routes we touch. Grep-assert zero `createServiceRoleClient` references in the changed files." The plan's verify block greps for `createServiceRoleClient`.

**Reality:** Most routes in `files_modified` create a module-level service-role client via raw `createClient(..., process.env.SUPABASE_SERVICE_KEY!)`. The grep returns 0 hits → false negative → plan-passes-but-policy-violated. Confirmed routes:

- `src/app/api/monthly-report/auto-map/route.ts:9-12` — raw service-role client
- `src/app/api/monthly-report/snapshot/route.ts:10`
- `src/app/api/monthly-report/wages-detail/route.ts:12`
- `src/app/api/monthly-report/commentary/route.ts:12`
- `src/app/api/monthly-report/full-year/route.ts:14`
- `src/app/api/monthly-report/generate/route.ts`
- `src/app/api/monthly-report/consolidated*/route.ts`
- `src/app/api/monthly-report/settings/route.ts`
- `src/app/api/monthly-report/subscription-detail/route.ts`
- `src/app/api/monthly-report/account-mappings/route.ts`
- `src/app/api/forecast/cashflow/{settings,xero-actuals,sync-balances,capex,profiles,bank-balances}/route.ts`
- `src/app/api/Xero/{reconciliation,subscription-transactions,balance-sheet}/route.ts`

Why this matters: the plan tells the executor "the helper accepts the route's existing `supabase` client and queries through RLS." But in these routes the existing `supabase` is a service-role client and the helper will run RLS-bypassed. That's still technically functional (helper reads explicit columns) but it (a) violates the locked precision policy and (b) makes the grep verification meaningless.

**Fix required:** Pick ONE of:
- (a) Update the grep to also catch raw `process.env.SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` references, and either remove the service-role usage from the in-scope routes OR explicitly carve them out as out-of-scope service-role routes per CONTEXT.md ("If a service-role route exists that should also check, that's a Phase 66+ concern").
- (b) Loosen the locked decision in CONTEXT.md (requires Matt sign-off) to "the helper must be passed a user-auth client, but the data-fetching client may remain service-role." Then update Task 2 to instruct: pass an `auth-resolved supabase` (e.g., `createRouteHandlerClient()`) to the helper, NOT the data-fetching service-role client. Pattern already exists in `src/app/api/Xero/reconciliation/route.ts:22-23` and `src/app/api/forecast/cashflow/capex/route.ts:59-60`.

Without resolution, the executor will either deviate silently or follow the plan literally and produce a grep-passes/policy-violates outcome — exactly the Phase 61 failure mode.

### BLOCKER 2: Routes with NO `auth.getUser()` at all

Plan Task 2 step 2 instructs: "Insert the check AFTER the existing user authentication (`supabase.auth.getUser()`)." This presupposes every route has user auth.

**Reality:** Multiple in-scope routes have ZERO user-auth check. They accept `business_id` from the request body and trust it. Confirmed:

- `src/app/api/monthly-report/auto-map/route.ts` — no `auth.getUser()`, accepts `business_id` from POST body
- `src/app/api/monthly-report/snapshot/route.ts` — same
- `src/app/api/monthly-report/wages-detail/route.ts` — same
- `src/app/api/monthly-report/commentary/route.ts` — same
- `src/app/api/monthly-report/full-year/route.ts` — same

The executor cannot follow the instruction as written. They will either skip the helper (silent gap) or invent an auth pattern (precision-pattern violation: invention rather than mirroring).

**Fix required:** Plan must enumerate per-route the existing auth state and prescribe the canonical client to use. For routes lacking auth, the plan must either:
- (a) Add a Task 1.5 that introduces an auth client (`createRouteHandlerClient()` + `auth.getUser()`) BEFORE the helper call — this changes the route's behavior (any anonymous caller will now get 401), which is its own user-visible change and probably belongs in a separate plan.
- (b) Carve those routes OUT of scope and document in the SUMMARY that they remain a leak path until Phase 65.

Either is acceptable; ambiguity is not.

## Test coverage assessment

3 integration tests specified, paths and shapes match CONTEXT.md. Tests cover LOG_ONLY behavior (denied member proceeds, owner allowed, Sentry log shape). ENFORCE-mode tests are correctly deferred to 65-04 per the plan.

The chosen representative routes are reasonable — but `forecast/[id]` and `monthly-report/generate` DO have user auth and ARE the simplest case. The blockers above apply to other routes in the inventory, not the test routes — so the tests will pass green while leaving 10+ routes in undefined / wrong state.

## Route inventory check

On-disk: `find src/app/api/{forecast,monthly-report,Xero} -name route.ts` returns 50 files. Plan `files_modified` lists 32 routes + 3 test files. Spot-check:
- Excluded (correctly): Xero auth/callback/connect/disconnect/complete-connection/pending-connection/reactivate/status/connection-health, sync/sync-all/sync-forecast/accounts/employees/chart-of-accounts*, monthly-report/templates/debug/sync-xero, forecast/cashflow/expense-categories (not present).
- Included that should be re-examined: `auto-map` (kept in scope — correct per planner FLAG 2; it touches xero_pl_lines + forecast_pl_lines + account_mappings → finance data) but see BLOCKER 2 above re: zero auth.

Route count looks complete. Verify command in plan expects ≥30 — passes the math.

## Specific issues found

1. **BLOCKER** — Service-role bypass: see above.
2. **BLOCKER** — Auth-less routes: see above.
3. **FLAG** — Plan Task 2 step 6 ("for forecast `[id]`, businessId is NOT in the URL — resolved via `financial_forecasts.business_id`") is good. But for the POST handler at line 138 (separate `auth.getUser()`), the plan needs to specify the helper goes in BOTH handlers, not just the first one (already covered by step 5 generally, but worth a per-route hint for `forecast/[id]`).
4. **FLAG** — Verify-block `EXPECTED_COUNT=32` but inventory has exactly 32 entries — fine. However the `[ "$ACTUAL_COUNT" -ge 30 ]` lower bound (30, not 32) silently tolerates missing 2 routes. Tighten to `-ge 32` to make the gate meaningful.
5. **FLAG (planner FLAG 3)** — vi.mock vs vi.stubEnv for the env-load test is correctly deferred to executor discretion. The codebase has working examples of `vi.mock` patterns; acceptable risk.

## Required revisions

1. Resolve service-role policy (BLOCKER 1) — either tighten the grep + change the routes OR document a carve-out with Matt sign-off.
2. Resolve auth-less routes (BLOCKER 2) — either add an auth-client-introduction sub-task OR carve those routes out.
3. Tighten the `ACTUAL_COUNT` gate to `-ge 32`.

After revision, re-run the plan-checker.
