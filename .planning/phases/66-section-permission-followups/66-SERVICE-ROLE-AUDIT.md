# 66-SERVICE-ROLE-AUDIT: Service-Role Data-Fetching Disposition

**Date:** 2026-05-17
**Source:** Phase 66 follow-up item 3 (D-05) — consequence of Phase 65-02 wiring the section-permission gate into 32 finance routes
**Status:** REPORT ONLY — no route code changes (D-05)

## Purpose

This document classifies, per-route, the service-role data-fetching clients that Phase 65-02 left in place across the 32 finance API routes. For each of the 21 routes that carry a module-level service-role client, the disposition is one of:

- `keep` — the service-role read is genuinely required and cannot be safely replaced with an auth-bound RLS client
- `convert` — the service-role read only accesses the authenticated user's own business data; an auth-bound client + RLS would work equivalently
- `carve` — the route mixes user-facing and ops concerns and should be split into a dedicated ops-only endpoint

The 11 routes that are fully auth-bound require no disposition — they carry no service-role client.

**Conversions are explicitly deferred to a separate, later phase.** Executing the service-role → auth-bound RLS conversions across live tenants (Dragon, IICT, Fit2Shine, JDS) carries RLS-regression risk that must be scoped per-route and planned with full test coverage. This document provides the inventory that future phase will plan from.

---

## Policy Recap

From `65-CONTEXT.md` (revised 2026-05-15):

> The `requireSectionPermission` helper must receive an **auth-bound client** — `NEVER` a service-role client. Data fetching that occurs **after** the gate has passed may use a service-role client where the route legitimately needs cross-business or system-level reads.

The canonical reference implementation is `src/app/api/Xero/reconciliation/route.ts`:
- Module-level `supabase` = service-role client (for Xero data writes after the gate)
- `authClient` = `createRouteHandlerClient()` — used exclusively for `auth.getUser()`, business access check, and the section-permission gate
- Gate fires before any service-role data access

This coexistence pattern (auth-bound gate + service-role data) is correct and intentional for routes where the data read genuinely requires bypassing RLS.

---

## Disposition Legend

| Disposition | Definition |
|-------------|------------|
| `keep` | Service-role is genuinely required — cross-tenant aggregation, system-level reads, or RLS-bypassed writes. Specific reason documented per route. Converting would break live tenant functionality. |
| `convert` | Service-role is used only to read the authenticated user's **own** business data. An auth-bound client + existing RLS policies would return identical results. Safe to convert once RLS coverage is verified. |
| `carve` | The route mixes user-facing and ops/system concerns and should be refactored into a dedicated ops-only endpoint where service-role is appropriate by design. |

---

## Section A — 11 Fully Auth-Bound Routes (No Action Required)

These routes carry **no service-role client**. They use only the auth-bound client obtained via `createRouteHandlerClient()`. No disposition is needed.

| Route | Auth Client Variable | Notes |
|-------|---------------------|-------|
| `forecast/[id]/route.ts` | `supabase` via `createRouteHandlerClient()` | Auth-bound only; multi-step access check via `businesses` + `business_users` + `system_roles` |
| `forecast/[id]/actuals-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/[id]/adjust-forward/route.ts` | auth-bound | Auth-bound only |
| `forecast/[id]/recompute/route.ts` | auth-bound + calls `resolveBusinessIds(supabase, ...)` | Auth-bound only; `resolveBusinessIds` receives the auth-bound client |
| `forecast/cashflow/assumptions/route.ts` | auth-bound | Auth-bound only |
| `forecast/cashflow/payroll-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/dashboard-actuals/route.ts` | auth-bound + `resolveBusinessIds` | Auth-bound only; correctly uses `ids.bizId` / `ids.profileId` throughout |
| `forecast/quarterly-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/seed-from-prior/route.ts` | auth-bound + `resolveBusinessIds` | Auth-bound only; canonical dual-ID pattern implemented correctly |
| `Xero/pl-summary/route.ts` | auth-bound, uses `resolveXeroBusinessId` | Auth-bound only |
| `Xero/refresh-pl/route.ts` | auth-bound | Auth-bound only |

---

## Section B — 21 Routes With a Service-Role Client

