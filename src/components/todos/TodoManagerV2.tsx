'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type TodoPriority = 'critical' | 'high' | 'medium' | 'low'
type TodoStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled'  // Note: 'in-progress' uses hyphen, not underscore!
type TodoCategory = 'Operations' | 'Sales' | 'Marketing' | 'Finance' | 'Team' | 'Strategy' | 'Personal' | 'Admin' | 'Other'
type TodoView = 'today' | 'open_loops' | 'this_week' | 'backlog' | 'all' | 'completed'

interface Todo {
  id: string
  business_id: string
  created_by: string
  assigned_to: string | null
  title: string
  description: string | null
  priority: TodoPriority
  status: TodoStatus
  category: TodoCategory
  due_date: string | null
  completed_at: string | null
  effort_estimate: number | null
  notes: string | null
  is_must: boolean  // Today's MUST DO
  is_top_three: boolean  // Important flag
  is_recurring: boolean
  recurrence_pattern: any | null
  parent_task_id: string | null
  order_index: number
  tags: string[]
  created_at: string
  updated_at: string
}

interface TodoStats {
  total_tasks: number
  completed_today: number
  todays_musts: number
  important_tasks: number
  open_loops: number
  backlog_count: number
  due_today: number
  due_this_week: number
  overdue: number
  completion_rate: number
}

interface TodoManagerV2Props {
  userId: string
  businessId: string
  userRole: 'coach' | 'client' | 'team_member'
}

interface MorningRitualData {
  gratitude: string
  intention: string
  must_tasks: string[]
  visualization: string
  commitment: boolean
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getQuickDate = (option: string): string | null => {
  const today = new Date()
  
  switch (option) {
    case 'today':
      return today.toISOString().split('T')[0]
    
    case 'tomorrow':
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow.toISOString().split('T')[0]
    
    case 'this_week':
      const endOfWeek = new Date(today)
      const daysUntilFriday = 5 - today.getDay()
      endOfWeek.setDate(today.getDate() + (daysUntilFriday > 0 ? daysUntilFriday : 7 + daysUntilFriday))
      return endOfWeek.toISOString().split('T')[0]
    
    case 'next_week':
      const nextWeek = new Date(today)
      nextWeek.setDate(today.getDate() + 7)
      return nextWeek.toISOString().split('T')[0]
    
    default:
      return null
  }
}

const parseNaturalLanguage = (input: string) => {
  let text = input.trim()
  let priority: TodoPriority = 'medium'
  let due_date: string | null = null
  
  // Check for high priority markers
  if (text.includes('!!') || text.includes('urgent') || text.includes('asap') || text.includes('critical')) {
    priority = 'high'
    text = text.replace(/!!/g, '').replace(/urgent/gi, '').replace(/asap/gi, '').replace(/critical/gi, '').trim()
  } else if (text.includes('!') || text.includes('important')) {
    priority = 'high'
    text = text.replace(/!/g, '').replace(/important/gi, '').trim()
  }
  
  // Parse dates from natural language
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  if (text.toLowerCase().includes('today')) {
    due_date = today.toISOString().split('T')[0]
    text = text.replace(/today/gi, '').trim()
  } else if (text.toLowerCase().includes('tomorrow')) {
    due_date = tomorrow.toISOString().split('T')[0]
    text = text.replace(/tomorrow/gi, '').trim()
  } else if (text.toLowerCase().includes('this week')) {
    const friday = new Date(today)
    const daysUntilFriday = 5 - today.getDay()
    friday.setDate(today.getDate() + (daysUntilFriday > 0 ? daysUntilFriday : 7 + daysUntilFriday))
    due_date = friday.toISOString().split('T')[0]
    text = text.replace(/this week/gi, '').trim()
  } else if (text.toLowerCase().includes('next week')) {
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + 7)
    due_date = nextWeek.toISOString().split('T')[0]
    text = text.replace(/next week/gi, '').trim()
  }
  
  // Clean up extra spaces
  text = text.replace(/\s+/g, ' ').trim()
  
  return { title: text, priority, due_date }
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'No date'
  const date = new Date(dateString)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  
  // Check if it's this week
  const dayOfWeek = date.getDay()
  const daysUntilEndOfWeek = 5 - today.getDay()
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + daysUntilEndOfWeek)
  
  if (date <= endOfWeek && date > today) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[dayOfWeek]
  }
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  })
}

