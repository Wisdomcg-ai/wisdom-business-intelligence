# Ops/Admin Section-Permission Audit

**Date:** 2026-05-17
**Source:** Phase 65 follow-up item 4; decision D-07 (66-CONTEXT.md)
**Status:** DECISION DOCUMENT ONLY — no route code changed

---

## Purpose

This document is produced under decision D-07. Phase 65 wired the `finances` section-permission gate into user-facing finance routes only. Admin, cron, and coach ops routes that use service-role clients and may surface financial ($) data were explicitly left out of Phase 65 scope. This document decides — with per-route rationale — whether any of those routes also need the section-permission check.

**No route code is changed in this plan.** If any route is found to genuinely need a gate, it is marked `flag-for-followup` and described for a separate follow-up plan, not fixed here.

---

## Decision Criterion

A route **needs** the `finances` section-permission gate if it:

1. Returns actual financial $ data (P&L amounts, forecast figures, Xero monetary values), AND
2. Is callable by a user who could be a restricted member (i.e., a `business_users` member with `finances: false`)

A route does **NOT** need the gate if it:

- Surfaces only metadata or status flags (e.g. "forecast not started", "Xero not connected", session counts, login timestamps)
- Is cron-only with no user-facing financial response (the cron invokes it; no member ever calls it directly)
- Is restricted to super_admin or coach roles — roles that are always allowed by `requireSectionPermission`'s allow-list (owner / admin / coach / super_admin)
- Returns no financial data whatsoever

**Key note on roles:** The `requireSectionPermission` helper's allow-list (Phase 65 context) unconditionally allows: business owner, business admin, assigned coach, and super_admin. All admin routes require `super_admin`; all cron routes require `CRON_SECRET`. These callers are already in the allowlist. The gate would only add value if a restricted *member* could reach the route — which is structurally impossible for admin/cron routes.

---

## Per-Route Decision Table

| Route | Surfaces $ data? | Caller | Recommendation | Rationale |
|-------|-----------------|--------|---------------|-----------|
| `coach/client-completion/route.ts` | Metadata only | Coach UI | **no gate needed** | Reads `financial_forecasts` existence/count and `xero_connections` existence — no P&L amounts. Surfaces completion-status flags ("forecast not started", "Xero not connected"). A restricted member legitimately needs these banners. Coaches are always allowed by `requireSectionPermission`'s allow-list. |
| `coach/clients/route.ts` | NO | Coach UI | **no gate needed** | Client creation only — no financial data reads or returns |
| `coach/stats/route.ts` | NO | Coach UI | **no gate needed** | Coach aggregate stats — no financial data |
| `coach/clients/[id]/route.ts` | NO | Coach UI | **no gate needed** | See resolved-unknowns below. Returns business metadata (name, status, program_type) + session/action counts + unread message count. No P&L, no forecast amounts. Auth check via coach role enforcement; only the assigned coach can access a client record. |
| `cron/daily-health-report/route.ts` | LOW (metadata) | Vercel cron | **no gate needed** | Reads `sync_jobs` and `xero_connections` health — no P&L amounts. Cron-only (CRON_SECRET); no member ever calls it. Returns health status flags. |
| `cron/reconciliation-watch/route.ts` | LOW (metadata) | Vercel cron | **no gate needed** | Reads `sync_jobs` — no P&L amounts. Cron-only (CRON_SECRET). Returns sync health status. |
| `cron/refresh-xero-tokens/route.ts` | NO | Vercel cron | **no gate needed** | Token refresh only — no financial data at all |
| `cron/sync-all-xero/route.ts` | Indirect (triggers sync) | Vercel cron | **no gate needed** | Triggers Xero sync but does not return financial data to callers. Cron-only (CRON_SECRET). Any financial data lands in DB tables; no response payload carries $ figures. |
| `cron/weekly-digest/route.ts` | NO | Vercel cron | **no gate needed** | See resolved-unknowns below. Reads sessions, pending actions, login recency, unread message counts — no P&L amounts, no Xero monetary values. Sends coach email digest and returns `{ sent, errors }`. Cron-only (CRON_SECRET). |
| `admin/clients/route.ts` | NO | Super-admin UI | **no gate needed** | Client (business) creation — uses service-role for auth user creation; no financial data reads or returns |
| `admin/demo-client/route.ts` | Indirect (seeds demo data) | Super-admin UI | **no gate needed** | See resolved-unknowns below. POST creates a demo tenant with seeded `forecast_pl_lines` amounts, but those are fictitious demo records not real client financials. The route's response is creation metadata (`businessId`, `userId`, summary list of what was seeded). Super-admin-only enforced via `system_roles.role = 'super_admin'` check — a role that is always allowed by `requireSectionPermission`. No restricted member can ever call this route. |
| `admin/check-auth/route.ts` | NO | Super-admin UI / CI | **no gate needed** | Auth check only — no financial data |
| `admin/activity/route.ts` | NO | Super-admin UI | **no gate needed** | See resolved-unknowns below. Returns business list with status/owner email/coach name/last-activity timestamps, audit log action types, login timestamps, profile-completion flags, weekly-review status. No P&L amounts, no forecast figures, no Xero monetary values. Super-admin-only enforced via role check — always allowed by `requireSectionPermission`. |
| `admin/coaches/route.ts` | NO | Super-admin UI | **no gate needed** | Coach management (list/create coaches) — no financial data |
| `admin/reset-password/route.ts` | NO | Super-admin UI | **no gate needed** | Password reset — no financial data |
| `admin/clients/resend-invitation/route.ts` | NO | Super-admin UI | **no gate needed** | Invitation resend — no financial data |

