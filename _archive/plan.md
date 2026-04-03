# Comprehensive Stability Audit - Implementation Plan

## Phase 1: Critical Fixes (Auth & Loading Guards)

### 1.1 Fix BusinessContext null handling in high-risk hooks
Add proper `activeBusiness` null checks and `isLoading` guards to:
- `src/app/kpis/hooks/useKPIs.ts` - missing context loading guard
- `src/app/xero/hooks/useXeroSync.ts` - missing context loading guard
- `src/app/quarterly-review/hooks/useQuarterlyReview.ts` - race condition risk
- Any other hooks that fetch data before context is ready

### 1.2 Add page-level error boundaries
Create `error.tsx` files for all main route segments:
- `src/app/dashboard/error.tsx`
- `src/app/goals/error.tsx`
- `src/app/kpis/error.tsx`
- `src/app/forecast/error.tsx`
- `src/app/quarterly-review/error.tsx`
- `src/app/sessions/error.tsx`
- `src/app/business-dashboard/error.tsx`
- `src/app/xero/error.tsx`
- `src/app/strategy/error.tsx`
- `src/app/accountability/error.tsx`

Each will catch render errors, log them via `logError()`, and show a retry button.

## Phase 2: Migrate Autosave to Standard Hook

Migrate the 5 highest-priority custom autosave implementations to use `useAutoSave`:
1. `src/app/sessions/hooks/useSessionNotes.ts`
2. `src/app/strategy/components/ValuePropositionCanvas.tsx`
3. `src/app/hiring-roadmap/hooks/useHiringRoadmap.ts`
4. `src/app/accountability/hooks/useAccountability.ts`
5. `src/app/ideas/components/EvaluateIdea.tsx`

Each migration:
- Replace custom debounce/save logic with `useAutoSave` hook
- Add `emptyStateGuard` to prevent saving empty data
- Add `component` and `businessId` for error logging
- Preserve existing UX (save indicators, dirty state)

## Phase 3: Loading State Standardization

Create a reusable `PageLoadingGuard` component that wraps page content and:
- Shows skeleton/spinner while `isLoading` from BusinessContext
- Shows "no business" message if `activeBusiness` is null after loading
- Apply to pages missing proper guards

## Summary
- ~10 error boundary files (templated, fast)
- ~5 hook fixes for null/loading guards
- ~5 autosave migrations
- 1 reusable loading guard component
