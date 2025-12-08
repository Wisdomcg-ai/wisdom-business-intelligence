// /lib/services/dailyTasksService.ts
// DAILY TASKS SERVICE - Supabase Integration
// Handles: Overdue detection, specific dates, days overdue tracking, and auto-archive

'use client'

import { createClient } from '@/lib/supabase/client'

// ============================================================================
// TYPE DEFINITIONS - What a task looks like
// ============================================================================

export type TaskPriority = 'critical' | 'important' | 'nice-to-do'
export type TaskStatus = 'to-do' | 'in-progress' | 'done'
export type TaskDueDate = 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'custom'

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
   * Get tasks for today (not completed, not archived) - sorted with overdue at top
   */
  async getTodaysTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    // Run auto-archive first
    await this.archiveOldCompletedTasks()

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'done')
      .is('archived_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[DailyTasks] Error loading tasks:', error)
      return []
    }

    return sortTasks(data || [])
  }

  /**
   * Get completed tasks from TODAY (not archived)
   */
  async getTodaysCompletedTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'done')
      .is('archived_at', null)
      .order('completed_at', { ascending: false })

    if (error) {
      console.error('[DailyTasks] Error loading completed tasks:', error)
      return []
    }

    // Filter to only tasks completed today
    return (data || []).filter(task => wasCompletedToday(task.completed_at))
  }

  /**
   * Get archived completed tasks (history)
   */
  async getArchivedTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })

    if (error) {
      console.error('[DailyTasks] Error loading archived tasks:', error)
      return []
    }

    return data || []
  }

  /**
   * Get ALL tasks (active, completed, and archived)
   */
  async getAllTasks(): Promise<DailyTask[]> {
    const userId = await this.getUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[DailyTasks] Error loading all tasks:', error)
      return []
    }

    return data || []
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
   * Update task status (to-do → in-progress → done)
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
   * Update task priority
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
   * Update task due date
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
   * Delete a task permanently
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
   * Permanently delete archived tasks (cleanup)
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

// Remove loadSampleTasks - no longer needed with Supabase
