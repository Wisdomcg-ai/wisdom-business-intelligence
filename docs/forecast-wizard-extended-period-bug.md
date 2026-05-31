# Phase 69 — Forecast Wizard Extended-Period Support (DRAFT)

**Status:** Draft / not yet added to roadmap. Run `/gsd:add-phase` after Phase 68 ships.

**Triggered by:** Matt observed 2026-05-29 — Armstrong's forecast Step 3 (RevenueCOGS) only allows editing 3 months instead of a full forecast horizon.

## Root cause (preliminary)

[src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx:547](src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx#L547):

```ts
const completedMonthsCount = currentYTD?.months_count || 0;
const remainingMonthsCount = 12 - completedMonthsCount;
```

When `activeYear === 1`, the wizard:
1. Reads `currentYTD.months_count` (months of actuals synced from Xero for the **current FY**)
2. Locks those months as read-only "actuals"
3. Shows the rest of the 12-month FY as editable forecast cells

**For Armstrong on 2026-05-29:**
- Current FY (FY26): Jul 2025 → Jun 2026
- Months of FY26 actuals from Xero: ~9 (Jul-Aug-Sep-Oct-Nov-Dec-Jan-Feb-Mar)
- `remainingMonthsCount = 12 - 9 = 3` → only Apr/May/Jun 2026 are editable
- **But Armstrong's plan Y1 starts 2026-06-01 (`plan_start_date`) and ends 2027-06-29 (`year1_end_date`)** — they want to forecast FY27 (Jul 2026 → Jun 2027), not the remainder of FY26.

The wizard conflates "current FY" with "plan Y1" — but for extended-period plans where `plan_start_date` is mid-current-FY (or `is_extended_period = true`), Y1 should include the next full FY, not just the current FY's remaining months.

## Related code paths

- [generateMonthKeys](src/app/finances/forecast/components/wizard-v4/types.ts#L1028) — always returns 12 months, no extended-period awareness
- [activeYear handling](src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx#L311) — `fiscalYear - 1 + (activeYear - 1)` assumes plan Y1 == current FY (or current FY + 1)
- `currentYTD` is sourced from Xero sync for the live current FY — correct for the current-FY context but wrong as the lock-source for a forward-looking extended Y1

## Same family as Phase 68's B15 / B16

| Bug | Where | Symptom |
|---|---|---|
| **B15** (Phase 68) | `quarters.ts` `deriveCurrentRemainderColumn` | "Now" column overlaps with planned Y1 when plan starts before FY end |
| **B16** (Phase 68) | `Step4AnnualPlan.tsx` `autoSplitEvenly` | Excludes remainder period from auto-split even when Y1 includes it |
| **NEW (Phase 69)** | `Step3RevenueCOGS.tsx` `remainingMonthsCount` | Locks current-FY actuals as Y1 actuals, leaving only current-FY remainder editable, when Y1 is actually next FY |

Recommend addressing as **Phase 69** after 68 ships, so we don't add scope to an already-large phase. Same architectural fix (extended-period awareness) but a different file/wizard.

## Proposed fix shape

1. **Plumb `is_extended_period` + `plan_start_date` + `year1_end_date` into Step 3 props** (similar to B15's plumbing into `deriveCurrentRemainderColumn`).
2. **Compute `year1MonthKeys` from `plan_start_date` to `year1_end_date`** instead of hardcoded 12 months. Use `generateFiscalMonthKeys` (the non-deprecated version) and slice/extend per the plan dates.
3. **Distinguish "current-FY YTD actuals" from "Y1 forecast period"**:
   - If `plan_start_date > today` AND extended → Y1 has zero actuals, all months editable.
   - If `plan_start_date <= today` AND `today < year1_end_date` → actuals overlay only the months that have BOTH passed AND fall within Y1.
   - Currently the wizard treats `currentYTD.months_count` as authoritative for Y1 locks — wrong when Y1 ≠ current FY.
4. **Same fix likely needed for Step 4 (Team), Step 5 (OpEx), Step 6 (CapEx + Subscriptions), Step 7 (Other), Step 8 (Review)** — they all use `generateMonthKeys` with the same assumptions. Audit and fix in one phase.

## Estimated scope

| Item | Notes |
|---|---|
| Plumb extended-period props | ~30min — `ForecastWizardV4.tsx` source + propagate to each step |
| Fix Step 3 `remainingMonthsCount` logic | ~1h — including tests |
| Audit Steps 4–8 for same pattern | ~1h — likely 3–5 more sites to patch |
| Tests + regression check | ~1h |
| **Total** | ~3.5h, one wave, single PR |

## Open question

Worth confirming with Matt whether other extended-period clients exist (or are likely to in next 6 months). If Armstrong is the only one, this is "fix it because it's wrong"; if multiple, it's "high-leverage platform fix".

## Next action

After Phase 68 merges, run:

```
/gsd:add-phase Forecast wizard extended-period support — Step 3-8 audit and fix
```

Then plan → execute → ship as Phase 69.