const isOverdue = (dateString: string | null) => {
  if (!dateString) return false
  const date = new Date(dateString)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return date < today
}

const isDueToday = (dateString: string | null) => {
  if (!dateString) return false
  return new Date(dateString).toDateString() === new Date().toDateString()
}

const isDueThisWeek = (dateString: string | null) => {
  if (!dateString) return false
  const date = new Date(dateString)
  const today = new Date()
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (5 - today.getDay()))
  return date <= endOfWeek
}

// ============================================================================
// MORNING RITUAL COMPONENT
// ============================================================================

function MorningRitual({ 
  onComplete, 
  onSkip,
  todos
}: { 
  onComplete: (data: MorningRitualData) => void
  onSkip: () => void
  todos: Todo[]
}) {
  const [currentStep, setCurrentStep] = useState(1)
  const [ritualData, setRitualData] = useState<MorningRitualData>({
    gratitude: '',
    intention: '',
    must_tasks: [],
    visualization: '',
    commitment: false
  })
  
  const steps = [
    {
      number: 1,
      title: '🙏 Gratitude',
      prompt: 'What are you grateful for today?',
      description: 'Start with appreciation to set a positive tone'
    },
    {
      number: 2,
      title: '🎯 Intention',
      prompt: 'What is your intention for today?',
      description: 'Set your focus and energy direction'
    },
    {
      number: 3,
      title: '⭐ Daily MUSTs',
      prompt: 'Select your 3 most important tasks for today',
      description: 'Choose 1 TRUE MUST + 2 important tasks'
    },
    {
      number: 4,
      title: '🚀 Visualize Success',
      prompt: 'How will you feel when today\'s MUSTs are complete?',
      description: 'See yourself succeeding'
    },
    {
      number: 5,
      title: '✊ Commitment',
      prompt: 'Make your commitment to today',
      description: 'Promise yourself to focus on what matters'
    }
  ]
  
  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete(ritualData)
    }
  }
  
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-brand-navy to-brand-orange p-6 text-white rounded-t-xl">
          <h2 className="text-2xl font-bold mb-2">Morning Ritual</h2>
          <p className="text-brand-orange-100">5 minutes to set up your perfect day</p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="bg-brand-navy-800 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              {steps.map(s => (
                <span key={s.number} className={currentStep >= s.number ? 'text-white' : 'text-brand-orange-300'}>
                  Step {s.number}
                </span>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">{steps[currentStep - 1].title}</h3>
            <p className="text-gray-600 mb-4">{steps[currentStep - 1].description}</p>
            
            {/* Step Content */}
            {currentStep === 1 && (
              <textarea
                value={ritualData.gratitude}
                onChange={(e) => setRitualData({...ritualData, gratitude: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg"
                rows={4}
                placeholder="I'm grateful for..."
                autoFocus
              />
            )}
            
            {currentStep === 2 && (
              <textarea
                value={ritualData.intention}
                onChange={(e) => setRitualData({...ritualData, intention: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg"
                rows={4}
                placeholder="Today I intend to..."
                autoFocus
              />
            )}
            
            {currentStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Select your top tasks from today's list:</p>
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3">
                  {todos.filter(t => isDueToday(t.due_date) || !t.due_date).slice(0, 10).map(todo => (
                    <label key={todo.id} className="flex items-center p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={ritualData.must_tasks.includes(todo.id)}
                        onChange={(e) => {
                          if (e.target.checked && ritualData.must_tasks.length < 3) {
                            setRitualData({
                              ...ritualData,
                              must_tasks: [...ritualData.must_tasks, todo.id]
                            })
                          } else if (!e.target.checked) {
                            setRitualData({
                              ...ritualData,
                              must_tasks: ritualData.must_tasks.filter(id => id !== todo.id)
                            })
                          }
                        }}
                        disabled={!ritualData.must_tasks.includes(todo.id) && ritualData.must_tasks.length >= 3}
                        className="mr-3"
                      />
                      <span className={ritualData.must_tasks.includes(todo.id) ? 'font-medium' : ''}>
                        {todo.title}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-gray-500">
                  Selected: {ritualData.must_tasks.length}/3
                </p>
              </div>
            )}
            
            {currentStep === 4 && (
              <textarea
                value={ritualData.visualization}
                onChange={(e) => setRitualData({...ritualData, visualization: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg"
                rows={4}
                placeholder="When I complete my MUSTs today, I will feel..."
                autoFocus
              />
            )}
            
            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="bg-brand-navy-50 rounded-lg p-4">
                  <p className="font-medium text-brand-navy-900 mb-2">Your Daily Commitment:</p>
                  <p className="text-gray-700 italic">
                    "I commit to focusing on my 3 MUSTs today. I will not let distractions
                    pull me away from what truly matters. Today, I choose progress over perfection."
                  </p>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={ritualData.commitment}
                    onChange={(e) => setRitualData({...ritualData, commitment: e.target.checked})}
                    className="mr-3"
                  />
                  <span className="font-medium">I commit to making today count</span>
                </label>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={onSkip}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Skip for today
            </button>
            
            <div className="flex gap-2">
              {currentStep > 1 && (
                <button
                  onClick={handlePrevious}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700"
                disabled={currentStep === 5 && !ritualData.commitment}
              >
                {currentStep === 5 ? 'Complete Ritual' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TodoManagerV2({ userId, businessId, userRole }: TodoManagerV2Props) {
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
  
  // State
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<TodoStats>({
    total_tasks: 0,
    completed_today: 0,
    todays_musts: 0,
    important_tasks: 0,
    open_loops: 0,
    backlog_count: 0,
    due_today: 0,
    due_this_week: 0,
    overdue: 0,
    completion_rate: 0
  })
  
  // UI State
  const [activeView, setActiveView] = useState<TodoView>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [quickAddText, setQuickAddText] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('today')
  const [selectedPriority, setSelectedPriority] = useState<TodoPriority>('medium')
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showMorningRitual, setShowMorningRitual] = useState(false)
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as TodoPriority,
    category: 'Other' as TodoCategory,
    due_date: '',
    notes: ''
  })
  
  // Check if morning ritual should show
  useEffect(() => {
    const checkMorningRitual = () => {
      const now = new Date()
      const lastShown = localStorage.getItem('lastMorningRitual')
      const today = now.toDateString()
      
      if (lastShown !== today && now.getHours() >= 6 && now.getHours() < 12) {
        setShowMorningRitual(true)
      }
    }
    
    checkMorningRitual()
  }, [])
  
  // Calculate stats
  const calculateStats = useCallback((todoList: Todo[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const completedToday = todoList.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false
      const completedDate = new Date(t.completed_at)
      return completedDate >= today
    }).length
    
    const todays_musts = todoList.filter(t => t.is_must && t.status !== 'completed').length
    const important_tasks = todoList.filter(t => t.is_top_three && t.status !== 'completed').length
    const open_loops = todoList.filter(t => 
      t.status !== 'completed' && 
      !t.is_must && 
      !t.is_top_three &&
      !isDueToday(t.due_date)
    ).length
    const backlog_count = todoList.filter(t => 
      t.status === 'pending' && 
      !isDueThisWeek(t.due_date) &&
      !t.is_must
    ).length
    const due_today = todoList.filter(t => isDueToday(t.due_date) && t.status !== 'completed').length
    const due_this_week = todoList.filter(t => isDueThisWeek(t.due_date) && t.status !== 'completed').length
    const overdue = todoList.filter(t => isOverdue(t.due_date) && t.status !== 'completed').length
    
    const totalActive = todoList.filter(t => t.status !== 'completed').length
    const totalCompleted = todoList.filter(t => t.status === 'completed').length
    const completion_rate = totalActive + totalCompleted > 0 
      ? Math.round((totalCompleted / (totalActive + totalCompleted)) * 100)
      : 0
    
    setStats({
      total_tasks: todoList.length,
      completed_today: completedToday,
      todays_musts: todays_musts,
      important_tasks: important_tasks,
      open_loops: open_loops,
      backlog_count: backlog_count,
      due_today: due_today,
      due_this_week: due_this_week,
      overdue: overdue,
      completion_rate: completion_rate
    })
  }, [])
  
  // Load todos
  const loadTodos = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('todo_items')
        .select('*')
        .eq('business_id', businessId)
        .order('is_must', { ascending: false })
        .order('is_top_three', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error loading todos:', error)
      } else {
        setTodos(data || [])
        calculateStats(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [businessId, supabase, calculateStats])
  
  // Complete morning ritual
  const handleMorningRitualComplete = async (data: MorningRitualData) => {
    // Mark selected tasks as MUSTs
    for (let i = 0; i < data.must_tasks.length; i++) {
      const todoId = data.must_tasks[i]
      if (i === 0) {
        // First one is the TRUE MUST
        await supabase
          .from('todo_items')
          .update({ is_must: true, is_top_three: false })
          .eq('id', todoId)
      } else {
        // Others are important
        await supabase
          .from('todo_items')
          .update({ is_must: false, is_top_three: true })
          .eq('id', todoId)
      }
    }
    
    // Save that we did the ritual today
    localStorage.setItem('lastMorningRitual', new Date().toDateString())
    setShowMorningRitual(false)
    await loadTodos()
  }
  
  // Quick add task
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickAddText.trim()) return
    
    try {
      // Parse natural language
      const parsed = parseNaturalLanguage(quickAddText)
      
      // Override with selected date if no date was parsed
      if (!parsed.due_date) {
        parsed.due_date = getQuickDate(selectedDate)
      }
      
      // Override priority with selected priority (cast to match ParsedTask type)
      // @ts-ignore - we're using DB priority values here
      parsed.priority = selectedPriority
      
      const { data, error } = await supabase
        .from('todo_items')
        .insert([{
          business_id: businessId,
          created_by: userId,
          assigned_to: userId,
          title: parsed.title,
          priority: parsed.priority,
          status: 'pending',
          category: 'Other',
          due_date: parsed.due_date,
          is_must: false,
          is_top_three: false
        }])
        .select()
        .single()
      
      if (error) {
        console.error('Error adding todo:', error)
        alert(`Failed to add task: ${error.message}`)
      } else if (data) {
        setQuickAddText('')
        setSelectedPriority('medium')
        setSelectedDate('today')
        await loadTodos()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Toggle Today's MUST
  const toggleTodaysMust = async (todoId: string) => {
    try {
      const todo = todos.find(t => t.id === todoId)
      if (!todo) return
      
      // If removing MUST status, just update
      if (todo.is_must) {
        await supabase
          .from('todo_items')
          .update({ is_must: false })
          .eq('id', todoId)
      } else {
        // Clear other MUSTs for today first
        const todaysMusts = todos.filter(t => 
          t.is_must && 
          isDueToday(t.due_date)
        )
        
        for (const must of todaysMusts) {
          await supabase
            .from('todo_items')
            .update({ is_must: false })
            .eq('id', must.id)
        }
        
        // Set this as today's MUST
        await supabase
          .from('todo_items')
          .update({ is_must: true })
          .eq('id', todoId)
      }
      
      await loadTodos()
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Toggle Important flag
  const toggleImportant = async (todoId: string) => {
    try {
      const todo = todos.find(t => t.id === todoId)
      if (!todo) return
      
      await supabase
        .from('todo_items')
        .update({ is_top_three: !todo.is_top_three })
        .eq('id', todoId)
      
      await loadTodos()
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Update status
  const updateStatus = async (todoId: string, newStatus: TodoStatus) => {
    try {
      const updates: any = { status: newStatus }
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString()
      }
      
      await supabase
        .from('todo_items')
        .update(updates)
        .eq('id', todoId)
      
      await loadTodos()
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Delete todo
  const deleteTodo = async (todoId: string) => {
    if (!confirm('Delete this task?')) return
    
    try {
      await supabase
        .from('todo_items')
        .delete()
        .eq('id', todoId)
      
      await loadTodos()
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Start editing
  const startEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setEditForm({
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority,
      category: todo.category,
      due_date: todo.due_date?.split('T')[0] || '',
      notes: todo.notes || ''
    })
    setShowEditModal(true)
  }
  
  // Save edit
  const saveEdit = async () => {
    if (!editingTodo) return
    
    try {
      await supabase
        .from('todo_items')
        .update({
          title: editForm.title,
          description: editForm.description || null,
          priority: editForm.priority,
          category: editForm.category,
          due_date: editForm.due_date || null,
          notes: editForm.notes || null
        })
        .eq('id', editingTodo.id)
      
      setShowEditModal(false)
      setEditingTodo(null)
      await loadTodos()
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Filter todos by view
  const getFilteredTodos = () => {
    let filtered = [...todos]
    
    switch (activeView) {
      case 'today':
        filtered = filtered.filter(t => 
          (isDueToday(t.due_date) || isOverdue(t.due_date) || t.is_must) && 
          t.status !== 'completed'
        )
        break
      case 'open_loops':
        filtered = filtered.filter(t => 
          t.status !== 'completed' && 
          !t.is_must && 
          !t.is_top_three &&
          !isDueToday(t.due_date)
        )
        break
      case 'this_week':
        filtered = filtered.filter(t => 
          isDueThisWeek(t.due_date) && 
          t.status !== 'completed'
        )
        break
      case 'backlog':
        filtered = filtered.filter(t => 
          t.status === 'pending' && 
          !isDueThisWeek(t.due_date) &&
          !t.is_must
        )
        break
      case 'completed':
        filtered = filtered.filter(t => t.status === 'completed')
        break
      case 'all':
        filtered = filtered.filter(t => t.status !== 'completed')
        break
    }
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }
  
  useEffect(() => {
    loadTodos()
  }, [loadTodos])
  
  const filteredTodos = getFilteredTodos()
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Morning Ritual Modal */}
      {showMorningRitual && (
        <MorningRitual
          onComplete={handleMorningRitualComplete}
          onSkip={() => {
            localStorage.setItem('lastMorningRitual', new Date().toDateString())
            setShowMorningRitual(false)
          }}
          todos={todos}
        />
      )}
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Task Manager</h1>
              <p className="text-gray-600 mt-1">Focus on what matters today</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowMorningRitual(true)}
                className="px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700"
              >
                🌅 Morning Ritual
              </button>
              <button
                onClick={loadTodos}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed_today}</div>
              <div className="text-xs text-gray-600">Done Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-brand-orange">{stats.due_today}</div>
              <div className="text-xs text-gray-600">Due Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-brand-navy">{stats.open_loops}</div>
              <div className="text-xs text-gray-600">Open Loops</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-brand-orange-600">{stats.backlog_count}</div>
              <div className="text-xs text-gray-600">Backlog</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs text-gray-600">Overdue</div>
            </div>
          </div>
        </div>
        
        {/* Quick Add - More Visible */}
        <div className="bg-gradient-to-r from-brand-orange-50 to-brand-navy-50 rounded-lg shadow-sm p-6 mb-6 border border-brand-orange-200">
          <form onSubmit={handleQuickAdd} className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder="What needs to be done? (Natural language: 'Call client tomorrow' or 'Review report urgent')"
                className="flex-1 px-4 py-3 border-2 border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange text-lg"
                autoFocus
              />
              <button
                type="submit"
                className="px-8 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium"
              >
                Add Task
              </button>
            </div>
            
            {/* Due Date Selection - More Prominent */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-700">📅 Due Date:</span>
                <div className="flex gap-2 flex-1">
                  {['today', 'tomorrow', 'this_week', 'next_week'].map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedDate(option)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        selectedDate === option
                          ? 'bg-brand-orange text-white shadow-md scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {option.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Priority Selection - More Prominent */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-700">🔥 Priority:</span>
                <div className="flex gap-2 flex-1">
                  {[
                    { value: 'low', label: 'Low', color: 'green' },
                    { value: 'medium', label: 'Normal', color: 'yellow' },
                    { value: 'high', label: 'High', color: 'orange' },
                    { value: 'critical', label: 'Critical', color: 'red' }
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedPriority(option.value as TodoPriority)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        selectedPriority === option.value
                          ? `bg-${option.color}-600 text-white shadow-md scale-105`
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      } ${
                        selectedPriority === option.value && option.value === 'critical' ? 'bg-red-600' :
                        selectedPriority === option.value && option.value === 'high' ? 'bg-brand-orange-600' :
                        selectedPriority === option.value && option.value === 'medium' ? 'bg-yellow-600' :
                        selectedPriority === option.value && option.value === 'low' ? 'bg-green-600' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </form>
          
          <div className="mt-3 text-sm text-gray-600">
            💡 Natural language tips: "urgent", "!!", "tomorrow", "this week" are understood automatically
          </div>
        </div>
        
        {/* View Tabs & Search */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              {[
                { id: 'today', label: 'Today', emoji: '📅', count: stats.due_today },
                { id: 'open_loops', label: 'Open Loops', emoji: '🔄', count: stats.open_loops },
                { id: 'this_week', label: 'This Week', emoji: '📍', count: stats.due_this_week },
                { id: 'backlog', label: 'Backlog', emoji: '📦', count: stats.backlog_count },
                { id: 'all', label: 'All Open', emoji: '📋', count: todos.filter(t => t.status !== 'completed').length },
                { id: 'completed', label: 'Done', emoji: '✅', count: todos.filter(t => t.status === 'completed').length }
              ].map(view => (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id as TodoView)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-1 ${
                    activeView === view.id
                      ? 'bg-brand-orange text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{view.emoji}</span>
                  <span>{view.label}</span>
                  <span className="text-xs">({view.count})</span>
                </button>
              ))}
            </div>
            
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="px-3 py-2 border border-gray-300 rounded-lg w-48"
            />
          </div>
          
          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-600">
            <span>⭐ = Today's MUST DO (1 max)</span>
            <span>🔥 = Important</span>
            <span>Click circle to update status</span>
          </div>
        </div>
        
        {/* Task List */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange mx-auto"></div>
            </div>
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {activeView === 'today' ? 'No tasks for today. Add one above!' :
               activeView === 'open_loops' ? 'No open loops - great job staying on top of things!' :
               activeView === 'backlog' ? 'No backlog items' :
               activeView === 'completed' ? 'No completed tasks yet' :
               'No tasks found'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTodos.map(todo => {
                const overdue = isOverdue(todo.due_date)
                const dueToday = isDueToday(todo.due_date)
                
                return (
                  <div 
                    key={todo.id}
                    className={`
                      border rounded-lg p-4 transition-all
                      ${todo.is_must ? 'border-yellow-400 bg-yellow-50' :
                        todo.is_top_three ? 'border-red-400 bg-red-50' :
                        overdue ? 'border-red-300 bg-red-50' :
                        dueToday ? 'border-brand-orange-300 bg-brand-orange-50' :
                        'border-gray-200 hover:bg-gray-50'}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Status Circle */}
                        <button
                          onClick={() => {
                            const nextStatus = 
                              todo.status === 'pending' ? 'in-progress' :
                              todo.status === 'in-progress' ? 'completed' : 'pending'
                            updateStatus(todo.id, nextStatus)
                          }}
                          className="flex-shrink-0"
                        >
                          {todo.status === 'completed' ? (
                            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          ) : todo.status === 'in-progress' ? (
                            <div className="w-6 h-6 rounded-full bg-brand-orange-500 animate-pulse" />
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-gray-300 hover:border-gray-400" />
                          )}
                        </button>
                        
                        {/* Task Content */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-medium ${
                              todo.status === 'completed' ? 'line-through text-gray-500' : ''
                            }`}>
                              {todo.title}
                            </h3>
                            {todo.priority === 'critical' && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                Critical
                              </span>
                            )}
                            {todo.priority === 'high' && (
                              <span className="text-xs px-2 py-0.5 bg-brand-orange-100 text-brand-orange-700 rounded-full font-medium">
                                High
                              </span>
                            )}
                          </div>
                          
                          {todo.description && (
                            <p className="text-sm text-gray-600 mt-1">{todo.description}</p>
                          )}
                          
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                            <span className={overdue ? 'text-red-600 font-medium' : ''}>
                              📅 {formatDate(todo.due_date)}
                            </span>
                            {todo.category !== 'Other' && (
                              <span>{todo.category}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTodaysMust(todo.id)}
                          className={`p-2 rounded-lg ${
                            todo.is_must
                              ? 'text-yellow-500'
                              : 'text-gray-400 hover:text-yellow-500'
                          }`}
                          title="Today's MUST DO (only 1 per day)"
                        >
                          ⭐
                        </button>
                        
                        <button
                          onClick={() => toggleImportant(todo.id)}
                          className={`p-2 rounded-lg ${
                            todo.is_top_three
                              ? 'text-red-500'
                              : 'text-gray-400 hover:text-red-500'
                          }`}
                          title="Mark as Important"
                        >
                          🔥
                        </button>
                        
                        <button
                          onClick={() => startEdit(todo)}
                          className="p-2 text-gray-400 hover:text-brand-orange"
                        >
                          ✏️
                        </button>
                        
                        <button
                          onClick={() => deleteTodo(todo.id)}
                          className="p-2 text-gray-400 hover:text-red-600"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Edit Modal */}
        {showEditModal && editingTodo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
              <h2 className="text-xl font-bold mb-4">Edit Task</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm({...editForm, priority: e.target.value as TodoPriority})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({...editForm, category: e.target.value as TodoCategory})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {['Operations', 'Sales', 'Marketing', 'Finance', 'Team', 'Strategy', 'Personal', 'Admin', 'Other'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({...editForm, due_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingTodo(null)
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}