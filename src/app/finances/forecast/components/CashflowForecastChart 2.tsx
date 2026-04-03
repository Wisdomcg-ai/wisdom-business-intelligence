'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { CashflowForecastData } from '../types'
import { transformCashflowToChartData, CASHFLOW_CHART_COLORS, CASHFLOW_CHART_SERIES } from '../utils/cashflow-chart-data'

interface CashflowForecastChartProps {
  data: CashflowForecastData
}

function fmtCurrency(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function fmtAxisTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}</span>
          </div>
          <span className={`font-medium ${entry.value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {fmtCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function CashflowForecastChart({ data }: CashflowForecastChartProps) {
  const chartData = transformCashflowToChartData(data)

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div style={{ width: '100%', height: 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            stackOffset="sign"
            margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: '#6b7280' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={fmtAxisTick}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

            {/* Positive bars (above zero) */}
            <Bar
              dataKey="income"
              name="Income"
              fill={CASHFLOW_CHART_COLORS.income.hex}
              stackId="cashflow"
            />
            <Bar
              dataKey="otherIncome"
              name="Other Income"
              fill={CASHFLOW_CHART_COLORS.otherIncome.hex}
              stackId="cashflow"
            />

            {/* Negative bars (below zero) */}
            <Bar
              dataKey="costOfSales"
              name="Cost of Sales"
              fill={CASHFLOW_CHART_COLORS.costOfSales.hex}
              stackId="cashflow"
            />
            <Bar
              dataKey="expenses"
              name="Expenses"
              fill={CASHFLOW_CHART_COLORS.expenses.hex}
              stackId="cashflow"
            />
            <Bar
              dataKey="liabilities"
              name="Liabilities"
              fill={CASHFLOW_CHART_COLORS.liabilities.hex}
              stackId="cashflow"
            />

            {/* Bank at End line overlay */}
            <Line
              type="monotone"
              dataKey="bankAtEnd"
              name="Bank at End"
              stroke={CASHFLOW_CHART_COLORS.bankAtEnd.hex}
              strokeWidth={2}
              dot={{ r: 4, fill: CASHFLOW_CHART_COLORS.bankAtEnd.hex }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
