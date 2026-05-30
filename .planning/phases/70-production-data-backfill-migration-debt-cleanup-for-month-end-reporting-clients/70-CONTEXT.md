# Phase 70: Production data backfill + migration debt cleanup — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Source:** PRD Express Path — derived from `docs/phase-70-month-end-audit.md` D1-D5 findings + per-client status table

<domain>
## Phase Boundary

This is a **DATA-ONLY production cleanup phase**. The Phase 70 month-end audit (run 2026-05-30, written to `docs/phase-70-month-end-audit.md`) named 5 cross-cutting data quality issues across the production set and 3 per-client onboarding gaps. Phase 69 fixed the Xero token refresh durability (the *delivery layer*). Phase 70 cleans the *data layer* those tokens feed into so the code-fixes phase that follows can verify against trustworthy state.

**This phase covers:**
1. D1 — Phase 67 unique-active-forecast remediation across all clients
2. D2 — forecast_payroll_summary backfill across all clients
3. D3 — subscription_budgets.renewal_month backfill from Xero billing cadence
4. Per-client cleanup: Envisage, JDS, IICT (the 3 sampled clients with concrete known gaps)
5. Re-verification via the existing scripts/phase-70-data-audit.mjs

**This phase does NOT cover:**
- D4 (snapshot sections numeric keys) — handled in the next phase (code fixes) because it needs the serializer fix shipped alongside the data remap
- B1-B3 / S1-S5 code bugs (Phase 70 audit's "P1 code" section) — handled in code-fixes phase
- Calxa CSV bulk import — separate downstream phase
- Schema changes — no migrations create/alter tables here; only backfill scripts under scripts/

**Naming collision warning (read carefully):**
- `docs/phase-70-month-end-audit.md` is the AUDIT document that surfaced this phase. The name "70" predates phase number assignment and is coincidental.
- `.planning/phases/70-production-data-backfill-...` is the actual roadmap phase being planned here.
- These reference each other but are different artifacts. Do not conflate.

</domain>

<decisions>
## Implementation Decisions

### Methodology (locked, copied from Phase 68 + onboard-fit2shine precedent)
- **Two-mode scripts**: every backfill ships as a single `.mjs` script in `scripts/` that accepts no flags (dry-run preview, default) or `--apply` (commit writes). No silent execution paths.
- **Pre-write snapshot per workstream**: capture the affected tables' current state to a versioned `.json` snapshot under `.planning/phases/70-.../snapshots/` BEFORE any --apply runs. This is the rollback baseline. Pattern from `scripts/68-01-snapshot-armstrong.mjs`.
- **Per-business-id idempotent**: rerunning a backfill on already-correct data must be a no-op (skip-not-overwrite). Verify by running each script twice in the dry-run preview during planning.
- **Interactive `--apply`**: Matt approves each script's --apply individually after reviewing the dry-run output. No batched approvals.
- **No schema changes**: this phase touches data only. If a workstream genuinely needs a schema change, escalate to add a new phase (do not bundle).

### Dual-ID drift (locked, per memory `project_dual_id`)
- `xero_connections`, `monthly_report_snapshots`, `subscription_budgets`, `businesses` → key by `businesses.id`
- `xero_pl_lines_v2`, `xero_bs_lines`, `financial_forecasts`, `forecast_pl_lines`, `forecast_payroll_summary`, `forecast_employees`, `business_profiles` → key by `business_profiles.id`
- **Every backfill script must explicitly resolve BOTH IDs upfront and document which it uses for each query.** Do not assume.

### Env vars (locked, per memory `feedback_executor_schema_deviations`)
- Use `SUPABASE_SECRET_KEY` (with `SUPABASE_SERVICE_KEY` fallback for old scripts but expect failure — the legacy key was disabled 2026-05-19)
- Load from `.env.local` then `.env` (use dotenv pattern from `scripts/phase-70-data-audit.mjs`)

### Workstream A — Cross-client data quality

#### A1 — Phase 67 unique-active-forecast remediation (D1)
- **Scope**: ALL businesses in production, not just the 3 sampled (Envisage + JDS confirmed; others must be audited)
- **Canonical-active selection rule**:
  1. Among forecasts with `is_active=true` for the same business, prefer the most recently `updated_at`
  2. Tie-breaker: forecast with more `forecast_pl_lines` rows
  3. Tie-breaker: forecast with non-zero `forecast_payroll_summary` rows
  4. Final tie-breaker: most recently `created_at`
- **Mutation**: set `is_active=false` on the loser(s). Do NOT delete the row — preserve for audit history.
- **Constraint safety**: do the deactivation FIRST (single UPDATE per business) so there is no window with zero active forecasts (the Phase 67 constraint allows zero, but having zero would break the wizard load path). Then audit-log the deactivation.
- **Output**: dry-run preview lists every business with >1 active forecast + named canonical + named losers + reason for selection.

#### A2 — forecast_payroll_summary backfill (D2)
- **Scope**: every active forecast across every business
- **Source data**: `forecast_employees` rows (annual_salary, monthly_cost, paye, super, payroll_tax, start_date, end_date)
- **Computation per business per month**:
  - For each employee active in month (start_date ≤ month_end AND (end_date IS NULL OR end_date > month_start))
  - Wages = monthly_cost if present, else annual_salary/12
  - PAYG = employee.paye_amount_monthly if present, else wages × 0.32 (default AU rate per existing forecast wizard logic — verify with the wizard's existing calculation in `src/app/finances/forecast/components/wizard-v4/utils/`)
  - Super = wages × employee.superannuation_rate (**default 0.12 / 12% if null**, locked 2026-05-31 by Matt: matches current AU SG statutory rate FY27+ and the wizard's default in `src/app/finances/forecast/components/forecast-cfo/hooks/useForecastCFO.ts`)
  - Payroll tax = wages × 0.0485 (NSW rate; if multi-state needed, surface as plan deviation)
- **Insert or update**: `forecast_payroll_summary` keyed by `(forecast_id, month)`. Upsert pattern.
- **Idempotency**: rerunning on the same forecast produces identical rows (same input → same output).
- **Going-forward sync**: this phase backfills existing data. Wiring the forecast wizard save flow to keep these in sync going forward is documented as a follow-up note but NOT implemented here (would be code, belongs in next phase).

#### A3 — subscription_budgets.renewal_month backfill (D3)
- **Scope**: every `subscription_budgets` row with `frequency='annual'` AND `renewal_month IS NULL`
- **Source data**: Xero bank transactions for the vendor in the past 24 months (looking back farther for annual cadence)
- **Resolution rule**:
  1. Find the most recent annual transaction for the vendor (`Contact.Name` or `Description` matching `vendor_key` per the existing `createVendorKey` normalization)
  2. Extract the calendar month
  3. Set as `renewal_month`
- **Fallback**: if no Xero transactions found (vendor not yet billed), prompt Matt for manual entry per vendor (interactive)
- **Reuses normalization**: must use the SAME `createVendorKey` as `src/app/api/monthly-report/subscription-detail/route.ts` to avoid the B2 normalization mismatch bug being fixed in the code-fixes phase. Document this dependency.

### Workstream B — Per-client cleanup

#### B1 — Envisage cleanup
- Dedupe duplicate Paypal entries in `subscription_budgets`:
  - Audit shows "Paypal" + "Paypal Australia 1043714034893" pair — keep the more specific entry, delete the generic one
  - Confirm via SQL that the kept entry has account_codes populated; populate from the deleted entry if needed
- Populate empty `account_codes` arrays on remaining subscription_budgets rows (the audit found "most rows have account_codes=[]")
- Source for account_codes: infer from Xero P&L lines — match vendor activity to account codes via xero_pl_lines_v2

#### B2 — JDS cleanup
- Flip `business_profiles.profile_completed=true` (currently false)
- FY26 forecast decision (interactive checkpoint with Matt during execution):
  - Option A: backfill `forecast_pl_lines` for the FY26 active forecast (currently 0 rows — likely needs a forecast materialize re-run)
  - Option B: deactivate FY26 active in favour of FY27 (which has 92 lines)
  - Default recommendation: Option B (FY27 has the populated data, FY26 is stale)
  - Document Matt's choice in the per-plan SUMMARY

#### B3 — IICT cleanup (highest lift)
- `business_profiles` fill-out (interactive with Matt — these are business-specific values he must provide):
  - `industry` (currently null)
  - `annual_revenue`, `gross_profit`, `net_profit` (currently null) — verified against `src/types/database.ts` 2026-05-31; CONTEXT.md previously had a typo (`annual_gross_profit`/`annual_net_profit`); the actual column names use no `annual_` prefix on the profit fields
  - margin percentages derived from above
- `consolidation_budget_mode`: change from `'single'` to `'consolidated'` (3 tenants present)
- Create initial `subscription_budgets` rows (currently zero) — interactive entry with Matt for IICT's known subscriptions
- Resolve duplicate FY27 forecast row: same canonical-active selection rule as A1, applied locally
- Generate baseline `monthly_report_snapshots` rows for 2026-04 and 2026-05 so the report PDF generator has something to render against — use the existing report generation flow (do not bypass)

### Workstream C — Verification
- **C1**: Re-run `scripts/phase-70-data-audit.mjs` against Envisage, JDS, IICT. Compare before/after readiness verdicts. Expect:
  - Envisage: was "partial", target "healthy" on all 6 dimensions
  - JDS: was "broken/partial", target "healthy" on all 6 dimensions  
  - IICT: was "broken" across the board, target "healthy" or at minimum "partial" on identity, subs, snapshots
- **C2**: Run `scripts/phase-69-token-state-audit.mjs` to confirm Phase 69's cron is now firing in production. If still not firing (cron_heartbeats empty after 12h post-deploy), HOLD this phase's downstream verification — backfills are safe to run but the audit reports will misread Xero data freshness.

### Claude's Discretion
- Exact file naming for the 6-8 scripts (suggest `70-A1-active-forecast-remediation.mjs`, etc.)
- Whether to bundle B1+B2+B3 per-client cleanup into one script or split (recommend split — different blast radius per client)
- Whether to use upsert SQL or read-then-decide-then-write (recommend the latter for clarity in dry-run output)
- Migration logging: whether to write a per-business audit log to a dedicated table (out of scope — JSON file in `.planning/phases/70-.../snapshots/` is sufficient)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The audit that surfaced this phase
- `docs/phase-70-month-end-audit.md` — full audit including D1-D5 + per-client status. The source of truth for what "broken" looks like.
- `scripts/phase-70-data-audit.mjs` — read-only audit script (re-usable for before/after verification)

### Script patterns to follow
- `scripts/onboard-fit2shine.mjs` — two-mode (default + --apply) idempotent backfill pattern
- `scripts/68-01-snapshot-armstrong.mjs` — pre-write snapshot pattern
- `scripts/68-02-armstrong-initiatives-dedupe-and-assign.mjs` — dedupe + assignment pattern (parallels A1 + B1 + B3 dedupe work)
- `scripts/phase-69-token-state-audit.mjs` — read-only multi-tenant snapshot pattern (parallels A1 + C1 audit phase)

### Schemas / interfaces
- `supabase/migrations/` — read latest baseline before assuming any column exists
- `src/app/finances/forecast/components/wizard-v4/utils/` — for the existing forecast_payroll_summary computation logic (A2 must mirror this exactly)
- `src/app/api/monthly-report/subscription-detail/route.ts` line 184 — `createVendorKey` (A3 must use this same function)

### Memory-driven constraints
- Memory `project_dual_id` — dual-ID drift; verify per table before writing
- Memory `feedback_executor_schema_deviations` — verify schema columns against live DB or baseline migration before assuming
- Memory `feedback_save_state_legacy` — for B3 snapshot generation: trace the report generation flow before bypassing it
- Memory `project_xero_bs_vs_pl_classification` — relevant for any backfill that touches xero_pl_lines or xero_bs_lines (don't reverse them)

### Phase 69 outputs that gate this phase
- `cron_heartbeats` table (from 69-04) — used by C2 verification
- 5 reconnected tenants from 69-02 — A3 needs working Xero to query bank transactions

</canonical_refs>

<specifics>
## Specific Ideas

### Suggested plan breakdown
Per-workstream split, with snapshots upfront:

- **70-01** — Pre-write snapshot of all affected tables (rollback baseline) — read-only, ships in one commit
- **70-02 (A1)** — Active-forecast remediation (dedupe is_active across all businesses)
- **70-03 (A2)** — forecast_payroll_summary backfill
- **70-04 (A3)** — subscription_budgets.renewal_month backfill
- **70-05 (B1)** — Envisage Paypal dedupe + account_codes
- **70-06 (B2)** — JDS profile + FY26 forecast resolution (interactive)
- **70-07 (B3)** — IICT business_profile + consolidation_mode + initial subs + FY27 dedupe + baseline snapshots (interactive)
- **70-08 (C1)** — Re-run data audit + comparison report
- **70-09 (C2)** — Phase 69 cron health verification (cron_heartbeats query + reporting)

Total: 9 plans. Waves:
- Wave 1: 70-01 (snapshot)
- Wave 2: 70-02, 70-03, 70-04 (cross-client, autonomous)
- Wave 3: 70-05 (Envisage, autonomous-ish), 70-06 (JDS, interactive), 70-07 (IICT, interactive)
- Wave 4: 70-08, 70-09 (verification)

Or fewer plans if the planner judges grouping appropriate.

### Acceptance for "phase complete"
- Re-running `scripts/phase-70-data-audit.mjs` shows all 3 sampled clients flip from partial/broken to ready
- Phase 67 unique-active-forecast violations = 0 across production
- `forecast_payroll_summary` non-empty for every active forecast
- `subscription_budgets` with `frequency='annual'` and `renewal_month IS NULL` = 0 (modulo Matt-approved manual skips)
- Per-client B1/B2/B3 outcomes recorded in respective SUMMARY files with concrete numbers

### Interactive checkpoints (autonomous: false)
- 70-06 (JDS FY26 decision)
- 70-07 (IICT profile data entry)
- All `--apply` runs of the cross-client scripts (Matt approves dry-run before apply)

</specifics>

<deferred>
## Deferred Ideas

- **D4 (snapshot sections numeric keys → named)**: handled in next phase (code fixes) since it needs the serializer fix shipped alongside the data remap
- **forecast wizard save sync for forecast_payroll_summary**: this phase backfills; making the wizard auto-keep it in sync going forward is code work for next phase
- **Wiring of A3's renewal_month into cashflow rendering**: data is now present; verifying the wizard's annual-lumps breakdown surfaces it correctly is code-phase work
- **Per-state payroll tax rates**: this phase uses NSW (0.0485). Multi-state-aware computation would be a code feature, not data
- **Audit log table**: per-business mutation log captured as JSON in `.planning/phases/70-.../snapshots/`; promoting to a `data_migration_audit_log` table is out of scope
- **18+ client onboarding pass**: this phase explicitly covers Envisage, JDS, IICT (the 3 sampled). Onboarding cleanup for other clients (Dragon, Armstrong, Fit2Shine, others) follows a similar pattern but is queued for Calxa migration phase (need to onboard them anyway). Cross-client workstream A still touches every client.

</deferred>

---

*Phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients*
*Context gathered: 2026-05-30 — PRD Express Path from Phase 70 audit + add-phase scope*
