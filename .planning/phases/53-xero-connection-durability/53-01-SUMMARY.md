---
phase: 53-xero-connection-durability
plan: 01
subsystem: xero-oauth
tags: [xero, oauth, disconnect, dual-id, security]
dependency-graph:
  requires: []
  provides:
    - "POST /api/Xero/disconnect"
    - "Server-side dual-ID xero_connections delete"
  affects:
    - "src/app/integrations/page.tsx (handleDisconnectXero)"
tech-stack:
  added: []
  patterns:
    - "Cookie-session auth + service-role admin client (mirrors /api/Xero/reactivate)"
    - "Dual-ID delete via .in('business_id', [bothIds]) with .select() for authoritative count"
    - "FE state mutation gated on server-confirmed deleted_count > 0 (no optimistic flip)"
key-files:
  created:
    - "src/app/api/Xero/disconnect/route.ts"
    - "src/__tests__/xero/disconnect-route.test.ts"
  modified:
    - "src/app/integrations/page.tsx"
decisions:
  - "Inline dual-ID resolution instead of extending resolveXeroBusinessId — that helper short-circuits to one ID and filters is_active=true, both wrong shape for delete-both"
  - "Hard DELETE (not soft is_active=false) — only FK to xero_connections.id is forecasts.xero_connection_id ON DELETE SET NULL; no CASCADE pitfalls"
  - "Service-role client for the DELETE despite RLS permitting it — gives single auditable path, explicit count return, immunity to future RLS tightening"
  - "FE confirm() prompt kept as-is (out of scope; richer modal would expand the patch)"
  - "request.json() wrapped in try/catch with explicit 400 (Invalid JSON body) rather than bubbling to generic 500"
  - "deleted_count=0 returns HTTP 200 with success:false rather than 404 — distinguishes 'request acknowledged but no-op' from 'business not found'"
metrics:
  duration: "~75 minutes (single agent execution)"
  completed: "2026-05-06"
  tasks_completed: "2 of 2 (Task 1 RED, Task 2 GREEN). Task 3 is a checkpoint:human-verify and is operator-driven post-deploy."
  commits: 3
  pull_request: "https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/107"
---

# Phase 53 Plan 01: Server-side Xero disconnect with dual-ID purge — Summary

## One-liner

Replaced the browser-side `xero_connections.delete()` in the Integrations page with a server-side `POST /api/Xero/disconnect` route that hard-deletes by BOTH `businesses.id` AND `business_profiles.id`, returning an authoritative `deleted_count` the FE refuses to flip on if zero.

## What shipped

### 1. `src/app/api/Xero/disconnect/route.ts` (NEW, 214 LOC)

- `export const dynamic = 'force-dynamic'`
- `POST` handler with the following flow:
  1. Cookie-session auth via `createRouteHandlerClient` → 401 anon
  2. JSON body parse wrapped in try/catch → 400 invalid JSON or missing `business_id`
  3. **Dual-ID resolution.** Tries input as `businesses.id` first, then as `business_profiles.id`. After locating the canonical business row, looks up the OTHER form (sibling profile or sibling canonical) so `idsToDelete` ends up with both forms. Critically does NOT short-circuit on the first hit (which is what `resolveXeroBusinessId` would do).
  4. RBAC: `business.owner_id === user.id || business.assigned_coach_id === user.id || super_admin` (mirrors `/api/Xero/reactivate`) → 403 otherwise
  5. `.from('xero_connections').delete().in('business_id', [bothIds]).select(...)` via service-role client
  6. `deleted_count === 0` → `success:false` with `error: 'nothing_to_delete'` (HTTP 200, soft failure)
  7. `deleted_count > 0` → `{ success: true, deleted_count, deleted_ids, deleted_rows }`
  8. DELETE error → 500 with `error: 'delete_failed', message: <pg-error>`

- **Inline comments cite:**
  - JDS 2026-05-05 incident as motivation
  - FK safety: `forecasts.xero_connection_id ON DELETE SET NULL` (`baseline_schema.sql:8785`)
  - Service-role rationale (single auditable path, explicit count, RLS independence)
  - **Plan-check F1:** `pending_xero_connections` is intentionally NOT touched (keyed by user_id, self-expires after 10 min)
  - **Plan-check F2:** Lookup is INTENTIONALLY more permissive than reactivate's

