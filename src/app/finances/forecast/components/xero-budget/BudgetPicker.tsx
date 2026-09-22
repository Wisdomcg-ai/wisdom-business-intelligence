'use client'

/**
 * Budget picker — shown only when more than one (org, budget) pair is on
 * offer. Defaults to the first org's OVERALL budget; warns when the orgs
 * report in different currencies. One budget seeds one forecast, once.
 */
import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import {
  describeCoverage,
  hasMixedCurrencies,
  pickDefaultBudget,
  type BudgetChoice,
} from '@/lib/forecast/xero-budget-seed-client'

export interface BudgetPickerProps {
  choices: BudgetChoice[]
  fiscalYear: number
  busy: boolean
  onCancel: () => void
  onConfirm: (choice: BudgetChoice) => void
}

export function BudgetPicker({ choices, fiscalYear, busy, onCancel, onConfirm }: BudgetPickerProps) {
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const d = pickDefaultBudget(choices)
    return d ? `${d.tenantId}|${d.budgetId}` : ''
  })
  const selected = choices.find((c) => `${c.tenantId}|${c.budgetId}` === selectedKey) ?? null
  const mixedCurrencies = hasMixedCurrencies(choices)
  const multiOrg = new Set(choices.map((c) => c.tenantId)).size > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-picker-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl text-left">
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 id="budget-picker-title" className="text-lg font-semibold text-gray-900">
              Which Xero budget?
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              One budget seeds the FY{fiscalYear} forecast. This is a one-off import — it is not kept in sync.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {choices.map((c) => {
            const key = `${c.tenantId}|${c.budgetId}`
            const checked = key === selectedKey
            return (
              <label
                key={key}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  checked ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="xero-budget"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setSelectedKey(key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {c.name}
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 align-middle">
                      {c.type === 'OVERALL' ? 'Overall' : 'Tracking'}
                    </span>
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {multiOrg ? <>{c.orgName} · </> : null}
                    {describeCoverage(c.coverage, fiscalYear)} · {c.lineCount} account{c.lineCount === 1 ? '' : 's'}
                    {c.functionalCurrency ? <> · {c.functionalCurrency}</> : null}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {mixedCurrencies && (
          <p className="mx-6 mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            These organisations report in different currencies. The forecast takes the chosen budget&apos;s figures as they are — no conversion is applied.
          </p>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => selected && onConfirm(selected)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Importing…' : 'Import this budget'}
          </button>
        </div>
      </div>
    </div>
  )
}
