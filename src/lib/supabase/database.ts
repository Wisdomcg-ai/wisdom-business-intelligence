'use client';

import { createClient } from './client';
import {
  ProcessDiagram,
  ProcessStep,
  ProcessDecision,
  ConversationTurn,
  CoachSuggestion,
} from '@/types/wizard';

// Get singleton instance
const supabase = createClient();

// ========================================
// TYPE DEFINITIONS FOR RESPONSES
// ========================================

interface DbResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface DbListResponse<T> {
  success: boolean;
  data?: T[];
  error?: string;
}

// ========================================
// PROCESS DIAGRAMS - CRUD Operations
// ========================================

/**
 * Create a new process diagram
 */
export async function createProcessDiagram(data: {
  name: string;
  description?: string;
  profitCenter?: string;
  industry?: string;
}): Promise<DbResponse<ProcessDiagram>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: process, error } = await supabase
      .from('process_diagrams')
      .insert([
        {
          client_id: user.id,
          name: data.name,
          description: data.description || null,
          profit_center: data.profitCenter || null,
          industry: data.industry || null,
          status: 'draft',
          conversation_method: 'ai',
          conversation_status: 'in_progress',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating process:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: process as ProcessDiagram };
  } catch (err) {
    console.error('Error creating process:', err);
    return { success: false, error: 'Failed to create process' };
  }
}

/**
 * Get a single process diagram by ID
 */
export async function getProcessDiagram(
  processId: string
): Promise<DbResponse<ProcessDiagram>> {
  try {
    const { data: process, error } = await supabase
      .from('process_diagrams')
      .select('*')
      .eq('id', processId)
      .single();

    if (error) {
      console.error('Error fetching process:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: process as ProcessDiagram };
  } catch (err) {
    console.error('Error fetching process:', err);
    return { success: false, error: 'Failed to fetch process' };
  }
}

/**
 * Get all processes for the current user (client)
 */
export async function getClientProcesses(): Promise<DbListResponse<ProcessDiagram>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: processes, error } = await supabase
      .from('process_diagrams')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching processes:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: processes as ProcessDiagram[] };
  } catch (err) {
    console.error('Error fetching processes:', err);
    return { success: false, error: 'Failed to fetch processes' };
  }
}

/**
 * Update a process diagram
 */
export async function updateProcessDiagram(
  processId: string,
  updates: Partial<ProcessDiagram>
): Promise<DbResponse<ProcessDiagram>> {
  try {
    const { data: process, error } = await supabase
      .from('process_diagrams')
      .update(updates)
      .eq('id', processId)
      .select()
      .single();

    if (error) {
      console.error('Error updating process:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: process as ProcessDiagram };
  } catch (err) {
    console.error('Error updating process:', err);
    return { success: false, error: 'Failed to update process' };
  }
}

/**
 * Mark process as published
 */
export async function publishProcess(processId: string): Promise<DbResponse<ProcessDiagram>> {
  try {
    const { data: process, error } = await supabase
      .from('process_diagrams')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        conversation_status: 'complete',
      })
      .eq('id', processId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: process as ProcessDiagram };
  } catch (err) {
    console.error('Error publishing process:', err);
    return { success: false, error: 'Failed to publish process' };
  }
}

// ========================================
// PROCESS STEPS - CRUD Operations
// ========================================

/**
 * Create a new process step
 */
