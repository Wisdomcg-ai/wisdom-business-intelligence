# Business Context Architecture

## Overview

This document outlines the architecture for implementing a role-based context system that allows coaches to view and edit client data seamlessly while maintaining proper audit trails.

## Problem Statement

- Coaches need to see everything a client sees in their portal
- Coaches need to make edits while coaching clients
- The system must track who made edits (coach vs client)
- Architecture must scale to 500+ clients and multiple coaches

## Solution: Role-Based Context System

### Core Concept

Instead of duplicating pages for coach and client, we use a **single set of components** that render differently based on context:

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION                               │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              BusinessContext Provider                │   │
│   │                                                      │   │
│   │  currentUser: { id, email, role }                    │   │
│   │  activeBusiness: { id, name, ownerId }               │   │
│   │  viewerContext: { role, isViewingAsCoach, canEdit }  │   │
│   │                                                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           Same Components for Everyone               │   │
│   │                                                      │   │
│   │   Dashboard  │  Goals  │  SWOT  │  Forecast  │ ...   │   │
│   │                                                      │   │
│   │   All use: useBusinessContext() to get data context  │   │
│   │                                                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Components

### 1. BusinessContext Provider

**File:** `src/contexts/BusinessContext.tsx`

```typescript
interface BusinessContextType {
  // Current logged-in user
  currentUser: {
    id: string
    email: string
    role: 'client' | 'coach' | 'admin'
  } | null

  // The business whose data we're viewing/editing
  activeBusiness: {
    id: string
    name: string
    ownerId: string
  } | null

  // Context about who is viewing
  viewerContext: {
    role: 'owner' | 'coach' | 'admin'  // Role relative to this business
    isViewingAsCoach: boolean           // True when coach views client
    canEdit: boolean                    // Permission to edit
    canDelete: boolean                  // Permission to delete
  }

  // Actions
  setActiveBusiness: (businessId: string) => Promise<void>
  clearActiveBusiness: () => void
  isLoading: boolean
}
```

### 2. Hook for Easy Access

**File:** `src/hooks/useBusinessContext.ts`

```typescript
export function useBusinessContext() {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error('useBusinessContext must be used within BusinessContextProvider')
  }
  return context
}
```

### 3. Layout Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root - wraps with BusinessContextProvider
│   │
│   ├── (client)/                     # Client routes (route group)
│   │   ├── layout.tsx                # ClientLayout - sets context to user's business
│   │   ├── dashboard/
│   │   ├── goals/
│   │   ├── swot/
│   │   └── ...
│   │
│   └── coach/                        # Coach routes
│       ├── layout.tsx                # CoachLayout - coach portal chrome
│       ├── dashboard/
│       ├── clients/
│       │   ├── page.tsx              # Client list
│       │   └── [id]/
│       │       ├── page.tsx          # Client overview/profile
│       │       └── view/             # Coach viewing client's pages
│       │           ├── layout.tsx    # CoachViewLayout - sets context + shows banner
│       │           └── [...path]/    # Catch-all renders client pages
│       │               └── page.tsx
│       └── ...
```

### 4. Coach View Layout

**File:** `src/app/coach/clients/[id]/view/layout.tsx`

When a coach navigates to `/coach/clients/abc123/view/dashboard`:
1. Layout extracts `abc123` as the client's business ID
2. Sets `activeBusiness` in context to that business
3. Sets `viewerContext.role` to 'coach'
4. Renders coach banner + client sidebar + content

```
┌─────────────────────────────────────────────────────────────┐
│ 👁 COACH VIEW: Envisage Australia        [← Back to Coach] │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────┐                                               │
│ │ Dashboard │   [Client page content renders here]          │
│ │ Business  │                                               │
│ │ Goals     │   Same components as client sees,             │
│ │ SWOT      │   but with coach's context                    │
│ │ ...       │                                               │
│ └───────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

### 5. Catch-All Route for Client Pages

**File:** `src/app/coach/clients/[id]/view/[...path]/page.tsx`

This route dynamically loads the appropriate client page component based on the path:

| Coach URL | Loads Component From |
|-----------|---------------------|
| `/coach/clients/[id]/view/dashboard` | `@/app/(client)/dashboard/page` |
| `/coach/clients/[id]/view/goals` | `@/app/(client)/goals/page` |
| `/coach/clients/[id]/view/swot` | `@/app/(client)/swot/page` |

## Data Flow

### Client Login Flow
```
1. Client logs in
2. BusinessContextProvider detects client role
3. Fetches their business from `businesses` table
4. Sets activeBusiness = their business
5. Sets viewerContext.role = 'owner'
6. All pages render with their data
```

