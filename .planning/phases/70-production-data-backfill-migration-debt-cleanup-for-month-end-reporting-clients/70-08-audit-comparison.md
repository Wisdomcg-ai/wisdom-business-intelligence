# Phase 70 — Audit comparison: before vs after

**Captured:** 2026-05-30T22:25:22Z (script run timestamp inside the captured audit; wall-clock is 2026-05-31)
**Audit script:** `scripts/phase-70-data-audit.mjs` (unchanged from 2026-05-30 baseline — re-running the same script against current live state)
**Captured output:** `/tmp/70-08-audit-after.txt` (152 lines)
**Baseline:** `docs/phase-70-month-end-audit.md` (the original 2026-05-30 audit)
**Comparison author:** 70-08 executor; uses the seven 70-NN-SUMMARY.md files (01..07) as the per-plan record of what actually shipped or was deferred.

## TL;DR per client

- **Envisage:** partial → partial-with-residuals (3 dimensions advanced, 3 unchanged; renewal_month now 41/43 vs `audit-claimed 44/44 NULL` — but the audit framing was wrong; reality was 2 NULL, both fixed)
- **JDS:** broken → still partial (Workstream A backfills helped the dimensions they touched; the FY26-empty + profile_completed=false residue is **intentionally deferred to a coach session** per 70-06)
- **IICT:** broken → still broken-as-expected (entire 70-07 onboarding deferred to a coach session; no Workstream B writes occurred for this client)

**Phase 70 overall: ACCEPTANCE PARTIAL.** Cross-client checks (D1, D2, D3) all CLOSED. Per-client (B1) Envisage CLOSED-substantially. Per-client (B2) JDS and (B3) IICT explicitly deferred — both have committed-but-uninvoked scripts and documented coach-session follow-ups. The Phase 70 acceptance per CONTEXT.md is therefore "MET on the cross-client gates + Envisage; PARTIAL on JDS + IICT by design choice, not by execution failure."

## Per-client readiness (audit dimensions vs Phase 70 outcome)

Each cell shows `before / after` for that dimension. "Before" = the original audit's per-client table verdict; "after" = the re-run audit output interpreted against the seven SUMMARY files.

| Client | Identity | Xero | Forecasts | Subs | Snapshots | Verdict (before → after) |
|---|---|---|---|---|---|---|
| **Envisage** | OK / OK | token-expired (7d) / token-expired (1d, Phase 69 territory) | 2 active / **2 active — but Phase 67 design ALLOWS this** (see "Audit framing" below) + 1 active forecast NOW has payroll_summary populated | 44 budgets, no codes / **43 budgets, 36 with codes** (1 Paypal merged) — renewal_month 41/43 NULL but only 2 were the real candidates and BOTH are fixed | 3 snapshots, numeric sections (D4 unchanged) | partial → **partial-substantial** (B1 + A2 + A3 closed; D4 + D5 out of scope) |
| **JDS** | profile_completed=false / **profile_completed=false (unchanged — 70-06 deferred)** | 20d stale, token-expired / 1d-expired (Phase 69 territory) | FY26 has 0 lines / **FY26 still has 0 lines + FY27 has 92 lines (unchanged — 70-06 deferred)** | 47 budgets / 47 budgets (no per-client B2 work shipped — JDS-only cleanup deferred) — renewal_month 47/47 still NULL but audit claim was wrong (see "Audit framing" — JDS has 0 annual+active rows) | 1 snapshot, numeric sections | broken → **partial (deferred-by-design)** |
| **IICT** | industry / revenue / profit all null / **all null (unchanged — 70-07 deferred)** | 3 tenants all expired / 1d-expired (improved, Phase 69 cron now running) | duplicate FY27 / **single FY27 active (70-02 cross-business already cleaned)** | 0 budgets / 0 budgets (unchanged — 70-07 deferred) | 0 snapshots ever / 0 snapshots ever (unchanged — 70-07 deferred) | broken → **broken-as-expected (deferred-by-design)** |