### Disposition Table

| Route | Service-Role Use | Disposition | Rationale | Conversion Risk |
|-------|-----------------|-------------|-----------|----------------|
| `monthly-report/consolidated/route.ts` | Engine: `buildConsolidation(supabase, ...)` — cross-tenant Xero data aggregation | `keep` | Dragon has 2 entities, IICT has 3. The consolidation engine must read `xero_pl_lines` and `financial_forecasts` across sibling tenants in the same request. An auth-bound client hits RLS on each tenant's own data — it cannot read sibling-tenant rows without explicit cross-tenant policies (which don't exist and shouldn't). Converting would silently return incomplete data for Dragon and IICT. | **HIGH** — conversion would break Dragon/IICT consolidated reports immediately |
| `monthly-report/consolidated-bs/route.ts` | Engine: `buildConsolidatedBalanceSheet(supabase, ...)` — cross-tenant BS aggregation | `keep` | Same rationale as `consolidated/`. Balance sheet aggregation (`xero_bs_lines`) across multiple entities requires bypassing per-tenant RLS. | **HIGH** — same breakage risk for Dragon/IICT |
| `monthly-report/consolidated-cashflow/route.ts` | Engine: `buildConsolidatedCashflow(supabase, ...)` — cross-tenant cashflow aggregation | `keep` | Same rationale as `consolidated/`. Cross-tenant cashflow data cannot be read by an RLS-bound client without per-tenant session context for each entity. | **HIGH** — same breakage risk for Dragon/IICT |
| `Xero/reconciliation/route.ts` | Canonical pattern: auth-bound for gate, service-role for Xero data writes | `keep` | Established canonical pattern (Phase 65). Reconciliation data is written back to Supabase using the service-role client after Xero API calls return. RLS-bypassed writes are the explicit reason for the service-role client here. Auth-bound gate is already correct. | **HIGH** — service-role is required for writes; converting would require write-capable RLS policies (none exist) |
| `forecast/cashflow/bank-balances/route.ts` | Reads `xero_connections`, `business_profiles` for Xero connection lookup | `keep` | `xero_connections` and `business_profiles` lookups here may span multiple connection rows for multi-entity tenants (Dragon, IICT). RLS policies on `xero_connections` scope to the owning tenant; cross-entity reads require service-role. | **MED** — risk depends on whether single-tenant callers (Fit2Shine, JDS) could safely use auth-bound; multi-tenant (Dragon, IICT) cannot |
| `forecast/cashflow/capex/route.ts` | Reads `xero_connections`, `business_profiles` for Xero connection lookup | `keep` | Same rationale as `bank-balances`. Xero connection lookup for capex data fetching may traverse multi-entity configs. | **MED** — same as bank-balances |
| `forecast/cashflow/sync-balances/route.ts` | Reads `xero_connections`, `business_profiles` for connection lookup | `keep` | Same rationale as `bank-balances`. Sync-balances reads Xero OAuth tokens via `xero_connections` which are associated per entity; cross-entity access requires service-role. | **MED** — same as bank-balances |
| `forecast/cashflow/xero-actuals/route.ts` | Reads `xero_connections` via `resolveBusinessIds` | `keep` | Reads `xero_connections` for Xero token access. `xero_connections` RLS is scoped per tenant. The actual Xero API call returns actuals that then need to be cross-referenced with `xero_pl_lines`. Service-role is needed for the Xero connection lookup step. | **MED** — assess RLS on `xero_connections` before converting |
| `Xero/balance-sheet/route.ts` | Reads `xero_connections` for connection lookup + `xero_bs_lines` | `keep` | Reads `xero_connections` for OAuth token retrieval and `xero_bs_lines` which may span entities for consolidated tenants. | **MED** — `xero_bs_lines` RLS coverage needs verification before converting |
| `Xero/subscription-transactions/route.ts` | Reads subscription Xero data | `keep` | Subscription transaction data reads from Xero require `xero_connections` access for the OAuth token. Service-role ensures the connection lookup succeeds regardless of RLS policy scope on `xero_connections`. | **MED** — assess `xero_connections` RLS before converting |
| `monthly-report/snapshot/route.ts` | Snapshot table writes | `keep` | This route performs **writes** to the snapshot table. RLS write policies for member-initiated snapshot creation may not exist or may be insufficiently permissive for the coach-on-behalf-of-business pattern. Service-role bypass for writes is appropriate. | **MED** — requires RLS write policy audit before converting; writes are higher risk than reads |
| `forecast/cashflow/profiles/route.ts` | Reads `business_profiles` via `resolveBusinessIds` | `convert` | Reads `business_profiles` for the authenticated user's own business. `business_profiles` has RLS; an auth-bound client should satisfy the query for the user's own business without service-role bypass. **Verify:** confirm `business_profiles` SELECT policy covers authenticated users querying their own business; confirm `resolveBusinessIds` works with auth-bound client (note: research §B cautions that `resolveBusinessIds` should use service-role in consolidated routes, but for single-business routes the auth-bound client may suffice). | **LOW** — read-only, own-business data only |
| `forecast/cashflow/settings/route.ts` | Reads `business_profiles` via `resolveBusinessIds` | `convert` | Same rationale as `profiles/`. Settings reads are own-business, read-only. **Verify:** `business_profiles` SELECT RLS policy; no cross-tenant reads in this handler. | **LOW** — read-only, own-business data only |
| `monthly-report/settings/route.ts` | Report settings reads/writes | `convert` | Monthly-report settings are per-business config. Reads and writes are scoped to the authenticated user's own business. **Verify:** confirm `monthly_report_settings` (or equivalent) table has SELECT + UPDATE RLS policies for business members; no cross-tenant access pattern in this handler. | **LOW** — own-business scoped; check RLS write policies |
| `monthly-report/commentary/route.ts` | Financial data reads | `convert` | Commentary reads are scoped to the authenticated user's own business and period. No cross-tenant pattern. **Verify:** `monthly_report_commentary` (or equivalent) table has appropriate SELECT RLS policies. | **LOW** — read-only, own-business data only |
| `monthly-report/subscription-detail/route.ts` | Subscription financial data | `convert` | Subscription detail reads are own-business scoped. No Xero connection lookup or cross-tenant aggregation pattern visible. **Verify:** which tables are read; RLS SELECT policies cover authenticated users; no `xero_connections` reads require service-role. | **LOW** — own-business read only; verify table list |
| `monthly-report/wages-detail/route.ts` | Payroll financial data | `convert` | Wages detail reads are own-business scoped payroll data. No cross-tenant aggregation. **Verify:** `xero_payroll_entries` or equivalent table RLS SELECT policies for authenticated users. | **LOW** — own-business read only |
| `monthly-report/full-year/route.ts` | Financial data reads | `convert` | Full-year P&L/forecast reads are own-business scoped. No cross-tenant or Xero connection lookup pattern. **Verify:** `xero_pl_lines`, `financial_forecasts` RLS SELECT policies for authenticated users querying their own business. | **LOW** — own-business read only; `xero_pl_lines` RLS coverage is the key gate |
| `monthly-report/account-mappings/route.ts` | Financial data reads (xero_pl_lines / account mapping tables) | `convert` | Account mapping reads are own-business configuration data. **Verify:** `account_mappings` (or equivalent) table RLS SELECT policies; no cross-tenant reads. | **LOW** — own-business configuration data |
| `monthly-report/auto-map/route.ts` | Financial data reads | `convert` | Auto-map reads account/mapping data for the authenticated user's own business. **Verify:** mapping tables RLS SELECT policies; confirm no writes require service-role bypass. | **LOW** — own-business reads; check if handler writes |
| `monthly-report/generate/route.ts` | Financial data reads (financial_forecasts, xero_pl_lines) | `convert` | Generate reads `financial_forecasts` and `xero_pl_lines` for the authenticated user's own business to produce the monthly report. **Verify:** both table SELECT RLS policies for authenticated users; `xero_pl_lines` RLS is the highest-risk check here — if policies are business-profile-scoped, the dual-ID system means the policy must match on `business_profiles.id` not `businesses.id`. | **LOW–MED** — `xero_pl_lines` RLS dual-ID alignment is the key risk; verify before converting |

