'use client'

import {
  FileText, Table2, Calendar, CreditCard, Users, TrendingUp,
  PieChart, Target, Grid3x3, Flame, Timer, BarChart3, AlertTriangle,
  LineChart, DollarSign, Activity,
} from 'lucide-react'
import type { WidgetType } from '../../types/pdf-layout'
import { WIDGET_DEFINITIONS } from '../../constants/widget-registry'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Table2, Calendar, CreditCard, Users, TrendingUp,
  PieChart, Target, Grid3x3, Flame, Timer, BarChart3, AlertTriangle,
  LineChart, DollarSign, Activity,
}

const CATEGORY_COLORS: Record<string, string> = {
  tables: 'text-blue-500',
  pl_charts: 'text-emerald-500',
  cashflow_charts: 'text-violet-500',
  people_charts: 'text-amber-500',
  kpi_cards: 'text-rose-500',
}

const CATEGORY_BG: Record<string, string> = {
  tables: 'bg-blue-50 border-blue-200',
  pl_charts: 'bg-emerald-50 border-emerald-200',
  cashflow_charts: 'bg-violet-50 border-violet-200',
  people_charts: 'bg-amber-50 border-amber-200',
  kpi_cards: 'bg-rose-50 border-rose-200',
}

interface WidgetPreviewProps {
  type: WidgetType
  compact?: boolean
}

export default function WidgetPreview({ type, compact }: WidgetPreviewProps) {
  const def = WIDGET_DEFINITIONS[type]
  const IconComponent = ICON_MAP[def.icon] || FileText
  const colorClass = CATEGORY_COLORS[def.category] || 'text-gray-500'

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <IconComponent className={`w-4 h-4 ${colorClass}`} />
        <span className="text-xs font-medium text-gray-700 truncate">{def.label}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1.5 p-2">
      <IconComponent className={`w-6 h-6 ${colorClass}`} />
      <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">{def.label}</span>
    </div>
  )
}

export function getWidgetBgClass(type: WidgetType): string {
  const def = WIDGET_DEFINITIONS[type]
  return CATEGORY_BG[def.category] || 'bg-gray-50 border-gray-200'
}
