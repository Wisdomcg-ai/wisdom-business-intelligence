// Strategic Sync Service
// Two-way sync: quarterly review decisions → strategic plan tables
// Writes changes back to the source-of-truth tables (strategic_initiatives, goals)

'use client';

import { createClient } from '@/lib/supabase/client';
import type { StrategicInitiative, InitiativeStatus } from '@/app/goals/types';
import type { InitiativeDecision, Rock, QuarterlyTargets, RealignmentData, NextYearTargets, AnnualInitiativePlan } from '../types';
import {
  fillSprintBlanks,
  isForPlannedQuarter,
  isSavedInitiativeId,
  plannedRockDecisions,
  titleKey,
} from '../utils/rocks-from-decisions';
import { quarterDecisionWrites, quarterRowIndex, type QuarterRow } from '../utils/quarter-rows';

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
   *
   * The planned quarter's listings write to the quarter's own rows
   * (quarterDecisionWrites). They used to write to the row each came from, so
   * taking a picked 12-month initiative out of the quarter — Drop, or Remove in
   * Sprint Planning — cancelled the 12-month initiative itself.
   */
  async syncInitiativeChanges(
    businessId: string,
    userId: string,
    decisions: InitiativeDecision[],
    /** The quarter the review plans. Without it every decision writes to its own row. */
    quarterKey?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = this.getSupabase();
      const stepType = quarterKey ? this.quarterKeyToStepType(quarterKey) : null;
      const inPlannedQuarter = (d: InitiativeDecision) =>
        stepType !== null && isForPlannedQuarter(d, Number(stepType.slice(1)));

      const writes: Array<[string, InitiativeDecision]> = [];
      for (const decision of decisions) {
        if (inPlannedQuarter(decision)) continue;
        // Skip user-added initiatives (not in DB)
        if (decision.initiativeId.startsWith('new-')) continue;
        writes.push([decision.initiativeId, decision]);
      }

      let readFailure: string | null = null;
      const planned = decisions.filter(inPlannedQuarter);
      if (planned.length > 0) {
        const { data: quarterRows, error: readError } = await supabase
          .from('strategic_initiatives')
          .select('id, title, status')
          .eq('business_id', businessId)
          .eq('step_type', stepType);
        if (readError) {
          // Written blind, a rock picked from the 12-month list lands on the 12-month row.
          readFailure = `Decisions for ${stepType} not saved — could not read it: ${readError.message}`;
        } else {
          writes.push(...quarterDecisionWrites(planned, (quarterRows ?? []) as QuarterRow[]));
        }
      }

      for (const [rowId, decision] of writes) {
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
          .eq('id', rowId)
          .eq('business_id', businessId);
      }

      if (readFailure) return { success: false, error: readFailure };
      console.log('[StrategicSync] Successfully synced initiative decisions (update-only)');
      return { success: true };
    } catch (err) {
      console.error('[StrategicSync] Error syncing initiative changes:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Save the initiatives the review added into the quarter they were planned for.
   *
   * INSERT-only, and only what the quarter does not already hold (by title).
   *
   * This used to load the quarter, append the additions and hand the lot to the
   * Goals wizard's saveInitiatives — a list save that HARD-DELETES every row of
   * the quarter missing from the list and rewrites the rest from the loaded
   * copy. loadInitiatives answers [] when its read fails, so one failed read at
   * completion would have deleted the whole quarter; and every completion
   * re-appended `initiatives_changes.added` (which lists the review's additions
   * every time) on top of the rows syncRocks had just saved by title — JVJ's
   * Training and KPI & Bonus Structure, 25 Sep 2026.
   *
   * A quarter that cannot be read is not written: the sync says so.
   */
  async syncNewInitiatives(
    businessId: string,
    userId: string,
    newInitiatives: Array<{ title: string; category: string; quarterAssigned?: string }>,
    /** Where an initiative with no quarter of its own goes: the quarter the review plans. */
    defaultQuarterKey: string = 'q1'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (newInitiatives.length === 0) return { success: true };

      const supabase = this.getSupabase();
      const byQuarter = new Map<StepType, Array<{ title: string; category: string }>>();
      for (const init of newInitiatives) {
        const stepType = this.quarterKeyToStepType(init.quarterAssigned || defaultQuarterKey);
        if (!stepType) continue;
        if (!byQuarter.has(stepType)) byQuarter.set(stepType, []);
        byQuarter.get(stepType)!.push(init);
      }

      const failures: string[] = [];
      for (const [stepType, initiatives] of byQuarter) {
        const { data: heldRows, error: readError } = await supabase
          .from('strategic_initiatives')
          .select('title')
          .eq('business_id', businessId)
          .eq('step_type', stepType);
        if (readError) {
          failures.push(`could not read ${stepType}: ${readError.message}`);
          continue;
        }

        const held = new Set((heldRows ?? []).map((r: { title?: string | null }) => titleKey(r.title)).filter(Boolean));
        const now = new Date().toISOString();
        const rows: Record<string, unknown>[] = [];
        for (const init of initiatives) {
          const key = titleKey(init.title);
          if (!key || held.has(key)) continue;
          held.add(key);
          rows.push({
            business_id: businessId,
            user_id: userId,
            title: init.title.trim(),
            category: init.category || 'misc',
            step_type: stepType,
            source: 'strategic_ideas',
            selected: true,
            idea_type: 'strategic',
            order_index: (heldRows ?? []).length + rows.length,
            updated_at: now,
          });
        }
        if (rows.length === 0) continue;

        const { error: insertError } = await supabase.from('strategic_initiatives').insert(rows);
        if (insertError) failures.push(`insert into ${stepType}: ${insertError.message}`);
      }

      if (failures.length > 0) {
        return { success: false, error: `New initiatives not saved — ${failures.join('; ')}` };
      }
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
   *
   * A rock is filed under one of the QUARTER's rows (quarterRowIndex): its own
   * row when that row is in the quarter, updated in place; otherwise the
   * quarter's row of its title, found or inserted — the Goals wizard's model,
   * where a quarter holds its own copy of an initiative and the original stays
   * where it is. A rock picked from the 12-month list or carried forward from an
   * earlier quarter used to be updated through its own id, step_type included,
   * which MOVED that row into this quarter.
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

      // A rock the session created carries an id like `sprint-new-1790198021629`,
      // which is not a UUID — so the branch below used to INSERT it, every
      // completion, with nothing checking whether it was already there. Efficient
      // Living has five q1 rocks stored four times over, created 20 Mar 2026 at
      // 00:01, 00:25, 00:47 and 01:02: four completions of one session. It stayed
      // dormant only because quarterly_rocks had no writer and syncRocks returns
      // early on an empty list; wiring that writer is what reactivates it.
      //
      // So the row is found by what it IS — this business's rock of that title in
      // that quarter — not by an id the workshop never had to give it. A rock the
      // coach dropped (saved as cancelled) is not the rock planned now: matched by
      // title, a rock removed in Sprint Planning and added back under the same
      // name was written onto the dropped row — and stayed cancelled. It gets a
      // row of its own; the dropped one stays as history.
      const { data: existingRows, error: existingError } = await supabase
        .from('strategic_initiatives')
        .select('id, title, status')
        .eq('business_id', businessId)
        .eq('step_type', stepType);

      if (existingError) {
        // Inserting blind here is what created the duplicates in the first place.
        return { success: false, error: `Could not read existing rocks: ${existingError.message}` };
      }
      const quarter = quarterRowIndex((existingRows ?? []) as QuarterRow[]);
      const rowFor = (rock: Rock) => quarter.rowFor({ id: rock.id, title: rock.title || 'Untitled Rock' });

      // A rock picked from elsewhere in the plan that the quarter holds no row
      // for gets a copy of the initiative: its category, type, priority and
      // timeline come with it, as they do when the Goals wizard puts an
      // initiative in a quarter. The fields the review sets itself come from the
      // rock, as for every rock.
      const pickedIds = rocks
        .filter(rock => !rowFor(rock) && isSavedInitiativeId(rock.id))
        .map(rock => rock.id);
      const picked = new Map<string, Record<string, unknown>>();
      if (pickedIds.length > 0) {
        const { data: originals, error: originalsError } = await supabase
          .from('strategic_initiatives')
          .select('id, category, idea_type, priority, timeline')
          .eq('business_id', businessId)
          .in('id', pickedIds);
        if (originalsError) {
          // A copy filed without them would keep the wrong category for good.
          return { success: false, error: `Could not read the initiatives picked for ${stepType}: ${originalsError.message}` };
        }
        for (const row of (originals ?? []) as Array<Record<string, unknown>>) picked.set(String(row.id), row);
      }

      let updatedCount = 0;
      let insertedCount = 0;
      const failures: string[] = [];
      // One write per row, and one insert per title: the first rock is the rock,
      // as in rocksFromDecisions.
      const written = new Set<string>();

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

        const rowId = rowFor(rock);
        const writeKey = rowId ?? `title:${titleKey(baseData.title)}`;
        if (written.has(writeKey)) continue;
        written.add(writeKey);

        if (rowId) {
          // UPDATE the quarter's row. Never a row elsewhere in the plan: baseData
          // carries step_type.
          const { error } = await supabase
            .from('strategic_initiatives')
            .update(baseData)
            .eq('id', rowId)
            .eq('business_id', businessId);
          if (!error) updatedCount++;
          else failures.push(`update ${baseData.title}: ${error.message}`);
        } else {
          // INSERT the quarter's row for this rock
          const original = picked.get(rock.id);
          const { error } = await supabase
            .from('strategic_initiatives')
            .insert({
              ...baseData,
              business_id: businessId,
              user_id: userId,
              category: (original?.category as string | null) || 'misc',
              idea_type: (original?.idea_type as string | null) || 'strategic',
              priority: (original?.priority as string | null) ?? null,
              timeline: (original?.timeline as string | null) ?? null,
            });
          if (!error) insertedCount++;
          else failures.push(`insert ${baseData.title}: ${error.message}`);
        }
      }

      console.log(`[StrategicSync] Synced rocks to ${stepType}: ${updatedCount} updated, ${insertedCount} inserted`);
      // A rock that did not save is not a successful completion. These used to
      // be console.warn only, so the counters simply did not increment and the
      // caller was told everything landed.
      if (failures.length > 0) {
        return { success: false, error: `Rocks not saved — ${failures.join('; ')}` };
      }
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
   *
   * "The matching row for the quarter" is the row syncRocks filed the rock
   * under (quarterRowIndex), so this runs after it. It used to be the decision's
   * own id — for a rock picked from the 12-month list, the 12-month row — and
   * a rock the review added (no row id) had its tasks, milestones and why
   * dropped altogether. Only the planned quarter's rocks are written: 4.3 plans
   * nothing else.
   */
  async syncSprintPlanningToQuarter(
    businessId: string,
    decisions: InitiativeDecision[],
    quarterKey: string // e.g., 'q1', 'q2'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const stepType = this.quarterKeyToStepType(quarterKey);
      if (!stepType) return { success: true };

      const withDetail = plannedRockDecisions(decisions, Number(stepType.slice(1))).filter(
        (decision) =>
          decision.assignedTo || decision.why || decision.outcome ||
          decision.startDate || decision.endDate || decision.totalHours ||
          (decision.tasks && decision.tasks.length > 0) ||
          (decision.milestones && decision.milestones.length > 0)
      );
      if (withDetail.length === 0) return { success: true };

      const supabase = this.getSupabase();
      const { data: quarterRows, error: readError } = await supabase
        .from('strategic_initiatives')
        .select('id, title, status')
        .eq('business_id', businessId)
        .eq('step_type', stepType);
      if (readError) {
        return { success: false, error: `Sprint detail not saved — could not read ${stepType}: ${readError.message}` };
      }
      const quarter = quarterRowIndex((quarterRows ?? []) as QuarterRow[]);

      // One write per row. A rock listed twice files both listings under one
      // row: the first listing's detail, later ones filling only what it lacks —
      // the same rule rocksFromDecisions builds the rock by.
      const byRow = new Map<string, InitiativeDecision>();
      const failures: string[] = [];
      for (const decision of withDetail) {
        const rowId = quarter.rowFor({ id: decision.initiativeId, title: decision.title });
        if (!rowId) {
          // An untitled listing is never made a rock (rocksFromDecisions), so it has no row to miss.
          if (titleKey(decision.title)) failures.push(`${decision.title}: no ${stepType} row`);
          continue;
        }
        const held = byRow.get(rowId);
        byRow.set(rowId, held ? fillSprintBlanks(held, decision) : decision);
      }

      let updatedCount = 0;
      for (const [rowId, decision] of byRow) {
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

        const { error } = await supabase
          .from('strategic_initiatives')
          .update(updatePayload)
          .eq('id', rowId)
          .eq('business_id', businessId);

        if (!error) updatedCount++;
        else failures.push(`${decision.title}: ${error.message}`);
      }

      console.log(`[StrategicSync] Synced sprint planning for ${updatedCount} initiatives to ${stepType}`);
      // A rock whose detail did not land is not a successful completion; this
      // used to count only the successes and report success regardless.
      if (failures.length > 0) {
        return { success: false, error: `Sprint detail not saved — ${failures.join('; ')}` };
      }
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
  /**
   * The quarter every write in this sync files under.
   *
   * This used to ignore its caller and derive "next quarter" from `new Date()`,
   * keeping the passed key only when year_type could not be read. The two are
   * different definitions: a review is NAMED for the quarter it plans
   * (`planQuarterKey`, types/index.ts), while the clock's "quarter after the
   * one we are in" only coincides with that while the session happens inside
   * the quarter before the one being planned. Complete a Q1 review in the last
   * week of Q1 — 24 Sep 2026, six days out — and the clock says q2 while the
   * review says q1, so the targets, rocks and sprint rows file under a quarter
   * nobody planned. #561 unified three disagreeing writers behind
   * planQuarterKey / reviewedQuarterOf for exactly this reason; this was the
   * same bug, still overriding them from underneath.
   *
   * The caller already holds the review. It decides.
   */
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

    // The review's own quarter — the one it plans. Never re-derived here.
    const resolvedQuarterKey = quarterKey;

    // Sync initiative decisions (the planned quarter's listings onto its own rows)
    const decisionsResult = await this.syncInitiativeChanges(businessId, userId, decisions, resolvedQuarterKey);
    if (!decisionsResult.success && decisionsResult.error) {
      errors.push(decisionsResult.error);
    }

    // Sync quarterly targets (the quarter the review plans)
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

    // Sync rocks to the quarter the review plans
    const rocksResult = await this.syncRocks(businessId, userId, rocks, resolvedQuarterKey);
    if (!rocksResult.success && rocksResult.error) {
      errors.push(rocksResult.error);
    }

    // Sync sprint planning data to quarter rows (the quarter the review plans).
    // After the rocks: a rock picked from the 12-month list or an earlier
    // quarter, or added in the session, has its quarter row only once syncRocks
    // has filed it.
    const sprintResult = await this.syncSprintPlanningToQuarter(businessId, decisions, resolvedQuarterKey);
    if (!sprintResult.success && sprintResult.error) {
      errors.push(sprintResult.error);
    }

    // Sync new initiatives
    if (newInitiatives.length > 0) {
      const newResult = await this.syncNewInitiatives(businessId, userId, newInitiatives, resolvedQuarterKey);
      if (!newResult.success && newResult.error) {
        errors.push(newResult.error);
      }
    }

    return { success: errors.length === 0, errors };
  }
}

export const strategicSyncService = new StrategicSyncService();
