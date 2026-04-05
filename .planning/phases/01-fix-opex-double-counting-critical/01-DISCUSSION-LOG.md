# Phase 1: Fix OpEx double-counting [CRITICAL] - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 01-fix-opex-double-counting-critical
**Areas discussed:** Excluded lines UI, Saved forecast handling, Verification approach

---

## Excluded Lines UI

### Q1: How should team cost lines appear in Step 5 OpEx?

| Option | Description | Selected |
|--------|-------------|----------|
| Greyed-out rows with label (Recommended) | Keep wage lines visible but greyed out with a 'Counted in Team Costs' badge | ✓ |
| Collapsible excluded section | Move wage lines to a separate collapsible panel below the main OpEx table | |
| Hidden entirely | Remove wage lines from Step 5 completely | |

**User's choice:** Greyed-out rows with label (Recommended)
**Notes:** User selected with preview showing greyed-out rows inline with regular OpEx lines.

### Q2: Should excluded rows be grouped at top or stay in Xero order?

| Option | Description | Selected |
|--------|-------------|----------|
| Top of table, grouped (Recommended) | Team cost lines show first as a greyed-out group with subtle divider | |
| Original Xero order | Lines stay in order from Xero P&L, greyed-out rows scattered among regular lines | ✓ |

**User's choice:** Original Xero order
**Notes:** Preserves the accounting structure coaches recognise from Xero.

### Q3: Static inline label or tooltip on hover?

| Option | Description | Selected |
|--------|-------------|----------|
| Static inline label (Recommended) | Always-visible 'Counted in Team Costs' text/badge, no hover required | ✓ |
| Tooltip on hover | Small (Team) indicator with tooltip explaining exclusion on hover | |

**User's choice:** Static inline label (Recommended)
**Notes:** None

### Q4: Show prior year amount or blank amounts?

| Option | Description | Selected |
|--------|-------------|----------|
| Show prior year amount (read-only) | Display Xero amount so coach can cross-reference Team Costs | ✓ |
| Blank amounts | No dollar value — just account name and label | |

**User's choice:** Show prior year amount (read-only)
**Notes:** Useful for cross-referencing what's in Team Costs.

---

## Saved Forecast Handling

### Q1: How should existing saved forecasts with double-counted OpEx be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Fix on next load (Recommended) | Wizard re-classifies on load, no migration needed | ✓ |
| Run a data migration | One-time script to update saved records in Supabase | |
| Both — migrate + fix on load | Belt-and-suspenders approach | |

**User's choice:** Fix on next load (Recommended)
**Notes:** No migration — fix is in calculation layer.

---

## Verification Approach

### Q1: How to verify the fix is correct?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual check in wizard | Load forecast, eyeball that OpEx % is reasonable | |
| Compare to Xero totals | Cross-reference wizard output against actual Xero P&L | |
| You decide | Claude's discretion for verification criteria | ✓ |

**User's choice:** You decide
**Notes:** Claude will define reasonable verification criteria.

---

## Claude's Discretion

- Technical filtering approach (reducer vs useMemo vs render-time)
- Exact styling of greyed-out rows
- Whether to add summary count above table
- Verification criteria specifics

## Deferred Ideas

None — discussion stayed within phase scope
