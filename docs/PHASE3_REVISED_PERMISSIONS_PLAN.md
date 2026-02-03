# Phase 3 REVISED: Team Permissions & Shared Boards

**Created:** 2026-02-03
**Status:** PENDING APPROVAL
**Scope:** Permissions + Data Model Changes

---

## Executive Summary

This plan implements:
1. **Shared collaborative boards** for Issues, Open Loops, and Ideas
2. **Proper role-based permissions** (Owner, Admin, Member, Viewer)
3. **Manager visibility** for Weekly Reviews
4. **"Created by" attribution** on shared items

---

## Part 1: Permission Model

### Role Definitions

| Role | Description | Example |
|------|-------------|---------|
| **Owner** | Business owner, full access | Summer @ Oh Nine |
| **Admin** | Full access, can manage team | Jessica @ Oh Nine |
| **Member** | Can contribute, limited delete | Nessa @ ABC Cleaning |
| **Viewer** | Read-only access | (none currently) |

### Permission Matrix

| Feature | Owner | Admin | Member | Viewer | Coach |
|---------|-------|-------|--------|--------|-------|
| **Issues List** | All | All | Own | View | View |
| **Open Loops** | All | All | Own | View | View |
| **Ideas** | All | All | Own | View | View |
| **Daily Tasks** | All | All | All | View | View |
| **Weekly Reviews** | View All | View All | Own Only | View Own | View All |
| **Stop Doing** | Own | Own | Own | View | View |
| **Strategic Goals** | All | All | View | View | View |
| **KPIs** | All | All | View | View | View |
| **Forecasts** | All | All | View | View | View |
| **SWOT** | All | All | View | View | View |
| **Team Members** | Manage | Manage | View | View | View |

**Legend:** All = CRUD, Own = CRUD own items, View = Read-only

---

## Part 2: Database Changes

### 2.1 Add `business_id` to Ideas Table

**Why:** Ideas currently has no business_id, so it can't be a shared board.

**Migration:**
```sql
-- Add business_id column to ideas table
ALTER TABLE ideas
ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- Backfill existing ideas with business_id from user's business
UPDATE ideas i
SET business_id = (
  SELECT bu.business_id
  FROM business_users bu
  WHERE bu.user_id = i.user_id
  AND bu.status = 'active'
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- For users who are owners (not in business_users)
UPDATE ideas i
SET business_id = (
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = i.user_id
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- Create index for performance
CREATE INDEX idx_ideas_business_id ON ideas(business_id);
```

**Risk:** LOW - Adding column, not changing existing data structure.

---

### 2.2 Ensure `created_by` Fields Exist

**Tables to verify/update:**

| Table | Has `user_id`? | Use as `created_by`? |
|-------|---------------|---------------------|
| `issues_list` | ✅ Yes | ✅ Use existing |
| `open_loops` | ✅ Yes | ✅ Use existing |
| `ideas` | ✅ Yes | ✅ Use existing |
| `todo_items` | Has `created_by` | ✅ Already exists |

**No schema changes needed** - existing `user_id` fields serve as creator attribution.

---

## Part 3: Query Changes

### 3.1 Issues List - Change to Business-Wide

**File:** `src/lib/services/issuesService.ts`

**Current Query (line ~45):**
```typescript
const { data } = await supabase
  .from('issues_list')
  .select('*')
  .eq('user_id', userId)  // Only user's issues
  .eq('archived', false)
```

**New Query:**
```typescript
const { data } = await supabase
  .from('issues_list')
  .select(`
    *,
    creator:users!user_id(id, first_name, last_name, email)
  `)
  .eq('business_id', businessId)  // All business issues
  .eq('archived', false)
  .order('created_at', { ascending: false })
```

---

### 3.2 Open Loops - Change to Business-Wide

**File:** `src/lib/services/openLoopsService.ts`

