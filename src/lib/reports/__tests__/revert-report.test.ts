/**
 * Phase 35 Plan 04 — Task 1 unit tests for revertReportIfApproved().
 *
 * Contract (D-03, D-16, D-18):
 *   - approved/sent rows → status='draft', approved_at=null, sent_at=null
 *     (snapshot_data + snapshot_taken_at NOT touched — D-18 invariant)
 *   - draft/ready_for_review → no-op (returns { reverted: false })
 *   - no row → no-op (returns { reverted: false })
 */
import { describe, it, expect, vi } from 'vitest'
import { revertReportIfApproved } from '../revert-report'

function makeSupabaseMock(selectResult: {
  data: { id: string; status: string } | null
  error?: any
}) {
  const updateEqSpy = vi.fn().mockResolvedValue({ error: null })
  const updateSpy = vi.fn().mockReturnValue({ eq: updateEqSpy })
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: selectResult.data,
            error: selectResult.error ?? null,
          }),
        }),
      }),
    }),
    update: updateSpy,
  })
  return { from, updateSpy, updateEqSpy }
}

describe('revertReportIfApproved', () => {
  it("Test 1: status='approved' row → reverts; update called without snapshot_data", async () => {
    const { from, updateSpy } = makeSupabaseMock({
      data: { id: 'row-1', status: 'approved' },
    })
    const supabase = { from } as any

    const result = await revertReportIfApproved(
      supabase,
      'biz-1',
      '2026-03-01',
    )

    expect(result).toEqual({ reverted: true, previous_status: 'approved' })
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg).toEqual({
      status: 'draft',
      approved_at: null,
      sent_at: null,
    })
    // D-18 invariant — snapshot is preserved
    expect(updateArg).not.toHaveProperty('snapshot_data')
    expect(updateArg).not.toHaveProperty('snapshot_taken_at')
  })

  it("Test 2: status='sent' row → reverts; same clearing behavior", async () => {
    const { from, updateSpy } = makeSupabaseMock({
      data: { id: 'row-2', status: 'sent' },
    })
    const supabase = { from } as any

    const result = await revertReportIfApproved(
      supabase,
      'biz-2',
      '2026-03-01',
    )

    expect(result).toEqual({ reverted: true, previous_status: 'sent' })
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg).toEqual({
      status: 'draft',
      approved_at: null,
      sent_at: null,
    })
    expect(updateArg).not.toHaveProperty('snapshot_data')
    expect(updateArg).not.toHaveProperty('snapshot_taken_at')
  })

  it("Test 3: status='draft' row → no-op, no update", async () => {
    const { from, updateSpy } = makeSupabaseMock({
      data: { id: 'row-3', status: 'draft' },
    })
    const supabase = { from } as any

    const result = await revertReportIfApproved(
      supabase,
      'biz-3',
      '2026-03-01',
    )

    expect(result).toEqual({ reverted: false })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("Test 4: status='ready_for_review' row → no-op, no update", async () => {
    const { from, updateSpy } = makeSupabaseMock({
      data: { id: 'row-4', status: 'ready_for_review' },
    })
    const supabase = { from } as any

    const result = await revertReportIfApproved(
      supabase,
      'biz-4',
      '2026-03-01',
    )

    expect(result).toEqual({ reverted: false })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('Test 5: no row exists → no-op, no update', async () => {
    const { from, updateSpy } = makeSupabaseMock({ data: null })
    const supabase = { from } as any

    const result = await revertReportIfApproved(
      supabase,
      'biz-5',
      '2026-03-01',
    )

    expect(result).toEqual({ reverted: false })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('Test 6: update call payload keys are exactly {approved_at, sent_at, status} — snapshot invariant', async () => {
    const { from, updateSpy } = makeSupabaseMock({
      data: { id: 'row-6', status: 'approved' },
    })
    const supabase = { from } as any

    await revertReportIfApproved(supabase, 'biz-6', '2026-03-01')

    const updateArg = updateSpy.mock.calls[0][0]
    expect(Object.keys(updateArg).sort()).toEqual([
      'approved_at',
      'sent_at',
      'status',
    ])
  })
})
