// useTodos.ts - Main hook for todo data management
// Location: /src/components/todos/hooks/useTodos.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  TodoItem, 
  EnhancedTodoItem, 
  DailyMust, 
  TodoTags,
  TodoCategory,
  TodoPriority,
  TodoStatus,
  ParsedTask,
  ViewMode
} from '../utils/types';
import { 
  PRIORITY_TO_DB, 
  OPEN_LOOP_AGING,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES 
} from '../utils/constants';
import { createNextRecurrence, shouldTaskRecur } from '../utils/recurringTasks';
import { parseTaskInput } from '../utils/naturalLanguage';
import { toast } from 'sonner';

// Create Supabase client
const supabase = createClient();

interface UseTodosOptions {
  businessId: string;
  userId: string;
  viewMode: ViewMode;
  currentUserName?: string;
}

interface UseTodosReturn {
  todos: EnhancedTodoItem[];
  musts: DailyMust[];
  loading: boolean;
  error: string | null;
  createTodo: (input: string | ParsedTask) => Promise<TodoItem | null>;
  updateTodo: (id: string, updates: Partial<TodoItem>) => Promise<boolean>;
  deleteTodo: (id: string) => Promise<boolean>;
  completeTodo: (id: string) => Promise<boolean>;
  selectMust: (todoId: string, level: 1 | 2) => Promise<boolean>;
  removeMust: (todoId: string) => Promise<boolean>;
  refreshTodos: () => Promise<void>;
}

