# Phase 52: Xero Employee Data Auto-Fill

**Milestone:** post-v1.1 — emergent phase
**Status:** Not started
**Source:** Operator (Matt) review of forecast wizard 2026-05-04 + scope refinement 2026-05-08
**Predecessor phases:** 51-04b shipped the per-employee `payFrequency` field + business default; this phase wires Xero auto-fill into that field plus standard hours + hourly rate

## Goal

Auto-populate Step 4 (People) employee fields from the connected Xero tenant's payroll data instead of manual entry. After this phase ships, the operator can:
- Click an "Import from Xero" button on Step 4 → see a list of Xero employees → pick which to import
- For each imported employee, the wizard pre-fills:
  - Pay frequency (weekly / fortnightly / monthly) → into the `payFrequency` field built in 51-04b
  - Standard hours per pay period (e.g., 38 hrs/week) → into a new `standardHours` field
  - Hourly rate ($/hr) → used to derive annual salary OR shown as override input
- The operator can edit any auto-filled field before saving (Phase 51's existing inputs become editable on top of imported data)
- Re-importing later updates fields without losing manual edits (last-write-wins per field, with a "reset to Xero" button)

## Why now

- Phase 51-04b shipped manual entry for `payFrequency` but the operator's original 2026-05-04 review explicitly asked for Xero-sourced auto-fill: "*Step 4 - need to understand the pay cycle of the client, the standard hours per employee and the hourly rate - from XERO.*"
- Manual entry across 5-30 employees per business is error-prone and slow. Auto-fill removes that friction for any business that has Xero Payroll set up.
- The Xero OAuth token + `xero-node` SDK plumbing already exists (encrypted token storage from Phase 46-02; `xero_connections` table; existing read paths for P&L summary and chart-of-accounts). This phase reuses that plumbing for the Payroll endpoints — no new auth flow.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening)** — CI gates catch regressions
- **Phase 51-04b (pay frequency selector)** — shipped the `payFrequency` field this phase auto-fills
- **Phase 46-02 (encryption + APP_SECRET_KEY)** — encrypted Xero token decrypts cleanly
- **`xero-node` SDK** — already a dependency in `package.json`; this phase calls additional endpoints (`getEmployees`, `getEmployee`, `getPayrollCalendars`, `getEarningsRates`) but no new package

## Blast Radius

**Low — read-only Xero API consumption + additive UI on a single step.**

- New API route: `src/app/api/Xero/employees/route.ts` (GET — fetches employee list + their payroll details for a tenant)
- Step 4 UI gains an "Import from Xero" button + a modal/drawer showing fetched employees with checkboxes
- All new types optional; older saved forecasts unaffected
- No DB schema changes; no migrations
- Worst-case rollback: revert PR; "Import from Xero" button disappears; manual entry (the Phase 51-04b path) continues working

The biggest risk is **Xero API rate limits + token-refresh failures**. The phase uses the existing `getValidXeroToken(businessId)` helper (auto-refreshes expired tokens) and respects Xero's 60 req/min rate limit by batching the employee fetch into a single call where possible.

## Requirements (1:1 from operator review + 51-04b carry-over)

- **XERO-S4-01** — Fetch Xero employee list for a connected tenant. Display in a modal/drawer with checkboxes for which to import. Show: employee name, employment type (full-time / part-time / casual), current pay rate, pay frequency.
- **XERO-S4-02** — Auto-fill `payFrequency` from Xero `PayrollCalendar.PayrollCalendarType` (`WEEKLY` → `weekly`, `FORTNIGHTLY` → `fortnightly`, `FOURWEEKLY`/`MONTHLY` → `monthly`). Store the mapping in a small `xero-payroll-mapping.ts` helper.
- **XERO-S4-03** — Auto-fill `standardHours` (per pay period) from Xero `Employee.OrdinaryEarningsRate.NumberOfUnits` × frequency multiplier. New optional field on TeamMember/NewHire.
- **XERO-S4-04** — Auto-fill `hourlyRate` from Xero `EarningsRate.RatePerUnit`. New optional field on TeamMember/NewHire. UI choice: show as derived "annual salary = hourlyRate × standardHours × annualPayPeriodCount", OR keep annual salary as the source of truth with hourlyRate displayed as info.
- **XERO-S4-05** — Re-import without data loss. The operator can re-run "Import from Xero" later (e.g., after adding new employees in Xero). Imported fields update; manually-edited fields are preserved unless the user explicitly clicks "Reset all to Xero values".

## Success Criteria (observable)

1. **Connected tenant lists employees** — operator opens Step 4 with a Xero-connected business; clicks "Import from Xero"; modal shows ≥1 employee with name + current pay frequency + pay rate. (Validates XERO-S4-01.)
2. **Pay frequency mapping is correct** — for an employee with Xero `PayrollCalendarType = "FORTNIGHTLY"`, after import the wizard's `payFrequency` field shows "fortnightly". Vitest unit test on the mapping helper. (Validates XERO-S4-02.)
3. **Standard hours populated** — full-time Xero employee with 38hr standard week → wizard's `standardHours` = 38 (or the equivalent in the displayed unit). (Validates XERO-S4-03.)
4. **Hourly rate populated** — Xero employee with $50/hr → wizard's `hourlyRate` = 50. (Validates XERO-S4-04.)
5. **Re-import preserves manual edits** — operator imports → manually edits salary on one row → re-imports → that row's salary stays edited; other rows pick up Xero changes. (Validates XERO-S4-05.)
6. **Disconnected tenant gracefully degrades** — for a business without a Xero connection, the "Import from Xero" button is disabled (or hidden) with a tooltip "Connect Xero to enable auto-import". No errors in console. Non-blocking.
7. **Rate-limit handling** — if Xero returns 429, the API route surfaces a friendly error message. No crash. (Operational — covered by existing `xero-rate-limit-handler.ts`.)
8. **CI green** — `lint`, `typecheck`, `vitest`, `build` pass on every plan PR.

## Out of scope (deferred to future phases)

- Employees in **multiple** Xero tenants (multi-entity consolidation): Phase 52 fetches from the **default tenant** only; multi-tenant support is a separate phase.
- **Writing back to Xero** (e.g., pushing wizard changes to Xero employee records): pure read in this phase.
- **Earnings categories beyond OrdinaryEarnings** (overtime, allowances, super): Phase 52 only handles OrdinaryEarningsRate; advanced earnings are a separate phase.
- **Cash flow timing using `payFrequency`**: this becomes valuable downstream (forecast P&L breakdown by pay period) but is a different feature, not Phase 52.

## Plans

TBD — drafted by `gsd-planner` after `gsd-phase-researcher` produces RESEARCH.md. Likely 3-4 atomic plans:

- **52-00** — Xero employee read API endpoint (`/api/Xero/employees`) + payroll-calendar mapping helper + tests
- **52-01** — Step 4 "Import from Xero" UI: button + modal/drawer + employee selection + auto-fill of payFrequency + standardHours + hourlyRate
- **52-02** — Re-import flow with manual-edit preservation (XERO-S4-05) — needs an `_xeroImportedAt` timestamp per row to track what was Xero-sourced vs operator-edited
- **52-03** (optional) — Empty-state polish: disabled button + tooltip for businesses without Xero connection; rate-limit error UI

Final plan list confirmed by planner after research.
