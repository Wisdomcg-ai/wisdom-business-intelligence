# Phase 33 — CFO Multi-Client Dashboard — SUMMARY

**Status:** ✅ COMPLETE (Iteration 1)
**Completed:** 2026-04-17

## What shipped

Coach-only `/cfo` dashboard showing all flagged CFO clients in one
priority-sorted list view. Designed to scale from 5 clients today to 40+
without redesign.

### Data model

**Migration `20260420_cfo_dashboard.sql`:**
- `businesses.is_cfo_client boolean DEFAULT false` — opt-in flag per business
- `cfo_report_status` table — per-month report workflow state
  - status: draft / ready_for_review / approved / sent
  - manual_status_override: coach can override auto-computed badge
  - coach_notes, approved_by, approved_at, sent_at
- RLS: coach sees own assigned clients; super_admin sees all

### APIs

**`GET /api/cfo/summaries?month=YYYY-MM`**
- Returns per-client summaries + aggregate stats for the month
- All DB sources (no live Xero calls — fast load)
- Pulls from: `xero_pl_lines`, `forecast_pl_lines`, `financial_metrics`, `cfo_report_status`
- Computes status badge using 10%/25% variance thresholds
- Priority-sorted: alert → watch → on_track

**`POST /api/cfo/flag-client`**
- Toggle `is_cfo_client` for a business
- Coach can only flag their assigned clients; super_admin can flag any

### UI

**`/cfo` page** — coach/super_admin only via layout guard

Key features from design discussion with user:
1. **Default sort: priority (alerts first)** ✓
2. **On Track section collapsed by default** ✓
3. **Row expand on click shows detail** ✓
4. **Scales to 40+ clients** — list view, not card grid

Layout:
- Month selector (top-left, defaults to previous completed month)
- Filter bar: All / Alert / Watch / On Track
- Search box (by client name or industry)
- 4 stat cards: On Track count / Pending Approval / Alerts / Next Due
- Priority sections:
  - 🔴 **Needs Attention** (alerts) — always visible
  - 🟡 **Watch** (amber) — always visible
  - 🟢 **On Track** — collapsed by default, click to expand
- Each row (compact):
  - Badge | Name + industry | Rev% | GP% | Net$ | Cash$ | Unreconciled | Report status
- Row expand shows:
  - Revenue vs budget (full figures)
  - Gross profit + margin %
  - Net profit vs budget
  - Cash + reconciliation status
  - "Review Report" button → opens client's monthly report in coach view

### Status badge logic

| Badge | Condition |
|-------|-----------|
| 🔴 **Alert** | Net profit >25% below budget, OR >10 unreconciled, OR report overdue |
| 🟡 **Watch** | Net profit 10-25% below budget, OR minor unreconciled (1-10) |
| 🟢 **On Track** | Within 10% of budget AND books clean |

Coach can override via `manual_status_override` field if the automatic
calculation misses context.

### Navigation

- **Coach portal sidebar:** "CFO Dashboard" link added (briefcase icon)
- **Admin portal sidebar:** "CFO Dashboard" link added (bar chart icon)
- **Middleware:** `/cfo` added to `onboardingExemptRoutes`

### Security

Three layers:
1. Middleware exempts `/cfo` from onboarding check (already role-gated)
2. Layout guard (`src/app/cfo/layout.tsx`) — redirects non-coach/non-super_admin to `/dashboard`
3. API routes — 403 on non-coach/non-super_admin (belt and braces)

Clients cannot access `/cfo`. Verified via role check pattern used
across the codebase (`getUserSystemRole()` + `system_roles` table).

## Verification

- ✅ 101 tests passing (same count as before — no test breakage)
- ✅ `npx tsc --noEmit` clean
- ✅ Migration applied via Supabase CLI
- ✅ `is_cfo_client` column exists on businesses
- ✅ `cfo_report_status` table exists with RLS

## Files created

- `supabase/migrations/20260420_cfo_dashboard.sql`
- `src/app/api/cfo/summaries/route.ts`
- `src/app/api/cfo/flag-client/route.ts`
- `src/app/cfo/layout.tsx`
- `src/app/cfo/page.tsx`

## Files modified

- `src/components/layouts/CoachLayoutNew.tsx` — added CFO Dashboard nav link
- `src/components/admin/AdminLayout.tsx` — added CFO Dashboard nav link
- `src/middleware.ts` — added `/cfo` to exempt routes

## How to use

**To flag your CFO clients (one-off setup):**

Option A — SQL (quickest):
```sql
UPDATE businesses SET is_cfo_client = true
WHERE name IN ('Dragon Roofing', 'Easy Hail', 'Urban Road', 'Client 4', 'Client 5');
```

Option B — API:
```
POST /api/cfo/flag-client
{ "business_id": "...", "is_cfo_client": true }
```

**Then:** navigate to `/cfo` from the coach or admin sidebar.

## What's deferred (future iterations)

- **Manual status override UI** — table column exists, UI comes in a later iteration
- **Phase 35 hook:** `next_due` field in stats will populate once approval workflow exists
- **Flag-client UI:** currently a separate admin step; could be a toggle on each business profile page
- **Trend arrows:** showing whether a client's trajectory is improving month-over-month

## Ready to proceed

Iteration 1 delivers the core MVP — the page loads, shows all flagged clients,
sorts by priority, expands rows for detail. Usable from day one.

Next phase recommendations (from this session's discussion):
- Phase 34 — Dragon Multi-Entity Consolidation (Matt's own business need)
- Phase 35 — Report Approval Workflow (hooks into `cfo_report_status`)
- Phase 36 — Client Portal (the client-facing end of the workflow)
