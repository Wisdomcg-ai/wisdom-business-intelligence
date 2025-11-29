'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActionCard, type ActionItem } from '@/components/coach/actions/ActionCard'
import { ActionFiltersBar, ActionQuickFilters, type ActionFilters } from '@/components/coach/actions/ActionFilters'
import { CreateActionModal } from '@/components/coach/actions/CreateActionModal'
import {
  Plus,
  Loader2,
  ListChecks,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  industry?: string
}

export default function ActionsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  const [filters, setFilters] = useState<ActionFilters>({
    search: '',
    status: 'all',
    priority: 'all',
    clientId: '',
    dueFilter: 'all',
    category: ''
  })

  const [quickFilter, setQuickFilter] = useState('all')

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load clients
      const { data: clientsData } = await supabase
        .from('businesses')
        .select('id, business_name, industry')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (clientsData) {
        setClients(clientsData.map(c => ({
          id: c.id,
          businessName: c.business_name || 'Unnamed',
          industry: c.industry || undefined
        })))
      }

      // Load actions
      const { data: actionsData } = await supabase
        .from('action_items')
        .select(`
          id,
          title,
          description,
          business_id,
          status,
          priority,
          due_date,
          assigned_to,
          created_at,
          completed_at,
          category,
          businesses (
            business_name
          )
        `)
        .order('created_at', { ascending: false })

      if (actionsData) {
        setActions(actionsData.map(a => {
          const businessData = a.businesses as unknown
          const business = Array.isArray(businessData)
            ? businessData[0] as { business_name: string } | undefined
            : businessData as { business_name: string } | null

          return {
            id: a.id,
            title: a.title || '',
            description: a.description || undefined,
            businessId: a.business_id || '',
            businessName: business?.business_name || 'Unknown',
            status: (a.status as ActionItem['status']) || 'pending',
            priority: (a.priority as ActionItem['priority']) || 'medium',
            dueDate: a.due_date || undefined,
            assignedTo: a.assigned_to || undefined,
            createdAt: a.created_at,
            completedAt: a.completed_at || undefined,
            category: a.category || undefined
          }
        }))
      }

    } catch (error) {
      console.error('Error loading actions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter actions
  const filteredActions = useMemo(() => {
    let result = [...actions]

    // Quick filter
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)

    if (quickFilter === 'overdue') {
      result = result.filter(a =>
        a.dueDate &&
        new Date(a.dueDate) < today &&
        a.status !== 'completed' &&
        a.status !== 'cancelled'
      )
    } else if (quickFilter === 'today') {
      result = result.filter(a =>
        a.dueDate &&
        new Date(a.dueDate).toDateString() === today.toDateString() &&
        a.status !== 'completed'
      )
    } else if (quickFilter === 'this_week') {
      result = result.filter(a =>
        a.dueDate &&
        new Date(a.dueDate) >= today &&
        new Date(a.dueDate) < weekEnd &&
        a.status !== 'completed'
      )
    } else if (quickFilter === 'completed') {
      result = result.filter(a => a.status === 'completed')
    }

    // Search
    if (filters.search) {
      const query = filters.search.toLowerCase()
      result = result.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.businessName.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(a => a.status === filters.status)
    }

    // Priority filter
    if (filters.priority !== 'all') {
      result = result.filter(a => a.priority === filters.priority)
    }

    // Client filter
    if (filters.clientId) {
      result = result.filter(a => a.businessId === filters.clientId)
    }

    // Due date filter
    if (filters.dueFilter !== 'all') {
      if (filters.dueFilter === 'overdue') {
        result = result.filter(a =>
          a.dueDate && new Date(a.dueDate) < today && a.status !== 'completed'
        )
      } else if (filters.dueFilter === 'today') {
        result = result.filter(a =>
          a.dueDate && new Date(a.dueDate).toDateString() === today.toDateString()
        )
      } else if (filters.dueFilter === 'this_week') {
        result = result.filter(a =>
          a.dueDate && new Date(a.dueDate) >= today && new Date(a.dueDate) < weekEnd
        )
      } else if (filters.dueFilter === 'no_date') {
        result = result.filter(a => !a.dueDate)
      }
    }

    // Category filter
    if (filters.category) {
      result = result.filter(a => a.category === filters.category)
    }

    return result
  }, [actions, filters, quickFilter])

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(actions.map(a => a.category).filter(Boolean))
    return Array.from(cats) as string[]
  }, [actions])

  // Counts for quick filters
  const counts = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)

    return {
      all: actions.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length,
      overdue: actions.filter(a =>
        a.dueDate && new Date(a.dueDate) < today && a.status !== 'completed' && a.status !== 'cancelled'
      ).length,
      today: actions.filter(a =>
        a.dueDate && new Date(a.dueDate).toDateString() === today.toDateString() && a.status !== 'completed'
      ).length,
      thisWeek: actions.filter(a =>
        a.dueDate && new Date(a.dueDate) >= today && new Date(a.dueDate) < weekEnd && a.status !== 'completed'
      ).length,
      completed: actions.filter(a => a.status === 'completed').length
    }
  }, [actions])

  const handleCreateAction = async (data: {
    title: string
    description?: string
    businessId: string
    priority: 'low' | 'medium' | 'high' | 'urgent'
    dueDate?: string
    category?: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('action_items')
      .insert({
        title: data.title,
        description: data.description,
        business_id: data.businessId,
        priority: data.priority,
        due_date: data.dueDate,
        category: data.category,
        status: 'pending',
        created_by: user.id
      })

    if (error) {
      console.error('Error creating action:', error)
      throw error
    }

    await loadData()
  }

  const handleToggleComplete = async (actionId: string) => {
    const action = actions.find(a => a.id === actionId)
    if (!action) return

    const newStatus = action.status === 'completed' ? 'pending' : 'completed'

    const { error } = await supabase
      .from('action_items')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', actionId)

    if (error) {
      console.error('Error updating action:', error)
      return
    }

    setActions(prev => prev.map(a =>
      a.id === actionId
        ? { ...a, status: newStatus, completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined }
        : a
    ))
  }

  const handleDeleteAction = async (actionId: string) => {
    const { error } = await supabase
      .from('action_items')
      .delete()
      .eq('id', actionId)

    if (error) {
      console.error('Error deleting action:', error)
      return
    }

    setActions(prev => prev.filter(a => a.id !== actionId))
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading actions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Actions</h1>
          <p className="text-gray-500 mt-1">
            {counts.all} pending &middot; {counts.overdue} overdue &middot; {counts.completed} completed
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Action
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.all}</p>
              <p className="text-sm text-gray-500">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{counts.overdue}</p>
              <p className="text-sm text-gray-500">Overdue</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.today}</p>
              <p className="text-sm text-gray-500">Due Today</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{counts.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Filters */}
      <ActionQuickFilters
        activeFilter={quickFilter}
        onFilterChange={setQuickFilter}
        counts={counts}
      />

      {/* Filters */}
      <ActionFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        clients={clients}
        categories={categories}
      />

      {/* Actions List */}
      {filteredActions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListChecks className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No actions found</h3>
          <p className="text-gray-500 mb-4">
            {filters.search || quickFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first action to get started'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Create Action
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredActions.map(action => (
            <ActionCard
              key={action.id}
              action={action}
              onToggleComplete={handleToggleComplete}
              onEdit={(a) => console.log('Edit action:', a)}
              onDelete={handleDeleteAction}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreateActionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateAction}
        clients={clients}
      />
    </div>
  )
}
