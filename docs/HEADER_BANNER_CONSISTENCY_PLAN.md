# Page Header/Banner Consistency Plan

**Created:** December 7, 2025
**Status:** In Progress

---

## Problem Statement

The application has 5+ different header/banner patterns across 90 pages, creating visual inconsistency. The user wants to standardize on the Vision Mission Values style: full-width navy banner with orange bottom border.

---

## Solution

Extend the existing `PageHeader` component with a new `variant="banner"` option that provides:
- Full-width (edge-to-edge) layout
- Solid navy background (`bg-brand-navy`)
- Orange bottom border (`border-b-4 border-brand-orange`)
- Icon in orange circle
- White text for title/subtitle

---

## Current State Audit

### Pattern 1: PageHeader Component (Rounded Navy Card) - 44 pages
```
admin, admin/clients, admin/coaches, admin/users, assessment, assessment/[id],
assessment/history, assessment/results, business-dashboard, business-profile,
business-roadmap, coach/actions, coach/analytics, coach/clients, coach/clients/[id],
coach/dashboard, coach/messages, coach/reports, coach/schedule, coach/sessions,
coach/settings, finances/forecast, financials, goals, goals/create, goals/vision,
help, ideas, integrations, issues-list, messages, one-page-plan, open-loops,
quarterly-review, reviews/weekly, sessions, sessions/[id], settings, settings/account,
settings/team, stop-doing, swot, todo, vision-mission
```

### Pattern 2: Full-Width Banner (Custom) - 3 pages
```
vision-mission, business-roadmap, business-profile (partial)
```

### Pattern 3: White Card with Icon Badge - 8 pages
```
team/accountability, team/hiring-roadmap, marketing/value-prop, client/chat,
goals/forecast, swot/history, swot/[id], reviews/quarterly
```

### Pattern 4: Custom Headers - 5 pages
```
dashboard/assessment-results, quarterly-review/workshop, kpi-selection,
swot/compare, ideas/[id]/evaluate
```

### Pattern 5: No Header Needed - 15 pages
```
auth/login, auth/reset-password, auth/update-password, admin/login, coach/login,
privacy, terms, wizard, dashboard, coach-dashboard, page.tsx (root),
client/actions, client/analytics, client/documents, client/sessions
```

---

## Implementation Plan

### Phase 1: Update PageHeader Component
**File:** `src/components/ui/PageHeader.tsx`

Add new variant:
```tsx
variant?: 'default' | 'compact' | 'simple' | 'banner'
```

Banner variant styling:
- Remove rounded corners
- Full-width edge-to-edge
- Add `border-b-4 border-brand-orange`
- Icon uses `bg-brand-orange` instead of `bg-white/10`

---

### Phase 2: Convert Custom Full-Width Banner Pages (3 pages)

| Page | File | Action |
|------|------|--------|
| vision-mission | `src/app/vision-mission/page.tsx` | Remove custom banner, use `<PageHeader variant="banner">` |
| business-roadmap | `src/app/business-roadmap/page.tsx` | Remove custom banner, use `<PageHeader variant="banner">` |
| business-profile | `src/app/business-profile/page.tsx` | Already uses PageHeader, verify consistency |

---

### Phase 3: Convert White Card Header Pages (8 pages)

| Page | File | Current | Action |
|------|------|---------|--------|
| team/accountability | `src/app/team/accountability/page.tsx` | White card | Add PageHeader |
| team/hiring-roadmap | `src/app/team/hiring-roadmap/page.tsx` | White card | Add PageHeader |
| marketing/value-prop | `src/app/marketing/value-prop/page.tsx` | White card | Add PageHeader |
| goals/forecast | `src/app/goals/forecast/page.tsx` | Minimal | Add PageHeader |
| swot/history | `src/app/swot/history/page.tsx` | Minimal | Add PageHeader |
| swot/[id] | `src/app/swot/[id]/page.tsx` | Minimal | Add PageHeader |
| swot/compare | `src/app/swot/compare/page.tsx` | Minimal | Add PageHeader |
| reviews/quarterly | `src/app/reviews/quarterly/page.tsx` | Minimal | Add PageHeader |

---

### Phase 4: Convert Custom Header Pages (5 pages)