### 2. `src/app/integrations/page.tsx` (MODIFIED, +21/-8 LOC)

- `handleDisconnectXero` now `fetch('/api/Xero/disconnect', { method: 'POST', body: JSON.stringify({ business_id: businessId }) })`
- State only flips when `res.ok && data.success && (data.deleted_count ?? 0) > 0` — no optimistic flip
- Failed responses surface `data.message || data.error` via `alert()` and log full payload to console
- `await res.json().catch(() => ({}))` to harden against invalid responses
- `confirm()` prompt unchanged (out of scope)

### 3. `src/__tests__/xero/disconnect-route.test.ts` (NEW, 436 LOC)

10 vitest cases:

| # | Case | Asserts |
|---|------|---------|
| 1 | 401 unauthenticated | status 401, `mockAdminFrom.not.toHaveBeenCalled()` (plan-check F3) |
| 2 | 400 missing business_id | error matches /business_id is required/i |
| 3 | 404 unknown business | both lookups null → 404 |
| 4 | 403 non-owner non-coach non-superadmin | system_roles returns null role |
| 5 | Dual-ID delete from `businesses.id` | **load-bearing** — captures `.in()` args, asserts `Set([biz-1, profile-1])` |
| 6 | Dual-ID delete from `business_profiles.id` (coach caller) | captures `.in()` args, same set assertion |
| 7 | `deleted_count=0` soft-failure | success:false, error: 'nothing_to_delete', ids_checked populated |
| 8 | super_admin override | role lookup returns 'super_admin' → allowed |
| 9 | Single-ID delete (no profile mirror) | `.in()` called with `['biz-1']` (length 1) |
| 10 | DELETE error → 500 | error: 'delete_failed', message includes pg error |

Test harness uses `vi.mock` for `@/lib/supabase/server` and `@supabase/supabase-js` with chainable stub builders.

## RED → GREEN transition

| Stage | Result |
|-------|--------|
| Task 1 RED (commit `dd2d0b2`) | All 10 tests fail with import resolution error: `Failed to resolve import "@/app/api/Xero/disconnect/route"` (route file does not yet exist). Log: `/tmp/53-01-task1-red.log` |
| Task 2 GREEN (commits `6c45b4e`, `a70c573`) | All 10 tests PASS on first vitest run. Full Xero suite: 14 files / 126 tests GREEN — zero regressions. |

## Verification results

| Check | Result |
|-------|--------|
| `npx vitest run src/__tests__/xero/disconnect-route.test.ts` | 10/10 GREEN |
| `npx vitest run src/__tests__/xero/` (regression check) | 126/126 GREEN |
| `npx tsc --noEmit -p tsconfig.json` | Clean (zero errors) |
| `npx eslint src/app/api/Xero/disconnect/route.ts src/__tests__/xero/disconnect-route.test.ts` | Clean (zero warnings, zero errors) |
| `npx eslint src/app/integrations/page.tsx` | 1 warning (`react-hooks/exhaustive-deps` on line 35) — **pre-existing on HEAD; untouched by this PR** |
| FE no longer issues browser-side `.from('xero_connections').delete()` | Verified by grep: only `from('xero_connections')` reference left is the read query in `loadIntegrations` (line 66). |
| `git diff main --name-only` | Exactly 3 files: route, test, integrations page (plus 53-RESEARCH.md was restored to the worktree as a no-op since main already had it). |

## Deviations from Plan

**None of substance.** A few micro-decisions worth recording for posterity:

1. **`request.json()` parse error path.** Plan called for "wrap in try/catch, return 400". Implementation: caught error returns `{ error: 'Invalid JSON body' }` HTTP 400, distinct from the missing-`business_id` 400. Minor refinement; doesn't change the contract.

2. **`.json().catch(() => ({}))` on the FE.** Plan said "await `res.json()`" implicitly assuming a parseable body. I added a `.catch(() => ({}))` so a malformed response doesn't throw before the status-based branch — this hardens the FE against any future server change that might return non-JSON in error cases.

3. **Worktree had to import `53-RESEARCH.md` from main.** The plan was executed in a worktree that didn't have phase 53 docs checked out; I `git checkout main -- .planning/phases/53-xero-connection-durability/` to restore them. No content changes; this is purely worktree hygiene.

## Sentinel result (post-deploy verification — operator-driven)

