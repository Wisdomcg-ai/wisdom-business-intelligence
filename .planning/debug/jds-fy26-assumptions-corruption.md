# JDS FY26 — assumptions "corruption" investigation

**Date:** 2026-05-07
**Forecast:** `58f5a43c-de8e-4a11-a9e4-4789dd4634de` ("FY2026 Forecast (Apr 2026)", `business_id=900aa935-ae8c-4913-baf7-169260fa19ef`)
**Status:** is_active=true, is_locked=false
**Created:** 2025-12-22T23:30:29Z
**Last updated:** 2026-04-28T20:25:40Z
**Investigator:** gsd-debugger (read-only — no DB writes)
**Diagnostic script:** `scripts/diag-jds-fy26-assumptions.ts`

---

## Verdict

**FY26 is not corrupt. The audit's CRITICAL flag is a false positive.**

The `force-resave-wizard-state.ts` safety guard correctly aborted because subtracting the audit's hypothetical "bug delta" from FY26's already-correct `wizard.year1.cogs` would push it negative. That negative result is the safety guard doing its job — but the underlying premise (that FY26 `wizard_state` was inflated by the PR #126 bug) is false.

**Recommended action:** No fix required. Optionally update the audit's heuristic to avoid flagging tenants whose wizard_state was last saved before PR #126 merged.

---

## Evidence

### 1. Timeline rules out PR #126 corruption

| Event | Timestamp |
| --- | --- |
| FY26 `updated_at` (last save) | **2026-04-28T20:25:40Z** |
| PR #126 (`917d3267`) merged to main | 2026-05-07T14:02:31+10:00 (~2026-05-07T04:02Z) |

FY26 was last saved **9 days before** PR #126 deployed. The `pct > 1 ? pct : pct * 100` guard could not have run against FY26's wizard rollup. Whatever is in `wizard_state` reflects pre-bug code paths.

### 2. Wizard state Y1 numbers look healthy

```
wizard.year1.revenue:     $9,910,962
wizard.year1.cogs:        $6,075,420   (~61.3% of revenue)
wizard.year1.grossProfit: $3,835,542
wizard.year1.teamCosts:   $2,274,044
wizard.year1.opex:        $1,162,628
wizard.year1.netProfit:     $398,871   (POSITIVE)
```

By contrast, FY27 *was* corrupted: pre-resave `cogs=$76.15M` and `netProfit=-$69.4M`. FY26 shows none of those signatures. The numbers are consistent with a working forecast.

### 3. Math reconciles exactly when pct is treated as percentage-points

FY26's `assumptions.cogs.lines[]` has 29 entries, all `costBehavior=variable`, with `percentOfRevenue` values:
```
2.3, 0.5, 0.7, 3.8, 7.3, 0.8, 0.4, 0.5, 0.2, 1.6, 0.1, 37.1, 0.1,
0.5, 2.7, 0.8, 0.1, 0, 0.2, 0, 0.2, 0.2, 0.9, 0.2, 0.1, 0, 0, 0, 0
```

Sum = **61.30**.

```
revenue × sum_pct / 100  =  9,910,962 × 61.30 / 100  =  $6,075,420
```

This matches `wizard.year1.cogs = $6,075,420` **to the dollar**.

Therefore the wizard rollup that produced this `cogs` was treating `percentOfRevenue` as **percentage-points (0-100)**, not as decimals (0-1). The values like `0.5`, `0.7`, `0.4` are legitimate sub-1% line costs (half-percent, etc.), not bug-inflated decimals.

### 4. Why the audit flagged FY26

The audit's heuristic in `scripts/audit-pct-exposure.ts` flags any active forecast whose `assumptions.cogs.lines[]` contains `0 < percentOfRevenue < 1`, on the assumption that such values would have been 100x-inflated by the PR #126 guard. The audit then computes a hypothetical "bug delta" of `revenue × pct × 0.99` per affected line and tries to subtract it from `wizard_state` to reverse the bug.

For tenants whose wizard_state was actually corrupted post-PR-#126, the formula produces the correct cleanup. For FY26 — which was never touched by the bug — the formula tries to subtract $63.78M from a wizard.year1.cogs that's already only $6.08M. The corrected value is `-$57.7M`, so the resave script's "negative cogs = abort" guard fires.

This is exactly the safety case the abort guard was designed to handle. The guard worked. But the audit's CRITICAL severity is a **false positive** for tenants that predate the bug.

### 5. Shape parity with FY27 confirmed

| | FY26 | FY27 (post-resave) |
| --- | --- | --- |
| version | 1 | 1 |
| fiscalYearStart | 07 | 07 |
| cogs.lines | 29 | 29 |
| revenue.lines | 18 | 17 |
| opex.lines | 39 | 33 |
| metadata | null | null |

Same structural shape, no schema-format difference. No "old assumptions JSON" hypothesis required.

### 6. Hypotheses tested and rejected

| Hypothesis | Result |
| --- | --- |
| `monthlyAmount` in cents but rollup treats as dollars | **Rejected.** No `monthlyAmount` fields in the JSON; values come from `percentOfRevenue` × revenue. |
| Some COGS lines have negative `monthlyAmount` | **Rejected.** All `yearNMonthly` fields are zero/absent (no manual overrides). |
| FY26 saved with prior-year actuals | **Rejected.** Wizard.year1.revenue = $9.91M; FY26 P&L line totals are consistent with forecast inputs. |
| A migration wrote bad data | **Rejected.** Math reconciles exactly to the (correct) percentage-point interpretation. No corruption present. |
| Assumptions JSON is older format | **Rejected.** Shape matches FY27 exactly. |

---

## Severity

**Severity: NONE.** FY26 is functional. Operator can continue using the forecast unchanged.

The only follow-up is documentation: the audit doc at `.planning/phases/57-subscriptions-flow-restructure/normalizedPct-exposure-audit.md` lists FY26 as "CRITICAL" — that label is misleading and should be downgraded with a footnote ("predates PR #126 merge — not exposed").

---

## Recommended action (one paragraph)

**No operator action required for JDS FY26.** The forecast is healthy: `wizard.year1.cogs = $6,075,420` reconciles to revenue × sum-of-percentage-points exactly, `netProfit` is positive ($398,871), and the last save (2026-04-28) predates the PR #126 normalizedPct guard merge (2026-05-07) by 9 days, so the bug never wrote to this row. The `force-resave-wizard-state.ts` safety guard correctly refused to write garbage when fed a delta that exceeded the existing cogs — that's the guard working as designed, not a corruption signal. Optional cleanup: tighten the audit script's heuristic to skip forecasts whose `wizard_state.updated_at < PR_126_MERGE_TIMESTAMP`, which would prevent this false positive in future runs and avoid a repeat of this investigation. If FY26 is later re-saved through the wizard (now that PR #134 has reverted the guard), the wizard rollup will simply recompute the same `~$6.08M` cogs and the row will look identical — no risk in either direction.
