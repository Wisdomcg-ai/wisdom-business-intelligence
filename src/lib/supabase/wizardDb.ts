// ============================================
// WIZARD DATABASE FUNCTIONS
// All Supabase operations for the wizard
// ============================================

import { createClient } from '@/lib/supabase/client';
import { ProcessDiagram, ProcessStep, ProcessDecision } from '@/lib/types/processWizard';

/**
 * Create a new process diagram in Supabase
 */
export async function createProcessDiagram(name: string, trigger: string) {
  const supabase = createClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('process_diagrams')
    .insert({
      client_id: user.id,
      name: name,
      description: `Triggered by: ${trigger}`,
      status: 'draft',
      step_count: 0,
      decision_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProcessDiagram;
}

/**
 * Add a step to the process
 */
export async function addProcessStep(
  processId: string,
  order: number,
  title: string,
  role: string = '',
  type: 'action' | 'decision' = 'action',
  documents: string = 'N/A',
  systems: string = 'N/A',
  amount: string = 'N/A',
  timing: string = 'N/A'
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('process_steps')
    .insert({
      process_id: processId,
      order_num: order,
      action: title,
      description: type === 'decision' ? 'Type: decision' : null,
      primary_owner: role || null,
      department: role || null,
      estimated_duration: timing !== 'N/A' ? timing : null,
      outputs: documents !== 'N/A' ? [documents] : [],
      systems: systems !== 'N/A' ? [systems] : [],
      payments: amount !== 'N/A' ? [{ amount }] : [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProcessStep;
}

/**
 * Create a decision with branches
 */
export async function createDecision(
  processId: string,
  afterStepId: string,
  decisionQuestion: string,
  yesBranchTitle: string,
  noBranchTitle: string
) {
  const supabase = createClient();

  const branches = [
    {
      outcome: 'Yes',
      next_step_title: yesBranchTitle,
    },
    {
      outcome: 'No',
      next_step_title: noBranchTitle,
    },
  ];

  const { data, error } = await supabase
    .from('process_decisions')
    .insert({
      process_id: processId,
      after_step_id: afterStepId,
      decision_question: decisionQuestion,
      decision_type: 'yes_no',
      branches: branches,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProcessDecision;
}

/**
 * Update a step
 */
export async function updateProcessStep(
  stepId: string,
  updates: {
    action?: string;
    primary_owner?: string;
    department?: string;
    estimated_duration?: string;
    outputs?: any;
    systems?: any;
    payments?: any;
  }
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('process_steps')
    .update(updates)
    .eq('id', stepId)
    .select()
    .single();

  if (error) throw error;
  return data as ProcessStep;
}

/**
 * Delete a step
 */
export async function deleteProcessStep(stepId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('process_steps')
    .delete()
    .eq('id', stepId);

  if (error) throw error;
}

/**
 * Load process with all steps
 */
export async function loadProcess(processId: string) {
  const supabase = createClient();

  const { data: diagram, error: diagramError } = await supabase
    .from('process_diagrams')
    .select('*')
    .eq('id', processId)
    .single();

  if (diagramError) throw diagramError;

  const { data: steps, error: stepsError } = await supabase
    .from('process_steps')
    .select('*')
    .eq('process_id', processId)
    .order('order_num', { ascending: true });

  if (stepsError) throw stepsError;

  return {
    diagram: diagram as ProcessDiagram,
    steps: steps as ProcessStep[],
  };
}

/**
 * Load all processes for current user
 */
export async function loadUserProcesses() {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('process_diagrams')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ProcessDiagram[];
}