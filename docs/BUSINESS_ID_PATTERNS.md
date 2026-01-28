# Business ID Patterns Reference

## The Problem

This codebase has **three different UUID types** stored in `business_id` columns across tables. RLS policies must account for all three, or coach/team-member access silently fails (406/403 errors).

## The Three ID Types

| ID Type | Source Table | Example Use | How Coach Resolves |
|---------|-------------|-------------|-------------------|
| `businesses.id` | `businesses` | Coach assignment, business lookup | Direct — `assigned_coach_id = auth.uid()` |
| `business_profiles.id` | `business_profiles` | Planning data, financials, KPIs | Via `business_profiles.business_id` → `businesses.id` |
| `user_id` (owner's auth UUID) | `auth.users` | SWOT only | Via `businesses.owner_id` |

## Table-to-ID Mapping

### Tables using `business_profiles.id` as `business_id`

These are the majority. The `business_id` column stores `business_profiles.id`, NOT `businesses.id`.

- `business_financial_goals` (TEXT column)
- `business_kpis` (TEXT column)
- `strategic_initiatives` (UUID column)
- `sprint_key_actions`
- `operational_activities`
- `financial_forecasts`
- `stop_doing_items`, `stop_doing_activities`, `stop_doing_hourly_rates`, `stop_doing_time_logs`
- `weekly_reviews`, `quarterly_reviews`
- `annual_targets`, `vision_targets`
- `coaching_sessions`, `sessions`, `session_notes`
- `messages`
- `goals`, `action_items`, `todo_items`
- `notifications`, `notification_preferences`
- `ai_cfo_conversations`
- `xero_connections`
- `team_data`
- `roadmap_progress`, `stage_transitions`
- `active_editors`
- `weekly_report_periods`, `team_weekly_reports`
- `marketing_data`, `financial_metrics`, `weekly_metrics_snapshots`

### Tables using `user_id` (owner's auth UUID) as `business_id`

- `swot_analyses` — also has a separate `user_id` column
- `swot_items` — inherits via `swot_analysis_id` FK

### Tables using `businesses.id` as `business_id`

- `business_profiles` — `business_id` FK to `businesses.id`
- `business_users` — `business_id` FK to `businesses.id`

## RLS Policy Patterns

### For tables with `businesses.id`
Standard pattern — works with `auth_get_accessible_business_ids()`:
```sql
business_id = ANY(auth_get_accessible_business_ids())
```

### For tables with `business_profiles.id`
Must resolve through the join chain `business_profiles` → `businesses`:
```sql
EXISTS (
    SELECT 1 FROM business_profiles bp
    JOIN businesses b ON b.id = bp.business_id
    WHERE bp.id::text = table_name.business_id::text
    AND (
        b.owner_id = auth.uid()
        OR b.assigned_coach_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM business_users bu
            WHERE bu.business_id = b.id
            AND bu.user_id = auth.uid()
            AND bu.status = 'active'
        )
    )
)
```

### For SWOT tables (user_id pattern)
Must resolve through `businesses.owner_id`:
```sql
business_id IN (
    SELECT b.owner_id FROM businesses b
    WHERE b.assigned_coach_id = auth.uid()
)
```

## Rules for New Tables

1. **Decide which ID type your table uses** — check what the service/hook passes as `business_id`
2. **Write the RLS policy to match** — use the correct pattern from above
3. **Test as coach** — always test coach view access, not just owner access
4. **Check column type** — some tables use TEXT, others UUID. Use `::text` casts or the appropriate `auth_get_accessible_business_ids_text()` function
5. **Add new tables to this document** when creating them

## Rules for New RLS Policies

1. Never use the generic `business_id = ANY(auth_get_accessible_business_ids())` pattern alone unless the table truly stores `businesses.id`
2. Always include the `business_profiles` join for planning data tables
3. Always include the `businesses.owner_id` lookup for SWOT-pattern tables
4. Test with: owner login, coach login viewing client, team member login

## Code-Side Resolution

`BusinessContext` caches `businessProfileId` (resolved during init). Hooks should use this instead of re-querying `business_profiles` on every page load:

```typescript
const { activeBusiness, businessProfileId } = useBusinessContext()
// Use businessProfileId for planning data queries
// Use activeBusiness.ownerId for SWOT queries
// Use activeBusiness.id for businesses-table queries
```