### Summary Counts

| Disposition | Count | Routes |
|-------------|-------|--------|
| `keep` | 11 | consolidated, consolidated-bs, consolidated-cashflow, Xero/reconciliation, bank-balances, capex, sync-balances, xero-actuals, Xero/balance-sheet, Xero/subscription-transactions, snapshot |
| `convert` | 10 | profiles, forecast/cashflow/settings, monthly-report/settings, commentary, subscription-detail, wages-detail, full-year, account-mappings, auto-map, generate |
| `carve` | 0 | None (see note below) |

**No `carve` candidates identified.** All 21 routes have a clear single concern (either cross-tenant aggregation / system writes = `keep`, or own-business reads = `convert`). None mixes user-facing and ops concerns in a way that warrants endpoint splitting. If future routes are added that combine, for example, financial reporting with admin/cron operations, the `carve` pattern should be applied at that point.

---

## Section C — Out-of-Band Routes (Service-Role Clients, Not in Phase 65-02 Scope)

The following routes carry service-role clients but were **not included** in the Phase 65-02 32-route finance gate wiring. They are out of scope for this audit but are documented here for completeness so they are not overlooked in future hardening phases.

| Route | Service-Role Use | Notes |
|-------|-----------------|-------|
| `sync-xero/route.ts` | Xero sync operations — reads `xero_connections`, writes `xero_pl_lines` / `xero_bs_lines` | System-level cron/operator route; service-role is appropriate; section-permission gate not wired by Phase 65-02 (flagged for ops/admin audit in 66-04) |
| `templates/route.ts` | Template data reads/writes | Admin/system route; service-role use to be assessed in 66-04 ops/admin audit |
| `debug/route.ts` | Debug data access | Ops-only route; service-role is expected; no section-permission gate warranted (admin-auth only) |

