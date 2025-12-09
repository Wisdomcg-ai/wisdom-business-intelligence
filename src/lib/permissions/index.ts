/**
 * Permission System
 * Handles section permissions for team members
 */

import { SectionPermissions } from '@/app/settings/team/page'

// Default permissions for owners/admins (full access)
export const FULL_PERMISSIONS: SectionPermissions = {
  business_plan: true,
  finances: true,
  business_engines: true,
  execute_kpi: true,
  execute_weekly_review: true,
  execute_issues: true,
  execute_ideas: true,
  execute_productivity: true,
  review_quarterly: true,
  coaching_messages: true,
  coaching_sessions: true,
}

// Default permissions for new team members (finances disabled)
export const DEFAULT_MEMBER_PERMISSIONS: SectionPermissions = {
  business_plan: true,
  finances: false,
  business_engines: true,
  execute_kpi: true,
  execute_weekly_review: true,
  execute_issues: true,
  execute_ideas: true,
  execute_productivity: true,
  review_quarterly: true,
  coaching_messages: true,
  coaching_sessions: true,
}

// Map sidebar sections to permission keys
export const SECTION_PERMISSION_MAP: Record<string, keyof SectionPermissions | null> = {
  // Always accessible (null = always show)
  'HOME': null,
  'SETUP': null,
  'Command Centre': null,
  'Business Profile': null,
  'Assessment': null,
  'Settings': null,
  'Help & Support': null,

  // Business Plan section (all-or-nothing)
  'BUSINESS PLAN': 'business_plan',
  'Roadmap': 'business_plan',
  'Vision, Mission & Values': 'business_plan',
  'SWOT Analysis': 'business_plan',
  'Goals & Targets': 'business_plan',
  'One-Page Plan': 'business_plan',

  // Finances section (all-or-nothing)
  'FINANCES': 'finances',
  'Financial Forecast': 'finances',
  'Budget vs Actual': 'finances',
  '13-Week Rolling Cashflow': 'finances',

  // Execute section (individual)
  'EXECUTE': null, // Section header always shows, items are filtered
  'KPI Dashboard': 'execute_kpi',
  'Weekly Review': 'execute_weekly_review',
  'Issues List': 'execute_issues',
  'Ideas Journal': 'execute_ideas',
  'Productivity': 'execute_productivity',
  'Open Loops': 'execute_productivity',
  'To-Do': 'execute_productivity',
  'Stop Doing': 'execute_productivity',

  // Business Engines section (all-or-nothing)
  'BUSINESS ENGINES': 'business_engines',
  'Marketing': 'business_engines',
  'Value Proposition & USP': 'business_engines',
  'Marketing Channels': 'business_engines',
  'Content Planner': 'business_engines',
  'Team': 'business_engines',
  'Accountability Chart': 'business_engines',
  'Org Chart Builder': 'business_engines',
  'Team Performance': 'business_engines',
  'Hiring Roadmap': 'business_engines',
  'Systems': 'business_engines',
  'Systems & Processes': 'business_engines',

  // Review section (individual)
  'REVIEW': null, // Section header always shows
  'Quarterly Review': 'review_quarterly',

  // Coaching section (individual)
  'COACHING': null, // Section header always shows, items are filtered
  'Messages': 'coaching_messages',
  'Session Notes': 'coaching_sessions',
}

/**
 * Check if user has permission to see a section/item
 */
export function hasPermission(
  itemLabel: string,
  permissions: SectionPermissions | null,
  userRole: string
): boolean {
  // Owners, admins, and coaches always have full access
  if (['owner', 'admin', 'coach'].includes(userRole)) {
    return true
  }

  // If no permissions object, allow everything (backwards compatibility)
  if (!permissions) {
    return true
  }

  const permissionKey = SECTION_PERMISSION_MAP[itemLabel]

  // If null, always show (setup, home, etc.)
  if (permissionKey === null) {
    return true
  }

  // If undefined (not in map), show by default
  if (permissionKey === undefined) {
    return true
  }

  return permissions[permissionKey] === true
}

/**
 * Filter navigation items based on permissions
 */
export function filterNavigationByPermissions<T extends { label: string; children?: T[] }>(
  items: T[],
  permissions: SectionPermissions | null,
  userRole: string
): T[] {
  return items
    .filter((item) => hasPermission(item.label, permissions, userRole))
    .map((item) => ({
      ...item,
      children: item.children
        ? filterNavigationByPermissions(item.children, permissions, userRole)
        : undefined,
    }))
    .filter((item) => {
      // Remove items with children if all children are filtered out
      if (item.children && item.children.length === 0) {
        return false
      }
      return true
    })
}

/**
 * Check if a section should be shown (has at least one visible item)
 */
export function shouldShowSection(
  sectionTitle: string,
  items: { label: string }[],
  permissions: SectionPermissions | null,
  userRole: string
): boolean {
  // Check if section header itself requires permission
  if (!hasPermission(sectionTitle, permissions, userRole)) {
    return false
  }

  // Check if at least one item in the section is visible
  return items.some((item) => hasPermission(item.label, permissions, userRole))
}