**Current Query (line ~45):**
```typescript
const { data } = await supabase
  .from('open_loops')
  .select('*')
  .eq('user_id', userId)  // Only user's loops
  .eq('archived', false)
```

**New Query:**
```typescript
const { data } = await supabase
  .from('open_loops')
  .select(`
    *,
    creator:users!user_id(id, first_name, last_name, email)
  `)
  .eq('business_id', businessId)  // All business loops
  .eq('archived', false)
  .order('created_at', { ascending: false })
```

---

### 3.3 Ideas - Change to Business-Wide

**File:** `src/lib/services/ideasService.ts`

**Current Query:**
```typescript
const { data } = await supabase
  .from('ideas')
  .select('*')
  .eq('user_id', userId)  // Only user's ideas
  .eq('archived', false)
```

**New Query:**
```typescript
const { data } = await supabase
  .from('ideas')
  .select(`
    *,
    creator:users!user_id(id, first_name, last_name, email)
  `)
  .eq('business_id', businessId)  // All business ideas
  .eq('archived', false)
  .order('created_at', { ascending: false })
```

---

### 3.4 Weekly Reviews - Add Manager Visibility

**File:** `src/app/reviews/services/weekly-review-service.ts`

**Current:** Only loads user's own reviews.

**New Logic:**
```typescript
async function getWeeklyReviews(businessId: string, userId: string, userRole: string) {
  let query = supabase
    .from('weekly_reviews')
    .select(`
      *,
      reviewer:users!user_id(id, first_name, last_name, email)
    `)
    .eq('business_id', businessId)

  // Owner/Admin see all, Members see only their own
  if (userRole !== 'owner' && userRole !== 'admin') {
    query = query.eq('user_id', userId)
  }

  return query.order('week_start_date', { ascending: false })
}
```

---

## Part 4: Service Layer Changes

### 4.1 Update Delete Methods with Ownership Check

**Pattern for all shared board services:**

```typescript
// issuesService.ts, openLoopsService.ts, ideasService.ts

async function deleteItem(
  itemId: string,
  userId: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {

  // Owner/Admin can delete anything
  if (userRole === 'owner' || userRole === 'admin') {
    const { error } = await supabase
      .from('table_name')
      .delete()
      .eq('id', itemId)
    return { success: !error, error: error?.message }
  }

  // Members can only delete their own
  const { error } = await supabase
    .from('table_name')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId)  // Must be creator

  if (error) {
    return { success: false, error: 'Cannot delete items created by others' }
  }

  return { success: true }
}
```

---

### 4.2 Update Edit Methods with Ownership Check

**Same pattern:**

```typescript
async function updateItem(
  itemId: string,
  updates: Partial<Item>,
  userId: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {

  // Owner/Admin can edit anything
  if (userRole === 'owner' || userRole === 'admin') {
    const { error } = await supabase
      .from('table_name')
      .update(updates)
      .eq('id', itemId)
    return { success: !error, error: error?.message }
  }

  // Members can only edit their own
  const { error } = await supabase
    .from('table_name')
    .update(updates)
    .eq('id', itemId)
    .eq('user_id', userId)  // Must be creator

  return { success: !error, error: error?.message }
}
```

---

## Part 5: UI Changes

### 5.1 Show "Created by" on Shared Boards

**Components to update:**

| Component | Change |
|-----------|--------|
| `src/app/issues-list/page.tsx` | Add creator name badge |
| `src/app/open-loops/page.tsx` | Add creator name badge |
| `src/app/ideas/page.tsx` | Add creator name badge |

**Example UI Pattern:**
```tsx
<div className="flex items-center gap-2">
  <span className="text-sm text-gray-500">
    Created by {item.creator?.first_name || 'Unknown'}
  </span>
  {item.user_id === currentUser?.id && (
    <Badge variant="outline" size="sm">You</Badge>
  )}
</div>
```

---

### 5.2 Conditional Delete/Edit Buttons

