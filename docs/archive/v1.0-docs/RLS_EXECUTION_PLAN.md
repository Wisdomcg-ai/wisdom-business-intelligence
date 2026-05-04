# RLS 10/10 Execution Plan

**Created**: 2026-01-27
**Status**: Ready to Execute

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Testing Environment | Local Supabase first, then push to production |
| Jessica's Full Name | Jessica Molloy |
| Jessica's Access Level | Partner = Full access (Team Admin role) |
| Rate Limiting | Skip for now, add later if needed |
| Automated Tests | Manual verification now, automate later |

---

## Phases to Execute

### Now (Core Implementation)

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database Verification | Pending |
| 2 | Create Rollback Snapshot | Pending |
| 3 | Performance Indexes | Pending |
| 4 | RLS Core Functions (12 functions) | Pending |
| 5 | RLS Policies (all tables) | Pending |
| 6 | Soft Delete Safety | Pending |
| 7 | Section Permissions Middleware | Pending |
| 8 | Invite System Hardening | Pending |
| 9 | Audit Logging | Pending |
| 11 | Error Handling Standards | Pending |
| 12 | Create Jessica & Test | Pending |
| 15 | Documentation | Pending |

### Later (Enhancements)

| Phase | Description | When |
|-------|-------------|------|
| 10 | Rate Limiting | When user base grows |
| 13 | Automated Testing | After core is stable |
| 14 | Performance Benchmarking | After production data grows |

---

## Execution Steps

### Step 1: Start Local Supabase

```bash
cd /Users/mattmalouf/Desktop/business-coaching-platform

# Start local Supabase
npx supabase start

# Note the local URLs displayed
```

### Step 2: Run Phase 1 Verification Queries

Connect to local database and run:

```sql
-- 2.1: Get all tables with business_id column
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'business_id'
ORDER BY table_name;

-- 2.2: Get all existing RLS functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (routine_name LIKE '%admin%'
  OR routine_name LIKE '%business%'
  OR routine_name LIKE '%team%'
  OR routine_name LIKE '%auth%'
  OR routine_name LIKE '%rls%'
  OR routine_name LIKE '%coach%'
  OR routine_name LIKE '%owner%'
  OR routine_name LIKE '%member%');

-- 2.3: Get all existing policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2.4: Get Oh Nine business
SELECT id, business_name, owner_id, assigned_coach_id
FROM businesses
WHERE business_name ILIKE '%oh%nine%';

-- 2.5: Check existing indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND (indexdef LIKE '%business_id%'
  OR indexdef LIKE '%user_id%'
  OR indexdef LIKE '%owner_id%')
ORDER BY tablename;

-- 2.6: Count records
SELECT 'businesses' as table_name, COUNT(*) FROM businesses
UNION ALL SELECT 'business_users', COUNT(*) FROM business_users
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'system_roles', COUNT(*) FROM system_roles;
```

### Step 3: Create Migration File

Create: `supabase/migrations/20260127_rls_10_10_implementation.sql`

Contents will include:
- Performance indexes
- 12 RLS functions
- Policies for all tables
- Soft delete handling
- Audit log schema

### Step 4: Run Migration Locally

```bash
# Apply migration to local database
npx supabase db reset

# Or just run the new migration
npx supabase migration up
```

### Step 5: Verify Locally

```sql
-- Check functions created
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE 'auth_%';

-- Check policies created
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename ORDER BY tablename;

-- Test as super_admin
SELECT auth_is_super_admin();

-- Test accessible businesses
SELECT auth_get_accessible_business_ids();
```

### Step 6: Create TypeScript Files

Create these files for API enforcement:
- `src/lib/permissions.ts`
- `src/lib/audit.ts`
- `src/lib/errors.ts`

### Step 7: Update API Routes

Add permission checks to:
- `/src/app/api/forecasts/route.ts`
- `/src/app/api/weekly-reviews/route.ts`
- `/src/app/api/team/invite/route.ts`
- Other business data routes

### Step 8: Test End-to-End Locally

1. Start local app: `npm run dev`
2. Login as super_admin (Matt)
3. Verify all businesses visible
4. Create test team member
5. Login as team member
6. Verify correct access

### Step 9: Push to Production

```bash
# When all local tests pass
npx supabase db push

# Or link and push
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### Step 10: Create Jessica in Production

1. Supabase Dashboard → Authentication → Users → Add User
   - Email: jessica@ohnine.com.au
   - Password: (secure password)
   - Auto-confirm: Yes

2. Run SQL to add to business:
```sql
-- Get Jessica's auth ID from dashboard first
-- Get Oh Nine business ID

INSERT INTO users (id, email, first_name, last_name, system_role)
VALUES ('JESSICA_AUTH_ID', 'jessica@ohnine.com.au', 'Jessica', 'Molloy', 'client');

INSERT INTO system_roles (user_id, role)
VALUES ('JESSICA_AUTH_ID', 'client');

INSERT INTO business_users (business_id, user_id, role, status, section_permissions, invited_at)
VALUES (
  'OH_NINE_BUSINESS_ID',
  'JESSICA_AUTH_ID',
  'admin',  -- Full access as partner
  'active',
  '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":true,"team":true,"settings":true}',
  NOW()
);
```

### Step 11: Final Verification

| Test | As User | Expected |
|------|---------|----------|
| See all businesses | Matt (super_admin) | All 20 clients |
| See Oh Nine only | Jessica | Only Oh Nine |
| Edit weekly review | Jessica | Success |
| Edit forecast | Jessica | Success |
| Manage team | Jessica | Success (she's admin) |
| See other business | Jessica | Access denied |

---

## Rollback Instructions

If anything goes wrong:

### Local Rollback
```bash
npx supabase db reset
```

### Production Rollback
```sql
-- Run the rollback snapshot created in Phase 2
\i supabase/migrations/20260127_rls_rollback_snapshot.sql
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260127_rls_10_10_implementation.sql` | Main migration |
| `supabase/migrations/20260127_rls_rollback_snapshot.sql` | Rollback script |
| `src/lib/permissions.ts` | Permission checking utilities |
| `src/lib/audit.ts` | Audit logging utility |
| `src/lib/errors.ts` | Standardized error types |
| `docs/TEAM_MEMBER_GUIDE.md` | User documentation |

---

## Success Criteria

- [ ] All 12 auth_* functions exist
- [ ] All tables have RLS policies
- [ ] Performance indexes created
- [ ] No 500 errors as any user
- [ ] Super admin sees all businesses
- [ ] Jessica can login and see Oh Nine
- [ ] Jessica has full access to Oh Nine
- [ ] Jessica cannot see other businesses
- [ ] Audit log records actions
- [ ] API permission checks work

---

## Notes

- Jessica is a partner, gets `admin` role with full section permissions
- Rate limiting deferred to later
- Automated tests deferred to later
- Using local Supabase for safe testing before production
