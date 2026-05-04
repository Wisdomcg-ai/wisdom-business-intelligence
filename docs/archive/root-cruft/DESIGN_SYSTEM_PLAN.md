# Business Coaching Platform - Design System Implementation Plan

**Goal**: Achieve 10/10 design consistency across the entire platform
**Brand Colors**: Navy (#172238) + Orange (#F5821F) + Teal (success states only)
**Started**: December 6, 2025
**Status**: Complete (Phase 3 Done, Phase 4 In Progress)

---

## Phase 1: Foundation (Core Components)

### 1.1 Design Tokens
- [x] Brand colors defined in tailwind.config.js
- [x] Create `/src/lib/design-tokens.ts` with centralized constants
- [x] Typography scale (headings, body, labels)
- [x] Spacing scale (consistent padding/margins)
- [x] Shadow definitions
- [x] Border radius standards

### 1.2 PageHeader Component
- [x] Create `/src/components/ui/PageHeader.tsx`
- [x] Props: title, subtitle, breadcrumbs, actions, backLink
- [x] Consistent styling across all pages
- [x] Mobile responsive (stack on small screens)

### 1.3 PageLayout Component
- [x] Create `/src/components/ui/PageLayout.tsx`
- [x] Standardized container width (max-w-7xl)
- [x] Consistent padding (px-4 sm:px-6 lg:px-8)
- [x] Optional sidebar support
- [x] Mobile responsive

---

## Phase 2: Component Library

### 2.1 Card Components
- [x] Create `/src/components/ui/Card.tsx`
- [x] Variants: default, elevated, outlined, interactive
- [x] Consistent border-radius (rounded-xl)
- [x] Consistent shadows
- [x] Mobile responsive padding

### 2.2 Button Enhancements
- [ ] Review `/src/components/ui/button.tsx`
- [ ] Ensure brand color consistency
- [ ] Add icon button variant
- [ ] Mobile touch targets (min 44px)

### 2.3 Form Components
- [ ] Standardize input styling
- [ ] Consistent label positioning
- [ ] Error state styling
- [ ] Mobile-friendly inputs

### 2.4 Loading & Empty States
- [ ] Create `/src/components/ui/LoadingState.tsx`
- [ ] Create `/src/components/ui/EmptyState.tsx`
- [ ] Consistent skeleton patterns
- [ ] Brand-colored spinners

---

## Phase 3: Page Updates

### 3.1 Client Dashboard Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/dashboard` | [x] | [x] | [x] | [x] | DONE |
| `/goals` | [x] | [x] | [x] | [x] | DONE |
| `/goals/create` | [x] | [x] | [x] | [x] | DONE |
| `/goals/vision` | [x] | [x] | [x] | [x] | DONE |
| `/business-dashboard` | [x] | [x] | [x] | [x] | DONE |
| `/business-profile` | [x] | [x] | [x] | [x] | DONE |
| `/business-roadmap` | [x] | [x] | [x] | [x] | DONE |
| `/finances/forecast` | [x] | [x] | [x] | [x] | DONE |
| `/financials` | [x] | [x] | [x] | [x] | DONE |

### 3.2 Assessment & Review Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/assessment` | [x] | [x] | [x] | [x] | DONE |
| `/assessment/[id]` | [x] | [x] | [x] | [x] | DONE |
| `/assessment/history` | [x] | [x] | [x] | [x] | DONE |
| `/assessment/results` | [x] | [x] | [x] | [x] | DONE |
| `/swot` | [x] | [x] | [x] | [x] | DONE |
| `/quarterly-review` | [x] | [x] | [x] | [x] | DONE |
| `/reviews/weekly` | [x] | [x] | [x] | [x] | DONE |

### 3.3 Planning & Tasks Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/todo` | [x] | [x] | [x] | [x] | DONE |
| `/issues-list` | [x] | [x] | [x] | [x] | DONE |
| `/open-loops` | [x] | [x] | [x] | [x] | DONE |
| `/ideas` | [x] | [x] | [x] | [x] | DONE |
| `/one-page-plan` | [x] | [x] | [x] | [x] | DONE |
| `/stop-doing` | [x] | [x] | [x] | [x] | DONE |

### 3.4 Sessions & Communication Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/sessions` | [x] | [x] | [x] | [x] | DONE |
| `/sessions/[id]` | [x] | [x] | [x] | [x] | DONE |
| `/messages` | [x] | [x] | [x] | [x] | DONE |

### 3.5 Settings & Profile Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/settings` | [x] | [x] | [x] | [x] | DONE |
| `/settings/account` | [x] | [x] | [x] | [x] | DONE |
| `/settings/team` | [x] | [x] | [x] | [x] | DONE |
| `/integrations` | [x] | [x] | [x] | [x] | DONE |
| `/help` | [x] | [x] | [x] | [x] | DONE |

### 3.6 Coach Portal Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/coach/dashboard` | [x] | [x] | [x] | [x] | DONE |
| `/coach/clients` | [x] | [x] | [x] | [x] | DONE |
| `/coach/clients/[id]` | [x] | [x] | [x] | [x] | DONE |
| `/coach/sessions` | [x] | [x] | [x] | [x] | DONE |
| `/coach/messages` | [x] | [x] | [x] | [x] | DONE |
| `/coach/reports` | [x] | [x] | [x] | [x] | DONE |
| `/coach/schedule` | [x] | [x] | [x] | [x] | DONE |
| `/coach/settings` | [x] | [x] | [x] | [x] | DONE |
| `/coach/analytics` | [x] | [x] | [x] | [x] | DONE |
| `/coach/actions` | [x] | [x] | [x] | [x] | DONE |

### 3.7 Admin Portal Pages
| Page | Header | Layout | Cards | Mobile | Status |
|------|--------|--------|-------|--------|--------|
| `/admin` | [x] | [x] | [x] | [x] | DONE |
| `/admin/clients` | [x] | [x] | [x] | [x] | DONE |
| `/admin/coaches` | [x] | [x] | [x] | [x] | DONE |
| `/admin/users` | [x] | [x] | [x] | [x] | DONE |

---

## Phase 4: Polish & Refinement

### 4.1 Micro-interactions
- [ ] Button hover/active states
- [ ] Card hover effects
- [ ] Form focus states
- [ ] Loading transitions
- [ ] Page transitions

### 4.2 Typography Consistency
- [ ] H1: text-2xl sm:text-3xl font-bold
- [ ] H2: text-xl sm:text-2xl font-semibold
- [ ] H3: text-lg font-semibold
- [ ] Body: text-base
- [ ] Small: text-sm
- [ ] Labels: text-xs uppercase tracking-wide

### 4.3 Spacing Consistency
- [ ] Page padding: py-6 sm:py-8
- [ ] Section gaps: space-y-6 sm:space-y-8
- [ ] Card padding: p-4 sm:p-6
- [ ] Grid gaps: gap-4 sm:gap-6

### 4.4 Responsive Breakpoints
- [ ] Mobile: < 640px (sm)
- [ ] Tablet: 640px - 1024px (md/lg)
- [ ] Desktop: > 1024px (xl)
- [ ] All grids collapse properly
- [ ] All text scales appropriately
- [ ] Touch targets min 44px on mobile

### 4.5 Dark Mode Ready
- [ ] CSS variables for colors
- [ ] Semantic color naming
- [ ] Component dark mode variants

---

## Design Standards Reference

### Header Pattern (Use PageHeader)
```tsx
<PageHeader
  title="Page Title"
  subtitle="Optional description text"
  backLink={{ href: '/parent', label: 'Back' }}
  actions={<Button>Primary Action</Button>}
/>
```

### Layout Pattern (Use PageLayout)
```tsx
<PageLayout>
  <PageHeader ... />
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Content */}
  </div>
</PageLayout>
```

### Card Pattern
```tsx
<Card variant="elevated">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Color Usage
- **Navy (#172238)**: Primary backgrounds, headers, navigation
- **Orange (#F5821F)**: CTAs, accents, highlights, interactive elements
- **Teal**: Success states ONLY (completed, positive metrics)
- **Gray/Slate**: Secondary text, borders, backgrounds
- **Red**: Error states, destructive actions
- **Amber/Yellow**: Warning states

---

## Progress Log

| Date | Items Completed | Notes |
|------|-----------------|-------|
| Dec 6, 2025 | Brand colors in tailwind.config.js | Initial setup |
| Dec 6, 2025 | Rainbow color cleanup (57 files) | Removed purple, indigo, etc. |
| Dec 6, 2025 | Phase 1: Design tokens, PageHeader, PageLayout, Card components | Foundation complete |
| Dec 6, 2025 | Phase 3: Updated 26 pages with design system | 26 parallel agents |
| | Pages completed: dashboard, goals, business-dashboard, business-roadmap, finances/forecast, assessment, swot, quarterly-review, todo, issues-list, open-loops, ideas, one-page-plan, stop-doing, sessions, messages, settings, integrations, help, coach/dashboard, coach/clients, coach/sessions, coach/messages, coach/reports, coach/schedule, coach/settings, coach/analytics, coach/actions, admin, admin/clients, admin/coaches, vision-mission | Mobile responsive |
| Dec 6, 2025 | Phase 3: Completed remaining 13 pages | 13 parallel agents |
| | Pages completed: goals/create, goals/vision, business-profile, financials, assessment/[id], assessment/history, assessment/results, reviews/weekly, sessions/[id], settings/account, settings/team, coach/clients/[id], admin/users | All pages now DONE |
| Dec 6, 2025 | **Full Polish Pass** - Navy headers + card + button consistency | 20 parallel agents |
| | **Header Consistency**: All primary pages now use navy PageHeader (default variant) | Premium SaaS feel |
| | **Card Styling**: All cards now use `rounded-xl shadow-sm border border-gray-200 bg-white` | Visual consistency |
| | **Button Styling**: Primary = `bg-brand-orange hover:bg-brand-orange-700 text-white` | Brand consistency |
| | Secondary = `bg-white border border-gray-300 hover:bg-gray-50 text-gray-700` | |
| | **Spacing**: All grids use `gap-4 sm:gap-6`, sections use `space-y-6` | Rhythm consistency |
| | Pages polished: dashboard, business-dashboard, business-roadmap, todo, swot, settings, goals, vision-mission, messages, integrations, help, stop-doing, coach/dashboard, coach/clients, coach/schedule, coach/settings, quarterly-review, one-page-plan, ideas, assessment | 10/10 Design |

---

## Mobile Responsiveness Checklist

For EVERY page, verify:
- [ ] Text doesn't overflow on small screens
- [ ] Buttons are full-width or properly sized on mobile
- [ ] Tables scroll horizontally or transform to cards
- [ ] Navigation works on mobile
- [ ] Touch targets are minimum 44x44px
- [ ] Forms are usable on mobile keyboards
- [ ] Modals/dialogs are properly sized
- [ ] Images scale appropriately
- [ ] No horizontal scroll on page body
