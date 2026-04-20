'use client'

/**
 * ConsolidatedCashflowTab — Phase 34, Iteration 34.2.
 *
 * Renders a 12-month consolidated cashflow table for a consolidation parent
 * business. Layout mirrors the user's Dragon / IICT PDFs:
 *
 *   Each tenant gets three rows: Opening → Net Cashflow → Closing
 *   Consolidated row at the bottom with the combined 12-month series
 *
 * Months run horizontally (sticky first column = row label). A collapsible
 * diagnostics section at the bottom surfaces the pragmatic forecast-baseline
 * note from the engine.
 */

interface ConsolidatedCashflowMonthVM {
  month: string
  cash_in: number
  cash_out: number
  net_movement: number
  opening_balance: number
  closing_balance: number
}

interface ConsolidatedCashflowTenantVM {
  connection_id: string
  tenant_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  months: ConsolidatedCashflowMonthVM[]
  opening_balance: number
  closing_balance: number
}

interface ConsolidatedCashflowReportVM {
  business: { id: string; name: string; presentation_currency: string }
  fiscalYear: number
  fyStartDate: string
  byTenant: ConsolidatedCashflowTenantVM[]
  consolidated: {
    months: ConsolidatedCashflowMonthVM[]
    opening_balance: number
    closing_balance: number
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    tenants_loaded: number
    forecast_available: boolean
    processing_ms: number
    notes: string[]
  }
}

function fmt(value: number | null | undefined, dash = false): string {
  if (value === null || value === undefined || (dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${String(y).slice(-2)}`
}

interface Props {
  report: ConsolidatedCashflowReportVM | null
  isLoading: boolean
  error: string | null
}

export default function ConsolidatedCashflowTab({
  report,
  isLoading,
  error,
}: Props) {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading consolidated cashflow…
      </div>
    )
  }
  if (error) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }
  if (!report) {
    return (
      <div className="p-8 text-center text-gray-500">
        Select a fiscal year to generate the consolidated cashflow.
      </div>
    )
  }

  const months = report.consolidated.months

  return (
    <div className="space-y-4 bg-white rounded-lg shadow-sm p-4">
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2 whitespace-nowrap">
                Tenant / Row
              </th>
              {months.map((m) => (
                <th
                  key={m.month}
                  className="text-right px-4 py-2 whitespace-nowrap"
                >
                  {monthLabel(m.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Per-tenant rows: Opening → Net → Closing for each tenant */}
            {report.byTenant.map((tenant) => (
              <TenantBlock key={tenant.connection_id} tenant={tenant} />
            ))}

            {/* Consolidated block */}
            <tr className="bg-gray-100">
              <td
                colSpan={months.length + 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700"
              >
                Consolidated
              </td>
            </tr>
            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap pl-6">
                Opening Balance
              </td>
              {months.map((m, i) => (
                <td
                  key={`cons-open-${i}`}
                  className="text-right tabular-nums px-4 py-2"
                >
                  {fmt(m.opening_balance)}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap pl-6">
                Net Cashflow
              </td>
              {months.map((m, i) => (
                <td
                  key={`cons-net-${i}`}
                  className={`text-right tabular-nums px-4 py-2 ${
                    m.net_movement < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(m.net_movement, true)}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50 font-semibold border-b-2 border-gray-300">
              <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 whitespace-nowrap pl-6">
                Closing Balance
              </td>
              {months.map((m, i) => (
                <td
                  key={`cons-close-${i}`}
                  className={`text-right tabular-nums px-4 py-2 ${
                    m.closing_balance < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(m.closing_balance)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Diagnostics — surface the pragmatic forecast-baseline note */}
      {report.diagnostics.notes.length > 0 && (
        <details className="border rounded-lg p-4 bg-amber-50 border-amber-200">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">
            About this consolidated cashflow
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-amber-800 list-disc pl-5">
            {report.diagnostics.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="text-xs text-gray-500">
        Tenants loaded: {report.diagnostics.tenants_loaded} · Forecast baseline:{' '}
        {report.diagnostics.forecast_available ? 'available' : 'missing'} ·
        Processing: {report.diagnostics.processing_ms}ms · FY:{' '}
        {report.fiscalYear}
      </div>
    </div>
  )
}

/**
 * Render a single tenant's three-row block (Opening / Net / Closing) plus a
 * section header row with the tenant's display name + currency badge.
 */
function TenantBlock({ tenant }: { tenant: ConsolidatedCashflowTenantVM }) {
  return (
    <>
      <tr className="bg-gray-100/60">
        <td
          colSpan={tenant.months.length + 1}
          className="px-4 py-2 text-sm font-semibold text-gray-700"
        >
          {tenant.display_name}
          {tenant.functional_currency !== 'AUD' && (
            <span className="ml-2 text-xs text-gray-500">
              ({tenant.functional_currency})
            </span>
          )}
        </td>
      </tr>
      <tr className="border-b">
        <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap pl-6">
          Opening Balance
        </td>
        {tenant.months.map((m, i) => (
          <td
            key={`${tenant.connection_id}-open-${i}`}
            className="text-right tabular-nums px-4 py-2"
          >
            {fmt(m.opening_balance)}
          </td>
        ))}
      </tr>
      <tr className="border-b">
        <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap pl-6">
          Net Cashflow
        </td>
        {tenant.months.map((m, i) => (
          <td
            key={`${tenant.connection_id}-net-${i}`}
            className={`text-right tabular-nums px-4 py-2 ${
              m.net_movement < 0 ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {fmt(m.net_movement, true)}
          </td>
        ))}
      </tr>
      <tr className="bg-gray-50 border-b">
        <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 whitespace-nowrap pl-6 font-medium">
          Closing Balance
        </td>
        {tenant.months.map((m, i) => (
          <td
            key={`${tenant.connection_id}-close-${i}`}
            className={`text-right tabular-nums px-4 py-2 ${
              m.closing_balance < 0 ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {fmt(m.closing_balance)}
          </td>
        ))}
      </tr>
    </>
  )
}
