# verifyBusinessAccess — team members and the dual-ID caller audit

16 Sep 2026. Code audit of every route that calls `verifyBusinessAccess`, each
caller traced to the id-space it sends. Read-only prod checks: tiny catalog and
filtered selects only.

## The defect

`verifyBusinessAccess(userId, businessId)` (`src/lib/utils/verify-business-access.ts`)
resolved a `business_profiles.id` to its parent business for the owner and
assigned-coach checks, but ran the team-membership check as
`business_users.eq('business_id', <raw input>)`. `business_users.business_id`
references `businesses(id)`, so a caller holding a profile id refused every
active team member. Prod on 15 Sep had 9 active members who are neither owner
nor assigned coach (3 admin, 3 member, 3 owner-role co-owners); all are keyed on
a businesses.id, as the FK requires.

The characterization test passed "member × profile id ⇒ true" because its fake
answered the membership read with the same row whatever `business_id` it was
asked for.

## The fix

- The membership check runs on the parent businesses.id.
- A failed lookup still refuses (fail closed), and it now reaches Sentry via
  `surfaceSupabaseError`, so a database error no longer reads as "not a member".
- Pending and inactive members stay refused (C-34).
- Roles are unchanged: any active membership passes. The helper answers "does the
  user belong to this business". A narrower audience is the route's job.

Tests:
- `src/__tests__/lib/verify-business-access-characterization.test.ts` — a
  role × id-space matrix on `src/__tests__/helpers/filter-aware-supabase.ts`, a
  double whose reads honour every filter value and which throws on query methods
  it does not implement. It fails 10 cases against the old helper.
- `src/__tests__/api/team-member-profile-id-access.test.ts` — through the
  exported `GET /api/goals/reset-actuals` and `GET`/`POST /api/kpis` with the
  real helper, posting a profile id. It fails 5 cases against the old helper.

## Why the fix grants no new (user, business) pair

A member of business X could already pass for X by sending X's businesses.id:
- `businesses` RLS lets them read the row (`auth_is_team_member_of`, active only);
- `business_profiles.business_id` hands it to anyone who can read the profile;
- `BusinessContext.activeBusiness.id` holds it on every page.

The fix only lets X's other id spelling through too. The DB read rule
`auth_get_accessible_business_ids()` has bridged profile ids to memberships
since the baseline.

- **The one real widening is `/api/kpis`.** Its tables are FK'd to
  `business_profiles(id)`, so it only works with a profile id, and members could
  not use it before. Its writes stay inside `business_kpis` `rls_access`
  WITH CHECK, which admits any active member of the profile's parent business.
  Members can already write those rows directly.
- **Deliberately narrower routes are unaffected.** `Xero/auth`, `Xero/disconnect`,
  `Xero/reactivate` and `monthly-report/sync-xero` don't call this helper; they
  run their own owner / coach / super_admin check.
- **The section gate does not block anyone today.** `requireSectionPermission` is
  LOG_ONLY in prod: the latest `section_permission_check` event (WISDOM-BI-E,
  15 Sep, release c5eddd8a) carries `enforced: False`.
  - It has the same raw-id lookup; PR #341 fixes it.
  - Before flipping SECTION_PERMISSION_ENFORCE, note that a profile id is refused
    for everyone but super_admin until #341 lands.
  - The one live profile-id caller below (`goals/reset-actuals`) has no section
    gate.

## Where the id-space changes the outcome

