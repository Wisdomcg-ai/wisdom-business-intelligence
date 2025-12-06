'use client'

import {
  Search,
  Filter,
  X,
  Calendar,
  Flag,
  Building2,
  Clock
} from 'lucide-react'

export interface ActionFilters {
  search: string
  status: 'all' | 'pending' | 'in_progress' | 'completed'
  priority: 'all' | 'low' | 'medium' | 'high' | 'urgent'
  clientId: string
  dueFilter: 'all' | 'overdue' | 'today' | 'this_week' | 'no_date'
  category: string
}

interface ActionFiltersProps {
  filters: ActionFilters
  onFiltersChange: (filters: ActionFilters) => void
  clients: { id: string; businessName: string }[]
  categories: string[]
}

export function ActionFiltersBar({
  filters,
  onFiltersChange,
  clients,
  categories
}: ActionFiltersProps) {
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.clientId !== '' ||
    filters.dueFilter !== 'all' ||
    filters.category !== ''

  const clearFilters = () => {
    onFiltersChange({
      ...filters,
      status: 'all',
      priority: 'all',
      clientId: '',
      dueFilter: 'all',
      category: ''
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search actions..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
        />
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as ActionFilters['status'] })}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>

        {/* Priority */}
        <select
          value={filters.priority}
          onChange={(e) => onFiltersChange({ ...filters, priority: e.target.value as ActionFilters['priority'] })}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
        >
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Due Date */}
        <select
          value={filters.dueFilter}
          onChange={(e) => onFiltersChange({ ...filters, dueFilter: e.target.value as ActionFilters['dueFilter'] })}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
        >
          <option value="all">All Dates</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="this_week">Due This Week</option>
          <option value="no_date">No Due Date</option>
        </select>

        {/* Client */}
        <select
          value={filters.clientId}
          onChange={(e) => onFiltersChange({ ...filters, clientId: e.target.value })}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
        >
          <option value="">All Clients</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>{client.businessName}</option>
          ))}
        </select>

        {/* Category */}
        {categories.length > 0 && (
          <select
            value={filters.category}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// Quick filter tabs for common views
export function ActionQuickFilters({
  activeFilter,
  onFilterChange,
  counts
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  counts: {
    all: number
    overdue: number
    today: number
    thisWeek: number
    completed: number
  }
}) {
  const filters = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'overdue', label: 'Overdue', count: counts.overdue, color: 'text-red-600' },
    { key: 'today', label: 'Due Today', count: counts.today },
    { key: 'this_week', label: 'This Week', count: counts.thisWeek },
    { key: 'completed', label: 'Completed', count: counts.completed }
  ]

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {filters.map(filter => (
        <button
          key={filter.key}
          onClick={() => onFilterChange(filter.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeFilter === filter.key
              ? 'bg-brand-orange text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {filter.label}
          <span className={`ml-1.5 ${
            activeFilter === filter.key
              ? 'opacity-80'
              : filter.color || 'opacity-70'
          }`}>
            ({filter.count})
          </span>
        </button>
      ))}
    </div>
  )
}

export default ActionFiltersBar
