/**
 * Audit Logging System
 * Tracks all data changes for accountability and history
 */

import { createClient } from '@/lib/supabase/client'

// Field labels for human-readable descriptions
const FIELD_LABELS: Record<string, string> = {
  // Vision & Mission
  vision_statement: 'Vision Statement',
  mission_statement: 'Mission Statement',
  values: 'Core Values',
  purpose: 'Purpose',
  bhag: 'BHAG',

  // Goals & Targets
  revenue_target: 'Revenue Target',
  profit_target: 'Profit Target',
  goal_title: 'Goal Title',
  goal_description: 'Goal Description',
  target_value: 'Target Value',
  current_value: 'Current Value',
  due_date: 'Due Date',
  status: 'Status',
  priority: 'Priority',

  // Financial
  budget: 'Budget',
  forecast: 'Forecast',
  actual: 'Actual',
  variance: 'Variance',

  // General
  name: 'Name',
  title: 'Title',
  description: 'Description',
  notes: 'Notes',
  completed: 'Completed',
  assigned_to: 'Assigned To',
}

// Table labels for human-readable descriptions
const TABLE_LABELS: Record<string, string> = {
  businesses: 'Business Profile',
  business_profiles: 'Business Profile',
  vision_mission: 'Vision & Mission',
  goals: 'Goal',
  rocks: 'Rock',
  kpis: 'KPI',
  issues: 'Issue',
  ideas: 'Idea',
  todos: 'To-Do',
  open_loops: 'Open Loop',
  stop_doing: 'Stop Doing Item',
  weekly_reviews: 'Weekly Review',
  quarterly_reviews: 'Quarterly Review',
  swot_analyses: 'SWOT Analysis',
  financial_forecasts: 'Financial Forecast',
  team_data: 'Team Data',
}

export interface AuditLogEntry {
  id?: string
  business_id: string
  user_id: string
  user_name: string
  user_email: string
  table_name: string
  record_id: string
  action: 'create' | 'update' | 'delete'
  field_name?: string
  old_value?: unknown
  new_value?: unknown
  changes?: Record<string, { old: unknown; new: unknown }>
  description?: string
  created_at?: Date | string
}

/**
 * Generate a human-readable description of a change
 */
export function describeChange(
  tableName: string,
  action: 'create' | 'update' | 'delete',
  fieldName?: string,
  oldValue?: unknown,
  newValue?: unknown
): string {
  const tableLabel = TABLE_LABELS[tableName] || tableName
  const fieldLabel = fieldName ? (FIELD_LABELS[fieldName] || fieldName) : ''

  if (action === 'create') {
    return `Created new ${tableLabel}`
  }

  if (action === 'delete') {
    return `Deleted ${tableLabel}`
  }

  // Update action
  if (!fieldName) {
    return `Updated ${tableLabel}`
  }

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'empty'
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    if (typeof val === 'number') return val.toLocaleString()
    if (typeof val === 'string') {
      if (val.length > 50) return `"${val.substring(0, 50)}..."`
      return `"${val}"`
    }
    return String(val)
  }

  if (oldValue === null || oldValue === undefined) {
    return `Set ${fieldLabel} to ${formatValue(newValue)}`
  }

  if (newValue === null || newValue === undefined) {
    return `Cleared ${fieldLabel}`
  }

  return `Changed ${fieldLabel} from ${formatValue(oldValue)} to ${formatValue(newValue)}`
}

/**
 * Generate descriptions for multiple field changes
 */
export function describeChanges(
  tableName: string,
  changes: Record<string, { old: unknown; new: unknown }>
): string {
  const changedFields = Object.keys(changes)

  if (changedFields.length === 0) {
    return `Updated ${TABLE_LABELS[tableName] || tableName}`
  }

  if (changedFields.length === 1) {
    const field = changedFields[0]
    return describeChange(tableName, 'update', field, changes[field].old, changes[field].new)
  }

  const fieldLabels = changedFields.map(f => FIELD_LABELS[f] || f)
  return `Updated ${fieldLabels.join(', ')} on ${TABLE_LABELS[tableName] || tableName}`
}

/**
 * Log a change to the audit log
 */