### Coach Login Flow
```
1. Coach logs in
2. BusinessContextProvider detects coach role
3. activeBusiness = null (they're in coach portal)
4. Coach sees /coach/dashboard with client list
```

### Coach Views Client Flow
```
1. Coach clicks "View Client" on Envisage
2. Navigates to /coach/clients/abc123/view/dashboard
3. CoachViewLayout extracts abc123
4. Calls setActiveBusiness('abc123')
5. Sets viewerContext.role = 'coach'
6. Dashboard component renders with Envisage's data
7. "Exit" button clears context, returns to coach portal
```

## Database Schema Changes

### Add Audit Fields to Tables

```sql
-- Add to existing tables that need edit tracking
ALTER TABLE goals
  ADD COLUMN updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN updated_by_role TEXT CHECK (updated_by_role IN ('owner', 'coach', 'admin'));

ALTER TABLE swot_items
  ADD COLUMN updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN updated_by_role TEXT CHECK (updated_by_role IN ('owner', 'coach', 'admin'));

-- Add to other tables as needed:
-- strategic_initiatives, quarterly_goals, rocks, action_items, etc.
```

### Optional: Full Audit Log Table

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_by UUID REFERENCES auth.users(id),
  changed_by_role TEXT CHECK (changed_by_role IN ('owner', 'coach', 'admin')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_user ON audit_log(changed_by);
```

## Component Migration Pattern

### Before (Current)
```typescript
// Goals page currently
export default function GoalsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id)
    }
    getUser()
  }, [])

  // Fetches goals for logged-in user's business
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
}
```

### After (With Context)
```typescript
// Goals page with context
export default function GoalsPage() {
  const { activeBusiness, viewerContext, currentUser } = useBusinessContext()
  const supabase = createClient()

  // Fetches goals for active business (works for both client and coach)
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('business_id', activeBusiness.id)

  // Saves track who made the edit
  const saveGoal = async (goalData) => {
    await supabase.from('goals').update({
      ...goalData,
      updated_by: currentUser.id,
      updated_by_role: viewerContext.role
    })
  }
}
```

## Implementation Phases

### Phase 1: Foundation (2-3 hours)
- [ ] Create `src/contexts/BusinessContext.tsx`
- [ ] Create `src/hooks/useBusinessContext.ts`
- [ ] Add provider to root layout
- [ ] Create `CoachViewLayout` component

### Phase 2: Coach View Routes (2-3 hours)
- [ ] Create `/coach/clients/[id]/view/layout.tsx`
- [ ] Create `/coach/clients/[id]/view/[...path]/page.tsx`
- [ ] Add "View Client" button to ClientCard component
- [ ] Add "Exit to Coach Portal" button in coach view banner

### Phase 3: Migrate Key Pages (1-2 hours each)
- [ ] Dashboard - use `useBusinessContext()`
- [ ] Goals - use `useBusinessContext()`
- [ ] SWOT - use `useBusinessContext()`
- [ ] Business Profile - use `useBusinessContext()`
- [ ] Financial Forecast - use `useBusinessContext()`
- [ ] Other pages as needed

### Phase 4: Audit Trail (1-2 hours)
- [ ] Add `updated_by`, `updated_by_role` columns to key tables
- [ ] Update save functions to include audit fields
- [ ] Show "Last edited by" in UI where appropriate

## Security Considerations

1. **Coach Access Control**: Coaches can only view clients assigned to them
   ```typescript
   // In setActiveBusiness()
   const { data } = await supabase
     .from('businesses')
     .select('*')
     .eq('id', businessId)
     .eq('assigned_coach_id', currentUser.id)  // Must be assigned
     .single()
   ```

2. **Permission Checks**: All edits verify the user has permission
   ```typescript
   if (!viewerContext.canEdit) {
     throw new Error('You do not have permission to edit this data')
   }
   ```

3. **Row Level Security**: Supabase RLS policies enforce access at database level

## Benefits

| Benefit | Description |
|---------|-------------|
| **Single Codebase** | One set of components, not duplicated for coach/client |
| **Scalable** | Works for 1 coach or 100 coaches, 10 clients or 10,000 |
| **Audit Trail** | Every edit tracked with who made it |
| **Maintainable** | Fix a bug once, fixed everywhere |
| **Extensible** | Easy to add new roles (e.g., team members, accountants) |

## Future Enhancements

1. **Real-time Updates**: When coach edits, client sees changes live
2. **Permission Levels**: Read-only coach view, admin-only sections
3. **Activity Feed**: Show recent coach activity on client's dashboard
4. **Multi-Coach**: Multiple coaches can be assigned to same client
