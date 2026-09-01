import { describe, it, expect } from 'vitest'
import {
  deriveStage,
  dueDateForMonth,
  daysOverdue,
  daysSince,
  summariseRecon,
  deriveSection,
  type ReconCheckRow,
} from '../board-logic'

describe('deriveStage', () => {
  it('reports the furthest stage reached', () => {
    expect(deriveStage(null)).toBe('none')
    expect(deriveStage({})).toBe('none')
    expect(deriveStage({ generated_at: '2026-09-14' })).toBe('generated')
    expect(deriveStage({ status: 'ready_for_review', generated_at: '2026-09-14' })).toBe('ready')
    expect(deriveStage({ status: 'approved' })).toBe('approved')
    expect(deriveStage({ status: 'sent' })).toBe('sent')
  })

  it('discussed wins even after a status revert — the meeting happened', () => {
    expect(deriveStage({ status: 'draft', discussed_at: '2026-09-20', generated_at: '2026-09-14' })).toBe('discussed')
  })

  it('a draft status row with no snapshot ever saved is none, not generated', () => {
    expect(deriveStage({ status: 'draft', generated_at: null })).toBe('none')
  })
})

describe('dueDateForMonth', () => {
  it('is dueDay of the month AFTER the report month', () => {
    expect(dueDateForMonth('2026-08', 10)).toBe('2026-09-10')
  })

  it('rolls over the year boundary', () => {
    expect(dueDateForMonth('2026-12', 5)).toBe('2027-01-05')
  })

  it('null when no due day configured or inputs malformed', () => {
    expect(dueDateForMonth('2026-08', null)).toBeNull()
    expect(dueDateForMonth('2026-08', 0)).toBeNull()
    expect(dueDateForMonth('2026-08', 29)).toBeNull()
    expect(dueDateForMonth('garbage', 10)).toBeNull()
    expect(dueDateForMonth('2026-13', 10)).toBeNull()
  })
})

describe('daysOverdue', () => {
  it('whole days past due', () => {
    expect(daysOverdue('2026-09-10', '2026-09-16')).toBe(6)
  })

  it('0 when due today or not yet due; null when no due date', () => {
    expect(daysOverdue('2026-09-16', '2026-09-16')).toBe(0)
    expect(daysOverdue('2026-09-20', '2026-09-16')).toBe(0)
    expect(daysOverdue(null, '2026-09-16')).toBeNull()
  })
})

const okCheck = (tenant: string, count: number, over: Partial<ReconCheckRow> = {}): ReconCheckRow => ({
  tenant_id: tenant,
  status: 'ok',
  checked_at: '2026-09-16T07:00:00Z',
  source: 'account_transactions',
  total_unreconciled_count: count,
  total_unreconciled_value: count * 100,
  ...over,
})

describe('summariseRecon', () => {
  it('aggregates buckets by month across tenants and accounts', () => {
    const summary = summariseRecon(
      [okCheck('t1', 6), okCheck('t2', 17)],
      [
        { tenant_id: 't1', month: '2026-07-01', unreconciled_count: 6, unreconciled_value: 8140 },
        { tenant_id: 't2', month: '2026-08-01', unreconciled_count: 10, unreconciled_value: 30000 },
        { tenant_id: 't2', month: '2026-08-01', unreconciled_count: 7, unreconciled_value: 12315 },
      ],
      2,
    )
    expect(summary.state).toBe('outstanding')
    expect(summary.totalCount).toBe(23)
    expect(summary.months).toEqual([
      { month: '2026-07', count: 6, value: 8140 },
      { month: '2026-08', count: 17, value: 42315 },
    ])
  })

  it('zero outstanding across all checked tenants is clear', () => {
    const summary = summariseRecon([okCheck('t1', 0)], [], 1)
    expect(summary.state).toBe('clear')
    expect(summary.totalCount).toBe(0)
  })

  it('no successful check is UNKNOWN, never zero (fail-closed)', () => {
    expect(summariseRecon([], [], 2).state).toBe('unknown')
    expect(
      summariseRecon([{ ...okCheck('t1', 0), status: 'error' }], [], 1).state,
    ).toBe('unknown')
  })

  it('a 3-org business with 2 checked is partial — a floor, not a total', () => {
    const summary = summariseRecon([okCheck('t1', 4), okCheck('t2', 0)], [], 3)
    expect(summary.state).toBe('partial')
    expect(summary.erroredTenants).toBe(1)
    expect(summary.checkedTenants).toBe(2)
  })

  it('uses the OLDEST successful check as the business as-at time', () => {
    const summary = summariseRecon(
      [
        okCheck('t1', 0, { checked_at: '2026-09-16T07:00:00Z' }),
        okCheck('t2', 0, { checked_at: '2026-09-15T07:00:00Z' }),
      ],
      [],
      2,
    )
    expect(summary.checkedAt).toBe('2026-09-15T07:00:00Z')
  })
})

