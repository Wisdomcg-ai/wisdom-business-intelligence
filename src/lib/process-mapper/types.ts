/**
 * Process Mapper Type Definitions
 * Supports adaptive roles and functions (both user-defined)
 */

// Basic types
export type ActivityType = 'action' | 'decision';

// Activity in a specific Role × Function cell
export interface Activity {
  id: string;
  title: string;
  role: string;
  function: string;
  type: ActivityType;
  order: number;
}

// Connection between two activities
export interface Connection {
  from: string;
  to: string;
  label?: string;
}

// Complete process data structure
export interface ProcessData {
  name: string;
  description?: string;
  roles: string[];
  functions: string[];
  activities: Activity[];
  connections: Connection[];
}

// Color palette for functions (bright, clean, professional like bathroom reno PDF)
export const FUNCTION_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  'MARKETING': { 
    bg: '#FCD34D',        // Bright yellow
    border: '#F59E0B',    // Darker yellow border
    text: '#78350f',      // Dark text
    light: '#FFFBEB'      // Very light yellow background
  },
  'SALES': { 
    bg: '#FCD34D',        // Yellow (same as marketing for clean look)
    border: '#F59E0B',
    text: '#78350f',
    light: '#FFFBEB'
  },
  'OPERATIONS': { 
    bg: '#22D3EE',        // Bright cyan/turquoise
    border: '#0891B2',    // Darker cyan border
    text: '#164e63',      // Dark text
    light: '#ECFDF5'      // Very light cyan background
  },
  'FINANCE': { 
    bg: '#FB923C',        // Bright orange
    border: '#EA580C',    // Darker orange border
    text: '#7C2D12',      // Dark text
    light: '#FEF3C7'      // Very light orange background
  },
};

// Default color for unknown functions
export const DEFAULT_FUNCTION_COLOR = { 
  bg: '#E5E7EB', 
  border: '#9CA3AF', 
  text: '#374151',
  light: '#F3F4F6'
};

// Color palette for roles (matching the swimlane colors)
export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  'Sales': { bg: '#FFFBEB', text: '#78350f' },
  'Marketing': { bg: '#FFFBEB', text: '#78350f' },
  'Operations': { bg: '#ECFDF5', text: '#164e63' },
  'Finance': { bg: '#FEF3C7', text: '#7C2D12' },
  'Admin': { bg: '#F3F4F6', text: '#374151' },
  'Director': { bg: '#F3F4F6', text: '#374151' },
  'Project Management': { bg: '#F3F4F6', text: '#374151' },
  'Sales Rep': { bg: '#FFFBEB', text: '#78350f' },
  'Sales Manager': { bg: '#FFFBEB', text: '#78350f' },
  'Operations Lead': { bg: '#ECFDF5', text: '#164e63' },
  'Finance Manager': { bg: '#FEF3C7', text: '#7C2D12' },
};

// Default role color for unknown roles
export const DEFAULT_ROLE_COLOR = { bg: '#F3F4F6', text: '#374151' };

// Grid sizing constants
export const GRID_CONFIG = {
  colWidth: 200,
  rowHeight: 140,
  activityWidth: 160,
  activityHeight: 80,
  headerHeight: 80,
  sidebarWidth: 160,
  padding: 12,
  gap: 8,
};

// Helper to get color for a function (with fallback)
export function getFunctionColor(functionName: string) {
  return FUNCTION_COLORS[functionName] || DEFAULT_FUNCTION_COLOR;
}

// Helper to get color for a role (with fallback)
export function getRoleColor(roleName: string) {
  return ROLE_COLORS[roleName] || DEFAULT_ROLE_COLOR;
}

// Validation function
export function validateProcessData(data: ProcessData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || data.name.trim() === '') {
    errors.push('Process name is required');
  }

  if (!data.roles || data.roles.length === 0) {
    errors.push('At least one role is required');
  }

  if (!data.functions || data.functions.length === 0) {
    errors.push('At least one function is required');
  }

  if (!data.activities || data.activities.length === 0) {
    errors.push('At least one activity is required');
  }

  // Check that all activities reference valid roles and functions
  for (const activity of data.activities) {
    if (!data.roles.includes(activity.role)) {
      errors.push(`Activity "${activity.title}" references invalid role "${activity.role}"`);
    }
    if (!data.functions.includes(activity.function)) {
      errors.push(`Activity "${activity.title}" references invalid function "${activity.function}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}