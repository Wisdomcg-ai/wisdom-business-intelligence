# Row Level Security (RLS) Architecture

## Overview

This document describes the RLS architecture for the business coaching platform, implementing Supabase best practices to ensure security, performance, and maintainability.

## Best Practices Implemented

Based on [Supabase RLS Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv):

1. **SECURITY DEFINER functions** - All helper functions use `SECURITY DEFINER` to bypass RLS and prevent infinite recursion
2. **Function caching** - All function calls wrapped in `(SELECT function())` for query optimizer caching
3. **Optimized query direction** - Uses `column = ANY(array)` instead of `EXISTS` subqueries
4. **Proper indexes** - All RLS columns have B-tree indexes
5. **Role restriction** - All policies use `TO authenticated` to skip anonymous users
6. **SQL over PL/pgSQL** - Helper functions use pure SQL for better performance

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     HELPER FUNCTIONS                         │
│                   (SECURITY DEFINER)                         │
├─────────────────────────────────────────────────────────────┤
│  rls_is_super_admin()     → system_roles                    │
│  rls_user_owned_businesses()    → businesses                │
│  rls_user_coached_businesses()  → businesses                │
│  rls_user_team_businesses()     → business_users            │
│  rls_user_all_businesses()      → businesses + business_users│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CORE TABLES                               │
│              (Non-recursive policies)                        │
├─────────────────────────────────────────────────────────────┤
│  system_roles   → Direct column checks only                 │
│  businesses     → owner_id, coach_id + helper functions     │
│  business_users → owner/coach via helper functions          │
│  users          → self + coach access via helper functions  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  BUSINESS DATA TABLES                        │
│           (All use rls_user_all_businesses())               │
├─────────────────────────────────────────────────────────────┤
│  financial_forecasts, weekly_reviews, business_kpis,        │
│  strategic_initiatives, goals, messages, sessions,          │
│  notifications, xero_connections, etc.                      │
└─────────────────────────────────────────────────────────────┘
```

## Helper Functions

### `rls_is_super_admin()`
Returns `TRUE` if current user has `super_admin` role in `system_roles`.

### `rls_user_owned_businesses()`
Returns array of business UUIDs where current user is `owner_id`.

### `rls_user_coached_businesses()`
Returns array of business UUIDs where current user is `assigned_coach_id`.

### `rls_user_team_businesses()`
Returns array of business UUIDs where current user is in `business_users` with `status = 'active'`.

### `rls_user_all_businesses()`
Returns combined array of all businesses user has access to (owned + coached + team member).

## Access Control Matrix

| Role | Own Business | Coached Business | Team Member | All Businesses |
|------|--------------|------------------|-------------|----------------|
| Owner | Full | - | - | - |
| Coach | - | Full | - | - |
| Team Member | - | - | Read + Write* | - |
| Super Admin | Full | Full | Full | Full |

*Team member write access depends on their role in `business_users`.

## Preventing Infinite Recursion

### The Problem
Circular dependencies between RLS policies cause infinite recursion:
```
businesses policy → queries business_users → triggers business_users RLS
business_users policy → queries businesses → triggers businesses RLS
→ INFINITE LOOP
```

### The Solution
1. All cross-table queries are wrapped in `SECURITY DEFINER` functions
2. These functions bypass RLS, breaking the cycle
3. Core tables use only direct column checks + helper functions

## Performance Optimization

### Indexes
Every column used in RLS policies has an index:
```sql
idx_businesses_owner_id
idx_businesses_assigned_coach_id
idx_business_users_user_id
idx_business_users_business_id
idx_business_users_user_status (composite, partial)
idx_system_roles_user_id
idx_system_roles_role
idx_<table>_business_id (for all business data tables)
```

### Query Pattern
Instead of:
```sql
-- SLOW: Correlated subquery, evaluates per row
EXISTS (SELECT 1 FROM businesses WHERE id = table.business_id AND owner_id = auth.uid())
```

We use:
```sql
-- FAST: Array cached once, compared against each row
business_id = ANY((SELECT rls_user_all_businesses()))
```

## Adding New Tables

### Tables with `business_id` column
Add the table name to the array in the migration:
```sql
tables_with_business_id TEXT[] := ARRAY[
    'your_new_table',
    -- ... existing tables
];
```

### Tables with different access patterns
Create a custom policy following the pattern:
```sql
CREATE POLICY "your_table_select" ON your_table
FOR SELECT TO authenticated
USING (
    -- Your custom condition
    OR (SELECT rls_is_super_admin())
);
```

## Troubleshooting

### "infinite recursion detected in policy"
1. Check if any policy on core tables (`businesses`, `business_users`) queries another core table
2. Ensure all cross-table queries use `SECURITY DEFINER` functions

### Slow queries
1. Run `EXPLAIN ANALYZE` on the query
2. Check if indexes exist on RLS columns
3. Ensure functions are wrapped in `(SELECT function())`

### Access denied unexpectedly
1. Check user's role in `system_roles`
2. Verify business ownership/assignment in `businesses`
3. Check team membership in `business_users` (including `status = 'active'`)

## Migration History

| Date | Migration | Purpose |
|------|-----------|---------|
| 2026-01-23 | `20260123_rls_best_practices_baseline.sql` | Complete RLS rewrite following Supabase best practices |

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Discussion: Infinite Recursion](https://github.com/orgs/supabase/discussions/1138)
