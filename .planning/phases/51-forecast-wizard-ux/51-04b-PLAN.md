---
phase: 51-forecast-wizard-ux
plan: 04b
type: execute
wave: 4
depends_on:
  - 51-04a
files_modified:
  - src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx
  - src/app/finances/forecast/components/wizard-v4/types.ts
  - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
autonomous: true
requirements:
  - UX-S4-03
gap_closure: false

must_haves:
  truths:
    - "TeamMember and NewHire types in types.ts gain optional `payFrequency?: PayFrequency` field where `PayFrequency = 'weekly' | 'fortnightly' | 'monthly'`"
    - "ForecastWizardState gains optional `defaultPayFrequency?: PayFrequency` field (business-level default)"
    - "Step 4 UI: per-employee row shows a pay-frequency selector (3-option dropdown) with `value={member.payFrequency ?? state.defaultPayFrequency ?? 'monthly'}` (back-compat default chain)"
    - "Step 4 UI: business-level default selector visible at the top of the team section (a small dropdown/selector with the 3 options)"
    - "Setting business-level default updates `state.defaultPayFrequency`. New hires inherit (no explicit per-row override needed when row has undefined). Per-row dropdown can override the default."
    - "PURE PERSISTENCE: NO rollup math changes. NO useForecastWizard summary changes. Annual salary calculations are unchanged. The field is consumed by Phase 52 (Xero auto-fill + cashflow timing) — not this plan."
    - "Backward compat: forecasts saved before this plan render identically. Existing rows have `payFrequency === undefined` → display defaults to 'monthly' via the chain. No state mutation on render."
    - "WIZARD_VERSION stays at 10. No localStorage migration. No DB schema migration."
    - "5+ vitest tests under describe('UX-S4-03 — Step 4 pay frequency selector') including (a) per-employee field persistence, (b) business-default field persistence, (c) inheritance/override behavior, (d) back-compat default to monthly when undefined, (e) no rollup math change (annual salary unchanged)."
    - "PR is atomic — adds the field + the UI in one PR. Rollback restores the no-frequency state without breaking saved forecasts."
  artifacts:
    - path: "src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx"
      provides: "UX-S4-03 behavior tests using Step4Harness real-hook pattern"
      contains: "describe('UX-S4-03"
    - path: "src/app/finances/forecast/components/wizard-v4/types.ts"
      provides: "PayFrequency type alias + payFrequency? on TeamMember + NewHire + defaultPayFrequency? on ForecastWizardState"
      contains: "PayFrequency"
    - path: "src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx"
      provides: "Per-employee pay-frequency dropdown + business-default selector"
      contains: "payFrequency"
  key_links:
    - from: "TeamMember + NewHire (types.ts)"
      to: "optional payFrequency field"
      via: "additive optional — undefined falls through to business default → 'monthly'"
      pattern: "payFrequency\\?:"
    - from: "ForecastWizardState"
      to: "optional defaultPayFrequency"
      via: "additive optional — sets the row's default if row is undefined"
      pattern: "defaultPayFrequency\\?:"
    - from: "Step 4 row dropdown"
      to: "actions.updateTeamMember / updateNewHire setting payFrequency"
      via: "wizard action update with `Partial<TeamMember | NewHire>`"
      pattern: "payFrequency:"
    - from: "Step 4 business-default dropdown"
      to: "actions.updateState (or equivalent) setting defaultPayFrequency"
      via: "single state field update"
      pattern: "defaultPayFrequency:"
    - from: "Phase 52 (Xero auto-fill + cashflow timing)"
      to: "reads payFrequency / defaultPayFrequency from saved forecast state"
      via: "FUTURE consumer — not implemented in 51-04b"
      pattern: "Phase 52"
---

<objective>
Pure persistence plan: add a `payFrequency` field to TeamMember + NewHire (per-employee selector) and a `defaultPayFrequency` to the wizard state (business-level default). Surface both in Step 4 UI.

