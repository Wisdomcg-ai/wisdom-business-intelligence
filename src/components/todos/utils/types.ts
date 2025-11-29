// types.ts - Complete type definitions for the todo system
// Location: /src/components/todos/utils/types.ts

import { Database } from '@/types/supabase';

// Base types from your database
export type TodoItem = Database['public']['Tables']['todo_items']['Row'];
export type TodoInsert = Database['public']['Tables']['todo_items']['Insert'];
export type TodoUpdate = Database['public']['Tables']['todo_items']['Update'];

// Enhanced todo with computed fields
export interface EnhancedTodoItem extends TodoItem {
  is_must?: boolean;
  must_level?: 1 | 2; // 1 = TRUE MUST (⭐), 2 = TOP 3 MUST (⭐⭐)
  is_open_loop?: boolean;
  days_in_loop?: number;
  recurrence_pattern?: string;
}

// Categories - Working ON vs IN the business
export type TodoCategory = 
  | 'Operations'  // Working IN the business
  | 'Sales'       // Revenue generation
  | 'Marketing'   // Growth & acquisition
  | 'Finance'     // Money management
  | 'Team'        // People, hiring, culture
  | 'Strategy'    // Working ON the business
  | 'Personal'    // Self-care, family, health
  | 'Admin'       // Compliance, paperwork
  | 'Other';      // Miscellaneous

// Simplified priority levels
export type TodoPriority = 'high' | 'medium' | 'low'; // Keeping existing DB values
export type SimplifiedPriority = 'important' | 'normal'; // UI display

// Status progression
export type TodoStatus = 'pending' | 'in-progress' | 'completed';

// Effort sizing
export type EffortSize = 'quick-win' | 'half-day' | 'full-day' | 'multi-day';

// View modes
export type ViewMode = 'personal' | 'coach';
export type TodoView = 'musts' | 'open-loops' | 'week' | 'backlog' | 'all';

// Daily MUSTs
export interface DailyMust {
  id: string;
  business_id: string;
  user_name: string;
  todo_id: string;
  must_date: string; // ISO date string
  must_level: 1 | 2; // 1 = TRUE MUST, 2 = TOP 3 MUST
  created_at: string;
}

// Morning Ritual
export interface MorningRitualState {
  step: 'quick-wins' | 'review' | 'identify-musts' | 'select-top-3' | 'complete';
  quick_wins_completed: string[]; // todo IDs
  identified_musts: string[]; // todo IDs that are TRUE MUSTs
  selected_top_3: string[]; // todo IDs that are TOP 3 MUSTs
  date: string; // ISO date
}

// Natural Language Parse Result
export interface ParsedTask {
  title: string;
  due_date?: string;
  scheduled_date?: string;
  time?: string; // HH:MM format
  priority: SimplifiedPriority;
  category?: TodoCategory;
  assigned_to?: string;
  recurrence_pattern?: string;
  effort_size?: EffortSize;
  raw_input: string;
}

// Recurrence patterns
export interface RecurrenceInfo {
  pattern: string; // "every monday", "daily", etc.
  next_due?: string; // ISO date
  created_from?: string; // Original task ID
  last_completed?: string; // ISO date
  skip_weekends?: boolean; // For daily tasks
}

// Tags structure (stored in JSONB)
export interface TodoTags {
  recurrence?: RecurrenceInfo;
  coach_suggested?: boolean;
  morning_ritual_date?: string; // Date when selected as MUST
  created_via?: 'quick-add' | 'morning-ritual' | 'coach' | 'manual';
  [key: string]: any; // Allow additional tags
}

// Coach Dashboard
export interface ClientDashboard {
  user_name: string;
  today_musts: {
    total: number;
    completed: number;
    tasks: EnhancedTodoItem[];
  };
  open_loops: {
    total: number;
    aging: {
      fresh: number; // 1-2 days
      warning: number; // 3-4 days
      critical: number; // 5+ days
    };
    tasks: EnhancedTodoItem[];
  };
  week_overview: {
    by_category: Record<TodoCategory, number>;
    total: number;
    completed: number;
  };
  productivity_score: number; // 0-100
  streak_days: number;
}

// Coach suggestion
export interface CoachSuggestion {
  id: string;
  coach_id: string;
  client_name: string;
  todo_id?: string; // Existing task
  new_task?: ParsedTask; // Or new task
  suggestion_type: 'must' | 'priority' | 'delegate' | 'cancel';
  message?: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'rejected';
}

// Filter and sort options
export interface TodoFilters {
  categories?: TodoCategory[];
  priorities?: TodoPriority[];
  statuses?: TodoStatus[];
  assigned_to?: string[];
  date_range?: {
    start: string;
    end: string;
  };
  is_must?: boolean;
  is_open_loop?: boolean;
  has_recurrence?: boolean;
}

export interface TodoSort {
  field: 'due_date' | 'priority' | 'created_at' | 'title' | 'status';
  direction: 'asc' | 'desc';
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  loading?: boolean;
}

// User preferences (stored in localStorage for now)
export interface UserPreferences {
  default_view: TodoView;
  hide_completed: boolean;
  morning_ritual_time: string; // "08:00"
  work_days: number[]; // [1,2,3,4,5] = Mon-Fri
  theme?: 'light' | 'dark' | 'auto';
  show_coach_suggestions: boolean;
  categories_order?: TodoCategory[];
}

// Statistics for dashboard
export interface ProductivityStats {
  daily_completion_rate: number;
  weekly_completion_rate: number;
  tasks_completed_today: number;
  tasks_completed_week: number;
  average_open_loops: number;
  category_balance: Record<TodoCategory, number>;
  streak: {
    current: number;
    best: number;
    last_broken: string | null;
  };
}