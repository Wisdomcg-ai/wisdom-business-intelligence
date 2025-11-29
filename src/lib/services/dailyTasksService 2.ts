// /lib/services/dailyTasksService.ts
// SIMPLIFIED DAILY TASKS SERVICE - Brain of the system
// NOW WITH: Overdue detection, specific dates, days overdue tracking, and auto-archive

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
  title: string
  priority: TaskPriority
  status: TaskStatus
  due_date: TaskDueDate
  specific_date?: string | null // For custom dates (YYYY-MM-DD format)
  open_loop_id?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null // New: when task was archived
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
// UTILITY FUNCTIONS - Helper functions
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
 * Auto-archive completed tasks from previous days
 */
function archiveOldCompletedTasks(): void {
  if (typeof window === 'undefined') return

  try {
    const stored = localStorage.getItem('dailyTasks')
    if (!stored) return

    const tasks = JSON.parse(stored) as DailyTask[]
    let updated = false

    const updatedTasks = tasks.map(task => {
      // If task is done and was NOT completed today, archive it
      if (task.status === 'done' && task.completed_at && !wasCompletedToday(task.completed_at)) {
        if (!task.archived_at) {
          task.archived_at = new Date().toISOString()
          updated = true
        }
      }
      return task
    })

    if (updated) {
      localStorage.setItem('dailyTasks', JSON.stringify(updatedTasks))
    }
  } catch (error) {
    console.error('Error archiving old tasks:', error)
  }
}

// ============================================================================
// MAIN FUNCTIONS - Create, read, update, delete tasks
// ============================================================================

/**
 * Get tasks for today (not completed, not archived) - sorted with overdue at top
 */
export function getTodaysTasks(): DailyTask[] {
  if (typeof window === 'undefined') return []

  try {
    archiveOldCompletedTasks() // Run auto-archive first

    const stored = localStorage.getItem('dailyTasks')
    if (!stored) return []

    const tasks = JSON.parse(stored) as DailyTask[]
    const activeTasks = tasks.filter(task => task.status !== 'done' && !task.archived_at)

    // Sort: Overdue first, then by priority
    return activeTasks.sort((a, b) => {
      const aOverdue = isOverdue(a.due_date, a.specific_date) ? 1 : 0
      const bOverdue = isOverdue(b.due_date, b.specific_date) ? 1 : 0

      if (aOverdue !== bOverdue) {
        return bOverdue - aOverdue // Overdue tasks first
      }

      // Then sort by priority (critical > important > nice-to-do)
      const priorityOrder = { critical: 0, important: 1, 'nice-to-do': 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  } catch (error) {
    console.error('Error loading today tasks:', error)
    return []
  }
}

/**
 * Get completed tasks from TODAY (not archived)
 */
export function getTodaysCompletedTasks(): DailyTask[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem('dailyTasks')
    if (!stored) return []

    const tasks = JSON.parse(stored) as DailyTask[]
    return tasks.filter(task => task.status === 'done' && !task.archived_at && wasCompletedToday(task.completed_at))
  } catch (error) {
    console.error('Error loading completed tasks:', error)
    return []
  }
}

/**
 * Get archived completed tasks (history)
 */
export function getArchivedTasks(): DailyTask[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem('dailyTasks')
    if (!stored) return []

    const tasks = JSON.parse(stored) as DailyTask[]
    return tasks.filter(task => task.archived_at).sort((a, b) => {
      const aDate = new Date(a.archived_at || '').getTime()
      const bDate = new Date(b.archived_at || '').getTime()
      return bDate - aDate // Newest first
    })
  } catch (error) {
    console.error('Error loading archived tasks:', error)
    return []
  }
}

/**
 * Get ALL tasks (active, completed, and archived)
 */
export function getAllTasks(): DailyTask[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem('dailyTasks')
    if (!stored) return []

    return JSON.parse(stored) as DailyTask[]
  } catch (error) {
    console.error('Error loading all tasks:', error)
    return []
  }
}

/**
 * Create a new task
 */
export function createTask(input: CreateDailyTaskInput): DailyTask {
  const newTask: DailyTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_id: 'local-user',
    title: input.title,
    priority: input.priority,
    status: 'to-do',
    due_date: input.due_date,
    specific_date: input.specific_date || null,
    open_loop_id: input.open_loop_id || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null
  }

  try {
    const allTasks = getAllTasks()
    allTasks.push(newTask)
    localStorage.setItem('dailyTasks', JSON.stringify(allTasks))
  } catch (error) {
    console.error('Error creating task:', error)
  }

  return newTask
}

