// Strategic Sync Service
// Two-way sync: quarterly review decisions → strategic plan tables
// Wraps StrategicPlanningService to write changes back to source-of-truth tables

'use client';

import { createClient } from '@/lib/supabase/client';
import { StrategicPlanningService } from '@/app/goals/services/strategic-planning-service';
import { getQuarterForMonth, startMonthFromYearType } from '@/lib/utils/fiscal-year-utils';
import type { StrategicInitiative, InitiativeStatus } from '@/app/goals/types';
import type { InitiativeDecision, Rock, QuarterlyTargets, RealignmentData, NextYearTargets, AnnualInitiativePlan } from '../types';

type StepType = 'q1' | 'q2' | 'q3' | 'q4' | 'sprint' | 'current_remainder';

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
    let status: InitiativeStatus = 'in_progress';
    if (decision.decision === 'kill') status = 'cancelled';
    if (decision.decision === 'defer') status = 'deferred';
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
   * UPDATE-ONLY: updates status/notes on existing initiatives, never deletes or creates
   * This prevents accidental data loss from the destructive saveInitiatives() call
   */
  async syncInitiativeChanges(
    businessId: string,
    userId: string,
    decisions: InitiativeDecision[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = this.getSupabase();

      for (const decision of decisions) {
        // Skip user-added initiatives (not in DB)
        if (decision.initiativeId.startsWith('new-')) continue;

        // Map decision to DB status
        let status: string = 'in_progress';
        if (decision.decision === 'kill') status = 'cancelled';
        if (decision.decision === 'defer') status = 'deferred';
        // If keep/accelerate on a not_started initiative assigned to a future quarter, mark as planned
        if ((decision.decision === 'keep' || decision.decision === 'accelerate') && decision.currentStatus === 'not_started' && decision.quarterAssigned) {
          status = 'planned';
        }

        // Update only — never delete
        await supabase
          .from('strategic_initiatives')
          .update({
            status,
            notes: decision.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decision.initiativeId)
          .eq('business_id', businessId);
      }

      console.log('[StrategicSync] Successfully synced initiative decisions (update-only)');
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

      // Load existing financial goals — try multiple IDs to handle different storage patterns
      let goals: any = null;
      let fetchError: any = null;

      // Try the provided businessId first
      const { data: goalsData, error: err1 } = await supabase
        .from('business_financial_goals')
        .select('id, quarterly_targets')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalsData) {
        goals = goalsData;
        console.log('[StrategicSync] Found financial goals with businessId:', businessId);
      } else {
        // Try looking up via user_id (fallback for legacy data)
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id !== businessId) {
          const { data: fallbackData } = await supabase
            .from('business_financial_goals')
            .select('id, quarterly_targets')
            .eq('business_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackData) {
            goals = fallbackData;
            console.log('[StrategicSync] Found financial goals with user.id fallback:', user.id);
          }
        }
        // Try business_profile_id column (legacy)
        if (!goals) {
          const { data: legacyData } = await supabase
            .from('business_financial_goals')
            .select('id, quarterly_targets')
            .eq('business_profile_id', businessId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacyData) {
            goals = legacyData;
            console.log('[StrategicSync] Found financial goals with legacy business_profile_id:', businessId);
          }
        }
      }

      if (err1 && !goals) {
        console.error('[StrategicSync] Error fetching financial goals:', err1);
        return { success: false, error: err1.message };
      }

      if (!goals) {
        console.warn('[StrategicSync] No financial goals found for business (tried multiple IDs)');
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
   * Sync realigned annual targets back to business_financial_goals
   * Only writes if the user chose 'adjust_targets' and provided adjustedTargets
   */
  async syncRealignedTargets(
    businessId: string,
    realignmentData?: RealignmentData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!realignmentData || realignmentData.choice !== 'adjust_targets' || !realignmentData.adjustedTargets) {
        return { success: true }; // Nothing to sync
      }

      const supabase = this.getSupabase();
      const adjusted = realignmentData.adjustedTargets;

      // Find the financial goals row (same fallback logic as syncQuarterlyTargets)
      let goalsId: string | null = null;

      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('id')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      goalsId = goalsData?.id || null;

      if (!goalsId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id !== businessId) {
          const { data: fallback } = await supabase
            .from('business_financial_goals')
            .select('id')
            .eq('business_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          goalsId = fallback?.id || null;
        }
      }

      if (!goalsId) {
        console.warn('[StrategicSync] No financial goals found to update with realigned targets');
        return { success: true };
      }

      const { error } = await supabase
        .from('business_financial_goals')
        .update({
          revenue_year1: adjusted.revenue,
          gross_profit_year1: adjusted.grossProfit,
          net_profit_year1: adjusted.netProfit,
        })
        .eq('id', goalsId);

      if (error) {
        console.error('[StrategicSync] Error updating realigned targets:', error);
        return { success: false, error: error.message };
      }

      console.log('[StrategicSync] Successfully synced realigned annual targets');
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing realigned targets:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync rocks to strategic_initiatives with the correct quarter step_type.
   * Uses UPDATE-only for existing rows + INSERT for new rocks.
   * NEVER deletes existing initiatives — rocks coexist with Goals Wizard data.
   */
  async syncRocks(
    businessId: string,
    userId: string,
    rocks: Rock[],
    quarterKey?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (rocks.length === 0) return { success: true };

      const supabase = this.getSupabase();
      // Determine step_type: use quarter key if provided, fall back to 'sprint'
      const stepType: StepType = (quarterKey ? this.quarterKeyToStepType(quarterKey) : null) || 'sprint';

      const isValidUUID = (id: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let updatedCount = 0;
      let insertedCount = 0;

      for (const [index, rock] of rocks.entries()) {
        const baseData = {
          title: rock.title || 'Untitled Rock',
          description: rock.description || null,
          notes: rock.notes || null,
          assigned_to: rock.owner || null,
          selected: true,
          order_index: index,
          outcome: rock.successCriteria || null,
          end_date: rock.targetDate || null,
          linked_kpis: rock.linkedKPIs ? JSON.stringify(rock.linkedKPIs) : null,
          source: 'quarterly_review' as const,
          step_type: stepType,
          updated_at: new Date().toISOString(),
        };

        if (rock.id && isValidUUID(rock.id)) {
          // UPDATE existing row — don't change step_type if it already exists elsewhere
          const { error } = await supabase
            .from('strategic_initiatives')
            .update(baseData)
            .eq('id', rock.id)
            .eq('business_id', businessId);
          if (!error) updatedCount++;
          else console.warn(`[StrategicSync] Failed to update rock ${rock.id}:`, error.message);
        } else {
          // INSERT new rock
          const { error } = await supabase
            .from('strategic_initiatives')
            .insert({
              ...baseData,
              business_id: businessId,
              user_id: userId,
              category: 'misc',
              idea_type: 'strategic',
            });
          if (!error) insertedCount++;
          else console.warn(`[StrategicSync] Failed to insert rock:`, error.message);
        }
      }

      console.log(`[StrategicSync] Synced rocks to ${stepType}: ${updatedCount} updated, ${insertedCount} inserted`);
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing rocks:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Sync sprint planning data from initiative decisions to their quarter rows.
   * When quarterly review Step 4.3 adds sprint data (tasks, milestones, assignedTo, outcome)
   * to keep/accelerate decisions, this writes those fields to the matching
   * strategic_initiatives row for the correct quarter (step_type = 'q1'/'q2'/etc.).
   * UPDATE-only — never creates or deletes rows.
   */
  async syncSprintPlanningToQuarter(
    businessId: string,
    decisions: InitiativeDecision[],
    quarterKey: string // e.g., 'q1', 'q2'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = this.getSupabase();
      const qKey = quarterKey.toLowerCase().replace(/[^q1234]/g, '') as 'q1' | 'q2' | 'q3' | 'q4';
      let updatedCount = 0;

      for (const decision of decisions) {
        // Only sync keep/accelerate decisions that have sprint planning data
        if (decision.decision !== 'keep' && decision.decision !== 'accelerate') continue;
        if (decision.initiativeId.startsWith('new-')) continue;

        // Check if there's any sprint data to sync
        const hasSprintData = decision.assignedTo || decision.why || decision.outcome ||
          decision.startDate || decision.endDate || decision.totalHours ||
          (decision.tasks && decision.tasks.length > 0) ||
          (decision.milestones && decision.milestones.length > 0);

        if (!hasSprintData) continue;

        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        if (decision.assignedTo) updatePayload.assigned_to = decision.assignedTo;
        if (decision.why) updatePayload.why = decision.why;
        if (decision.outcome) updatePayload.outcome = decision.outcome;
        if (decision.startDate) updatePayload.start_date = decision.startDate;
        if (decision.endDate) updatePayload.end_date = decision.endDate;
        if (decision.totalHours != null) updatePayload.total_hours = decision.totalHours;
        if (decision.tasks) updatePayload.tasks = decision.tasks;
        if (decision.milestones) updatePayload.milestones = decision.milestones;

        // Update the initiative row in the quarter's step_type
        const { error } = await supabase
          .from('strategic_initiatives')
          .update(updatePayload)
          .eq('id', decision.initiativeId)
          .eq('business_id', businessId);

        if (!error) updatedCount++;
      }

      console.log(`[StrategicSync] Synced sprint planning for ${updatedCount} initiatives to ${qKey}`);
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing sprint planning to quarter:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Resolve the correct quarter key using yearType from business_financial_goals.
   * Falls back to the provided quarterKey if yearType can't be determined.
   */
  private async resolveQuarterKey(businessId: string, fallbackKey: string): Promise<string> {
    try {
      const supabase = this.getSupabase();

      // Try to find yearType from financial goals
      const idsToTry = [businessId];
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id !== businessId) idsToTry.push(user.id);

      for (const tryId of idsToTry) {
        const { data } = await supabase
          .from('business_financial_goals')
          .select('year_type')
          .eq('business_id', tryId)
          .maybeSingle();

        if (data?.year_type) {
          const now = new Date();
          const calMonth = now.getMonth() + 1; // 1-12
          const yearType = data.year_type;
          const ysm = startMonthFromYearType(yearType as 'FY' | 'CY');
          const currentQ = getQuarterForMonth(calMonth, ysm);
          const nextQ = currentQ === 4 ? 1 : currentQ + 1;
          const nextQStr = `q${nextQ}`;

          console.log(`[StrategicSync] Resolved yearType=${yearType}, syncQuarter=${nextQStr} (next quarter, was ${fallbackKey})`);
          return nextQStr;
        }
      }

      console.log(`[StrategicSync] Could not resolve yearType, using fallback: ${fallbackKey}`);
      return fallbackKey;
    } catch (err) {
      console.warn('[StrategicSync] Error resolving quarter key, using fallback:', fallbackKey, err);
      return fallbackKey;
    }
  }

  /**
   * Sync annual review completion data:
   * Part A: Roll forward 3-year financial targets (Y1 = next-year targets, Y2 stays, Y3 = stretch or current)
   * Part B: Sync next-year initiatives to strategic_initiatives with fiscal_year stamp
   * Only fires for annual review_type.
   */
  async syncAnnualReview(
    businessId: string, // Must be profileBusinessId (business_profiles.id)
    userId: string,
    nextYearTargets: NextYearTargets,
    annualInitiativePlan: AnnualInitiativePlan,
    nextYear: number
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const supabase = this.getSupabase();

    console.log('[StrategicSync] syncAnnualReview called for FY', nextYear, 'businessId:', businessId);

    // ── Part A: Roll forward 3-year financial targets ──────────────────────────
    try {
      // Load current goals row — try multiple IDs same as syncQuarterlyTargets
      let goalsRow: any = null;

      const { data: goalsData } = await supabase
        .from('business_financial_goals')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle();

      if (goalsData) {
        goalsRow = goalsData;
        console.log('[StrategicSync] Annual sync: found goals with businessId:', businessId);
      } else {
        // Fallback: try user.id
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id !== businessId) {
          const { data: fallbackData } = await supabase
            .from('business_financial_goals')
            .select('*')
            .eq('business_id', user.id)
            .maybeSingle();
          if (fallbackData) {
            goalsRow = fallbackData;
            console.log('[StrategicSync] Annual sync: found goals with user.id fallback:', user.id);
          }
        }
        // Fallback: try legacy business_profile_id column
        if (!goalsRow) {
          const { data: legacyData } = await supabase
            .from('business_financial_goals')
            .select('*')
            .eq('business_profile_id', businessId)
            .maybeSingle();
          if (legacyData) {
            goalsRow = legacyData;
            console.log('[StrategicSync] Annual sync: found goals with legacy business_profile_id:', businessId);
          }
        }
      }

      if (!goalsRow) {
        console.warn('[StrategicSync] Annual sync: no financial goals row found (non-fatal, may be new business)');
      } else {
        const current = goalsRow;

        // Roll-forward: A4.3 targets → Year 1, current Y2 stays as Y2, stretch or current Y3
        const payload = {
          revenue_year1: nextYearTargets.revenue,
          gross_profit_year1: nextYearTargets.grossProfit,
          net_profit_year1: nextYearTargets.netProfit,
          revenue_year2: current.revenue_year2 || 0,
          gross_profit_year2: current.gross_profit_year2 || 0,
          net_profit_year2: current.net_profit_year2 || 0,
          revenue_year3: nextYearTargets.stretchRevenue || current.revenue_year3 || 0,
          gross_profit_year3: nextYearTargets.stretchGrossProfit || current.gross_profit_year3 || 0,
          net_profit_year3: nextYearTargets.stretchNetProfit || current.net_profit_year3 || 0,
        };

        const { error: updateError } = await supabase
          .from('business_financial_goals')
          .update(payload)
          .eq('id', goalsRow.id);

        if (updateError) {
          console.error('[StrategicSync] Annual sync: failed to roll forward financial targets:', updateError.message);
          errors.push(`Financial targets roll-forward failed: ${updateError.message}`);
        } else {
          console.log('[StrategicSync] Annual sync: financial targets rolled forward (Y1=next-year, Y2 retained, Y3=stretch)');
        }
      }
    } catch (err) {
      console.error('[StrategicSync] Annual sync: exception in Part A (financial targets):', err);
      errors.push(`Financial targets exception: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // ── Part B: Sync next-year initiatives to strategic_initiatives ────────────
    try {
      const isValidUUID = (id: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      const initiatives = annualInitiativePlan.initiatives || [];
      let updatedCount = 0;
      let insertedCount = 0;

      for (const initiative of initiatives) {
        // Resolve step_type from quarterAssigned (e.g. 'q1', 'q1-2027' → 'q1')
        let stepType: StepType = 'q1';
        if (initiative.quarterAssigned) {
          const match = initiative.quarterAssigned.match(/^q(\d)/i);
          if (match) {
            const num = parseInt(match[1]);
            if (num >= 1 && num <= 4) stepType = `q${num}` as StepType;
          }
        }

        if (initiative.id && isValidUUID(initiative.id)) {
          // UPDATE existing carry-forward initiative
          const { error } = await supabase
            .from('strategic_initiatives')
            .update({
              status: 'not_started',
              notes: initiative.notes || null,
              step_type: stepType,
              quarter_assigned: initiative.quarterAssigned ? `Q${stepType.charAt(1)}` : null,
              fiscal_year: nextYear,
              updated_at: new Date().toISOString(),
            })
            .eq('id', initiative.id)
            .eq('business_id', businessId);

          if (!error) updatedCount++;
          else console.warn(`[StrategicSync] Annual sync: failed to update initiative ${initiative.id}:`, error.message);
        } else {
          // INSERT new initiative
          const { error } = await supabase
            .from('strategic_initiatives')
            .insert({
              business_id: businessId,
              user_id: userId,
              title: initiative.title,
              category: (initiative.category || 'misc') as StrategicInitiative['category'],
              step_type: stepType,
              source: 'annual_review',
              fiscal_year: nextYear,
              status: 'not_started',
              idea_type: 'strategic',
              selected: true,
              assigned_to: initiative.assignedTo || null,
              notes: initiative.notes || null,
            });

          if (!error) insertedCount++;
          else console.warn('[StrategicSync] Annual sync: failed to insert initiative:', error.message);
        }
      }

      console.log(`[StrategicSync] Annual sync: initiatives synced for FY ${nextYear} — ${updatedCount} updated, ${insertedCount} inserted`);
    } catch (err) {
      console.error('[StrategicSync] Annual sync: exception in Part B (initiatives):', err);
      errors.push(`Initiatives sync exception: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return { success: errors.length === 0, errors };
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
    newInitiatives: Array<{ title: string; category: string; quarterAssigned?: string }>,
    realignmentData?: RealignmentData
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Resolve the correct quarter key using yearType
    const resolvedQuarterKey = await this.resolveQuarterKey(businessId, quarterKey);

    console.log('[StrategicSync] syncAll called with businessId:', businessId, 'quarterKey:', quarterKey, '→ resolved:', resolvedQuarterKey);

    // Sync initiative decisions
    const decisionsResult = await this.syncInitiativeChanges(businessId, userId, decisions);
    if (!decisionsResult.success && decisionsResult.error) {
      errors.push(decisionsResult.error);
    }

    // Sync quarterly targets (using resolved quarter key for correct FY mapping)
    const targetsResult = await this.syncQuarterlyTargets(businessId, quarterlyTargets, resolvedQuarterKey);
    if (!targetsResult.success && targetsResult.error) {
      errors.push(targetsResult.error);
    }

    // Sync realigned annual targets (if user chose to adjust)
    if (realignmentData) {
      const realignResult = await this.syncRealignedTargets(businessId, realignmentData);
      if (!realignResult.success && realignResult.error) {
        errors.push(realignResult.error);
      }
    }

    // Sync sprint planning data to quarter rows (using resolved quarter key)
    const sprintResult = await this.syncSprintPlanningToQuarter(businessId, decisions, resolvedQuarterKey);
    if (!sprintResult.success && sprintResult.error) {
      errors.push(sprintResult.error);
    }

    // Sync rocks to the correct quarter step_type (using resolved quarter key)
    const rocksResult = await this.syncRocks(businessId, userId, rocks, resolvedQuarterKey);
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