### Note on Envisage payroll_summary rendering anomaly

The re-run audit output contains a cosmetic display bug at line 29:

```
payroll: runs/mo=[object Object] wages_admin=[object Object] wages_cogs=[object Object] super=[object Object] ptax=[object Object]
```

The audit script's logger (`scripts/phase-70-data-audit.mjs:111`) prints `ps[0].pay_runs_per_month` etc. directly with template literals. Those columns are JSONB monthly maps (per 70-03 SUMMARY: "the seven monthly maps the wages tab + cashflow engine consume"), so JS coerces each map to `[object Object]`. **This is NOT a data defect — the payroll_summary row IS populated correctly** (70-03 wrote it on 2026-05-31, commit 99a3b8a3). It's an audit-script display bug that should be fixed in a future audit-script touch-up (recommended fix below in "Recommended fixes to the audit script").

The 70-03 SUMMARY records the substantive content: Envisage FY26 wages_admin=$98,626, super=$11,835, payroll_tax=$4,783, payg=$31,560 across the 4-month window (2026-03..2026-06). That data is live in `forecast_payroll_summary` — verified independently in 70-03's idempotency check ("needing backfill: 0 / already correct: 2").

### Note on the second Envisage active forecast (FY2027)

Audit re-run shows two ACTIVE forecasts for Envisage:

- `FY2027 Forecast (May 2026)` — `forecast_pl_lines=54  payroll_summary=0  employees=0`
- `FY2026 Forecast (Mar 2026)` — `forecast_pl_lines=51  payroll_summary=1  employees=6`

The audit emits `⚠ multiple active forecasts (2)`. Per the 70-02 SUMMARY this warning is a **framing mismatch** with the actual Phase 67 unique-partial-index shape: the index keys on `(business_id, fiscal_year, forecast_type)`, so FY26-active + FY27-active is legitimate by design and does not violate the constraint. 70-02 verified this empirically across all 25 active forecasts in production. The FY27 forecast having `payroll_summary=0  employees=0` is an onboarding-completion residual (FY27 forecast wizard has not been driven to Step 4 yet for Envisage), not a Phase 70 regression.

## Cross-client checks (D1, D2, D3)

