# Phase 65: Section-permission API enforcement — Research

**Compiled:** 2026-05-14
**Source:** Findings from Phase 61 team-access investigation + monthly-report audit Pass 1 (`.planning/monthly-report-alignment-audit.md`) + Pass 2 (`.planning/monthly-report-deep-audit.md`). Captures the gap, the existing patterns to reuse, and the route inventory to confirm before planning.

---

## 1. The gap

Today's access checks on API routes (verified by Phase 61 investigation):

```ts
// Typical pattern across forecast / monthly-report routes
const { data: { user } } = await supabase.auth.getUser()
if (!user) return 401

const ids = await resolveBusinessIds(supabase, businessId)
// ... query proceeds, gated by RLS that allows owner / admin / coach / business_users member
```

This correctly enforces "you must be associated with this business" but does NOT check `section_permissions.<key>`. A member with `section_permissions.finances: false`:
- Cannot see the page (sidebar filter in `src/components/layout/sidebar-layout.tsx:236-271`)
- CAN call the underlying API via devtools → gets full data back

This is the gap Phase 61 audit flagged (under "section permissions are UI-gated, not API-gated") and the Pass 2 monthly-report audit re-confirmed.

---

## 2. Existing patterns we should reuse

### 2a. Freshness-invariant log-then-enforce pattern (Phase 44.1 D-44.1-08)
Location: `src/lib/services/forecast-read-service.ts:514-563`

```ts
const STRICT_INVARIANTS = process.env.FORECAST_INVARIANTS_STRICT === 'true'

// ...
if (STRICT_INVARIANTS) {
  const err = new Error(message)
  Sentry.captureException(err, { tags: { invariant: 'forecast_freshness', forecast_id } })
  throw err
} else {
  // Soft-fail: breadcrumb + captureMessage, then fall through
  Sentry.captureMessage('forecast_freshness violation (logging-only)', { ... })
}
```

This is the canonical log-then-enforce pattern in the codebase. Phase 65 must mirror this shape exactly — single env var gate, log path is non-throwing, enforce path throws / returns 403.

### 2b. Business-access RLS predicate
Location: PostgreSQL function `auth_can_access_business()` (baseline schema)
Allows: super_admin OR business owner OR assigned coach OR `business_users` member with status='active'

Our helper's allow set must MATCH this — we cannot accidentally narrow the allowlist (would block legitimate users). Specifically:
- We allow `business_users` rows where `status = 'active'` (matches RLS)
- We DO NOT block `status = 'pending'` users at this layer — they're already blocked by RLS / business access

### 2c. Existing TS-side helpers
Location: `src/lib/permissions/index.ts`
- `DEFAULT_MEMBER_PERMISSIONS` defines the default JSONB shape — `finances: false` is the default for the `member` role
- `hasPermission()` helper exists for UI filtering — we may reuse the lookup logic for the API helper if shapes align

---

## 3. business_users schema relevant fields

From `supabase/migrations/00000000000000_baseline_schema.sql:1919-1937`:

```sql
CREATE TABLE IF NOT EXISTS "public"."business_users" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "business_id" uuid,
    "user_id" uuid,
    "role" text DEFAULT 'owner',  -- 'owner' | 'admin' | 'member' | 'viewer'
    "status" text DEFAULT 'active',  -- 'pending' | 'active' | 'inactive'
    "section_permissions" jsonb DEFAULT '{
        "goals": true,
        "actions": true,
        "roadmap": true,
        "messages": true,
        "documents": true,
        "financials": true,        -- NOTE: this key, not "finances"
        "business_profile": true,
        "quarterly_review": true
    }',
    -- ...other columns
    CONSTRAINT "business_users_role_check" CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    CONSTRAINT "business_users_status_check" CHECK (status IN ('pending', 'active', 'inactive'))
);
```

### ⚠️ Section key naming — verify before writing code
The DB default uses `financials` (plural) but Phase 61 audit / `DEFAULT_MEMBER_PERMISSIONS` reference `finances`. The planner MUST resolve which one is canonical:
- Grep `src/lib/permissions/index.ts` for `DEFAULT_MEMBER_PERMISSIONS`
- Grep `src/components/layout/sidebar-layout.tsx` for the sidebar filter using these keys
- Confirm which spelling is actually populated on `business_users.section_permissions` rows in production

If there's a mismatch (DB default has `financials` but UI checks `finances`), this is a pre-existing bug the planner must address as part of the locked decisions. **This is THE gotcha for this phase** — mirror of the Phase 61 `public.users` mistake.

---

## 4. Route inventory (must confirm exhaustively in PLAN)

The planner / researcher must grep the codebase to produce a complete list. Initial best guess, must be verified:

### Almost certainly in scope (finance / forecast)
- `src/app/api/forecast/**/*/route.ts` — all forecast read/write
- `src/app/api/monthly-report/**/*/route.ts` — all monthly report routes
  - `generate`, `full-year`, `consolidated`, `consolidated-bs`, `snapshot`, `account-mappings`, `subscription-detail`, `wages-detail`, `settings`, `sync-xero`, `commentary`, `templates`, `auto-map`, `debug`
- `src/app/api/Xero/pl-summary/route.ts`
- `src/app/api/Xero/balance-sheet/route.ts` (if exists)

