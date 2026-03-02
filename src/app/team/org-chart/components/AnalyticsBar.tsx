'use client'

import { useState } from 'react'
import {
  ChevronUp,
  ChevronDown,
  Users,
  DollarSign,
  BarChart3,
  Layers,
} from 'lucide-react'
import { OrgAnalytics, DEPARTMENT_BG_PALETTE, getDepartmentColorIndex } from '../types'
import { formatCurrency } from '../utils/org-chart-analytics'
import { VersionDiffResult } from '../types'
import { getDiffSummary } from '../utils/version-diff'

interface AnalyticsBarProps {
  analytics: OrgAnalytics
  departmentColors: Record<string, string>
  diff: VersionDiffResult | null
}

export default function AnalyticsBar({
  analytics,
  departmentColors,
  diff,
}: AnalyticsBarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const depts = Object.entries(analytics.byDepartment).sort(
    (a, b) => b[1].count - a[1].count
  )
  const maxDeptCount = depts.length > 0 ? Math.max(...depts.map(([, d]) => d.count)) : 1

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Toggle bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {analytics.totalHeadcount}
            {analytics.plannedHeadcount > 0 && (
              <span className="text-amber-600">+{analytics.plannedHeadcount}</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-teal-600">
            {analytics.filledFTE} FTE
            {analytics.totalFTE > analytics.filledFTE && (
              <span className="text-amber-600">
                +{(analytics.totalFTE - analytics.filledFTE).toFixed(1)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {formatCurrency(analytics.totalCost)}
          </span>
          {analytics.spanOfControl.avg > 0 && (
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {analytics.spanOfControl.avg} avg span
            </span>
          )}
          {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) && (
            <span className="text-brand-orange font-medium">{getDiffSummary(diff)}</span>
          )}
        </div>
        {collapsed ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {/* Expanded analytics */}
      {!collapsed && (
        <div className="px-4 pb-3 pt-1 flex items-end gap-6">
          {/* Department breakdown */}
          {depts.length > 0 && (
            <div className="flex-1">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                By Department
              </p>
              <div className="flex items-end gap-1.5 h-10">
                {depts.map(([dept, data]) => {
                  const idx = getDepartmentColorIndex(dept, departmentColors)
                  const height = Math.max(8, (data.count / maxDeptCount) * 40)
                  return (
                    <div
                      key={dept}
                      className="flex flex-col items-center gap-0.5"
                      title={`${dept}: ${data.count} people, ${formatCurrency(data.cost)}`}
                    >
                      <span className="text-[9px] text-gray-400">{data.count}</span>
                      <div
                        className={`w-6 rounded-t ${DEPARTMENT_BG_PALETTE[idx]} opacity-70`}
                        style={{ height }}
                      />
                      <span className="text-[9px] text-gray-500 truncate max-w-[40px]">
                        {dept}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="flex gap-4 text-xs text-gray-600 flex-shrink-0">
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Total FTE</p>
              <p className="font-medium">{analytics.totalFTE}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Depth</p>
              <p className="font-medium">{analytics.orgDepth} levels</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Span</p>
              <p className="font-medium">
                {analytics.spanOfControl.min}–{analytics.spanOfControl.max}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Total Cost</p>
              <p className="font-medium">
                {formatCurrency(analytics.totalCost + analytics.plannedCost)}
              </p>
            </div>
            {analytics.totalFTE > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Cost / FTE</p>
                <p className="font-medium">
                  {formatCurrency(Math.round((analytics.totalCost + analytics.plannedCost) / analytics.totalFTE))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
