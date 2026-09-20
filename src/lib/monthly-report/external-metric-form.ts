/**
 * The external-data placement's settings as a form, and the config they store.
 *
 * Thin panel, same as the ratio page's and the payroll page's: the form state,
 * the round trip and validity live here, and validity is
 * parseExternalMetricConfig — the rule the PDF applies — so a page the PDF
 * would refuse cannot be applied. A choice left at the default is not stored.
 */
import {
  DEFAULT_EXTERNAL_METRIC_CONFIG,
  parseExternalMetricConfig,
  rowKey,
  type ExternalMetricConfig,
} from './external-metric-config'

export interface MetricRowForm {
  kind: 'dimension' | 'subtotal' | 'line'
  /** The stored row's name, the subtotal's name, or the line's label. */
  name: string
  /** dimension: an optional label to print instead of the stored name. */
  label: string
  /** subtotal: the rows above it that it adds. */
  of: string[]
  /** line: the row it reads, the measure it prints, and the measure it prints under. */
  row: string
  measure: string
  under: string
}

export interface MetricDerivedForm {
  key: string
  label: string
  format: 'number' | 'currency' | 'percent'
  op: 'add' | 'subtract' | 'multiply' | 'divide'
  left: string
  right: string
}

export interface ExternalMetricForm {
  series_key: string
  layout: 'month' | 'trend'
  months: string
  /** Comma-separated measure keys; blank means every measure with figures. */
  measures: string
  derived: MetricDerivedForm[]
  rows: MetricRowForm[]
  /** One bullet a line. */
  notes: string
}

export const EMPTY_ROW: MetricRowForm = { kind: 'dimension', name: '', label: '', of: [], row: '', measure: '', under: '' }
export const EMPTY_DERIVED: MetricDerivedForm = { key: '', label: '', format: 'number', op: 'divide', left: '', right: '' }

export function externalFormFromConfig(config: unknown): { form: ExternalMetricForm; unreadable?: string } {
  const parsed = parseExternalMetricConfig(config)
  const c = parsed.config
  // A config the parser refused still has its series key: the panel opens on
  // the page the coach meant, not on a blank one.
  const seriesKey = parsed.ok
    ? c.series_key ?? ''
    : (config as { series_key?: unknown } | null | undefined)?.series_key
      ? String((config as { series_key: unknown }).series_key)
      : ''
  const form: ExternalMetricForm = {
    series_key: seriesKey,
    layout: c.layout,
    months: String(c.months),
    measures: (c.measures ?? []).join(', '),
    derived: c.derived_measures.map((m) => ({ key: m.key, label: m.label, format: m.format, op: m.op, left: m.left, right: m.right })),
    rows: c.rows.map((r) => ({
      ...EMPTY_ROW,
      kind: 'dimension' in r ? 'dimension' : 'subtotal' in r ? 'subtotal' : 'line',
      name: rowKey(r),
      label: 'dimension' in r ? r.label ?? '' : '',
      of: 'subtotal' in r ? [...r.of] : [],
      row: 'line' in r ? r.row : '',
      measure: 'line' in r ? r.measure : '',
      under: 'line' in r ? r.under : '',
    })),
    notes: c.notes.join('\n'),
  }
  return parsed.ok ? { form } : { form, unreadable: parsed.reason }
}