export async function createProcessStep(data: {
  processId: string;
  orderNum: number;
  action: string;
  description?: string;
  primaryOwner?: string;
  department?: string;
  estimatedDuration?: string;
  outputs?: any[];
  systems?: any[];
}): Promise<DbResponse<ProcessStep>> {
  try {
    const { data: step, error } = await supabase
      .from('process_steps')
      .insert([
        {
          process_id: data.processId,
          order_num: data.orderNum,
          action: data.action,
          description: data.description || null,
          primary_owner: data.primaryOwner || null,
          department: data.department || null,
          estimated_duration: data.estimatedDuration || null,
          outputs: data.outputs || [],
          systems: data.systems || [],
          payments: [],
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating step:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: step as ProcessStep };
  } catch (err) {
    console.error('Error creating step:', err);
    return { success: false, error: 'Failed to create step' };
  }
}

/**
 * Get all steps for a process
 */
export async function getProcessSteps(
  processId: string
): Promise<DbListResponse<ProcessStep>> {
  try {
    const { data: steps, error } = await supabase
      .from('process_steps')
      .select('*')
      .eq('process_id', processId)
      .order('order_num', { ascending: true });

    if (error) {
      console.error('Error fetching steps:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: steps as ProcessStep[] };
  } catch (err) {
    console.error('Error fetching steps:', err);
    return { success: false, error: 'Failed to fetch steps' };
  }
}

/**
 * Get a single step
 */
export async function getProcessStep(stepId: string): Promise<DbResponse<ProcessStep>> {
  try {
    const { data: step, error } = await supabase
      .from('process_steps')
      .select('*')
      .eq('id', stepId)
      .single();

    if (error) {
      console.error('Error fetching step:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: step as ProcessStep };
  } catch (err) {
    console.error('Error fetching step:', err);
    return { success: false, error: 'Failed to fetch step' };
  }
}

/**
 * Update a process step
 */
export async function updateProcessStep(
  stepId: string,
  updates: Partial<ProcessStep>
): Promise<DbResponse<ProcessStep>> {
  try {
    const { data: step, error } = await supabase
      .from('process_steps')
      .update(updates)
      .eq('id', stepId)
      .select()
      .single();

    if (error) {
      console.error('Error updating step:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: step as ProcessStep };
  } catch (err) {
    console.error('Error updating step:', err);
    return { success: false, error: 'Failed to update step' };
  }
}

/**
 * Delete a process step
 */
export async function deleteProcessStep(stepId: string): Promise<DbResponse<void>> {
  try {
    const { error } = await supabase.from('process_steps').delete().eq('id', stepId);

    if (error) {
      console.error('Error deleting step:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error deleting step:', err);
    return { success: false, error: 'Failed to delete step' };
  }
}

// ========================================
// PROCESS DECISIONS - CRUD Operations
// ========================================

/**
 * Create a decision (branch point)
 */
export async function createProcessDecision(data: {
  processId: string;
  afterStepId: string;
  decisionQuestion: string;
  branches: Array<{
    outcome: string;
    description: string;
    nextStepId?: string;
    nextStepOrder?: number;
  }>;
}): Promise<DbResponse<ProcessDecision>> {
  try {
    const { data: decision, error } = await supabase
      .from('process_decisions')
      .insert([
        {
          process_id: data.processId,
          after_step_id: data.afterStepId,
          decision_question: data.decisionQuestion,
          decision_type: 'yes_no',
          branches: data.branches,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating decision:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: decision as ProcessDecision };
  } catch (err) {
    console.error('Error creating decision:', err);
    return { success: false, error: 'Failed to create decision' };
  }
}

/**
 * Get all decisions for a process
 */
export async function getProcessDecisions(
  processId: string
): Promise<DbListResponse<ProcessDecision>> {
  try {
    const { data: decisions, error } = await supabase
      .from('process_decisions')
      .select('*')
      .eq('process_id', processId);

    if (error) {
      console.error('Error fetching decisions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: decisions as ProcessDecision[] };
  } catch (err) {
    console.error('Error fetching decisions:', err);
    return { success: false, error: 'Failed to fetch decisions' };
  }
}

/**
 * Get decisions for a specific step
 */
export async function getStepDecisions(
  stepId: string
): Promise<DbListResponse<ProcessDecision>> {
  try {
    const { data: decisions, error } = await supabase
      .from('process_decisions')
      .select('*')
      .eq('after_step_id', stepId);

    if (error) {
      console.error('Error fetching step decisions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: decisions as ProcessDecision[] };
  } catch (err) {
    console.error('Error fetching step decisions:', err);
    return { success: false, error: 'Failed to fetch step decisions' };
  }
}

// ========================================
// CONVERSATION HISTORY
// ========================================

/**
 * Add a conversation turn
 */
export async function addConversationTurn(data: {
  processId: string;
  turnNumber: number;
  role: 'system' | 'user';
  message: string;
  parsedData?: any;
  confidence?: number;
}): Promise<DbResponse<ConversationTurn>> {
  try {
    const { data: turn, error } = await supabase
      .from('conversation_history')
      .insert([
        {
          process_id: data.processId,
          turn_number: data.turnNumber,
          role: data.role,
          message: data.message,
          parsed_data: data.parsedData || {},
          confidence: data.confidence || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error adding conversation turn:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: turn as ConversationTurn };
  } catch (err) {
    console.error('Error adding conversation turn:', err);
    return { success: false, error: 'Failed to add conversation' };
  }
}

/**
 * Get conversation history for a process
 */
export async function getConversationHistory(
  processId: string
): Promise<DbListResponse<ConversationTurn>> {
  try {
    const { data: history, error } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('process_id', processId)
      .order('turn_number', { ascending: true });

    if (error) {
      console.error('Error fetching conversation history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: history as ConversationTurn[] };
  } catch (err) {
    console.error('Error fetching conversation history:', err);
    return { success: false, error: 'Failed to fetch conversation' };
  }
}

// ========================================
// COACH SUGGESTIONS
// ========================================

/**
 * Create a coaching suggestion
 */
export async function createSuggestion(data: {
  processId: string;
  stepId?: string;
  suggestionType: 'bottleneck' | 'risk' | 'automation' | 'handoff' | 'documentation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  text: string;
  recommendedAction?: string;
}): Promise<DbResponse<CoachSuggestion>> {
  try {
    const { data: suggestion, error } = await supabase
      .from('coach_suggestions')
      .insert([
        {
          process_id: data.processId,
          step_id: data.stepId || null,
          suggestion_type: data.suggestionType,
          priority: data.priority,
          suggestion_title: data.title,
          suggestion_text: data.text,
          recommended_action: data.recommendedAction || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating suggestion:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: suggestion as CoachSuggestion };
  } catch (err) {
    console.error('Error creating suggestion:', err);
    return { success: false, error: 'Failed to create suggestion' };
  }
}

/**
 * Get suggestions for a process
 */
export async function getSuggestions(
  processId: string
): Promise<DbListResponse<CoachSuggestion>> {
  try {
    const { data: suggestions, error } = await supabase
      .from('coach_suggestions')
      .select('*')
      .eq('process_id', processId)
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error fetching suggestions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: suggestions as CoachSuggestion[] };
  } catch (err) {
    console.error('Error fetching suggestions:', err);
    return { success: false, error: 'Failed to fetch suggestions' };
  }
}

/**
 * Mark suggestion as implemented
 */
export async function implementSuggestion(
  suggestionId: string
): Promise<DbResponse<CoachSuggestion>> {
  try {
    const { data: suggestion, error } = await supabase
      .from('coach_suggestions')
      .update({ implemented: true })
      .eq('id', suggestionId)
      .select()
      .single();

    if (error) {
      console.error('Error implementing suggestion:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: suggestion as CoachSuggestion };
  } catch (err) {
    console.error('Error implementing suggestion:', err);
    return { success: false, error: 'Failed to implement suggestion' };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Complete the process unpacking phase
 */
export async function completeProcessUnpacking(
  processId: string,
  totalTimeMinutes: number
): Promise<DbResponse<void>> {
  try {
    const { error } = await supabase
      .from('process_diagrams')
      .update({
        conversation_status: 'complete',
        total_time_minutes: totalTimeMinutes,
      })
      .eq('id', processId);

    if (error) {
      console.error('Error completing process:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error completing process:', err);
    return { success: false, error: 'Failed to complete process' };
  }
}

/**
 * Save diagram data
 */
export async function saveDiagramData(
  processId: string,
  diagramData: any
): Promise<DbResponse<void>> {
  try {
    const { error } = await supabase
      .from('process_diagrams')
      .update({
        diagram_data: diagramData,
      })
      .eq('id', processId);

    if (error) {
      console.error('Error saving diagram:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error saving diagram:', err);
    return { success: false, error: 'Failed to save diagram' };
  }
}