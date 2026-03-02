// Shared chart color constants for monthly report charts

export const CHART_COLORS = {
  revenue:       { hex: '#10b981', rgb: [16, 185, 129] as [number, number, number] },
  expenses:      { hex: '#ef4444', rgb: [239, 68, 68] as [number, number, number] },
  cogs:          { hex: '#f59e0b', rgb: [245, 158, 11] as [number, number, number] },
  grossProfit:   { hex: '#3b82f6', rgb: [59, 130, 246] as [number, number, number] },
  netProfit:     { hex: '#1e293b', rgb: [30, 41, 59] as [number, number, number] },
  opex:          { hex: '#f97316', rgb: [249, 115, 22] as [number, number, number] },
  otherIncome:   { hex: '#8b5cf6', rgb: [139, 92, 246] as [number, number, number] },
  otherExpenses: { hex: '#6b7280', rgb: [107, 114, 128] as [number, number, number] },
  bankBalance:   { hex: '#1e293b', rgb: [30, 41, 59] as [number, number, number] },
  wages:         { hex: '#3b82f6', rgb: [59, 130, 246] as [number, number, number] },
  positive:      { hex: '#10b981', rgb: [16, 185, 129] as [number, number, number] },
  negative:      { hex: '#ef4444', rgb: [239, 68, 68] as [number, number, number] },
  neutral:       { hex: '#6b7280', rgb: [107, 114, 128] as [number, number, number] },
  warning:       { hex: '#f59e0b', rgb: [245, 158, 11] as [number, number, number] },
  subtotal:      { hex: '#3b82f6', rgb: [59, 130, 246] as [number, number, number] },
  prior:         { hex: '#cbd5e1', rgb: [203, 213, 225] as [number, number, number] },
  current:       { hex: '#3b82f6', rgb: [59, 130, 246] as [number, number, number] },
  ratio:         { hex: '#ec4899', rgb: [236, 72, 153] as [number, number, number] },
}

// Heatmap color scale: green (favorable) -> yellow (neutral) -> red (unfavorable)
export function getHeatmapColor(variancePct: number): { hex: string; rgb: [number, number, number] } {
  if (variancePct >= 10) return { hex: '#10b981', rgb: [16, 185, 129] }
  if (variancePct >= 5)  return { hex: '#34d399', rgb: [52, 211, 153] }
  if (variancePct >= 0)  return { hex: '#a7f3d0', rgb: [167, 243, 208] }
  if (variancePct >= -5) return { hex: '#fde68a', rgb: [253, 230, 138] }
  if (variancePct >= -10) return { hex: '#fbbf24', rgb: [251, 191, 36] }
  if (variancePct >= -20) return { hex: '#f97316', rgb: [249, 115, 22] }
  return { hex: '#ef4444', rgb: [239, 68, 68] }
}
