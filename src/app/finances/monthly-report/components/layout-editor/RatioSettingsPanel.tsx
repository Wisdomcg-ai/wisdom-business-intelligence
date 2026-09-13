'use client'

/**
 * Ratio page settings — the form a coach fills in after placing a Ratio
 * Analysis page. Until this existed, the page could only be configured by
 * writing JSON into pdf_layout by hand, and a placed page printed "No ratios
 * have been set up for this page yet".
 *
 * Thin by design: the form state, the config it maps to, the round-trip rule
 * and every edit live in lib/monthly-report/ratio-config-form.ts, and validity
 * is parseRatioAnalysisConfig — the rule the PDF applies. Apply is disabled
 * while that rule says no, so an invalid config never reaches the layout.
 *
 * The account list is the page's own ledger (account-actuals?list=1), in the
 * fail-open house style: a list, an empty list, or a stated could-not-load —
 * and in every one of them the statement totals still work.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Settings2, X } from 'lucide-react'
import type { LayoutWidget } from '../../types/pdf-layout'
import { STATEMENT_TOTALS, type LedgerAccount } from '@/lib/monthly-report/account-actuals'
import { TOTAL_LABELS, defaultOperandLabel } from '@/lib/monthly-report/ratio-table'
import {
  BUCKET_GROUPS,
  MAX_MONTHS_SHOWN,
  MAX_RATIOS,
  STANDARD_AVERAGES,
  addRatio,
  describeReason,
  filterAccounts,
  formFromWidget,
  hasUnrecognised,
  moveRatio,
  otherAverages,
  removeRatio,
  setPageAverage,
  setRatioNoAverages,
  toggleAccount,
  updateOperand,
  updateRatio,
  validateRatioForm,
  withoutUnrecognised,
  type OperandForm,
  type OperandSide,
  type RatioPageForm,
} from '@/lib/monthly-report/ratio-config-form'

export type AccountListState =
  | { status: 'loading' }
  | { status: 'loaded'; accounts: LedgerAccount[]; codelessCount: number }
  | { status: 'unavailable'; reason: string }
  | { status: 'error' }

interface RatioSettingsPanelProps {
  widget: LayoutWidget
  businessId?: string
  onCancel: () => void
  onApply: (patch: { config: Record<string, unknown>; titleOverride: string | undefined }) => void
}

const inputClass =
  'w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange'
const headingClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'
const helpClass = 'text-[11px] text-gray-500'

function useLedgerAccounts(businessId: string | undefined) {
  const [state, setState] = useState<AccountListState>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!businessId) {
      setState({ status: 'error' })
      return
    }
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/monthly-report/account-actuals?business_id=${encodeURIComponent(businessId)}&list=1`)
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(`account list ${res.status}`)
      if (typeof body.unavailable_reason === 'string') {
        setState({ status: 'unavailable', reason: body.unavailable_reason })
      } else if (Array.isArray(body.accounts)) {
        setState({ status: 'loaded', accounts: body.accounts, codelessCount: Number(body.codeless_count) || 0 })
      } else {
        throw new Error('account list: unexpected response')
      }
    } catch {
      // A read, not a write: the panel says so and the totals still work.
      setState({ status: 'error' })
    }
  }, [businessId])

  useEffect(() => { void load() }, [load])
  return { state, retry: load }
}

export default function RatioSettingsPanel({ widget, businessId, onCancel, onApply }: RatioSettingsPanelProps) {
  // Read once: the panel is keyed on the placement, and its draft is the form.
  const [initial] = useState(() => formFromWidget(widget.config, widget.titleOverride))
  const [form, setForm] = useState<RatioPageForm>(initial.form)
  const { state: accountList, retry } = useLedgerAccounts(businessId)
  const verdict = useMemo(() => validateRatioForm(form), [form])

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

  const nameFor = useCallback(
    (code: string) => (accountList.status === 'loaded' ? accountList.accounts.find((a) => a.code === code)?.name : undefined),
    [accountList],
  )

  const pageOthers = otherAverages(form.trailing)

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* No click-to-close: a stray click must not throw away a half-built ratio. */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ratio-settings-heading"
        className="relative w-full max-w-[540px] h-full bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="ratio-settings-heading" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Settings2 className="w-4 h-4 text-brand-orange" />
            Ratio page settings
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Close without applying"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3 leading-relaxed">
            Each ratio shows one line as a percentage of another, for the report month and the months before it.
            For example, <strong>Freight as a % of Income</strong>: pick Freight to Customer on top, and Total Income
            underneath.
          </p>

          {initial.notes.length > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
              {initial.notes.map((n) => <p key={n}>{n}</p>)}
            </div>
          )}

          {/* ── The page ── */}
          <section className="space-y-3">
            <h3 className={headingClass}>The page</h3>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700">Page title</span>
              <input
                type="text"
                value={form.title}
                maxLength={80}
                placeholder="Ratio Analysis"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
              />
              <span className={helpClass}>Printed at the top of the page, followed by the month.</span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700">Months shown</span>
              <select
                value={form.monthsShown}
                onChange={(e) => setForm({ ...form, monthsShown: Number(e.target.value) })}
                className={inputClass}
              >
                {/* A stored value outside 1–6 is shown as it is, so parse can say why it fails. */}
                {!Array.from({ length: MAX_MONTHS_SHOWN }, (_, i) => i + 1).includes(form.monthsShown) && (
                  <option value={form.monthsShown}>{form.monthsShown}</option>
                )}
                {Array.from({ length: MAX_MONTHS_SHOWN }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'Just the report month' : `The report month and the ${n - 1} before it`}</option>
                ))}
              </select>
            </label>

            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-gray-700">Averages</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {STANDARD_AVERAGES.map((w) => (
                  <label key={w} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.trailing.includes(w)}
                      onChange={(e) => setForm(setPageAverage(form, w, e.target.checked))}
                    />
                    {w}-month average
                  </label>
                ))}
              </div>
              {pageOthers.length > 0 && (
                <p className={helpClass}>
                  Also shows {pageOthers.map((w) => `a ${w}-month`).join(' and ')} average, set up by hand — kept as it is.
                </p>
              )}
              <p className={helpClass}>An average is printed only when every month in it has a figure.</p>
            </fieldset>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.showAmounts}
                onChange={(e) => setForm({ ...form, showAmounts: e.target.checked })}
              />
              Show the dollar amounts above each percentage
            </label>
          </section>

          {/* ── Ratios ── */}
          <section className="space-y-3">
            <h3 className={headingClass}>Ratios</h3>
            <AccountListStatus state={accountList} onRetry={retry} />

            {form.ratios.map((ratio, index) => {
              const ownOthers = ratio.trailing && ratio.trailing.length > 0 ? ratio.trailing : null
              return (
                <div key={ratio.key} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-800">Ratio {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setForm(moveRatio(form, index, -1))}
                        disabled={index === 0}
                        aria-label={`Move ratio ${index + 1} up`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded"
                      >
                        <ArrowUp className="w-3 h-3" />
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(moveRatio(form, index, 1))}
                        disabled={index === form.ratios.length - 1}
                        aria-label={`Move ratio ${index + 1} down`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded"
                      >
                        <ArrowDown className="w-3 h-3" />
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(removeRatio(form, index))}
                        className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-red-600 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-gray-700">Name</span>
                    <input
                      type="text"
                      value={ratio.label}
                      maxLength={80}
                      placeholder="e.g. Freight % of Income"
                      onChange={(e) => setForm(updateRatio(form, index, { label: e.target.value }))}
                      className={inputClass}
                    />
                  </label>

                  {(['numerator', 'denominator'] as OperandSide[]).map((side) => (
                    <OperandEditor
                      key={side}
                      idPrefix={`${ratio.key}-${side}`}
                      legend={side === 'numerator' ? 'What to measure (top line)' : 'As a percentage of (bottom line)'}
                      operand={ratio[side]}
                      accountList={accountList}
                      nameFor={nameFor}
                      onChange={(patch) => setForm(updateOperand(form, index, side, patch))}
                      onToggleAccount={(code, on) => setForm(toggleAccount(form, index, side, code, on))}
                    />
                  ))}

                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Array.isArray(ratio.trailing) && ratio.trailing.length === 0}
                        onChange={(e) => setForm(setRatioNoAverages(form, index, e.target.checked))}
                      />
                      No averages for this ratio
                    </label>
                    {ownOthers && (
                      <p className={helpClass}>
                        This ratio has its own averages ({ownOthers.map((w) => `${w}-month`).join(', ')}), set up by
                        hand — kept as they are.
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => setForm(addRatio(form))}
              disabled={form.ratios.length >= MAX_RATIOS}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-dashed border-gray-300 text-gray-700 hover:border-brand-orange hover:text-brand-orange disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add a ratio
            </button>
            <p className={helpClass}>Up to {MAX_RATIOS} ratios per page.</p>
          </section>
        </div>

        <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-white">
          {!verdict.ok && (
            <div role="status" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
              <p><span className="font-semibold">To finish:</span> {describeReason(verdict.reason)}</p>
              {hasUnrecognised(form) && (
                <button
                  type="button"
                  onClick={() => setForm(withoutUnrecognised(form))}
                  className="underline text-amber-900"
                >
                  Remove the settings this page does not recognise
                </button>
              )}
            </div>
          )}
          <p className={helpClass}>Apply updates this page in the layout. Press Save Layout to keep it.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!verdict.ok}
              onClick={() => {
                if (verdict.ok) onApply({ config: verdict.config, titleOverride: verdict.titleOverride })
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccountListStatus({ state, onRetry }: { state: AccountListState; onRetry: () => void }) {
  if (state.status === 'loading') return <p className={helpClass}>Loading this business’s accounts…</p>
  if (state.status === 'unavailable') {
    return (
      // The export refuses the whole page for such a business (more than one
      // Xero organisation, or not AUD) before any ratio is built — totals too.
      // So this is about the page, not about picking accounts.
      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
        This page can’t show figures for this business yet: {state.reason}. Anything set up here will print that
        sentence instead.
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2 flex items-center justify-between gap-2">
        <span>The account list could not be loaded. You can still use the statement totals.</span>
        <button type="button" onClick={onRetry} className="underline shrink-0">Try again</button>
      </div>
    )
  }
  if (state.accounts.length === 0) {
    return <p className={helpClass}>No accounts with a code have synced from Xero for this business yet. You can still use the statement totals.</p>
  }
  return state.codelessCount > 0 ? (
    <p className={helpClass}>
      {state.codelessCount === 1 ? '1 account has' : `${state.codelessCount} accounts have`} no code in Xero and can’t be
      picked — a ratio names accounts by code.
    </p>
  ) : null
}

interface OperandEditorProps {
  idPrefix: string
  legend: string
  operand: OperandForm
  accountList: AccountListState
  nameFor: (code: string) => string | undefined
  onChange: (patch: Partial<OperandForm>) => void
  onToggleAccount: (code: string, on: boolean) => void
}

function OperandEditor({ idPrefix, legend, operand, accountList, nameFor, onChange, onToggleAccount }: OperandEditorProps) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState(operand.accounts.length === 0)
  const loaded = accountList.status === 'loaded' ? accountList.accounts : null
  const matches = useMemo(() => (loaded ? filterAccounts(loaded, query) : []), [loaded, query])

  const placeholder = defaultOperandLabel(
    operand.mode === 'total' ? { total: operand.total } : { accounts: operand.accounts },
    nameFor,
  )

  return (
    <fieldset className="space-y-2 border-t border-gray-200 pt-2">
      <legend className="text-xs font-medium text-gray-700">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={operand.mode === 'total'}
            onChange={() => onChange({ mode: 'total' })}
          />
          A statement total
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={operand.mode === 'accounts'}
            onChange={() => onChange({ mode: 'accounts' })}
          />
          One or more accounts
        </label>
      </div>

      {operand.mode === 'total' ? (
        <select
          aria-label={`${legend} — statement total`}
          value={operand.total}
          onChange={(e) => onChange({ total: e.target.value as OperandForm['total'] })}
          className={inputClass}
        >
          {STATEMENT_TOTALS.map((t) => (
            <option key={t} value={t}>{TOTAL_LABELS[t]}</option>
          ))}
        </select>
      ) : (
        <div className="space-y-1.5">
          {operand.accounts.length > 0 && (
            <ul className="space-y-1">
              {operand.accounts.map((code) => {
                const name = nameFor(code)
                return (
                  <li key={code} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1">
                    <span className="truncate">
                      <span className="font-mono">{code}</span>
                      {name ? (
                        <> — {name}</>
                      ) : loaded ? (
                        // Kept, never dropped: the account may have been renamed
                        // away or archived, and the coach decides what replaces it.
                        <span className="text-red-600"> — not found in the chart of accounts</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleAccount(code, false)}
                      aria-label={`Remove account ${code}`}
                      // Words, not an X: an icon-only control on a row reads as
                      // anything (a misread trash icon once deleted an employee).
                      className="text-[11px] text-gray-500 hover:text-red-600 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {loaded && loaded.length > 0 && (
            browsing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or code"
                  aria-label={`${legend} — search accounts`}
                  className={inputClass}
                />
                <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-md bg-white p-1.5 space-y-2">
                  {matches.length === 0 && <p className="text-[11px] text-gray-400 italic">No account matches “{query}”.</p>}
                  {BUCKET_GROUPS.map((g) => {
                    const inGroup = matches.filter((a) => a.bucket === g.bucket)
                    if (inGroup.length === 0) return null
                    return (
                      <div key={g.label}>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-0.5">{g.label}</div>
                        {inGroup.map((a) => (
                          <label key={a.code} className="flex items-center gap-2 text-xs px-0.5 py-0.5">
                            <input
                              type="checkbox"
                              checked={operand.accounts.includes(a.code)}
                              onChange={(e) => onToggleAccount(a.code, e.target.checked)}
                            />
                            <span className="truncate"><span className="font-mono">{a.code}</span> — {a.name}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
                {operand.accounts.length > 0 && (
                  <button type="button" onClick={() => setBrowsing(false)} className="text-[11px] text-gray-500 underline">
                    Done choosing
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setBrowsing(true)} className="text-[11px] text-brand-orange underline">
                Add or change accounts
              </button>
            )
          )}
          {operand.accounts.length > 1 && <p className={helpClass}>The accounts are added together.</p>}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] text-gray-600">Display name (optional)</span>
        <input
          type="text"
          value={operand.label}
          maxLength={80}
          placeholder={placeholder || 'The account or total name'}
          onChange={(e) => onChange({ label: e.target.value })}
          className={inputClass}
        />
      </label>
    </fieldset>
  )
}
