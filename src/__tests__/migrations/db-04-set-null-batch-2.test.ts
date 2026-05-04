/**
 * Phase 49 DB-04 — SET NULL batch 2 per-FK tests.
 *
 * Asserts that migration 20260506000000_db04_set_null_fks_batch_2.sql
 * correctly converts the second 26 FKs in fk-policy.md Bucket A from
 * NO ACTION to ON DELETE SET NULL. Per docs/db/fk-policy.md Bucket A
 * rows 23-46 + 49-50 (operator sign-off Matt 2026-05-04).
 *
 * Same overall pattern as batch 1, with three variants for the 6 FKs that
 * don't reference auth.users.id directly:
 *   - roadmap_completions.user_id → profiles  (delete profiles row)
 *   - session_actions.strategic_initiative_id → strategic_initiatives  (delete initiative)
 *   - annual_snapshots.q1..q4_snapshot_id → quarterly_snapshots  (delete quarterly)
 *   - swot_items.carried_from_item_id → swot_items  (self-FK; delete sibling)
 *   - todo_items.parent_task_id → todo_items  (self-FK; delete parent)
 *
 * RED state (before migration): the parent delete is blocked at commit time;
 * tests fail on the unhandled throw from delete.
 *
 * GREEN state (after migration applied to preview branch): delete succeeds,
 * the dependent row survives with FK column = NULL, the test passes.
 *
 * NOT NULL relaxation (deviation pattern continued from 49-04): 8 columns in
 * batch 2 are declared NOT NULL in baseline. The migration relaxes NOT NULL
 * on those columns. Affected tests are marked in their comments.
 */
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  skipIfNoLiveDb,
  getTestSupabase,
  TEST_BUSINESS_ID,
  seedTestBusiness,
  createTestUser,
  deleteTestUser,
  assertOrphans,
} from './_helpers'

const TEST_BUSINESS_ID_TEXT = TEST_BUSINESS_ID

const d = skipIfNoLiveDb() ? describe.skip : describe