describe('deriveSection', () => {
  const base = {
    stage: 'none' as const,
    daysOverdue: null,
    connectionNeedsAttention: false,
    reconState: 'clear' as const,
  }

  it('sent/discussed reports are done regardless of data problems', () => {
    expect(deriveSection({ ...base, stage: 'sent', connectionNeedsAttention: true })).toBe('sent')
    expect(deriveSection({ ...base, stage: 'discussed', daysOverdue: 9 })).toBe('sent')
  })

  it('overdue trumps blocked', () => {
    expect(
      deriveSection({ ...base, daysOverdue: 6, connectionNeedsAttention: true }),
    ).toBe('overdue')
  })

  it('data-not-ready states block: connection, unknown recon, partial recon', () => {
    expect(deriveSection({ ...base, connectionNeedsAttention: true })).toBe('blocked')
    expect(deriveSection({ ...base, reconState: 'unknown' })).toBe('blocked')
    expect(deriveSection({ ...base, stage: 'generated', reconState: 'partial' })).toBe('blocked')
  })

  it('outstanding items block only BEFORE generation; after, they warn (in progress)', () => {
    expect(deriveSection({ ...base, reconState: 'outstanding' })).toBe('blocked')
    expect(deriveSection({ ...base, stage: 'generated', reconState: 'outstanding' })).toBe('in_progress')
  })

  it('all clear and nothing generated yet = ready to generate (in progress)', () => {
    expect(deriveSection(base)).toBe('in_progress')
    expect(deriveSection({ ...base, daysOverdue: 0 })).toBe('in_progress')
  })
})

describe('summariseRecon — currency safety (the IICT HKD lesson)', () => {
  const bucket = (tenant: string, month: string, count: number, value: number, currency: string | null) => ({
    tenant_id: tenant, month, unreconciled_count: count, unreconciled_value: value, currency,
  })

  it('a single shared currency keeps values and names it', () => {
    const s = summariseRecon([okCheck('t1', 25)], [bucket('t1', '2026-08-01', 25, 42533.4, 'HKD')], 1)
    expect(s.mixedCurrencies).toBe(false)
    expect(s.currency).toBe('HKD')
    expect(s.months[0].value).toBe(42533.4)
  })

  it('mixed currencies suppress ALL values but never the counts', () => {
    const s = summariseRecon(
      [okCheck('t1', 26)],
      [bucket('t1', '2026-08-01', 25, 42533.4, 'HKD'), bucket('t1', '2026-08-01', 1, 217, 'AUD')],
      1,
    )
    expect(s.mixedCurrencies).toBe(true)
    expect(s.currency).toBeNull()
    expect(s.totalValue).toBeNull()
    expect(s.months).toEqual([{ month: '2026-08', count: 26, value: null }])
  })

  it('legacy rows without currency behave as a single (unnamed) currency', () => {
    const s = summariseRecon([okCheck('t1', 2)], [bucket('t1', '2026-07-01', 2, 100, null)], 1)
    expect(s.mixedCurrencies).toBe(false)
    expect(s.currency).toBeNull()
    expect(s.months[0].value).toBe(100)
  })
})

describe('summariseRecon — source labelling', () => {
  it('names the single source, or mixed across orgs', () => {
    expect(summariseRecon([okCheck('t1', 0)], [], 1).source).toBe('account_transactions')
    expect(
      summariseRecon([okCheck('t1', 0, { source: 'statement_lines' })], [], 1).source,
    ).toBe('statement_lines')
    expect(
      summariseRecon(
        [okCheck('t1', 0, { source: 'statement_lines' }), okCheck('t2', 0)],
        [],
        2,
      ).source,
    ).toBe('mixed')
    expect(summariseRecon([], [], 1).source).toBeNull()
  })
})

describe('daysSince (coding staleness)', () => {
  it('whole days since the date; zero-floors future dates', () => {
    expect(daysSince('2026-08-03', '2026-09-01')).toBe(29)
    expect(daysSince('2026-09-05', '2026-09-01')).toBe(0)
  })
  it('null when unknown — unknown must never render as fresh', () => {
    expect(daysSince(null, '2026-09-01')).toBeNull()
    expect(daysSince('garbage', '2026-09-01')).toBeNull()
  })
})