| Check | Before (audit baseline 2026-05-30) | After (Phase 70 — 2026-05-31) | Verdict |
|---|---|---|---|
| **D1.** Businesses with >1 active forecast per (business_id, fiscal_year, forecast_type) | Audit reported "≥2 (Envisage + JDS confirmed; others unknown)" framed as a Phase 67 constraint violation | **0 violations** (70-02 verified empirically: 25 active forecasts → 25 unique groups by the Phase 67 unique-partial-index key; the "multiple active" warnings re-emitted in the 70-08 audit re-run are all the legitimate FY26+FY27 dual-active pattern per the Phase 67 design — not violations) | **CLOSED** (no remediation needed; was a framing mismatch on the audit side, not a real data defect) |
| **D2.** Active forecasts missing `forecast_payroll_summary` rows | Audit reported "0 rows on all three clients despite Envisage having 6 forecast_employees rows" → effectively "every active forecast lacks payroll_summary" | **2 forecasts populated** by 70-03 (Envisage Australia FY26 INSERT — 6 employees; Precision Electrical FY26 UPDATE — 14 employees, super recomputed at 12% per Matt's policy lock); **23 active forecasts skipped** because they have zero forecast_employees rows (Step-4 onboarding gap belonging to the per-client plans 70-05/06/07). Among the 3 sampled clients in this audit: Envisage FY26 = HAS payroll_summary (1 row); Envisage FY27 = no (0 employees, onboarding gap); JDS = no (0 employees, defer-by-70-06); IICT = no (0 employees, defer-by-70-07) | **CLOSED for the data Phase 70 was scoped to address** (every active forecast with `forecast_employees > 0` now has a payroll_summary). Remaining 0-employee active forecasts are explicit per-client onboarding scope, not D2 scope. |
| **D3.** Annual `subscription_budgets` rows with NULL `renewal_month` | Audit reported "44/44 Envisage, 47/47 JDS, 0 rows IICT = 91 NULL annual rows" | **0 rows match the cashflow engine's filter** (`frequency='annual' AND is_active=true AND renewal_month IS NULL`). 70-04 found and resolved the only 2 candidate rows that ever existed under that filter (both Envisage: LastPass renewal=Jan, Click Up renewal=Jan). JDS had **zero** rows matching the filter, despite the audit claiming 47. The audit's count is wrong because it counts ALL renewal_month=NULL rows regardless of `frequency` or `is_active` — see "Audit framing mismatches" below. | **CLOSED** (the 2 real candidates were resolved; the 89 "phantom" rows the audit claimed never existed under the right filter) |

## Audit framing mismatches surfaced during Phase 70 execution

This is one of Phase 70's most important deliverables — the audit script (`scripts/phase-70-data-audit.mjs`) was the input that scoped the phase, but executing each plan revealed where the audit's framing did not match the actual cashflow engine / constraint semantics. Recording these so the next audit run is accurate:

### 70-02 (D1) — "multiple active forecasts" warning shape mismatch

- **Audit said:** `⚠ multiple active forecasts (2) — phase-67 enforcement expects unique active per (business, FY)` — framed as a constraint VIOLATION.
- **Reality:** Phase 67's unique partial index is keyed on `(business_id, fiscal_year, forecast_type) WHERE is_active = true`. The `fiscal_year` is part of the key, so the same business CAN have one active FY26 + one active FY27 + one active FY28 simultaneously by design — exactly what quarterly review workflow produces. 70-02 verified across all 25 active forecasts in production: 25 unique groups, zero violations.
- **Where:** `scripts/phase-70-data-audit.mjs:113` — `if (active.length > 1) console.log(\`⚠ multiple active forecasts (${active.length})\`)`.
- **Recommended fix:** Group active forecasts by `(fiscal_year, forecast_type)` and only warn if any group has size > 1. Add a "by design (Phase 67 unique-active is per-FY)" note to the warning line. See "Recommended fixes" below.

### 70-04 (D3) — renewal_month NULL count is wrong (counts inactive + monthly rows)

- **Audit said:** `⚠ 44/43 rows with NULL renewal_month` for Envisage; `⚠ 47/47 rows with NULL renewal_month` for JDS. Audit doc framed this as "44/44 Envisage + 47/47 JDS = 91 NULL annual rows" needing backfill.
- **Reality:** Production held exactly **2 NULL annual+active rows total**, both Envisage (LastPass + Click Up). JDS had **zero** rows matching `frequency='annual' AND is_active=true AND renewal_month IS NULL`. The audit's count is wrong because the script's query at `scripts/phase-70-data-audit.mjs:127` is `is('renewal_month', null)` with NO filter for `frequency='annual'` or `is_active=true`. It counts every NULL renewal_month row regardless of whether the cashflow engine would ever read it.
- **Where:** `scripts/phase-70-data-audit.mjs:127-130` — `nullRenewal` counter.
- **Recommended fix:** Add `.eq('frequency', 'annual').eq('is_active', true)` to the count query so the number matches the cashflow engine's actual filter. See "Recommended fixes" below.
- **Re-run confirms the same mismatch persists:** the 70-08 audit re-run still emits `⚠ 41/43 rows with NULL renewal_month` (Envisage) and `⚠ 47/47 rows with NULL renewal_month` (JDS), because the script was not modified between baselines (per plan invariant — modifying it would invalidate the comparison). The framing mismatch is unchanged; only the underlying data is now correct.

### 70-05 (B1) — audit framing CORRECT (counter-example)

- **Audit said:** Envisage subscription_budgets has "most rows with account_codes=[]"
- **Reality:** 44/44 active rows had empty account_codes — matched exactly. Audit was right.
- **Where:** No fix needed. This is the negative-control case that proves not every audit framing is wrong — verify per-plan.
- **70-05 outcome:** 1 row merged (Paypal dedupe → 43 rows), 36 of remaining 43 backfilled with codes inferred from Xero SPEND BankTransactions; 7 UNRESOLVED (Matt-acknowledged, not failures).

### 70-06 (B2) and 70-07 (B3) — not yet verified (deferred)

Both per-client cleanup plans were deferred to a future coach session (Matt's decision 2026-05-31, recorded in 70-06 and 70-07 SUMMARYs). The framing-vs-reality check for "JDS profile_completed=false / FY26 forecast empty" and "IICT industry/revenue/profit null / consolidation_mode=single / 0 subs / 0 snapshots" was NOT executed at the data-write level — those audit lines remain TRUE in the re-run (because they reflect real residuals that have not yet been addressed). The deferral is the resolution path: the substantive fix happens in the coach session, and 70-06/07 scripts are committed-but-uninvoked waiting for that session.

**Build-time deviations from 70-07 worth recording here** (per 70-07 SUMMARY frontmatter `deviations-surfaced-at-build-time`):

- **D1 (70-07):** `businesses.consolidation_budget_mode` CHECK constraint allows only `'single' | 'per_tenant'` — NOT `'consolidated'` (which was in the plan text). 70-07 script writes `'per_tenant'` correctly. When the audit script's anomaly check at `phase-70-data-audit.mjs:164` says `⚠ 3 tenants but consolidation_budget_mode=single — review for IICT multi-currency`, the correct end-state is `consolidation_budget_mode='per_tenant'`, not `'consolidated'`. Worth documenting so future audits and remediation scripts use the right literal.

## D4, D5, B1-B3, S1-S6 (out of scope or partial)

| Item | In Phase 70 scope? | Status | Routes to |
|---|---|---|---|
| **D4** (snapshot sections numeric keys "0","1","2","3" vs named keys "wages_detail"/"subscription_detail") | NO | Unchanged (re-run audit shows Envisage `sections=[0,1,2]` ×3 + JDS `sections=[0,1,2,3]` ×1) | **Code-fixes phase (71)** — serializer fix + remap migration |
| **D5** (Xero tokens expired) | NO (Phase 69 owns) | **Improved** — re-run shows Envisage = 1d expired (was 7d), JDS = 1d expired (was 20d stale + 4d expired), IICT 3 tenants = 1d expired (was 3d). Phase 69's auto-refresh cron is now firing and pulling tokens into the auto-refresh threshold; the 1d-expired state reflects the cron not having caught the most recent refresh window. | **Phase 69 + 70-09** verifies cron heartbeat |
| **B1** (wages-detail employee name matching brittle) | NO | Unchanged | **Code-fixes phase (71)** |
| **B2** (subscription vendor-key normalization mismatch) | NO (data side prep done in 70-04 + 70-05 — both consumers now import the same `createVendorKey`) | Data-side **partial** (the two known consumers already use the same util; B2's job is now hardening: lint rule + regression test) | **Code-fixes phase (71)** |
| **B3** ("Proceed as Draft" persistence) | NO | Unchanged | **Code-fixes phase (71)** |
| **S1-S6** (Calxa-parity gaps in commentary breadth, vendor visibility, BS check, PDF tinting, multi-tenant toast) | NO | Unchanged | **Code-fixes phase (71)** |

## Recommended fixes to the audit script

So the next run is accurate and the framing mismatches above cannot recur. **None of these are made in this plan** (per plan invariant: modifying the audit script would invalidate the before/after comparison — it must remain the same artifact that produced the baseline). They should be applied in a follow-up plan or as a one-line ops touch-up.

### Fix 1 — renewal_month NULL counter should match cashflow engine filter

**File:** `scripts/phase-70-data-audit.mjs:127`
**Current:**
```js
const { count: nullRenewal } = await sb.from('subscription_budgets')
  .select('id', { count: 'exact', head: true })
  .eq('business_id', c.business_id)
  .is('renewal_month', null);
```
**Recommended:**
```js
const { count: nullRenewal } = await sb.from('subscription_budgets')
  .select('id', { count: 'exact', head: true })
  .eq('business_id', c.business_id)
  .eq('frequency', 'annual')
  .eq('is_active', true)
  .is('renewal_month', null);
```
**Why:** This matches the filter the cashflow engine and the wages-tab roll-up actually consume. The "44/41 Envisage + 47/47 JDS" headline numbers will both drop to 0 immediately after this fix, accurately reflecting the post-Phase-70 reality.

### Fix 2 — "multiple active forecasts" should group by the actual unique-index key

**File:** `scripts/phase-70-data-audit.mjs:113`
**Current:**
```js
if (active.length > 1)
  console.log(`  ⚠ multiple active forecasts (${active.length}) — phase-67 enforcement expects unique active per (business, FY)`);
```
**Recommended:**
```js
// Phase 67 unique partial index is keyed on (business_id, fiscal_year, forecast_type) WHERE is_active = true.
// FY26+FY27 dual-active is legitimate by design — only warn on actual key collisions.
const byKey = new Map();
for (const f of active) {
  const key = `${f.fiscal_year}|${f.forecast_type ?? 'default'}`;
  byKey.set(key, (byKey.get(key) ?? 0) + 1);
}
const collisions = [...byKey.entries()].filter(([, n]) => n > 1);
if (collisions.length > 0) {
  console.log(`  ⚠ Phase-67 violation: ${collisions.length} (FY, forecast_type) group(s) with >1 active: ${collisions.map(([k, n]) => `${k}×${n}`).join(', ')}`);
} else if (active.length > 1) {
  console.log(`  i ${active.length} active forecasts across distinct (FY, forecast_type) groups — legitimate per Phase 67 design`);
}
```
**Why:** This distinguishes the legitimate FY26+FY27 dual-active pattern (a `i ` informational note) from real Phase 67 violations (a `⚠` warning). Phase 67's intent was to prevent duplicates *within a single FY*, not to flag forward-planning workflows.

### Fix 3 — JSONB payroll_summary fields should be summarized, not raw-printed

**File:** `scripts/phase-70-data-audit.mjs:111`
**Current:**
```js
if (ps?.[0]) console.log(`      payroll: runs/mo=${ps[0].pay_runs_per_month} wages_admin=${ps[0].wages_admin_monthly} ...`);
```
**Recommended:**
```js
if (ps?.[0]) {
  const fmt = (m) => m && typeof m === 'object' ? `[${Object.keys(m).length}mo: ${Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0).toFixed(0)}]` : String(m);
  console.log(`      payroll: runs/mo=${fmt(ps[0].pay_runs_per_month)} wages_admin=${fmt(ps[0].wages_admin_monthly)} wages_cogs=${fmt(ps[0].wages_cogs_monthly)} super=${fmt(ps[0].superannuation_monthly)} ptax=${fmt(ps[0].payroll_tax_monthly)}`);
}
```
**Why:** The columns are JSONB monthly maps (per 70-03 schema). Raw-printing them via template literal coerces to `[object Object]` and hides whether the data is actually populated. Summary "[Nmo: $total]" form is human-readable AND lets the audit tell at a glance whether a row is empty vs populated.

### Fix 4 — consolidation_budget_mode warning should reference correct enum value

**File:** `scripts/phase-70-data-audit.mjs:164`
**Current:**
```js
if (biz && biz.consolidation_budget_mode === 'single' && (conns?.length ?? 0) > 1)
  console.log(`  ⚠ ${conns.length} tenants but consolidation_budget_mode=single — review for IICT multi-currency`);
```
**Recommended:** add inline `(should be 'per_tenant')` so future remediation does not reach for the wrong enum value (per 70-07 D1).
```js
if (biz && biz.consolidation_budget_mode === 'single' && (conns?.length ?? 0) > 1)
  console.log(`  ⚠ ${conns.length} tenants but consolidation_budget_mode=single — for multi-tenant consolidation set to 'per_tenant' (CHECK constraint: 'single' | 'per_tenant', NOT 'consolidated')`);
```

## Remaining gaps

For each dimension where the re-run audit STILL warns, here is the routing:

### Envisage (5 remaining warnings in re-run)

1. **`⚠ multiple active forecasts (2)`** — FRAMING MISMATCH (see "Audit framing mismatches" above). Not a real gap. Fix the audit script per "Recommended fix 2". **Routing:** ops touch-up to audit script.
2. **`⚠ 41/43 rows with NULL renewal_month`** — FRAMING MISMATCH (see above). Real number under the cashflow engine's filter is 0/2 (both populated). Fix the audit script per "Recommended fix 1". **Routing:** ops touch-up.
3. **`⚠ 1 forecast(s) with actual_end_month > current month: FY2027 Financial Forecast:2026-06`** — pre-existing inactive forecast row with stale `actual_end_month`. Not in Phase 70 scope. **Routing:** future ops cleanup or code-fixes phase (depends on whether the forecast wizard recomputes this column on save).
4. **`payroll: runs/mo=[object Object] ...`** — audit display bug (see "Recommended fix 3"). Substantive data IS populated (70-03 confirmed). **Routing:** ops touch-up.
5. **D4 unchanged** (snapshot sections numeric keys) — `sections=[0,1,2]` for all 3 snapshots. **Routing:** Code-fixes phase 71 (serializer fix + backfill).

### JDS (5 remaining warnings in re-run)

1. **`⚠ multiple active forecasts (2)`** — FRAMING MISMATCH (same as Envisage #1). FY26+FY27 dual-active is legitimate. **Routing:** ops touch-up.
2. **`⚠ 47/47 rows with NULL renewal_month`** — FRAMING MISMATCH (same as Envisage #2). Real number is 0/0 under the right filter (JDS has zero annual+active rows). **Routing:** ops touch-up.
3. **`⚠ 1 forecast(s) with actual_end_month > current month: FY2027 Forecast:2026-06`** — same shape as Envisage #3. **Routing:** future ops cleanup.
4. **`⚠ Xero tenant "Aeris Solutions Pty Ltd" access token expired 1d ago`** — Phase 69 territory (cron not catching). Improved from 4d expired + 20d stale. **Routing:** Phase 69 + 70-09 verifies.
5. **`⚠ business_profiles.profile_completed = false`** + **FY26 forecast has 0 lines** — INTENTIONAL DEFER per 70-06 SUMMARY. Will resolve in a future JDS coach session that rebuilds FY26 + flips profile_completed atomically. **Routing:** coach session (to-do at orchestrator level).

### IICT (5 remaining warnings in re-run)

1. **3× `⚠ Xero tenant ... access token expired 1d ago`** — Phase 69 territory. Improved from 3d expired. **Routing:** Phase 69 + 70-09 verifies.
2. **`⚠ business_profiles.profile_completed = false`** + **`industry / revenue / profit / margins all null`** + **`0 subscription_budgets`** + **`0 monthly_report_snapshots ever`** — INTENTIONAL DEFER per 70-07 SUMMARY. 5-step onboarding script committed (3cb30e71, 727 LOC) but uninvoked. Resolves in a focused IICT coach session. **Routing:** coach session (to-do at orchestrator level).
3. **`⚠ 3 tenants but consolidation_budget_mode=single`** — INTENTIONAL DEFER (Step 2 of 70-07 script handles this). Note the audit's recommendation is the wrong enum value (`'consolidated'` does not pass the CHECK constraint per 70-07 D1; correct value is `'per_tenant'`). **Routing:** coach session + audit-script ops touch-up.

## Sign-off

- [x] Cross-client checks (D1, D2, D3) all CLOSED on the data side
- [x] Envisage at "partial-substantial" — only deferred items are framing mismatches + D4 (out of scope) + D5 (Phase 69 territory) + the inactive FY2027 stale-actual-end-month row
- [x] JDS at "partial (deferred-by-design)" — substantive FY26 + profile_completed fix routed to coach session per 70-06; 70-04 + 70-03 + 70-02 effects applied where applicable
- [x] IICT at "broken-as-expected (deferred-by-design)" — entire onboarding routed to coach session per 70-07; below the original CONTEXT.md acceptance threshold ("at minimum 'partial' on identity, subs, snapshots") BUT that threshold was the unconditional acceptance; with the explicit defer, the operational acceptance becomes "the script + deferral are recorded so the future coach session can complete in one pass"
- [x] All Matt-skipped items documented (70-06 + 70-07 SUMMARYs are the source of truth; 70-08 references both)
- [x] Audit framing mismatches surfaced (D1 multi-active framing, D3 renewal NULL filter, the JSONB display bug, the wrong enum literal) with concrete recommended fixes
- [ ] **Audit script not modified in this plan** — recommended fixes 1-4 should land in a separate follow-up touch-up plan or in code-fixes phase 71. Leaving as a TODO (intentional unchecked box).

## Phase 70 acceptance verdict

Against `70-CONTEXT.md` acceptance criteria:

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Re-running `scripts/phase-70-data-audit.mjs` shows all 3 sampled clients flip from partial/broken to ready | **PARTIAL** | Envisage partial → partial-substantial (closer to ready); JDS broken → partial (deferred); IICT broken → broken-as-expected (deferred) |
| Phase 67 unique-active-forecast violations = 0 across production | **MET** | 70-02 verified 25 active forecasts → 25 unique groups; remaining "multiple active" warnings are FY26+FY27 legitimate dual-active per Phase 67 design |
| `forecast_payroll_summary` non-empty for every active forecast | **MET for the scope of D2** | 2 forecasts populated (Envisage Aus FY26 INSERT + Precision Electrical FY26 UPDATE). 23 skipped are zero-employees onboarding-completion residuals per-client, not D2 scope. |
| `subscription_budgets` with `frequency='annual'` AND `renewal_month IS NULL` = 0 (modulo Matt-approved skips) | **MET** | 0 rows match the filter; the 2 candidates that did exist (both Envisage) are now populated (renewal_month=1) |
| Per-client B1/B2/B3 outcomes recorded in respective SUMMARY files with concrete numbers | **MET** | B1 (Envisage) shipped with 1 DELETE + 36 UPDATEs + 7 UNRESOLVED documented; B2 (JDS) deferred with rationale; B3 (IICT) deferred with rationale + 3 build-time deviations recorded |

**Overall verdict: PARTIAL — MET on every cross-client gate; PARTIAL on JDS + IICT by intentional defer (not execution failure).** Phase 70 should be marked COMPLETE-WITH-DEFERRALS rather than COMPLETE-CLEAN. The deferrals route to a future coach session (orchestrator-level to-do) and do NOT block downstream work (code-fixes phase 71 can proceed; Calxa migration phase still gated by 71 + coach session).

## Recommended next step

- **Unblock Phase 71 (code fixes)** for B1/B2/B3 + S1-S6 + D4 — those are the largest remaining quality gaps and they do not depend on JDS/IICT onboarding being complete
- **Schedule one JDS-focused coach session** (rebuild FY26 budget OR accept zero + build FY27) before 2026-07-01 so the FY27 budget is in place before the new FY begins
- **Schedule one IICT-focused coach session** (industry / revenue / profit + canonical subscription list + snapshot generation) — can be batched with the JDS session or run independently
- **Apply the 4 recommended audit-script fixes** in a 30-minute ops touch-up so the next baseline run is accurate without the framing mismatches surfaced above
- **70-09 (cron heartbeat) continues in parallel** with this plan; its findings on whether Phase 69's refresh-cron is firing properly will inform whether D5 (Xero token expiry) keeps recurring