---

## Findings — Resolved Unknowns

These four routes were marked "Unknown — needs check" in research section D. Each was read in full during Task 1.

### `coach/clients/[id]/route.ts`

**Surfaces $ data:** NO

**Service-role client:** NO. Uses `createRouteHandlerClient()` only (auth-bound client throughout).

**Caller:** Coach UI (`/coach/dashboard` and client detail views).

**Findings:** GET handler returns:
- All columns from `businesses` table for the specified client (business metadata: name, status, industry, program_type, session_frequency, enabled_modules, etc.)
- Computed metrics: `sessionCount`, `lastSessionDate`, `upcomingSessionsCount`, `totalActions`, `completedActions`, `pendingActions`, `unreadMessages`

None of these fields contain P&L amounts, forecast dollar figures, or Xero monetary values. The `businesses` table does not store financial data — it stores coaching relationship metadata. PUT handler updates `status`, `program_type`, `session_frequency`, `enabled_modules` — none of which are financial figures.

Auth protection: requires authenticated user with `system_roles.role` of `coach` or `super_admin`, then confirms `assigned_coach_id = user.id` via RLS. Both `coach` and `super_admin` are unconditionally allowed by `requireSectionPermission`'s allow-list. No restricted member can ever reach this route.

**Recommendation: no gate needed.**

---

### `cron/weekly-digest/route.ts`

**Surfaces $ data:** NO

