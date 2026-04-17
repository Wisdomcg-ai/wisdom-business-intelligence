'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react'
import { useCashflowStatement } from '../hooks/useCashflowStatement'
import StatementClassificationEditor from './StatementClassificationEditor'
import type { FinancialForecast } from '../types'
import type { StatementLineItem } from '@/lib/cashflow/statement'

function fmt$(value: number, emphasise = false): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return value < 0 ? `(${formatted})` : formatted
}

interface Props {
  forecast: FinancialForecast
}

export default function CashflowStatementTab({ forecast }: Props) {
  const [showClassifier, setShowClassifier] = useState(false)
  const {
    statement,
    classifications,
    isLoadingStatement,
    isLoadingClassifications,
    isAutoClassifying,
    error,
    loadStatement,
    autoClassify,
    upsertClassification,
  } = useCashflowStatement(forecast.id)

  // Auto-load statement for the actuals period when forecast is ready
  useEffect(() => {
    if (!forecast?.actual_start_month || !forecast?.actual_end_month) return
    loadStatement(forecast.actual_start_month, forecast.actual_end_month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast?.actual_start_month, forecast?.actual_end_month, classifications.length])

  const periodLabel = statement
    ? `${statement.period.from} → ${statement.period.to}`
    : `${forecast?.actual_start_month ?? '?'} → ${forecast?.actual_end_month ?? '?'}`

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cashflow Statement (AASB 107)</h2>
          <p className="text-xs text-gray-500">Period: {periodLabel}</p>
        </div>
        <button
          onClick={() => setShowClassifier(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showClassifier ? 'Hide' : 'Edit'} classifications
        </button>
      </div>

      {/* Classification editor (collapsible) */}
      {showClassifier && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <StatementClassificationEditor
            classifications={classifications}
            isLoading={isLoadingClassifications}
            isAutoClassifying={isAutoClassifying}
            onUpsert={upsertClassification}
            onAutoClassify={autoClassify}
          />
        </div>
      )}

      {/* Loading / error */}
      {isLoadingStatement && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-brand-orange mx-auto mb-2" />
          <p className="text-sm text-gray-600">Building statement from Xero…</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state — no classifications yet */}
      {!isLoadingStatement && classifications.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Classifications needed before statement can be built
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Each balance sheet account needs to be classified as Operating, Investing, Financing, or Non-Cash.
                Click &quot;Edit classifications&quot; above to set this up — auto-classify will seed the defaults.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Statement */}
      {statement && classifications.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          {/* Reconciliation badge */}
          <div className={`px-4 py-2 text-xs border-b border-gray-200 flex items-center gap-2 ${
            statement.reconciles ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
          }`}>
            {statement.reconciles ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Statement reconciles to Xero bank</>
            ) : (
              <><AlertTriangle className="w-3.5 h-3.5" /> Statement does not reconcile — check for unassigned accounts or timing differences</>
            )}
            {statement.unassigned_accounts > 0 && (
              <span className="ml-auto">
                {statement.unassigned_accounts} unassigned
              </span>
            )}
          </div>

          <div className="p-4 space-y-4 text-sm">
            {/* Operating Activities */}
            <Section title="Cash Flows from Operating Activities">
              <Row label="Net profit before tax" value={statement.net_profit} />
              <Row label="Depreciation &amp; amortisation (add-back)" value={statement.noncash_addbacks} />
              {statement.operating_movements.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 pt-1">Movement in working capital:</p>
                  {statement.operating_movements.map(l => (
                    <Row key={l.label} label={`  ${l.label}`} value={l.movement} indent />
                  ))}
                </>
              )}
              <Subtotal label="Net cash from operating activities" value={statement.net_cash_from_operating} />
            </Section>

            {/* Investing Activities */}
            <Section title="Cash Flows from Investing Activities">
              {statement.investing_movements.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-2">No investing activity this period</p>
              ) : (
                statement.investing_movements.map(l => (
                  <Row key={l.label} label={l.label} value={l.movement} indent />
                ))
              )}
              <Subtotal label="Net cash from investing activities" value={statement.net_cash_from_investing} />
            </Section>

            {/* Financing Activities */}
            <Section title="Cash Flows from Financing Activities">
              {statement.financing_movements.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-2">No financing activity this period</p>
              ) : (
                statement.financing_movements.map(l => (
                  <Row key={l.label} label={l.label} value={l.movement} indent />
                ))
              )}
              <Subtotal label="Net cash from financing activities" value={statement.net_cash_from_financing} />
            </Section>

            {/* Net change + reconciliation */}
            <div className="pt-3 border-t-2 border-gray-300">
              <Row label="Net increase / (decrease) in cash" value={statement.net_change_in_cash} bold />
              <Row label="Cash at beginning of period" value={statement.opening_cash} />
              <Row label="Cash at end of period" value={statement.closing_cash} bold />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 pb-1 border-b border-gray-200 mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  indent,
}: {
  label: string
  value: number
  bold?: boolean
  indent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between px-2 py-0.5 ${bold ? 'font-semibold' : ''} ${indent ? 'pl-4' : ''}`}>
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-sm tabular-nums ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {fmt$(value)}
      </span>
    </div>
  )
}

function Subtotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 mt-1 bg-gray-50 rounded">
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {fmt$(value)}
      </span>
    </div>
  )
}
