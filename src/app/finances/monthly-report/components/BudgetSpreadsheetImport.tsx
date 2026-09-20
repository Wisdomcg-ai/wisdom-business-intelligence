'use client'

/**
 * Import the budget a client is held to from the coach's spreadsheet.
 *
 * Preview first, always. The coach uploads Calxa's export (account code,
 * account name, twelve month columns, optionally an organisation column) and
 * sees every row's fate before anything is written: matched to an account,
 * budget-only, or matched to nothing — with the year's totals per section so
 * the signs can be checked at a glance. A row that matches nothing and carries
 * money blocks the save until the coach maps it, names its type, or leaves it
 * out. The mapping choices (IICT's 210 → 200) are made here, not in code.
 */
import { useMemo, useRef, useState } from 'react'
import { X, Upload } from 'lucide-react'
import { toast } from 'sonner'

type Bucket = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'

interface PreviewRow {
  row: number
  code: string | null
  name: string
  status: 'matched' | 'budget_only' | 'unmatched' | 'skipped'
  account_code: string | null
  account_name: string
  account_type: Bucket | null
  annual: number
  note: string | null
}

interface PreviewScope {
  scope: string | null
  display_name: string
  currency: string
  rows: PreviewRow[]
  totals: { matched: number; budget_only: number; unmatched: number; skipped: number; by_type: Record<Bucket, number>; net_profit: number }
}

interface PreviewResponse {
  preview: { months: string[]; scopes: PreviewScope[]; blocking: string[]; problems: string[]; can_save: boolean }
  accounts: Array<{ tenant_id: string; code: string | null; name: string }>
  effective_from: string
}

type Choice =
  | { action: 'map'; target_code: string }
  | { action: 'budget_only'; account_type: Bucket }
  | { action: 'skip' }

const TYPE_LABELS: Array<[Bucket, string]> = [
  ['revenue', 'Income'],
  ['cogs', 'Cost of Sales'],
  ['opex', 'Operating Expenses'],
  ['other_income', 'Other Income'],
  ['other_expense', 'Other Expenses'],
]

const money = (n: number) =>
  `${n < 0 ? '(' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-AU')}${n < 0 ? ')' : ''}`

const STATUS_LABEL: Record<PreviewRow['status'], string> = {
  matched: 'Matched',
  budget_only: 'Budget-only',
  unmatched: 'No account',
  skipped: 'Left out',
}

const STATUS_CLASS: Record<PreviewRow['status'], string> = {
  matched: 'bg-green-50 text-green-700',
  budget_only: 'bg-blue-50 text-blue-700',
  unmatched: 'bg-amber-50 text-amber-800',
  skipped: 'bg-gray-100 text-gray-500',
}

export interface BudgetSpreadsheetImportProps {
  isOpen: boolean
  onClose: () => void
  businessId: string
  /** The report's fiscal year — the year the sheet's months must belong to. */
  fiscalYear: number
  /** The business's Xero organisations, for the scope picker. */
  organisations: Array<{ tenant_id: string; name: string }>
  /** Told after a save, so the panel can reload its version list. */
  onImported?: () => void
}