| Page | File | Action |
|------|------|--------|
| dashboard/assessment-results | `src/app/dashboard/assessment-results/page.tsx` | Replace custom navy bar with PageHeader banner |
| quarterly-review/workshop | `src/app/quarterly-review/workshop/page.tsx` | Keep as sticky nav (special case) |
| kpi-selection | `src/app/kpi-selection/page.tsx` | Add PageHeader |
| ideas/[id]/evaluate | `src/app/ideas/[id]/evaluate/page.tsx` | Add PageHeader |

---

### Phase 5: Verify Existing PageHeader Pages (44 pages)

All pages already using PageHeader should continue working. Verify:
- Consistent icon usage
- Consistent subtitle patterns
- No visual regressions

---

## Files to Modify

### Component (1 file)
- [ ] `src/components/ui/PageHeader.tsx` - Add banner variant

### Phase 2 Pages (3 files)
- [ ] `src/app/vision-mission/page.tsx`
- [ ] `src/app/business-roadmap/page.tsx`
- [ ] `src/app/business-profile/page.tsx`

### Phase 3 Pages (8 files)
- [ ] `src/app/team/accountability/page.tsx`
- [ ] `src/app/team/hiring-roadmap/page.tsx`
- [ ] `src/app/marketing/value-prop/page.tsx`
- [ ] `src/app/goals/forecast/page.tsx`
- [ ] `src/app/swot/history/page.tsx`
- [ ] `src/app/swot/[id]/page.tsx`
- [ ] `src/app/swot/compare/page.tsx`
- [ ] `src/app/reviews/quarterly/page.tsx`

### Phase 4 Pages (4 files)
- [ ] `src/app/dashboard/assessment-results/page.tsx`
- [ ] `src/app/kpi-selection/page.tsx`
- [ ] `src/app/ideas/[id]/evaluate/page.tsx`
- [ ] `src/app/quarterly-review/workshop/page.tsx` (verify only)

---

## Design Specifications

### Banner Variant
```css
/* Container */
- Full width (no max-width constraint)
- bg-brand-navy (solid, no gradient)
- border-b-4 border-brand-orange
- py-6 px-4 sm:px-6 lg:px-8

/* Icon */
- w-12 h-12
- bg-brand-orange (not bg-white/10)
- rounded-xl

/* Title */
- text-2xl font-bold text-white

/* Subtitle */
- text-white/70
```

---

## Success Criteria

1. All client-facing pages use PageHeader component
2. Visual consistency across all pages
3. Single source of truth for header styling
4. No duplicate banner implementations
5. Type-safe with proper TypeScript support

---

## Rollback Plan

If issues arise:
1. Revert PageHeader changes
2. Custom banners remain in individual pages as fallback
3. Git commit provides restoration point

---

## Progress Tracking

- [x] Phase 1: PageHeader component update (banner variant added)
- [x] Phase 2: VMV, Roadmap, Profile (3 pages) - Updated to use PageHeader banner
- [x] Phase 3: White card pages (8 pages) - All converted to PageHeader banner
- [x] Phase 4: Custom header pages (4 pages) - All converted to PageHeader banner
- [x] Phase 5: Verification - TypeScript check passed
- [x] Type check passing - ✓ December 7, 2025
- [ ] Visual review complete

## Implementation Completed
**Date:** December 7, 2025

### Files Modified:
1. `src/components/ui/PageHeader.tsx` - Added banner variant
2. `src/app/vision-mission/page.tsx` - Converted to PageHeader banner
3. `src/app/business-roadmap/page.tsx` - Converted to PageHeader banner
4. `src/app/team/accountability/page.tsx` - Converted to PageHeader banner
5. `src/app/team/hiring-roadmap/page.tsx` - Converted to PageHeader banner
6. `src/app/marketing/value-prop/page.tsx` - Converted to PageHeader banner
7. `src/app/goals/forecast/page.tsx` - Converted to PageHeader banner
8. `src/app/swot/history/page.tsx` - Converted to PageHeader banner
9. `src/app/swot/[id]/page.tsx` - Converted to PageHeader banner
10. `src/app/swot/compare/page.tsx` - Converted to PageHeader banner
11. `src/app/reviews/quarterly/page.tsx` - Converted to PageHeader banner
12. `src/app/dashboard/assessment-results/page.tsx` - Converted to PageHeader banner
13. `src/app/kpi-selection/page.tsx` - Converted to PageHeader banner
14. `src/app/ideas/[id]/evaluate/page.tsx` - Converted to PageHeader banner
