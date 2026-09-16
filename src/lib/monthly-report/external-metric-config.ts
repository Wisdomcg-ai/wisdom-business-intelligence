/**
 * A placed external-data page's settings: which series it prints, over how
 * many months, in what row order, with which derived measures and notes.
 *
 * Every default is the page as it printed before any of this existed — the
 * report month, every stored row alphabetically, a Total that sums them — so a
 * placement with no config prints exactly what it did (IICT-15 says why that
 * is not enough for Calxa's HubSpot pages: eight months with the newest on the
 * left, a declared order, and budgets that sit only on the subtotals).
 *
 * WHY ROWS ARE DECLARED. The stored values carry no order and no structure:
 * "Total New Members" is a name like any other. Calxa's page is an order plus
 * an arithmetic — Total New = New ANZ + New Other — and the arithmetic is what
 * lets a subtotal carry a budget without the page double-counting it
 * (IICT-16). So the placement declares it, and a subtotal may only add rows
 * declared above it: a forward reference would add a row to two subtotals.
 */
import { z } from 'zod'

const name = z.string().trim().min(1).max(200)
const measureKey = z.string().trim().min(1).max(60)

/**
 * A stored row, a subtotal of rows above it, or one measure of one row printed
 * as its own line (Calxa's "Avg. Membership Rate", the dollars of Total Members
 * divided by its members, printed under the dollars).
 */
const rowSchema = z.union([
  z.strictObject({ dimension: name, label: name.optional() }),
  z.strictObject({ subtotal: name, of: z.array(name).min(1).max(60) }),
  z.strictObject({ line: name, row: name, measure: measureKey, under: measureKey }),
])

/** A measure computed from two others — a ratio, a difference, a sum. */
const derivedSchema = z.strictObject({
  key: measureKey,
  label: name,
  format: z.enum(['number', 'currency', 'percent']).default('number'),
  op: z.enum(['add', 'subtract', 'multiply', 'divide']),
  left: measureKey,
  right: measureKey,
})

const configSchema = z.strictObject({
  /** Narrows the placement to one series; without it, every series with values prints. */
  series_key: z.string().trim().min(1).max(120).optional(),
  /**
   * 'month' — the report month, as the page has always printed it.
   * 'trend' — `months` months with the NEWEST on the left (Calxa p3).
   */
  layout: z.enum(['month', 'trend']).default('month'),
  months: z.number().int().min(2).max(13).default(6),
  /** Which measures print, in this order. Absent: every stored measure with values, then any derived measure no line row uses. */
  measures: z.array(measureKey).min(1).max(12).optional(),
  derived_measures: z.array(derivedSchema).max(8).default([]),
  /** The page's rows, in order. Empty: every stored row alphabetically, with a Total that sums them. */
  rows: z.array(rowSchema).max(80).default([]),
  /** Bullets under the table — what the client needs told about the figures (IICT-17). */
  notes: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
})

export type ExternalMetricRow = z.infer<typeof rowSchema>
export type ExternalMetricDerived = z.infer<typeof derivedSchema>
export type ExternalMetricConfig = z.infer<typeof configSchema>

export type ParsedExternalMetricConfig =
  | { ok: true; config: ExternalMetricConfig }
  /** Still carries the defaults, so the page prints, with the reason above it. */
  | { ok: false; reason: string; config: ExternalMetricConfig }

export const DEFAULT_EXTERNAL_METRIC_CONFIG: ExternalMetricConfig = configSchema.parse({})

export const rowKey = (row: ExternalMetricRow): string =>
  'dimension' in row ? row.dimension : 'subtotal' in row ? row.subtotal : row.line

export const rowLabel = (row: ExternalMetricRow): string =>
  'dimension' in row ? row.label ?? row.dimension : 'subtotal' in row ? row.subtotal : row.line

/**
 * A bad config is a sentence on the page, not an exception and not a silent
 * fallback. Row references are checked here, where the answer does not depend
 * on this month's data; measure names are checked against the series when the
 * table is built.
 */
export function parseExternalMetricConfig(config: unknown): ParsedExternalMetricConfig {
  const result = configSchema.safeParse(config ?? {})
  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 3)
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ')
    return { ok: false, reason, config: DEFAULT_EXTERNAL_METRIC_CONFIG }
  }

  const declared = new Set<string>()
  const refuse = (reason: string): ParsedExternalMetricConfig => ({ ok: false, reason, config: DEFAULT_EXTERNAL_METRIC_CONFIG })
  for (const row of result.data.rows) {
    const key = rowKey(row)
    if (declared.has(key)) return refuse(`two rows are called “${key}”`)
    if ('subtotal' in row) {
      for (const member of row.of) {
        if (!declared.has(member)) return refuse(`“${row.subtotal}” adds “${member}”, which is not a row declared above it`)
      }
    }
    if ('line' in row && !declared.has(row.row)) {
      return refuse(`“${row.line}” reads “${row.row}”, which is not a row declared above it`)
    }
    declared.add(key)
  }

  const derivedKeys = new Set<string>()
  for (const measure of result.data.derived_measures) {
    if (derivedKeys.has(measure.key)) return refuse(`two derived measures are called “${measure.key}”`)
    derivedKeys.add(measure.key)
  }

  return { ok: true, config: result.data }
}

/** Whether a placement asks for nothing P10 added — then the page is drawn exactly as it was. */
export function isDefaultExternalMetricConfig(config: ExternalMetricConfig): boolean {
  return (
    config.layout === 'month' &&
    config.rows.length === 0 &&
    config.derived_measures.length === 0 &&
    config.notes.length === 0 &&
    config.measures === undefined
  )
}

/**
 * How many months of values the pack needs, fetched once: the longest trend
 * any placement asks for, and one — the report month — when none is placed.
 */
export function externalMetricWindowForLayout(
  widgets: readonly { type: string; config?: unknown }[],
  _reportMonth: string,
): number {
  const months = widgets
    .filter((w) => w.type === 'external_metric')
    .map((w) => {
      const parsed = parseExternalMetricConfig(w.config)
      return parsed.ok && parsed.config.layout === 'trend' ? parsed.config.months : 1
    })
  return months.length > 0 ? Math.max(...months) : 1
}

/** The trend's months, newest first: ['2026-08', '2026-07', …]. */
export function trendMonths(reportMonth: string, count: number): string[] {
  const [y, m] = reportMonth.split('-').map(Number)
  const out: string[] = []
  for (let back = 0; back < count; back++) {
    const total = y * 12 + (m - 1) - back
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return out
}
