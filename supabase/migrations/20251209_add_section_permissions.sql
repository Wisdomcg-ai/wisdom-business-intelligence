-- Add section_permissions column to business_users and team_invites tables
-- This allows restricting which sidebar sections team members can see
-- Permissions mirror the sidebar structure exactly with groups and sub-items

-- Add section_permissions to business_users (owners get all access by default)
ALTER TABLE business_users
ADD COLUMN IF NOT EXISTS section_permissions JSONB DEFAULT '{
  "business_plan": true,
  "my_business": true,
  "vision_mission": true,
  "roadmap": true,
  "goals_rocks": true,
  "one_page_plan": true,
  "financial": true,
  "financial_forecast": true,
  "financial_dashboard": true,
  "execute": true,
  "kpi_dashboard": true,
  "weekly_review": true,
  "quarterly_review": true,
  "actions": true,
  "messages": true
}'::jsonb;

-- Add section_permissions to team_invites (financial disabled by default for team members)
ALTER TABLE team_invites
ADD COLUMN IF NOT EXISTS section_permissions JSONB DEFAULT '{
  "business_plan": true,
  "my_business": true,
  "vision_mission": true,
  "roadmap": true,
  "goals_rocks": true,
  "one_page_plan": true,
  "financial": false,
  "financial_forecast": false,
  "financial_dashboard": false,
  "execute": true,
  "kpi_dashboard": true,
  "weekly_review": true,
  "quarterly_review": true,
  "actions": true,
  "messages": true
}'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN business_users.section_permissions IS 'JSON object controlling which sidebar sections this user can access. Groups: business_plan (my_business, vision_mission, roadmap, goals_rocks, one_page_plan), financial (financial_forecast, financial_dashboard), execute (kpi_dashboard, weekly_review, quarterly_review, actions), messages';
COMMENT ON COLUMN team_invites.section_permissions IS 'JSON object controlling which sidebar sections this invited user will be able to access once they accept';