**Pattern:**
```tsx
const canEdit =
  viewerContext.role === 'owner' ||
  viewerContext.role === 'admin' ||
  item.user_id === currentUser?.id

const canDelete =
  viewerContext.role === 'owner' ||
  viewerContext.role === 'admin' ||
  item.user_id === currentUser?.id

{canEdit && <EditButton onClick={() => handleEdit(item)} />}
{canDelete && <DeleteButton onClick={() => handleDelete(item)} />}
```

---

### 5.3 Weekly Reviews - Team View for Owners

**File:** `src/app/reviews/page.tsx` (or similar)

**Add team member selector for Owner/Admin:**
```tsx
{(viewerContext.role === 'owner' || viewerContext.role === 'admin') && (
  <div className="mb-4">
    <label>Viewing reviews for:</label>
    <select onChange={(e) => setSelectedTeamMember(e.target.value)}>
      <option value="all">All Team Members</option>
      {teamMembers.map(member => (
        <option key={member.id} value={member.id}>
          {member.first_name} {member.last_name}
        </option>
      ))}
    </select>
  </div>
)}
```

---

## Part 6: BusinessContext Updates

### 6.1 New Permission Interface

**File:** `src/contexts/BusinessContext.tsx`

```typescript
interface ViewerContext {
  // Role in the business
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'coach'

  // Is this a coach viewing client data?
  isViewingAsCoach: boolean

  // Granular permissions
  permissions: {
    // Shared boards (Issues, Loops, Ideas)
    canViewSharedBoards: boolean
    canAddToSharedBoards: boolean
    canEditOwnItems: boolean
    canEditAllItems: boolean
    canDeleteOwnItems: boolean
    canDeleteAllItems: boolean

    // Weekly Reviews
    canViewOwnReviews: boolean
    canViewAllReviews: boolean

    // Strategic items (Goals, KPIs, Forecasts)
    canViewStrategicItems: boolean
    canEditStrategicItems: boolean

    // Team management
    canManageTeam: boolean
  }
}
```

---

### 6.2 Permission Mapping by Role

```typescript
function getPermissionsForRole(role: string, isOwner: boolean): ViewerContext['permissions'] {
  if (isOwner || role === 'owner') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: true,
      canDeleteOwnItems: true,
      canDeleteAllItems: true,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: true,
      canManageTeam: true,
    }
  }

  if (role === 'admin') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: true,
      canDeleteOwnItems: true,
      canDeleteAllItems: true,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: true,
      canManageTeam: true,
    }
  }

  if (role === 'member') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: false,
      canDeleteOwnItems: true,
      canDeleteAllItems: false,
      canViewOwnReviews: true,
      canViewAllReviews: false,
      canViewStrategicItems: true,
      canEditStrategicItems: false,
      canManageTeam: false,
    }
  }

  // Viewer
  return {
    canViewSharedBoards: true,
    canAddToSharedBoards: false,
    canEditOwnItems: false,
    canEditAllItems: false,
    canDeleteOwnItems: false,
    canDeleteAllItems: false,
    canViewOwnReviews: true,
    canViewAllReviews: false,
    canViewStrategicItems: true,
    canEditStrategicItems: false,
    canManageTeam: false,
  }
}
```

---

## Part 7: Files to Modify

