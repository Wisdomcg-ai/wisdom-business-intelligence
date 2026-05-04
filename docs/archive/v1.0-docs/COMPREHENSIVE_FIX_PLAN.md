# Comprehensive Fix Plan - Business Coaching Platform

**Created:** 2026-02-03
**Status:** PENDING APPROVAL
**Total Issues Identified:** 248
**Critical Issues:** 39

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [User Impact Assessment](#user-impact-assessment)
3. [Phase 1: Security Critical](#phase-1-security-critical)
4. [Phase 2: Data Integrity](#phase-2-data-integrity)
5. [Phase 3: Xero Integration](#phase-3-xero-integration)
6. [Phase 4: Team Member Permissions](#phase-4-team-member-permissions)
7. [Phase 5: Database Schema](#phase-5-database-schema)
8. [Phase 6: Silent Failures & UX](#phase-6-silent-failures--ux)
9. [Phase 7: Code Quality](#phase-7-code-quality)
10. [Rollback Strategy](#rollback-strategy)
11. [Testing Requirements](#testing-requirements)
12. [Deployment Order](#deployment-order)

---

## Executive Summary

This document outlines a phased approach to fixing 248 identified issues across the platform. The fixes are organized by risk level and user impact, with security-critical items first.

### Key Statistics

| Category | Count | User Impact |
|----------|-------|-------------|
| Security vulnerabilities | 6 | High - potential data breach |
| Data integrity issues | 12 | Medium - data could be lost/corrupted |
| Permission bugs | 8 | High - users see wrong data or can't access features |
| Silent failures | 15 | Medium - users think saves worked but didn't |
| Performance issues | 20+ | Low - slower queries |
| Code quality | 180+ | None - internal improvements |

---

## User Impact Assessment

### IMMEDIATE IMPACTS (When Changes Go Live)

#### What Users Will Notice (Positive)

1. **Team Members** - Will have correct restricted permissions (currently they have full owner access)
2. **Coaches** - Will only see clients they're assigned to (currently could access any)
3. **Save Operations** - Will get proper error messages instead of silent failures
4. **Xero Sync** - Will actually work once column name is fixed

#### What Users Will Notice (Potentially Negative)

1. **Team Members** - May lose access to features they currently use (incorrectly)
   - Documents page - currently accessible, will be blocked until we add proper team member support
   - Edit/delete actions - currently allowed, will be restricted for viewer role

2. **Admin Panel** - Team members will no longer appear as "blank clients"
   - This is a FIX, but admins may notice the change in client count

3. **Xero Users** - May need to reconnect Xero after token encryption fix
   - One-time reconnection required

#### What Users WON'T Notice

- Database schema fixes (background)
- Code quality improvements (internal)
- Most security fixes (preventative)

---

### RISK ASSESSMENT BY FIX

| Fix | Risk Level | Potential Disruption | Rollback Difficulty |
|-----|------------|---------------------|---------------------|
| Add auth to API routes | LOW | None if done correctly | Easy |
| Fix team member permissions | MEDIUM | Team members may lose access temporarily | Medium |
| Fix Xero column name | LOW | None - just fixes broken feature | Easy |
| Encrypt Xero tokens | MEDIUM | Users must reconnect Xero | Medium |
| Fix admin client query | LOW | Cosmetic - removes blank entries | Easy |
| Database FK changes | HIGH | Could break queries if done wrong | Hard |
| Add error feedback | LOW | Users see more errors (good thing) | Easy |

---

## Phase 1: Security Critical

**Timeline:** Immediate (Day 1)
**User Impact:** None visible
**Risk:** LOW

### 1.1 Add Authentication to Unprotected API Routes

**Issue:** Two API routes have NO authentication - anyone can call them.

| Route | Current State | Fix |
|-------|--------------|-----|
| `/api/Xero/sync-forecast` | No auth check | Add `supabase.auth.getUser()` check |
| `/api/forecasts/scenarios` | No auth check | Add `supabase.auth.getUser()` check |

**Files to Change:**
- `src/app/api/Xero/sync-forecast/route.ts` (add lines 15-25)
- `src/app/api/forecasts/scenarios/route.ts` (add lines 10-20)

**User Impact:** NONE - These routes should have always required auth.

**Code Change:**
```typescript
// Add to beginning of each route handler
const { data: { user }, error: userError } = await supabase.auth.getUser()
if (userError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

### 1.2 Fix User ID Verification in Scenarios API

**Issue:** The scenarios API accepts a `user_id` parameter without verifying it matches the authenticated user.

**File:** `src/app/api/forecasts/scenarios/route.ts`

**Current (Vulnerable):**
```typescript
// Line 62 - accepts any user_id from request body
const { forecast_id, user_id, name, ... } = body
```

**Fixed:**
```typescript
// Use authenticated user's ID, ignore request body user_id
const authenticatedUserId = user.id
```

**User Impact:** NONE - Users can only modify their own scenarios (as intended).

---

### 1.3 Add .env.local to .gitignore

**Issue:** Credentials file may be tracked in git.

**Action:**
1. Add `.env.local` to `.gitignore`
2. Rotate ALL credentials (Supabase, Xero, OpenAI, Resend, Sentry)
3. Update Vercel/production environment variables

**User Impact:** NONE - Backend configuration only.

**IMPORTANT:** After rotating credentials, all integrations will use new keys.

---

### 1.4 Fix Coach Business Access Validation

**Issue:** Coaches can switch to view ANY business if they know the ID.

**File:** `src/contexts/BusinessContext.tsx` (lines 220-274)

**Current (Vulnerable):**
```typescript
const setActiveBusiness = async (businessId: string) => {
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()
  // NO CHECK that coach is assigned to this business!
}
```

**Fixed:**
```typescript
const setActiveBusiness = async (businessId: string) => {
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()

  // Verify coach has access
  if (viewerContext?.role === 'coach') {
    if (business.assigned_coach_id !== currentUser?.id) {
      console.error('Coach not assigned to this business')
      return // Don't allow switch
    }
  }
}
```

**User Impact:**
- Coaches will only be able to view clients they're assigned to
- If a coach was incorrectly viewing unassigned clients, they will lose access (CORRECT behavior)

---

## Phase 2: Data Integrity

**Timeline:** Day 1-2
**User Impact:** Low to Medium
**Risk:** LOW

### 2.1 Fix Admin Clients Query (Blank Team Members)

**Issue:** Team members appear as blank clients in admin panel.

**File:** `src/app/admin/clients/page.tsx` (line 172)

**Current:**
```typescript
supabase.from('businesses').select('*').order('created_at', { ascending: false })
```

**Fixed:**
```typescript
supabase
  .from('businesses')
  .select('*')
  .not('owner_id', 'is', null)  // Only show businesses with owners
  .not('owner_email', 'is', null)  // Must have owner email
  .order('created_at', { ascending: false })
```

**User Impact:**
- Admins will see accurate client count (team members removed from list)
- No functional change - just cleaner display

---

### 2.2 Add Save Error Feedback

**Issue:** Multiple forms fail silently - users think data saved but it didn't.

**Files to Change:**

| File | Current Behavior | New Behavior |
|------|-----------------|--------------|
| `src/app/goals/hooks/useStrategicPlanning.ts` | Console.error only | Toast error + retry option |
| `src/app/finances/forecast/components/PLForecastTable.tsx` | Console.error only | Toast error notification |
| `src/app/settings/notifications/page.tsx` | Toast auto-dismisses | Persistent error until acknowledged |

**User Impact:**
- Users will SEE errors when saves fail (previously hidden)
- This is BETTER for users - they know to retry
- May initially seem like "more errors" but it's just visibility

---

## Phase 3: Xero Integration

**Timeline:** Day 2-3
**User Impact:** Medium - Users may need to reconnect
**Risk:** MEDIUM

### 3.1 Fix Column Name Mismatch

**Issue:** Code uses `last_sync_at` but database column is `last_synced_at`.

**Files to Change:**
- `src/app/api/Xero/sync/route.ts` (line 203)
- `src/app/api/Xero/sync-forecast/route.ts` (line 327)

**Current:**
```typescript
.update({ last_sync_at: new Date().toISOString() })
```

**Fixed:**
```typescript
.update({ last_synced_at: new Date().toISOString() })
```

**User Impact:**
- Xero sync will actually record last sync time
- Users will see accurate "Last synced" timestamps
- NO disruption - just fixes existing broken feature

---

### 3.2 Encrypt Tokens on Storage

**Issue:** Xero tokens stored unencrypted in callback, but sync expects encrypted.

**File:** `src/app/api/Xero/callback/route.ts` (lines 178-187)

**Current:**
```typescript
access_token: tokens.access_token,      // Plain text!
refresh_token: tokens.refresh_token,    // Plain text!
```

**Fixed:**
```typescript
access_token: encrypt(tokens.access_token),
refresh_token: encrypt(tokens.refresh_token),
```

**User Impact:**
- **IMPORTANT:** Existing Xero connections will break
- Users with connected Xero accounts will need to reconnect ONE TIME
- After reconnect, everything works normally
- More secure going forward

**Mitigation:**
- Add in-app notification prompting reconnection
- Clear error message explaining why reconnection needed

---

### 3.3 Delete Old Duplicate Route Files

**Issue:** Old route files (route 4.ts, route 5.ts, route 3.ts) cause confusion.

**Files to Delete:**
- `src/app/api/Xero/callback/route 4.ts`
- `src/app/api/Xero/callback/route 5.ts`
- `src/app/api/Xero/sync/route 3.ts`

**User Impact:** NONE - These files aren't being used.

---

## Phase 4: Team Member Permissions

**Timeline:** Day 3-4
**User Impact:** HIGH for team members
**Risk:** MEDIUM

### 4.1 Fix BusinessContext Role Assignment

**Issue:** All team members get OWNER permissions regardless of actual role.

**File:** `src/contexts/BusinessContext.tsx` (lines 127-193)

**Current:**
```typescript
// Line 129 - Only selects business_id, missing role
const { data: businessUser } = await supabase
  .from('business_users')
  .select('business_id')  // Missing: role, section_permissions
  .eq('user_id', user.id)
  .single()

// Line 188-193 - Hardcodes owner permissions
setViewerContext({
  role: 'owner',        // WRONG - should use actual role
  canEdit: true,        // WRONG - viewers shouldn't edit
  canDelete: true,      // WRONG - members shouldn't delete
})
```

**Fixed:**
```typescript
// Select role and permissions
const { data: businessUser } = await supabase
  .from('business_users')
  .select('business_id, role, section_permissions')
  .eq('user_id', user.id)
  .single()

// Map role to permissions
const rolePermissions = {
  owner: { canEdit: true, canDelete: true },
  admin: { canEdit: true, canDelete: true },
  member: { canEdit: true, canDelete: false },
  viewer: { canEdit: false, canDelete: false },
}

setViewerContext({
  role: businessUser.role || 'viewer',
  ...rolePermissions[businessUser.role] || rolePermissions.viewer,
})
```

**User Impact:**
| Role | Current Access | New Access | Change |
|------|---------------|------------|--------|
| Owner | Full | Full | No change |
| Admin | Full (incorrect) | Full | No change |
| Member | Full (incorrect) | Edit only, no delete | RESTRICTED |
| Viewer | Full (incorrect) | Read only | RESTRICTED |

**IMPORTANT:** Team members with `viewer` role will lose edit access. This is CORRECT behavior but may surprise users.

**Mitigation:**
- Communicate change to affected users before deployment
- Provide way for business owners to upgrade team member roles if needed

---

### 4.2 Add Team Member Support to Blocked APIs

**Issue:** Several APIs only check for owner/coach, blocking all team members.

**Files to Update:**

| API | Current | After Fix |
|-----|---------|-----------|
| `/api/documents` | Owner/Coach only | + Team members with access |
| `/api/sessions` | Owner/Coach only | + Team members with access |
| `/api/kpis` | Owner/Coach only | + Team members with access |

**Pattern for Each:**
```typescript
// Add after owner/coach check
const { data: teamMember } = await supabase
  .from('business_users')
  .select('role')
  .eq('business_id', businessId)
  .eq('user_id', user.id)
  .eq('status', 'active')
  .single()

if (teamMember) {
  // Allow access based on role
}
```

**User Impact:**
- Team members will GAIN access to features they were incorrectly blocked from
- This is a POSITIVE change

---

## Phase 5: Database Schema

**Timeline:** Week 2
**User Impact:** None if done correctly
**Risk:** HIGH - requires careful migration

### 5.1 Fix user_roles Foreign Key

**Issue:** `user_roles.business_id` references `business_profiles(id)` instead of `businesses(id)`.

**Migration Required:**
```sql
-- 1. Drop the incorrect constraint
ALTER TABLE user_roles
DROP CONSTRAINT IF EXISTS user_roles_business_id_fkey;

-- 2. Add correct constraint
ALTER TABLE user_roles
ADD CONSTRAINT user_roles_business_id_fkey
FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
```

**User Impact:** NONE if migration runs successfully.

**Risk:** HIGH - If data exists with orphaned business_id values, migration will fail.

**Pre-requisite:** Audit existing data for orphaned references.

---

### 5.2 Add Missing Foreign Key Constraints

**Tables Missing FK:**
- `quarterly_priorities.business_id` - no FK
- `quarterly_forecasts.business_id` - no FK
- `vision_targets.business_id` - no FK

**Migration:**
```sql
ALTER TABLE quarterly_priorities
ADD CONSTRAINT quarterly_priorities_business_id_fkey
FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

-- Repeat for other tables
```

**User Impact:** NONE - Just adds referential integrity.

---

### 5.3 Add Missing Indexes

**Columns Missing Indexes:**
- `businesses.owner_id`
- `businesses.assigned_coach_id`
- `businesses.created_by`
- Various FK columns

**Migration:**
```sql
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_assigned_coach_id ON businesses(assigned_coach_id);
-- etc.
```

**User Impact:** NONE visible - Faster queries.

---

## Phase 6: Silent Failures & UX

**Timeline:** Week 2-3
**User Impact:** Users see more feedback
**Risk:** LOW

### 6.1 Add Error Toasts to All Save Operations

**Pattern to Apply:**
```typescript
// Before (silent failure)
const { error } = await supabase.from('table').update(data)
if (error) {
  console.error(error)  // User never knows!
}

// After (visible feedback)
const { error } = await supabase.from('table').update(data)
if (error) {
  console.error(error)
  toast.error('Failed to save changes. Please try again.')
  return false  // Signal failure to caller
}
toast.success('Changes saved')
```

**Files Requiring This Pattern:**
- 15+ service files
- 10+ hooks
- 5+ page components

**User Impact:** Users will see save confirmations and failures clearly.

---

### 6.2 Add Loading States Where Missing

**Pages Missing Proper Loading:**
- Coach Dashboard - basic spinner only
- Messages - subscription may miss initial messages

**User Impact:** Smoother loading experience.

---

## Phase 7: Code Quality

**Timeline:** Ongoing
**User Impact:** None
**Risk:** LOW

### 7.1 Replace Math.random() with UUID

**Files:**
- `src/app/goals/services/kpi-service.ts` (line 144)
- `src/app/reviews/services/weekly-review-service.ts` (line 224)

**User Impact:** NONE - Internal ID generation.

---

### 7.2 Add AbortController to Async Operations

**All hooks should cancel in-flight requests on unmount.**

**User Impact:** NONE - Prevents memory leaks and race conditions.

---

### 7.3 Fix Division by Zero

**File:** `src/app/finances/forecast/services/forecasting-engine.ts`

**Lines:** 25, 54, 59, 100

**User Impact:** Prevents potential crashes in forecast calculations.

---

## Rollback Strategy

### For Each Phase:

**Phase 1 (Security):**
- Revert auth checks if issues arise
- No data changes, easy rollback

**Phase 2 (Data Integrity):**
- Keep backup of original queries
- Can revert to showing all businesses in admin

**Phase 3 (Xero):**
- If encryption breaks existing connections:
  - Temporarily allow both encrypted and unencrypted tokens
  - Give users time to reconnect
  - Then enforce encryption only

**Phase 4 (Team Permissions):**
- Can revert to "owner" permissions if issues
- Recommend: Deploy to staging first, test with real team member accounts

**Phase 5 (Database):**
- Take full database backup before ANY schema changes
- Test migrations on staging database first
- Have rollback scripts ready

---

## Testing Requirements

### Before Each Phase:

| Phase | Test Requirements |
|-------|------------------|
| 1 | Test each API route returns 401 without auth |
| 2 | Test admin panel shows correct client count |
| 3 | Test Xero connection flow end-to-end |
| 4 | Test each role (owner, admin, member, viewer) |
| 5 | Run migrations on staging database first |
| 6 | Test save operations show proper feedback |

### User Acceptance Testing:

**Roles to Test:**
- [ ] Super Admin - full access
- [ ] Coach - assigned clients only
- [ ] Owner - own business only
- [ ] Team Admin - edit/delete access
- [ ] Team Member - edit only, no delete
- [ ] Team Viewer - read only

---

## Deployment Order

### Recommended Sequence:

```
Day 1 (Monday):
├── Phase 1.1: Add auth to API routes
├── Phase 1.2: Fix user_id verification
├── Phase 1.3: Add .env.local to gitignore
└── Phase 2.1: Fix admin clients query

Day 2 (Tuesday):
├── Phase 1.4: Fix coach business validation
├── Phase 3.1: Fix Xero column name
└── Phase 3.3: Delete old route files

Day 3 (Wednesday):
├── Phase 3.2: Encrypt Xero tokens
│   └── Communicate to users: "Please reconnect Xero"
└── Phase 2.2: Add save error feedback

Day 4-5 (Thursday-Friday):
├── Phase 4.1: Fix BusinessContext roles
│   └── Communicate to users: "Team permissions now enforced"
└── Phase 4.2: Add team member API support

Week 2:
├── Phase 5: Database schema fixes (staging first)
└── Phase 6: UX improvements

Ongoing:
└── Phase 7: Code quality improvements
```

---

## Communication Plan

### Before Deployment:

**Email to All Users:**
> Subject: Platform Updates - Action Required for Xero Users
>
> We're rolling out important security and stability updates.
>
> **Xero Users:** You will need to reconnect your Xero account after [DATE].
>
> **Team Members:** Permission levels are now enforced correctly. If you need
> different access, please contact your business owner.

### After Deployment:

**In-App Notification:**
> Your Xero connection needs to be refreshed. [Reconnect Now]

---

## Sign-Off

### Approval Required From:

- [ ] **Product Owner:** Confirm user impact is acceptable
- [ ] **Technical Lead:** Confirm approach is correct
- [ ] **QA:** Confirm testing plan is adequate

### Notes:

_Add any concerns or questions here before approval._

---

## Appendix: Full Issue List

See separate document: `FULL_DIAGNOSTIC_REPORT.md` for all 248 issues with file paths and line numbers.
