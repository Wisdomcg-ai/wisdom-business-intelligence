import { describe, it, expect } from 'vitest'
import {
  UNRECONCILED_AUTHORISED,
  sinceWhere,
  monthRangeWhere,
} from '../where-clauses'

describe('UNRECONCILED_AUTHORISED (the DELETED trap pin)', () => {
  it('is exactly the authorised-only unreconciled clause — deleted txns keep IsReconciled=false forever', () => {
    expect(UNRECONCILED_AUTHORISED).toBe('Status=="AUTHORISED" AND IsReconciled==false')
  })

  it('composes into the URL shape both counting sites fetch', () => {
    const url = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(
      `${UNRECONCILED_AUTHORISED} AND ${sinceWhere('2025-10-01')}`,
    )}&page=1`
    expect(url).toContain('Status%3D%3D%22AUTHORISED%22')
    expect(url).toContain('IsReconciled%3D%3Dfalse')
    expect(url).toContain('Date%3E%3DDateTime(2025%2C10%2C1)')
  })
})

describe('sinceWhere', () => {
  it('builds a Date floor', () => {
    expect(sinceWhere('2025-10-01')).toBe('Date>=DateTime(2025,10,1)')
  })
  it('rejects malformed input rather than emitting a broken clause', () => {
    expect(sinceWhere('2025-10')).toBeNull()
    expect(sinceWhere('garbage')).toBeNull()
  })
})

describe('monthRangeWhere', () => {
  it('spans the whole calendar month, leap-aware', () => {
    expect(monthRangeWhere('2026-08')).toBe('Date>=DateTime(2026,8,1) AND Date<=DateTime(2026,8,31)')
    expect(monthRangeWhere('2028-02')).toBe('Date>=DateTime(2028,2,1) AND Date<=DateTime(2028,2,29)')
  })
  it('rejects malformed months', () => {
    expect(monthRangeWhere('2026-13')).toBeNull()
    expect(monthRangeWhere('aug')).toBeNull()
  })
})
