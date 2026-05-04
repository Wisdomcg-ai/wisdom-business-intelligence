# WisdomBi UI/UX Implementation Plan

**Date:** December 6, 2025
**Total Phases:** 5
**Estimated Files to Modify:** 60+

---

## Phase 1: Critical Bug Fixes (Do First)

### 1.1 Fix `brand-brand-teal` Typos

**Search & Replace:** `brand-brand-` → `brand-`

| File | Action |
|------|--------|
| `/src/app/business-profile/page.tsx` | Fix line 181 |
| `/src/app/business-roadmap/page.tsx` | Fix progress bars |
| `/src/app/assessment/page.tsx` | Fix progress bar |
| `/src/app/goals/create/page.tsx` | Fix line 183 |
| `/src/components/strategic-initiatives.tsx` | Fix line 932 |
| `/src/app/marketing/value-prop/page.tsx` | Fix lines 355, 370 |

**Command:**
```bash
find src -name "*.tsx" -exec sed -i '' 's/brand-brand-/brand-/g' {} \;
```

### 1.2 Fix Ideas Journal Primary Button

**File:** `/src/app/ideas/page.tsx`

**Change:**
```tsx
// FROM:
bg-amber-500 hover:bg-amber-600

// TO:
bg-brand-orange hover:bg-brand-orange-600
```

### 1.3 Fix Goals Create Purple Usage

**File:** `/src/app/goals/create/page.tsx`

**Change:**
```tsx
// FROM:
bg-purple-50, border-purple-500, text-purple-700

// TO:
bg-brand-teal-50, border-brand-teal-500, text-brand-teal-700
```

### 1.4 Fix Landing Page Hardcoded Colors

**File:** `/src/app/page.tsx`

**Changes:**
```tsx
// FROM:
bg-[#e8862a] → bg-brand-orange
bg-[#1e3a5f] → bg-brand-navy
text-[#0d9488] → text-brand-teal
hover:bg-[#d17825] → hover:bg-brand-orange-600
hover:bg-[#152d4a] → hover:bg-brand-navy-800
```

---

## Phase 2: Sidebar Redesign (High Impact)

### 2.1 Client Portal Sidebar

**File:** `/src/components/layout/sidebar-layout.tsx`

**Current State:**
- Background: White (`bg-white`)
- Text: Gray (`text-gray-600`, `text-gray-900`)
- Active: Orange bg with orange border
- Borders: Gray (`border-gray-200`)

**Target State:**
- Background: Navy (`bg-brand-navy`)
- Text: White (`text-white`, `text-white/70`)
- Active: Teal bg with orange left border
- Borders: Navy lighter (`border-brand-navy-700`)

**Key Changes:**
```tsx
// Sidebar container
- bg-white border-r border-gray-200
+ bg-brand-navy

// Logo header
- bg-white border-b border-gray-200
+ bg-white border-b border-gray-200  // KEEP white for logo visibility

// Nav items
- text-gray-600 hover:text-gray-900 hover:bg-gray-50
+ text-white/70 hover:text-white hover:bg-white/10

// Active nav item
- bg-brand-orange/10 text-brand-navy border-r-2 border-brand-orange
+ bg-brand-teal/20 text-white border-l-4 border-brand-orange

// Section headers
- text-gray-400 uppercase
+ text-white/50 uppercase

// User section
- bg-gray-50 border-t border-gray-100
+ bg-brand-navy-800 border-t border-brand-navy-700

// User name
- text-gray-900
+ text-white

// User email/role
- text-gray-500
+ text-white/60
```

### 2.2 Update Coach Sidebar (Match Client)

**File:** `/src/components/layouts/CoachLayoutNew.tsx`

Apply same navy background treatment for consistency.

### 2.3 Admin Sidebar Already Done

The admin sidebar already uses `bg-slate-900` (dark) - this is acceptable.

---

## Phase 3: Global Color Replacements

### 3.1 Page Background Color

**Search & Replace across all files:**

```bash
# Replace slate-50 with brand-navy-50 for page backgrounds
find src/app -name "*.tsx" -exec sed -i '' 's/bg-slate-50/bg-brand-navy-50/g' {} \;
```

**Note:** Need to add `brand-navy-50` to Tailwind config if not present.

### 3.2 Primary Text Color

**Search & Replace:**
```bash
# Main headings
find src -name "*.tsx" -exec sed -i '' 's/text-gray-900/text-brand-navy-900/g' {} \;

# Secondary text
find src -name "*.tsx" -exec sed -i '' 's/text-gray-600/text-brand-navy-600/g' {} \;

# Tertiary text
find src -name "*.tsx" -exec sed -i '' 's/text-gray-500/text-brand-navy-500/g' {} \;
```

### 3.3 Info Box Standardization

**Replace all info box backgrounds with brand-teal-50:**

| Current | Replace With |
|---------|--------------|
| `bg-amber-50` | `bg-brand-teal-50` |
| `bg-purple-50` (non-AI) | `bg-brand-teal-50` |
| `bg-emerald-50` | `bg-brand-teal-50` |
| `bg-yellow-50` | `bg-brand-teal-50` |

**Exception:** Keep `bg-red-50` for error states.

### 3.4 Button Standardization

