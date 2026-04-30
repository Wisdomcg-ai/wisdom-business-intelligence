# Phase 44.2-06A In-Flight Notes (resume context)

**Created:** 2026-04-30 mid-execution
**Reason:** Capturing state before the conversation context window fills.

## Where we are

Plan 44.2-06A is mid-Task 4 (the human-action checkpoint). PR #26 merged.
Migrations 000001 + 000002 applied to production (manually via SQL Editor —
auto-deploy gap noted below). Backfill script ran with patches applied.

### Confirmed state on production

- Migrations 000001 (account_id + basis + notes columns) and 000002 (FK to
  business_profiles) are live on production Supabase.
- 3,658 xero_pl_lines rows had their `business_id` backfilled from
  `businesses.id` → `business_profiles.id` (via in-session manual SQL — the
  4 affected businesses were Efficient Living, Dragon Roofing, Envisage,
  IICT Group). Wrapped in `BEGIN; ... COMMIT;` and verified 0 orphans
  remained. FK constraint `xero_pl_lines_business_id_fk` then landed cleanly.
- Backfill script `scripts/backfill-xero-accounts-catalog.ts` was patched
  in 2 places (uncommitted as of pause):
    1. **Dual-ID resolution** — `backfillAccountIds` and `repurposeAccountCodes`
       now use `resolveBusinessIds()` and `.in('business_id', ids.all)`
       instead of `.eq('business_id', businessId)`. Without this they found
       0 rows because `xero_connections.business_id` holds `businesses.id`
       for legacy tenants while `xero_pl_lines.business_id` is `profile.id`.
    2. **Pagination** — both functions now `.range()` loop with PAGE_SIZE=1000
       to avoid PostgREST 1000-row cap. Before this, Efficient Living showed
       suspiciously round 1000 rows; after, it correctly processed 1839.
- Live backfill output (post-patch):
    - 4,817 rows had account_id populated (3,009 SYNTH-AID via uuid-v5 from
      account_name, 1,808 with real Xero AccountID GUIDs)
    - 1,808 rows had account_code repurposed with real Xero Codes (200/300)
    - All 10 active xero_connections processed without error
- xero_accounts catalog populated for all 10 active tenants (1,378 accounts).

### Open issue at pause point

**Q1 verification returned 1639 — meaning 1,639 rows still have
`account_id IS NULL` after the live backfill.** These are likely rows for
inactive xero_connections tenants OR rows for tenants with no
xero_connections row at all (orphan tenant data).

Diagnostic query was sent to Matt; awaiting output:

```sql
SELECT
  xpl.tenant_id,
  count(*) AS null_rows,
  CASE
    WHEN EXISTS (SELECT 1 FROM xero_connections xc
                 WHERE xc.tenant_id = xpl.tenant_id AND xc.is_active = true)
    THEN 'has_active_conn'
    WHEN EXISTS (SELECT 1 FROM xero_connections xc
                 WHERE xc.tenant_id = xpl.tenant_id AND xc.is_active = false)
    THEN 'has_inactive_conn'
    ELSE 'no_conn'
  END AS conn_status
FROM xero_pl_lines xpl
WHERE xpl.account_id IS NULL
GROUP BY xpl.tenant_id, conn_status
ORDER BY null_rows DESC;
```

## Resume protocol (next session)

1. **Read this file first** to understand state.
2. **Get Matt's diagnostic-query output** (the SQL above).
3. **Decide remediation** based on conn_status breakdown:
    - `has_inactive_conn` rows: re-run script with `--include-inactive` flag
      (the flag exists in capture-xero-fixture.ts pattern; add to backfill
      script if missing — currently the script hardcodes `.eq('is_active', true)`
      at line 490).
    - `no_conn` rows: direct SQL backfill via uuid-v5 SYNTH-AID. Same seed
      pattern: `${business_id}|${tenant_id}|${account_name}` →
      `uuidv5(seed, '7e1f0b4a-9c2c-4f87-a4cb-5c3e9d8a6b15')`. Set
      `notes='SYNTH-AID: orphan-tenant cleanup, no xero_connections row at
      backfill time'`.
    - `has_active_conn` rows: shouldn't exist if the script ran successfully.
      If any present → script bug, investigate.
4. **After 0 NULL rows confirmed**: commit the script patch
   (`fix(44.2-06A): dual-ID resolution + pagination in backfill script`),
   plus any cleanup migration (e.g. for orphan rows). Push, open PR-A.5
   (script patch only) OR fold into PR-B.
5. **Then proceed to Tasks 5-7 of 06A**:
    - Migration 20260430000003 (constraint cutover + account_id NOT NULL)
    - Migration 20260430000004 (wide-compat view v2)
    - Verification test src/__tests__/migrations/06A-account-id-migration.test.ts
    - SUMMARY.md
    - Open PR-B with all of these
6. **After PR-B merges**: 06A is done. Move to 06B (sync orchestrator rebuild).

## Architectural debt surfaced (out of scope for 06A; capture for follow-up)

- **xero_connections.business_id holds businesses.id for the legacy tenants**
  (Efficient Living, Dragon Roofing, Envisage, IICT Group, EASY HAIL CLAIM,
  IICT Group Limited × 2, IICT (Aust) × 2, IICT Group Pty Ltd × 2 — total
  10/10 active connections). Same dual-ID drift. Worth a follow-up plan to
  backfill xero_connections.business_id → profile_id for consistency. NOT
  in 06A scope.
- **Supabase migrations don't auto-apply to production from main merges.**
  PR #26 merged but migrations didn't apply until I ran them via SQL Editor.
  PR #23's earlier sync_jobs migration may have the same gap. Affects
  ALL future migrations (06B, 06D, etc.). Add to backlog as a separate
  Vercel/Supabase deploy infrastructure phase.
- **3,009 SYNTH-AID rows exist** because old syncs didn't capture Xero
  AccountID. These rows have account_id (synthetic) but their account_code
  remained the original `_SYNTH_NAME:` value (the script's "unchanged"
  count). After 06B rebuilds the sync orchestrator with proper AccountID
  capture, a one-time forced re-sync of the 4 affected tenants will
  overwrite these rows with real GUID-keyed data. Should be documented in
  06B SUMMARY as a known migration tail.

## Files in tree (uncommitted)

- `scripts/backfill-xero-accounts-catalog.ts` — patched (dual-ID + pagination)
- This file (`06A-IN-FLIGHT-NOTES.md`)

Branch: `feat/44.2-06A-schema` (3 commits pushed via PR #26 already merged;
new uncommitted patch sitting on the branch locally).

## Quick resume commands

```bash
# Confirm state
cd /Users/mattmalouf/Desktop/business-coaching-platform
git status
git log --oneline -5

# Re-pull prod env if expired
vercel env pull .env.local --environment=production --yes

# Re-run dry-run if needed
npx tsx scripts/backfill-xero-accounts-catalog.ts --dry-run

# Live backfill (idempotent; safe to re-run)
npx tsx scripts/backfill-xero-accounts-catalog.ts
```

## Sign-off

The hard mechanical work is done — schema is mostly in place, catalog is
populated, ~74% of rows have account_id. Remaining 26% is split across
legacy/orphan tenant data and is reachable via the diagnostic above.

When complete, 06B can begin: per-month single-period query rewrite of
the sync orchestrator. That's the actual fix that makes JDS YTD-Mar
match Xero web to the cent.
