/**
 * Team Member Utilities
 * =====================
 *
 * Shared functions for team member display across Step 4 and Step 5.
 */

import { AVATAR_COLORS } from './design-tokens'

export interface TeamMember {
  id: string
  name: string
  initials: string
  color: string
  role?: string
}

/**
 * Generate initials from a name (e.g., "John Doe" → "JD")
 */
export function getInitials(name: string): string {
  if (!name) return '??'
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Get a consistent color for a name (same name always gets same color)
 */
export function getColorForName(name: string): string {
  if (!name) return AVATAR_COLORS[0]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

/**
 * Create a TeamMember object from just a name
 */
export function createTeamMember(name: string, id?: string, role?: string): TeamMember {
  return {
    id: id || `member-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name,
    initials: getInitials(name),
    color: getColorForName(name),
    role
  }
}

/**
 * Parse team members from business profile data
 */
export function parseTeamFromProfile(profile: {
  owner_info?: { owner_name?: string }
  key_roles?: Array<{ name: string; role?: string }>
}, businessId: string): TeamMember[] {
  const members: TeamMember[] = []

  // Add owner from owner_info
  if (profile.owner_info && typeof profile.owner_info === 'object') {
    const ownerInfo = profile.owner_info as { owner_name?: string }
    if (ownerInfo.owner_name) {
      members.push({
        id: `owner-${businessId}`,
        name: ownerInfo.owner_name,
        initials: getInitials(ownerInfo.owner_name),
        color: getColorForName(ownerInfo.owner_name),
        role: 'Owner'
      })
    }
  }

  // Add team members from key_roles
  if (profile.key_roles && Array.isArray(profile.key_roles)) {
    profile.key_roles.forEach((role, index) => {
      if (role.name && role.name.trim()) {
        members.push({
          id: `role-${businessId}-${index}`,
          name: role.name,
          initials: getInitials(role.name),
          color: getColorForName(role.name),
          role: role.role
        })
      }
    })
  }

  return members
}
