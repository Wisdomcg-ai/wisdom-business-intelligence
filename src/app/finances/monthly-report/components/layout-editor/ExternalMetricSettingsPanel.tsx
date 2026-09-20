'use client'

/**
 * External-data page settings — which series the page prints, over one month or
 * a trend of N with the newest on the left, in which row order, with which
 * subtotals, derived measures and notes.
 *
 * Thin by design: the form state, the config it maps to and validity live in
 * lib/monthly-report/external-metric-form, and validity is the rule the PDF
 * applies — Apply is disabled while it says no.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2, X } from 'lucide-react'
import type { LayoutWidget } from '../../types/pdf-layout'
import {
  addDerivedMeasure,
  addMetricRow,
  externalFormFromConfig,
  moveMetricRow,
  removeDerivedMeasure,
  removeMetricRow,
  rowsAbove,
  toggleSubtotalMember,
  updateDerivedMeasure,
  updateMetricRow,
  validateExternalForm,
  type ExternalMetricForm,
} from '@/lib/monthly-report/external-metric-form'

interface ExternalMetricSettingsPanelProps {
  widget: LayoutWidget
  onCancel: () => void
  onApply: (config: Record<string, unknown>) => void
}

const inputClass =
  'w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange'
const headingClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'
const helpClass = 'text-[11px] text-gray-500'

export default function ExternalMetricSettingsPanel({ widget, onCancel, onApply }: ExternalMetricSettingsPanelProps) {
  // Read once: the panel is keyed on the placement, and its draft is the form.
  const [initial] = useState(() => externalFormFromConfig(widget.config))
  const [form, setForm] = useState<ExternalMetricForm>(initial.form)
  const verdict = useMemo(() => validateExternalForm(form), [form])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* No click-to-close: a stray click must not throw away a half-built page. */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-metric-settings-heading"
        className="relative w-full max-w-[640px] h-full bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="external-metric-settings-heading" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Settings2 className="w-4 h-4 text-brand-orange" />
            External data page settings
          </h2>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded" aria-label="Close without applying">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {initial.unreadable && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
              This page’s settings could not be read ({initial.unreadable}), so it prints its default layout. Applying here replaces them.
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className={headingClass}>Series</legend>
            <p className={helpClass}>The key of the series this page prints. Leave it blank to print every series with figures.</p>
            <input className={inputClass} aria-label="Series key" value={form.series_key}
              onChange={(e) => setForm({ ...form, series_key: e.target.value })} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Period</legend>
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="radio" className="mt-0.5" name="external-layout" checked={form.layout === 'month'}
                onChange={() => setForm({ ...form, layout: 'month' })} />
              <span>This month, against budget where one was entered</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="radio" className="mt-0.5" name="external-layout" checked={form.layout === 'trend'}
                onChange={() => setForm({ ...form, layout: 'trend' })} />
              <span>A trend, newest month on the left</span>
            </label>
            {form.layout === 'trend' && (
              <label className="flex items-center gap-2 text-xs text-gray-800 pl-5">
                <span className="w-28">Months shown</span>
                <input className={`${inputClass} w-20`} aria-label="Months shown" value={form.months}
                  onChange={(e) => setForm({ ...form, months: e.target.value })} />
              </label>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Measures</legend>
            <p className={helpClass}>Which measures print, in order, separated by commas. Blank: every measure with figures.</p>
            <input className={inputClass} aria-label="Measures" value={form.measures}
              onChange={(e) => setForm({ ...form, measures: e.target.value })} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Worked-out measures</legend>
            <p className={helpClass}>A measure from two others — a rate, a difference. Worked out after the subtotals, so a rate is the total divided.</p>
            {form.derived.map((m, index) => (
              <div key={index} className="grid grid-cols-[90px_1fr_80px_1fr_1fr_28px] gap-1 items-center">
                <input className={inputClass} aria-label={`Measure key ${index + 1}`} placeholder="key" value={m.key}
                  onChange={(e) => setForm(updateDerivedMeasure(form, index, { key: e.target.value }))} />
                <input className={inputClass} aria-label={`Measure label ${index + 1}`} placeholder="label" value={m.label}
                  onChange={(e) => setForm(updateDerivedMeasure(form, index, { label: e.target.value }))} />
                <select className={inputClass} aria-label={`Operation ${index + 1}`} value={m.op}
                  onChange={(e) => setForm(updateDerivedMeasure(form, index, { op: e.target.value as typeof m.op }))}>
                  <option value="divide">÷</option>
                  <option value="subtract">−</option>
                  <option value="add">+</option>
                  <option value="multiply">×</option>
                </select>
                <input className={inputClass} aria-label={`Left measure ${index + 1}`} placeholder="left" value={m.left}
                  onChange={(e) => setForm(updateDerivedMeasure(form, index, { left: e.target.value }))} />
                <input className={inputClass} aria-label={`Right measure ${index + 1}`} placeholder="right" value={m.right}
                  onChange={(e) => setForm(updateDerivedMeasure(form, index, { right: e.target.value }))} />
                <button type="button" aria-label={`Remove measure ${index + 1}`} className="p-1 text-gray-400 hover:text-red-500"
                  onClick={() => setForm(removeDerivedMeasure(form, index))}><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setForm(addDerivedMeasure(form))}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:border-brand-orange hover:text-brand-orange">
              <Plus className="w-3 h-3" /> Add a worked-out measure
            </button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Rows</legend>
            <p className={helpClass}>
              The page’s order. A subtotal adds the rows above it and carries the budget entered against it; a single figure prints one measure of one row.
              Leave this empty for every entered row, alphabetically, with a Total.
            </p>
            {form.rows.map((row, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-2 space-y-1">
                <div className="grid grid-cols-[110px_1fr_64px] gap-1 items-center">
                  <select className={inputClass} aria-label={`Row kind ${index + 1}`} value={row.kind}
                    onChange={(e) => setForm(updateMetricRow(form, index, { kind: e.target.value as typeof row.kind }))}>
                    <option value="dimension">Entered row</option>
                    <option value="subtotal">Subtotal</option>
                    <option value="line">Single figure</option>
                  </select>
                  <input className={inputClass} aria-label={`Row name ${index + 1}`} value={row.name}
                    onChange={(e) => setForm(updateMetricRow(form, index, { name: e.target.value }))} />
                  <div className="flex items-center gap-0.5">
                    <button type="button" aria-label={`Move row up ${index + 1}`} className="p-1 text-gray-400 hover:text-gray-700"
                      onClick={() => setForm(moveMetricRow(form, index, -1))}><ArrowUp className="w-3 h-3" /></button>
                    <button type="button" aria-label={`Move row down ${index + 1}`} className="p-1 text-gray-400 hover:text-gray-700"
                      onClick={() => setForm(moveMetricRow(form, index, 1))}><ArrowDown className="w-3 h-3" /></button>
                    <button type="button" aria-label={`Remove row ${index + 1}`} className="p-1 text-gray-400 hover:text-red-500"
                      onClick={() => setForm(removeMetricRow(form, index))}><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                {row.kind === 'subtotal' && (
                  <div className="pl-1 space-y-0.5">
                    {rowsAbove(form, index).length === 0 && <p className={helpClass}>Nothing above this row to add yet.</p>}
                    {rowsAbove(form, index).map((member) => (
                      <label key={member} className="flex items-center gap-2 text-[11px] text-gray-800">
                        <input type="checkbox" checked={row.of.includes(member)}
                          aria-label={`${row.name || `Row ${index + 1}`} adds ${member}`}
                          onChange={() => setForm(toggleSubtotalMember(form, index, member))} />
                        {member}
                      </label>
                    ))}
                  </div>
                )}
                {row.kind === 'line' && (
                  <div className="grid grid-cols-3 gap-1">
                    <select className={inputClass} aria-label={`Reads row ${index + 1}`} value={row.row}
                      onChange={(e) => setForm(updateMetricRow(form, index, { row: e.target.value }))}>
                      <option value="">Reads…</option>
                      {rowsAbove(form, index).map((member) => <option key={member} value={member}>{member}</option>)}
                    </select>
                    <input className={inputClass} aria-label={`Prints measure ${index + 1}`} placeholder="measure" value={row.measure}
                      onChange={(e) => setForm(updateMetricRow(form, index, { measure: e.target.value }))} />
                    <input className={inputClass} aria-label={`Prints under ${index + 1}`} placeholder="under" value={row.under}
                      onChange={(e) => setForm(updateMetricRow(form, index, { under: e.target.value }))} />
                  </div>
                )}
                {row.kind === 'dimension' && (
                  <input className={inputClass} aria-label={`Row label ${index + 1}`} placeholder="Print it as (optional)" value={row.label}
                    onChange={(e) => setForm(updateMetricRow(form, index, { label: e.target.value }))} />
                )}
              </div>
            ))}
            <div className="flex gap-2">
              {(['dimension', 'subtotal', 'line'] as const).map((kind) => (
                <button key={kind} type="button" onClick={() => setForm(addMetricRow(form, kind))}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:border-brand-orange hover:text-brand-orange">
                  <Plus className="w-3 h-3" />
                  {kind === 'dimension' ? 'Add a row' : kind === 'subtotal' ? 'Add a subtotal' : 'Add a single figure'}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Notes</legend>
            <p className={helpClass}>One bullet a line, printed under the table.</p>
            <textarea className={`${inputClass} h-20`} aria-label="Notes" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </fieldset>
        </div>

        <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-white">
          {!verdict.ok && <p className="text-[11px] text-red-700">This page would refuse these settings: {verdict.reason}</p>}
          <p className={helpClass}>Apply updates this page in the layout. Press Save Layout to keep it.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md">
              Cancel
            </button>
            <button
              type="button"
              disabled={!verdict.ok}
              onClick={() => verdict.ok && onApply(verdict.config)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-md disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
