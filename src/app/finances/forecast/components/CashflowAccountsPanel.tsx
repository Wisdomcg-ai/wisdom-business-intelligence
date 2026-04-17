'use client'

import { useMemo } from 'react'
import { RefreshCw, Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CashflowCalxaSettings } from '../hooks/useCashflowSettings'
import type { XeroAccount, GroupedXeroAccounts } from '../hooks/useXeroAccounts'

interface CashflowAccountsPanelProps {
  settings: CashflowCalxaSettings | null
  accounts: XeroAccount[]
  grouped: GroupedXeroAccounts
  isLoadingSettings: boolean
  isSavingSettings: boolean
  isLoadingAccounts: boolean
  isRefreshingAccounts: boolean
  accountsError: string | null
  settingsError: string | null
  lastSyncedAt: string | null
  onUpdate: <K extends keyof CashflowCalxaSettings>(key: K, value: CashflowCalxaSettings[K]) => void
  onSave: () => Promise<boolean>
  onRefreshAccounts: () => Promise<void>
}

/** Display label for a Xero account: "Code Name" */
function accountLabel(a: XeroAccount): string {
  return a.account_code ? `${a.account_code} ${a.account_name}` : a.account_name
}

/** Render a single-select dropdown for account picking */
function AccountSelect({
  label,
  value,
  accounts,
  onChange,
  placeholder = '— Select account —',
  help,
}: {
  label: string
  value: string | null
  accounts: XeroAccount[]
  onChange: (id: string | null) => void
  placeholder?: string
  help?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full text-sm rounded-lg border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
      >
        <option value="">{placeholder}</option>
        {accounts.map(a => (
          <option key={a.xero_account_id} value={a.xero_account_id}>
            {accountLabel(a)}
          </option>
        ))}
      </select>
      {help && <p className="text-xs text-gray-400">{help}</p>}
    </div>
  )
}

