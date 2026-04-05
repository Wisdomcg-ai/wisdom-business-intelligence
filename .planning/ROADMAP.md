# WisdomBI — Roadmap

## Milestone 1: Stabilise & Fix

### Phase 1: Fix OpEx double-counting [CRITICAL]
**Goal:** Correct the forecast P&L calculations so budget tracker shows accurate numbers
**Requirements:** R1.1
**Tasks:**
1. Filter `isTeamCost()` lines from OpEx sum in `useForecastWizard.ts`
2. Add UI indicator in Step 5 showing excluded wage lines
3. Verify BudgetTracker shows correct % for OpEx and CapEx
4. Verify Step 8 Review P&L waterfall is correct
**Success:** CapEx shows normal %, Net Profit calculation accurate

### Phase 2: Coach shell stability
**Goal:** Coach never loses context during any workflow
**Requirements:** R1.2
**Tasks:**
1. Audit all remaining hardcoded `/finances/...` and `/integrations` URLs
2. Make org selection page navigable back to coach view
3. Test full coach workflow: login → client → forecast → Xero connect → back
**Success:** End-to-end coach flow stays in coach shell

### Phase 3: Xero connection reliability
**Goal:** All Xero features work for any business regardless of ID format
**Requirements:** R1.3
**Tasks:**
1. Apply multi-format ID lookup to any remaining routes
2. Add integration test for connection → sync → employees → subscriptions flow
3. Clean up diagnostic/debug code from employees endpoint
**Success:** No 404s on any Xero endpoint for any business

## Milestone 2: Forecast Builder Enhancements

### Phase 4: Step 2 tabbed P&L polish
**Requirements:** R2.1

### Phase 5: Team data accuracy
**Requirements:** R2.2

### Phase 6: Multi-year forecast
**Requirements:** R2.3

## Milestone 3: Platform Features

### Phase 7: Coaching sessions
**Requirements:** R3.1

### Phase 8: Monthly reporting
**Requirements:** R3.2

### Phase 9: KPI dashboards
**Requirements:** R3.3

### Phase 10: Quarterly reviews
**Requirements:** R3.4
