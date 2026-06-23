---
name: xero-finance-playbook
description: >-
  Correctness rules for WisdomBI finance code — invoke when working on Xero
  integration, monthly reports, consolidation, financial forecasts, or finance
  API routes (api/Xero/**, api/monthly-report/**, api/forecast/**), or anything
  touching the businesses table, business_profiles, xero_pl_lines, or section
  permissions. Covers the dual business-ID resolution requirement, Xero
  Balance-Sheet-vs-P&L classification, the requireSectionPermission auth-client
  rule, and migration safety. Use before editing or reviewing such code.
---

# WisdomBI Finance Playbook

Three traps cause most finance bugs in this codebase. Check all three whenever
you touch Xero, monthly-report, consolidation, forecast, or finance-API code.

## 1. Dual business ID — resolve before you query

`businesses.id` and `business_profiles.id` are **different UUIDs for the same
tenant**. A `business_id` arriving from a request body, query param, or the
frontend may be either form. Querying with the wrong one silently returns no
rows — no error, just wrong/empty data.

- **Always** resolve through the canonical resolver before using an ID:
  `src/lib/utils/resolve-business-ids.ts` (or `src/lib/business/resolveBusinessId.ts`).
- Use the resolved `businesses.id` (`ids.bizId`) for `businesses`,
  `business_users`, and `requireSectionPermission`. Use `ids.profileId` for
  `business_profiles`, `xero_connections`, `financial_forecasts`.
- Never trust a raw `business_id` from input. The consolidated routes were a
  known offender — confirm the route resolves IDs at the top of the handler.

**Verify:** grep the route for `resolveBusinessIds` near the top; confirm the
access check and data queries use the resolved id, not the raw input.

## 2. Xero Balance Sheet vs P&L classification

- **Balance Sheet** accounts are bucketed by the **parser/layout** logic.
- **P&L** accounts are classified by the catalog **`xero_type`**.
- These are NOT interchangeable. Classifying a BS account by `xero_type` (or a
  P&L account by layout) imbalances the accounting equation and corrupts
  consolidated reports.

When editing classification logic, confirm you're on the correct side of this
split and that BS still satisfies Assets = Liabilities + Equity in tests.

## 3. requireSectionPermission — auth-bound client only

`requireSectionPermission` (`src/lib/permissions/`) gates finance API routes.

- It MUST receive an **auth-bound** Supabase client — the result of
  `createRouteHandlerClient()` — as its first argument. **Never** pass a
  service-role client; that bypasses RLS and defeats the check.
- The canonical section key is **`finances`**. The legacy `financials` key is
  dead — do not read or write it.
- Owners, admins, coaches, and super-admins bypass the section check (resolved
  before the key is read). Data-fetching after the gate may still use a
  service-role client where a legitimate cross-business read needs it.

**Verify:** the first arg to every `requireSectionPermission(` call is an
auth-bound variable (`authClient` / a `supabase` assigned from
`createRouteHandlerClient()`), never a service-role client.

## 4. Migration safety (finance schema changes)

Any `supabase/migrations/*.sql` touching finance tables must be:
- **Idempotent** — guard with `WHERE NOT (...)` / `IF NOT EXISTS` so re-running
  is a no-op.
- **Transaction-wrapped** — `BEGIN; ... COMMIT;`.
- **Scoped** to explicitly named tables.

Merging to `main` auto-applies the migration to the production database via the
Supabase GitHub integration — treat a finance migration merge as a production
data change. Schedule risky ones outside AU/NZ business hours (live tenants:
Dragon AUD, IICT NZ/HK, JDS AUD, Fit2Shine).

## Xero OAuth

Xero tokens are AES-256-GCM encrypted; all refresh flows go through the
centralized token-manager. Do not hand-roll token refresh or decrypt tokens
inline.