/** Render a multi-select (checkbox list) for bank accounts */
function AccountMultiSelect({
  label,
  values,
  accounts,
  onChange,
}: {
  label: string
  values: string[]
  accounts: XeroAccount[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) => {
    if (values.includes(id)) onChange(values.filter(v => v !== id))
    else onChange([...values, id])
  }
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="border border-gray-300 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
        {accounts.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No bank accounts in Xero — click Refresh</p>
        ) : (
          accounts.map(a => (
            <label key={a.xero_account_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1">
              <input
                type="checkbox"
                checked={values.includes(a.xero_account_id)}
                onChange={() => toggle(a.xero_account_id)}
                className="rounded border-gray-300"
              />
              <span className="truncate">{accountLabel(a)}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

export default function CashflowAccountsPanel({
  settings,
  grouped,
  isLoadingSettings,
  isSavingSettings,
  isLoadingAccounts,
  isRefreshingAccounts,
  accountsError,
  settingsError,
  lastSyncedAt,
  onUpdate,
  onSave,
  onRefreshAccounts,
}: CashflowAccountsPanelProps) {
  // Accounts eligible for each category
  const assetAccounts = useMemo(
    () => [...grouped.currentAssets, ...grouped.fixedAssets, ...grouped.inventory],
    [grouped]
  )
  const liabilityAccounts = useMemo(
    () => [...grouped.currentLiabilities, ...grouped.termLiabilities],
    [grouped]
  )
  const expenseAccounts = useMemo(
    () => [...grouped.expenses, ...grouped.depreciation],
    [grouped]
  )

  if (isLoadingSettings || isLoadingAccounts) {
    return (
      <div className="py-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading accounts…</span>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-700">Settings could not be loaded.</p>
      </div>
    )
  }

  const syncLabel = lastSyncedAt
    ? `Xero COA synced ${new Date(lastSyncedAt).toLocaleString('en-AU')}`
    : 'Not yet synced from Xero'

  return (
    <div className="space-y-4">
      {/* Header + feature flag toggle */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Explicit Account Mapping</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Map each Xero account to its cashflow category. When enabled, the engine uses these
              mappings instead of keyword matching.
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0">
            <input
              type="checkbox"
              checked={settings.use_explicit_accounts}
              onChange={e => onUpdate('use_explicit_accounts', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-xs font-medium text-gray-700">Enabled</span>
          </label>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">{syncLabel}</p>
          <button
            onClick={onRefreshAccounts}
            disabled={isRefreshingAccounts}
            className="flex items-center gap-1 text-xs text-brand-orange hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingAccounts ? 'animate-spin' : ''}`} />
            Refresh from Xero
          </button>
        </div>

        {(accountsError || settingsError) && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{accountsError || settingsError}</span>
          </div>
        )}
      </div>

      {/* Warning when disabled */}
      {!settings.use_explicit_accounts && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Explicit account mapping is <strong>disabled</strong>. Engine is using keyword
            matching for depreciation, employment, and bank fees. Enable the toggle above
            once you&apos;ve configured the accounts below to get precise Calxa-standard behaviour.
          </div>
        </div>
      )}

      {/* Bank & Equity */}
      <Section title="Bank & Equity">
        <AccountMultiSelect
          label="Bank Accounts"
          values={settings.bank_account_ids.filter(id =>
            grouped.bank.some(a => a.xero_account_id === id)
          )}
          accounts={grouped.bank}
          onChange={selectedBank => {
            // Preserve any already-ticked credit cards — they're stored in the
            // same bank_account_ids list but filtered by group in the UI
            const currentCards = settings.bank_account_ids.filter(id =>
              grouped.creditCards.some(a => a.xero_account_id === id)
            )
            onUpdate('bank_account_ids', [...selectedBank, ...currentCards])
          }}
        />

        {grouped.creditCards.length > 0 && (
          <div className="pt-1">
            <AccountMultiSelect
              label="Credit Cards & Short-Term Debt (optional)"
              values={settings.bank_account_ids.filter(id =>
                grouped.creditCards.some(a => a.xero_account_id === id)
              )}
              accounts={grouped.creditCards}
              onChange={selectedCards => {
                const currentBank = settings.bank_account_ids.filter(id =>
                  grouped.bank.some(a => a.xero_account_id === id)
                )
                onUpdate('bank_account_ids', [...currentBank, ...selectedCards])
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Tick to include credit card balances in your cash position (shows net liquid position).
              Leave unticked for pure bank-only cashflow. Default: unticked.
            </p>
          </div>
        )}

        <AccountSelect
          label="Retained Earnings"
          value={settings.retained_earnings_account_id}
          accounts={grouped.equity}
          onChange={id => onUpdate('retained_earnings_account_id', id)}
        />
        <AccountSelect
          label="Current Year Earnings"
          value={settings.current_year_earnings_account_id}
          accounts={grouped.equity}
          onChange={id => onUpdate('current_year_earnings_account_id', id)}
        />
      </Section>

      {/* Debtors & Creditors */}
      <Section title="Debtors & Creditors">
        <AccountSelect
          label="Trade Debtors (AR)"
          value={settings.debtors_account_id}
          accounts={grouped.currentAssets}
          onChange={id => onUpdate('debtors_account_id', id)}
          help="Accounts receivable — used for DSO timing"
        />
        <AccountSelect
          label="Trade Creditors (AP)"
          value={settings.creditors_account_id}
          accounts={grouped.currentLiabilities}
          onChange={id => onUpdate('creditors_account_id', id)}
          help="Accounts payable — used for DPO timing"
        />
      </Section>

      {/* GST — allow any balance sheet account; some orgs use a single GST
          account (asset or liability), others split. */}
      <Section title="GST / BAS">
        <AccountSelect
          label="GST Paid (on expenses)"
          value={settings.gst_paid_account_id}
          accounts={[...assetAccounts, ...liabilityAccounts]}
          onChange={id => onUpdate('gst_paid_account_id', id)}
          help="Some orgs post GST Paid to a liability account (net GST position). Pick whichever Xero uses."
        />
        <AccountSelect
          label="GST Collected (on income)"
          value={settings.gst_collected_account_id}
          accounts={[...assetAccounts, ...liabilityAccounts]}
          onChange={id => onUpdate('gst_collected_account_id', id)}
          help="If you use a single GST account for both, pick the same one here and above."
        />
      </Section>

      {/* Wages & PAYG WH */}
      <Section title="Wages & PAYG Withholding">
        <AccountSelect
          label="Wages Expense"
          value={settings.wages_expense_account_id}
          accounts={expenseAccounts}
          onChange={id => onUpdate('wages_expense_account_id', id)}
        />
        <AccountSelect
          label="PAYG WH Liability"
          value={settings.payg_wh_liability_account_id}
          accounts={liabilityAccounts}
          onChange={id => onUpdate('payg_wh_liability_account_id', id)}
          help="Liability account where PAYG withheld accrues"
        />
      </Section>

      {/* Super */}
      <Section title="Superannuation">
        <AccountSelect
          label="Super Expense"
          value={settings.super_expense_account_id}
          accounts={expenseAccounts}
          onChange={id => onUpdate('super_expense_account_id', id)}
        />
        <AccountSelect
          label="Super Payable"
          value={settings.super_payable_account_id}
          accounts={liabilityAccounts}
          onChange={id => onUpdate('super_payable_account_id', id)}
        />
      </Section>

      {/* Depreciation — expense is usually a single account; accumulated is
          often split by asset class (vehicles, equipment, leasehold improvements) */}
      <Section title="Depreciation (non-cash)">
        <AccountSelect
          label="Depreciation Expense"
          value={settings.depreciation_expense_account_id}
          accounts={expenseAccounts}
          onChange={id => onUpdate('depreciation_expense_account_id', id)}
          help="Excluded from cashflow — added back in indirect method"
        />
        <AccountMultiSelect
          label="Accumulated Depreciation (select all)"
          values={settings.depreciation_accumulated_account_ids}
          accounts={assetAccounts}
          onChange={ids => onUpdate('depreciation_accumulated_account_ids', ids)}
        />
      </Section>

      {/* Company Tax */}
      <Section title="Company Tax">
        <AccountSelect
          label="Tax Liability"
          value={settings.company_tax_liability_account_id}
          accounts={liabilityAccounts}
          onChange={id => onUpdate('company_tax_liability_account_id', id)}
        />
      </Section>

      {/* Save button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-3">
        <button
          onClick={onSave}
          disabled={isSavingSettings}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSavingSettings ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><Save className="w-4 h-4" /> Save Cashflow Accounts</>
          )}
        </button>
        {settings.use_explicit_accounts && (
          <div className="mt-2 flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Engine will use these mappings when running the cashflow forecast
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
      <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      {children}
    </div>
  )
}
