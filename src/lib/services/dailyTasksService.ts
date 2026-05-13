// /lib/services/dailyTasksService.ts
// DAILY TASKS SERVICE - Supabase Integration
// Handles: Overdue detection, specific dates, days overdue tracking, and auto-archive
//
// Phase 61-03 update:
//   - READ functions drop `.eq('user_id', userId)`; RLS (from 61-02) gates visibility.
//   - Each returned row carries `is_owner` and `owner_display_name` derived in-memory.
//   - `shareTask` / `markTaskComplete` exposed for the new share-and-status-sync flow.
//   - Owner-only mutations (updateTaskStatus / updateTaskPriority / updateTaskDueDate /
//     deleteTask / deleteArchivedTasks) keep their defensive `user_id` filter.

'use client'

import { createClient } from '@/lib/supabase/client'

// ============================================================================
// TYPE DEFINITIONS - What a task looks like
// ============================================================================

export type TaskPriority = 'critical' | 'important' | 'nice-to-do'
export type TaskStatus = 'to-do' | 'in-progress' | 'done'
export type TaskDueDate = 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'custom'

export type ShareMode = 'private' | 'team' | 'specific'

export interface DailyTask {
  id: string
  user_id: string
  business_id?: string | null
  title: string
  priority: TaskPriority
  status: TaskStatus
  due_date: TaskDueDate
  specific_date?: string | null // For custom dates (YYYY-MM-DD format)
  open_loop_id?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null // When task was archived
  // Phase 61 sharing fields
  shared_with_all?: boolean
  shared_with?: string[]
  // Derived by the service (not stored)
  is_owner?: boolean
  owner_display_name?: string
}

export interface CreateDailyTaskInput {
  title: string
  priority: TaskPriority
  due_date: TaskDueDate
  specific_date?: string | null
  open_loop_id?: string | null
}

export interface DailyTaskStats {
  total: number
  critical: number
  important: number
  niceTooDo: number
  completed: number
  completionRate: number
  overdue: number
}

// ============================================================================
// CONFIGURATION - Labels and colors
// ============================================================================

export const PRIORITY_CONFIG = {
  critical: {
    label: 'Critical',
    description: 'Do first - blocks other work',
    color: 'text-red-700 bg-red-50 border-red-200'
  },
  important: {
    label: 'Important',
    description: 'Do next - moves business forward',
    color: 'text-amber-700 bg-amber-50 border-amber-200'
  },
  'nice-to-do': {
    label: 'Nice-to-do',
    description: 'If time allows',
    color: 'text-green-700 bg-green-50 border-green-200'
  }
}

export const DUE_DATE_CONFIG = {
  today: { label: 'Today', daysFromNow: 0 },
  tomorrow: { label: 'Tomorrow', daysFromNow: 1 },
  'this-week': { label: 'This Week', daysFromNow: 7 },
  'next-week': { label: 'Next Week', daysFromNow: 14 },
  custom: { label: 'Custom Date', daysFromNow: null }
}

// ============================================================================
// UTILITY FUNCTIONS - Helper functions (no database access)
// ============================================================================

export function getPriorityLabel(priority: TaskPriority): string {
  return PRIORITY_CONFIG[priority].label
}

export function getPriorityColor(priority: TaskPriority): string {
  return PRIORITY_CONFIG[priority].color
}

/**
 * Convert due_date type to actual date string
 */
export function getDueDateAsString(dueDate: TaskDueDate, specificDate?: string | null): string {
  if (dueDate === 'custom' && specificDate) {
    return specificDate
  }

  const today = new Date()
  const daysFromNow = DUE_DATE_CONFIG[dueDate].daysFromNow
  if (daysFromNow === null) return today.toISOString().split('T')[0]

  const date = new Date(today.getTime() + daysFromNow * 24 * 60 * 60 * 1000)
  return date.toISOString().split('T')[0]
}

/**
 * Check if task is overdue
 */
