# Coach View Architecture Plan

## Overview

This document outlines the architectural changes needed to allow coaches to view and edit client business data. Currently, pages load data using `supabase.auth.getUser()` and query by `owner_id = user.id`, which means when a coach views a client's page, they see their own data (or nothing) instead of the client's data.

## The Problem

**Current Flow (Broken for Coach View):**
1. Coach logs in → `user.id` = coach's UUID
2. Coach clicks "Open" on a client → navigates to `/coach/clients/{clientId}/view/dashboard`
3. Dashboard page calls `supabase.auth.getUser()` → returns coach's UUID
4. Page queries `businesses.owner_id = user.id` → returns coach's business (not client's)
5. Coach sees wrong data or empty state

**Required Flow:**
1. Coach logs in → `user.id` = coach's UUID
2. Coach clicks "Open" on a client → `BusinessContext.setActiveBusiness(clientId)` is called
3. Dashboard page reads `activeBusiness.id` from context
4. Page queries using `business_id = activeBusiness.id` → returns client's business
5. Coach sees client's data correctly

## Architecture Solution

### Core Components

#### 1. BusinessContext (Already Exists - Needs Enhancement)
Location: `src/contexts/BusinessContext.tsx`

Provides:
- `currentUser` - The logged-in user (coach or client)
- `activeBusiness` - The business being viewed (coach's client OR client's own)
- `viewerContext` - Permissions and role info
- `setActiveBusiness(businessId)` - Switch to viewing a specific business
- `clearActiveBusiness()` - Return to default state

#### 2. New Helper Hook: `useActiveBusinessId`
Location: `src/hooks/useActiveBusinessId.ts`

Purpose: Simplify getting the correct business ID for data queries

```typescript
export function useActiveBusinessId(): string | null {
  const { activeBusiness } = useBusinessContext()
  return activeBusiness?.id ?? null
}
```

#### 3. Updated Data Fetching Pattern

**Before (hardcoded to logged-in user):**
```typescript
const { data: { user } } = await supabase.auth.getUser()
const { data } = await supabase
  .from('goals')
  .select('*')
  .eq('business_id', user.id) // WRONG - uses user ID
```

**After (context-aware):**
```typescript
const businessId = useActiveBusinessId()
const { data } = await supabase
  .from('goals')
  .select('*')
  .eq('business_id', businessId) // CORRECT - uses active business
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (2 files)

| File | Changes |
|------|---------|
| `src/hooks/useActiveBusinessId.ts` | CREATE - New helper hook |
| `src/contexts/BusinessContext.tsx` | ENHANCE - Ensure setActiveBusiness works correctly |

**Tasks:**
1. Create `useActiveBusinessId` hook that returns `activeBusiness.id` from context
2. Add fallback logic: if no activeBusiness, attempt to load user's own business
3. Add proper TypeScript types and error handling

---

### Phase 2: Services Layer (3 files)

| File | Changes |
|------|---------|
| `src/app/business-profile/services/business-profile-service.ts` | Accept businessId parameter |
| `src/app/goals/services/goalService.ts` | Accept businessId parameter |
| `src/app/team/services/teamService.ts` | Accept businessId parameter |

**Pattern:**
```typescript
// Before
export async function getBusinessProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('businesses').select('*').eq('owner_id', user.id)
}

// After
export async function getBusinessProfile(businessId: string) {
  return supabase.from('businesses').select('*').eq('id', businessId)
}
```

---

### Phase 3: Hooks Layer (8 files)

| File | Current Pattern | New Pattern |
|------|-----------------|-------------|
| `src/app/dashboard/hooks/useDashboardData.ts` | Uses getUser() | Accept businessId param |
| `src/app/finances/forecast/hooks/useForecast.ts` | Uses getUser() | Accept businessId param |
| `src/app/finances/forecast/hooks/useXeroSync.ts` | Uses getUser() | Accept businessId param |
| `src/app/finances/budgets/hooks/useBudgets.ts` | Uses getUser() | Accept businessId param |
| `src/app/goals/hooks/useGoals.ts` | Uses getUser() | Accept businessId param |
| `src/app/reviews/weekly/hooks/useWeeklyReviews.ts` | Uses getUser() | Accept businessId param |
| `src/app/reviews/quarterly/hooks/useQuarterlyReviews.ts` | Uses getUser() | Accept businessId param |
| `src/app/stop-doing/hooks/useStopDoingList.ts` | Uses getUser() | Accept businessId param |

**Pattern:**
```typescript
// Before
export function useGoals() {
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('goals').eq('business_id', user.id)
    }
    load()
  }, [])
}

