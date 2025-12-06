// /src/lib/todo-types.ts
// Complete todo system types and utilities

export type TodoPriority = 'high' | 'medium' | 'low';
export type TodoStatus = 'pending' | 'in-progress' | 'completed';
export type TodoCategory = 'Operations' | 'Finance' | 'Marketing' | 'Leadership' | 'Admin' | 'Personal';
export type TodoEffortSize = 'quick_win' | 'project' | 'initiative';
export type TodoSource = 'manual' | 'assessment' | 'meeting' | 'email' | 'system';
export type TodoView = 'all' | 'today' | 'week' | 'overdue' | 'upcoming';

export interface TodoItem {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  category: TodoCategory;
  effort_size: TodoEffortSize;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  is_private_note: boolean;
  source: TodoSource;
  order_index: number;
  tags: string[];
  notes: string | null;
}

export interface TodoStats {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  due_today: number;
  due_this_week: number;
  completion_rate: number;
}

export interface TodoFilters {
  status?: TodoStatus | 'all';
  priority?: TodoPriority | 'all';
  category?: TodoCategory | 'all';
  effort_size?: TodoEffortSize | 'all';
  view?: TodoView;
  search?: string;
  showPrivate?: boolean;
  showUnpublished?: boolean;
}

// Priority display mapping
export const PRIORITY_LABELS: Record<TodoPriority, string> = {
  high: 'Critical',
  medium: 'Important',
  low: 'Good-to-do'
};

// Priority colors for UI
export const PRIORITY_COLORS: Record<TodoPriority, string> = {
  high: 'bg-red-100 text-red-800 border-red-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-green-100 text-green-800 border-green-300'
};

// Status colors for UI
export const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800'
};

// Category icons (using Lucide icon names)
export const CATEGORY_ICONS: Record<TodoCategory, string> = {
  Operations: 'Settings',
  Finance: 'DollarSign',
  Marketing: 'Megaphone',
  Leadership: 'Users',
  Admin: 'FileText',
  Personal: 'User'
};

// Category colors for UI - Using brand colors
export const CATEGORY_COLORS: Record<TodoCategory, string> = {
  Operations: 'bg-brand-navy-50 text-brand-navy',
  Finance: 'bg-brand-orange-50 text-brand-orange-700',
  Marketing: 'bg-brand-navy-50 text-brand-navy',
  Leadership: 'bg-brand-orange-50 text-brand-orange-700',
  Admin: 'bg-gray-100 text-gray-800',
  Personal: 'bg-gray-100 text-gray-700'
};

// Effort size labels
export const EFFORT_LABELS: Record<TodoEffortSize, string> = {
  quick_win: 'Quick Win (<30 min)',
  project: 'Project (hours)',
  initiative: 'Initiative (weeks)'
};

// Effort size colors - Using brand colors
export const EFFORT_COLORS: Record<TodoEffortSize, string> = {
  quick_win: 'bg-brand-teal/10 text-brand-teal',
  project: 'bg-brand-orange-50 text-brand-orange-700',
  initiative: 'bg-brand-navy-50 text-brand-navy'
};

// Helper functions
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due.getTime() === today.getTime();
}

export function isDueThisWeek(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due >= today && due <= weekFromNow;
}

export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '';
  
  const date = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Reset hours for comparison
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  
  if (compareDate.getTime() === today.getTime()) {
    return 'Today';
  } else if (compareDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  } else if (compareDate < today) {
    const daysOverdue = Math.floor((today.getTime() - compareDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`;
  } else {
    // Format as "Mon, Jan 15"
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

export function sortTodos(todos: TodoItem[], sortBy: 'priority' | 'dueDate' | 'status' | 'created'): TodoItem[] {
  const sorted = [...todos];
  
  switch (sortBy) {
    case 'priority':
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    case 'dueDate':
      return sorted.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    
    case 'status':
      const statusOrder = { pending: 0, 'in-progress': 1, completed: 2 };
      return sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    
    case 'created':
    default:
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export function filterTodos(todos: TodoItem[], filters: TodoFilters): TodoItem[] {
  let filtered = [...todos];
  
  // Status filter
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(todo => todo.status === filters.status);
  }
  
  // Priority filter
  if (filters.priority && filters.priority !== 'all') {
    filtered = filtered.filter(todo => todo.priority === filters.priority);
  }
  
  // Category filter
  if (filters.category && filters.category !== 'all') {
    filtered = filtered.filter(todo => todo.category === filters.category);
  }
  
  // Effort size filter
  if (filters.effort_size && filters.effort_size !== 'all') {
    filtered = filtered.filter(todo => todo.effort_size === filters.effort_size);
  }
  
  // View filter (today, week, overdue, etc.)
  if (filters.view) {
    switch (filters.view) {
      case 'today':
        filtered = filtered.filter(todo => isDueToday(todo.due_date));
        break;
      case 'week':
        filtered = filtered.filter(todo => isDueThisWeek(todo.due_date));
        break;
      case 'overdue':
        filtered = filtered.filter(todo => isOverdue(todo.due_date) && todo.status !== 'completed');
        break;
      case 'upcoming':
        filtered = filtered.filter(todo => {
          if (!todo.due_date) return false;
          const due = new Date(todo.due_date);
          const weekFromNow = new Date();
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          return due > weekFromNow;
        });
        break;
    }
  }
  
  // Search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(todo => 
      todo.title.toLowerCase().includes(searchLower) ||
      (todo.description && todo.description.toLowerCase().includes(searchLower)) ||
      (todo.notes && todo.notes.toLowerCase().includes(searchLower))
    );
  }
  
  // Privacy filters (for coaches)
  if (!filters.showPrivate) {
    filtered = filtered.filter(todo => !todo.is_private_note);
  }
  
  if (!filters.showUnpublished) {
    filtered = filtered.filter(todo => todo.is_published);
  }
  
  return filtered;
}