---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 11
status: complete
completed: 2026-05-29
---

# Plan 68-11 — B4: category + priority badges — SUMMARY

## What was built

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx) — added `CATEGORY_PALETTE`, `PRIORITY_PALETTE`, `getCategoryStyle`, `getPriorityStyle`, and `overrideBadgeForColoredCard` helpers, and wired them into both initiative card render sites.

### Cards now show

**Kanban (quarter-assigned) card:** title + optional `category` badge + optional `priority` badge, all in a small wrapping flex row.

**Available pool card:** existing source badge (ROADMAP / STRATEGIC / OPERATIONAL) PLUS new `category` and `priority` badges next to it. Source badge unchanged.

### Palette

| Category | Display |
|---|---|
| marketing | MKTG (pink) |
| finance | FIN (emerald) |
| people | PPL (violet) |
| systems | SYS (sky) |
| customer_experience / cx | CX (amber) |
| leadership | LEAD (indigo) |
| time | TIME (orange) |
| diversification | DIV (rose) |
| growth | GROW (rose) |
| operations | OPS (cyan) |
| product | PROD (fuchsia) |
| sales | SALE (lime) |
| other | OTHR (gray) |
| (unknown) | uppercase first 4 chars on gray |

| Priority | Display |
|---|---|
| high | HIGH (red) |
| medium | MED (amber) |
| low | LOW (slate) |

### Deviation from PLAN

PLAN's CATEGORY_PALETTE had 9 entries. I extended it to 14 to cover **every category currently in the live DB enum** I discovered during 68-03/68-05 surprises: `customer_experience` (the exact enum key with underscore), `growth` (semantic alignment with the diversification ideas), `operations`, `product`, `sales`, `other`. Otherwise these would fall to the generic gray fallback. No effect on PLAN compliance — palette is additive.

## Coloured-card override

Roadmap / strategic cards have brand-navy or brand-orange backgrounds. The contextual `bg-{color}-100` + `text-{color}-700` palette would be unreadable there. `overrideBadgeForColoredCard()` rewrites those badges to `bg-white/20 text-white` when the card is coloured. Operational (white) cards use the contextual palette directly.

## Acceptance criteria

### Static (all pass)
- ✓ File contains `CATEGORY_PALETTE` Record with marketing/finance/people/systems/customer_experience/cx/leadership/time/diversification (+ extras)
- ✓ File contains `PRIORITY_PALETTE` with high/medium/low
- ✓ `getCategoryStyle` referenced ≥ 2 times (kanban + Available)
- ✓ `getPriorityStyle` referenced ≥ 2 times
- ✓ `overrideBadgeForColoredCard` used in both card sites
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint src/app/goals/components/Step4AnnualPlan.tsx` exits 0 (2 pre-existing warnings remain)
- ✓ `StrategicInitiative` type already has `category?` and `priority?` per src/app/goals/types.ts:72-73 — no type changes needed

## Files

| Path | Change |
|---|---|
| `src/app/goals/components/Step4AnnualPlan.tsx` | +66 lines (palette + helpers + 2 card render updates) |

## Next plan

**Plan 68-12** — B5: per-quarter engine balance bar (stacked 6px) under each quarter column header.

## Self-Check

PASSED. Both card sites now show category + priority badges with readable colours on every background. Palette extended beyond PLAN to cover all live DB enum categories. tsc + lint clean.
