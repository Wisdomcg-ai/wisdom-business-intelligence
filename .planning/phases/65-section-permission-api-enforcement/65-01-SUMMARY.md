---
phase: 65-section-permission-api-enforcement
plan: "01"
subsystem: permissions
tags: [security, permissions, section-gating, api-enforcement]
dependency_graph:
  requires: []
  provides: [requireSectionPermission-helper, SectionPermissionVerdict-type]
  affects: [src/lib/permissions, wave-2-route-wiring]
tech_stack:
  added: []
  patterns: [chainable-supabase-mock, tdd-red-green, short-circuit-allow-logic]
key_files:
  created:
    - src/lib/permissions/requireSectionPermission.ts
    - src/lib/permissions/__tests__/requireSectionPermission.test.ts
    - .planning/phases/65-section-permission-api-enforcement/65-01-SECTION-KEY-VERIFICATION.md
  modified: []
decisions:
  - "Section-key canonical spelling is finances (not financials): DB default JSONB uses legacy financials but every TS write path and every UI read path uses finances"
  - "Missing section_permissions key treated as true (least-surprise default): rows predating a key still get access until explicitly denied"
  - "Helper receives auth-bound supabase client (no createServiceRoleClient): queries flow through RLS as required by CONTEXT.md policy"
  - "Short-circuit order: owner → coach → admin → super_admin → active-member-permission"
  - "DB errors are thrown (not swallowed as not_a_member): caller owns error handling"
metrics:
  duration: "4 minutes"
  completed_date: "2026-05-15"
  tasks_completed: 2
  files_changed: 3
requirements:
  - SEC-PERM-01
  - SEC-PERM-02
---

# Phase 65 Plan 01: requireSectionPermission helper + unit tests Summary

**One-liner:** Auth-bound section-permission verdict helper using short-circuit owner/coach/admin/super_admin/member logic, with canonical `finances` key locked by grep evidence and pinned by a regression-breaking spelling-guard test.

## Final Helper Signature

```ts
export type SectionPermissionVerdict =
  | { allow: true; reason: 'owner' | 'admin' | 'coach' | 'super_admin' | 'permission_granted' }
  | { allow: false; reason: 'permission_denied' | 'not_a_member'; sectionKey: string }

export async function requireSectionPermission(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  sectionKey: 'finances' | string,
): Promise<SectionPermissionVerdict>
```

## Allow / Deny Reasons Supported

| Verdict | Reason | Condition |
|---------|--------|-----------|
| allow | `owner` | user is `businesses.owner_id` |
| allow | `coach` | user is `businesses.assigned_coach_id` |
| allow | `admin` | `business_users.role='admin'` + `status='active'` |
| allow | `super_admin` | `system_roles.role='super_admin'` row exists |
| allow | `permission_granted` | `business_users` active member; `section_permissions[key]` is true or missing |
| deny | `permission_denied` | `business_users` active member; `section_permissions[key] === false` |
| deny | `not_a_member` | no matching owner/coach/admin/super_admin/active-member path |

## Vitest Run Output

```
Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  15:45:38
   Duration  509ms (transform 20ms, setup 48ms, import 16ms, tests 3ms, environment 378ms)
```

All 11 tests pass including:
- Test 1: allow — owner
- Test 2: allow — admin (active)
- Test 3: allow — coach (assigned_coach_id)
- Test 4: allow — super_admin (system_roles row)
- Test 5: allow — permission_granted (finances=true)
- Test 6: allow — missing-key default (no finances key in JSONB → true)
- Test 7: deny — permission_denied (finances=false)
- Test 8: deny — not_a_member (no business_users row)
- Test 9: deny — not_a_member (status=pending)
- Test 10: deny — not_a_member (status=inactive)
- Test 11: canonical spelling guard (financials=false → finances key missing → allow)

## Section-Key Verification

Performed. Canonical spelling: **`finances`** (not `financials`).

Evidence from grep:
1. DB `business_users` DEFAULT JSONB (line 1929): uses legacy `financials` — stale default, no TS read path consumes this key
2. `auth_get_section_permissions` Postgres function: already uses `finances` in its hard-coded fallback JSONB
3. `src/lib/permissions/index.ts` `DEFAULT_MEMBER_PERMISSIONS`: `finances: false` — every team invite uses this shape
4. `SECTION_PERMISSION_MAP`: 'FINANCES', 'Financial Forecast', 'Budget vs Actual', '13-Week Rolling Cashflow' all → `'finances'`
5. `src/app/settings/team/page.tsx` `SectionPermissions` type: `finances: boolean`

The stale DB default (`financials`) is never read by any TS permission check — rows created via raw SQL with no `finances` key are covered by the "missing key → allow" rule.

## Deviations from Plan

None. Plan executed exactly as written.

- Helper implements the locked signature from CONTEXT.md decisions
- No `createServiceRoleClient` calls (grep confirms 0 occurrences)
- Short-circuit order matches plan specification
- Test 11 includes verbatim assertion from plan specification
- Zero route files touched (verified via `git diff --stat HEAD~2..HEAD -- src/app/api`)
- All 11 test behaviors from `<behavior>` block covered

## Known Stubs

None. This plan is pure library code with no UI or data integration. Helper ships with no behavior change in production — route wiring is Wave 2 (Plan 65-02).

## Commits

| Hash | Message |
|------|---------|
| 2fa956a4 | docs(65-01): verify section-key spelling — finances is canonical |
| af384aeb | feat(65-01): add requireSectionPermission helper + unit tests |

## Self-Check: PASSED

All artifacts verified:
- FOUND: src/lib/permissions/requireSectionPermission.ts
- FOUND: src/lib/permissions/__tests__/requireSectionPermission.test.ts
- FOUND: .planning/phases/65-section-permission-api-enforcement/65-01-SECTION-KEY-VERIFICATION.md
- FOUND commit: 2fa956a4 (docs)
- FOUND commit: af384aeb (feat)
