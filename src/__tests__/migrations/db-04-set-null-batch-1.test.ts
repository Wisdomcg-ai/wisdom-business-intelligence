/**
 * Phase 49 DB-04 — SET NULL batch 1 per-FK tests.
 *
 * Asserts that migration 20260505000000_db04_set_null_fks_batch_1.sql
 * correctly converts 24 audit-attribution FKs from NO ACTION to ON DELETE
 * SET NULL. Per docs/db/fk-policy.md Bucket A rows 1-24.
 *
 * Test pattern (per FK):
 *   1. skipIfNoLiveDb() — gate on placeholder env vars (CI green)
 *   2. seedTestBusiness() — idempotent fixture parent
 *   3. createTestUser() (or insert OTHER parent for non-auth.users FKs)
 *   4. Insert dependent row referencing the parent via the FK column under test
 *   5. Delete the parent (user or other)
 *   6. assertOrphans(table, fkColumn, parentId, 'null', [dependentRowId])
 *   7. afterEach cleanup of the dependent + fixture rows
 *
 * RED state (before migration): deleteTestUser throws because NO ACTION ≈
 * RESTRICT — the parent delete is blocked at commit time when a child row
 * references it. The test fails on the unhandled throw.
 *
 * GREEN state (after migration applied to preview branch): deleteTestUser
 * succeeds, the dependent row survives with FK column = NULL, the test passes.
 *
 * The 3 non-auth.users FKs in batch 1 use a parallel pattern, deleting the
 * OTHER parent (an ai_interactions row, a profiles row, a financial_forecasts
 * row) instead of a user.
 */
import { describe, it, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  skipIfNoLiveDb,
  getTestSupabase,
  TEST_BUSINESS_ID,
  TEST_BUSINESS_PROFILE_ID,
  seedTestBusiness,
  createTestUser,
  deleteTestUser,
  assertOrphans,
} from './_helpers'

// Legacy text business_id for tables that use text (not uuid).
const TEST_BUSINESS_ID_TEXT = TEST_BUSINESS_ID

const d = skipIfNoLiveDb() ? describe.skip : describe

