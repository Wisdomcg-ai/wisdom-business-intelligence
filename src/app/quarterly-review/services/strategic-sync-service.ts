// Strategic Sync Service
// Two-way sync: quarterly review decisions → strategic plan tables
// Wraps StrategicPlanningService to write changes back to source-of-truth tables

'use client';

import { createClient } from '@/lib/supabase/client';
import { StrategicPlanningService } from '@/app/goals/services/strategic-planning-service';
import type { StrategicInitiative } from '@/app/goals/types';
import type { InitiativeDecision, Rock, QuarterlyTargets } from '../types';

type StepType = 'q1' | 'q2' | 'q3' | 'q4' | 'sprint';

export class StrategicSyncService {
  private getSupabase() {
    return createClient();
  }

  /**
   * Map a quarter key like 'q2-2026' to a step_type like 'q2'
   */
  private quarterKeyToStepType(quarterKey: string): StepType | null {
    const match = quarterKey.match(/^q(\d)/i);
    if (!match) return null;
    const num = parseInt(match[1]);
    if (num >= 1 && num <= 4) return `q${num}` as StepType;
    return null;
  }

  /**
   * Map review InitiativeDecision → Goals Wizard StrategicInitiative
   */
  private mapDecisionToInitiative(decision: InitiativeDecision): StrategicInitiative {
    // Map review decision to initiative status
    let status: 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold' = 'in_progress';
    if (decision.decision === 'kill') status = 'cancelled';
    if (decision.decision === 'defer') status = 'on_hold';
    if (decision.currentStatus === 'not_started') status = 'not_started';
    if (decision.decision === 'keep' || decision.decision === 'accelerate') {
      status = decision.currentStatus === 'not_started' ? 'not_started' : 'in_progress';
    }

    // Map quarter assignment
    let quarterAssigned: 'Q1' | 'Q2' | 'Q3' | 'Q4' | undefined;
    if (decision.quarterAssigned) {
      const match = decision.quarterAssigned.match(/q(\d)/i);
      if (match) quarterAssigned = `Q${match[1]}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
    }

    return {
      id: decision.initiativeId,
      title: decision.title,
      category: (decision.category || 'misc') as StrategicInitiative['category'],
      source: 'strategic_ideas',
      status,
      progressPercentage: decision.progressPercentage || 0,
      notes: decision.notes || undefined,
      quarterAssigned,
      selected: true,
    };
  }

  /**
   * Sync initiative decisions back to strategic_initiatives table
   * Groups decisions by quarter and saves each group with the appropriate step_type
   */
  async syncInitiativeChanges(
    businessId: string,
    userId: string,
    decisions: InitiativeDecision[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Group decisions by quarter
      const byQuarter = new Map<string, InitiativeDecision[]>();

      for (const decision of decisions) {
        const qKey = decision.quarterAssigned || 'unassigned';
        const stepType = this.quarterKeyToStepType(qKey);
        if (!stepType) continue; // Skip unassigned

        if (!byQuarter.has(stepType)) {
          byQuarter.set(stepType, []);
        }
        byQuarter.get(stepType)!.push(decision);
      }

      // Save each quarter's initiatives
      for (const [stepType, quarterDecisions] of byQuarter) {
        const initiatives = quarterDecisions.map(d => this.mapDecisionToInitiative(d));
        const result = await StrategicPlanningService.saveInitiatives(
          businessId,
          userId,
          initiatives,
          stepType as StepType
        );

        if (!result.success) {
          console.error(`[StrategicSync] Failed to sync ${stepType}:`, result.error);
          return { success: false, error: `Failed to sync ${stepType}: ${result.error}` };
        }
      }

      console.log('[StrategicSync] Successfully synced initiative decisions');
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing initiative changes:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync new initiatives created during the review into strategic_initiatives
   */
  async syncNewInitiatives(
    businessId: string,
    userId: string,
    newInitiatives: Array<{ title: string; category: string; quarterAssigned?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (newInitiatives.length === 0) return { success: true };

      // Group by quarter
      const byQuarter = new Map<string, StrategicInitiative[]>();

      for (const init of newInitiatives) {
        const stepType = init.quarterAssigned
          ? this.quarterKeyToStepType(init.quarterAssigned)
          : 'q1';
        if (!stepType) continue;

        if (!byQuarter.has(stepType)) {
          byQuarter.set(stepType, []);
        }

        byQuarter.get(stepType)!.push({
          id: `new-${Date.now()}-${Math.random()}`,
          title: init.title,
          category: (init.category || 'misc') as StrategicInitiative['category'],
          source: 'strategic_ideas',
          status: 'not_started',
          selected: true,
        });
      }

      for (const [stepType, initiatives] of byQuarter) {
        // Load existing to merge
        const existing = await StrategicPlanningService.loadInitiatives(businessId, stepType as StepType);
        const merged = [...existing, ...initiatives];

        const result = await StrategicPlanningService.saveInitiatives(
          businessId,
          userId,
          merged,
          stepType as StepType
        );

        if (!result.success) {
          return { success: false, error: `Failed to sync new initiatives: ${result.error}` };
        }
      }

      console.log('[StrategicSync] Successfully synced new initiatives');
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing new initiatives:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync quarterly targets to business_financial_goals.quarterly_targets
   */
  async syncQuarterlyTargets(
    businessId: string,
    quarterlyTargets: QuarterlyTargets,
    quarterKey: string // e.g., 'q1', 'Q2'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = this.getSupabase();
      const qKey = quarterKey.toLowerCase().replace('-', '') as 'q1' | 'q2' | 'q3' | 'q4';

      // Load existing financial goals
      const { data: goals, error: fetchError } = await supabase
        .from('business_financial_goals')
        .select('id, quarterly_targets')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('[StrategicSync] Error fetching financial goals:', fetchError);
        return { success: false, error: fetchError.message };
      }

      if (!goals) {
        console.warn('[StrategicSync] No financial goals found for business');
        return { success: true }; // Not an error, just no goals to update
      }

      // Parse existing quarterly targets
      const existingTargets = (typeof goals.quarterly_targets === 'string'
        ? JSON.parse(goals.quarterly_targets)
        : goals.quarterly_targets) || {};

      // Update the specific quarter
      const updatedTargets = {
        ...existingTargets,
        revenue: {
          ...(existingTargets.revenue || {}),
          [qKey]: String(quarterlyTargets.revenue),
        },
        grossProfit: {
          ...(existingTargets.grossProfit || {}),
          [qKey]: String(quarterlyTargets.grossProfit),
        },
        netProfit: {
          ...(existingTargets.netProfit || {}),
          [qKey]: String(quarterlyTargets.netProfit),
        },
      };

      const { error: updateError } = await supabase
        .from('business_financial_goals')
        .update({ quarterly_targets: updatedTargets })
        .eq('id', goals.id);

      if (updateError) {
        console.error('[StrategicSync] Error updating quarterly targets:', updateError);
        return { success: false, error: updateError.message };
      }

      console.log(`[StrategicSync] Successfully synced quarterly targets for ${qKey}`);
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing quarterly targets:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync rocks to strategic_initiatives with step_type: 'sprint'
   */
  async syncRocks(
    businessId: string,
    userId: string,
    rocks: Rock[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (rocks.length === 0) return { success: true };

      const initiatives: StrategicInitiative[] = rocks.map((rock, index) => ({
        id: rock.id,
        title: rock.title,
        description: rock.description,
        source: 'strategic_ideas' as const,
        category: 'misc' as StrategicInitiative['category'],
        assignedTo: rock.owner,
        notes: rock.notes,
        selected: true,
        order: index,
        // Extended fields mapped from Rock
        outcome: rock.successCriteria,
        endDate: rock.targetDate,
        linkedKPIs: rock.linkedKPIs,
      }));

      const result = await StrategicPlanningService.saveInitiatives(
        businessId,
        userId,
        initiatives,
        'sprint'
      );

      if (!result.success) {
        return { success: false, error: `Failed to sync rocks: ${result.error}` };
      }

      console.log('[StrategicSync] Successfully synced rocks to sprint initiatives');
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing rocks:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync all review data to strategic plan tables (safety net on workshop complete)
   */
  async syncAll(
    businessId: string,
    userId: string,
    decisions: InitiativeDecision[],
    quarterlyTargets: QuarterlyTargets,
    quarterKey: string,
    rocks: Rock[],
    newInitiatives: Array<{ title: string; category: string; quarterAssigned?: string }>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Sync initiative decisions
    const decisionsResult = await this.syncInitiativeChanges(businessId, userId, decisions);
    if (!decisionsResult.success && decisionsResult.error) {
      errors.push(decisionsResult.error);
    }

    // Sync quarterly targets
    const targetsResult = await this.syncQuarterlyTargets(businessId, quarterlyTargets, quarterKey);
    if (!targetsResult.success && targetsResult.error) {
      errors.push(targetsResult.error);
    }

    // Sync rocks
    const rocksResult = await this.syncRocks(businessId, userId, rocks);
    if (!rocksResult.success && rocksResult.error) {
      errors.push(rocksResult.error);
    }

    // Sync new initiatives
    if (newInitiatives.length > 0) {
      const newResult = await this.syncNewInitiatives(businessId, userId, newInitiatives);
      if (!newResult.success && newResult.error) {
        errors.push(newResult.error);
      }
    }

    return { success: errors.length === 0, errors };
  }
}

export const strategicSyncService = new StrategicSyncService();
