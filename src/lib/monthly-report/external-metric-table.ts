/**
 * The external-data page's figures: the entered values arranged as the client's
 * insert sets them out (P10 — IICT-15, IICT-16, DD-22, DRG-38).
 *
 * One month or a trend of N with the newest on the left; the rows in the order
 * the placement declares, with subtotals added from the rows above them and
 * derived measures (a ratio, a difference) worked out after those subtotals —
 * so an average rate is the total divided, not an average of averages.
 *
 * A subtotal's BUDGET is the one entered against it, or the sum of its rows'
 * budgets when every one of them has a budget. That is the whole of IICT-16:
 * Calxa's HubSpot budget sits on Total New Members and Total Renewing members
 * and nowhere else, and a Total that summed every printed row would count them
 * twice.
 *
 * Nothing is invented and nothing entered disappears in silence: a month with
 * no figure is null (a dash), a division by nothing is null, a row entered but
 * not declared is named on the page, and a figure entered against a subtotal is
 * not printed over the sum — the page says so.
 *
 * Pure.
 */
import {
  rowKey,
  rowLabel,
  trendMonths,
  type ExternalMetricConfig,
  type ExternalMetricDerived,
} from './external-metric-config'

export interface MetricValueRow {
  /** Absent on the report month's own rows, which is what the month layout reads. */
  period_month?: string
  dimension_value: string
  measure_key: string
  scenario: string
  value: number | string
}

export interface ExternalMetricSeriesLike {
  dimension_label: string
  measures: { key: string; label: string; format?: string }[]
  values: MetricValueRow[]
  /** The trend window's values, month by month (external-metrics-load). */
  history?: MetricValueRow[]
}

export interface MetricMeasure {
  key: string
  label: string
  format?: string
  derived: boolean
}

export interface MetricCell {
  actual: number | null
  budget: number | null
}

export interface MetricRow {
  /** The stored dimension value, the subtotal's name, or the line's label. */
  key: string
  label: string
  kind: 'dimension' | 'subtotal' | 'line' | 'total'
  /** A line row prints under this measure and nowhere else. */
  under?: string
  /** measure key → month → the cell. A measure a row does not print has no entry. */
  cells: Record<string, Record<string, MetricCell>>
}

export interface ExternalMetricTable {
  dimension_label: string
  /** Newest first for a trend; the report month alone otherwise. */
  months: string[]
  measures: MetricMeasure[]
  rows: MetricRow[]
  /** Whether any budget was entered for a measure — the column pair prints only then. */
  has_budget: Record<string, boolean>
  /** What the page has to say about the figures it was given. */
  notes: string[]
}

export type ExternalMetricTableResult =
  | { ok: true; table: ExternalMetricTable }
  | { ok: false; reason: string }

const num = (v: number | string): number => (typeof v === 'number' ? v : Number(v))

function compute(op: ExternalMetricDerived['op'], left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null
  switch (op) {
    case 'add': return left + right
    case 'subtract': return left - right
    case 'multiply': return left * right
    // A rate over nothing is not zero.
    case 'divide': return right === 0 ? null : left / right
  }
}