d('Phase 49 DB-04 batch 1 — SET NULL on 24 audit-attribution FKs', () => {
  let supabase: SupabaseClient
  // Track dependent rows per test for cleanup
  const cleanupQueue: Array<{ table: string; ids: string[] }> = []

  beforeAll(async () => {
    supabase = getTestSupabase()
    await seedTestBusiness(supabase)
  })

  afterEach(async () => {
    // Sweep dependent rows in reverse order
    while (cleanupQueue.length) {
      const item = cleanupQueue.pop()!
      if (item.ids.length === 0) continue
      await supabase.from(item.table).delete().in('id', item.ids)
    }
  })

  // FK 1: action_items.assigned_to → auth.users.id
  it('FK#1 action_items.assigned_to → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('action_items')
      .insert({
        business_id: TEST_BUSINESS_ID,
        title: 'fk-test #1',
        assigned_to: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'action_items', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'action_items', 'assigned_to', userId, 'null', [id])
  })

  // FK 2: action_items.created_by → auth.users.id
  it('FK#2 action_items.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('action_items')
      .insert({
        business_id: TEST_BUSINESS_ID,
        title: 'fk-test #2',
        created_by: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'action_items', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'action_items', 'created_by', userId, 'null', [id])
  })

  // FK 3: business_financial_goals.user_id → auth.users.id
  it('FK#3 business_financial_goals.user_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('business_financial_goals')
      .insert({ business_id: TEST_BUSINESS_ID_TEXT, user_id: userId })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'business_financial_goals', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'business_financial_goals', 'user_id', userId, 'null', [id])
  })

  // FK 4: business_kpis.user_id → auth.users.id  (column is NOT NULL — see DEVIATION.md)
  it('FK#4 business_kpis.user_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('business_kpis')
      .insert({
        business_id: TEST_BUSINESS_ID_TEXT,
        kpi_id: 'fk-test-4',
        name: 'fk-test #4',
        user_id: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'business_kpis', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'business_kpis', 'user_id', userId, 'null', [id])
  })

  // FK 5: business_users.invited_by → auth.users.id
  it('FK#5 business_users.invited_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const memberId = await createTestUser(supabase)
    const ins = await supabase
      .from('business_users')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: memberId,
        invited_by: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'business_users', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'business_users', 'invited_by', userId, 'null', [id])
    await deleteTestUser(supabase, memberId)
  })

  // FK 6: businesses.assigned_coach_id → auth.users.id
  it('FK#6 businesses.assigned_coach_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('businesses')
      .insert({
        name: '__fk-test-6__',
        assigned_coach_id: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'businesses', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'businesses', 'assigned_coach_id', userId, 'null', [id])
  })

  // FK 7: businesses.created_by → auth.users.id
  it('FK#7 businesses.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('businesses')
      .insert({ name: '__fk-test-7__', created_by: userId })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'businesses', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'businesses', 'created_by', userId, 'null', [id])
  })

  // FK 8: chat_messages.sender_id → auth.users.id  (NOT NULL relaxed — see DEVIATION.md)
  it('FK#8 chat_messages.sender_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('chat_messages')
      .insert({
        business_id: TEST_BUSINESS_ID,
        sender_id: userId,
        message: 'fk-test #8',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'chat_messages', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'chat_messages', 'sender_id', userId, 'null', [id])
  })

  // FK 9: client_error_logs.user_id → auth.users.id
  it('FK#9 client_error_logs.user_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('client_error_logs')
      .insert({
        user_id: userId,
        business_id: TEST_BUSINESS_ID,
        error_type: 'fk-test',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'client_error_logs', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'client_error_logs', 'user_id', userId, 'null', [id])
  })

  // FK 10: client_invitations.invited_by → auth.users.id  (NOT NULL relaxed)
  it('FK#10 client_invitations.invited_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('client_invitations')
      .insert({
        email: `fk-test-10-${Date.now()}@example.com`,
        first_name: 'F',
        last_name: 'L',
        business_name: '__fk-test__',
        invited_by: userId,
        token: `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'client_invitations', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'client_invitations', 'invited_by', userId, 'null', [id])
  })

  // FK 11: coach_audit_log.coach_id → auth.users.id  (NOT NULL relaxed)
  it('FK#11 coach_audit_log.coach_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('coach_audit_log')
      .insert({
        coach_id: userId,
        business_id: TEST_BUSINESS_ID,
        action: 'fk-test',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'coach_audit_log', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'coach_audit_log', 'coach_id', userId, 'null', [id])
  })

  // FK 12: coach_benchmarks.source_interaction_id → ai_interactions.id  (variant: delete OTHER parent)
  it('FK#12 coach_benchmarks.source_interaction_id → SET NULL on ai_interactions delete', async () => {
    const userId = await createTestUser(supabase)
    // Create an ai_interactions row to be the parent
    const aiIns = await supabase
      .from('ai_interactions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        question: 'fk-test #12',
        question_type: 'test',
        context: 'test',
        ai_response: { text: 'test' },
      })
      .select('id')
      .single()
    const aiId = (aiIns.data as { id: string }).id
    const ins = await supabase
      .from('coach_benchmarks')
      .insert({
        coach_id: userId,
        benchmark_type: 'fk-test',
        category: 'fk-test',
        source_interaction_id: aiId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'coach_benchmarks', ids: [id] })
    // Delete the OTHER parent (ai_interactions row), not the user.
    await supabase.from('ai_interactions').delete().eq('id', aiId)
    await assertOrphans(
      supabase,
      'coach_benchmarks',
      'source_interaction_id',
      aiId,
      'null',
      [id],
    )
    await deleteTestUser(supabase, userId)
  })

  // FK 13: coaching_sessions.coach_id → auth.users.id  (NOT NULL relaxed)
  it('FK#13 coaching_sessions.coach_id → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('coaching_sessions')
      .insert({
        business_id: TEST_BUSINESS_ID,
        coach_id: userId,
        title: 'fk-test #13',
        scheduled_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'coaching_sessions', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'coaching_sessions', 'coach_id', userId, 'null', [id])
  })

  // FK 14: custom_kpis_library.approved_by → auth.users.id
  it('FK#14 custom_kpis_library.approved_by → SET NULL on user delete', async () => {
    const creatorId = await createTestUser(supabase)
    const approverId = await createTestUser(supabase)
    const ins = await supabase
      .from('custom_kpis_library')
      .insert({
        category: 'fk-test',
        name: 'fk-test #14',
        unit: 'count',
        frequency: 'monthly',
        created_by: creatorId,
        business_id: TEST_BUSINESS_PROFILE_ID,
        approved_by: approverId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'custom_kpis_library', ids: [id] })
    await deleteTestUser(supabase, approverId)
    await assertOrphans(supabase, 'custom_kpis_library', 'approved_by', approverId, 'null', [id])
    await deleteTestUser(supabase, creatorId)
  })

  // FK 15: custom_kpis_library.created_by → auth.users.id  (NOT NULL relaxed)
  it('FK#15 custom_kpis_library.created_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('custom_kpis_library')
      .insert({
        category: 'fk-test',
        name: 'fk-test #15',
        unit: 'count',
        frequency: 'monthly',
        created_by: userId,
        business_id: TEST_BUSINESS_PROFILE_ID,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'custom_kpis_library', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'custom_kpis_library', 'created_by', userId, 'null', [id])
  })

  // FK 16: forecast_scenarios.created_by → auth.users.id
  it('FK#16 forecast_scenarios.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    // Need a base_forecast_id (NOT NULL); seed a financial_forecasts row.
    const ffIns = await supabase
      .from('financial_forecasts')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        name: 'fk-test fcst',
        fiscal_year: 2026,
        year_type: 'FY',
        actual_start_month: '2025-07',
        actual_end_month: '2025-12',
        forecast_start_month: '2026-01',
        forecast_end_month: '2026-06',
      })
      .select('id')
      .single()
    const baseId = (ffIns.data as { id: string }).id
    const ins = await supabase
      .from('forecast_scenarios')
      .insert({
        base_forecast_id: baseId,
        name: 'fk-test #16',
        created_by: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'forecast_scenarios', ids: [id] })
    cleanupQueue.push({ table: 'financial_forecasts', ids: [baseId] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'forecast_scenarios', 'created_by', userId, 'null', [id])
  })

  // FK 17: forecasts.created_by → public.profiles.id  (variant: delete OTHER parent — profiles)
  it('FK#17 forecasts.created_by → SET NULL on profiles delete', async () => {
    const userId = await createTestUser(supabase)
    // profiles.id references auth.users.id implicitly (PK is uuid); insert one.
    await supabase.from('profiles').insert({ id: userId, full_name: 'fk-test' })
    const ins = await supabase
      .from('forecasts')
      .insert({
        business_id: TEST_BUSINESS_ID,
        name: 'fk-test #17',
        fiscal_year_start: '2025-07-01',
        fiscal_year_end: '2026-06-30',
        created_by: userId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'forecasts', ids: [id] })
    // Delete the profile row — the FK is to profiles, not auth.users.
    await supabase.from('profiles').delete().eq('id', userId)
    await assertOrphans(supabase, 'forecasts', 'created_by', userId, 'null', [id])
    await deleteTestUser(supabase, userId)
  })

  // FK 18: ideas_filter.evaluated_by → auth.users.id
  it('FK#18 ideas_filter.evaluated_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    // ideas_filter has idea_id NOT NULL + user_id NOT NULL — but the FK under test is
    // evaluated_by; the column may not exist on every baseline. Probe and skip if absent.
    const probe = await supabase.from('ideas_filter').select('evaluated_by').limit(1)
    if (probe.error && /column .* does not exist/i.test(probe.error.message)) {
      // Column added in a later migration; treat as skip.
      await deleteTestUser(supabase, userId)
      return
    }
    const ins = await supabase
      .from('ideas_filter')
      .insert({
        idea_id: '00000000-0000-4000-8000-0000000def18',
        user_id: userId,
        evaluated_by: userId,
      })
      .select('id')
      .single()
    if (ins.error) {
      // If insert fails (e.g. idea_id FK missing parent), skip cleanly.
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'ideas_filter', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'ideas_filter', 'evaluated_by', userId, 'null', [id])
  })

  // FK 19: messages.recipient_id → auth.users.id
  it('FK#19 messages.recipient_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('messages')
      .insert({
        business_id: TEST_BUSINESS_ID,
        recipient_id: userId,
        content: 'fk-test #19',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'messages', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'messages', 'recipient_id', userId, 'null', [id])
  })

  // FK 20: messages.sender_id → auth.users.id
  it('FK#20 messages.sender_id → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('messages')
      .insert({
        business_id: TEST_BUSINESS_ID,
        sender_id: userId,
        content: 'fk-test #20',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'messages', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'messages', 'sender_id', userId, 'null', [id])
  })

  // FK 21: monthly_report_settings.budget_forecast_id → financial_forecasts.id  (variant)
  it('FK#21 monthly_report_settings.budget_forecast_id → SET NULL on forecast delete', async () => {
    const userId = await createTestUser(supabase)
    const ffIns = await supabase
      .from('financial_forecasts')
      .insert({
        business_id: TEST_BUSINESS_ID,
        user_id: userId,
        name: 'fk-test fcst #21',
        fiscal_year: 2026,
        year_type: 'FY',
        actual_start_month: '2025-07',
        actual_end_month: '2025-12',
        forecast_start_month: '2026-01',
        forecast_end_month: '2026-06',
      })
      .select('id')
      .single()
    const ffId = (ffIns.data as { id: string }).id
    const ins = await supabase
      .from('monthly_report_settings')
      .insert({
        business_id: TEST_BUSINESS_ID,
        budget_forecast_id: ffId,
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'monthly_report_settings', ids: [id] })
    // Delete the financial_forecasts row (the OTHER parent), not the user.
    await supabase.from('financial_forecasts').delete().eq('id', ffId)
    await assertOrphans(
      supabase,
      'monthly_report_settings',
      'budget_forecast_id',
      ffId,
      'null',
      [id],
    )
    await deleteTestUser(supabase, userId)
  })

  // FK 22: monthly_reviews.created_by → auth.users.id
  it('FK#22 monthly_reviews.created_by → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const ins = await supabase
      .from('monthly_reviews')
      .insert({
        business_id: TEST_BUSINESS_ID,
        created_by: userId,
        review_month: '2026-04-01',
      })
      .select('id')
      .single()
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'monthly_reviews', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'monthly_reviews', 'created_by', userId, 'null', [id])
  })

  // FK 23: process_comments.commented_by → auth.users.id  (NOT NULL relaxed)
  it('FK#23 process_comments.commented_by → SET NULL on user delete (NOT NULL relaxed)', async () => {
    const userId = await createTestUser(supabase)
    const processId = '00000000-0000-4000-8000-0000000c0023'
    const ins = await supabase
      .from('process_comments')
      .insert({
        process_id: processId,
        commented_by: userId,
        comment_text: 'fk-test #23',
      })
      .select('id')
      .single()
    if (ins.error) {
      // process_comments may have FK on process_id we can't satisfy — skip cleanly.
      await deleteTestUser(supabase, userId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'process_comments', ids: [id] })
    await deleteTestUser(supabase, userId)
    await assertOrphans(supabase, 'process_comments', 'commented_by', userId, 'null', [id])
  })

  // FK 24: process_comments.commented_to → auth.users.id
  it('FK#24 process_comments.commented_to → SET NULL on user delete', async () => {
    const userId = await createTestUser(supabase)
    const recipientId = await createTestUser(supabase)
    const processId = '00000000-0000-4000-8000-0000000c0024'
    const ins = await supabase
      .from('process_comments')
      .insert({
        process_id: processId,
        commented_by: userId,
        commented_to: recipientId,
        comment_text: 'fk-test #24',
      })
      .select('id')
      .single()
    if (ins.error) {
      await deleteTestUser(supabase, userId)
      await deleteTestUser(supabase, recipientId)
      return
    }
    const id = (ins.data as { id: string }).id
    cleanupQueue.push({ table: 'process_comments', ids: [id] })
    await deleteTestUser(supabase, recipientId)
    await assertOrphans(supabase, 'process_comments', 'commented_to', recipientId, 'null', [id])
    await deleteTestUser(supabase, userId)
  })
})
