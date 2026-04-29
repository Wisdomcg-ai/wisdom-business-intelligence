# sync_jobs.tenant_id Audit (Phase 44.2-01)

**Run date:** 2026-04-29
**Script:** `scripts/diag-sync-jobs-tenant-id.ts`
**Decision authority:** D-44.2-05 (audit, then add `NOT NULL` constraint in plan 44.2-02)

## Counts

- Total sync_jobs rows: **20**
- NULL tenant_id: **20 (100.0%)**
- Empty-string tenant_id: 0 (0.0%)
- Populated tenant_id: 0 (0.0%)

**Read:** every row written since the `sync_jobs` table was introduced (Phase 44 Sub-A) is missing the tenant attribution. The orchestrator at `src/lib/xero/sync-orchestrator.ts:421` records the row before iterating tenants, then never updates it with the tenant it actually synced. This is the D-44.2-05 multi-tenant audit gap, exactly as predicted in 44.2-CONTEXT.md.

## Per-business NULL breakdown

```
business_id                               total   null  latest_null_at                       latest_non_null_at
900aa935-ae8c-4913-baf7-169260fa19ef         16     16  2026-04-28T22:46:53.963312+00:00     (none)
fa0a80e8-e58e-40aa-b34a-8db667d4b221          4      4  2026-04-27T22:46:12.494201+00:00     (none)
```

Resolved business identities (cross-referenced with `business_profiles` 2026-04-29):

| business_id (sync_jobs) | business_profiles.business_name | businesses.id (canonical) | tenant_id (only) | tenant_name |
|---|---|---|---|---|
| `900aa935-ae8c-4913-baf7-169260fa19ef` | Just Digital Signage | `fea253dd-3dfa-447b-8f9b-8dff68aeac0a` | `0219d3a9-c1be-4fb8-a4d3-0710b3af715a` | Aeris Solutions Pty Ltd |
| `fa0a80e8-e58e-40aa-b34a-8db667d4b221` | Envisage Australia Pty Ltd | `8c8c63b2-bdc4-4115-9375-8d0fd89acc00` | `04d9df1f-53b0-4d1c-ba9e-4ce49b9c8860` | Malouf Family Trust |

**Both `business_id` values stored on `sync_jobs` are `business_profiles.id`** (not `businesses.id`). The dual-ID system is in play — the migration prologue MUST handle that.

## Backfill recommendation

- **Backfill-able (single tenant in xero_connections):** **20 rows across 2 businesses (100%)** — set `tenant_id` from the matching `xero_connections` row resolved via the business_profiles bridge.
- Prune-able (zero connections): 0 rows.
- Ambiguous (multi-tenant consolidated entities): 0 rows.

The audit script categorised both businesses as BACKFILL CANDIDATE because each has exactly one distinct tenant in `xero_connections` (Aeris Solutions for JDS, Malouf Family Trust for Envisage). The connection rows are currently `is_active=false`, but that's a transient flag flipped by the orchestrator during sync runs — the row's existence (and the encrypted token blob it carries) is the authoritative signal for tenant attribution.

## Decision for migration 44.2-02

Decision rule application:
- ✅ Backfill-able count is **100%** (≥ 90% threshold).
- ✅ Ambiguous count is **0**.
- ✅ Prune-able count is **0** (no DELETE required → no user approval gate).

**Selected:** **Path A — Backfill-then-NOT-NULL.**

Rationale: every NULL row maps unambiguously to a single tenant. Empty-string default (Path C) would discard recoverable audit history; pruning (Path B) would discard 20 rows of valid sync history (including the most recent JDS sync at 2026-04-28T22:46:53, which is the run that surfaced the $359K reconciliation gap driving Phase 44.2). Path A preserves all history with full tenant attribution.

## Migration prologue SQL (verbatim, for use in 44.2-02)

```sql
-- Path A — Backfill-then-NOT-NULL.
--
-- Dual-ID join: sync_jobs.business_id may be businesses.id OR
-- business_profiles.id; xero_connections.business_id likewise. Resolve via
-- the business_profiles bridge.
--
-- No xc.is_active filter — xero_connections.is_active flips transiently
-- during sync runs; the row's existence is what matters for tenant attribution.

UPDATE sync_jobs sj
   SET tenant_id = xc.tenant_id
  FROM xero_connections xc
  LEFT JOIN business_profiles bp
    ON bp.id = xc.business_id OR bp.business_id = xc.business_id
 WHERE sj.tenant_id IS NULL
   AND (
     xc.business_id = sj.business_id
     OR bp.id = sj.business_id
     OR bp.business_id = sj.business_id
   );

-- After backfill, before adding NOT NULL: assert no NULLs remain.
-- (Plan 44.2-02 should run this as a guard so the migration fails loud
-- rather than swallowing edge cases that emerge between audit and apply.)
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM sync_jobs WHERE tenant_id IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'sync_jobs backfill incomplete: % NULL rows remain', remaining;
  END IF;
END$$;

-- Then enforce the constraint.
ALTER TABLE sync_jobs ALTER COLUMN tenant_id SET NOT NULL;

-- Update the schema comment to reflect the new contract.
COMMENT ON COLUMN sync_jobs.tenant_id IS
  'Phase 44.2-02: NOT NULL. Every sync writes one sync_jobs row PER TENANT (backfilled 2026-04-29 from xero_connections via dual-ID bridge).';
```

## Notes for plan 44.2-02

1. **Orchestrator change is REQUIRED alongside the constraint.** Without changes to `src/lib/xero/sync-orchestrator.ts:421`, every new sync will violate the new NOT NULL constraint on insert. Plan 44.2-02 must move the `sync_jobs` insert inside the per-tenant loop (or add a tenant_id parameter to the existing insert path) so every row gets attribution. Suggest a single sync_jobs row PER (business_id, tenant_id, started_at) — that aligns with D-44.2-04's per-tenant first-class principle.

2. **Idempotency.** The backfill `UPDATE` is idempotent: re-running matches no NULL rows after the first apply. Safe to include in a Supabase migration that may be replayed in dev/staging.

3. **No dev/staging differential.** The 20 NULL rows are from production-equivalent activity (real Xero tokens, real tenants). Apply the same migration verbatim in both.

4. **Index review.** `sync_jobs_business_started_idx ON (business_id, started_at DESC)` already exists. After 44.2-02, plans 44.2-03/04/05 will likely add `(business_id, tenant_id, started_at DESC)` for the per-tenant data-quality lookup; that's NOT part of 44.2-02.