| Route | Caller | Before | After |
|---|---|---|---|
| `GET goals/reset-actuals` | Annual reset: `useStrategicPlanning` → `annual-reset-service`, which posts the business_profiles.id | Members got 403; the rollover silently kept last year's targets | Members get FY actuals |
| `/api/kpis` (all methods) | None in-app (`API_ENDPOINTS.KPIS` is never imported) | Unusable by members | Members pass; writes within RLS |
| `POST Xero/sync` (PR #539, not on main) | KPI dashboard, profile id | Resolves before the check, so members already pass | Unchanged |

Prod: the 3 annual resets ever run (plan_snapshots `annual_reset_FY%`) were
triggered by a coach (2) and an owner (1). No stored plan was seeded without its
actuals because of this defect.

## Per-route verdicts

42 route files on main mention the helper; 41 call it. `forecast/[id]/recompute`
has its own inline check and only names the helper in a comment. PR #539's
`Xero/sync` is the 43rd.

"Callers send" is the id-space the live in-app callers send. "Members reach"
means with a businesses.id, before and after this change.

Key:
- ✅ members belong here
- ⚠️ D1/D2 — members already reach it, but a narrower audience is documented or
  implied; a decision for Matt, below
- 🐞 a separate defect, not about audience

### Xero

| Route | Check receives | Callers send | What it does | Members reach | Verdict |
|---|---|---|---|---|---|
| `Xero/active-tenants` GET | raw | businesses.id | reads org names/currency | yes → yes | ✅ |
| `Xero/balance-sheet` GET | raw | businesses.id | live BalanceSheet; token refresh | yes → yes | ✅ |
| `Xero/budgets` GET | raw | businesses.id | live Budgets; token refresh through the caller's RLS client | yes → yes | ✅ · 🐞 see F3 |
| `Xero/chart-of-accounts-full` GET/POST | raw | businesses.id | cache read; refresh → Accounts + `xero_accounts` upsert | yes → yes | ✅ · 🐞 see F5 |
| `Xero/chart-of-accounts` GET | raw | businesses.id | live Accounts; a 401 sets `expires_at` to epoch | yes → yes | ✅ |
| `Xero/employees` GET | raw | businesses.id | payroll pull (PII); can set `is_active=false` | yes → yes | ✅ (wizard team step) |
| `Xero/pl-summary` GET | raw | businesses.id | DB read (RLS client) | yes → yes | ✅ |
| `Xero/reconciliation` GET | raw | businesses.id | live BankTransactions; upserts `financial_metrics` on every view | yes → yes | ✅ |
| `Xero/refresh-pl` POST | raw | businesses.id (only `public/refresh-envisage.html`) | full orchestrator sync | yes → yes | ⚠️ D1 |
| `Xero/subscription-transactions` POST | raw | businesses.id | long crawl; vendor-actuals upsert | yes → yes | ✅ (forecast page is client-facing) |
| `Xero/sync-forecast` POST | raw | businesses.id (forecast page Sync, wizard Refresh, post-connect) | full orchestrator sync; no section gate | yes → yes | ⚠️ D1 |

### Forecast, goals, KPIs, team, CFO

| Route | Check receives | Callers send | What it does | Members reach | Verdict |
|---|---|---|---|---|---|
| `budgets/import` POST | raw | none (a script reimplements it) | Xero budget → `budget_versions`/`budget_lines` | yes → yes | ⚠️ D2 |
| `cfo/reconciliation/dashboard-capture` GET/POST | raw | businesses.id (recon skills, watcher) | appends captures that set the board's READY/BLOCKED | yes → yes | ⚠️ D2 · see F4 |
| `forecast/[id]/recompute` POST | inline check on resolved ids | none | publish + `forecast_pl_lines` rewrite | unaffected | any global coach passes (APP-AUTHZ Tier B) |
| `forecast/cashflow/bank-balances` POST | raw | businesses.id | live BalanceSheet | yes → yes | ✅ |
| `forecast/cashflow/capex` POST | raw | businesses.id | live BalanceSheet | yes → yes | ✅ |
| `forecast/cashflow/profiles` GET/POST | resolved (from the forecast) | forecast id | profile upsert/delete | yes → yes | ✅ |
| `forecast/cashflow/settings` GET/POST | resolved (from the forecast) | forecast id | settings upsert | yes → yes | ✅ |
| `forecast/cashflow/sync-balances` POST | raw | businesses.id + forecast id | 3 Xero calls; writes forecast assumptions | yes → yes | ✅ · 🐞 see F1 |
| `forecast/cashflow/xero-actuals` GET | raw | businesses.id (+ forecast id) | P&L composite read | yes → yes | ✅ · 🐞 see F1 |
| `forecasts/scenarios` all | resolved (GET/POST); PATCH/DELETE key on user_id only | none (dead; columns don't match the table) | scenario CRUD | yes → yes | dead — delete |
| `goals/reset-actuals` GET | raw | **business_profiles.id** | FY actuals read | **no → yes** | ✅ (the fix) |
| `kpis` all | raw | none (dead) | service-role KPI CRUD, profile-keyed | **no → yes** | ✅ within RLS; dead — delete candidate (DUAL-ID-AUDIT) |
| `team/org-chart` GET/POST | raw (optional) | businesses.id | `team_data` by owner (includes salaries) | yes → yes | ✅ (planning page) |

### Monthly report

The monthly report UI is coach/super_admin only, but only through the
client-side guard in `finances/monthly-report/layout.tsx`. No route has a role
check.

| Route | Check receives | Callers send | What it does | Members reach | Verdict |
|---|---|---|---|---|---|
| `account-actuals` GET | raw | businesses.id | read | yes → yes | ✅ |
| `account-mappings` GET/POST/PUT | raw | businesses.id | mapping upsert / bulk confirm | yes → yes | ⚠️ D2 · 🐞 see F2 |
| `auto-map` POST | raw | businesses.id | mapping inserts | yes → yes | ⚠️ D2 |
| `cash-model` GET | raw | businesses.id | read | yes → yes | ✅ |
| `commentary` POST | raw | businesses.id (after every generate) | live Xero + token refresh; reverts an approved/sent report to draft | yes → yes | ⚠️ D2 |
| `debug` GET | raw | none; no section gate | diagnostics | yes → yes | ⚠️ D2 |
| `external-metrics` GET/POST | raw | businesses.id | series/value writes (RLS already allows members) | yes → yes | ✅ values · ⚠️ D2 define series |
| `full-year` POST | raw | businesses.id | read | yes → yes | ✅ |
| `generate` POST | raw | businesses.id | read (rate-limited) | yes → yes | ✅ |
| `money-flow` GET | raw | businesses.id | read | yes → yes | ✅ |
| `opening-bank` GET | raw | businesses.id | read | yes → yes | ✅ |
| `payroll-grid` POST | raw | businesses.id | read (named pay) | yes → yes | ✅ |
| `preflight` GET/POST | raw | businesses.id | inserts `report_invariant_results` (approve/send proof rows) | yes → yes | ⚠️ D2 |
| `settings` GET/POST | raw | businesses.id | pack configuration; reverts approval | yes → yes | ⚠️ D2 |
| `snapshot` GET/POST/PATCH | raw | businesses.id | finalise / unfinalise / overwrite / memo / freeze; reverts approval | yes → yes | ⚠️ D2 |
| `subscription-detail` POST | raw | businesses.id | live Xero crawl; vendor history upsert/delete | yes → yes | ⚠️ D1/D2 |
| `templates` all | raw | businesses.id | template CRUD including hard delete; no section gate | yes → yes | ⚠️ D2 |
| `wages-detail` POST | raw | businesses.id | read; rare live payroll pull | yes → yes | ✅ |

## Decisions for Matt (unchanged by this PR)

**D1 — Who may run a Xero sync?**
- `monthly-report/sync-xero` is owner / assigned coach / super_admin by design.
- `Xero/sync-forecast` (a button on the client-facing forecast page),
  `Xero/refresh-pl`, #539's `Xero/sync`, and `subscription-detail`'s live crawl
  admit any active member.
- #539 already raised "members may press Sync"; one rule should cover all of
  them. If the rule is owner/coach/super_admin, gate these routes and carry
  `can_manage` to the buttons, as `/api/Xero/status` does.

**D2 — Coach tooling that members reach through the API.**
- The monthly report UI and `/cfo` are coach/super_admin only. The user-facing
  `/api/cfo` routes (`board`, `board-settings`, `flag-client`,
  `recheck-reconciliation`, `report-status`) check coach/super_admin plus the
  assigned coach.
- These routes check only membership: `dashboard-capture` (its header and
  SKILL.md say coach-only), the monthly-report write routes above, `debug` and
  `budgets/import`.
- A server-side gate would make the API match the UI. Confirm the recon runner's
  account role before gating `dashboard-capture`.

**D3 — Roles.**
- The helper admits any active role.
- The DB write rule `auth_can_manage_business` admits only `admin` and `member`,
  so owner-role co-owners (3 in prod) and viewers (0) are refused on
  RLS-client writes.
- `business_users.role` defaults to `'owner'`, so the exclusion may be an
  oversight. See F3.

## Separate defects found

- **F1 — Cross-tenant forecast access (IDOR).** Both routes verify access to the
  posted `business_id` but never tie `forecast_id` to it.
  - `forecast/cashflow/sync-balances` overwrites any forecast's
    `assumptions.cashflow` through the service-role client, and its update error
    is unchecked.
  - `forecast/cashflow/xero-actuals` returns any forecast's P&L composite.
- **F2 — The mapping editor wipes fields it doesn't send.**
  `monthly-report/account-mappings` POST writes null for every omitted field.
  - A category change (`AccountMappingEditor` `handleCategoryChange`) clears
    `forecast_pl_line_id`/`_name` and `report_subcategory`.
  - A forecast-line change clears the account code, type and subcategory.
- **F3 — `Xero/budgets` refreshes tokens through the caller's RLS client.**
  - For an owner-role co-owner or a viewer, the lock and token-save UPDATEs fail
    the `xero_connections` WITH CHECK (`auth_can_manage_business`).
  - Xero would rotate the refresh token, the save would fail, and the token
    manager returns `database_error` (`xero_token_persist_failed`).
  - Latent: 0 such Sentry events in 90 days.
- **F4 — `dashboard-capture` has no coach gate, although its design says
  coach-only** (see D2).
- **F5 — `Xero/chart-of-accounts-full` refresh upserts on a conflict target no
  index matches.**
  - It upserts `onConflict: 'business_id,xero_account_id'`, but prod's only
    unique index is `(business_id, tenant_id, xero_account_id)`, so the refresh
    path would 500.
  - Latent: 0 Sentry events in 90 days; the 6-hourly sync keeps the cache under
    24h old.