### Possibly in scope (financial views surfaced via coach routes)
- `src/app/api/coach/client-completion/route.ts` — surfaces idea/financial completeness
- Any `/api/coach/**` route that returns $ data

### NOT in scope
- Xero connection management: `connect`, `callback`, `complete-connection`, `disconnect`
- Xero sync infrastructure: `sync-*` routes
- Non-finance routes: `/api/goals`, `/api/issues`, `/api/todos`, `/api/ideas`, `/api/team/*`
- Auth / session routes

### Verification commands the planner should run
```bash
# Find every API route file
find src/app/api -name 'route.ts' -o -name 'route.tsx'

# Find every route that touches forecast / monthly-report tables
grep -rln "from('xero_pl_lines\|from('financial_forecasts\|from('forecast_pl_lines" src/app/api
```

The PLAN must enumerate every route explicitly. No "and similar routes" placeholders.

---

## 5. Logging telemetry shape

Sentry events from this helper must be filterable so we can:
- Count denials by route, user, business, section
- Distinguish LOG_ONLY (informational) from ENFORCE (warning)
- Quickly identify "is this a real user being incorrectly blocked, or a member who legitimately doesn't have permission?"

Tag schema:
- `route`: stable path constant (e.g. `'api/monthly-report/generate'`)
- `section_key`: e.g. `'finances'`
- `verdict_reason`: `'permission_denied' | 'not_a_member' | ...`
- `enforced`: `true | false` (matches the env var state at time of log)

Severity:
- LOG_ONLY: `level: 'info'` (low-noise; can be filtered)
- ENFORCE: `level: 'warning'` (visible by default in Sentry dashboards)

---

## 6. Soak-window acceptance criteria

After Wave 65-02 (LOG_ONLY mode) ships and is promoted:

1. **24h minimum** before flipping ENFORCE. **48h preferred** to span weekday/weekend traffic patterns.
2. **Sentry query:** filter events tagged `section_permission_check` AND `verdict_reason=permission_denied`
3. **Acceptance:** Every denied user is a `business_users` member with `status='active'` AND `section_permissions[key]=false`. (i.e., the deny is legitimate per design.)
4. **Block to flip ENFORCE:** if ANY denied user is an owner/admin/coach/super_admin/permission-granted member. That indicates a bug in the helper or a missed allow case.
5. **Investigation playbook for unexpected denies:**
   - Pull the user's `business_users` row
   - Check role, status, section_permissions JSONB
   - Check super_admin row in `system_roles`
   - Check `businesses.owner_id`
   - Reproduce locally with the user's actual record

---

## 7. Risks identified

### Risk 1: Section-key spelling mismatch (HIGH if not caught early)
Database default has `financials`; some TS code references `finances`. Phase 65 must resolve which one is canonical and ensure the helper checks the actual production-populated key.

### Risk 2: Routes we don't enumerate (MEDIUM)
If a financial-data route is missed, it remains a leak point. Mitigation: grep-based exhaustive enumeration in the PLAN; plan-checker explicitly verifies route coverage.

### Risk 3: Existing roles we haven't enumerated (LOW)
The codebase may have role values beyond owner/admin/member/viewer (e.g., custom assigned-coach edge cases). Mitigation: the helper allowlist matches existing `auth_can_access_business` semantics, so if existing routes work for a role, our helper works too.

### Risk 4: Stale section_permissions JSONB shape (MEDIUM)
Old `business_users` rows might be missing some keys (e.g., row created before `finances` was added). Treat missing key as DEFAULT (true for the owner-bias keys, false for the restrictive keys per `DEFAULT_MEMBER_PERMISSIONS`). The planner must define this default explicitly.

### Risk 5: Phase 61-style schema assumption mistake
THE big one. Phase 61 broke because executor assumed `public.users` existed. Mitigation: CONTEXT.md §"Precision pattern" item 1 — verify every schema/table/column reference against `00000000000000_baseline_schema.sql` before writing code. The planner must include explicit verification steps in the PLAN.

---

## 8. Open questions for the planner

1. **Section-key canonical spelling.** `financials` or `finances`? Resolve before any code.
2. **Default for missing section_permissions key.** If a `business_users` row's JSONB doesn't contain the key, treat as `true` or `false`? Recommend `true` (least surprise — existing behavior is "members can access; flag must be explicitly false to deny").
3. **Service-role routes.** Are there any user-facing routes that use service-role client and bypass RLS for legitimate reasons (e.g., to surface aggregated data)? If yes, plan must enumerate them and either add the helper or document why exempt.
4. **Coach routes.** `/api/coach/*` typically shows aggregated client data to coaches. Should the helper be skipped for coaches entirely (they're already allow-listed by `auth_can_access_business`), or wired in for consistency? Recommend: helper still runs, returns `allow: true` with reason `coach`.

---

## 9. Test coverage requirements

The PLAN must specify:
- **Unit tests** for the helper covering every allow/deny case in the locked decisions
- **At least 3 integration tests** wiring the helper into real routes — recommend `/api/monthly-report/generate` (high-touch), `/api/forecast/[any read route]`, and `/api/Xero/pl-summary` as representative
- **Tests for both LOG_ONLY and ENFORCE modes** — same setup, different env var, different expected outcomes
- **Test fixtures** must use real `business_users` shape with status / role / section_permissions populated

---

*Phase: 65-section-permission-api-enforcement*
*Research compiled: 2026-05-14*