### Database Migration
| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_ideas_business_id.sql` | NEW - Add business_id to ideas |

### Context
| File | Action |
|------|--------|
| `src/contexts/BusinessContext.tsx` | Update interface, add role loading, add permissions |

### Services (Query + Permission Changes)
| File | Action |
|------|--------|
| `src/lib/services/issuesService.ts` | Change to business-wide, add permission checks |
| `src/lib/services/openLoopsService.ts` | Change to business-wide, add permission checks |
| `src/lib/services/ideasService.ts` | Change to business-wide, add business_id, add permission checks |
| `src/app/reviews/services/weekly-review-service.ts` | Add manager visibility |

### Pages (UI Changes)
| File | Action |
|------|--------|
| `src/app/issues-list/page.tsx` | Add creator display, permission-based buttons |
| `src/app/open-loops/page.tsx` | Add creator display, permission-based buttons |
| `src/app/ideas/page.tsx` | Add creator display, permission-based buttons |
| `src/app/reviews/page.tsx` | Add team member selector for owners |
| `src/app/goals/page.tsx` | Add permission checks for strategic items |
| `src/app/swot/page.tsx` | Add permission checks for strategic items |

---

## Part 8: Implementation Order

### Phase 3A: Foundation (No User Impact)
```
1. Create migration for ideas.business_id
2. Update BusinessContext interface
3. Add permission mapping function
4. Update role loading to fetch from business_users
```

### Phase 3B: Backend Changes
```
5. Update issuesService.ts - queries + permission checks
6. Update openLoopsService.ts - queries + permission checks
7. Update ideasService.ts - queries + permission checks
8. Update weekly-review-service.ts - manager visibility
```

### Phase 3C: Frontend Changes
```
9. Update issues-list/page.tsx - UI + permissions
10. Update open-loops/page.tsx - UI + permissions
11. Update ideas/page.tsx - UI + permissions
12. Update reviews page - team selector
13. Update strategic pages - permission checks
```

### Phase 3D: Testing & Deploy
```
14. Test as Owner (full access)
15. Test as Admin (full access)
16. Test as Member (limited)
17. Test as Coach (view only)
18. Deploy
```

---

## Part 9: Testing Checklist

### As Owner (Summer @ Oh Nine)
- [ ] See all team issues/loops/ideas
- [ ] Edit/delete any item
- [ ] See all team weekly reviews
- [ ] Edit strategic goals/KPIs
- [ ] Manage team members

### As Admin (Jessica @ Oh Nine)
- [ ] See all team issues/loops/ideas
- [ ] Edit/delete any item
- [ ] See all team weekly reviews
- [ ] Edit strategic goals/KPIs
- [ ] Manage team members

### As Member (Nessa @ ABC Cleaning)
- [ ] See all team issues/loops/ideas
- [ ] Add new items (shows "Created by Nessa")
- [ ] Edit/delete own items only
- [ ] See only own weekly reviews
- [ ] View but NOT edit strategic goals/KPIs
- [ ] Cannot manage team members

### As Coach
- [ ] See all client issues/loops/ideas (read-only)
- [ ] See all client weekly reviews (read-only)
- [ ] See client strategic goals/KPIs (read-only)

---

## Part 10: Rollback Plan

### If Issues Arise:

**Quick Fix:** Revert permission checks, keep shared board queries
- Users see everything but can still edit/delete anything

**Partial Rollback:** Revert to user-specific queries
- Back to original behavior

**Full Rollback:** Git revert all Phase 3 commits

---

## Part 11: User Communication

### Before Deployment:

**To Business Owners (Vanessa, etc.):**
> Your team can now collaborate on Issues, Open Loops, and Ideas boards.
> You can see who created each item and view your team's weekly reviews.

**To Team Members (Nessa):**
> You can now see and contribute to shared boards (Issues, Open Loops, Ideas).
> Items you create will show your name. You can edit/delete your own items.

---

## Approval Checklist

- [ ] Permission model matches business needs
- [ ] Database migration is safe
- [ ] All affected files identified
- [ ] Implementation order is correct
- [ ] Testing plan adequate
- [ ] Rollback plan acceptable
- [ ] User communication drafted

---

## Questions Resolved

| Question | Decision |
|----------|----------|
| Should boards be shared? | ✅ Yes - Issues, Loops, Ideas |
| Can members edit others' items? | ❌ No - own only |
| Can members delete others' items? | ❌ No - own only |
| Can owner see team reviews? | ✅ Yes |
| Can members see others' reviews? | ❌ No |
| Need migration for ideas? | ✅ Yes - add business_id |

---

**Ready to proceed?** Say "approved" and I'll start implementing.
