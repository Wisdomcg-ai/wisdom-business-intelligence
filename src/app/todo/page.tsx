// /app/todo/page.tsx
// TO-DO LIST PAGE - With inline due date dropdown selector

'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Check, Trash2, ChevronDown, Calendar, AlertCircle, RotateCcw, CheckSquare } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import {
  getTodaysTasks,
  getTodaysCompletedTasks,
  createTask,
  updateTaskStatus,
  updateTaskPriority,
  updateTaskDueDate,
  deleteTask,
  calculateStats,
  loadSampleTasks,
  isOverdue,
  calculateDaysOverdue,
  formatTaskDate,
  PRIORITY_CONFIG,
  DUE_DATE_CONFIG,
  type TaskPriority,
  type TaskStatus,
  type TaskDueDate
} from '@/lib/services/dailyTasksService'

export default function TodoPage() {
  // ========================================================================
  // STATE - Keep track of tasks, form visibility, loading state
  // ========================================================================

  const [activeTasks, setActiveTasks] = useState<ReturnType<typeof getTodaysTasks>>([])
  const [completedTasks, setCompletedTasks] = useState<ReturnType<typeof getTodaysCompletedTasks>>([])
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    important: 0,
    niceTooDo: 0,
    completed: 0,
    completionRate: 0,
    overdue: 0
  })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [openDueDateDropdown, setOpenDueDateDropdown] = useState<string | null>(null)
  const [customDateInput, setCustomDateInput] = useState<{ [key: string]: string }>({})

  // Form state - what user is typing in the add form
  const [formData, setFormData] = useState({
    title: '',
    priority: 'important' as TaskPriority,
    due_date: 'today' as TaskDueDate,
    specific_date: ''
  })

  // ========================================================================
  // LOAD DATA - Get tasks from storage when page loads
  // ========================================================================

  useEffect(() => {
    loadData()
  }, [])

  function loadData() {
    setLoading(true)
    try {
      const active = getTodaysTasks()
      const completed = getTodaysCompletedTasks()
      const newStats = calculateStats()

      setActiveTasks(active)
      setCompletedTasks(completed)
      setStats(newStats)
    } catch (error) {
      console.error('Error loading tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  // ========================================================================
  // FORM HANDLERS - Handle user actions
  // ========================================================================

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.title.trim()) {
      alert('Please enter a task')
      return
    }

    try {
      const dueDate = formData.due_date === 'custom' ? 'custom' : formData.due_date
      const specificDate = formData.due_date === 'custom' ? formData.specific_date : null

      createTask({
        title: formData.title.trim(),
        priority: formData.priority,
        due_date: dueDate,
        specific_date: specificDate
      })

      // Reset form
      setFormData({
        title: '',
        priority: 'important',
        due_date: 'today',
        specific_date: ''
      })

      setShowForm(false)
      setShowDatePicker(false)
      loadData()
    } catch (error) {
      console.error('Error adding task:', error)
      alert('Failed to add task')
    }
  }

  function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    try {
      updateTaskStatus(taskId, newStatus)
      loadData()
    } catch (error) {
      console.error('Error updating task:', error)
      alert('Failed to update task')
    }
  }

  function handlePriorityChange(taskId: string, newPriority: TaskPriority) {
    try {
      updateTaskPriority(taskId, newPriority)
      loadData()
    } catch (error) {
      console.error('Error updating priority:', error)
      alert('Failed to update priority')
    }
  }

  function handleChangeDueDate(taskId: string, newDueDate: TaskDueDate, specificDate?: string) {
    try {
      updateTaskDueDate(taskId, newDueDate, specificDate || null)
      setOpenDueDateDropdown(null)
      loadData()
    } catch (error) {
      console.error('Error updating due date:', error)
      alert('Failed to update due date')
    }
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return

    try {
      deleteTask(taskId)
      loadData()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Failed to delete task')
    }
  }

  function handleLoadSamples() {
    if (confirm('Load sample tasks for testing?')) {
      loadSampleTasks()
      loadData()
    }
  }

  // ========================================================================
  // DUE DATE DROPDOWN COMPONENT
  // ========================================================================

  function DueDateDropdown({ task }: { task: any }) {
    const isOpen = openDueDateDropdown === task.id
    const currentLabel = formatTaskDate(task.due_date, task.specific_date)

    return (
      <div className="relative">
        <button
          onClick={() => setOpenDueDateDropdown(isOpen ? null : task.id)}
          className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors whitespace-nowrap"
          title="Change due date"
        >
          {currentLabel}
          <ChevronDown className="w-3 h-3" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 sm:right-auto mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 sm:min-w-48">
            {/* Quick date options */}
            <button
              onClick={() => handleChangeDueDate(task.id, 'today')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-brand-orange-50 border-b border-gray-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => handleChangeDueDate(task.id, 'tomorrow')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-brand-orange-50 border-b border-gray-200 transition-colors"
            >
              Tomorrow
            </button>
            <button
              onClick={() => handleChangeDueDate(task.id, 'this-week')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-brand-orange-50 border-b border-gray-200 transition-colors"
            >
              This Week
            </button>
            <button
              onClick={() => handleChangeDueDate(task.id, 'next-week')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-brand-orange-50 border-b border-gray-200 transition-colors"
            >
              Next Week
            </button>

            {/* Custom date picker */}
            <div className="px-4 py-3 border-t border-gray-200">
              <label className="block text-xs font-semibold text-gray-600 mb-2">Pick specific date:</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDateInput[task.id] || ''}
                  onChange={(e) => setCustomDateInput({ ...customDateInput, [task.id]: e.target.value })}
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                />
                <button
                  onClick={() => {
                    if (customDateInput[task.id]) {
                      handleChangeDueDate(task.id, 'custom', customDateInput[task.id])
                      setCustomDateInput({ ...customDateInput, [task.id]: '' })
                    }
                  }}
                  className="px-2 py-1 text-xs font-medium bg-brand-orange text-white rounded hover:bg-brand-orange-600 transition-colors"
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ========================================================================
  // TASK ITEM COMPONENT - Individual task display with overdue indicator
  // ========================================================================

  function TaskItem({ task, isCompleted = false }: { task: any; isCompleted?: boolean }) {
    const priorityConfig = PRIORITY_CONFIG[task.priority as TaskPriority]
    const taskIsOverdue = isOverdue(task.due_date, task.specific_date)
    const daysOverdue = calculateDaysOverdue(task.due_date, task.specific_date)

    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-4 border rounded-xl transition-all ${
          isCompleted
            ? 'bg-gray-50 border-gray-200 opacity-60'
            : taskIsOverdue
            ? 'bg-red-50 border-red-300 border-2'
            : priorityConfig.color + ' border'
        }`}
      >
        {/* Task title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            <h3
              className={`font-medium leading-tight text-sm sm:text-base ${
                isCompleted ? 'line-through text-gray-500' : 'text-gray-900'
              }`}
            >
              {task.title}
            </h3>
            {taskIsOverdue && !isCompleted && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-red-200 rounded text-xs font-bold text-red-700 whitespace-nowrap flex-shrink-0">
                <AlertCircle className="w-3 h-3" />
                {daysOverdue}d overdue
              </div>
            )}
          </div>

          {/* Priority badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {priorityConfig.label}
            </span>
          </div>
        </div>

        {/* Actions - Due date dropdown, complete button, undo button, and delete */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isCompleted && (
            <>
              <DueDateDropdown task={task} />

              <button
                onClick={() => handleStatusChange(task.id, 'done')}
                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                title="Mark as complete"
              >
                <Check className="w-4 h-4" />
              </button>
            </>
          )}

          {isCompleted && (
            <button
              onClick={() => handleStatusChange(task.id, 'to-do')}
              className="p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded transition-colors"
              title="Undo - restore to active tasks"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => handleDeleteTask(task.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER - What the user sees
  // ========================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* PAGE CONTAINER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* PAGE HEADER */}
        <PageHeader
          title="To-Do"
          subtitle="Focus on what matters. Three priorities max."
          icon={CheckSquare}
          actions={
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Task</span>
              <span className="sm:hidden">Add</span>
            </button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="p-4 sm:p-6 rounded-xl border-2 border-gray-200 bg-white">
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Tasks Today</p>
          </div>
          <div className="p-4 sm:p-6 rounded-xl border-2 border-gray-200 bg-white">
            <p className="text-xl sm:text-2xl font-bold text-brand-teal">{stats.completed}</p>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Completed</p>
          </div>
          <div className="p-4 sm:p-6 rounded-xl border-2 border-gray-200 bg-white">
            <p className="text-xl sm:text-2xl font-bold text-brand-orange">{stats.completionRate}%</p>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Progress</p>
          </div>
          {stats.overdue > 0 && (
            <div className="p-4 sm:p-6 rounded-xl border-2 border-red-200 bg-red-50">
              <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.overdue}</p>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Overdue</p>
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading tasks...</p>
            </div>
          ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
            // EMPTY STATE
            <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-8 sm:p-12 text-center">
              <p className="text-gray-600 mb-4">No tasks yet. You're free!</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add your first task
              </button>
            </div>
          ) : (
            // TASK SECTIONS
            <div className="space-y-6">
              {/* OVERDUE SECTION - AT TOP IF ANY EXIST */}
              {activeTasks.filter(t => isOverdue(t.due_date, t.specific_date)).length > 0 && (
                <div>
                  <div className="mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      OVERDUE (Deal with these first!)
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600">
                      {activeTasks.filter(t => isOverdue(t.due_date, t.specific_date)).length} task
                      {activeTasks.filter(t => isOverdue(t.due_date, t.specific_date)).length !== 1
                        ? 's'
                        : ''}{' '}
                      past due
                    </p>
                  </div>

                  <div className="space-y-2">
                    {activeTasks
                      .filter(t => isOverdue(t.due_date, t.specific_date))
                      .map(task => (
                        <TaskItem key={task.id} task={task} />
                      ))}
                  </div>
                </div>
              )}

              {/* CRITICAL SECTION */}
              {activeTasks.filter(
                t => t.priority === 'critical' && !isOverdue(t.due_date, t.specific_date)
              ).length > 0 && (
                <div>
                  <div className="mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-red-700">CRITICAL (Do First)</h2>
                    <p className="text-xs sm:text-sm text-gray-600">These block other work</p>
                  </div>

                  <div className="space-y-2">
                    {activeTasks
                      .filter(
                        t => t.priority === 'critical' && !isOverdue(t.due_date, t.specific_date)
                      )
                      .map(task => (
                        <TaskItem key={task.id} task={task} />
                      ))}
                  </div>
                </div>
              )}

              {/* IMPORTANT SECTION */}
              {activeTasks.filter(
                t => t.priority === 'important' && !isOverdue(t.due_date, t.specific_date)
              ).length > 0 && (
                <div>
                  <div className="mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-amber-700">IMPORTANT (Next)</h2>
                    <p className="text-xs sm:text-sm text-gray-600">Moves business forward</p>
                  </div>

                  <div className="space-y-2">
                    {activeTasks
                      .filter(
                        t => t.priority === 'important' && !isOverdue(t.due_date, t.specific_date)
                      )
                      .map(task => (
                        <TaskItem key={task.id} task={task} />
                      ))}
                  </div>
                </div>
              )}

              {/* NICE-TO-DO SECTION */}
              {activeTasks.filter(
                t => t.priority === 'nice-to-do' && !isOverdue(t.due_date, t.specific_date)
              ).length > 0 && (
                <div>
                  <div className="mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-green-700">NICE-TO-DO (If Time)</h2>
                    <p className="text-xs sm:text-sm text-gray-600">Low priority, high value</p>
                  </div>

                  <div className="space-y-2">
                    {activeTasks
                      .filter(
                        t => t.priority === 'nice-to-do' && !isOverdue(t.due_date, t.specific_date)
                      )
                      .map(task => (
                        <TaskItem key={task.id} task={task} />
                      ))}
                  </div>
                </div>
              )}

              {/* COMPLETED SECTION */}
              {completedTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                    className="flex items-center gap-2 text-base sm:text-lg font-bold text-green-700 hover:text-green-800 py-2"
                  >
                    <ChevronDown
                      className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${
                        showCompletedTasks ? 'rotate-180' : ''
                      }`}
                    />
                    Completed Today ({completedTasks.length})
                  </button>

                  {showCompletedTasks && (
                    <div className="space-y-2 mt-3">
                      {completedTasks.map(task => (
                        <TaskItem key={task.id} task={task} isCompleted={true} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD TASK MODAL - Popup form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="rounded-xl shadow-sm border border-gray-200 bg-white max-w-md w-full p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Add Task</h2>

            <form onSubmit={handleAddTask} className="space-y-4">
              {/* TITLE INPUT */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What needs to be done?
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Call CRM vendor"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm sm:text-base"
                />
              </div>

              {/* PRIORITY BUTTONS */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {['critical', 'important', 'nice-to-do'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormData({ ...formData, priority: p as TaskPriority })}
                      className={`px-3 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                        formData.priority === p
                          ? 'border-brand-orange-500 bg-brand-orange-50'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      {p === 'critical' ? 'Critical' : p === 'important' ? 'Important' : 'Nice-to-do'}
                    </button>
                  ))}
                </div>
              </div>

              {/* DUE DATE BUTTONS */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                <div className="grid grid-cols-2 gap-2">
                  {['today', 'tomorrow', 'this-week', 'next-week'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          due_date: d as TaskDueDate,
                          specific_date: ''
                        })
                      }
                      className={`px-3 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                        formData.due_date === d && !showDatePicker
                          ? 'border-brand-orange-500 bg-brand-orange-50'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      {d === 'today'
                        ? 'Today'
                        : d === 'tomorrow'
                        ? 'Tomorrow'
                        : d === 'this-week'
                        ? 'This Week'
                        : 'Next Week'}
                    </button>
                  ))}
                </div>

                {/* Custom Date Picker */}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className={`w-full mt-2 px-3 py-2 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    formData.due_date === 'custom'
                      ? 'border-brand-orange-500 bg-brand-orange-50'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Pick Specific Date
                </button>

                {showDatePicker && (
                  <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Select a date:
                    </label>
                    <input
                      type="date"
                      value={formData.specific_date}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          due_date: 'custom',
                          specific_date: e.target.value
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}
              </div>

              {/* BUTTONS */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 sm:pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setShowDatePicker(false)
                  }}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}