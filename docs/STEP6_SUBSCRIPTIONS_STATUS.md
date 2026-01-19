# Step 6 Subscriptions - Work In Progress Status

**Last Updated:** 2026-01-19
**Branch:** `feature/forecast-wizard-redesign`
**Commit:** `cb63071` - feat: Forecast Wizard V4 with subscription analysis and P&L reconciliation

---

## Current Issue

The Prior FY reconciliation is not matching the actual P&L balance:
- **Analyzed (from transactions):** $31,818
- **Expected (from P&L):** ~$22,000
- **P&L Actual showing:** N/A (extraction not finding the account)

## Root Cause Identified

The Xero P&L Report uses **GUIDs** for account IDs (e.g., `d306cbc5-703b-4d6e-996b-b353fb067b55`), not account codes (e.g., `485`).

The old `extractAccountBalance()` function was searching by account code, which doesn't match anything in the P&L report structure.

## Fix Applied (needs testing)

Created new `extractAccountBalanceByName()` function that:
1. Gets account name from `accountNameMap` (code "485" → actual account name like "Subscriptions")
2. Searches P&L Report rows by **account name** instead of code/GUID
3. Uses fuzzy matching (includes/contains) to find accounts

**File:** `src/app/api/Xero/subscription-transactions/route.ts`
- Lines 281-348: New `extractAccountBalanceByName()` function
- Lines 1130, 1162: Updated to call new function

## To Resume

1. **Start dev server:** `npm run dev`

2. **Refresh Step 6** in Forecast Wizard V4 to trigger new API call

3. **Check logs** for these key entries:
   ```
   [Subscription Txns] Account 485 = "..."      <- Shows actual account name
   [extractAccountBalanceByName] Searching for names: [...]
   [extractAccountBalanceByName] MATCH: "..." = X   <- If found
   ```

4. **If P&L actual still shows N/A:**
   - Check what account 485 is actually named in Xero
   - Verify that name appears in P&L Report
   - May need to adjust matching logic (exact match vs contains)

5. **If P&L actual shows a value but variance is large:**
   - Review the Prior FY monthly breakdown in logs
   - Check if transactions are being incorrectly categorized
   - May be including transactions that shouldn't be in account 485

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/Xero/subscription-transactions/route.ts` | Main API - fetches transactions, analyzes vendors, reconciles to P&L |
| `src/app/api/Xero/chart-of-accounts/route.ts` | Fetches expense accounts for selection |
| `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx` | UI component |
| `src/lib/xero/token-manager.ts` | Centralized token refresh (prevents race conditions) |
| `supabase/migrations/20260118_subscription_budgets.sql` | Database schema for saving budgets |

## Remaining Tasks

1. [ ] Fix P&L reconciliation to properly match account names
2. [ ] Investigate why Prior FY shows $31,818 vs expected $22k
3. [ ] Feed subscription budgets into main forecast model

## Debug Logging

The API has extensive logging. Key sections:
- `[Subscription Txns]` - Main API flow
- `[extractAccountBalanceByName]` - P&L extraction by name
- `[Token Manager]` - Token refresh coordination

Check server console for full trace when refreshing Step 6.

---

## Quick Test Command

```bash
# Watch logs while testing
tail -f /tmp/claude/-Users-mattmalouf-Desktop-business-coaching-platform/tasks/*.output
```