export function buildExternalMetricTable(
  series: ExternalMetricSeriesLike,
  config: ExternalMetricConfig,
  reportMonth: string,
): ExternalMetricTableResult {
  const months = config.layout === 'trend' ? trendMonths(reportMonth, config.months) : [reportMonth]
  const source = config.layout === 'trend' ? series.history ?? series.values : series.values

  const stored = new Map(series.measures.map((m) => [m.key, m]))
  const derived = new Map(config.derived_measures.map((m) => [m.key, m]))
  const known = (key: string) => stored.has(key) || derived.has(key)

  // A measure named nowhere in the series is a typo, and an empty column is
  // how a typo looks on paper. Say so instead.
  for (const measure of config.derived_measures) {
    for (const side of [measure.left, measure.right]) {
      if (!known(side)) return { ok: false, reason: `“${measure.label}” is worked out from “${side}”, which this series does not measure` }
    }
  }
  for (const key of config.measures ?? []) {
    if (!known(key)) return { ok: false, reason: `this page asks for “${key}”, which this series does not measure` }
  }
  for (const row of config.rows) {
    if ('line' in row) {
      if (!known(row.measure)) return { ok: false, reason: `“${row.line}” prints “${row.measure}”, which this series does not measure` }
      if (!known(row.under)) return { ok: false, reason: `“${row.line}” prints under “${row.under}”, which this series does not measure` }
    }
  }

  const inWindow = new Set(months)
  const valued = source.filter((v) => inWindow.has(v.period_month ?? reportMonth))
  const byCell = new Map<string, number>()
  const storedWithValues = new Set<string>()
  const storedDimensions = new Set<string>()
  for (const v of valued) {
    byCell.set(`${v.period_month ?? reportMonth}|${v.dimension_value}|${v.measure_key}|${v.scenario}`, num(v.value))
    storedWithValues.add(v.measure_key)
    storedDimensions.add(v.dimension_value)
  }

  // Which measures print: what the placement asks for, or every stored measure
  // that carries a figure, then any derived measure no line row already prints.
  const linedMeasures = new Set(config.rows.flatMap((r) => ('line' in r ? [r.measure] : [])))
  const measureKeys = config.measures ?? [
    ...series.measures.filter((m) => storedWithValues.has(m.key)).map((m) => m.key),
    ...config.derived_measures.filter((m) => !linedMeasures.has(m.key)).map((m) => m.key),
  ]
  const measures: MetricMeasure[] = measureKeys.map((key) => {
    const d = derived.get(key)
    if (d) return { key, label: d.label, format: d.format, derived: true }
    const s = stored.get(key)!
    return { key, label: s.label, format: s.format, derived: false }
  })

  // Every measure a cell may need — the printed ones and the ones they are
  // worked out from.
  const needed = new Set<string>(measureKeys)
  for (const row of config.rows) if ('line' in row) { needed.add(row.measure); needed.add(row.under) }
  let added = true
  while (added) {
    added = false
    for (const [key, m] of derived) {
      if (!needed.has(key)) continue
      for (const side of [m.left, m.right]) if (!needed.has(side)) { needed.add(side); added = true }
    }
  }
  const storedNeeded = [...needed].filter((k) => stored.has(k))

  const declared = config.rows.length > 0
  const dimensionRows = declared
    ? config.rows.flatMap((r) => ('dimension' in r ? [r.dimension] : []))
    : [...storedDimensions].sort((a, b) => a.localeCompare(b))

  const rows: MetricRow[] = []
  const byKey = new Map<string, MetricRow>()
  const notes: string[] = []

  const emptyCells = () => {
    const cells: Record<string, Record<string, MetricCell>> = {}
    for (const key of [...storedNeeded, ...[...derived.keys()].filter((k) => needed.has(k))]) cells[key] = {}
    return cells
  }

  /** The derived measures for one row, once its stored figures are in. */
  const fillDerived = (cells: MetricRow['cells']) => {
    for (const [key, m] of derived) {
      if (!needed.has(key)) continue
      cells[key] = {}
      for (const month of months) {
        const left = cells[m.left]?.[month]
        const right = cells[m.right]?.[month]
        cells[key][month] = {
          actual: compute(m.op, left?.actual ?? null, right?.actual ?? null),
          budget: compute(m.op, left?.budget ?? null, right?.budget ?? null),
        }
      }
    }
  }

  const addRow = (row: MetricRow) => { rows.push(row); byKey.set(row.key, row) }

  const dimensionRow = (key: string, label: string): MetricRow => {
    const cells = emptyCells()
    for (const measure of storedNeeded) {
      for (const month of months) {
        cells[measure][month] = {
          actual: byCell.get(`${month}|${key}|${measure}|actual`) ?? null,
          budget: byCell.get(`${month}|${key}|${measure}|budget`) ?? null,
        }
      }
    }
    fillDerived(cells)
    return { key, label, kind: 'dimension', cells }
  }

  const sumRow = (key: string, label: string, kind: 'subtotal' | 'total', members: MetricRow[]): MetricRow => {
    const cells = emptyCells()
    for (const measure of storedNeeded) {
      for (const month of months) {
        const parts = members.map((m) => m.cells[measure]?.[month])
        const actuals = parts.map((p) => p?.actual ?? null).filter((v): v is number => v !== null)
        const budgets = parts.map((p) => p?.budget ?? null)
        // A subtotal's own budget, when one was entered against it; otherwise
        // the rows' budgets, but only when every row has one.
        const entered = kind === 'subtotal' ? byCell.get(`${month}|${key}|${measure}|budget`) ?? null : null
        const summedBudgets = budgets.every((b) => b !== null) && budgets.length > 0
          ? (budgets as number[]).reduce((t, b) => t + b, 0)
          : null
        cells[measure][month] = {
          actual: actuals.length > 0 ? actuals.reduce((t, v) => t + v, 0) : null,
          budget: entered ?? summedBudgets,
        }
      }
    }
    fillDerived(cells)
    return { key, label, kind, cells }
  }

  if (declared) {
    for (const row of config.rows) {
      const key = rowKey(row)
      if ('dimension' in row) {
        addRow(dimensionRow(key, rowLabel(row)))
      } else if ('subtotal' in row) {
        const members = row.of.map((m) => byKey.get(m)!).filter(Boolean)
        addRow(sumRow(key, rowLabel(row), 'subtotal', members))
        // A figure entered against a subtotal is not printed over the sum.
        if (months.some((month) => storedNeeded.some((measure) => byCell.has(`${month}|${key}|${measure}|actual`)))) {
          notes.push(`“${key}” is the sum of the rows above it; a figure entered against it is not printed.`)
        }
      } else {
        const of = byKey.get(row.row)!
        const cells: MetricRow['cells'] = { [row.under]: {} }
        for (const month of months) cells[row.under][month] = of.cells[row.measure]?.[month] ?? { actual: null, budget: null }
        addRow({ key, label: rowLabel(row), kind: 'line', under: row.under, cells })
      }
    }
    // Nothing entered vanishes without a word.
    const printed = new Set(rows.map((r) => r.key))
    const missing = [...storedDimensions].filter((d) => !printed.has(d)).sort((a, b) => a.localeCompare(b))
    if (missing.length > 0) {
      notes.push(
        config.layout === 'trend'
          ? `Entered in the months shown but not on this page: ${missing.join(', ')}.`
          : `Entered this month but not on this page: ${missing.join(', ')}.`,
      )
    }
  } else {
    for (const dimension of dimensionRows) addRow(dimensionRow(dimension, dimension))
    addRow(sumRow('Total', 'Total', 'total', [...rows]))
  }

  const hasBudget: Record<string, boolean> = {}
  for (const measure of measures) {
    hasBudget[measure.key] = rows.some((r) => months.some((m) => r.cells[measure.key]?.[m]?.budget !== null && r.cells[measure.key]?.[m]?.budget !== undefined))
  }

  return {
    ok: true,
    table: { dimension_label: series.dimension_label, months, measures, rows, has_budget: hasBudget, notes },
  }
}
