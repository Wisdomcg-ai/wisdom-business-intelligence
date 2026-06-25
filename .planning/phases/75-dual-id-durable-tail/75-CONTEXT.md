# Phase 75 — Dual-ID Durable Tail (R-4 + R-5 + R-6)

**Status:** PLAN for Matt's review. No code / no migrations until the approach is approved.
**Created:** 2026-06-23
**Predecessor:** Phase 74 (#289) shipped R-1 foundation + R-2 the 23 fixes + R-3 column-name bugs,
code-only + prod-verified. R-7 ("resume annual reset") is already done — the reset shipped (#290).
**Authoritative sources (LOCKED — do not re-litigate scope):**
`.planning/codebase/DUAL-ID-REMEDIATION-ROADMAP.md` (R-4/R-5/R-6 definitions),
`.planning/codebase/DUAL-ID-VERIFIED.md` (10 latent + 13 false-positives),
`.planning/codebase/FK-INTEGRITY-PLAN.md` (Phase A done; Phase B is R-5).

## Framing (carried from the locked roadmap)

This is **not a fire** — the 2026-06-11 FKs fail closed, so there is **no data corruption**; the
remaining work is durability/hygiene, not incident response. That means we can **stage** it and ship the
safe parts independently of the risky migration parts.

## Dependency order is FIXED: R-6 → R-5 → R-4

You cannot reorder these:
1. **R-6 (cleanse) FIRST** — an FK to `business_profiles(id)` will *reject* any row still keyed by
   `user_id`/`businesses.id`, so the data must be clean (and the dual-column tables' `business_profile_id`
   fully populated) before the FK can be added.
2. **R-5 (FKs + single-branch RLS) NEXT** — once data is clean, add the FKs (mis-keys become a loud
   error) and collapse the dual-tolerant RLS to single-branch.
3. **R-4 (remove latent fallbacks) LAST** — the defensive `|| businesses.id` / `|| user.id` fallbacks
   can only be safely removed once R-5's FKs are live in prod as the loud backstop.

## Wave plan

### Wave 75-01 — R-6 Data cleanse + FK-readiness verification  (LOW risk, read-mostly)
- Confirm **zero rows** keyed by `user_id`/`businesses.id` across all profile-keyed tables (read-only
  audit; the cleanse precondition).
- Backfill `strategic_initiatives` rows keyed only by `user_id` (if any remain post-#289).
- For the **text** columns (`activity_log`, `plan_snapshots`, `sprint_key_actions`, `kpi_history`):
  re-verify every `business_id` value is a valid `business_profiles.id` UUID (precondition for the cast).
- For the **dual-column** tables (`business_financial_goals` 14, `business_kpis` 55): confirm
  `business_profile_id` is fully populated; backfill any gaps from the canonical resolver.
- Snapshot before any write; produce a cleanse report (counts before/after). Verify against prod data,
  read-only / demo-client (Precision method).
- **Gate:** "0 rows keyed by the wrong id-space anywhere" + "all FK-target columns are clean" → unblocks 75-02.

### Wave 75-02 — R-5 Finish FK rollout (FK Phase B) + single-branch RLS  (HIGH risk — migrations)
- **FIRST: pre-flight prod migration state.** Migrations `20260505…`–`20260508…` are **Phase 49 DB-04
  audit-attribution FKs** (mostly `auth.users` references) and per memory `project_migration_drift` were
  **deliberately deferred from prod** — they are NOT dual-ID FKs and NOT part of R-5's DDL, but they mean
  prod's applied-migration history may diverge from the files on disk. Reconcile that drift (what is
  actually applied in prod vs `supabase/migrations/`) BEFORE writing/applying any new migration, so 75-02
  doesn't land on an inconsistent history. (Auto-apply pipeline is broken — never blind `db push` prod.)
- The R-5 DDL itself = **FK-Integrity Phase B** (Phase A done = `20260611010000`):
- `ALTER COLUMN business_id TYPE uuid USING business_id::uuid` on the 4 text columns, then FK →
  `business_profiles(id)` ON DELETE CASCADE.
- Dual-column tables: FK on the uuid `business_profile_id`; backfill + retire the legacy text `business_id`.
- Group B FKs → `businesses(id)` ON DELETE CASCADE (`issues_list`, `open_loops`, `strategy_data`,
  `cashflow_assumptions` — uuid, no orphans, NULLs allowed).
- Rewrite the dual-tolerant RLS policies to **single-branch** (canonical key only).
- **Apply via the normal pipeline, supervised — NO blind `db push` to prod.** Snapshot first.
  Full `vitest` gate (FK tables now make wrong writes throw in tests).
- **Gate:** migrations applied + recorded in prod, RLS single-branch, vitest green → unblocks 75-03.

### Wave 75-03 — R-4 Remove latent fallbacks + dead code  (MEDIUM risk, no migrations)
- Replace the 10 latent + nuanced `profile?.id || businesses.id` / `|| user.id` / id-try loops with the
  resolver → explicit empty state (plan-data-assembler, strategic-sync-service, plan_snapshots
  split-history, QR step fallbacks, `api/kpis` contract, goals resolve-business).
- Remove the resolver's **input-echo fallback** (now safe — FKs are the loud backstop). Update its
  module header (currently says "kept until R14").
- Delete verified dead code (`SnapshotService`, `KPIService.updateKPIValue/deleteKPI`,
  `getIncompleteReviewsForWeek`, dead `/api/kpis` POST, sprint/operational `user_id` fallbacks).
- Drop the **13 false-positives** from the backlog.
- **Gate:** full vitest green; each touched customer path prod-verified before/after.

## Cross-cutting (every wave)
- Verify against prod data before/after for each customer-facing change (read-only / demo client).
- Surface swallowed Supabase/PostgREST errors as each path is touched (R-1 discipline / `surfaceSupabaseError`).
- Full `vitest` at each wave gate.
- **No blind prod migrations** — 75-02 applied supervised through the normal pipeline.

## Open decisions for Matt (block detailed planning of 75-02)
1. **Staging:** ship 75-01 (cleanse, safe) + 75-03 (code cleanup, no migration) first, and stage 75-02
   (the FK migrations) as its own supervised deploy? — RECOMMENDED, since there's no corruption and W2
   is the only risky part. (Note: R-4's fallback removal still must wait until 75-02 is live in prod.)
2. **Prod migration mechanics:** how do you want 75-02 applied (and the 505-508 reconciliation handled)
   given the auto-apply pipeline is broken? Manual supervised apply per migration?
3. **Naming:** keep as Phase 75 in the current milestone (continuous history — recommended) vs a new milestone.
