/**
 * Phase 49 DB-04 — CASCADE batch per-FK tests.
 *
 * Asserts that migration 20260507000000_db04_cascade_fks.sql correctly
 * converts the 4 Bucket B FKs from NO ACTION to ON DELETE CASCADE.
 * Per docs/db/fk-policy.md Bucket B (operator sign-off Matt 2026-05-04).
 *
 * NOTE: fk-policy.md Bucket B is **4 FKs**, not the 5 the original 49-06
 * plan assumed. `session_attendees.user_id` was moved B → A per operator
 * decision and shipped in 49-05 batch 2 as SET NULL.
 *
 * The 4 CASCADE FKs:
 *   1. process_flows.from_step_id   → process_steps.id
 *   2. process_flows.to_step_id     → process_steps.id
 *   3. process_flows.process_id     → process_diagrams.id
 *   4. process_phases.process_id    → process_diagrams.id
 *
 * Each test asserts THREE properties (per RESEARCH.md DB-04 lines 700-707
 * and plan 49-06 cascade-chain verification):
 *   (a) Immediate cascade fires — child row is gone after parent delete.
 *   (b) Bounded cascade — an UNRELATED row in the same table (FK pointing
 *       at a DIFFERENT parent) is unaffected.
 *   (c) No upward cascade — the grandparent of the child still exists
 *       (e.g., deleting a process_steps row doesn't cascade up to its
 *       process_diagrams parent).
 *
 * RED state (before migration): NO ACTION ≈ RESTRICT — the parent delete is
 * blocked at commit time when a child references it. Tests fail on the
 * unhandled throw from the delete call.
 *
 * GREEN state (after migration): delete succeeds, child is gone, unrelated
 * survives, grandparent survives.
 *
 * Existing baseline cascades to be aware of (don't mistake them for 49-06
 * regressions):
 *   - process_diagrams.user_id → auth.users CASCADE (baseline)
 *   - process_steps.process_id → process_diagrams CASCADE (baseline)
 *
 * After 49-06: deleting a process_diagrams cascades to its process_steps
 * (existing) AND to its process_flows + process_phases (new). Deleting a
 * process_steps cascades to its inbound + outbound process_flows (new).
 */
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  skipIfNoLiveDb,
  getTestSupabase,
  seedTestBusiness,
  createTestUser,
  deleteTestUser,
  assertOrphans,
} from './_helpers'

const d = skipIfNoLiveDb() ? describe.skip : describe

