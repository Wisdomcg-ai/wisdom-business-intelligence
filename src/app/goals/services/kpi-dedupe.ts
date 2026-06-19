/**
 * Dual-ID dedupe for business_kpis rows.
 *
 * A single client's KPI can exist under BOTH the canonical business_profiles.id
 * AND the businesses.id (legacy dual-ID fragmentation), so a read across both
 * id-spaces can return two rows for one kpi_id. Keep ONE:
 *   - the most-recently-updated row wins (never revert a newer save), and
 *   - on an exact timestamp tie, the canonical profile-id row wins.
 *
 * Pure + side-effect-free so it is unit-testable without a Supabase mock.
 */
export interface DedupableKpiRow {
  kpi_id: string
  business_id?: string
  updated_at?: string | null
  created_at?: string | null
}

export function dedupeKpiRowsByRecency<T extends DedupableKpiRow>(rows: T[], profileId: string): T[] {
  const byKpiId = new Map<string, T>()
  for (const row of rows) {
    const existing = byKpiId.get(row.kpi_id)
    if (!existing) {
      byKpiId.set(row.kpi_id, row)
      continue
    }
    const rowTs = String(row.updated_at || row.created_at || '')
    const exTs = String(existing.updated_at || existing.created_at || '')
    if (rowTs > exTs || (rowTs === exTs && row.business_id === profileId)) {
      byKpiId.set(row.kpi_id, row)
    }
  }
  return Array.from(byKpiId.values())
}