export function externalConfigFromForm(form: ExternalMetricForm): Record<string, unknown> {
  const d = DEFAULT_EXTERNAL_METRIC_CONFIG
  const config: Record<string, unknown> = {}
  if (form.series_key.trim()) config.series_key = form.series_key.trim()
  if (form.layout !== d.layout) config.layout = form.layout
  const months = Number(form.months)
  if (form.layout === 'trend' && Number.isFinite(months) && months !== d.months) config.months = months
  const measures = form.measures.split(',').map((m) => m.trim()).filter(Boolean)
  if (measures.length > 0) config.measures = measures
  const derived = form.derived
    .filter((m) => m.key.trim() || m.label.trim())
    .map((m) => ({ key: m.key.trim(), label: m.label.trim(), format: m.format, op: m.op, left: m.left.trim(), right: m.right.trim() }))
  if (derived.length > 0) config.derived_measures = derived
  const rows = form.rows
    .filter((r) => r.name.trim() !== '')
    .map((r) => {
      if (r.kind === 'dimension') {
        return r.label.trim() ? { dimension: r.name.trim(), label: r.label.trim() } : { dimension: r.name.trim() }
      }
      if (r.kind === 'subtotal') return { subtotal: r.name.trim(), of: r.of }
      return { line: r.name.trim(), row: r.row.trim(), measure: r.measure.trim(), under: r.under.trim() }
    })
  if (rows.length > 0) config.rows = rows
  const notes = form.notes.split('\n').map((n) => n.trim()).filter(Boolean)
  if (notes.length > 0) config.notes = notes
  return config
}

export type ExternalFormVerdict =
  | { ok: true; config: Record<string, unknown>; parsed: ExternalMetricConfig }
  | { ok: false; reason: string }

export function validateExternalForm(form: ExternalMetricForm): ExternalFormVerdict {
  const config = externalConfigFromForm(form)
  const parsed = parseExternalMetricConfig(config)
  return parsed.ok ? { ok: true, config, parsed: parsed.config } : { ok: false, reason: parsed.reason }
}

/** The rows declared above this one — what a subtotal may add and a line may read. */
export function rowsAbove(form: ExternalMetricForm, index: number): string[] {
  return form.rows.slice(0, index).map((r) => r.name.trim()).filter(Boolean)
}

export function moveMetricRow(form: ExternalMetricForm, index: number, by: -1 | 1): ExternalMetricForm {
  const to = index + by
  if (to < 0 || to >= form.rows.length) return form
  const rows = [...form.rows]
  ;[rows[index], rows[to]] = [rows[to], rows[index]]
  return { ...form, rows }
}

export function removeMetricRow(form: ExternalMetricForm, index: number): ExternalMetricForm {
  return { ...form, rows: form.rows.filter((_, i) => i !== index) }
}

export function addMetricRow(form: ExternalMetricForm, kind: MetricRowForm['kind'] = 'dimension'): ExternalMetricForm {
  return { ...form, rows: [...form.rows, { ...EMPTY_ROW, kind }] }
}

export function updateMetricRow(form: ExternalMetricForm, index: number, patch: Partial<MetricRowForm>): ExternalMetricForm {
  return { ...form, rows: form.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
}

/** Tick or untick one of the rows a subtotal adds, keeping them in page order. */
export function toggleSubtotalMember(form: ExternalMetricForm, index: number, member: string): ExternalMetricForm {
  const row = form.rows[index]
  if (!row) return form
  const above = rowsAbove(form, index)
  const next = row.of.includes(member) ? row.of.filter((m) => m !== member) : [...row.of, member]
  return updateMetricRow(form, index, { of: above.filter((m) => next.includes(m)) })
}

export function addDerivedMeasure(form: ExternalMetricForm): ExternalMetricForm {
  return { ...form, derived: [...form.derived, { ...EMPTY_DERIVED }] }
}

export function removeDerivedMeasure(form: ExternalMetricForm, index: number): ExternalMetricForm {
  return { ...form, derived: form.derived.filter((_, i) => i !== index) }
}

export function updateDerivedMeasure(form: ExternalMetricForm, index: number, patch: Partial<MetricDerivedForm>): ExternalMetricForm {
  return { ...form, derived: form.derived.map((m, i) => (i === index ? { ...m, ...patch } : m)) }
}

/** The line under the placed page on the editor's canvas. */
export function externalPlacementSummary(config: unknown): string {
  const parsed = parseExternalMetricConfig(config)
  if (!parsed.ok) return 'Settings need attention'
  const c = parsed.config
  const parts = [c.series_key ? c.series_key : 'Every series']
  if (c.layout === 'trend') parts.push(`${c.months} months, newest first`)
  if (c.rows.length > 0) parts.push(`${c.rows.length} rows`)
  return parts.join(' · ')
}
