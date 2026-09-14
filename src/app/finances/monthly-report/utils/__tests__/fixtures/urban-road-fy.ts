/**
 * Urban Road's FY2027 Full Year report as the loader returned it for the
 * August 2026 pack — the figures Calxa's Current Year Budget pages (16-18) are
 * measured against. Stored compactly (one array per month-field) and hydrated
 * back into the payload shape here.
 */
import type { FullYearLine, FullYearReport } from '../../../types'
import raw from './urban-road-fy2027-aug.json'

interface CompactLine {
  name: string
  code: string | null
  group: string | null
  category: string
  actual: number[]
  forecast: number[]
  approved: (number | null)[]
  prior_year: number[]
}

function hydrate(l: CompactLine, months: string[], lastActual: string): FullYearLine {
  const md = months.map((month, i) => ({
    month,
    actual: l.actual[i],
    budget: l.forecast[i],
    approved_budget: l.approved[i],
    prior_year: l.prior_year[i],
    source: (month <= lastActual ? 'actual' : 'forecast') as 'actual' | 'forecast',
  }))
  // The loader's own forecast-basis totals, so the payload is the payload.
  const projected = md.reduce((s, m) => s + (m.source === 'actual' ? m.actual : m.budget), 0)
  const annual = md.reduce((s, m) => s + m.budget, 0)
  return {
    account_name: l.name,
    account_code: l.code,
    group: l.group,
    category: l.category,
    months: md,
    projected_total: projected,
    annual_budget: annual,
    approved_annual_budget: md.some((m) => m.approved_budget !== null)
      ? md.reduce((s, m) => s + (m.approved_budget ?? 0), 0)
      : null,
    variance_amount: 0,
    variance_percent: 0,
  }
}

export function urbanRoadFullYear(): FullYearReport {
  const r = raw as unknown as {
    business_id: string
    fiscal_year: number
    last_actual_month: string
    months: string[]
    approved_budget_label: string | null
    forecast_available: boolean
    expense_group_order: string[] | null
    sections: { category: string; lines: CompactLine[]; subtotal: CompactLine }[]
    gross_profit: CompactLine
    net_profit: CompactLine
  }
  const h = (l: CompactLine) => hydrate(l, r.months, r.last_actual_month)
  return {
    business_id: r.business_id,
    fiscal_year: r.fiscal_year,
    last_actual_month: r.last_actual_month,
    sections: r.sections.map((s) => ({ category: s.category, lines: s.lines.map(h), subtotal: h(s.subtotal) })),
    gross_profit: h(r.gross_profit),
    net_profit: h(r.net_profit),
    approved_budget_label: r.approved_budget_label,
    forecast_available: r.forecast_available,
    expense_group_order: r.expense_group_order,
  }
}

/** The same report with the approved budget stripped — a client on the forecast. */
export function urbanRoadOnForecast(): FullYearReport {
  const fy = urbanRoadFullYear()
  const strip = (l: FullYearLine): FullYearLine => ({
    ...l,
    approved_annual_budget: null,
    months: l.months.map((m) => ({ ...m, approved_budget: null })),
  })
  return {
    ...fy,
    approved_budget_label: null,
    sections: fy.sections.map((s) => ({ ...s, lines: s.lines.map(strip), subtotal: strip(s.subtotal) })),
    gross_profit: strip(fy.gross_profit),
    net_profit: strip(fy.net_profit),
  }
}
