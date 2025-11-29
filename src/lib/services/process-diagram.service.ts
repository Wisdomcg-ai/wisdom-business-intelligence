// ============================================================================
// PROCESS DIAGRAM SERVICE
// Handles all database operations for process diagrams
// Paste this into: src/lib/services/process-diagram.service.ts
// ============================================================================

import { supabase } from '@/lib/supabase/client';
import {
  ProcessDiagram,
  ProcessStep,
  ProcessFlow,
  ProcessPhase,
  ProcessDiagramComplete,
} from '@/types/process-diagram';

export class ProcessDiagramService {
  // CREATE OPERATIONS

  async createDiagram(
    clientId: string,
    data: Partial<ProcessDiagram>
  ): Promise<ProcessDiagram> {
    const { data: diagram, error } = await supabase
      .from('process_diagrams')
      .insert([
        {
          client_id: clientId,
          process_name: data.process_name,
          trigger_event: data.trigger_event,
          success_criteria: data.success_criteria,
          estimated_duration: data.estimated_duration,
          complexity_level: data.complexity_level,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return diagram;
  }

  async createStep(step: Partial<ProcessStep>): Promise<ProcessStep> {
    const { data, error } = await supabase
      .from('process_steps')
      .insert([step])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createFlow(flow: Partial<ProcessFlow>): Promise<ProcessFlow> {
    const { data, error } = await supabase
      .from('process_flows')
      .insert([flow])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createPhase(phase: Partial<ProcessPhase>): Promise<ProcessPhase> {
    const { data, error } = await supabase
      .from('process_phases')
      .insert([phase])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // READ OPERATIONS

  async getComplete(processId: string): Promise<ProcessDiagramComplete> {
    const [diagram, steps, flows, phases] = await Promise.all([
      this.getDiagram(processId),
      this.getSteps(processId),
      this.getFlows(processId),
      this.getPhases(processId),
    ]);

    return { diagram, steps, flows, phases };
  }

  async getDiagram(processId: string): Promise<ProcessDiagram> {
    const { data, error } = await supabase
      .from('process_diagrams')
      .select('*')
      .eq('id', processId)
      .single();

    if (error) throw error;
    return data;
  }

  async getSteps(processId: string): Promise<ProcessStep[]> {
    const { data, error } = await supabase
      .from('process_steps')
      .select('*')
      .eq('process_id', processId)
      .order('order_num', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getFlows(processId: string): Promise<ProcessFlow[]> {
    const { data, error } = await supabase
      .from('process_flows')
      .select('*')
      .eq('process_id', processId);

    if (error) throw error;
    return data || [];
  }

  async getPhases(processId: string): Promise<ProcessPhase[]> {
    const { data, error } = await supabase
      .from('process_phases')
      .select('*')
      .eq('process_id', processId)
      .order('phase_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getStep(stepId: string): Promise<ProcessStep> {
    const { data, error } = await supabase
      .from('process_steps')
      .select('*')
      .eq('id', stepId)
      .single();

    if (error) throw error;
    return data;
  }

  async getFlow(flowId: string): Promise<ProcessFlow> {
    const { data, error } = await supabase
      .from('process_flows')
      .select('*')
      .eq('id', flowId)
      .single();

    if (error) throw error;
    return data;
  }

  // UPDATE OPERATIONS

  async updateDiagram(
    processId: string,
    updates: Partial<ProcessDiagram>
  ): Promise<ProcessDiagram> {
    const { data, error } = await supabase
      .from('process_diagrams')
      .update(updates)
      .eq('id', processId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateStep(
    stepId: string,
    updates: Partial<ProcessStep>
  ): Promise<ProcessStep> {
    const { data, error } = await supabase
      .from('process_steps')
      .update(updates)
      .eq('id', stepId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateFlow(
    flowId: string,
    updates: Partial<ProcessFlow>
  ): Promise<ProcessFlow> {
    const { data, error } = await supabase
      .from('process_flows')
      .update(updates)
      .eq('id', flowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // DELETE OPERATIONS

  async deleteStep(stepId: string): Promise<void> {
    const { error } = await supabase
      .from('process_steps')
      .delete()
      .eq('id', stepId);

    if (error) throw error;
  }

  async deleteFlow(flowId: string): Promise<void> {
    const { error } = await supabase
      .from('process_flows')
      .delete()
      .eq('id', flowId);

    if (error) throw error;
  }

  async deletePhase(phaseId: string): Promise<void> {
    const { error } = await supabase
      .from('process_phases')
      .delete()
      .eq('id', phaseId);

    if (error) throw error;
  }

  async deleteDiagram(processId: string): Promise<void> {
    const { error } = await supabase
      .from('process_diagrams')
      .delete()
      .eq('id', processId);

    if (error) throw error;
  }
}

// Singleton instance - use this throughout your app
export const processDiagramService = new ProcessDiagramService();