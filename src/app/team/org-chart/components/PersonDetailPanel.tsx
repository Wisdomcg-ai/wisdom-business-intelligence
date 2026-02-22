'use client'

import { useState } from 'react'
import { X, Trash2, AlertTriangle } from 'lucide-react'
import { getInitials, getColorForName } from '@/app/goals/utils/team'
import { OrgChartPerson, EmploymentType } from '../types'
import { getPersonFTE } from '../utils/org-chart-analytics'

interface PersonDetailPanelProps {
  person: OrgChartPerson
  existingDepartments: string[]
  onUpdate: (updates: Partial<OrgChartPerson>) => void
  onDelete: () => void
  onClose: () => void
}

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'casual', label: 'Casual' },
]

export default function PersonDetailPanel({
  person,
  existingDepartments,
  onUpdate,
  onDelete,
  onClose,
}: PersonDetailPanelProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const avatarColor = getColorForName(person.name)
  const initials = getInitials(person.name)

  return (
    <div className="w-80 bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor}`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
            <p className="text-xs text-gray-500 truncate">{person.title}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            type="text"
            value={person.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
          <input
            type="text"
            value={person.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
          <input
            type="text"
            list="departments-list"
            value={person.department}
            onChange={(e) => onUpdate({ department: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
            placeholder="e.g. Operations, Sales"
          />
          <datalist id="departments-list">
            {existingDepartments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        {/* Employment Type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Employment Type
          </label>
          <select
            value={person.employmentType}
            onChange={(e) =>
              onUpdate({ employmentType: e.target.value as EmploymentType })
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none bg-white"
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
          <input
            type="date"
            value={person.startDate}
            onChange={(e) => onUpdate({ startDate: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>

        {/* Salary */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Annual Salary ($)
          </label>
          <input
            type="number"
            value={person.salary || ''}
            onChange={(e) => onUpdate({ salary: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
            placeholder="e.g. 85000"
          />
        </div>

        {/* Hours per week + FTE */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Hours per Week
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={person.hoursPerWeek ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value)
                onUpdate({ hoursPerWeek: val })
              }}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
              placeholder={person.employmentType === 'full-time' ? '38' : 'e.g. 20'}
              min={0}
              max={168}
              step={1}
            />
            <div className="flex-shrink-0 text-right">
              <p className="text-sm font-semibold text-gray-900">
                {getPersonFTE(person).toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-400">FTE</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            FTE calculated on 38-hour standard week
          </p>
        </div>

        {/* Assistant toggle */}
        {person.parentId && (
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-medium text-gray-600">Assistant Role</p>
              <p className="text-[11px] text-gray-400">Position to the side of their manager</p>
            </div>
            <button
              onClick={() => onUpdate({ isAssistant: !person.isAssistant })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                person.isAssistant ? 'bg-brand-orange' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform`}
                style={{ transform: person.isAssistant ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        )}

        {/* Vacant toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-xs font-medium text-gray-600">Vacant / Planned Role</p>
            <p className="text-[11px] text-gray-400">Mark as an unfilled position</p>
          </div>
          <button
            onClick={() => onUpdate({ isVacant: !person.isVacant })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              person.isVacant ? 'bg-brand-orange' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                person.isVacant ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
              style={{ transform: person.isVacant ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        {/* Planned Hire Date (shows when vacant) */}
        {person.isVacant && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Planned Hire Date
            </label>
            <input
              type="date"
              value={person.plannedHireDate || ''}
              onChange={(e) => onUpdate({ plannedHireDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={person.notes || ''}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none resize-none"
            placeholder="Coach notes about this role..."
          />
        </div>
      </div>

      {/* Delete button */}
      <div className="px-4 py-3 border-t border-gray-100">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-600 flex-1">Delete this person?</span>
            <button
              onClick={() => {
                onDelete()
                setShowDeleteConfirm(false)
              }}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Person
          </button>
        )}
      </div>
    </div>
  )
}