**Primary Buttons:** Already use `bg-brand-teal` ✓

**Accent/Important CTAs:** Change to `bg-brand-orange`
- "Get Started" buttons
- "Complete" buttons
- Important form submissions

**Secondary Buttons:**
```tsx
// FROM:
bg-gray-100 text-gray-700 hover:bg-gray-200

// TO:
bg-brand-navy-100 text-brand-navy-700 hover:bg-brand-navy-200
```

---

## Phase 4: Page-Specific Fixes

### 4.1 Weekly Review (8 colors → 3)

**File:** `/src/app/reviews/weekly/page.tsx`

| Section | Current Color | New Color |
|---------|---------------|-----------|
| Energy Rating | Purple | Navy |
| Week Rating | Amber | Orange |
| Wins | Green | Teal |
| Challenges | Amber | Orange |
| Financial | Emerald | Teal |
| Important Dates | Purple | Navy |

### 4.2 KPI Selection (7 categories → 3 groups)

**File:** `/src/app/kpi-selection/page.tsx`

| Category | Current | New |
|----------|---------|-----|
| ATTRACT | Purple | Teal |
| CONVERT | Teal | Teal |
| DELIVER | Green | Teal |
| DELIGHT | Pink | Orange |
| PEOPLE | Orange | Orange |
| PROFIT | Yellow | Orange |
| SYSTEMS | Gray | Navy |

### 4.3 Value Proposition AI Colors

**File:** `/src/app/marketing/value-prop/page.tsx`

```tsx
// FROM:
bg-purple-50, text-purple-600, bg-purple-600

// TO:
bg-brand-navy-50, text-brand-navy-600, bg-brand-navy
```

### 4.4 Financials Page Icon Colors

**File:** `/src/app/financials/page.tsx`

| Metric | Current | New |
|--------|---------|-----|
| Cash | Green | Teal |
| Revenue | Teal | Teal |
| Net Profit | Purple | Orange |
| Expenses | Red | Navy |

### 4.5 Settings - Remove Hardcoded Xero Color

**File:** `/src/app/settings/page.tsx`

```tsx
// FROM:
bg-[#13B5EA]

// TO:
bg-brand-teal
```

---

## Phase 5: Polish & Consistency

### 5.1 Add Orange Accents to Key CTAs

**Files to update:**
- Dashboard "Quick Actions" buttons
- Assessment "Start Assessment" button
- Goals "Create Goal" button
- Business Profile "Complete Profile" button

### 5.2 Standardize Button Hover States

All primary buttons:
```tsx
bg-brand-teal hover:bg-brand-teal-700
```

All accent buttons:
```tsx
bg-brand-orange hover:bg-brand-orange-600
```

All secondary buttons:
```tsx
bg-brand-navy-100 hover:bg-brand-navy-200
```

### 5.3 Unify Badge/Pill Colors

**Status Badges:**
| Status | Background | Text |
|--------|------------|------|
| Active/Success | `bg-brand-teal-100` | `text-brand-teal-700` |
| Warning/Pending | `bg-brand-orange-100` | `text-brand-orange-700` |
| Error/Danger | `bg-red-100` | `text-red-700` |
| Neutral/Default | `bg-brand-navy-100` | `text-brand-navy-700` |

### 5.4 Add Navy Gradients for Headers

**Pages that could benefit:**
- Dashboard hero section
- Assessment header
- Goals page header
- Quarterly Review header

**Pattern:**
```tsx
bg-gradient-to-r from-brand-navy to-brand-navy-800
```

---

## Tailwind Config Updates Required

### Add Missing Color Shades

**File:** `tailwind.config.js`

Ensure these exist:
```js
colors: {
  'brand-navy': {
    50: '#f0f4f8',
    100: '#d9e2ec',
    200: '#bcccdc',
    300: '#9fb3c8',
    400: '#829ab1',
    500: '#627d98',
    600: '#486581',
    700: '#334e68',
    800: '#243b53',
    900: '#1e3a5f',
    DEFAULT: '#1e3a5f',
  },
  'brand-teal': {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    DEFAULT: '#0d9488',
  },
  'brand-orange': {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#e8862a',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
    DEFAULT: '#e8862a',
  },
}
```

---

## File Change Summary

| Phase | Files | Type of Change |
|-------|-------|----------------|
| Phase 1 | ~10 | Bug fixes, typo corrections |
| Phase 2 | 2 | Sidebar redesign |
| Phase 3 | 60+ | Global find/replace |
| Phase 4 | 5 | Page-specific fixes |
| Phase 5 | 10+ | Polish and consistency |

**Total Estimated:** 80+ files

---

## Testing Checklist

After each phase, verify:

- [ ] No console errors
- [ ] All buttons clickable and visible
- [ ] Text readable on all backgrounds
- [ ] Forms still functional
- [ ] Mobile responsive
- [ ] Dark mode (if applicable)
- [ ] Loading states visible
- [ ] Error states visible
- [ ] Success states visible

---

## Rollback Plan

Before starting, create a git branch:
```bash
git checkout -b ui-redesign-dec-2025
git add .
git commit -m "Pre-redesign snapshot"
```

If issues arise:
```bash
git checkout main
```
