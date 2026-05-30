# Orphan ID Remediation — First Real Dual-ID Fix

**Status:** DIAGNOSIS / PLAN ONLY — no code or data has been changed by this document.
**Created:** 2026-05-31
**Scope:** The 3 distinct "orphan" `business_id` values found in the frozen read-only
baseline (`baselines/dual-id-baseline-20260531-0728.txt`). This is deliberately the
*smallest possible* real remediation — a low-stakes target to exercise the full
SAFE-ROLLOUT-RUNBOOK before touching anything bigger.

> Client UUIDs are **not** written into this tracked document. The literal IDs live
> only in the gitignored `baselines/` snapshot. Here they are referenced by handle
> (ORPHAN-A / ORPHAN-B / ORPHAN-C).

---

## TL;DR (plain English)

Three records in your database point at a "business" that no longer resolves to
either ID system (`businesses.id` **or** `business_profiles.id`). They're dangling.
One of them (**ORPHAN-A**) is dangling in *two* tables, which suggests a single
deleted-or-mis-keyed entity rather than three unrelated glitches.

For each one we will:
1. **Look, don't touch** — count the exact rows and save a full copy first.
2. **Classify** — is it fixable (re-point it at the right business), genuinely dead
   (safe to archive + remove), or unclear (leave alone, ask Matt)?
3. **Apply** a tightly-scoped change *only* if classification is confident.
4. **Verify** with the existing audit + reconciliation scripts and a visual app check.
5. **Roll back** in one command if anything looks off — every change is pre-imaged.

Nothing here removes the dual-ID system or touches the ~30 "wrong-space-but-readable"
rows. That's a separate, larger job (see *Out of Scope* below).

---

## What the baseline actually shows

| Table | `business_id` type | Expected space | BIZ | PROFILE | ORPHAN | Orphan handle |
|---|---|---|---|---|---|---|
| `business_kpis` | `text` | BIZ | 7 | 9 | 1 | **ORPHAN-A** |
| `financial_forecasts` | `uuid` | PROFILE | 8 | 11 | 2 | **ORPHAN-B**, **ORPHAN-C** |
| `business_financial_goals` | `text` | PROFILE | 1 | 14 | 1 | **ORPHAN-A** (same as kpis) |

- **3 distinct orphan IDs.** ORPHAN-A appears in two tables; ORPHAN-B and ORPHAN-C
  are unique to `financial_forecasts`.
- The counts above are **distinct IDs**, not physical rows. The exact row count behind
  each orphan is the first thing Step 0 measures.
- "ORPHAN" = the `business_id` value matches neither the 27 `businesses.id` nor the
  27 `business_profiles.id` (the two sets are disjoint, so classification is unambiguous).

---

## The recovery keys (why most of this is reversible, not destructive)

Each affected table carries a *second* identifier we can use to recover the correct
owner instead of guessing or deleting:

| Table | Recovery column(s) | How it recovers the real business |
|---|---|---|
| `business_kpis` | `business_profile_id uuid` | If populated → join `business_profiles` → its `business_id` gives the canonical `businesses.id`. |
| `financial_forecasts` | `xero_connection_id uuid`, `tenant_id` | `xero_connections` is 100% BIZ-consistent (12 rows). A forecast's `xero_connection_id` → `xero_connections.business_id` recovers the owner. |
| `business_financial_goals` | `user_id uuid` | Weakest key — a user can own multiple businesses, so this *suggests* but does not *prove* the owner. Likely needs Matt's confirmation. |

This is why the default disposition is **remap**, not **delete**.

---

## The special case: ORPHAN-A (appears twice)

ORPHAN-A is dangling in both `business_kpis` and `business_financial_goals`. Before any
change, classify which of these it is — the choice drives everything downstream:

1. **Deleted parent** — a business/profile was removed and these child rows were left
   behind. → archive + delete, or remap if the successor business is known.
2. **User-auth ID pollution** (the `_text` / "C-32" class of bug) — someone wrote
   `auth.uid()` where a `business_id` belonged. → this is the case the `_text` RLS
   helper currently masks; **cleanse here, do not remove the mask yet** (see Ordering).
3. **Legacy pre-split ID** — an ID from before the dual-ID split that was never migrated.

The Step-1 SQL below tells these apart by checking whether ORPHAN-A exists in
`auth.users` (→ pollution) versus any soft-deleted/audit trail (→ deleted parent).

---

## The per-orphan playbook

Run this **once per distinct orphan ID** (ORPHAN-A, then -B, then -C).

### Step 0 — Scope + backup (READ-ONLY)
- Count exact rows and dump `SELECT *` of every affected row to a timestamped file
  under `baselines/` (gitignored). **This dump is the rollback source of truth.**
- Capture `created_at` / `updated_at` / `last_updated` to judge live-vs-stale.

```sql
-- :orphan is supplied from the gitignored baseline; do not paste UUIDs into tracked files.
-- business_kpis / business_financial_goals use text business_id; financial_forecasts uses uuid.
SELECT count(*) AS row_count, min(created_at), max(coalesce(updated_at, created_at))
FROM public.business_kpis WHERE business_id = :orphan;

-- Full pre-image (redirect to baselines/orphan-A-business_kpis-<ts>.json):
SELECT * FROM public.business_kpis WHERE business_id = :orphan;
```