// After
export function useGoals(businessId: string | null) {
  useEffect(() => {
    if (!businessId) return
    async function load() {
      const { data } = await supabase.from('goals').eq('business_id', businessId)
    }
    load()
  }, [businessId])
}
```

---

### Phase 4: Pages - Business Profile & Core (3 files)

| File | Changes |
|------|---------|
| `src/app/business-profile/page.tsx` | Use useActiveBusinessId |
| `src/app/dashboard/page.tsx` | Use useActiveBusinessId |
| `src/app/vision-mission/page.tsx` | Use useActiveBusinessId |

---

### Phase 5: Pages - SWOT Analysis (4 files)

| File | Changes |
|------|---------|
| `src/app/swot/page.tsx` | Use useActiveBusinessId |
| `src/app/swot/[id]/page.tsx` | Use useActiveBusinessId |
| `src/app/swot/compare/page.tsx` | Use useActiveBusinessId |
| `src/app/swot/history/page.tsx` | Use useActiveBusinessId |

---

### Phase 6: Pages - Goals (3 files)

| File | Changes |
|------|---------|
| `src/app/goals/page.tsx` | Use useActiveBusinessId |
| `src/app/goals/[id]/page.tsx` | Use useActiveBusinessId |
| `src/app/goals/[id]/edit/page.tsx` | Use useActiveBusinessId |

---

### Phase 7: Pages - Team (2 files)

| File | Changes |
|------|---------|
| `src/app/team/page.tsx` | Use useActiveBusinessId |
| `src/app/team/new/page.tsx` | Use useActiveBusinessId |

---

### Phase 8: Pages - Reviews (4 files)

| File | Changes |
|------|---------|
| `src/app/reviews/weekly/page.tsx` | Use useActiveBusinessId |
| `src/app/reviews/monthly/page.tsx` | Use useActiveBusinessId |
| `src/app/reviews/quarterly/page.tsx` | Use useActiveBusinessId |
| `src/app/reviews/annual/page.tsx` | Use useActiveBusinessId |

---

### Phase 9: Pages - Assessments (2 files)

| File | Changes |
|------|---------|
| `src/app/assessments/page.tsx` | Use useActiveBusinessId |
| `src/app/assessments/[id]/page.tsx` | Use useActiveBusinessId |

---

### Phase 10: Pages - Finances (5 files)

| File | Changes |
|------|---------|
| `src/app/finances/page.tsx` | Use useActiveBusinessId |
| `src/app/finances/forecast/page.tsx` | Use useActiveBusinessId |
| `src/app/finances/forecast/compare/page.tsx` | Use useActiveBusinessId |
| `src/app/finances/budgets/page.tsx` | Use useActiveBusinessId |
| `src/app/finances/reports/page.tsx` | Use useActiveBusinessId |

---

### Phase 11: Pages - Stop Doing List (1 file)

| File | Changes |
|------|---------|
| `src/app/stop-doing/page.tsx` | Use useActiveBusinessId |

---

### Phase 12: Dashboard Components (4 files)

| File | Changes |
|------|---------|
| `src/components/dashboard/QuickActionsCard.tsx` | Accept businessId prop |
| `src/components/dashboard/GoalProgressWidget.tsx` | Accept businessId prop |
| `src/components/dashboard/SWOTSummaryWidget.tsx` | Accept businessId prop |
| `src/components/integrations/XeroIntegrationCard.tsx` | Accept businessId prop |

---

### Phase 13: Review Components (2 files)

| File | Changes |
|------|---------|
| `src/app/reviews/quarterly/components/QuarterlyReviewForm.tsx` | Accept businessId prop |
| `src/app/stop-doing/components/StopDoingWizard.tsx` | Accept businessId prop |

---

### Phase 14: Coach View Integration (2 files)

| File | Changes |
|------|---------|
| `src/app/coach/clients/[id]/view/[...path]/page.tsx` | Call setActiveBusiness on mount |
| `src/app/coach/clients/[id]/page.tsx` | Call setActiveBusiness on mount |

**Pattern for catch-all route:**
```typescript
'use client'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useBusinessContext } from '@/contexts/BusinessContext'

