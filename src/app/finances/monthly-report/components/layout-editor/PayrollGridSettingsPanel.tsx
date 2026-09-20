'use client'

/**
 * Payroll Report settings — the form a coach fills in after placing the payroll
 * page: which layout it prints, how many months, which budget it is held to,
 * and the roster (name, area, standing salary) the page is ordered by.
 *
 * Until this existed the roster could only be written into pdf_layout by hand,
 * 35 employees at a time. Thin by design: the form state, the config it maps to
 * and validity all live in lib/monthly-report/payroll-grid-form, and validity
 * is the rule the PDF applies — Apply is disabled while it says no.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2, X } from 'lucide-react'
import type { LayoutWidget } from '../../types/pdf-layout'
import {
  addRosterRow,
  moveRosterRow,
  payrollFormFromConfig,
  removeRosterRow,
  setSalaryPeriod,
  updateRosterRow,
  validatePayrollForm,
  type PayrollGridForm,
} from '@/lib/monthly-report/payroll-grid-form'

interface PayrollGridSettingsPanelProps {
  widget: LayoutWidget
  onCancel: () => void
  onApply: (config: Record<string, unknown>) => void
}

const inputClass =
  'w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange'
const headingClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'
const helpClass = 'text-[11px] text-gray-500'

function Radio({ name, value, checked, label, help, onChange }: {
  name: string; value: string; checked: boolean; label: string; help?: string; onChange: () => void
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-gray-800">
      <input type="radio" className="mt-0.5" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="space-y-0.5">
        <span className="block">{label}</span>
        {help && <span className={`block ${helpClass}`}>{help}</span>}
      </span>
    </label>
  )
}

export default function PayrollGridSettingsPanel({ widget, onCancel, onApply }: PayrollGridSettingsPanelProps) {
  // Read once: the panel is keyed on the placement, and its draft is the form.
  const [initial] = useState(() => payrollFormFromConfig(widget.config))
  const [form, setForm] = useState<PayrollGridForm>(initial.form)
  const verdict = useMemo(() => validatePayrollForm(form), [form])
  const calxa = form.layout === 'calxa'

  // The editor's own shortcuts are suspended while this is open; Escape here
  // cancels the panel and leaves the layout exactly as it was.
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

  const salaryLabel = form.salary_period === 'fortnight' ? 'Fortnightly salary' : 'Weekly salary'

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* No click-to-close: a stray click must not throw away a 35-line roster. */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-settings-heading"
        className="relative w-full max-w-[640px] h-full bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="payroll-settings-heading" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Settings2 className="w-4 h-4 text-brand-orange" />
            Payroll page settings
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
            <legend className={headingClass}>Layout</legend>
            <Radio name="payroll-layout" value="grid" checked={!calxa} label="The grid — each employee’s month beside their pay runs"
              onChange={() => setForm({ ...form, layout: 'grid' })} />
            <Radio name="payroll-layout" value="calxa" checked={calxa} label="The Payroll Report — Calxa’s page, the roster down the side"
              onChange={() => setForm({ ...form, layout: 'calxa' })} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Months</legend>
            <label className="flex items-center gap-2 text-xs text-gray-800">
              <span className="w-28">Months shown</span>
              <input className={`${inputClass} w-20`} aria-label="Months shown" value={form.months}
                onChange={(e) => setForm({ ...form, months: e.target.value })} />
            </label>
            <Radio name="payroll-window" value="fixed" checked={form.window === 'fixed'} label="Always this many months, ending at the report month"
              onChange={() => setForm({ ...form, window: 'fixed' })} />
            <Radio name="payroll-window" value="fy_to_date" checked={form.window === 'fy_to_date'}
              label="The financial year to date, up to this many"
              help="“Last 2 Months” in August, “Last 3 Months” from September."
              onChange={() => setForm({ ...form, window: 'fy_to_date' })} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Budget</legend>
            <Radio name="payroll-basis" value="approved" checked={form.budget_basis === 'approved'}
              label="The approved wages budget"
              help="The P&L’s wages line, so this page and the statement print one number."
              onChange={() => setForm({ ...form, budget_basis: 'approved' })} />
            <Radio name="payroll-basis" value="roster" checked={form.budget_basis === 'roster'}
              label="The roster — each salary × the weeks of the month’s pay runs"
              help="Calxa’s basis. Make the roster agree with the approved budget, or the two pages print different numbers."
              onChange={() => setForm({ ...form, budget_basis: 'roster' })} />
            {form.budget_basis === 'approved' && (
              <div className="pl-5 space-y-2 pt-1">
                <p className={helpClass}>A month before this financial year has no approved budget:</p>
                <Radio name="payroll-earlier" value="dash" checked={form.earlier_months === 'dash'} label="Print a dash"
                  onChange={() => setForm({ ...form, earlier_months: 'dash' })} />
                <Radio name="payroll-earlier" value="roster" checked={form.earlier_months === 'roster'} label="Print the roster’s budget for that month"
                  onChange={() => setForm({ ...form, earlier_months: 'roster' })} />
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>The roster’s salary column</legend>
            <Radio name="payroll-salary-period" value="week" checked={form.salary_period === 'week'} label="Per week"
              onChange={() => setForm(setSalaryPeriod(form, 'week'))} />
            <Radio name="payroll-salary-period" value="fortnight" checked={form.salary_period === 'fortnight'} label="Per fortnight"
              help="For a roster kept per pay run on a fortnightly payroll. The figures on screen are converted."
              onChange={() => setForm(setSalaryPeriod(form, 'fortnight'))} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>Columns and shading</legend>
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="checkbox" className="mt-0.5" checked={form.employee_month_columns} disabled={!calxa}
                onChange={(e) => setForm({ ...form, employee_month_columns: e.target.checked })} />
              <span>Month actual, Month budget and Variance beside each employee</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="checkbox" className="mt-0.5" checked={form.pay_fills} disabled={!calxa}
                onChange={(e) => setForm({ ...form, pay_fills: e.target.checked })} />
              <span>Shade each pay against the roster salary — green at or under, red over, amber with no salary</span>
            </label>
            {form.pay_fills && calxa && (
              <label className="flex items-center gap-2 text-xs text-gray-800 pl-5">
                <span className="w-28">Tolerance ($)</span>
                <input className={`${inputClass} w-20`} aria-label="Shading tolerance" value={form.fill_tolerance}
                  onChange={(e) => setForm({ ...form, fill_tolerance: e.target.value })} />
              </label>
            )}
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="checkbox" className="mt-0.5" checked={form.standard_units_column} disabled={!calxa}
                onChange={(e) => setForm({ ...form, standard_units_column: e.target.checked })} />
              <span>A Standard Units column</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="checkbox" className="mt-0.5" checked={form.difference_fills}
                onChange={(e) => setForm({ ...form, difference_fills: e.target.checked })} />
              <span>Fill the Difference cells green or red</span>
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={headingClass}>The roster</legend>
            <p className={helpClass}>
              The page’s order. An area gives that group its own heading and total. Somebody paid who is not here still prints, after the roster.
            </p>
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_110px_70px_90px_64px] gap-1 text-[10px] font-semibold text-gray-500 uppercase">
                <span>Employee</span><span>Area</span><span>Units</span><span>{salaryLabel}</span><span />
              </div>
              {form.roster.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_110px_70px_90px_64px] gap-1 items-center">
                  <input className={inputClass} aria-label={`Employee ${index + 1}`} value={row.name}
                    onChange={(e) => setForm(updateRosterRow(form, index, { name: e.target.value }))} />
                  <input className={inputClass} aria-label={`Area ${index + 1}`} value={row.area}
                    onChange={(e) => setForm(updateRosterRow(form, index, { area: e.target.value }))} />
                  <input className={inputClass} aria-label={`Standard units ${index + 1}`} value={row.standard_units}
                    onChange={(e) => setForm(updateRosterRow(form, index, { standard_units: e.target.value }))} />
                  <input className={inputClass} aria-label={`${salaryLabel} ${index + 1}`} value={row.salary}
                    onChange={(e) => setForm(updateRosterRow(form, index, { salary: e.target.value }))} />
                  <div className="flex items-center gap-0.5">
                    <button type="button" aria-label={`Move up ${index + 1}`} className="p-1 text-gray-400 hover:text-gray-700"
                      onClick={() => setForm(moveRosterRow(form, index, -1))}><ArrowUp className="w-3 h-3" /></button>
                    <button type="button" aria-label={`Move down ${index + 1}`} className="p-1 text-gray-400 hover:text-gray-700"
                      onClick={() => setForm(moveRosterRow(form, index, 1))}><ArrowDown className="w-3 h-3" /></button>
                    <button type="button" aria-label={`Remove ${index + 1}`} className="p-1 text-gray-400 hover:text-red-500"
                      onClick={() => setForm(removeRosterRow(form, index))}><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setForm(addRosterRow(form))}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:border-brand-orange hover:text-brand-orange">
              <Plus className="w-3 h-3" /> Add an employee
            </button>
            {form.roster.some((r) => r.employee_id) && (
              <p className={helpClass}>Rows linked to a Xero employee keep that link when you rename them.</p>
            )}
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