### Step 1 — Classify (READ-ONLY)
Resolve `:orphan` against every relevant set. Exactly one disposition results.

```sql
-- Is it auth-id pollution?
SELECT 'auth.users' AS hit, id::text FROM auth.users WHERE id::text = :orphan
UNION ALL
SELECT 'businesses', id::text FROM public.businesses WHERE id::text = :orphan
UNION ALL
SELECT 'business_profiles', id::text FROM public.business_profiles WHERE id::text = :orphan;

-- Recovery via business_kpis.business_profile_id → canonical businesses.id
SELECT k.id AS kpi_row_id, k.business_profile_id, p.business_id AS canonical_business_id
FROM public.business_kpis k
LEFT JOIN public.business_profiles p ON p.id = k.business_profile_id
WHERE k.business_id = :orphan;

-- Recovery via financial_forecasts.xero_connection_id → xero_connections.business_id
SELECT f.id AS forecast_row_id, f.xero_connection_id, f.tenant_id,
       x.business_id AS canonical_business_id
FROM public.financial_forecasts f
LEFT JOIN public.xero_connections x ON x.id = f.xero_connection_id
WHERE f.business_id = :orphan;
```

**Disposition:**
- **(R) Remappable** — a confident canonical ID is derivable → go to Step 3 (UPDATE).
- **(D) Dead** — parent provably deleted *and* data stale/duplicate → Step 3 (archive+DELETE).
- **(U) Unknown** — cannot classify with confidence → **STOP**, hand Matt the Step-0 dump.
  Doing nothing is a valid, safe outcome.

### Step 2 — Backup confirmation
The Step-0 JSON dump is the pre-image. Also record the table's total row count + a
checksum so we can later prove only N rows changed.

### Step 3 — Apply (transaction, PK-scoped)
Always pin to the specific primary-key `id`s captured in Step 0 — **never** key a
mutation on `business_id` alone.

```sql
BEGIN;

-- (R) Remap example — business_kpis:
UPDATE public.business_kpis
SET business_id = :canonical_business_id
WHERE id = ANY(:row_ids)          -- exact PKs from Step 0
  AND business_id = :orphan;      -- belt-and-suspenders guard

-- Assert blast radius BEFORE committing:
--   expected = the row_count measured in Step 0. If it differs, ROLLBACK.
SELECT count(*) FROM public.business_kpis WHERE id = ANY(:row_ids);

COMMIT;  -- only if the assert matches
```

For **(D) Dead**: insert the rows into an archive table (or rely on the JSON dump),
then `DELETE ... WHERE id = ANY(:row_ids)` inside the same transaction.

### Step 4 — Verify
1. `node scripts/audit-dual-id-distribution.mjs` → the table's ORPHAN count must be **0**;
   BIZ/PROFILE counts shift exactly as predicted.
2. `npx tsx scripts/verify-production-migration.ts --business-id=… --tenant-id=… …` for any
   tenant whose forecast/kpi was remapped → must **exit 0** (all 4 reconciliation gates pass).
3. Visual spot-check: open that client's dashboard; KPIs / forecast / goals still render and
   the numbers are unchanged.

### Step 5 — Rollback recipe (pre-written)
- **Remap:** `UPDATE <table> SET business_id = :orphan WHERE id = ANY(:row_ids);` (exact inverse).
- **Delete:** re-INSERT from the Step-0 JSON dump.

Because every change is PK-scoped and pre-imaged, rollback is a single command.

---

## Ordering & safety invariants

1. **Orphan cleanse precedes removing the `_text` RLS pollution mask.** If ORPHAN-A is
   auth-ID pollution, the `_text` helper is currently what stops related queries from
   silently returning nothing. Clean the data first; remove the mask in a later change.
2. **Do not touch "wrong-space-but-readable" rows in this change.** The BIZ-in-a-PROFILE-table
   and PROFILE-in-a-BIZ-table rows are reachable today via the dual-tolerant resolvers. They
   belong to the larger canonicalization effort, not this first fix.
3. **Never run on a dirty table.** Schedule away from the nightly Xero sync (~4am AEST) so no
   sync is mid-flight while these rows are mutated.
4. **One orphan at a time**, fully verified, before starting the next.

---

## Out of scope (explicitly deferred)

- Removing or canonicalizing the dual-ID system itself.
- Remapping the ~30 wrong-space rows across the three MIXED tables.
- Removing the `_text` RLS helper variant.
- Any change to the 12 CONSISTENT tables in the baseline (they are clean — leave them).

---

## Effort & risk

- **Effort:** ~1–2 hours including verification. 3 distinct IDs, a small number of rows.
- **Risk:** LOW. Remaps are reversible UPDATEs; deletes are pre-imaged; the Unknown case
  changes nothing.
- **Why this first:** smallest real blast radius in the whole roadmap, fully reversible, and
  it dry-runs the entire backup → verify → rollback machinery on a low-stakes target before
  anything bigger.

---

## When ready to execute
This document is a plan, not an action. Executing it means running the Step-0/Step-1
read-only queries against production first, classifying each orphan, and only then
deciding per-orphan whether to remap, archive, or escalate — with Matt's go-ahead on
anything classified Unknown.
