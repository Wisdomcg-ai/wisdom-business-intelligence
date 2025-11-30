// TodoItem.tsx - Component for displaying a single todo item
// Location: /src/components/todos/TodoItem.tsx

import React, { useState } from 'react';
import { 
  Check, 
  Circle, 
  Clock, 
  Star, 
  Repeat, 
  ChevronDown, 
  ChevronUp,
  Trash2,
  Edit2,
  User,
  Calendar
} from 'lucide-react';
import { EnhancedTodoItem } from './utils/types';
import {
  CATEGORIES,
  STATUSES,
  MUST_LEVELS,
  OPEN_LOOP_AGING,
  EFFORT_SIZES,
  PRIORITY_MAP
} from './utils/constants';
import { getRecurrenceDescription } from './utils/recurringTasks';

interface TodoItemProps {
  todo: EnhancedTodoItem;
  onToggleStatus: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: EnhancedTodoItem) => void;
  onToggleMust: (id: string, level: 1 | 2) => void;
  isSelecting?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  showAssignee?: boolean;
  compact?: boolean;
}

export default function TodoItem({
  todo,
  onToggleStatus,
  onComplete,
  onDelete,
  onEdit,
  onToggleMust,
  isSelecting = false,
  isSelected = false,
  onSelect,
  showAssignee = false,
  compact = false
}: TodoItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get display values with null checks
  const categoryKey = todo.category || 'Operations';
  const category = CATEGORIES[categoryKey as keyof typeof CATEGORIES] || CATEGORIES['Operations'];
  const priorityInfo = PRIORITY_MAP[todo.priority || 'medium'] || { label: 'Medium', color: 'text-yellow-600' };
  const status = STATUSES[todo.status as keyof typeof STATUSES] || 'pending';
  const effortSize = todo.effort_size ? EFFORT_SIZES[todo.effort_size as keyof typeof EFFORT_SIZES] : null;
  
  // Get open loop aging color
  const getOpenLoopIndicator = () => {
    if (!todo.is_open_loop || !todo.days_in_loop) return null;
    
    if (todo.days_in_loop <= OPEN_LOOP_AGING.fresh.max) {
      return OPEN_LOOP_AGING.fresh;
    } else if (todo.days_in_loop <= OPEN_LOOP_AGING.warning.max) {
      return OPEN_LOOP_AGING.warning;
    } else if (todo.days_in_loop <= OPEN_LOOP_AGING.critical.max) {
      return OPEN_LOOP_AGING.critical;
    } else {
      return OPEN_LOOP_AGING.fire;
    }
  };
  
  const openLoopIndicator = getOpenLoopIndicator();
  
  // Format due date
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset time for comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else if (date < today) {
      const daysOverdue = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      return `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };
  
  const dueDateDisplay = formatDueDate(todo.due_date);
  const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'completed';
  
  // Handle status toggle
  const handleStatusClick = () => {
    if (todo.status === 'completed') return;
    
    if (isSelecting && onSelect) {
      onSelect(todo.id);
    } else if (todo.status === 'pending') {
      onToggleStatus(todo.id);
    } else if (todo.status === 'in-progress') {
      onComplete(todo.id);
    }
  };
  
  return (
    <div 
      className={`
        group border rounded-lg p-3 mb-2 transition-all
        ${isSelected ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}
        ${todo.status === 'completed' ? 'opacity-60' : ''}
        ${compact ? 'py-2' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Status/Selection Checkbox */}
        <button
          onClick={handleStatusClick}
          className={`
            mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all
            ${isSelecting ? 'hover:border-teal-500' : ''}
            ${isSelected ? 'bg-teal-500 border-teal-500' : ''}
            ${todo.status === 'completed' ? 'bg-green-500 border-green-500' : ''}
            ${todo.status === 'in-progress' ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}
          `}
        >
          {isSelected && (
            <Check className="w-3 h-3 text-white m-auto" />
          )}
          {!isSelecting && todo.status === 'completed' && (
            <Check className="w-3 h-3 text-white m-auto" />
          )}
          {!isSelecting && todo.status === 'in-progress' && (
            <div className="w-2 h-2 bg-white rounded-full m-auto" />
          )}
        </button>
        
        {/* Main Content */}
        <div className="flex-grow min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-grow">
              {/* Title and badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`
                  font-medium
                  ${todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}
                `}>
                  {todo.title}
                </h3>
                
                {/* MUST indicators */}
                {todo.must_level && (
                  <span className="text-yellow-500">
                    {MUST_LEVELS[todo.must_level].icon}
                  </span>
                )}
                
                {/* Open Loop indicator */}
                {openLoopIndicator && (
                  <span className={`text-sm ${openLoopIndicator.color}`}>
                    {openLoopIndicator.emoji} {todo.days_in_loop}d
                  </span>
                )}
                
                {/* Recurring indicator */}
                {todo.recurrence_pattern && (
                  <Repeat className="w-4 h-4 text-teal-500" />
                )}
                
                {/* Priority indicator */}
                {todo.priority === 'high' && (
                  <span className="text-red-500 text-sm font-medium">!</span>
                )}
              </div>
              
              {/* Metadata row */}
              {!compact && (
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                  {/* Category */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${category?.color || 'bg-gray-400'} bg-opacity-10`}>
                    <span>{category?.emoji || '📌'}</span>
                    <span>{category?.label || 'Other'}</span>
                  </span>
                  
                  {/* Due date */}
                  {dueDateDisplay && (
                    <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                      <Calendar className="w-3 h-3" />
                      {dueDateDisplay}
                    </span>
                  )}
                  
                  {/* Assignee */}
                  {showAssignee && todo.assigned_to && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {todo.assigned_to}
                    </span>
                  )}
                  
                  {/* Effort size */}
                  {effortSize && (
                    <span className={`px-2 py-0.5 rounded text-xs ${effortSize.color}`}>
                      {effortSize.label}
                    </span>
                  )}
                </div>
              )}
              
              {/* Description (expandable) */}
              {todo.description && !compact && (
                <div className="mt-2">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Description
                  </button>
                  {isExpanded && (
                    <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                      {todo.description}
                    </p>
                  )}
                </div>
              )}
              
              {/* Recurrence info */}
              {todo.recurrence_pattern && isExpanded && (
                <div className="mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Repeat className="w-3 h-3" />
                    {getRecurrenceDescription(todo.recurrence_pattern)}
                  </span>
                </div>
              )}
            </div>
            
            {/* Action buttons */}
            {!isSelecting && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Toggle MUST buttons */}
                {todo.status !== 'completed' && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMust(todo.id, 1);
                      }}
                      className={`p-1 rounded hover:bg-gray-100 ${todo.must_level === 1 ? 'text-yellow-500' : 'text-gray-400'}`}
                      title="Mark as TRUE MUST"
                    >
                      <Star className="w-4 h-4" fill={(todo.must_level ?? 0) >= 1 ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMust(todo.id, 2);
                      }}
                      className={`p-1 rounded hover:bg-gray-100 ${todo.must_level === 2 ? 'text-yellow-500' : 'text-gray-400'}`}
                      title="Mark as TOP 3 MUST"
                    >
                      <div className="flex -space-x-1">
                        <Star className="w-4 h-4" fill={todo.must_level === 2 ? 'currentColor' : 'none'} />
                        <Star className="w-4 h-4" fill={todo.must_level === 2 ? 'currentColor' : 'none'} />
                      </div>
                    </button>
                  </>
                )}
                
                {/* Edit button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(todo);
                  }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  title="Edit task"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(todo.id);
                  }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}