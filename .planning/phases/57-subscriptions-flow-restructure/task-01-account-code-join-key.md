# Task 01 — Audit join key + add `accountCode` to `OpExLine`

**Ship batch:** B1 (Foundation) · **Wave:** 1 · **Dependencies:** none · **Risk:** LOW

## Goal

Establish `accountCode` (Xero's user-facing code, e.g. "5100") as the canonical join key between `OpExLine` (Step 6 OpEx data) and `VendorBudget.accountCodes[]` (Step 5 Subscriptions data). Today `OpExLine.accountId` is populated with a Xero account *name* or category in many code paths — that ambiguity is a pre-existing bug the rollup change in T07 cannot tolerate.

## Why this is Task 1

T07 (rollup math) needs to skip `OpExLine`s whose `accountCode` appears in any active subscription's `accountCodes[]`. If `accountCode` isn't reliably populated, the exclusion silently fails and Phase 57 ships double-counting on real client data. The research (RESEARCH.md section B, Unknown 1) flagged this as the gating audit.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/types.ts` (~5 lines)
  - Add optional field `accountCode?: string` to `OpExLine` (`types.ts:~315`)
  - Brief JSDoc: "Phase 57: Xero account code (e.g. '5100') used as join key with VendorBudget.accountCodes[]. Optional for back-compat; legacy lines may have only accountId or accountName."
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~30 lines)
  - `initializeFromXero` (~line 448): when constructing OpEx lines from chart-of-accounts data, set `accountCode` from `cat.account_code || cat.code`
  - `refreshOpExLines` (~line 1119): same pattern
  - Both ingest paths must `.trim()` to defend against whitespace-padded codes from Xero
- `src/app/api/Xero/chart-of-accounts/route.ts` (audit only — verify response includes `accountCode`; if missing, this task expands to add it)

## Implementation notes

### Step 1: Audit (30 min)
Run these greps and document what's there:
```bash
grep -n "accountId:" src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
grep -n "accountCode\|account_code" src/app/api/Xero/chart-of-accounts/route.ts
grep -n "accountId\|accountCode" src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx
```

Confirm:
- `chart-of-accounts/route.ts` returns `accountCode` (the user-facing code) AND `accountId` (the UUID) on each account row
- `Step6Subscriptions.tsx:565` writes `accountCodes[]` populated from `summary.accountsAnalyzed` — verify `accountsAnalyzed` is codes, not UUIDs

If the audit reveals codes are missing from one of the API responses, this task grows to include adding them (one extra ~10-line change).

### Step 2: Add field to OpExLine type
Open `types.ts:~315` (where `OpExLine` interface lives — search for `interface OpExLine`). Add:
```typescript
/**
 * Phase 57: Xero account code (e.g. "5100"). Used as the join key with
 * VendorBudget.accountCodes[] to detect subscription-covered OpEx lines and
 * exclude them from the rollup. Optional for back-compat; soft-migration in
 * useForecastWizard.ts (Phase 57 v10→v11) populates from accountId/accountName
 * fallback when missing.
 */
accountCode?: string;
```

### Step 3: Populate during Xero ingest
Two sites in `useForecastWizard.ts`:

**Site A — `initializeFromXero`** (around line 448 — search for `opexLines.push`):
```typescript
opexLines.push({
  // ... existing fields ...
  accountId: cat.account_name || cat.category,  // existing — keep for back-compat
  accountCode: typeof cat.account_code === 'string' ? cat.account_code.trim() : undefined,  // NEW
  // ... rest ...
});
```

**Site B — `refreshOpExLines`** (around line 1119 — same pattern). Mirror the change.

### Step 4: Confirm no other writers
```bash
grep -n "OpExLine\|opexLines" src/app/finances/forecast/components/wizard-v4/ -r | grep -i "push\|add\|new"
```
If Step5OpEx.tsx or any test fixture creates OpExLine objects, add `accountCode` (or leave undefined for manually-entered lines). Manually-entered OpEx (operator types in a description without picking a Xero account) won't have a code — that's fine.

## Acceptance criteria

- [ ] `OpExLine.accountCode?: string` exists in types.ts and JSDoc explains its purpose
- [ ] After running `initializeFromXero` against JDS data, every Xero-sourced OpExLine has `accountCode` populated (verified by `console.log(state.opexLines.map(l => ({id: l.accountId, code: l.accountCode})))` in dev)
- [ ] Manually-added OpExLine entries (operator types description without Xero pick) have `accountCode === undefined` — does not crash
- [ ] `npm run build` clean (no new tsc errors)
- [ ] No existing tests broken (`npm test -- forecast`)
- [ ] Audit notes captured inline in commit message: "Confirmed chart-of-accounts/route.ts returns accountCode at line X; subscription_budgets.account_codes[] stores codes (not UUIDs) at line Y."

## Regression risks

- **None to existing behavior.** Field is optional and additive. Old saved forecasts have `accountCode === undefined` on every line; T07 (rollup) handles that by falling through to name-based match.
- **Xero API shape drift:** if `account_code` is renamed in chart-of-accounts response, ingest silently sets `undefined`. Mitigated by audit step. If concerned, add a one-line warn: `if (!cat.account_code) console.warn('[OpEx ingest] Missing account_code on', cat.account_name)` — DELETE before B1 ships.

## Test

Add to `src/__tests__/forecast/phase-57-account-code-ingest.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
// Test fixture-based: feed initializeFromXero a known cat with account_code='5100', assert opexLine.accountCode === '5100'.
// If ingest is private to the hook, test via the OpExLine type at minimum (compile-time check).
```

Minimum: a TypeScript compile-only assertion in a `.test-d.ts` file confirming `accountCode?: string` is on the type. If reach is needed, mock the chart-of-accounts response and assert one of the produced `OpExLine`s has the code.

## Estimated effort

0.5 day (audit + 2 ingest sites + 1 test).
