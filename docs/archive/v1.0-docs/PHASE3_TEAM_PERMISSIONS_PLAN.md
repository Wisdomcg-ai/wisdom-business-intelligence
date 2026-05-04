# Phase 3: Team Member Permissions - Implementation Plan

**Status:** PENDING APPROVAL
**Risk Level:** MEDIUM
**Affected Users:** 2 (Nessa + your test account)

---

## Current State (Problems)

| Issue | Impact |
|-------|--------|
| All team members get `role: 'owner'` | Everyone can delete everything |
| `viewerContext.canDelete` exists but NOT enforced | Permission flag is ignored |
| 5 delete operations have NO permission checks | Anyone can delete any record |

---

## Proposed Permission Model

### Role-Based Permissions

| Role | canEdit | canDeleteOwn | canDeleteAll |
|------|---------|--------------|--------------|
| Owner | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |
| Member | ✅ | ✅ (limited) | ❌ |
| Viewer | ❌ | ❌ | ❌ |

### What "canDeleteOwn" Means for Members

**CAN delete their own:**
- Daily Tasks (user_id matches)
- Issues/Open Loops (user_id matches)
- Ideas (user_id matches)

**CANNOT delete (even their own):**
- Strategic Goals
- KPIs
- Financial Forecasts
- SWOT items
- Strategic Initiatives
- Documents
- Quarterly Reviews
- Action Items

---

## Implementation Steps

### Step 1: Update BusinessContext Permission Model

**File:** `src/contexts/BusinessContext.tsx`

**Current:**
```typescript
interface ViewerContext {
  role: 'owner' | 'coach' | 'admin'
  isViewingAsCoach: boolean
  canEdit: boolean
  canDelete: boolean  // Single boolean - too simple
}
```

**New:**
```typescript
interface ViewerContext {
  role: 'owner' | 'coach' | 'admin' | 'member' | 'viewer'
  isViewingAsCoach: boolean
  canEdit: boolean
  canDeleteOwn: boolean      // Can delete own tasks, issues, ideas
  canDeleteAll: boolean      // Can delete strategic/financial items
  canManageTeam: boolean     // Can invite/remove team members
}
```

**Changes Required:**
- Line 24-29: Update interface
- Line 57-62: Update defaults
- Line 127-132: Fetch `role` from `business_users` table
- Line 188-193: Map role to permissions

---

### Step 2: Update Team Member Loading

**File:** `src/contexts/BusinessContext.tsx` (lines 127-138)

**Current:**
```typescript
const { data: businessUser } = await supabase
  .from('business_users')
  .select('business_id')  // Only gets business_id
  .eq('user_id', user.id)
```

**New:**
```typescript
const { data: businessUser } = await supabase
  .from('business_users')
  .select('business_id, role, status')  // Also get role
  .eq('user_id', user.id)
  .eq('status', 'active')
```

---

### Step 3: Add Permission Mapping

**File:** `src/contexts/BusinessContext.tsx`

**New function to add:**
```typescript
function getRolePermissions(role: string, isOwner: boolean) {
  if (isOwner) {
    return { canEdit: true, canDeleteOwn: true, canDeleteAll: true, canManageTeam: true }
  }

  switch (role) {
    case 'admin':
      return { canEdit: true, canDeleteOwn: true, canDeleteAll: true, canManageTeam: true }
    case 'member':
      return { canEdit: true, canDeleteOwn: true, canDeleteAll: false, canManageTeam: false }
    case 'viewer':
      return { canEdit: false, canDeleteOwn: false, canDeleteAll: false, canManageTeam: false }
    default:
      return { canEdit: false, canDeleteOwn: false, canDeleteAll: false, canManageTeam: false }
  }
}
```

---

### Step 4: Add Delete Permission Checks to Services

**Files to update:**

| Service | Table | Change Required |
|---------|-------|-----------------|
| `issuesService.ts` (line 197) | `issues_list` | Add `.eq('user_id', userId)` |
| `openLoopsService.ts` (line 185) | `open_loops` | Add `.eq('user_id', userId)` |
| `ideasService.ts` (line 206) | `ideas` | Add `.eq('user_id', userId)` |
| `dailyTasksService.ts` | `daily_tasks` | Already has check ✅ |

**Example fix for issuesService.ts:**
```typescript
// Current (UNSAFE)
async deleteIssue(id: string): Promise<boolean> {
  const { error } = await supabase.from('issues_list').delete().eq('id', id)
}

// Fixed (SAFE)
async deleteIssue(id: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('issues_list')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)  // Only delete if user owns it
}
```