The plan's Task 3 is a `checkpoint:human-verify` requiring operator action against a Vercel preview against JDS. Operator steps documented here for execution after PR #107 merges to a preview deploy:

### Step 0 — Capture baseline
Run in Supabase SQL editor (service role):
```sql
SELECT id, business_id, tenant_name, is_active, expires_at, updated_at
FROM xero_connections
WHERE business_id IN (
  SELECT id FROM businesses WHERE name ILIKE '%JDS%'
  UNION
  SELECT id FROM business_profiles WHERE business_id IN (SELECT id FROM businesses WHERE name ILIKE '%JDS%')
)
ORDER BY updated_at DESC;
```
Note row count and IDs. Expectation: ≥1 row.

### Step 1 — Deploy
`vercel deploy` (NOT `--prod`) the PR branch. Confirm preview URL.

### Step 2 — Smoke route shape
```bash
curl -X POST 'https://<preview>/api/Xero/disconnect' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <your supabase auth cookies>' \
  -d '{}' -i
```
Expected: HTTP 400 with `{"error":"business_id is required"}`. (No cookie → 401.)

### Step 3 — Disconnect via FE
Coach-acting-as-client view of JDS Integrations. Click Disconnect, watch Network tab.
Expected response:
```json
{
  "success": true,
  "deleted_count": <≥1>,
  "deleted_ids": ["<businesses.id-of-jds>", "<business_profiles.id-of-jds>"],
  "deleted_rows": [...]
}
```
`deleted_count` should match (or exceed) the Step 0 baseline.

### Step 4 — Confirm clean state
Re-run Step 0 SQL. Expected: 0 rows. If rows remain, route fix needed (do NOT approve).

### Step 5 — UI sanity
Integrations page shows disconnected with "Connect Xero" CTA visible.

### Step 6 — Reconnect smoke (optional)
Click Connect Xero, complete OAuth, confirm 1 fresh row + connected state.

### Step 7 — Negative path (RBAC)
As a user who is neither owner nor coach nor super_admin, POST to `/api/Xero/disconnect` with JDS's business_id. Expected: 403.

### Step 8 — deleted_count=0 path
After Step 4 (rows already deleted), click Disconnect again. Expected: alert "No Xero connections found...", UI does NOT incorrectly flip.

## Notes for Plans 53-02 / 53-03 / 53-05

- **53-02 (centralize token refresh):** The disconnect endpoint is now the canonical "remove a connection" path and does NOT involve token refresh. 53-02's centralization work has zero overlap here — leave this route alone.
- **53-03 (deactivation policy):** The disconnect path is HARD delete, distinct from the soft `is_active=false` deactivation that 53-03 governs. No interaction surface.
- **53-05 (observability):** Add a Sentry capture on the success path with `tags.invariant: 'xero_disconnect_dual_id_delete'` and `extra: { deleted_count, deleted_ids }`. The 0-row `nothing_to_delete` branch should also capture (likely as `Sentry.captureMessage` at level `warning`) — that's the signal that someone tried to disconnect a phantom connection, which is operationally interesting.

## PR

**URL:** https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/107
**Title:** feat(53-01): server-side Xero disconnect with dual-ID purge
**Base:** main
**Branch:** feat/53-01-server-disconnect-route
**Commits:**
- `dd2d0b2` — test(53-01): add failing tests for /api/Xero/disconnect route
- `6c45b4e` — feat(53-01): add server-side /api/Xero/disconnect with dual-ID delete
- `a70c573` — feat(53-01): rewire integrations disconnect to call new server route

## Self-Check: PASSED

- File `src/app/api/Xero/disconnect/route.ts` — FOUND
- File `src/__tests__/xero/disconnect-route.test.ts` — FOUND
- File `src/app/integrations/page.tsx` (modified) — FOUND
- Commit `dd2d0b2` (test RED) — FOUND in `git log`
- Commit `6c45b4e` (feat route) — FOUND in `git log`
- Commit `a70c573` (feat FE) — FOUND in `git log`
- All 10 vitest tests GREEN — verified by `npx vitest run src/__tests__/xero/disconnect-route.test.ts`
- 126 Xero suite tests GREEN (no regressions) — verified
- TypeScript clean — verified
- ESLint warnings ≤ HEAD — verified (1 pre-existing warning unchanged)
- PR #107 opened — verified via `gh pr create`
