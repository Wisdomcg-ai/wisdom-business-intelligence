# Phase 44.2 — Production Migration Runbook

Stepwise rollout protocol for the 44.2 reconciliation rebuild. **As of 2026-05-02, all forward steps are COMPLETE in production.** This runbook is preserved as:

1. The historical record of what shipped, in what order, with what verifications.
2. The protocol to follow if the same migration shape recurs (e.g. extending to a new tenant tier or repeating against a fresh Supabase environment).
3. A reference for the rollback recipes in `ROLLBACK-PROTOCOL.md` — every step has a documented reversal.

**For ongoing reconciliation health checks, use `scripts/verify-production-migration.ts` (06F Task 3).** That script runs the same gates this runbook used at cutover, against any tenant on demand.

## Stop-and-ask criteria (apply to every step)

- Any migration error → STOP, do not proceed; consult dev support.
- Any backfill script error → STOP, run the documented rollback for that step, investigate.
- `verify-production-migration.ts` exit code ≠ 0 for any tenant → STOP, set the relevant feature flag to false, triage.
- `sync_jobs` rows transitioning to `status='error'` for any tenant after a code deploy → STOP, set flag to false, investigate before promoting to next tier.

---

## Step 1 — 06A migration 000001 (additive: account_id + basis columns)

**Pre-condition**: Supabase preview branch green; PR #28 reviewed.

**Action**: Merge PR #28. Supabase auto-applies `supabase/migrations/20260430000001_xero_pl_lines_account_id_basis.sql` to production.

**Expected**: `xero_pl_lines` now has `account_id uuid NULL` + `basis text DEFAULT 'accruals'`.

**Verify**:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'xero_pl_lines' AND column_name IN ('account_id', 'basis')
ORDER BY column_name;
-- Expect: 2 rows (account_id uuid; basis text)
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 1.

**Risk**: Low — additive, no constraint changes.

---

## Step 2 — 06A migration 000002 (FK on business_id)

**Pre-condition**: Step 1 verified. Pre-flight DO-block in the migration catches FK violations atomically.

**Action**: Migration applies as part of PR #28 (sequenced after 000001).

**Expected**: `xero_pl_lines_business_id_fk` constraint exists on `xero_pl_lines.business_id → business_profiles(id) ON DELETE RESTRICT`.

**Verify**:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'xero_pl_lines'::regclass AND conname LIKE '%business_id%';
-- Expect: 1 row showing FK to business_profiles(id) ON DELETE RESTRICT
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 2.

**Risk**: Medium — FK fails atomically if any orphan exists. Pre-flight DO-block catches it.

---

## Step 3 — 06A backfill (account_code + account_id from /Accounts catalog)

**Pre-condition**: Steps 1-2 verified. Production env vars pulled locally (`vercel env pull .env.local`); confirmed `NEXT_PUBLIC_SUPABASE_URL` is the production URL.

**Action**:
```bash
# Always dry-run first.
npx tsx scripts/backfill-xero-accounts-catalog.ts --dry-run
# Inspect counts (tenants × accounts × xero_pl_lines rows). If sane:
npx tsx scripts/backfill-xero-accounts-catalog.ts
```

**Expected**: 0 tenant fetch failures. Every `xero_pl_lines` row gains a populated `account_id` and refreshed `account_code`.