These three routes are acknowledged as **known service-role users outside the 32-route Phase 65-02 perimeter**. Disposition for each should be addressed if and when they are brought into scope of a future permission-hardening phase.

---

## Recommendation / Next Steps

### Conversion priority order

1. **Convert `profiles` and `forecast/cashflow/settings` first** — simplest own-business reads, lowest RLS risk, no `xero_pl_lines` involvement. These are the safest starting points and provide a conversion pattern template for the others.

2. **Convert `commentary`, `wages-detail`, `subscription-detail`, `monthly-report/settings`** — own-business reads with no Xero connection lookup. Low risk once RLS SELECT policies are confirmed.

3. **Convert `full-year`, `account-mappings`, `auto-map`, `generate`** — involve `xero_pl_lines` reads; must verify that `xero_pl_lines` RLS SELECT policies are scoped to `business_profiles.id` (the profile ID, not `businesses.id`) and that the dual-ID resolution is handled before the query.

4. **Keep the 11 `keep` routes unchanged** — these decisions are final unless: (a) cross-tenant RLS policies are added that explicitly allow sibling-entity reads, or (b) the write patterns are redesigned. Neither should happen without a dedicated architectural phase.

### Per-conversion verification checklist

For each `convert` candidate, the executing phase must confirm before switching the client:

- [ ] Identify all tables the handler reads (and writes)
- [ ] For each table: confirm SELECT (and UPDATE/INSERT if applicable) RLS policies exist and cover authenticated users accessing their own business
- [ ] For tables scoped to `business_profiles.id`: ensure `resolveBusinessIds` is called before the query and `ids.profileId` is used (not `ids.bizId`)
- [ ] For tables scoped to `businesses.id`: ensure `ids.bizId` is used
- [ ] Run existing route integration tests post-switch; add tests if none exist
- [ ] Verify against at least one live tenant (JDS or Fit2Shine recommended as single-entity, lower risk) before Dragon/IICT

### Future phase

A dedicated phase (to be planned after 66-03 ships) will execute the `convert` conversions per route, starting with the low-risk set. The `keep` decisions documented here serve as the authoritative record for why those routes retain service-role data access — they should not be re-litigated unless the RLS architecture changes materially.

---

*Phase: 66-section-permission-followups*
*Plan: 66-03*
*Document authored: 2026-05-17*
*All findings sourced from 66-RESEARCH.md Section C (grep-confirmed route inventory, 2026-05-16)*
