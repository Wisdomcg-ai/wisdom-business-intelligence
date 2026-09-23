/**
 * Which `business_kpis` rows belong on a printed One-Page Plan.
 *
 * A KPI the coach removes is deactivated, not deleted — four paths set
 * is_active = false, including the goals autosave. The plan read took every
 * row, so a removed KPI reappeared on the page the moment anyone removed one.
 */

export interface KpiRowLike {
  id?: string | null
  kpi_id?: string | null
  is_active?: boolean | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * Rows still on the plan. A legacy NULL counts as active — only an explicit
 * false means removed.
 */
export function activeKpis<T extends KpiRowLike>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter(k => k?.is_active !== false)
}

/**
 * One row per KPI, keeping the most recently written copy.
 *
 * The unique index is (business_id, kpi_id), but rows written before it — and
 * the same KPI stored under both id-spaces — can repeat, and the plan prints
 * every copy. A row with neither a kpi_id nor an id is dropped: it cannot be
 * told apart from another of its kind.
 */
export function dedupeKpisByKpiId<T extends KpiRowLike>(rows: T[] | null | undefined): T[] {
  const seen = new Map<string, T>()
  for (const row of rows ?? []) {
    const key = String(row?.kpi_id ?? row?.id ?? '').trim().toLowerCase()
    if (!key) continue
    const prior = seen.get(key)
    if (!prior || String(row?.updated_at ?? '') > String(prior?.updated_at ?? '')) {
      seen.set(key, row)
    }
  }
  return Array.from(seen.values())
}

/** Both rules, in the order the plan needs them. */
export function kpisForPlan<T extends KpiRowLike>(rows: T[] | null | undefined): T[] {
  return dedupeKpisByKpiId(activeKpis(rows))
}