**No rollup math changes.** Annual salary in the Y1/Y2/Y3 summary is annual regardless of pay frequency — pay frequency only affects cashflow timing (which is Phase 52's job). This plan ships the field and the UI; Phase 52 wires it into Xero auto-fill (`EmployeeGroup` / `PayrollCalendar`) and cashflow distribution.

After this plan ships:
- Operator opens Step 4 → sees a business-level "Default pay frequency" selector at the top with options Weekly / Fortnightly / Monthly
- Each team member + new hire row has its own pay-frequency dropdown that inherits from the default when not set
- Setting business default = "Fortnightly" → new rows display "Fortnightly" (still as inherited; the row's own field stays undefined until the operator explicitly picks)
- Per-row override persists independently of the default
- Reload page → both default and per-row selections persist (via localStorage rehydration of state — already covered by existing wizard-state persistence)

This is the LOWEST-RISK plan in Phase 51 (after 51-00 which was math-neutral pre-work). No rollup changes. Tiny surface area. Pure additive optional fields.

Output: 1 new test file (~150-200 LOC) + types.ts (~5 LOC for PayFrequency + 3 optional fields) + Step4Team.tsx (~50-80 net LOC for two selectors). 3 atomic commits. Single PR.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/51-forecast-wizard-ux/PHASE.md
@.planning/phases/51-forecast-wizard-ux/RESEARCH.md
@.planning/phases/51-forecast-wizard-ux/51-04a-SUMMARY.md
@src/app/finances/forecast/components/wizard-v4/types.ts
@src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
@src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
@src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx
@src/__tests__/forecast/phase-51-step4-termination.test.tsx
@src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx

<interfaces>
## types.ts additions

```typescript
// Phase 51 plan 04b (UX-S4-03) — pay frequency for cashflow timing.
// Annual salary calculations are unchanged. This field is consumed by:
//   - Phase 52 Xero auto-fill (PayrollCalendar lookup)
//   - Phase 52 cashflow distribution (pay-period schedule generator)
// Phase 51 only persists the field — downstream consumers come later.
export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly';

export interface TeamMember {
  // ... existing fields ...
  hoursMode?: HoursMode;          // from 51-04a
  payFrequency?: PayFrequency;    // NEW in 51-04b — undefined → inherit defaultPayFrequency → 'monthly'
}

export interface NewHire {
  // ... existing fields ...
  hoursMode?: HoursMode;          // from 51-04a
  payFrequency?: PayFrequency;    // NEW in 51-04b — same back-compat semantics
}

export interface ForecastWizardState {
  // ... existing fields ...

  // Phase 51 plan 04b (UX-S4-03) — business-level default pay frequency.
  // When undefined: rows fall through to 'monthly'.
  // When set: rows with undefined payFrequency display this as their inherited value.
  // Per-row payFrequency override always wins.
  defaultPayFrequency?: PayFrequency;
}
```

## Effective frequency resolver (no helper extraction needed for one site)

```typescript
function getEffectiveFrequency(
  member: { payFrequency?: PayFrequency },
  defaultFreq: PayFrequency | undefined,
): PayFrequency {
  return member.payFrequency ?? defaultFreq ?? 'monthly';
}
```

This is a small enough utility that it can live inline in Step4Team.tsx. If Phase 52 needs it from useForecastWizard.ts as well, extract to `utils/pay-frequency.ts` then. For 51-04b, inline is fine.

## UI: business-default selector (Step 4 top)

```tsx
<div className="flex items-center gap-2 mb-4">
  <label className="text-sm text-gray-600">Default pay frequency:</label>
  <select
    value={state.defaultPayFrequency ?? 'monthly'}
    onChange={e => actions.updateState({ defaultPayFrequency: e.target.value as PayFrequency })}
    aria-label="Default pay frequency"
    className="px-2 py-1 text-sm border border-gray-200 rounded"
  >
    <option value="weekly">Weekly</option>
    <option value="fortnightly">Fortnightly</option>
    <option value="monthly">Monthly</option>
  </select>
  <span className="text-xs text-gray-500">(used for new hires; affects cashflow timing in downstream views)</span>
</div>
```

NOTE: verify `actions.updateState` exists. If not, identify the correct action that updates root-level state fields. Based on conventions, it's likely `actions.updateBusinessProfile` or a dedicated `actions.updateDefaults`. Verify in useForecastWizard.ts during Task 1 read-first.

## UI: per-row dropdown

```tsx
<select
  value={member.payFrequency ?? state.defaultPayFrequency ?? 'monthly'}
  onChange={e => {
    const value = e.target.value as PayFrequency;
    actions.updateTeamMember(member.id, { payFrequency: value });
  }}
  aria-label={`Pay frequency for ${member.name}`}
  className="px-1 py-0.5 text-xs border border-gray-200 rounded"
>
  <option value="weekly">Weekly</option>
  <option value="fortnightly">Fortnightly</option>
  <option value="monthly">Monthly</option>
</select>
```

For new-hire rows, use `actions.updateNewHire(hire.id, { payFrequency: value })`.

**Important:** the dropdown displays the EFFECTIVE frequency (per chain) but only writes to the row's OWN field on user interaction. Setting the business default does NOT mutate per-row fields — rows stay `undefined` until the operator explicitly picks one for that row. This preserves the inheritance relationship.

## Test harness pattern

Reuse `Step4Harness` from `phase-51-step4-pt-casual.test.tsx` (added in 51-04a). Extend with:
- Way to seed `state.defaultPayFrequency` (via `actions.updateState({ defaultPayFrequency: 'fortnightly' })` or equivalent)
- Way to seed teamMembers with explicit `payFrequency` for override tests
</interfaces>

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write 5+ RED tests for Step 4 pay frequency selector (UX-S4-03)</name>
  <files>src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx</files>
  <read_first>
    - src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx (51-04a — Step4Harness pattern)
    - src/__tests__/forecast/phase-51-step4-termination.test.tsx (51-04a — Step4Harness usage)
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx (find the row render + the team section header)
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts (find `updateTeamMember`, `updateNewHire`, and the action that updates root-level state — likely `updateState` or `updateBusinessProfile`)
    - src/app/finances/forecast/components/wizard-v4/types.ts (current TeamMember + NewHire + ForecastWizardState shapes)
  </read_first>
  <behavior>
    Create `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx` with 5+ tests under:

    `describe('UX-S4-03 — Step 4 pay frequency selector')`

    Required tests (each must FAIL on HEAD because the field + UI don't exist):

    - **Test 1 — Per-row dropdown visible.**
      Render Step4Harness with one TeamMember "Alice". Assert: `findByLabelText(/pay frequency for alice/i)` resolves to a `<select>` element.

    - **Test 2 — Default value when payFrequency unset and no business default.**
      Same setup. Assert: dropdown displayed value is "Monthly" (or matches `'monthly'`).

    - **Test 3 — Default value inherits from business default.**
      Render Step4Harness with `state.defaultPayFrequency: 'fortnightly'` seeded, one TeamMember Alice with no own payFrequency. Assert: Alice's dropdown displays "Fortnightly".

    - **Test 4 — Per-row override wins over business default.**
      Same setup as Test 3 but Alice seeded with `payFrequency: 'weekly'`. Assert: Alice's dropdown displays "Weekly".

    - **Test 5 — Setting per-row dropdown persists to state.**
      Render with default 'monthly'. Find Alice's dropdown. Change selection to 'fortnightly'. Assert: `wizard.state.teamMembers[0].payFrequency === 'fortnightly'`.

    - **Test 6 — Business-default selector visible.**
      Render Step4Harness. Assert: `findByLabelText(/default pay frequency/i)` resolves.

    - **Test 7 — Setting business default persists to state.**
      Find the business-default dropdown. Change to 'fortnightly'. Assert: `wizard.state.defaultPayFrequency === 'fortnightly'`.

    - **Test 8 — Setting business default does NOT mutate per-row fields.**
      Render with TeamMember Alice (no own payFrequency). Set business default to 'weekly'. Assert: Alice's `payFrequency` is STILL `undefined` (only display changed). Then set business default back to 'fortnightly'. Assert: Alice's dropdown now displays 'Fortnightly' (display tracks default; row field still undefined).

    - **Test 9 — No rollup math change.**
      Render with TeamMember Alice annual salary $100,000, no payFrequency. Read `wizard.state.summary.year1.teamCosts` (or equivalent) BEFORE. Set Alice's payFrequency to 'weekly'. Re-read. Assert: AFTER === BEFORE. Annual salary is unchanged by pay frequency. **This is the no-rollup-math-change lock.**

    - **Test 10 — Backward compat: forecast without any payFrequency renders identically.**
      Optional but recommended — extend the existing Phase 51 backward-compat test if one exists, or include a regression-lock here that captures rollup output BEFORE the field is added then verifies it stays the same.

    Top-of-file expected-failures comment block:
    ```typescript
    /**
     * UX-S4-03 EXPECTED FAILURES on HEAD (51-04b Task 1 RED):
     * - Tests 1, 6: dropdown labels don't exist → findByLabelText throws
     * - Test 5: TypeScript fails (payFrequency not on TeamMember type)
     * - Test 7: TypeScript fails (defaultPayFrequency not on ForecastWizardState)
     * - Tests 2, 3, 4, 8: dropdown doesn't render → assertions can't run
     * - Test 9: payFrequency not on type → can't set via actions; passes by accident
     */
    ```
  </behavior>
  <action>
    1. Create `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx`.
    2. Reuse `Step4Harness` from 51-04a tests (`phase-51-step4-pt-casual.test.tsx`). Extend the harness if needed to seed `state.defaultPayFrequency` and per-row `payFrequency`.
    3. Verify the action name for updating root state by reading useForecastWizard.ts. Use that action in the harness seeding.
    4. Write Tests 1-10 per the behavior block.
    5. Run vitest:
       ```bash
       npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx 2>&1 | tee /tmp/51-04b-task1-red.log
       ```
       Expected: most tests fail (UI/state field doesn't exist). Some pass by accident.
    6. Commit RED: `test(51-04b): add failing tests for Step 4 pay frequency selector`.
  </action>
  <verify>
    <automated>npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx 2>&1 | tee /tmp/51-04b-task1-red.log; grep -cE "FAIL|Unable to find|error TS" /tmp/51-04b-task1-red.log</automated>
  </verify>
  <acceptance_criteria>
    - File `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx` exists
    - `describe('UX-S4-03 — Step 4 pay frequency selector')` contains >=5 tests (8-10 recommended)
    - Tests for per-row + business-default + override + no-rollup-math present
    - Test 9 (no rollup math change) is the regression-lock for "annual salary unchanged by frequency"
    - Failure log saved to `/tmp/51-04b-task1-red.log`
    - Phase 50 baseline + 51-00 + 51-01 + 51-02 + 51-04a tests still GREEN
    - Step4Harness reused (not reinvented)
  </acceptance_criteria>
  <done>RED tests committed; failure modes documented; harness extended for default + override seeding.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add PayFrequency type + optional payFrequency on TeamMember/NewHire + defaultPayFrequency on ForecastWizardState</name>
  <files>src/app/finances/forecast/components/wizard-v4/types.ts</files>
  <read_first>
    - src/app/finances/forecast/components/wizard-v4/types.ts (HoursMode pattern — lines 19 + the 51-04a additions to TeamMember/NewHire are the precedent)
    - src/app/finances/forecast/components/wizard-v4/types.ts (ForecastWizardState interface around line 496)
  </read_first>
  <action>
    1. Edit `src/app/finances/forecast/components/wizard-v4/types.ts`.

    2. Near the top with the other type aliases (around line 19 where `HoursMode` lives), add:
       ```typescript
       // Phase 51 plan 04b (UX-S4-03) — pay frequency for cashflow timing.
       // Annual salary calculations unchanged. Consumed by Phase 52 (Xero auto-fill +
       // cashflow distribution). Phase 51 only persists the field.
       export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly';
       ```

    3. Locate `interface TeamMember` (line ~146). Add after `hoursMode`:
       ```typescript
       export interface TeamMember {
         // ... existing fields ...
         hoursMode?: HoursMode;
         // Phase 51 plan 04b (UX-S4-03)
         payFrequency?: PayFrequency;
       }
       ```

    4. Locate `interface NewHire` (line ~167). Add after `hoursMode`:
       ```typescript
       export interface NewHire {
         // ... existing fields ...
         hoursMode?: HoursMode;
         // Phase 51 plan 04b (UX-S4-03)
         payFrequency?: PayFrequency;
       }
       ```

    5. Locate `interface ForecastWizardState` (line ~496). Add the business-level default. Place it next to other team-related state if a logical group exists, else at the end:
       ```typescript
       export interface ForecastWizardState {
         // ... existing fields ...

         // Phase 51 plan 04b (UX-S4-03) — business-level default pay frequency.
         // When undefined: rows fall through to 'monthly'.
         // When set: rows with undefined payFrequency display this as inherited.
         // Per-row payFrequency override always wins.
         defaultPayFrequency?: PayFrequency;
       }
       ```

    6. Run tsc:
       ```bash
       npx tsc --noEmit
       ```
       Expected: clean.

    7. Re-run pay-frequency tests — Tests with TypeScript-only failures may now compile but still fail at runtime (no UI yet). That's expected.
       ```bash
       npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx
       ```

    8. Run full forecast suite — STILL GREEN (no consumer reads the new fields yet):
       ```bash
       npx vitest run src/__tests__/forecast/
       ```

    9. Commit: `feat(51-04b): add PayFrequency type + optional payFrequency on TeamMember/NewHire + defaultPayFrequency on state`.
  </action>
  <verify>
    <automated>grep -q "export type PayFrequency" src/app/finances/forecast/components/wizard-v4/types.ts && grep -c "payFrequency\\?: PayFrequency" src/app/finances/forecast/components/wizard-v4/types.ts && grep -q "defaultPayFrequency\\?: PayFrequency" src/app/finances/forecast/components/wizard-v4/types.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `PayFrequency` type alias exported with 3 union members
    - `payFrequency?: PayFrequency` added to BOTH TeamMember and NewHire
    - `defaultPayFrequency?: PayFrequency` added to ForecastWizardState
    - All fields commented with Phase 51 plan 04b reference + Phase 52 future consumer note
    - tsc clean
    - Full forecast suite still GREEN (no consumer reads the field yet)
    - WIZARD_VERSION still 10
    - Step4Team.tsx NOT modified yet (Task 3)
  </acceptance_criteria>
  <done>Type extensions shipped; tsc clean; runtime tests still RED awaiting UI.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add per-row + business-default pay-frequency selectors to Step4Team.tsx (GREEN)</name>
  <files>src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx</files>
  <read_first>
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx (FULL FILE — find row render in TeamTable, find team section header, find action signatures used)
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts (verify `actions.updateTeamMember`, `actions.updateNewHire`, and the action for root state updates — search for `defaultPayFrequency` won't find it yet so look for similar single-field-on-state actions like `updateBusinessProfile` or `updateState`)
    - src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx (Task 1 — the tests this implementation must make GREEN)
  </read_first>
  <behavior>
    After this task lands:
    - Top of the team section in Step 4 renders a "Default pay frequency" dropdown (aria-label `Default pay frequency`) with 3 options. Reads `value={state.defaultPayFrequency ?? 'monthly'}`. Writes via the appropriate state-update action.
    - Each TeamMember row renders a per-row dropdown (aria-label `Pay frequency for <member.name>`) with 3 options. Reads `value={member.payFrequency ?? state.defaultPayFrequency ?? 'monthly'}`. Writes via `actions.updateTeamMember(member.id, { payFrequency })`.
    - Each NewHire row renders the same dropdown. Writes via `actions.updateNewHire(hire.id, { payFrequency })`.
    - Setting the business default does NOT mutate per-row fields — only display tracks the default for rows with undefined own field.
    - Annual salary calculations are unchanged. No rollup math edits.
    - All Task 1 tests GREEN.
  </behavior>
  <action>
    1. **Verify the root-state-update action.** Read useForecastWizard.ts to find the action that updates root-level state fields (likely `updateState` or `updateBusinessProfile`). Use the correct one. If none exists, add a small `setDefaultPayFrequency(freq: PayFrequency)` action — keep it focused.

    2. **Add the business-default selector** at the top of the team section in Step 4. Locate the team section header (above the team table). Insert:
       ```tsx
       <div className="flex items-center gap-2 mb-4">
         <label htmlFor="default-pay-frequency" className="text-sm text-gray-600">
           Default pay frequency:
         </label>
         <select
           id="default-pay-frequency"
           value={state.defaultPayFrequency ?? 'monthly'}
           onChange={e => actions.updateState({ defaultPayFrequency: e.target.value as PayFrequency })}
           aria-label="Default pay frequency"
           className="px-2 py-1 text-sm border border-gray-200 rounded"
         >
           <option value="weekly">Weekly</option>
           <option value="fortnightly">Fortnightly</option>
           <option value="monthly">Monthly</option>
         </select>
         <span className="text-xs text-gray-500">
           (applies to new rows; per-employee override available below)
         </span>
       </div>
       ```
       Replace `actions.updateState` with the verified action from step 1.

    3. **Add the per-row dropdown** in TeamTable's row render. Place it in a logical column (e.g. next to the salary cell, or as a new "Frequency" column). The cell:
       ```tsx
       <td className="px-2 py-1 text-center">
         <select
           value={member.payFrequency ?? state.defaultPayFrequency ?? 'monthly'}
           onChange={e => actions.updateTeamMember(member.id, { payFrequency: e.target.value as PayFrequency })}
           aria-label={`Pay frequency for ${member.name}`}
           className="px-1 py-0.5 text-xs border border-gray-200 rounded"
         >
           <option value="weekly">Weekly</option>
           <option value="fortnightly">Fortnightly</option>
           <option value="monthly">Monthly</option>
         </select>
       </td>
       ```

    4. **Mirror for new-hire rows** — identical dropdown but uses `actions.updateNewHire(hire.id, ...)` and reads `hire.payFrequency`.

    5. **Add a column header** "Frequency" (or "Pay freq") if a new column was added. Match the existing column header style.

    6. **Import `PayFrequency`** from types.ts at the top of Step4Team.tsx if not already imported via a wildcard.

    7. **Run vitest** — Task 1 tests should now pass:
       ```bash
       npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx
       ```

    8. **Run full forecast suite** — confirm no regression:
       ```bash
       npx vitest run src/__tests__/forecast/
       ```
       Expected: all tests GREEN. Test 9 (no rollup math change) MUST pass — annual salary unchanged regardless of pay frequency.

    9. **Run tsc + eslint:**
       ```bash
       npx tsc --noEmit
       npx eslint src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
       ```

    10. **Verify no rollup edits:**
        ```bash
        git diff main -- src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts | head
        ```
        If the action signature update from step 1 required touching useForecastWizard.ts, that's expected (action additions only). NO changes to the rollup useMemo or summary calculation. If the diff shows summary edits, REVERT them — pay frequency does not affect annual salary in Phase 51.

    11. Commit GREEN: `feat(51-04b): add per-employee + business-default pay frequency selectors to Step 4 (UX-S4-03)`.
  </action>
  <verify>
    <automated>grep -q "Default pay frequency" src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx && grep -q "Pay frequency for" src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx && grep -q "payFrequency" src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx && npx tsc --noEmit && npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - Business-default selector rendered with aria-label `Default pay frequency`
    - Per-row selector rendered for every TeamMember with aria-label `Pay frequency for <member.name>`
    - Per-row selector rendered for every NewHire with the same aria-label pattern
    - All 3 selectors offer Weekly / Fortnightly / Monthly options
    - Inheritance chain implemented: `member.payFrequency ?? state.defaultPayFrequency ?? 'monthly'`
    - Setting business default does NOT mutate per-row fields (Test 8 GREEN)
    - All Task 1 tests pass (Tests 1-10 GREEN)
    - Phase 50 baseline (13/13), 51-00 (10/10), 51-01 (5/5), 51-02 (6/6), 51-04a (8/8) all still GREEN
    - Test 9 confirms NO rollup math change — annual salary unchanged by frequency
    - tsc clean
    - eslint clean (no new warnings)
    - WIZARD_VERSION still 10
    - useForecastWizard.ts changes (if any) limited to action additions — NO rollup useMemo edits, NO summary calculation edits
    - `git diff main -- src/app/finances/forecast/components/wizard-v4/` shows ONLY the 3 files in `files_modified` (+ useForecastWizard.ts IF and ONLY IF a new action had to be added)
  </acceptance_criteria>
  <done>UX-S4-03 shipped: per-employee + business-default selectors persist; annual salary math unchanged; ready for Phase 52 to wire Xero auto-fill + cashflow timing.</done>
</task>

</tasks>

<verification>
- [ ] UX-S4-03 per-row dropdown visible with correct default chain (Tests 1, 2, 3, 4)
- [ ] UX-S4-03 per-row override persists to `member.payFrequency` (Test 5)
- [ ] UX-S4-03 business-default dropdown visible (Test 6)
- [ ] UX-S4-03 business-default persists to `state.defaultPayFrequency` (Test 7)
- [ ] UX-S4-03 inheritance: setting business default does NOT mutate per-row fields (Test 8)
- [ ] UX-S4-03 NO rollup math change: annual salary unchanged regardless of frequency (Test 9)
- [ ] Backward compat: existing forecasts without any payFrequency render identically (Test 10 / sentinel)
- [ ] WIZARD_VERSION unchanged (still 10)
- [ ] No localStorage migration; no DB schema migration
- [ ] No useForecastWizard rollup edits (only action addition allowed)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `npx vitest run src/__tests__/forecast/` 100% green
- [ ] `npm run build` succeeds (Vercel CI)
- [ ] Manual sentinel: open Envisage forecast → Step 4 → set business default = "Fortnightly" → save → close → reopen → "Fortnightly" still selected on default + new hire rows still inherit "Fortnightly" → set Alice to "Weekly" → save → close → reopen → Alice still "Weekly", others still "Fortnightly"
</verification>

<success_criteria>
1. **UX-S4-03 shipped:** Operator sets business-level default + per-employee overrides for pay frequency. Field persists to forecast state. Validates PHASE.md success criterion 6.
2. **No rollup math change:** Annual salary in Y1/Y2/Y3 summary is identical before and after — Test 9 regression lock confirms. Phase 52 will consume the field for cashflow distribution + Xero auto-fill.
3. **Backward compat:** Old forecasts without `payFrequency` set render with display defaulting to 'monthly' via the chain. No state mutation on render.
4. **CI green (PHASE.md success criterion 12):** PR merging into main with all 4 required checks (lint + typecheck + vitest + build).
</success_criteria>

<output>
After completion, executor writes `.planning/phases/51-forecast-wizard-ux/51-04b-SUMMARY.md` covering:
- Which UX-S4-03 tests went RED → GREEN per task
- Exact diff scope per file (line counts; types.ts ~5 LOC for type alias + 3 optional fields; Step4Team.tsx ~50-80 net LOC for two selectors)
- Decision: which root-state-update action was used (`updateState`, `updateBusinessProfile`, or new `setDefaultPayFrequency`) — document the choice and why
- Decision: column placement of the per-row Frequency dropdown (new column vs inline in existing cell)
- Confirmation that useForecastWizard.ts rollup useMemo + summary calculation were NOT touched (only action additions if needed)
- Sentinel result: operator manual smoke on Envisage forecast (set business default, override Alice, save/reload)
- Notes for Phase 52:
  - The field shape is `payFrequency?: 'weekly' | 'fortnightly' | 'monthly'` on TeamMember + NewHire and `defaultPayFrequency?: PayFrequency` on state
  - Phase 52 cashflow distribution should call a `getEffectiveFrequency(member, state.defaultPayFrequency)` resolver — extract to `utils/pay-frequency.ts` when Phase 52 needs it from a second site
  - Phase 52 Xero auto-fill maps Xero `EmployeeGroup` / `PayrollCalendar` codes to PayFrequency values — encoding lives in Phase 52
- PR URL for posterity
</output>
