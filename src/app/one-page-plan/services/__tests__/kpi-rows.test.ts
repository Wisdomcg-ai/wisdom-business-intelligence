/**
 * D7 (22 Sep 2026 system diagnostic) — the One-Page Plan printed KPIs the
 * coach had removed.
 *
 * Removing a KPI deactivates it; four paths set is_active = false, including
 * the goals autosave. The plan's read took every row for the business, so a
 * removed KPI came straight back onto the printed page. It is latent in
 * production only because nothing has been deactivated yet: 56 rows, none
 * inactive — the first removal in a session would have shown it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { activeKpis, dedupeKpisByKpiId, kpisForPlan } from '../kpi-rows'

const kpi = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  kpi_id: 'revenue',
  is_active: true,
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('activeKpis', () => {
  it('drops a KPI the coach removed', () => {
    const rows = [kpi(), kpi({ id: 'row-2', kpi_id: 'leads', is_active: false })]
    expect(activeKpis(rows).map(k => k.kpi_id)).toEqual(['revenue'])
  })

  it('keeps a legacy row with no is_active at all', () => {
    // Only an explicit false means removed — a NULL is an older row, still live.
    const rows = [kpi({ kpi_id: 'gross_margin', is_active: null }), kpi({ id: 'row-3', kpi_id: 'nps', is_active: undefined })]
    expect(activeKpis(rows).map(k => k.kpi_id)).toEqual(['gross_margin', 'nps'])
  })

  it('answers empty for no rows at all', () => {
    expect(activeKpis(null)).toEqual([])
    expect(activeKpis(undefined)).toEqual([])
    expect(activeKpis([])).toEqual([])
  })
})

describe('dedupeKpisByKpiId', () => {
  it('prints one row per KPI, keeping the most recent', () => {
    const rows = [
      kpi({ id: 'old', kpi_id: 'revenue', updated_at: '2026-01-01T00:00:00Z', current_value: 1 }),
      kpi({ id: 'new', kpi_id: 'revenue', updated_at: '2026-09-20T00:00:00Z', current_value: 2 }),
    ]
    const out = dedupeKpisByKpiId(rows)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('new')
  })

  it('treats the same kpi_id in different case as one KPI', () => {
    const rows = [kpi({ id: 'a', kpi_id: 'Revenue' }), kpi({ id: 'b', kpi_id: 'revenue', updated_at: '2026-09-21T00:00:00Z' })]
    expect(dedupeKpisByKpiId(rows)).toHaveLength(1)
  })

  it('falls back to the row id when a KPI has no kpi_id', () => {
    const rows = [kpi({ id: 'a', kpi_id: null }), kpi({ id: 'b', kpi_id: null })]
    expect(dedupeKpisByKpiId(rows).map(k => k.id)).toEqual(['a', 'b'])
  })

  it('keeps distinct KPIs apart', () => {
    const rows = [kpi({ kpi_id: 'revenue' }), kpi({ id: 'row-2', kpi_id: 'leads' })]
    expect(dedupeKpisByKpiId(rows)).toHaveLength(2)
  })
})

describe('kpisForPlan — both rules together', () => {
  it('a removed KPI does not survive as the newest copy of itself', () => {
    const rows = [
      kpi({ id: 'live', kpi_id: 'revenue', updated_at: '2026-01-01T00:00:00Z' }),
      kpi({ id: 'removed', kpi_id: 'revenue', is_active: false, updated_at: '2026-09-22T00:00:00Z' }),
      kpi({ id: 'gone', kpi_id: 'leads', is_active: false }),
    ]
    const out = kpisForPlan(rows)
    expect(out.map(k => k.id)).toEqual(['live'])
  })
})

describe('the plan assembler uses these rules', () => {
  it('reads KPIs through kpisForPlan, not straight from the query', () => {
    const source = readFileSync(path.resolve(__dirname, '../plan-data-assembler.ts'), 'utf-8')
    expect(source).toContain("from './kpi-rows'")
    expect(source).toMatch(/kpisData = kpisForPlan\(/)
    // A failed read is not silently an empty plan.
    expect(source).toContain('one_page_plan_kpi_read_failed')
  })
})
