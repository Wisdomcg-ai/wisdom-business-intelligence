'use client'

import {
  DEPARTMENT_BG_PALETTE,
  DEPARTMENT_TEXT_PALETTE,
  getDepartmentColorIndex,
} from '../types'

interface DepartmentFilterProps {
  departments: string[]
  departmentColors: Record<string, string>
  activeFilter: string | null
  onFilter: (department: string | null) => void
}

export default function DepartmentFilter({
  departments,
  departmentColors,
  activeFilter,
  onFilter,
}: DepartmentFilterProps) {
  if (departments.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {departments.map((dept) => {
        const idx = getDepartmentColorIndex(dept, departmentColors)
        const isActive = activeFilter === dept
        return (
          <button
            key={dept}
            onClick={() => onFilter(isActive ? null : dept)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              isActive
                ? `${DEPARTMENT_BG_PALETTE[idx]} ${DEPARTMENT_TEXT_PALETTE[idx]} border-current font-medium`
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {dept}
          </button>
        )
      })}
    </div>
  )
}