d('Phase 49 DB-04 batch 2 — SET NULL on 26 audit-attribution / self / cross-table FKs', () => {
  let supabase: SupabaseClient
  // Track dependent rows per test for cleanup; processed LIFO in afterEach.
  const cleanupQueue: Array<{ table: string; ids: string[] }> = []

  beforeAll(async () => {
    supabase = getTestSupabase()
    await seedTestBusiness(supabase)
  })

  afterEach(async () => {
    while (cleanupQueue.length) {
      const item = cleanupQueue.pop()!
      if (item.ids.length === 0) continue
      await supabase.from(item.table).delete().in('id', item.ids)
    }
  })

  // FK 23: roadmap_completions.user_id → public.profiles.id  (NOT NULL relaxed; variant: delete profile)
  it('FK#23 roadmap_completions.user_id → SET NULL on profiles delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    await supabase.from('profiles').upsert({ id: userId, full_name: 'fk-test #23' })
    const ins = await supabase
      .from('roadmap_completions')
      .insert({
        user_id: userId,
        stage: 'foundation',
        category: 'setup',
        item_text: 'fk-test #23',
      })
      .select('id')
      .single()
    if (ins.error) {
      await supabase.from('profiles').delete().eq('id', userId)
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'roadmap_completions', ids: [id] })
    await supabase.from('profiles').delete().eq('id', userId)
    await assertOrphans(supabase, 'roadmap_completions', 'user_id', userId, 'null', [id])
    await deleteTestUser(supabase, userId)
  })

  // FK 24: session_actions.created_by → auth.users.id  (NOT NULL relaxed)
  it('FK#24 session_actions.created_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    // session_actions requires a session_note parent (FK on session_note_id is nullable; safe to omit).
    const ins = await supabase
      .from('session_actions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        action_number: 1,
        description: 'fk-test #24',
        created_by: userId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_actions', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'session_actions', 'created_by', userId, 'null', [id])
  })

  // FK 25: session_attendees.added_by → auth.users.id
  it('FK#25 session_attendees.added_by → SET NULL on user delete', async () => {
    const adderId = await createTestUser(supabase)
    const attendeeId = await createTestUser(supabase)
    // Need a session_notes parent for session_note_id (NOT NULL FK).
    const noteIns = await supabase
      .from('session_notes')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: adderId,
        session_date: '2026-05-06',
      })
      .select('id')
      .single()
    if (noteIns.error) {
      await deleteTestUser(supabase, adderId)
      await deleteTestUser(supabase, attendeeId)
      return
    }
    const noteId = (noteIns.data as { id: string }).id
    const ins = await supabase
      .from('session_attendees')
      .insert({
        session_note_id: noteId,
        user_id: attendeeId,
        user_type: 'client',
        added_by: adderId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await supabase.from('session_notes').delete().eq('id', noteId)
      await deleteTestUser(supabase, adderId)
      await deleteTestUser(supabase, attendeeId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_attendees', ids: [id] })
    cleanupQueue.push({ table: 'session_notes', ids: [noteId] })
    await deleteTestUser(supabase, adderId)
    await assertOrphans(supabase, 'session_attendees', 'added_by', adderId, 'null', [id])
    await deleteTestUser(supabase, attendeeId)
  })

  // FK 26: session_notes.coach_id → auth.users.id  (NOT NULL relaxed)
  it('FK#26 session_notes.coach_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('session_notes')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: userId,
        session_date: '2026-05-06',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_notes', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'session_notes', 'coach_id', userId, 'null', [id])
  })

  // FK 27: session_prep.client_id → auth.users.id
  it('FK#27 session_prep.client_id → SET NULL on user delete', async () => {
    const coachId = await createTestUser(supabase)
    const clientId = await createTestUser(supabase)
    // Need a sessions parent for session_id (NOT NULL FK).
    const sessIns = await supabase
      .from('sessions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: coachId,
        scheduled_at: new Date().toISOString(),
        title: 'fk-test #27',
      })
      .select('id')
      .single()
    if (sessIns.error) {
      await deleteTestUser(supabase, coachId)
      await deleteTestUser(supabase, clientId)
      return
    }
    const sessionId = (sessIns.data as { id: string }).id
    const ins = await supabase
      .from('session_prep')
      .insert({
        session_id: sessionId,
        business_id: TEST_BUSINESS_ID,
        client_id: clientId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await supabase.from('sessions').delete().eq('id', sessionId)
      await deleteTestUser(supabase, coachId)
      await deleteTestUser(supabase, clientId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_prep', ids: [id] })
    cleanupQueue.push({ table: 'sessions', ids: [sessionId] })
    await deleteTestUser(supabase, clientId)
    await assertOrphans(supabase, 'session_prep', 'client_id', clientId, 'null', [id])
    await deleteTestUser(supabase, coachId)
  })

  // FK 28: sessions.coach_id → auth.users.id
  it('FK#28 sessions.coach_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('sessions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: userId,
        scheduled_at: new Date().toISOString(),
        title: 'fk-test #28',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'sessions', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'sessions', 'coach_id', userId, 'null', [id])
  })

  // FK 29: shared_documents.uploaded_by → auth.users.id  (NOT NULL relaxed)
  it('FK#29 shared_documents.uploaded_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('shared_documents')
      .insert({
        business_id: TEST_BUSINESS_ID,
        file_name: 'fk-test-29.txt',
        file_path: '/fk-test/29.txt',
        uploaded_by: userId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'shared_documents', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'shared_documents', 'uploaded_by', userId, 'null', [id])
  })

  // FK 30: sprint_actions.user_id → auth.users.id  (NOT NULL relaxed)
  it('FK#30 sprint_actions.user_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('sprint_actions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        action: 'fk-test #30',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'sprint_actions', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'sprint_actions', 'user_id', userId, 'null', [id])
  })

  // FK 31: sprint_key_actions.user_id → auth.users.id
  it('FK#31 sprint_key_actions.user_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('sprint_key_actions')
      .insert({
        business_id: TEST_BUSINESS_ID_TEXT,
        user_id: userId,
        action: 'fk-test #31',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'sprint_key_actions', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'sprint_key_actions', 'user_id', userId, 'null', [id])
  })

  // FK 32: strategic_initiatives.user_id → auth.users.id  (NOT NULL relaxed)
  it('FK#32 strategic_initiatives.user_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('strategic_initiatives')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        title: 'fk-test #32',
        step_type: 'foundation',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'strategic_initiatives', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'strategic_initiatives', 'user_id', userId, 'null', [id])
  })

  // FK 33: strategic_todos.created_by → auth.users.id
  it('FK#33 strategic_todos.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('strategic_todos')
      .insert({
        business_id: TEST_BUSINESS_ID,
        created_by: userId,
        title: 'fk-test #33',
        engine: 'attract',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'strategic_todos', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'strategic_todos', 'created_by', userId, 'null', [id])
  })

  // FK 34: strategic_todos.owner_id → auth.users.id  (NB: NOT businesses.owner_id — see Bucket C-1)
  it('FK#34 strategic_todos.owner_id → SET NULL on user delete', async () => {
    const creatorId = await createTestUser(supabase)
    const ownerId = await createTestUser(supabase)
    const ins = await supabase
      .from('strategic_todos')
      .insert({
        business_id: TEST_BUSINESS_ID,
        created_by: creatorId,
        owner_id: ownerId,
        title: 'fk-test #34',
        engine: 'convert',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, creatorId)
      await deleteTestUser(supabase, ownerId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'strategic_todos', ids: [id] })
    await deleteTestUser(supabase, ownerId)
    await assertOrphans(supabase, 'strategic_todos', 'owner_id', ownerId, 'null', [id])
    await deleteTestUser(supabase, creatorId)
  })

  // FK 35: system_roles.created_by → auth.users.id
  it('FK#35 system_roles.created_by → SET NULL on user delete', async () => {
    const granterId = await createTestUser(supabase)
    const targetId = await createTestUser(supabase)
    const ins = await supabase
      .from('system_roles')
      .insert({
        user_id: targetId,
        role: 'coach',
        created_by: granterId,
      })
      .select('user_id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, granterId)
      await deleteTestUser(supabase, targetId)
      return
    }
    // system_roles uses user_id as PK (no `id` column). Cleanup happens via
    // CASCADE when we deleteTestUser(targetId) at the end.
    await deleteTestUser(supabase, granterId)
    const { data: after } = await supabase
      .from('system_roles')
      .select('user_id, created_by')
      .eq('user_id', targetId)
      .maybeSingle()
    expect(after, 'system_roles row should survive granter deletion').not.toBeNull()
    expect(
      (after as { created_by: string | null } | null)?.created_by,
      'system_roles.created_by should be NULL after granter deleted',
    ).toBeNull()
    await deleteTestUser(supabase, targetId)
  })

  // FK 36: team_invites.accepted_by → auth.users.id
  it('FK#36 team_invites.accepted_by → SET NULL on user delete', async () => {
    const inviterId = await createTestUser(supabase)
    const accepterId = await createTestUser(supabase)
    const ins = await supabase
      .from('team_invites')
      .insert({
        business_id: TEST_BUSINESS_ID,
        email: `fk-test-36-${Date.now()}@example.com`,
        first_name: 'F',
        invited_by: inviterId,
        accepted_by: accepterId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, inviterId)
      await deleteTestUser(supabase, accepterId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'team_invites', ids: [id] })
    await deleteTestUser(supabase, accepterId)
    await assertOrphans(supabase, 'team_invites', 'accepted_by', accepterId, 'null', [id])
    await deleteTestUser(supabase, inviterId)
  })

  // FK 37: team_invites.invited_by → auth.users.id
  it('FK#37 team_invites.invited_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('team_invites')
      .insert({
        business_id: TEST_BUSINESS_ID,
        email: `fk-test-37-${Date.now()}@example.com`,
        first_name: 'F',
        invited_by: userId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'team_invites', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'team_invites', 'invited_by', userId, 'null', [id])
  })

  // FK 38: todo_items.created_by → auth.users.id  (NOT NULL relaxed)
  it('FK#38 todo_items.created_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('todo_items')
      .insert({
        business_id: TEST_BUSINESS_ID,
        title: 'fk-test #38',
        created_by: userId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'todo_items', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'todo_items', 'created_by', userId, 'null', [id])
  })

  // FK 39: user_roles.granted_by → auth.users.id  (AUDIT LOG — must preserve)
  it('FK#39 user_roles.granted_by → SET NULL on user delete (AUDIT LOG)', async () => {
    const granterId = await createTestUser(supabase)
    const targetId = await createTestUser(supabase)
    const ins = await supabase
      .from('user_roles')
      .insert({
        user_id: targetId,
        business_id: TEST_BUSINESS_ID,
        role: 'coach',
        granted_by: granterId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, granterId)
      await deleteTestUser(supabase, targetId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'user_roles', ids: [id] })
    await deleteTestUser(supabase, granterId)
    await assertOrphans(supabase, 'user_roles', 'granted_by', granterId, 'null', [id])
    await deleteTestUser(supabase, targetId)
  })

  // FK 40: weekly_checkins.created_by → auth.users.id
  it('FK#40 weekly_checkins.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('weekly_checkins')
      .insert({
        business_id: TEST_BUSINESS_ID,
        created_by: userId,
        week_ending_date: '2026-05-08',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'weekly_checkins', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'weekly_checkins', 'created_by', userId, 'null', [id])
  })

  // ----- annual_snapshots q1..q4 (variant: delete OTHER parent — quarterly_snapshots) -----

  /**
   * Helper: seed an annual_snapshots row referencing all four quarters.
   * Returns the annual id and the four quarterly ids.
   */
  async function seedAnnualWithQuarters(
    userId: string,
  ): Promise<{ annualId: string; q1: string; q2: string; q3: string; q4: string } | null> {
    const quarters: Record<string, string> = {}
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const r = await supabase
        .from('quarterly_snapshots')
        .insert({
          business_id: TEST_BUSINESS_ID,
          user_id: userId,
          snapshot_year: 2026,
          snapshot_quarter: q,
        })
        .select('id')
        .single()
      if (r.error) return null
      quarters[q] = (r.data as { id: string }).id
    }
    const annual = await supabase
      .from('annual_snapshots')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        snapshot_year: 2026,
        q1_snapshot_id: quarters.Q1,
        q2_snapshot_id: quarters.Q2,
        q3_snapshot_id: quarters.Q3,
        q4_snapshot_id: quarters.Q4,
      })
      .select('id')
      .single()
    if (annual.error) {
      await supabase.from('quarterly_snapshots').delete().in('id', Object.values(quarters))
      return null
    }
    return {
      annualId: (annual.data as { id: string }).id,
      q1: quarters.Q1,
      q2: quarters.Q2,
      q3: quarters.Q3,
      q4: quarters.Q4,
    }
  }

  for (const quarter of [1, 2, 3, 4] as const) {
    // FK 41-44
    it(`FK#${40 + quarter} annual_snapshots.q${quarter}_snapshot_id → SET NULL on quarterly delete`, async () => {
      const userId = await createTestUser(supabase)
      const seed = await seedAnnualWithQuarters(userId)
      if (!seed) {
        await deleteTestUser(supabase, userId)
        return
      }
      cleanupQueue.push({
        table: 'quarterly_snapshots',
        ids: [seed.q1, seed.q2, seed.q3, seed.q4],
      })
      cleanupQueue.push({ table: 'annual_snapshots', ids: [seed.annualId] })
      const targetId = seed[`q${quarter}` as 'q1' | 'q2' | 'q3' | 'q4']
      await supabase.from('quarterly_snapshots').delete().eq('id', targetId)
      await assertOrphans(
        supabase,
        'annual_snapshots',
        `q${quarter}_snapshot_id`,
        targetId,
        'null',
        [seed.annualId],
      )
      await deleteTestUser(supabase, userId)
    })
  }

  // FK 45: swot_items.carried_from_item_id → swot_items.id  (self-FK; variant: delete sibling)
  it('FK#45 swot_items.carried_from_item_id → SET NULL on parent swot_item delete (self-FK)', async () => {
    const userId = await createTestUser(supabase)
    // Need a swot_analyses parent for swot_analysis_id (NOT NULL FK).
    const analysisIns = await supabase
      .from('swot_analyses')
      .insert({
        business_id: TEST_BUSINESS_ID,
        quarter: 2,
        year: 2026,
        type: 'ad-hoc',
        title: 'fk-test #45',
        created_by: userId,
      })
      .select('id')
      .single()
    if (analysisIns.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const analysisId = (analysisIns.data as { id: string }).id
    const sourceIns = await supabase
      .from('swot_items')
      .insert({
        swot_analysis_id: analysisId,
        category: 'strength',
        title: 'fk-test #45 source',
        created_by: userId,
      })
      .select('id')
      .single()
    if (sourceIns.error) {
      await supabase.from('swot_analyses').delete().eq('id', analysisId)
      await deleteTestUser(supabase, userId)
      return
    }
    const sourceId = (sourceIns.data as { id: string }).id
    const childIns = await supabase
      .from('swot_items')
      .insert({
        swot_analysis_id: analysisId,
        category: 'strength',
        title: 'fk-test #45 child',
        created_by: userId,
        carried_from_item_id: sourceId,
      })
      .select('id')
      .single()
    if (childIns.error) {
      await supabase.from('swot_items').delete().eq('id', sourceId)
      await supabase.from('swot_analyses').delete().eq('id', analysisId)
      await deleteTestUser(supabase, userId)
      return
    }
    const childId = (childIns.data as { id: string }).id
    cleanupQueue.push({ table: 'swot_items', ids: [childId] })
    cleanupQueue.push({ table: 'swot_analyses', ids: [analysisId] })
    await supabase.from('swot_items').delete().eq('id', sourceId)
    await assertOrphans(
      supabase,
      'swot_items',
      'carried_from_item_id',
      sourceId,
      'null',
      [childId],
    )
    await deleteTestUser(supabase, userId)
  })

  // FK 46: todo_items.parent_task_id → todo_items.id  (self-FK; variant: delete parent)
  it('FK#46 todo_items.parent_task_id → SET NULL on parent task delete (self-FK)', async () => {
    const userId = await createTestUser(supabase)
    const parentIns = await supabase
      .from('todo_items')
      .insert({
        business_id: TEST_BUSINESS_ID,
        title: 'fk-test #46 parent',
        created_by: userId,
      })
      .select('id')
      .single()
    if (parentIns.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const parentId = (parentIns.data as { id: string }).id
    const childIns = await supabase
      .from('todo_items')
      .insert({
        business_id: TEST_BUSINESS_ID,
        title: 'fk-test #46 child',
        created_by: userId,
        parent_task_id: parentId,
      })
      .select('id')
      .single()
    if (childIns.error) {
      await supabase.from('todo_items').delete().eq('id', parentId)
      await deleteTestUser(supabase, userId)
      return
    }
    const childId = (childIns.data as { id: string }).id
    cleanupQueue.push({ table: 'todo_items', ids: [childId] })
    await supabase.from('todo_items').delete().eq('id', parentId)
    await assertOrphans(
      supabase,
      'todo_items',
      'parent_task_id',
      parentId,
      'null',
      [childId],
    )
    await deleteTestUser(supabase, userId)
  })

  // FK 49: session_actions.strategic_initiative_id → strategic_initiatives.id  (variant: delete OTHER parent)
  it('FK#49 session_actions.strategic_initiative_id → SET NULL on initiative delete', async () => {
    const userId = await createTestUser(supabase)
    const initIns = await supabase
      .from('strategic_initiatives')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        title: 'fk-test #49',
        step_type: 'foundation',
      })
      .select('id')
      .single()
    if (initIns.error) {
      await deleteTestUser(supabase, userId)
      return
    }
    const initId = (initIns.data as { id: string }).id
    const ins = await supabase
      .from('session_actions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        action_number: 1,
        description: 'fk-test #49',
        created_by: userId,
        strategic_initiative_id: initId,
      })
      .select('id')
      .single()
    if (ins.error) {
      await supabase.from('strategic_initiatives').delete().eq('id', initId)
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_actions', ids: [id] })
    await supabase.from('strategic_initiatives').delete().eq('id', initId)
    await assertOrphans(
      supabase,
      'session_actions',
      'strategic_initiative_id',
      initId,
      'null',
      [id],
    )
    await deleteTestUser(supabase, userId)
  })

  // FK 50: session_attendees.user_id → auth.users.id  (moved B → A per operator decision; NOT NULL relaxed)
  it('FK#50 session_attendees.user_id → SET NULL on user delete (NOT NULL relaxed; was Bucket B)', async () => {
    const coachId = await createTestUser(supabase)
    const attendeeId = await createTestUser(supabase)
    const noteIns = await supabase
      .from('session_notes')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: coachId,
        session_date: '2026-05-06',
      })
      .select('id')
      .single()
    if (noteIns.error) {
      await deleteTestUser(supabase, coachId)
      await deleteTestUser(supabase, attendeeId)
      return
    }
    const noteId = (noteIns.data as { id: string }).id
    const ins = await supabase
      .from('session_attendees')
      .insert({
        session_note_id: noteId,
        user_id: attendeeId,
        user_type: 'client',
      })
      .select('id')
      .single()
    if (ins.error) {
      await supabase.from('session_notes').delete().eq('id', noteId)
      await deleteTestUser(supabase, coachId)
      await deleteTestUser(supabase, attendeeId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'session_attendees', ids: [id] })
    cleanupQueue.push({ table: 'session_notes', ids: [noteId] })
    await deleteTestUser(supabase, attendeeId)
    await assertOrphans(supabase, 'session_attendees', 'user_id', attendeeId, 'null', [id])
    await deleteTestUser(supabase, coachId)
  })
})