export async function logChange(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Generate description if not provided
    const description = entry.description || (
      entry.changes
        ? describeChanges(entry.table_name, entry.changes)
        : describeChange(entry.table_name, entry.action, entry.field_name, entry.old_value, entry.new_value)
    )

    const { error } = await supabase.from('audit_log').insert({
      business_id: entry.business_id,
      user_id: entry.user_id,
      user_name: entry.user_name,
      user_email: entry.user_email,
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      field_name: entry.field_name,
      old_value: entry.old_value ? JSON.stringify(entry.old_value) : null,
      new_value: entry.new_value ? JSON.stringify(entry.new_value) : null,
      changes: entry.changes ? JSON.stringify(entry.changes) : null,
      description,
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
    })

    if (error) {
      console.error('[Audit] Failed to log change:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('[Audit] Error logging change:', error)
    return { success: false, error: 'Failed to log change' }
  }
}

/**
 * Calculate diff between two objects
 */
export function calculateDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fieldsToTrack?: string[]
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {}

  const fields = fieldsToTrack || [...new Set([...Object.keys(oldData), ...Object.keys(newData)])]

  for (const field of fields) {
    // Skip metadata fields
    if (['id', 'created_at', 'updated_at', 'business_id', 'user_id'].includes(field)) {
      continue
    }

    const oldVal = oldData[field]
    const newVal = newData[field]

    // Deep compare for objects/arrays
    const oldStr = JSON.stringify(oldVal)
    const newStr = JSON.stringify(newVal)

    if (oldStr !== newStr) {
      changes[field] = { old: oldVal, new: newVal }
    }
  }

  return changes
}

/**
 * Fetch audit history for a specific record
 */
export async function getRecordHistory(
  tableName: string,
  recordId: string,
  limit = 50
): Promise<{ data: AuditLogEntry[] | null; error?: string }> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { data: null, error: error.message }
    }

    return { data }
  } catch (error) {
    return { data: null, error: 'Failed to fetch history' }
  }
}

/**
 * Fetch recent audit log for a business
 */
export async function getBusinessAuditLog(
  businessId: string,
  options?: {
    limit?: number
    offset?: number
    tableName?: string
    userId?: string
    action?: 'create' | 'update' | 'delete'
  }
): Promise<{ data: AuditLogEntry[] | null; count: number; error?: string }> {
  try {
    const supabase = createClient()

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (options?.tableName) {
      query = query.eq('table_name', options.tableName)
    }

    if (options?.userId) {
      query = query.eq('user_id', options.userId)
    }

    if (options?.action) {
      query = query.eq('action', options.action)
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    } else {
      query = query.limit(options?.limit || 50)
    }

    const { data, count, error } = await query

    if (error) {
      return { data: null, count: 0, error: error.message }
    }

    return { data, count: count || 0 }
  } catch (error) {
    return { data: null, count: 0, error: 'Failed to fetch audit log' }
  }
}

/**
 * Create an audit wrapper for update functions
 * This HOF wraps an update function to automatically log changes
 */
export function withAuditLog<T extends Record<string, unknown>>(
  tableName: string,
  updateFn: (data: T) => Promise<{ data: T | null; error?: string }>,
  getRecordFn: (id: string) => Promise<T | null>
) {
  return async (
    recordId: string,
    newData: Partial<T>,
    user: { id: string; name: string; email: string },
    businessId: string
  ): Promise<{ data: T | null; error?: string }> => {
    // Get the old data first
    const oldData = await getRecordFn(recordId)

    if (!oldData) {
      return { data: null, error: 'Record not found' }
    }

    // Perform the update
    const result = await updateFn({ ...oldData, ...newData, id: recordId } as T)

    if (result.error) {
      return result
    }

    // Calculate and log the diff
    const changes = calculateDiff(oldData as Record<string, unknown>, newData as Record<string, unknown>)

    if (Object.keys(changes).length > 0) {
      await logChange({
        business_id: businessId,
        user_id: user.id,
        user_name: user.name,
        user_email: user.email,
        table_name: tableName,
        record_id: recordId,
        action: 'update',
        changes,
      })
    }

    return result
  }
}