**Verify**:
```sql
SELECT COUNT(*) AS rows_without_account_id
FROM xero_pl_lines
WHERE account_id IS NULL;
-- Expect: 0
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 3 (snapshot-restore).

**Risk**: Medium — mutates `account_code`. Backfill snapshots before-state; rollback restores.

**Stop if**: Tenant fetch fails (Xero rate-limit or token-refresh error) — investigate before re-running.

---

## Step 4 — 06A migration 000003 (constraint cutover, account_id NOT NULL)

**Pre-condition**: Step 3 verified; `account_id IS NOT NULL` for every row.

**Action**: Migration applies as part of PR #28.

**Expected**: Old `(business_id, tenant_id, account_code, period_month)` natural key dropped; new key on `(business_id, tenant_id, account_id, period_month)` created. `account_id` promoted to NOT NULL.

**Verify**:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'xero_pl_lines'::regclass
  AND conname = 'xero_pl_lines_natural_key_uniq';
-- Expect: definition includes account_id (not account_code)
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 4.

**Risk**: High — atomic constraint swap. Pre-flight DO-block catches NULL `account_id`.

---

## Step 5 — 06A migration 000004 (wide-compat view update)

**Pre-condition**: Step 4 verified.

**Action**: `CREATE OR REPLACE VIEW xero_pl_lines_wide_compat` applied via PR #28.

**Expected**: View aggregates per-account into `monthly_values jsonb` keyed by 'YYYY-MM'.

**Verify**:
```sql
SELECT COUNT(*) FROM xero_pl_lines_wide_compat WHERE monthly_values IS NULL;
-- Expect: 0
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 5.

**Risk**: Low — `CREATE OR REPLACE`; old definition can be re-applied.

---

## Step 6 — 06C migration 000010 (xero_bs_lines table)

**Pre-condition**: Steps 1-5 complete. PR #40 reviewed.

**Action**: Merge PR #40. Supabase applies migrations 000010 + 000011.

**Expected**: New `xero_bs_lines` table exists with same canonical-identity discipline as `xero_pl_lines` post-06A.

**Verify**:
```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'xero_bs_lines';
-- Expect: 1
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 6.

**Risk**: Low — net-new table.

---

## Step 7 — 06C migration 000011 (xero_bs_lines wide-compat view)

**Pre-condition**: Step 6 verified.

**Action**: View migration applies as part of PR #40.

**Expected**: `xero_bs_lines_wide_compat` view aggregates per-account into `balances_by_date jsonb` keyed by 'YYYY-MM-DD'. `security_invoker=on` honors caller RLS.

**Verify**:
```sql
SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'xero_bs_lines_wide_compat';
-- Expect: 1
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 7.

**Risk**: Low — `CREATE OR REPLACE`.

---

## Step 8 — Deploy 06B + 06D code (sync orchestrator changes)

**Pre-condition**: Steps 1-7 successful.

**Action**: Merge PR #29 (06B Path A orchestrator) → PR #41 (06D BS parser) → PR #42 (06D BS orchestrator) → PR #43 (06D.1 layout-wins hot-fix). Vercel deploys; cron picks up next scheduled run.

**Expected**: Next sync uses single-period queries for both PL and BS. `sync_jobs.reconciliation` populates with `pl: {...}, bs: {...}` sub-objects.

**Verify**:
```sql
SELECT started_at, status, reconciliation->'pl' AS pl_recon, reconciliation->'bs' AS bs_recon
FROM sync_jobs
WHERE business_id = '<canary tenant business_id>'
ORDER BY started_at DESC LIMIT 3;
-- Expect: post-deploy rows have pl + bs sub-objects, status='success'
```

**Rollback**: `ROLLBACK-PROTOCOL.md` § Step 8 (feature flag — defensive future addition).

**Risk**: High — live cron starts using new orchestrator immediately.

**Stop if**: Any `sync_jobs.status='error'` rows appear post-deploy.

---

## Step 9 — Verify against canary (JDS)

**Pre-condition**: Step 8 deployed; one full sync cycle has completed against JDS.

**Action**:
```bash
npx tsx scripts/verify-production-migration.ts \
  --business-id=900aa935-ae8c-4913-baf7-169260fa19ef \
  --tenant-id=0219d3a9-c1be-4fb8-a4d3-0710b3af715a \
  --balance-date=2026-04-30 \
  --fy-end=2026-06-30 \
  --fy-start-month-key=2025-07-01 \
  --allowlist=Rent
```