/**
 * Update task status (to-do → in-progress → done)
 */
export function updateTaskStatus(taskId: string, newStatus: TaskStatus): void {
  try {
    const allTasks = getAllTasks()
    const task = allTasks.find(t => t.id === taskId)

    if (task) {
      task.status = newStatus
      if (newStatus === 'done') {
        task.completed_at = new Date().toISOString()
      } else if (newStatus === 'to-do') {
        // If uncompleting, remove completion time and archive flag
        task.completed_at = null
        task.archived_at = null
      }
      task.updated_at = new Date().toISOString()
      localStorage.setItem('dailyTasks', JSON.stringify(allTasks))
    }
  } catch (error) {
    console.error('Error updating task status:', error)
  }
}

/**
 * Update task priority
 */
export function updateTaskPriority(taskId: string, newPriority: TaskPriority): void {
  try {
    const allTasks = getAllTasks()
    const task = allTasks.find(t => t.id === taskId)

    if (task) {
      task.priority = newPriority
      task.updated_at = new Date().toISOString()
      localStorage.setItem('dailyTasks', JSON.stringify(allTasks))
    }
  } catch (error) {
    console.error('Error updating task priority:', error)
  }
}

/**
 * Update task due date
 */
export function updateTaskDueDate(
  taskId: string,
  newDueDate: TaskDueDate,
  specificDate?: string | null
): void {
  try {
    const allTasks = getAllTasks()
    const task = allTasks.find(t => t.id === taskId)

    if (task) {
      task.due_date = newDueDate
      task.specific_date = specificDate || null
      task.updated_at = new Date().toISOString()
      localStorage.setItem('dailyTasks', JSON.stringify(allTasks))
    }
  } catch (error) {
    console.error('Error updating task due date:', error)
  }
}

/**
 * Delete a task permanently
 */
export function deleteTask(taskId: string): void {
  try {
    const allTasks = getAllTasks()
    const filtered = allTasks.filter(t => t.id !== taskId)
    localStorage.setItem('dailyTasks', JSON.stringify(filtered))
  } catch (error) {
    console.error('Error deleting task:', error)
  }
}

/**
 * Permanently delete archived tasks (cleanup)
 */
export function deleteArchivedTasks(): void {
  try {
    const allTasks = getAllTasks()
    const filtered = allTasks.filter(t => !t.archived_at)
    localStorage.setItem('dailyTasks', JSON.stringify(filtered))
  } catch (error) {
    console.error('Error deleting archived tasks:', error)
  }
}

/**
 * Get tasks by priority
 */
export function getTasksByPriority(priority: TaskPriority): DailyTask[] {
  return getTodaysTasks().filter(t => t.priority === priority)
}

/**
 * Calculate stats including overdue
 */
export function calculateStats(): DailyTaskStats {
  const todaysTasks = getTodaysTasks()
  const completed = getTodaysCompletedTasks().length
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

/**
 * Load sample tasks for testing
 */
export function loadSampleTasks(): void {
  if (typeof window === 'undefined') return

  const sampleTasks: DailyTask[] = [
    {
      id: 'task_sample_1',
      user_id: 'local-user',
      title: 'Call CRM vendor for pricing quote',
      priority: 'critical',
      status: 'to-do',
      due_date: 'today',
      specific_date: null,
      open_loop_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    },
    {
      id: 'task_sample_2',
      user_id: 'local-user',
      title: 'Fix checkout page CSS bug',
      priority: 'critical',
      status: 'to-do',
      due_date: 'today',
      specific_date: null,
      open_loop_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    },
    {
      id: 'task_sample_3',
      user_id: 'local-user',
      title: 'Review Q4 financial forecast',
      priority: 'important',
      status: 'to-do',
      due_date: 'today',
      specific_date: null,
      open_loop_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    },
    {
      id: 'task_sample_4',
      user_id: 'local-user',
      title: 'Schedule team standup',
      priority: 'important',
      status: 'to-do',
      due_date: 'tomorrow',
      specific_date: null,
      open_loop_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    },
    {
      id: 'task_sample_5',
      user_id: 'local-user',
      title: 'Update client status document',
      priority: 'nice-to-do',
      status: 'to-do',
      due_date: 'this-week',
      specific_date: null,
      open_loop_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    }
  ]

  localStorage.setItem('dailyTasks', JSON.stringify(sampleTasks))
}