export function isOverdue(dueDate: TaskDueDate, specificDate?: string | null): boolean {
  const dueDateStr = getDueDateAsString(dueDate, specificDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(dueDateStr)
  due.setHours(0, 0, 0, 0)

  return due < today
}

/**
 * Calculate days overdue (negative means not overdue)
 */
export function calculateDaysOverdue(dueDate: TaskDueDate, specificDate?: string | null): number {
  const dueDateStr = getDueDateAsString(dueDate, specificDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(dueDateStr)
  due.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - due.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays > 0 ? diffDays : 0
}

/**
 * Format due date for display
 */
export function formatTaskDate(dueDate: TaskDueDate, specificDate?: string | null): string {
  if (dueDate === 'custom' && specificDate) {
    const date = new Date(specificDate)
    return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return DUE_DATE_CONFIG[dueDate].label
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
  const today = new Date()
  return today.toISOString().split('T')[0]
}

/**
 * Check if task was completed today
 */
function wasCompletedToday(completedAt?: string | null): boolean {
  if (!completedAt) return false
  const completedDate = completedAt.split('T')[0]
  return completedDate === getTodayDateString()
}

/**
 * Sort tasks: Overdue first, then by priority
 */
function sortTasks(tasks: DailyTask[]): DailyTask[] {
  return tasks.sort((a, b) => {
    const aOverdue = isOverdue(a.due_date, a.specific_date) ? 1 : 0
    const bOverdue = isOverdue(b.due_date, b.specific_date) ? 1 : 0

    if (aOverdue !== bOverdue) {
      return bOverdue - aOverdue // Overdue tasks first
    }

    // Then sort by priority (critical > important > nice-to-do)
    const priorityOrder = { critical: 0, important: 1, 'nice-to-do': 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

// ----------------------------------------------------------------------------
// Phase 61-03: PostgREST nested-select used for the owner join.
//
// `public.users` carries first_name / last_name / email keyed by id. RLS on
// `users` already allows authenticated reads of name/email for accessible
// teammates, so PostgREST will inline the row when the FK is followed.
// ----------------------------------------------------------------------------
const TASK_OWNER_SELECT = '*, owner:users!user_id(first_name, last_name, email)'

interface OwnerJoinRow {
  first_name: string | null
  last_name: string | null
  email: string | null
}

/**
 * Resolve a display name for the row owner.
 * Order: "First Last" → "First" → "Last" → email → 'Team member'
 */
function resolveOwnerDisplayName(owner: OwnerJoinRow | null | undefined): string {
  if (owner) {
    const first = owner.first_name?.trim()
    const last = owner.last_name?.trim()
    if (first && last) return `${first} ${last}`
    if (first) return first
    if (last) return last
    if (owner.email && owner.email.trim()) return owner.email
  }
  return 'Team member'
}

/**
 * Strip the join shape and add the derived fields. Returns a clean DailyTask
 * with `is_owner` + `owner_display_name`.
 */
function decorateTask(
  row: Record<string, unknown> & { owner?: OwnerJoinRow | OwnerJoinRow[] | null },
  viewerId: string | null
): DailyTask {
  // PostgREST may return the joined row as object or single-element array
  const ownerRow = Array.isArray(row.owner) ? row.owner[0] ?? null : row.owner ?? null
  // Remove the join key from the surface object so callers don't see it
  const { owner: _owner, ...rest } = row
  void _owner
  const userId = (rest as { user_id?: string }).user_id
  return {
    ...(rest as unknown as DailyTask),
    is_owner: viewerId != null && userId === viewerId,
    owner_display_name: resolveOwnerDisplayName(ownerRow),
  }
}

// ============================================================================
// SUPABASE SERVICE CLASS
// ============================================================================

class DailyTasksService {
  private supabase = createClient()

  /**
   * Get current user ID
   */
  private async getUserId(): Promise<string | null> {
    const { data: { user } } = await this.supabase.auth.getUser()
    return user?.id || null
  }

  /**
   * Get user's business ID (optional - for multi-business support)
   */
  private async getBusinessId(): Promise<string | null> {
    const userId = await this.getUserId()
    if (!userId) return null

    const { data } = await this.supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .single()

    return data?.id || null
  }

  /**
   * Auto-archive completed tasks from previous days
   */
  async archiveOldCompletedTasks(): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const todayStart = getTodayDateString() + 'T00:00:00.000Z'

    // Archive tasks that are done and completed before today
    // Owner-only: defensive `.eq('user_id', userId)` retained.
    await this.supabase
      .from('daily_tasks')
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'done')
      .is('archived_at', null)
      .lt('completed_at', todayStart)
  }

  /**
   * Get tasks for today (not completed, not archived) - sorted with overdue at top.
   * Phase 61-03: visibility now widened by RLS. Returns owner + shared rows.
   */
  async getTodaysTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    // Run auto-archive first (owner-only; safe to skip when called by recipients
    // because their user_id won't match owned rows).
    await this.archiveOldCompletedTasks()

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select(TASK_OWNER_SELECT)
      .neq('status', 'done')
      .is('archived_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[DailyTasks] Error loading tasks:', error)
      return []
    }

    const decorated = (data || []).map((row) => decorateTask(row as any, userId))
    return sortTasks(decorated)
  }

  /**
   * Get completed tasks from TODAY (not archived)
   */
  async getTodaysCompletedTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select(TASK_OWNER_SELECT)
      .eq('status', 'done')
      .is('archived_at', null)
      .order('completed_at', { ascending: false })

    if (error) {
      console.error('[DailyTasks] Error loading completed tasks:', error)
      return []
    }

    // Filter to only tasks completed today
    return (data || [])
      .map((row) => decorateTask(row as any, userId))
      .filter(task => wasCompletedToday(task.completed_at))
  }

  /**
   * Get archived completed tasks (history)
   */
  async getArchivedTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select(TASK_OWNER_SELECT)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })

    if (error) {
      console.error('[DailyTasks] Error loading archived tasks:', error)
      return []
    }

    return (data || []).map((row) => decorateTask(row as any, userId))
  }

  /**
   * Get ALL tasks (active, completed, and archived)
   */
  async getAllTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select(TASK_OWNER_SELECT)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[DailyTasks] Error loading all tasks:', error)
      return []
    }

    return (data || []).map((row) => decorateTask(row as any, userId))
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateDailyTaskInput): Promise<DailyTask | null> {
    const userId = await this.getUserId()
    if (!userId) {
      console.error('[DailyTasks] No user ID - cannot create task')
      return null
    }

    const businessId = await this.getBusinessId()

    const newTask = {
      user_id: userId,
      business_id: businessId,
      title: input.title,
      priority: input.priority,
      status: 'to-do' as TaskStatus,
      due_date: input.due_date,
      specific_date: input.specific_date || null,
      open_loop_id: input.open_loop_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .insert(newTask)
      .select()
      .single()

    if (error) {
      console.error('[DailyTasks] Error creating task:', error)
      return null
    }

    return data
  }

  /**
   * Update task status (to-do → in-progress → done).
   * Owner-only path. Recipients should call `markTaskComplete` (RPC) instead.
   */
  async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (newStatus === 'done') {
      updates.completed_at = new Date().toISOString()
    } else if (newStatus === 'to-do') {
      // If uncompleting, remove completion time and archive flag
      updates.completed_at = null
      updates.archived_at = null
    }

    const { error } = await this.supabase
      .from('daily_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('user_id', userId)

    if (error) {
      console.error('[DailyTasks] Error updating task status:', error)
    }
  }

  /**
   * Update task priority (owner-only)
   */
  async updateTaskPriority(taskId: string, newPriority: TaskPriority): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const { error } = await this.supabase
      .from('daily_tasks')
      .update({
        priority: newPriority,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('user_id', userId)

    if (error) {
      console.error('[DailyTasks] Error updating task priority:', error)
    }
  }

  /**
   * Update task due date (owner-only)
   */
  async updateTaskDueDate(
    taskId: string,
    newDueDate: TaskDueDate,
    specificDate?: string | null
  ): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const { error } = await this.supabase
      .from('daily_tasks')
      .update({
        due_date: newDueDate,
        specific_date: specificDate || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('user_id', userId)

    if (error) {
      console.error('[DailyTasks] Error updating task due date:', error)
    }
  }

  /**
   * Delete a task permanently (owner-only)
   */
  async deleteTask(taskId: string): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const { error } = await this.supabase
      .from('daily_tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId)

    if (error) {
      console.error('[DailyTasks] Error deleting task:', error)
    }
  }

  /**
   * Permanently delete archived tasks (cleanup; owner-only)
   */
  async deleteArchivedTasks(): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return

    const { error } = await this.supabase
      .from('daily_tasks')
      .delete()
      .eq('user_id', userId)
      .not('archived_at', 'is', null)

    if (error) {
      console.error('[DailyTasks] Error deleting archived tasks:', error)
    }
  }

  /**
   * Phase 61-03 — Share a task. Owner-only; defensive `.eq('user_id', userId)`
   * complements the RLS owner-only UPDATE policy.
   *
   * mode='private'  → shared_with_all=false, shared_with=[]
   * mode='team'     → shared_with_all=true,  shared_with=[]
   * mode='specific' → shared_with_all=false, shared_with=userIds (must be non-empty)
   */
  async shareTask(
    taskId: string,
    mode: ShareMode,
    userIds?: string[]
  ): Promise<DailyTask | null> {
    const userId = await this.getUserId()
    if (!userId) return null

    if (mode === 'specific' && (!userIds || userIds.length === 0)) {
      // "specific" share mode requires at least one user_id; treat empty as a
      // validation failure. (No new console.error per phase 61-03 constraint.)
      return null
    }

    let patch: { shared_with_all: boolean; shared_with: string[] }
    if (mode === 'private') {
      patch = { shared_with_all: false, shared_with: [] }
    } else if (mode === 'team') {
      patch = { shared_with_all: true, shared_with: [] }
    } else {
      patch = { shared_with_all: false, shared_with: userIds as string[] }
    }

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select(TASK_OWNER_SELECT)
      .single()

    if (error || !data) {
      // Silent failure — RLS denial, validation failure, or row-not-found all
      // collapse to null. Caller decides UX response. (No new console.error
      // per phase 61-03 constraint.)
      return null
    }

    // The caller IS the owner here (defensive filter just succeeded), so
    // is_owner is necessarily true.
    return decorateTask(data as any, userId)
  }

  /**
   * Phase 61-03 — Recipient-safe completion flip. Routes through the
   * SECURITY DEFINER RPC from 61-02 so visibility (owner OR shared) is the
   * only gate; the RPC narrows the actual UPDATE to status/completed_at.
   */
  async markTaskComplete(taskId: string, completed: boolean): Promise<DailyTask | null> {
    const userId = await this.getUserId()
    const { data, error } = await this.supabase.rpc('mark_task_complete', {
      p_task_id: taskId,
      p_completed: completed,
    })

    if (error || !data) {
      // Silent failure (RPC access denied, task not found, RLS rejection).
      // (No new console.error per phase 61-03 constraint.)
      return null
    }

    // RPC returns the row as-is (no joined owner). Decorate with is_owner only;
    // owner_display_name resolves to 'Team member' here — callers that need
    // the resolved name should refetch via a list endpoint.
    return decorateTask(data as any, userId)
  }

  /**
   * Get tasks by priority
   */
  async getTasksByPriority(priority: TaskPriority): Promise<DailyTask[]> {
    const tasks = await this.getTodaysTasks()
    return tasks.filter(t => t.priority === priority)
  }

  /**
   * Calculate stats including overdue
   */
  async calculateStats(): Promise<DailyTaskStats> {
    const todaysTasks = await this.getTodaysTasks()
    const completedTasks = await this.getTodaysCompletedTasks()
    const completed = completedTasks.length
    const overdue = todaysTasks.filter(t => isOverdue(t.due_date, t.specific_date)).length

    return {
      total: todaysTasks.length + completed,
      critical: todaysTasks.filter(t => t.priority === 'critical').length,
      important: todaysTasks.filter(t => t.priority === 'important').length,
      niceTooDo: todaysTasks.filter(t => t.priority === 'nice-to-do').length,
      completed,
      completionRate:
        todaysTasks.length + completed > 0
          ? Math.round((completed / (todaysTasks.length + completed)) * 100)
          : 0,
      overdue
    }
  }
}

// Export singleton instance
export const dailyTasksService = new DailyTasksService()

// ============================================================================
// BACKWARDS COMPATIBILITY - Export functions that wrap the service
// These allow existing code to work without major refactoring
// ============================================================================

export async function getTodaysTasks(): Promise<DailyTask[]> {
  return dailyTasksService.getTodaysTasks()
}

export async function getTodaysCompletedTasks(): Promise<DailyTask[]> {
  return dailyTasksService.getTodaysCompletedTasks()
}

export async function getArchivedTasks(): Promise<DailyTask[]> {
  return dailyTasksService.getArchivedTasks()
}

export async function getAllTasks(): Promise<DailyTask[]> {
  return dailyTasksService.getAllTasks()
}

export async function createTask(input: CreateDailyTaskInput): Promise<DailyTask | null> {
  return dailyTasksService.createTask(input)
}

export async function updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<void> {
  return dailyTasksService.updateTaskStatus(taskId, newStatus)
}

export async function updateTaskPriority(taskId: string, newPriority: TaskPriority): Promise<void> {
  return dailyTasksService.updateTaskPriority(taskId, newPriority)
}

export async function updateTaskDueDate(
  taskId: string,
  newDueDate: TaskDueDate,
  specificDate?: string | null
): Promise<void> {
  return dailyTasksService.updateTaskDueDate(taskId, newDueDate, specificDate)
}

export async function deleteTask(taskId: string): Promise<void> {
  return dailyTasksService.deleteTask(taskId)
}

export async function deleteArchivedTasks(): Promise<void> {
  return dailyTasksService.deleteArchivedTasks()
}

export async function getTasksByPriority(priority: TaskPriority): Promise<DailyTask[]> {
  return dailyTasksService.getTasksByPriority(priority)
}

export async function calculateStats(): Promise<DailyTaskStats> {
  return dailyTasksService.calculateStats()
}

// Phase 61-03 — new exports
export async function shareTask(
  taskId: string,
  mode: ShareMode,
  userIds?: string[]
): Promise<DailyTask | null> {
  return dailyTasksService.shareTask(taskId, mode, userIds)
}

export async function markTaskComplete(taskId: string, completed: boolean): Promise<DailyTask | null> {
  return dailyTasksService.markTaskComplete(taskId, completed)
}