**Expected**: Exit code 0; "ALL 4 AUTOMATED GATES PASS" in stdout. Operator manually compares the 3 Gate-5 spot-check candidates against Xero web PDF.

**Verify** (manual, Gate 5):
- PL spot-check: top revenue account FY YTD == Xero P&L PDF (FY YTD)
- BS spot-check: top asset @ balance_date == Xero BS PDF (same date)
- TB spot-check: top debit account == Xero TB PDF (same date)
- Each delta should be 0 (or floating-point ±$0.01).

**Rollback**: If any gate fails, `ROLLBACK-PROTOCOL.md` § Step 8 (feature flag) — halt rollout.

**Verified result (2026-05-02)**: All 4 automated gates pass; max drift $0.00 across 11 single-period months (Rent allow-listed). 15 BS spot-checks match Xero web PDF to the cent (recorded in `RECONCILIATION-EVIDENCE.md`).

---

## Step 10 — Promote canary → Envisage

**Pre-condition**: Step 9 green.

**Action**:
```bash
npx tsx scripts/verify-production-migration.ts \
  --business-id=fa0a80e8-e58e-40aa-b34a-8db667d4b221 \
  --tenant-id=04d9df1f-53b0-4d1c-ba9e-4ce49b9c8860 \
  --balance-date=2026-04-30 \
  --fy-end=2026-06-30 \
  --fy-start-month-key=2025-07-01 \
  --include-inactive
```

**Expected**: Exit 0. (Note: Envisage's `xero_connections.is_active=false` — use `--include-inactive`.)

---

## Step 11 — Promote → IICT-HK (multi-currency)

**Pre-condition**: Step 10 green.

**Action**:
```bash
npx tsx scripts/verify-production-migration.ts \
  --business-id=6c0dfadb-4229-4fc2-89eb-ec064d24511b \
  --tenant-id=de943481-389d-4134-b0af-410f025f53c2 \
  --balance-date=2026-04-30 \
  --fy-end=2026-05-31 \
  --fy-start-month-key=2026-04-01 \
  --allowlist="Foreign Currency Gains and Losses"
```

**Expected**: Exit 0. Multi-currency tenant uses Apr 2026 (FY27 start). Allow-list FX revaluation per the documented Xero behavior in `reconciliation-gates.ts`.

**Verified result (2026-05-02)**: All 4 automated gates pass; max drift $0.00 (FX allow-listed). HKD-denominated; Net Assets $9,366,561.51 == Equity $9,366,561.51 (Δ $0.00).

---

## Step 12 — Final sign-off

Confirm:
- [x] All 3 reference tenants × 4 automated gates verified in production via `verify-production-migration.ts`.
- [x] 06E test harness (`xero-reconciliation-gates.test.ts`) green in CI on every commit.
- [x] `sync_jobs.reconciliation` populates `pl: + bs:` sub-objects for every sync.
- [x] No `sync_jobs.status='error'` rows tied to the new orchestrator.
- [ ] Manual Gate-5 evidence captured for all 3 tenants × 3 month-ends in `RECONCILIATION-EVIDENCE.md` (operator ongoing).

**Ongoing**: Run `verify-production-migration.ts` periodically (e.g. weekly via cron, or after any sync-orchestrator code change) for early regression detection. The script also serves as the single-tenant triage tool when a customer reports a reconciliation discrepancy.

---

## Future migrations of the same shape

If extending this rebuild to additional tenants or a fresh environment:

1. Apply migrations 000001 → 000004 (06A) in order.
2. Run `scripts/backfill-xero-accounts-catalog.ts --dry-run` then live.
3. Apply migrations 000010 → 000011 (06C).
4. Deploy 06B/06D orchestrator code.
5. Run `verify-production-migration.ts` against each tenant.
6. Capture Gate-5 manual evidence per tenant.

The canary protocol (small AU tenant first, then medium AU, then multi-currency) limits blast radius of any unexpected behavior.
