'use client'

import { useState } from 'react'
import { X, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { CashflowAssumptions, LoanSchedule } from '../types'
import { useCashflowSettings } from '../hooks/useCashflowSettings'
import { useXeroAccounts } from '../hooks/useXeroAccounts'
import CashflowAccountsPanel from './CashflowAccountsPanel'

interface CashflowAssumptionsPanelProps {
  assumptions: CashflowAssumptions
  isOpen: boolean
  isSyncing: boolean
  onClose: () => void
  onUpdate: <K extends keyof CashflowAssumptions>(key: K, value: CashflowAssumptions[K]) => void
  onSave: (updated: Partial<CashflowAssumptions>) => Promise<void>
  onSyncFromXero: () => Promise<void>
  // Phase 28.1: optional — when provided, shows the Calxa-standard account mapping section
  forecastId?: string
  businessId?: string
}

function fmt$(value: number): string {
  const formatted = Math.abs(value).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `(${formatted})` : formatted
}

export default function CashflowAssumptionsPanel({
  assumptions,
  isOpen,
  isSyncing,
  onClose,
  onUpdate,
  onSave,
  onSyncFromXero,
  forecastId,
  businessId,
}: CashflowAssumptionsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    accounts: false,  // Phase 28.1 — collapsed by default so existing users aren't disturbed
    timing: true,
    gst: true,
    tax: false,
    super: false,
    balances: true,
    stock: false,
    loans: false,
  })

  // Phase 28.1: load cashflow settings + Xero accounts when forecast/business known.
  // Hooks no-op if IDs are undefined.
  const calxaSettings = useCashflowSettings(forecastId)
  const xeroAccountsHook = useXeroAccounts(businessId ?? '')

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-xl z-50 flex flex-col overflow-hidden border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">Cashflow Settings</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Cashflow Accounts (Phase 28.1 — Calxa-standard explicit account mapping) */}
        {forecastId && businessId && (
          <Section title="Cashflow Accounts (Calxa standard)" sectionKey="accounts" expanded={expandedSections.accounts} onToggle={toggleSection}>
            <CashflowAccountsPanel
              settings={calxaSettings.settings}
              accounts={xeroAccountsHook.accounts}
              grouped={xeroAccountsHook.grouped}
              isLoadingSettings={calxaSettings.isLoading}
              isSavingSettings={calxaSettings.isSaving}
              isLoadingAccounts={xeroAccountsHook.isLoading}
              isRefreshingAccounts={xeroAccountsHook.isRefreshing}
              accountsError={xeroAccountsHook.error}
              settingsError={calxaSettings.error}
              lastSyncedAt={xeroAccountsHook.lastSyncedAt}
              onUpdate={calxaSettings.update}
              onSave={calxaSettings.save}
              onRefreshAccounts={xeroAccountsHook.refresh}
            />
          </Section>
        )}

        {/* Cash Timing */}
        <Section title="Cash Timing" sectionKey="timing" expanded={expandedSections.timing} onToggle={toggleSection}>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="DSO (Days)"
              value={assumptions.dso_days}
              onChange={(v) => onUpdate('dso_days', v)}
              badge={assumptions.dso_auto_calculated ? 'Auto' : undefined}
              min={0} max={180}
            />
            <NumberInput
              label="DPO (Days)"
              value={assumptions.dpo_days}
              onChange={(v) => onUpdate('dpo_days', v)}
              badge={assumptions.dpo_auto_calculated ? 'Auto' : undefined}
              min={0} max={180}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            DSO = how long customers take to pay. DPO = how long you take to pay suppliers.
          </p>
        </Section>

        {/* GST / BAS Settings */}
        <Section title="GST / BAS Settings" sectionKey="gst" expanded={expandedSections.gst} onToggle={toggleSection}>
          <Toggle
            label="GST Registered"
            checked={assumptions.gst_registered}
            onChange={(v) => onUpdate('gst_registered', v)}
          />
          {assumptions.gst_registered && (
            <>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <NumberInput
                  label="GST Rate (%)"
                  value={assumptions.gst_rate * 100}
                  onChange={(v) => onUpdate('gst_rate', v / 100)}
                  min={0} max={30} step={0.5}
                />
                <SelectInput
                  label="BAS Frequency"
                  value={assumptions.gst_reporting_frequency}
                  onChange={(v) => onUpdate('gst_reporting_frequency', v as 'monthly' | 'quarterly')}
                  options={[
                    { value: 'quarterly', label: 'Quarterly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
              </div>
              <NumberInput
                label="% of OpEx with GST"
                value={assumptions.gst_applicable_expense_pct * 100}
                onChange={(v) => onUpdate('gst_applicable_expense_pct', v / 100)}
                min={0} max={100} step={5}
                className="mt-3"
              />
            </>
          )}
        </Section>

        {/* Tax Remittance */}
        <Section title="Tax Remittance" sectionKey="tax" expanded={expandedSections.tax} onToggle={toggleSection}>
          <SelectInput
            label="PAYG WH Frequency"
            value={assumptions.payg_wh_reporting_frequency}
            onChange={(v) => onUpdate('payg_wh_reporting_frequency', v as 'monthly' | 'quarterly')}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4 mt-3">
            <NumberInput
              label="PAYG Instalment ($)"
              value={assumptions.payg_instalment_amount}
              onChange={(v) => onUpdate('payg_instalment_amount', v)}
              min={0}
            />
            <SelectInput
              label="Instalment Freq."
              value={assumptions.payg_instalment_frequency}
              onChange={(v) => onUpdate('payg_instalment_frequency', v as 'quarterly' | 'annual' | 'none')}
              options={[
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'annual', label: 'Annual' },
                { value: 'none', label: 'None' },
              ]}
            />
          </div>
        </Section>

        {/* Superannuation */}
        <Section title="Superannuation" sectionKey="super" expanded={expandedSections.super} onToggle={toggleSection}>
          <SelectInput
            label="Payment Frequency"
            value={assumptions.super_payment_frequency}
            onChange={(v) => onUpdate('super_payment_frequency', v as 'monthly' | 'quarterly')}
            options={[
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </Section>

        {/* Opening Balances */}
        <Section title="Opening Balances" sectionKey="balances" expanded={expandedSections.balances} onToggle={toggleSection}>
          <button
            onClick={onSyncFromXero}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors disabled:opacity-50 mb-4"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync from Xero'}
          </button>

          {assumptions.balance_date && (
            <p className="text-xs text-gray-500 mb-3">
              Balances as at: {assumptions.balance_date}
              {assumptions.last_xero_sync_at && (
                <> (synced {new Date(assumptions.last_xero_sync_at).toLocaleDateString('en-AU')})</>
              )}
            </p>
          )}

          <div className="space-y-3">
            <CurrencyInput label="Bank Balance" value={assumptions.opening_bank_balance} onChange={(v) => onUpdate('opening_bank_balance', v)} />
            <CurrencyInput label="Trade Debtors (AR)" value={assumptions.opening_trade_debtors} onChange={(v) => onUpdate('opening_trade_debtors', v)} />
            <CurrencyInput label="Trade Creditors (AP)" value={assumptions.opening_trade_creditors} onChange={(v) => onUpdate('opening_trade_creditors', v)} />
            <CurrencyInput label="GST Liability" value={assumptions.opening_gst_liability} onChange={(v) => onUpdate('opening_gst_liability', v)} />
            <CurrencyInput label="PAYG WH Liability" value={assumptions.opening_payg_wh_liability} onChange={(v) => onUpdate('opening_payg_wh_liability', v)} />
            <CurrencyInput label="PAYG Instalment Liability" value={assumptions.opening_payg_instalment_liability} onChange={(v) => onUpdate('opening_payg_instalment_liability', v)} />
            <CurrencyInput label="Super Liability" value={assumptions.opening_super_liability} onChange={(v) => onUpdate('opening_super_liability', v)} />
            <CurrencyInput label="Stock on Hand" value={assumptions.opening_stock} onChange={(v) => onUpdate('opening_stock', v)} />
          </div>
        </Section>

        {/* Stock/Inventory */}
        <Section title="Planned Stock Changes" sectionKey="stock" expanded={expandedSections.stock} onToggle={toggleSection}>
          <p className="text-xs text-gray-500 mb-3">
            Enter positive amounts for months where you plan to buy more stock than you sell.
            Leave blank or 0 for no change.
          </p>
          <StockChangesEditor
            changes={assumptions.planned_stock_changes}
            onChange={(v) => onUpdate('planned_stock_changes', v)}
          />
        </Section>

        {/* Loans */}
        <Section title="Loans" sectionKey="loans" expanded={expandedSections.loans} onToggle={toggleSection}>
          <LoansEditor
            loans={assumptions.loans}
            onChange={(v) => onUpdate('loans', v)}
          />
        </Section>
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 px-5 py-4">
        <button
          onClick={() => onSave(assumptions)}
          className="w-full px-4 py-2.5 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({ title, sectionKey, expanded, onToggle, children }: {
  title: string
  sectionKey: string
  expanded: boolean
  onToggle: (key: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      {expanded && <div className="px-4 py-3">{children}</div>}
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step, badge, className }: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  badge?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {badge && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">{badge}</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step || 1}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
      />
    </div>
  )
}

function CurrencyInput({ label, value, onChange }: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs font-medium text-gray-700 whitespace-nowrap">{label}</label>
      <div className="relative w-36">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full pl-6 pr-2 py-1.5 text-sm text-right border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
        />
      </div>
    </div>
  )
}

function SelectInput({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-brand-orange' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function StockChangesEditor({ changes, onChange }: {
  changes: Record<string, number>
  onChange: (v: Record<string, number>) => void
}) {
  // Show next 12 months
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="space-y-2">
      {months.map(mk => {
        const [y, m] = mk.split('-').map(Number)
        return (
          <div key={mk} className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600 w-16">{MONTH_NAMES[m - 1]} {y}</span>
            <div className="relative w-28">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
              <input
                type="number"
                value={changes[mk] || ''}
                placeholder="0"
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0
                  const updated = { ...changes }
                  if (val === 0) {
                    delete updated[mk]
                  } else {
                    updated[mk] = val
                  }
                  onChange(updated)
                }}
                className="w-full pl-6 pr-2 py-1 text-xs text-right border border-gray-300 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LoansEditor({ loans, onChange }: {
  loans: LoanSchedule[]
  onChange: (v: LoanSchedule[]) => void
}) {
  const addLoan = () => {
    onChange([...loans, {
      name: `Loan ${loans.length + 1}`,
      balance: 0,
      monthly_repayment: 0,
      interest_rate: 0.065,
      is_interest_only: false,
    }])
  }

  const removeLoan = (idx: number) => {
    onChange(loans.filter((_, i) => i !== idx))
  }

  const updateLoan = (idx: number, updates: Partial<LoanSchedule>) => {
    onChange(loans.map((l, i) => i === idx ? { ...l, ...updates } : l))
  }

  return (
    <div className="space-y-4">
      {loans.map((loan, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={loan.name}
              onChange={(e) => updateLoan(idx, { name: e.target.value })}
              className="text-sm font-medium border-0 border-b border-gray-200 focus:ring-0 focus:border-brand-orange px-0 py-0.5 w-full"
            />
            <button onClick={() => removeLoan(idx)} className="p-1 hover:bg-red-50 rounded ml-2">
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
          <div className="space-y-2">
            <CurrencyInput label="Balance" value={loan.balance} onChange={(v) => updateLoan(idx, { balance: v })} />
            <CurrencyInput label="Monthly Repayment" value={loan.monthly_repayment} onChange={(v) => updateLoan(idx, { monthly_repayment: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <NumberInput
              label="Interest Rate (%)"
              value={loan.interest_rate * 100}
              onChange={(v) => updateLoan(idx, { interest_rate: v / 100 })}
              min={0} max={30} step={0.1}
            />
            <div className="pb-0.5">
              <Toggle
                label="Interest Only"
                checked={loan.is_interest_only}
                onChange={(v) => updateLoan(idx, { is_interest_only: v })}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={addLoan}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Loan
      </button>
    </div>
  )
}
