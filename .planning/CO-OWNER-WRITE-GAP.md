# The co-owner write gap — `auth_can_manage_business` excludes `role = 'owner'`

**Status: PROPOSAL. Nothing here has been applied. The decision is Matt's.**
Found 16 Sep 2026 during the `verifyBusinessAccess` caller audit (PR #545, D3/F1).

---

## 1. The gap in one paragraph

`auth_can_manage_business()` — the predicate behind the `WITH CHECK` half of
~48 RLS policies — admits a `business_users` member only when

```sql
status = 'active' AND role IN ('admin', 'member')
```

`business_users.role` allows four values (`owner` / `admin` / `member` /
`viewer`) and **DEFAULTS to `'owner'`**. The READ counterpart,
`auth_get_accessible_business_ids()`, admits **any** active role. So a member
whose role is `'owner'` — and who is not also `businesses.owner_id` — can see
everything and write nothing through an RLS-bound client.

| | reads (`auth_get_accessible_business_ids`) | writes (`auth_can_manage_business`) |
|---|---|---|
| `owner` (co-owner, not `businesses.owner_id`) | ✅ | ❌ |
| `admin` | ✅ | ✅ |
| `member` | ✅ | ✅ |
| `viewer` | ✅ | ❌ (intended) |

---

## 2. Why this looks like an oversight, not a policy

Four independent pieces of the system treat `'owner'` as the **highest**
business-level role, and only the RLS predicate disagrees.

1. **Three admin/coach UIs offer it as an invite role, labelled "Full access":**
   - `src/app/admin/clients/page.tsx:1109` — `Owner/Partner - Full access, can manage billing`
   - `src/app/admin/clients/new/page.tsx:375` — `Owner/Partner - Full access`
   - `src/components/coach/tabs/TeamTab.tsx:473`, `:732` — `Owner/Partner`

2. **Every client-creation route writes `role: 'owner'`** for the principal user
   — `src/app/api/coach/clients/route.ts:208`,
   `src/app/api/admin/clients/route.ts:307`,
   `src/app/api/admin/demo-client/route.ts:235`, and a self-upsert at
   `src/app/settings/team/page.tsx:291`. It is the canonical primary role.

3. **The column DEFAULTs to `'owner'`** — any insert that omits `role` lands in
   the excluded set.

4. **The app's own permission model ranks owner above member:**
   `src/app/api/team/invite/route.ts:107` —
   `isBusinessAdmin = role === 'owner' || role === 'admin'`, i.e. a co-owner may
   *invite team members* per the app while being unable to write a single row
   per the database. The client-facing team page goes further and refuses to
   demote them (`disabled={member.role === 'owner'}`,
   `src/app/settings/team/page.tsx:612`).

The function's baseline COMMENT — *"Check if current user can manage (edit) the
specified business. Viewers excluded."* — names **viewers** as the intended
exclusion. Nothing anywhere names owners. (That baseline comment was overwritten
by the R20 bridge migration; the live comment now reads "…so admin/member team
members can WRITE…", which restates the exclusion without ever justifying it.)

---

## 3. Who it affects today: nobody

Prod, 16 Sep 2026 — `business_users` active rows:

| role | rows |
|---|---|
| `owner` | 27 |
| `member` | 4 |
| `admin` | 3 |

Of the 27 `owner` rows, **24 are also `businesses.owner_id`** and therefore pass
via a different branch of the predicate. The 3 genuine co-owners are:

| business | member since | last sign-in | Xero connected | data |
|---|---|---|---|---|
| Cronulla Pools | 10 Dec 2025 | **never** | no | none |
| First Logistics | 16 Dec 2025 | 17 Dec 2025 (once) | no | none |
| GMS Digital | 19 Dec 2025 | **never** | no | none |

None is a coach, super-admin, or `business_profiles` owner, so none has an
alternate branch. All three businesses have zero todos, zero quarterly reviews,
and no active Xero connection.

**Sentry: 0 `42501` / "violates row-level security" events in 90 days, and 0
`xero_token_persist_failed`.** That silence is explained by the table above, not
by the gap being benign — the affected users have never used the product.

---

## 4. What it would block the day a co-owner does log in

Nearly the whole client-facing app writes straight from the browser through RLS.
Gated tables × browser write sites:

- **123 write sites across 25 gated tables** in total
- **102 of them across 24 tables** on client-facing surfaces (excluding
  `coach/` and `admin/`)

The heaviest: `quarterly_reviews` (32), `messages` (6), `financial_forecasts`
(6), `issues_list` (6), `business_profiles` (6), `todo_items` (5), `open_loops`
(5), `session_notes` (4), `weekly_reviews` (4), the four `stop_doing_*` tables
(11), `operational_activities` (3), `weekly_metrics_snapshots` (3),
`vision_targets` (2), `team_data` (2), then one apiece on `goals`,
`action_items`, `marketing_data`, `ai_cfo_conversations`, `stage_transitions`,
`audit_log` and `xero_connections`.

A co-owner invited onto a real client would find an app that renders every
number and saves nothing.

---

## 5. Proposed migration (NOT applied)

Adds `'owner'` to both member branches. Deliberately leaves `'viewer'` out — the
UI labels viewer "Read-only access" and the baseline comment names viewers as
the intended exclusion.

```sql
-- ============================================================================
-- auth_can_manage_business — admit role = 'owner' to the team-member branches.
-- ============================================================================
-- business_users.role allows owner/admin/member/viewer and DEFAULTS to 'owner'.
-- Both member branches of this predicate admitted only ('admin','member'), so a
-- co-owner — an active business_users row with role='owner' who is NOT
-- businesses.owner_id — passed the READ helper
-- (auth_get_accessible_business_ids admits any active role) and failed the
-- WRITE half of every rls_access policy. That is ~48 tables, and 102
-- client-facing browser write sites across 24 of them.
--
-- 'owner' is the system's own primary role: /api/coach/clients,
-- /api/admin/clients and /api/admin/demo-client all stamp role:'owner' on the
-- principal user, three admin/coach UIs offer it as "Owner/Partner - Full
-- access", and team/invite treats it as >= admin (isBusinessAdmin). Excluding
-- it here was an oversight; the baseline COMMENT names VIEWERS as the intended
-- exclusion and viewers stay excluded.
--
-- No ACL change: CREATE OR REPLACE preserves the existing grants (PUBLIC/anon/
-- authenticated/service_role EXECUTE — this is an RLS predicate helper, so
-- `authenticated` genuinely needs EXECUTE). Re-issuing revokes is only required
-- after DROP+CREATE, which this is not.
--
-- No service_role bypass is needed inside the function: service_role bypasses
-- RLS entirely, so this predicate is never evaluated for it.
--
-- Idempotent. Keeps every other branch of the R21 definition verbatim.
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."auth_can_manage_business"("check_business_id" "uuid")
  RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id AND user_id = auth.uid() AND status = 'active'
        AND role IN ('owner', 'admin', 'member')
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles WHERE id = check_business_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id = check_business_id AND (b.assigned_coach_id = auth.uid() OR b.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bu.business_id = bp.business_id
      WHERE bp.id = check_business_id AND bu.user_id = auth.uid() AND bu.status = 'active'
        AND bu.role IN ('owner', 'admin', 'member')
    );
$function$;

COMMENT ON FUNCTION "public"."auth_can_manage_business"("check_business_id" "uuid") IS
  'Check if current user can manage (edit) the specified business. Accepts both businesses.id and business_profiles.id. Active team members with role owner/admin/member may WRITE (mirrors the auth_get_accessible_business_ids bridges, including when the row uses business_profiles.id). VIEWERS EXCLUDED — that is the only intended exclusion.';
```

### Blast radius of approving it

Exactly 3 users gain write access, on 3 businesses with no Xero connection and
no data, to the set of tables the app already shows them. It does not widen
anything for viewers, anon, or cross-business access — every branch still keys
on `auth.uid()` and the supplied business id.

### CI

Passes `scripts/ci/check-migration-security.mjs`: no new `anon`/`PUBLIC` grant
(rule A), `SECURITY DEFINER` + `SET search_path TO ''` (rule B), no new table
(rule C).

### If approved

1. Add the SQL as `supabase/migrations/<timestamp>_auth_can_manage_business_admit_owner_role.sql`.
2. PR → CI green → squash-merge.
3. Apply to prod by hand (MCP `apply_migration`) per CLAUDE.md — the auto-apply
   pipeline is broken — then make the ledger row's version match the repo
   filename. Never `db push`.

---

## 6. Related, NOT included — two separate decisions

**(a) `auth_can_manage_team` has the same shape.** It admits `role = 'admin'`
only, while `team/invite/route.ts:107` and `settings/team/page.tsx:514` both
treat `'owner'` as able to manage the team. The app flow survives because
`/api/team/invite` and `/api/team/remove-member` write with the service-role
client; only direct browser writes to `business_users`
(`settings/team/page.tsx:448`, `:500`) would fail. Left alone here — widening
who can change team membership is a bigger call than widening who can save their
own business's data.

**(b) The function's ACL.** `auth_can_manage_business` currently grants EXECUTE
to `PUBLIC`, `anon`, `authenticated` and `service_role`. The Aug 2026 revoke
sweep targeted write RPCs and left predicate helpers alone. `authenticated`
genuinely needs EXECUTE for RLS evaluation; `anon`/`PUBLIC` probably do not.
Tightening it is a separate change with its own risk, so this proposal
deliberately does not touch the ACL.