export default function BudgetSpreadsheetImport({
  isOpen, onClose, businessId, fiscalYear, organisations, onImported,
}: BudgetSpreadsheetImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState<string>(organisations.length > 1 ? 'sheet' : organisations[0]?.tenant_id ?? 'business')
  const [currency, setCurrency] = useState('AUD')
  const [label, setLabel] = useState('')
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState<false | 'preview' | 'save'>(false)
  const [saved, setSaved] = useState<{
    versions: Array<{ display_name: string; label: string; version_number: number; effective_from: string; line_count: number }>
    /** Organisations the sheet did not budget: they get no version, and the report refuses the group's budget until they have one. */
    organisations_without_a_budget?: string[]
  } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const accountsByOrg = useMemo(() => {
    const map = new Map<string, Array<{ code: string | null; name: string }>>()
    for (const a of preview?.accounts ?? []) map.set(a.tenant_id, [...(map.get(a.tenant_id) ?? []), { code: a.code, name: a.name }])
    return map
  }, [preview])

  if (!isOpen) return null

  const post = async (mode: 'preview' | 'save') => {
    if (!file) {
      toast.error('Choose the budget spreadsheet first')
      return
    }
    setBusy(mode)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('business_id', businessId)
      form.append('fiscal_year', String(fiscalYear))
      form.append('mode', mode)
      if (scope !== 'sheet') form.append('scope', scope)
      if (scope === 'business') form.append('currency', currency)
      if (label.trim()) form.append('label', label.trim())
      if (Object.keys(choices).length > 0) form.append('choices', JSON.stringify(choices))

      const res = await fetch('/api/budgets/import-spreadsheet', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'The budget could not be imported')
        if (data.blocking) setPreview((p) => (p ? { ...p, preview: { ...p.preview, blocking: data.blocking, can_save: false } } : p))
        return
      }
      if (mode === 'preview') {
        setPreview(data as PreviewResponse)
        setSaved(null)
      } else {
        setSaved({ versions: data.versions, organisations_without_a_budget: data.organisations_without_a_budget })
        toast.success(`Imported ${data.versions.length} budget version${data.versions.length === 1 ? '' : 's'}`)
        onImported?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The budget could not be imported')
    } finally {
      setBusy(false)
    }
  }

  const setChoice = (row: number, choice: Choice | null) => {
    setChoices((prev) => {
      const next = { ...prev }
      if (choice) next[String(row)] = choice
      else delete next[String(row)]
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Import a budget from a spreadsheet</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            The sheet needs an account code, an account name and one column per month of FY{fiscalYear}
            {' '}(“Jul {fiscalYear - 1}” … “Jun {fiscalYear}”). A “Business Unit Name” column sends each row to that organisation.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Spreadsheet</span>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSaved(null); setChoices({}) }}
                className="w-full text-xs"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Belongs to</span>
              <select
                value={scope}
                onChange={(e) => { setScope(e.target.value); setPreview(null) }}
                className="w-full rounded-lg border-gray-300 text-sm focus:border-brand-orange focus:ring-brand-orange"
              >
                {organisations.length > 1 && <option value="sheet">Each organisation, from the sheet</option>}
                <option value="business">The whole business (one version)</option>
                {organisations.map((o) => (
                  <option key={o.tenant_id} value={o.tenant_id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Name it</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="FY27 Budget"
                className="w-full rounded-lg border-gray-300 text-sm focus:border-brand-orange focus:ring-brand-orange"
              />
            </label>
          </div>

          {scope === 'business' && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Currency of the figures</span>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                className="w-32 rounded-lg border-gray-300 text-sm focus:border-brand-orange focus:ring-brand-orange"
              />
              <span className="ml-2 text-xs text-gray-500">Recorded on the version, so a foreign budget is translated rather than added to AUD.</span>
            </label>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => post('preview')}
              disabled={!file || busy !== false}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              {busy === 'preview' ? 'Reading…' : 'Preview'}
            </button>
            {preview && (
              <button
                onClick={() => post('save')}
                disabled={!preview.preview.can_save || busy !== false}
                className="rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy === 'save' ? 'Saving…' : 'Save budget'}
              </button>
            )}
            {preview && <span className="text-xs text-gray-500">Takes effect from {preview.effective_from}</span>}
          </div>

          {saved && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">Imported.</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {saved.versions.map((v) => (
                  <li key={`${v.display_name}-${v.version_number}`}>
                    {v.display_name}: {v.label} v{v.version_number}, effective {v.effective_from}, {v.line_count} lines
                  </li>
                ))}
              </ul>
              {(saved.organisations_without_a_budget?.length ?? 0) > 0 && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {saved.organisations_without_a_budget!.join(', ')}{' '}
                  {saved.organisations_without_a_budget!.length === 1 ? 'is' : 'are'} not budgeted by this sheet and{' '}
                  {saved.organisations_without_a_budget!.length === 1 ? 'has' : 'have'} no approved budget. The report refuses the
                  whole group’s budget until every organisation has one.
                </p>
              )}
              <p className="mt-2 text-xs">Set this client’s budget source to the approved budget to use it.</p>
            </div>
          )}

          {preview?.preview.problems.map((p) => (
            <p key={p} className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{p}</p>
          ))}
          {preview?.preview.blocking.map((b) => (
            <p key={b} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{b}</p>
          ))}

          {preview?.preview.scopes.map((s) => (
            <div key={s.scope ?? 'business'} className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-900">{s.display_name}{s.currency ? ` · ${s.currency}` : ''}</h3>
                <p className="text-xs text-gray-500">
                  {s.totals.matched} matched · {s.totals.budget_only} budget-only · {s.totals.unmatched} unmatched · {s.totals.skipped} left out
                </p>
              </div>
              <div className="flex flex-wrap gap-4 px-3 py-2 text-xs text-gray-700">
                {TYPE_LABELS.map(([bucket, name]) => (
                  <span key={bucket}>{name} <strong>{money(s.totals.by_type[bucket] ?? 0)}</strong></span>
                ))}
                <span>Net profit <strong>{money(s.totals.net_profit)}</strong></span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Row</th>
                      <th className="px-3 py-1.5 font-medium">Sheet</th>
                      <th className="px-3 py-1.5 font-medium">Year</th>
                      <th className="px-3 py-1.5 font-medium">Becomes</th>
                      <th className="px-3 py-1.5 font-medium">Choice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((row) => (
                      <tr key={row.row} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-1.5 text-gray-400">{row.row}</td>
                        <td className="px-3 py-1.5">
                          <span className="text-gray-900">{[row.code, row.name].filter(Boolean).join(' ')}</span>
                          {row.note && <span className="block text-[11px] text-gray-500">{row.note}</span>}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-gray-700">{money(row.annual)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                          {row.status !== 'unmatched' && (
                            <span className="ml-1 text-gray-600">{[row.account_code, row.account_name].filter(Boolean).join(' ')}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              aria-label={`Account for row ${row.row}`}
                              value={choices[String(row.row)]?.action === 'map' ? (choices[String(row.row)] as { target_code: string }).target_code : ''}
                              onChange={(e) => setChoice(row.row, e.target.value ? { action: 'map', target_code: e.target.value } : null)}
                              className="max-w-[12rem] rounded border-gray-300 text-[11px]"
                            >
                              <option value="">Map to…</option>
                              {(s.scope ? accountsByOrg.get(s.scope) ?? [] : preview.accounts).map((a, i) => (
                                <option key={`${a.code}-${i}`} value={a.code ?? ''}>{[a.code, a.name].filter(Boolean).join(' ')}</option>
                              ))}
                            </select>
                            <select
                              aria-label={`Budget-only type for row ${row.row}`}
                              value={choices[String(row.row)]?.action === 'budget_only' ? (choices[String(row.row)] as { account_type: Bucket }).account_type : ''}
                              onChange={(e) => setChoice(row.row, e.target.value ? { action: 'budget_only', account_type: e.target.value as Bucket } : null)}
                              className="rounded border-gray-300 text-[11px]"
                            >
                              <option value="">Budget-only…</option>
                              {TYPE_LABELS.map(([bucket, name]) => <option key={bucket} value={bucket}>{name}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-[11px] text-gray-600">
                              <input
                                type="checkbox"
                                checked={choices[String(row.row)]?.action === 'skip'}
                                onChange={(e) => setChoice(row.row, e.target.checked ? { action: 'skip' } : null)}
                                className="rounded border-gray-300"
                              />
                              Leave out
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {preview && (
            <p className="text-xs text-gray-500">
              Change a choice, then Preview again to see what it does before saving.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