export default function CoachClientViewPage() {
  const params = useParams()
  const clientId = params.id as string
  const path = params.path as string[]
  const { setActiveBusiness, activeBusiness, isLoading } = useBusinessContext()

  useEffect(() => {
    if (clientId && clientId !== activeBusiness?.id) {
      setActiveBusiness(clientId)
    }
  }, [clientId, activeBusiness?.id, setActiveBusiness])

  if (isLoading) return <LoadingSpinner />

  // Dynamically render the appropriate page component based on path
  return <DynamicPageRenderer path={path} />
}
```

---

## File Count Summary

| Phase | Description | Files |
|-------|-------------|-------|
| 1 | Core Infrastructure | 2 |
| 2 | Services Layer | 3 |
| 3 | Hooks Layer | 8 |
| 4 | Core Pages | 3 |
| 5 | SWOT Pages | 4 |
| 6 | Goals Pages | 3 |
| 7 | Team Pages | 2 |
| 8 | Reviews Pages | 4 |
| 9 | Assessments Pages | 2 |
| 10 | Finances Pages | 5 |
| 11 | Stop Doing Page | 1 |
| 12 | Dashboard Components | 4 |
| 13 | Review Components | 2 |
| 14 | Coach View Integration | 2 |
| **TOTAL** | | **45** |

---

## Testing Plan

### Test Case 1: Client Login (Existing Flow)
1. Login as a client user
2. Navigate to dashboard
3. Verify: See own business data
4. Navigate to goals, SWOT, etc.
5. Verify: All pages show own business data

### Test Case 2: Coach Login - View Client
1. Login as a coach user
2. Navigate to `/coach/dashboard`
3. Click "Open" on a client
4. Verify: BusinessContext.activeBusiness is set to client's business
5. Navigate through client's dashboard, goals, SWOT, etc.
6. Verify: All pages show CLIENT's data, not coach's data

### Test Case 3: Coach Login - Switch Clients
1. While viewing Client A, go back to coach dashboard
2. Click "Open" on Client B
3. Verify: BusinessContext.activeBusiness updates to Client B
4. Verify: All pages now show Client B's data

### Test Case 4: Coach Edit Permissions
1. As coach, view a client's goals
2. Verify: Can edit goals (viewerContext.canEdit = true)
3. Verify: Cannot delete critical data (viewerContext.canDelete = false for certain items)

---

## Migration Notes

### Database Considerations
- No database schema changes required
- All queries change from `owner_id = user.id` to `business_id = activeBusiness.id`
- The `businesses` table already has `id` field that we'll use

### Backwards Compatibility
- Client login flow remains unchanged (auto-loads own business)
- All existing functionality preserved
- Coach view is additive feature

### Performance
- BusinessContext loads once per session
- Switching businesses triggers re-fetch of business data only
- Individual page data fetches use cached businessId

---

## Rollback Plan

If issues arise:
1. Revert to using `supabase.auth.getUser()` pattern
2. BusinessContext changes are isolated and can be disabled
3. No database changes means no data migration needed

---

## Dependencies

- Next.js 14+ (App Router)
- Supabase Client
- React Context API
- TypeScript

---

## Approval

- [ ] Architecture reviewed
- [ ] Implementation phases approved
- [ ] Testing plan approved
- [ ] Ready to begin implementation

---

*Document created: November 28, 2024*
*Last updated: November 28, 2024*