export function useTodos({
  businessId,
  userId,
  viewMode,
  currentUserName = 'Unknown'
}: UseTodosOptions): UseTodosReturn {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [musts, setMusts] = useState<DailyMust[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch todos from Supabase
  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch todos
      const { data: todosData, error: todosError } = await supabase
        .from('todo_items')
        .select('*')
        .eq('business_id', businessId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true });

      if (todosError) throw todosError;

      // Fetch today's MUSTs
      const today = new Date().toISOString().split('T')[0];
      const { data: mustsData, error: mustsError } = await supabase
        .from('daily_musts')
        .select('*')
        .eq('business_id', businessId)
        .eq('must_date', today);

      if (mustsError) throw mustsError;

      setTodos(todosData || []);
      setMusts(mustsData || []);
    } catch (err) {
      console.error('Error fetching todos:', err);
      setError(ERROR_MESSAGES.LOAD_FAILED);
      toast.error(ERROR_MESSAGES.LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // Initial fetch
  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // Set up real-time subscription
  useEffect(() => {
    const todoSubscription = supabase
      .channel(`todos-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todo_items',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          fetchTodos();
        }
      )
      .subscribe();

    const mustsSubscription = supabase
      .channel(`musts-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_musts',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          fetchTodos();
        }
      )
      .subscribe();

    return () => {
      todoSubscription.unsubscribe();
      mustsSubscription.unsubscribe();
    };
  }, [businessId, fetchTodos]);

  // Create a new todo
  const createTodo = useCallback(async (
    input: string | ParsedTask
  ): Promise<TodoItem | null> => {
    try {
      // Parse input if it's a string
      const parsed = typeof input === 'string' ? parseTaskInput(input) : input;
      
      // Prepare tags
      const tags: TodoTags = {
        created_via: 'quick-add'
      };
      
      // Add recurrence info if present
      if (parsed.recurrence_pattern) {
        tags.recurrence = {
          pattern: parsed.recurrence_pattern
        };
      }
      
      // Create todo object
      const newTodo: Partial<TodoItem> = {
        business_id: businessId,
        title: parsed.title,
        description: '',
        assigned_to: parsed.assigned_to || currentUserName,
        priority: parsed.priority ? PRIORITY_TO_DB[parsed.priority] : 'medium',
        status: 'pending',
        due_date: parsed.due_date,
        scheduled_date: parsed.scheduled_date,
        category: parsed.category || 'Other',
        effort_size: parsed.effort_size || null,
        is_published: true,
        created_by: userId,
        tags,
        order_index: 0
      };
      
      const { data, error } = await supabase
        .from('todo_items')
        .insert(newTodo)
        .select()
        .single();
      
      if (error) throw error;
      
      toast.success(SUCCESS_MESSAGES.TASK_CREATED);
      await fetchTodos();
      return data;
    } catch (err) {
      console.error('Error creating todo:', err);
      toast.error(ERROR_MESSAGES.SAVE_FAILED);
      return null;
    }
  }, [businessId, userId, currentUserName, fetchTodos]);

  // Update a todo
  const updateTodo = useCallback(async (
    id: string,
    updates: Partial<TodoItem>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .update(updates)
        .eq('id', id)
        .eq('business_id', businessId);
      
      if (error) throw error;
      
      toast.success(SUCCESS_MESSAGES.TASK_UPDATED);
      await fetchTodos();
      return true;
    } catch (err) {
      console.error('Error updating todo:', err);
      toast.error(ERROR_MESSAGES.SAVE_FAILED);
      return false;
    }
  }, [businessId, fetchTodos]);

  // Delete a todo
  const deleteTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('id', id)
        .eq('business_id', businessId);
      
      if (error) throw error;
      
      toast.success(SUCCESS_MESSAGES.TASK_DELETED);
      await fetchTodos();
      return true;
    } catch (err) {
      console.error('Error deleting todo:', err);
      toast.error(ERROR_MESSAGES.DELETE_FAILED);
      return false;
    }
  }, [businessId, fetchTodos]);

  // Complete a todo (handles recurring tasks)
  const completeTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Find the todo
      const todo = todos.find(t => t.id === id);
      if (!todo) return false;
      
      // Update to completed
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('todo_items')
        .update({
          status: 'completed',
          completed_at: now
        })
        .eq('id', id)
        .eq('business_id', businessId);
      
      if (updateError) throw updateError;
      
      // Check if it's a recurring task
      if (shouldTaskRecur(todo)) {
        const nextTask = createNextRecurrence(todo);
        if (nextTask) {
          const { error: createError } = await supabase
            .from('todo_items')
            .insert(nextTask);
          
          if (createError) {
            console.error('Error creating next recurrence:', createError);
          }
        }
      }
      
      toast.success('Task completed!');
      await fetchTodos();
      return true;
    } catch (err) {
      console.error('Error completing todo:', err);
      toast.error('Failed to complete task');
      return false;
    }
  }, [todos, businessId, fetchTodos]);

  // Select a todo as a MUST
  const selectMust = useCallback(async (
    todoId: string,
    level: 1 | 2
  ): Promise<boolean> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      console.log('Selecting MUST:', { todoId, level, today }); // Debug log
      
      // Check if already selected
      const existing = musts.find(m => m.todo_id === todoId && m.must_date === today);
      if (existing) {
        // Update level if different
        if (existing.must_level !== level) {
          console.log('Updating existing MUST level'); // Debug log
          const { error } = await supabase
            .from('daily_musts')
            .update({ must_level: level })
            .eq('id', existing.id);
          
          if (error) {
            console.error('Error updating MUST:', error); // Debug log
            throw error;
          }
        }
        await fetchTodos();
        return true;
      }
      
      // Check TOP 3 limit
      if (level === 2) {
        const topMusts = musts.filter(m => m.must_level === 2 && m.must_date === today);
        if (topMusts.length >= 3) {
          toast.error(ERROR_MESSAGES.MUST_LIMIT);
          return false;
        }
      }
      
      // Find the todo to get assignee name
      const todo = todos.find(t => t.id === todoId);
      if (!todo) {
        console.error('Todo not found:', todoId); // Debug log
        return false;
      }
      
      // Create new MUST with must_level
      const newMust = {
        business_id: businessId,
        user_name: todo.assigned_to || currentUserName,
        todo_id: todoId,
        must_date: today,
        must_level: level
      };
      
      console.log('Creating new MUST:', newMust); // Debug log
      
      const { data, error } = await supabase
        .from('daily_musts')
        .insert(newMust)
        .select();
      
      if (error) {
        console.error('Error creating MUST:', error); // Debug log
        throw error;
      }
      
      console.log('MUST created successfully:', data); // Debug log
      
      toast.success(SUCCESS_MESSAGES.MUST_SELECTED);
      await fetchTodos();
      return true;
    } catch (err) {
      console.error('Error selecting must:', err);
      toast.error('Failed to select MUST');
      return false;
    }
  }, [musts, todos, businessId, currentUserName, fetchTodos]);

  // Remove a MUST designation
  const removeMust = useCallback(async (todoId: string): Promise<boolean> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('daily_musts')
        .delete()
        .eq('todo_id', todoId)
        .eq('must_date', today)
        .eq('business_id', businessId);
      
      if (error) throw error;
      
      toast.success('MUST removed');
      await fetchTodos();
      return true;
    } catch (err) {
      console.error('Error removing must:', err);
      toast.error('Failed to remove MUST');
      return false;
    }
  }, [businessId, fetchTodos]);

  // Enhance todos with computed fields
  const enhancedTodos = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayMusts = musts.filter(m => m.must_date === today);
    
    return todos.map(todo => {
      // Check if it's a MUST
      const must = todayMusts.find(m => m.todo_id === todo.id);
      
      // Check if it's an open loop
      const isInProgress = todo.status === 'in-progress';
      const isPastDue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'completed';
      const wasYesterdayMust = musts.some(m => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return m.todo_id === todo.id && m.must_date === yesterdayStr;
      });
      
      const isOpenLoop = isInProgress || (isPastDue && wasYesterdayMust);
      
      // Calculate days in loop
      let daysInLoop = 0;
      if (isOpenLoop && todo.updated_at) {
        const updatedDate = new Date(todo.updated_at);
        const now = new Date();
        daysInLoop = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Get recurrence pattern
      const tags = todo.tags as TodoTags | null;
      const recurrencePattern = tags?.recurrence?.pattern;
      
      // Create enhanced todo
      const enhanced: EnhancedTodoItem = {
        ...todo,
        is_must: !!must,
        must_level: must?.must_level as 1 | 2 | undefined,
        is_open_loop: isOpenLoop,
        days_in_loop: daysInLoop,
        recurrence_pattern: recurrencePattern
      };
      
      return enhanced;
    });
  }, [todos, musts]);

  // Filter todos based on view mode
  const filteredTodos = useMemo(() => {
    if (viewMode === 'coach') {
      return enhancedTodos;
    }
    
    // Personal view - filter by assigned_to
    return enhancedTodos.filter(todo => 
      todo.assigned_to === currentUserName || 
      todo.created_by === userId
    );
  }, [enhancedTodos, viewMode, currentUserName, userId]);

  return {
    todos: filteredTodos,
    musts,
    loading,
    error,
    createTodo,
    updateTodo,
    deleteTodo,
    completeTodo,
    selectMust,
    removeMust,
    refreshTodos: fetchTodos
  };
}