---

### Step 5: Add Frontend Permission Checks

**Components to update:**

| Component | Delete Button | Check Required |
|-----------|--------------|----------------|
| `src/app/issues-list/page.tsx` | Delete issue | Check `canDeleteOwn` |
| `src/app/open-loops/page.tsx` | Delete loop | Check `canDeleteOwn` |
| `src/app/ideas/page.tsx` | Delete idea | Check `canDeleteOwn` |
| `src/app/goals/page.tsx` | Delete goals | Check `canDeleteAll` |
| `src/app/swot/page.tsx` | Archive SWOT | Check `canDeleteAll` |

**Example fix for issues-list:**
```typescript
// Current
<button onClick={() => handleDelete(issue.id)}>Delete</button>

// Fixed
{(viewerContext.canDeleteOwn && issue.user_id === currentUser?.id) && (
  <button onClick={() => handleDelete(issue.id)}>Delete</button>
)}
```

---

### Step 6: Add Backend Protection (Safety Net)

Even if frontend is bypassed, backend should reject unauthorized deletes.

**Files to add checks:**

| API/Service | Add Check |
|-------------|-----------|
| `issuesService.ts` | Verify `user_id` matches before delete |
| `openLoopsService.ts` | Verify `user_id` matches before delete |
| `ideasService.ts` | Verify `user_id` matches before delete |

---

## Files to Modify (Complete List)

| File | Type of Change |
|------|----------------|
| `src/contexts/BusinessContext.tsx` | Update interface, add role loading, add permission mapping |
| `src/lib/services/issuesService.ts` | Add user_id check to delete |
| `src/lib/services/openLoopsService.ts` | Add user_id check to delete |
| `src/lib/services/ideasService.ts` | Add user_id check to delete |
| `src/app/issues-list/page.tsx` | Add permission check to delete button |
| `src/app/open-loops/page.tsx` | Add permission check to delete button |
| `src/app/ideas/page.tsx` | Add permission check to delete button |
| `src/app/goals/page.tsx` | Add permission check to delete buttons |
| `src/app/swot/page.tsx` | Add permission check to archive button |

---

## Testing Plan

### Before Deployment, Test:

1. **As Owner (Summer @ Oh Nine)**
   - [ ] Can delete all tasks, issues, ideas
   - [ ] Can delete strategic goals, KPIs
   - [ ] Can manage team members

2. **As Admin (Jessica @ Oh Nine)**
   - [ ] Can delete all tasks, issues, ideas
   - [ ] Can delete strategic goals, KPIs
   - [ ] Can manage team members

3. **As Member (Nessa @ ABC Cleaning)**
   - [ ] Can delete own tasks, issues, ideas
   - [ ] CANNOT delete others' tasks, issues, ideas
   - [ ] CANNOT delete strategic goals, KPIs
   - [ ] CANNOT manage team members

4. **As Viewer (if any exist)**
   - [ ] CANNOT edit anything
   - [ ] CANNOT delete anything

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Member loses access to needed feature | LOW | MEDIUM | Owner can upgrade to admin |
| Delete button disappears unexpectedly | MEDIUM | LOW | Clear UI messaging |
| Backend bypass (direct API call) | LOW | HIGH | Backend checks added |
| Permission check breaks page | LOW | HIGH | Thorough testing |

---

## Rollback Plan

If issues arise:

1. **Quick rollback:** Revert BusinessContext to return `canDeleteOwn: true, canDeleteAll: true` for all team members
2. **Partial rollback:** Keep backend checks, revert frontend checks
3. **Full rollback:** Git revert all Phase 3 commits

---

## Implementation Order (Safe Sequence)

```
1. Update BusinessContext interface (no behavior change yet)
2. Add permission mapping function (no behavior change yet)
3. Update role loading to fetch actual role
4. Add backend delete checks (safety net)
5. Add frontend permission checks (UI changes)
6. Test all roles
7. Deploy
```

This order ensures:
- Backend is protected BEFORE frontend changes
- Each step can be tested independently
- Rollback is possible at any step

---

## Approval Checklist

- [ ] Permission model makes sense for business needs
- [ ] All affected files identified
- [ ] Testing plan adequate
- [ ] Rollback plan acceptable
- [ ] Ready to proceed

---

## Questions Before Proceeding

1. Should we notify Nessa before deployment about her new restrictions?
2. Do you want a "beta" period where restrictions are logged but not enforced?
3. Any other team members being added soon who need to be considered?
