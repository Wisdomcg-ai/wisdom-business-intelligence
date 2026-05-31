/**
 * Phase 71-10 (D4) — Snapshot serializer
 *
 * Purpose: `GeneratedReport.sections` is typed `ReportSection[]` (an array).
 * When persisted as JSONB to `monthly_report_snapshots.report_data`, JS arrays
 * serialize with numeric keys (`{"0": {...}, "1": {...}}`), which makes it
 * impossible to resolve sections by name from raw SQL / ad-hoc tooling
 * (e.g. `report_data->'sections'->'wages_detail'` returns null because the
 * stored shape is `report_data->'sections'->'0'`).
 *
 * Fix: at the **save boundary** only, transform the array into a named-key
 * map keyed by the section category's snake_case slug (`revenue`,
 * `cost_of_sales`, …). The in-memory `GeneratedReport.sections` type remains
 * `ReportSection[]` — no downstream consumer (BudgetVsActualTable, PDF
 * service, etc.) needs to change. On the load boundary, `deserializeReportSections`
 * reverses the transform.
 *
 * Backward-compat: `serializeReportSections` and `deserializeReportSections`
 * are both **idempotent** — pass a named-key map to the serializer or an
 * array to the deserializer, and they are returned unchanged. This means:
 *   - Pre-71-10 snapshots (numeric-keyed because they were arrays JSON'd as
 *     objects with stringified-integer keys) still hydrate correctly: the
 *     deserializer treats `Object.values({"0": {...}})` as the source array.
 *   - The Phase 71-D4 backfill script remaps existing rows in-place so that
 *     after the migration runs, all rows are in named-key form.
 *
 * Named-key convention (locked per 71-10-PLAN.md):
 *   - 'Revenue'            → 'revenue'
 *   - 'Cost of Sales'      → 'cost_of_sales'
 *   - 'Operating Expenses' → 'operating_expenses'
 *   - 'Other Income'       → 'other_income'
 *   - 'Other Expenses'     → 'other_expenses'
 *
 * Unknown categories (defensive — shouldn't happen given ReportCategory union):
 *   fall back to `category.toLowerCase().replace(/\s+/g, '_')` so they are
 *   NEVER silently dropped.
 */
import type { ReportSection, ReportCategory } from '../types'

/**
 * Canonical mapping from `ReportCategory` display string to snake_case key.
 * Kept in sync with `scripts/71-D4-snapshot-sections-remap.mjs` (the backfill
 * script duplicates this map locally to avoid a TS→mjs import path).
 */
export const CATEGORY_KEY_MAP: Record<string, string> = {
  Revenue: 'revenue',
  'Cost of Sales': 'cost_of_sales',
  'Operating Expenses': 'operating_expenses',
  'Other Income': 'other_income',
  'Other Expenses': 'other_expenses',
}

/**
 * Order in which sections are reconstructed by `deserializeReportSections`.
 * Mirrors `CATEGORY_ORDER` in `useMonthlyReport.ts` so the array shape that
 * downstream consumers see is identical regardless of map insertion order.
 */
const CATEGORY_ORDER: ReportCategory[] = [
  'Revenue',
  'Cost of Sales',
  'Operating Expenses',
  'Other Income',
  'Other Expenses',
]

export type NamedSectionMap = Record<string, ReportSection>

/** Convert a category display name to its persisted snake_case key. */
export function categoryToKey(category: string): string {
  return CATEGORY_KEY_MAP[category] ?? category.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Detect whether a persisted `sections` value is already in named-key form.
 * Used by the deserializer to decide whether to passthrough or rehydrate.
 *
 * A named map is a non-array object whose keys are all non-numeric strings.
 * A numeric-keyed object (legacy JS-array-serialized-as-JSONB) returns false
 * here and is treated as an array source.
 */
function isNamedMap(value: unknown): value is NamedSectionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as object)
  if (keys.length === 0) return true // empty map is trivially "named" (no numeric drift)
  return keys.every((k) => !/^\d+$/.test(k))
}

/**
 * Serialize a `ReportSection[]` into a named-key map for JSONB persistence.
 *
 * Idempotent: if `input` is already a named-key map (e.g. caller re-saves a
 * loaded snapshot without round-tripping through the array shape), it is
 * returned unchanged.
 */
export function serializeReportSections(
  input: ReportSection[] | NamedSectionMap,
): NamedSectionMap {
  if (!Array.isArray(input)) return input
  const out: NamedSectionMap = {}
  for (const sec of input) {
    out[categoryToKey(sec.category)] = sec
  }
  return out
}

/**
 * Deserialize a persisted `sections` value back into the `ReportSection[]`
 * shape downstream consumers expect.
 *
 * Handles three input shapes for backward-compatibility:
 *   1. `ReportSection[]` — passthrough (pre-71-10 in-memory shape).
 *   2. Numeric-keyed object (`{"0": {...}, "1": {...}}`) — legacy
 *      JS-array-as-JSONB shape from existing snapshot rows. Returns
 *      `Object.values(input)` in numeric-key order.
 *   3. Named-key map (`{revenue: {...}, cost_of_sales: {...}}`) — new
 *      71-10 shape. Returns sections in `CATEGORY_ORDER`; any keys NOT in
 *      the standard order are appended at the end (passthrough so we never
 *      silently drop a section the planner didn't anticipate).
 */
export function deserializeReportSections(
  input: ReportSection[] | NamedSectionMap | Record<string, ReportSection>,
): ReportSection[] {
  if (Array.isArray(input)) return input
  if (!input || typeof input !== 'object') return []

  if (isNamedMap(input)) {
    const named = input as NamedSectionMap
    const out: ReportSection[] = []
    const standardKeys = new Set<string>()
    for (const category of CATEGORY_ORDER) {
      const key = categoryToKey(category)
      standardKeys.add(key)
      if (named[key]) out.push(named[key])
    }
    // Passthrough for any keys not in the standard order (defensive).
    for (const [key, sec] of Object.entries(named)) {
      if (!standardKeys.has(key)) out.push(sec)
    }
    return out
  }

  // Numeric-keyed legacy shape: return values in key order (numeric ascending).
  const entries = Object.entries(input) as Array<[string, ReportSection]>
  entries.sort(([a], [b]) => Number(a) - Number(b))
  return entries.map(([, sec]) => sec)
}