**Service-role client:** YES (`createServiceRoleClient()`). Required to read cross-coach data (businesses, sessions, actions for all coaches' clients).

**Caller:** Vercel cron, invoked via `CRON_SECRET` authorization header. No user-facing path.

**Findings:** Reads:
- `system_roles` — coach list
- `businesses` — coach's assigned clients (name, status, owner_id)
- `coaching_sessions` — upcoming/completed sessions this week (date, status, business_id)
- `session_actions` — pending/overdue action counts
- `users` — last login timestamps
- `messages` — unread message count (count only)

Aggregates into a coach email digest with: total active clients, upcoming sessions count, completed sessions count, pending actions count, overdue actions count, unread messages count, clients-needing-attention list (name + reason like "No login in N days" or "3 overdue actions"), and upcoming session schedule (client name, date, time).

No P&L amounts, forecast figures, Xero monetary values, or any financial data appears anywhere in the queries, the aggregation, or the email content. The digest is an engagement/operations summary for coaches. Response payload to Vercel cron is `{ success, sent, errors }` — no financial data.

Cron-only: protected by `CRON_SECRET` bearer token check. No member, coach, or admin UI ever calls this route directly.

**Recommendation: no gate needed.**

---

### `admin/demo-client/route.ts`

**Surfaces $ data:** Indirect — seeds fictitious demo financial records only.

**Service-role client:** YES (`createClient(SUPABASE_SERVICE_ROLE_KEY)`). Required for auth user creation and cross-table inserts bypassing RLS during demo seeding.

**Caller:** Super-admin UI only. POST/DELETE require `system_roles.role = 'super_admin'` check.

**Findings:** POST creates a full demo tenant ("Smith's Plumbing"). As part of Step 14 (financial forecast), it inserts into `financial_forecasts` and `forecast_pl_lines` with fictitious revenue/COGS/gross-profit/net-profit values. However:
1. These are hardcoded demo amounts (e.g. `165000`, `170000` etc.), not real client financial data.
2. The POST response returns only creation metadata: `{ businessId, userId, businessName, profileId }` plus a textual summary list (`"✅ 12-Month Financial Forecast"`). No forecast amounts are returned in the response.
3. The route is restricted to `super_admin` — a role unconditionally allowed by `requireSectionPermission`. No restricted member can ever call this route.

GET handler checks whether the demo business exists — returns `{ exists, business: { id, name, owner_id, owner_email, status, created_at } }` and demo credentials. No financial data.

DELETE handler purges all demo data including `forecast_pl_lines`. Returns `{ success, message }`.

The section-permission gate protects restricted members from seeing financial data that belongs to their own business. The demo-client route is super-admin tooling that creates fictitious data — not a path where a restricted member could access their own or another real business's financial data.

**Recommendation: no gate needed.**

---

### `admin/activity/route.ts`

**Surfaces $ data:** NO

**Service-role client:** YES (`createClient(SUPABASE_SERVICE_ROLE_KEY)`). Required for unrestricted cross-business reads (all businesses, all audit logs, all user logins — super-admin dashboard).

**Caller:** Super-admin UI (`/admin/activity`). Requires `system_roles.role = 'super_admin'`.

**Findings:** GET reads and returns:
- `businesses` — id, business_name, status, owner_id, owner_email, assigned_coach_id, created_at, invitation_sent
- `audit_log` — action type, table_name, field_name, user_name, created_at, page_path (action verbs, not $ values)
- `user_logins` — login timestamps, user IDs
- `business_profiles` — id, business_id, user_id, updated_at, profile_completed (completion boolean, not $ amounts)
- `assessments` — id, user_id, status, created_at, completed_at (status and timestamps, not $ values)
- `weekly_reviews` — id, business_id, user_id, created_at, status (status and timestamps)
- `users` — id, email, first_name, last_name (identity data)

Aggregated response: per-business activity feed with last_activity timestamp, last_login timestamp, activity_count, and recent_activities (type + description string + user_name + timestamp). Summary stats: total/active clients, clients active today/this week, total activity count.

No P&L figures, forecast amounts, Xero monetary values, subscription revenue, or any numeric financial data appears in queries or response. The route surfaces operational engagement metrics and audit trail types — not financial reports.

The route is super-admin-only, a role unconditionally allowed by `requireSectionPermission`.

**Recommendation: no gate needed.**

---

## Conclusion

**No admin, cron, or coach ops route requires the `finances` section-permission gate.**

The Phase 65 decision to scope `requireSectionPermission` to user-facing finance routes only is **confirmed correct**. The reasoning holds uniformly across all routes:

1. **Admin routes** (`admin/clients`, `admin/demo-client`, `admin/activity`, `admin/check-auth`, `admin/coaches`, `admin/reset-password`, `admin/clients/resend-invitation`) — all require `super_admin`, a role unconditionally allowed by `requireSectionPermission`. Adding the gate would be a no-op since every `super_admin` call returns `allow: true`. None of these routes return actual P&L amounts or forecast figures to callers.

2. **Cron routes** (`cron/daily-health-report`, `cron/reconciliation-watch`, `cron/refresh-xero-tokens`, `cron/sync-all-xero`, `cron/weekly-digest`) — all protected by `CRON_SECRET`. No user-facing member can invoke these routes. None return financial $ data in their response payloads.

3. **Coach ops routes** (`coach/client-completion`, `coach/clients`, `coach/clients/[id]`, `coach/stats`) — require coach or super_admin role, both unconditionally allowed. `coach/client-completion` reads existence/count of forecast records (not amounts); all other coach routes deal with session/action/message metadata.

**No follow-up plan is required for item 4.** The section-permission story is consistent and complete: user-facing finance routes are gated (Phase 65), and ops/admin/cron routes do not need the gate because they are either inaccessible to restricted members by role, cron-secret protected, or do not surface financial $ data.

The only gap to monitor going forward is if a new admin or cron route is added that surfaces actual P&L/forecast/Xero monetary data AND is callable by restricted members — in that case, apply `requireSectionPermission` at authoring time.

---

*Produced by: Plan 66-04*
*Decision authority: D-07 (66-CONTEXT.md)*
*No route code was changed during this audit.*
