// TodoList.tsx - Component for displaying a list of todos
// Location: /src/components/todos/TodoList.tsx

import React, { useMemo, useState } from 'react';
import { 
  Star, 
  Circle, 
  Calendar, 
  Archive,
  ChevronDown,
  ChevronRight,
  Filter,
  SortAsc
} from 'lucide-react';
import TodoItem from './TodoItem';
import { EnhancedTodoItem, TodoView, TodoCategory } from './utils/types';
import { VIEW_CONFIGS, CATEGORIES } from './utils/constants';

interface TodoListProps {
  todos: EnhancedTodoItem[];
  view: TodoView;
  onToggleStatus: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: EnhancedTodoItem) => void;
  onToggleMust: (id: string, level: 1 | 2) => void;
  showAssignee?: boolean;
  isSelecting?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  groupBy?: 'category' | 'assignee' | 'priority' | 'none';
  sortBy?: 'due_date' | 'priority' | 'created' | 'title';
  hideCompleted?: boolean;
}

export default function TodoList({
  todos,
  view,
  onToggleStatus,
  onComplete,
  onDelete,
  onEdit,
  onToggleMust,
  showAssignee = false,
  isSelecting = false,
  selectedIds = new Set(),
  onSelect,
  groupBy = 'none',
  sortBy = 'due_date',
  hideCompleted = false
}: TodoListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<TodoCategory>>(new Set());
  
  // Filter todos based on view
  const filteredTodos = useMemo(() => {
    let filtered = [...todos];
    
    // Apply view filter
    switch (view) {
      case 'musts':
        filtered = filtered.filter(t => t.is_must);
        break;
      case 'open-loops':
        filtered = filtered.filter(t => t.is_open_loop);
        break;
      case 'week':
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + (5 - weekEnd.getDay())); // Friday
        weekEnd.setHours(23, 59, 59, 999);
        filtered = filtered.filter(t => {
          if (!t.due_date) return false;
          const dueDate = new Date(t.due_date);
          return dueDate <= weekEnd && t.status !== 'completed';
        });
        break;
      case 'backlog':
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        filtered = filtered.filter(t => {
          if (!t.due_date) return true; // No date = backlog
          const dueDate = new Date(t.due_date);
          return dueDate > nextWeek;
        });
        break;
      case 'all':
      default:
        // Show all todos
        break;
    }
    
    // Apply category filter
    if (selectedCategories.size > 0) {
      filtered = filtered.filter(t =>
        t.category && selectedCategories.has(t.category as TodoCategory)
      );
    }
    
    // Hide completed if requested
    if (hideCompleted) {
      filtered = filtered.filter(t => t.status !== 'completed');
    }
    
    // Sort todos
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        
        case 'priority':
          const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'];
        
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        
        case 'title':
          return a.title.localeCompare(b.title);
        
        default:
          return 0;
      }
    });
    
    // Apply MUST level secondary sort for musts view
    if (view === 'musts') {
      filtered.sort((a, b) => {
        const aLevel = a.must_level || 0;
        const bLevel = b.must_level || 0;
        return bLevel - aLevel; // Higher level first
      });
    }
    
    return filtered;
  }, [todos, view, selectedCategories, hideCompleted, sortBy]);
  
  // Group todos
  const groupedTodos = useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Tasks': filteredTodos };
    }
    
    const groups: Record<string, EnhancedTodoItem[]> = {};
    
    filteredTodos.forEach(todo => {
      let groupKey = '';
      
      switch (groupBy) {
        case 'category':
          groupKey = todo.category || 'Uncategorized';
          break;
        case 'assignee':
          groupKey = todo.assigned_to || 'Unassigned';
          break;
        case 'priority':
          groupKey = todo.priority || 'medium';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(todo);
    });
    
    return groups;
  }, [filteredTodos, groupBy]);
  
  // Toggle group collapse
  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };
  
  // Toggle category filter
  const toggleCategoryFilter = (category: TodoCategory) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  // Get view config
  const viewConfig = VIEW_CONFIGS[view];
  
  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredTodos.length;
    const completed = filteredTodos.filter(t => t.status === 'completed').length;
    const inProgress = filteredTodos.filter(t => t.status === 'in-progress').length;
    const overdue = filteredTodos.filter(t => {
      if (!t.due_date || t.status === 'completed') return false;
      return new Date(t.due_date) < new Date();
    }).length;
    
    return { total, completed, inProgress, overdue };
  }, [filteredTodos]);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{viewConfig.emoji}</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {viewConfig.label}
              </h2>
              <p className="text-sm text-gray-600">
                {viewConfig.description}
              </p>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              {stats.total} tasks
            </span>
            {stats.completed > 0 && (
              <span className="text-green-600">
                {stats.completed} completed
              </span>
            )}
            {stats.inProgress > 0 && (
              <span className="text-brand-orange">
                {stats.inProgress} in progress
              </span>
            )}
            {stats.overdue > 0 && (
              <span className="text-red-600 font-medium">
                {stats.overdue} overdue
              </span>
            )}
          </div>
        </div>
        
        {/* Filters and sorting */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            Filters
            {selectedCategories.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-brand-orange-100 text-brand-orange-700 rounded-full text-xs">
                {selectedCategories.size}
              </span>
            )}
          </button>
          
          <select
            value={sortBy}
            onChange={(e) => {}} // Add onChange handler in parent
            className="px-3 py-1 text-sm border border-gray-300 rounded-md"
          >
            <option value="due_date">Due Date</option>
            <option value="priority">Priority</option>
            <option value="created">Created</option>
            <option value="title">Title</option>
          </select>
          
          <select
            value={groupBy}
            onChange={(e) => {}} // Add onChange handler in parent
            className="px-3 py-1 text-sm border border-gray-300 rounded-md"
          >
            <option value="none">No Grouping</option>
            <option value="category">By Category</option>
            <option value="assignee">By Assignee</option>
            <option value="priority">By Priority</option>
          </select>
        </div>
        
        {/* Category filters */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORIES).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => toggleCategoryFilter(key as TodoCategory)}
                  className={`
                    px-3 py-1 rounded-full text-sm font-medium transition-colors
                    ${selectedCategories.has(key as TodoCategory)
                      ? `${config.color} bg-opacity-20 border-2 border-current`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  {config.emoji} {config.label}
                </button>
              ))}
              {selectedCategories.size > 0 && (
                <button
                  onClick={() => setSelectedCategories(new Set())}
                  className="px-3 py-1 rounded-full text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Todo list */}
      <div className="space-y-4">
        {filteredTodos.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">{viewConfig.emptyMessage}</p>
          </div>
        ) : (
          Object.entries(groupedTodos).map(([groupName, groupTodos]) => (
            <div key={groupName} className="bg-white rounded-lg border border-gray-200">
              {groupBy !== 'none' && (
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 border-b border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    {collapsedGroups.has(groupName) ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {groupName}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({groupTodos.length})
                    </span>
                  </div>
                </button>
              )}
              
              {!collapsedGroups.has(groupName) && (
                <div className="p-2">
                  {groupTodos.map(todo => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggleStatus={onToggleStatus}
                      onComplete={onComplete}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onToggleMust={onToggleMust}
                      isSelecting={isSelecting}
                      isSelected={selectedIds.has(todo.id)}
                      onSelect={onSelect}
                      showAssignee={showAssignee}
                      compact={groupTodos.length > 10}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}