d('Phase 49 DB-04 batch CASCADE — Bucket B (4 process_* FKs)', () => {
  let supabase: SupabaseClient

  beforeAll(async () => {
    supabase = getTestSupabase()
    await seedTestBusiness(supabase)
  })

  /** Helpers — small inline factories (table-specific shapes don't generalise). */
  async function createDiagram(userId: string, name: string): Promise<string | null> {
    const r = await supabase
      .from('process_diagrams')
      .insert({ user_id: userId, name })
      .select('id')
      .single()
    return r.error ? null : (r.data as { id: string }).id
  }
  async function createStep(diagramId: string, order: number, title: string): Promise<string | null> {
    const r = await supabase
      .from('process_steps')
      .insert({ process_id: diagramId, order_num: order, title })
      .select('id')
      .single()
    return r.error ? null : (r.data as { id: string }).id
  }
  async function createFlow(
    diagramId: string,
    fromStep: string | null,
    toStep: string | null,
    label: string,
  ): Promise<string | null> {
    const r = await supabase
      .from('process_flows')
      .insert({
        process_id: diagramId,
        from_step_id: fromStep,
        to_step_id: toStep,
        flow_type: 'sequence',
        condition_label: label,
      })
      .select('id')
      .single()
    return r.error ? null : (r.data as { id: string }).id
  }
  async function createPhase(
    diagramId: string,
    name: string,
    order: number,
  ): Promise<string | null> {
    const r = await supabase
      .from('process_phases')
      .insert({ process_id: diagramId, phase_name: name, phase_order: order })
      .select('id')
      .single()
    return r.error ? null : (r.data as { id: string }).id
  }

  // Track all created rows so we can clean up gracefully even if asserts fail
  // before the test reaches its own delete step.
  const trackedDiagrams: string[] = []
  const trackedUsers: string[] = []

  afterEach(async () => {
    // Diagrams cascade to steps, flows, phases (existing + new). Wipe diagrams
    // first; what's left of users is just the auth row.
    if (trackedDiagrams.length) {
      await supabase.from('process_diagrams').delete().in('id', trackedDiagrams)
      trackedDiagrams.length = 0
    }
    while (trackedUsers.length) {
      const u = trackedUsers.pop()!
      try {
        await deleteTestUser(supabase, u)
      } catch {
        /* user may already be cascade-deleted */
      }
    }
  })

  // --------------------------------------------------------------------------
  // FK 1: process_flows.from_step_id → process_steps.id
  // --------------------------------------------------------------------------
  it('FK#B1 process_flows CASCADEs when from_step is deleted; unrelated flow + grandparent diagram survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)
    const diagramId = await createDiagram(userId, '__fk-test B1__')
    if (!diagramId) return
    trackedDiagrams.push(diagramId)

    const step1 = await createStep(diagramId, 1, 'B1-step1')
    const step2 = await createStep(diagramId, 2, 'B1-step2')
    const step3 = await createStep(diagramId, 3, 'B1-step3')
    if (!step1 || !step2 || !step3) return

    // Target flow: from_step = step1; deleting step1 should cascade.
    const targetFlow = await createFlow(diagramId, step1, step2, 'B1-target')
    // Unrelated flow: from_step = step2 (different parent); should survive.
    const unrelatedFlow = await createFlow(diagramId, step2, step3, 'B1-unrelated')
    if (!targetFlow || !unrelatedFlow) return

    // Action: delete step1.
    const del = await supabase.from('process_steps').delete().eq('id', step1)
    expect(del.error, `expected step delete to succeed (CASCADE active)`).toBeNull()

    // (a) Immediate cascade — target flow is gone.
    await assertOrphans(supabase, 'process_flows', 'from_step_id', step1, 'cascade', [targetFlow])

    // (b) Bounded — unrelated flow survives (its from_step_id is step2, untouched).
    const surv = await supabase
      .from('process_flows')
      .select('id, from_step_id')
      .eq('id', unrelatedFlow)
      .maybeSingle()
    expect(surv.data, 'unrelated flow must survive').not.toBeNull()
    expect((surv.data as { from_step_id: string } | null)?.from_step_id).toBe(step2)

    // (c) No upward cascade — diagram + step2 + step3 still exist.
    const diag = await supabase
      .from('process_diagrams')
      .select('id')
      .eq('id', diagramId)
      .maybeSingle()
    expect(diag.data, 'diagram (grandparent) must survive').not.toBeNull()
    const remainingSteps = await supabase
      .from('process_steps')
      .select('id')
      .in('id', [step2, step3])
    expect(remainingSteps.data?.length).toBe(2)
  })

  // --------------------------------------------------------------------------
  // FK 2: process_flows.to_step_id → process_steps.id  (mirror of FK 1)
  // --------------------------------------------------------------------------
  it('FK#B2 process_flows CASCADEs when to_step is deleted; unrelated flow + grandparent diagram survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)
    const diagramId = await createDiagram(userId, '__fk-test B2__')
    if (!diagramId) return
    trackedDiagrams.push(diagramId)

    const step1 = await createStep(diagramId, 1, 'B2-step1')
    const step2 = await createStep(diagramId, 2, 'B2-step2')
    const step3 = await createStep(diagramId, 3, 'B2-step3')
    if (!step1 || !step2 || !step3) return

    // Target flow: to_step = step1; deleting step1 cascades.
    const targetFlow = await createFlow(diagramId, step2, step1, 'B2-target')
    // Unrelated flow: to_step = step3 (NOT step1); should survive.
    const unrelatedFlow = await createFlow(diagramId, step2, step3, 'B2-unrelated')
    if (!targetFlow || !unrelatedFlow) return

    const del = await supabase.from('process_steps').delete().eq('id', step1)
    expect(del.error).toBeNull()

    await assertOrphans(supabase, 'process_flows', 'to_step_id', step1, 'cascade', [targetFlow])

    const surv = await supabase
      .from('process_flows')
      .select('id, to_step_id')
      .eq('id', unrelatedFlow)
      .maybeSingle()
    expect(surv.data).not.toBeNull()
    expect((surv.data as { to_step_id: string } | null)?.to_step_id).toBe(step3)

    const diag = await supabase
      .from('process_diagrams')
      .select('id')
      .eq('id', diagramId)
      .maybeSingle()
    expect(diag.data).not.toBeNull()
  })

  // --------------------------------------------------------------------------
  // FK 3: process_flows.process_id → process_diagrams.id
  // --------------------------------------------------------------------------
  it('FK#B3 process_flows CASCADE when their diagram is deleted; flows in another diagram survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)

    const targetDiagram = await createDiagram(userId, '__fk-test B3-target__')
    const unrelatedDiagram = await createDiagram(userId, '__fk-test B3-unrelated__')
    if (!targetDiagram || !unrelatedDiagram) return
    trackedDiagrams.push(targetDiagram, unrelatedDiagram)

    const tStep1 = await createStep(targetDiagram, 1, 'B3-t-step1')
    const tStep2 = await createStep(targetDiagram, 2, 'B3-t-step2')
    const uStep1 = await createStep(unrelatedDiagram, 1, 'B3-u-step1')
    const uStep2 = await createStep(unrelatedDiagram, 2, 'B3-u-step2')
    if (!tStep1 || !tStep2 || !uStep1 || !uStep2) return

    const targetFlowA = await createFlow(targetDiagram, tStep1, tStep2, 'B3-target-A')
    const targetFlowB = await createFlow(targetDiagram, tStep2, tStep1, 'B3-target-B')
    const unrelatedFlow = await createFlow(unrelatedDiagram, uStep1, uStep2, 'B3-unrelated')
    if (!targetFlowA || !targetFlowB || !unrelatedFlow) return

    // Delete the target diagram. Existing baseline CASCADE wipes its steps;
    // 49-06 CASCADE wipes its flows.
    const del = await supabase.from('process_diagrams').delete().eq('id', targetDiagram)
    expect(del.error).toBeNull()
    // After delete, remove from tracking so afterEach doesn't double-delete.
    trackedDiagrams.splice(trackedDiagrams.indexOf(targetDiagram), 1)

    await assertOrphans(
      supabase,
      'process_flows',
      'process_id',
      targetDiagram,
      'cascade',
      [targetFlowA, targetFlowB],
    )

    // Unrelated flow + its diagram survive.
    const surv = await supabase
      .from('process_flows')
      .select('id, process_id')
      .eq('id', unrelatedFlow)
      .maybeSingle()
    expect(surv.data).not.toBeNull()
    expect((surv.data as { process_id: string } | null)?.process_id).toBe(unrelatedDiagram)

    const survDiag = await supabase
      .from('process_diagrams')
      .select('id')
      .eq('id', unrelatedDiagram)
      .maybeSingle()
    expect(survDiag.data).not.toBeNull()
  })

  // --------------------------------------------------------------------------
  // FK 4: process_phases.process_id → process_diagrams.id
  // --------------------------------------------------------------------------
  it('FK#B4 process_phases CASCADE when their diagram is deleted; phases in another diagram survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)

    const targetDiagram = await createDiagram(userId, '__fk-test B4-target__')
    const unrelatedDiagram = await createDiagram(userId, '__fk-test B4-unrelated__')
    if (!targetDiagram || !unrelatedDiagram) return
    trackedDiagrams.push(targetDiagram, unrelatedDiagram)

    const targetPhase1 = await createPhase(targetDiagram, 'B4-t-phase1', 1)
    const targetPhase2 = await createPhase(targetDiagram, 'B4-t-phase2', 2)
    const unrelatedPhase = await createPhase(unrelatedDiagram, 'B4-u-phase1', 1)
    if (!targetPhase1 || !targetPhase2 || !unrelatedPhase) return

    const del = await supabase.from('process_diagrams').delete().eq('id', targetDiagram)
    expect(del.error).toBeNull()
    trackedDiagrams.splice(trackedDiagrams.indexOf(targetDiagram), 1)

    await assertOrphans(
      supabase,
      'process_phases',
      'process_id',
      targetDiagram,
      'cascade',
      [targetPhase1, targetPhase2],
    )

    // Unrelated phase + its diagram survive.
    const surv = await supabase
      .from('process_phases')
      .select('id, process_id')
      .eq('id', unrelatedPhase)
      .maybeSingle()
    expect(surv.data).not.toBeNull()
    expect((surv.data as { process_id: string } | null)?.process_id).toBe(unrelatedDiagram)

    const survDiag = await supabase
      .from('process_diagrams')
      .select('id')
      .eq('id', unrelatedDiagram)
      .maybeSingle()
    expect(survDiag.data).not.toBeNull()
  })
})
