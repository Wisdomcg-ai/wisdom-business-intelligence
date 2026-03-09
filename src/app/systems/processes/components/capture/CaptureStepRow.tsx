'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  ArrowUp,
  ArrowDown,
  Zap,
  Clock,
  Diamond,
  Cog,
  Plus,
  X,
} from 'lucide-react'
import type { ProcessStepData, StepType, SwimlaneColor, DecisionOption, PhaseDefinition } from '@/types/process-builder'

const DECISION_COLORS = [
  { value: 'green', label: 'Green', hex: '#10B981' },
  { value: 'red', label: 'Red', hex: '#EF4444' },
  { value: 'blue', label: 'Blue', hex: '#3B82F6' },
  { value: 'orange', label: 'Orange', hex: '#F97316' },
]

interface CaptureStepRowProps {
  step: ProcessStepData
  orderInLane: number
  laneColor: SwimlaneColor
  isSelected: boolean
  isFirst: boolean
  isLast: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<ProcessStepData>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  dragHandleProps?: Record<string, unknown>
  phases?: PhaseDefinition[]
}

const STEP_TYPE_OPTIONS: { value: StepType; label: string; icon: React.ReactNode }[] = [
  { value: 'action', label: 'Action', icon: <div className="w-3 h-3 rounded bg-gray-400" /> },
  { value: 'decision', label: 'Decision', icon: <Diamond className="w-3 h-3 text-purple-500" /> },
  { value: 'wait', label: 'Wait', icon: <Clock className="w-3 h-3 text-amber-500" /> },
  { value: 'automation', label: 'Automation', icon: <Zap className="w-3 h-3 text-blue-500" /> },
]

export default function CaptureStepRow({
  step,
  orderInLane,
  laneColor,
  isSelected,
  isFirst,
  isLast,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  dragHandleProps,
  phases,
}: CaptureStepRowProps) {
  const [expanded, setExpanded] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      if (!expanded) setExpanded(true)
    }
  }, [isSelected])

  // Completion dots
  const completionFields = [
    !!step.description,
    !!step.estimated_duration,
    step.systems_used.length > 0,
    step.documents_needed.length > 0,
  ]
  const filledCount = completionFields.filter(Boolean).length

  const typeOption = STEP_TYPE_OPTIONS.find((t) => t.value === step.step_type)

  return (
    <div
      ref={rowRef}
      data-step-id={step.id}
      className={`border rounded-lg transition-all duration-150 ${
        isSelected
          ? 'border-orange-300 bg-orange-50/50 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer group"
        onClick={() => {
          onSelect()
          setExpanded(!expanded)
        }}
      >
        {/* Drag handle */}
        <div
          className="text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing"
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Order number */}
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: laneColor.border }}
        >
          {orderInLane}
        </span>

        {/* Step name */}
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
          {step.action_name}
        </span>

        {/* Phase pill (clickable to cycle) */}
        {phases && phases.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const sortedP = [...phases].sort((a, b) => a.order - b.order)
              const currentIdx = step.phase_id
                ? sortedP.findIndex((p) => p.id === step.phase_id)
                : -1
              // Cycle: none → first phase → second phase → ... → none
              const nextIdx = currentIdx + 1
              if (nextIdx >= sortedP.length) {
                onUpdate({ phase_id: undefined, phase_name: undefined })
              } else {
                onUpdate({ phase_id: sortedP[nextIdx].id, phase_name: sortedP[nextIdx].name })
              }
            }}
            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors"
            style={
              step.phase_id && phases.find((p) => p.id === step.phase_id)
                ? {
                    backgroundColor: phases.find((p) => p.id === step.phase_id)!.color.tint,
                    borderColor: phases.find((p) => p.id === step.phase_id)!.color.primary + '40',
                    color: phases.find((p) => p.id === step.phase_id)!.color.border,
                  }
                : {
                    backgroundColor: '#F9FAFB',
                    borderColor: '#E5E7EB',
                    color: '#9CA3AF',
                  }
            }
            title={step.phase_id ? 'Click to change phase' : 'Click to assign a phase'}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: step.phase_id && phases.find((p) => p.id === step.phase_id)
                  ? phases.find((p) => p.id === step.phase_id)!.color.primary
                  : '#D1D5DB',
              }}
            />
            {step.phase_id && phases.find((p) => p.id === step.phase_id)
              ? phases.find((p) => p.id === step.phase_id)!.name
              : '—'}
          </button>
        )}

        {/* Type badge */}
        <span className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wide shrink-0">
          {typeOption?.icon}
        </span>

        {/* Completion dots */}
        <div className="flex items-center gap-0.5 shrink-0">
          {completionFields.map((filled, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${filled ? 'bg-emerald-400' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* Duration badge */}
        {step.estimated_duration && (
          <span className="text-[10px] text-gray-400 shrink-0">
            {step.estimated_duration}
          </span>
        )}

        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
      </div>

      {/* Expanded detail form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3 animate-in slide-in-from-top-1 duration-150">
          {/* Name */}
          <Field label="Step Name">
            <input
              type="text"
              value={step.action_name}
              onChange={(e) => onUpdate({ action_name: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
            />
          </Field>

          {/* Type */}
          <Field label="Type">
            <div className="flex gap-1.5">
              {STEP_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate({ step_type: opt.value })}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                    step.step_type === opt.value
                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Phase */}
          {phases && phases.length > 0 && (
            <Field label="Phase">
              <select
                value={step.phase_id || ''}
                onChange={(e) => {
                  const phaseId = e.target.value || undefined
                  const phase = phases.find((p) => p.id === phaseId)
                  onUpdate({
                    phase_id: phaseId,
                    phase_name: phase?.name,
                  })
                }}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300 bg-white"
              >
                <option value="">None</option>
                {[...phases].sort((a, b) => a.order - b.order).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Decision options (up to 4) */}
          {step.step_type === 'decision' && (
            <DecisionOptionsEditor step={step} onUpdate={onUpdate} />
          )}

          {/* Description */}
          <Field label="Description">
            <textarea
              value={step.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="What happens in this step?"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300 resize-none"
            />
          </Field>

          {/* Duration + Owner */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Duration">
              <input
                type="text"
                value={step.estimated_duration || ''}
                onChange={(e) => onUpdate({ estimated_duration: e.target.value })}
                placeholder="e.g. 30 mins"
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
            </Field>
            <Field label="Owner">
              <input
                type="text"
                value={step.owner_role || ''}
                onChange={(e) => onUpdate({ owner_role: e.target.value })}
                placeholder="Who does this?"
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
            </Field>
          </div>

          {/* Systems */}
          <Field label="Systems Used">
            <TagInput
              tags={step.systems_used}
              onChange={(tags) => onUpdate({ systems_used: tags })}
              placeholder="Add system…"
              color="blue"
            />
          </Field>

          {/* Documents */}
          <Field label="Documents">
            <TagInput
              tags={step.documents_needed}
              onChange={(tags) => onUpdate({ documents_needed: tags })}
              placeholder="Add document…"
              color="amber"
            />
          </Field>

          {/* Success criteria */}
          <Field label="Success Criteria">
            <input
              type="text"
              value={step.success_criteria || ''}
              onChange={(e) => onUpdate({ success_criteria: e.target.value })}
              placeholder="How do you know this step is done?"
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300"
            />
          </Field>

          {/* Actions row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Get decision options, migrating from legacy yes/no labels if needed */
function getDecisionOptions(step: ProcessStepData): DecisionOption[] {
  if (step.decision_options && step.decision_options.length > 0) {
    return step.decision_options
  }
  // Migrate from legacy yes/no labels
  const options: DecisionOption[] = []
  if (step.decision_yes_label || step.decision_no_label) {
    options.push({ label: step.decision_yes_label || 'Yes', color: 'green' })
    options.push({ label: step.decision_no_label || 'No', color: 'red' })
  } else {
    options.push({ label: 'Yes', color: 'green' })
    options.push({ label: 'No', color: 'red' })
  }
  return options
}

function DecisionOptionsEditor({
  step,
  onUpdate,
}: {
  step: ProcessStepData
  onUpdate: (updates: Partial<ProcessStepData>) => void
}) {
  const options = getDecisionOptions(step)

  const updateOption = (index: number, field: keyof DecisionOption, value: string) => {
    const updated = [...options]
    updated[index] = { ...updated[index], [field]: value }
    onUpdate({
      decision_options: updated,
      // Keep legacy fields in sync for backward compat
      decision_yes_label: updated[0]?.label,
      decision_no_label: updated[1]?.label,
    })
  }

  const addOption = () => {
    if (options.length >= 4) return
    const usedColors = new Set(options.map((o) => o.color))
    const nextColor = DECISION_COLORS.find((c) => !usedColors.has(c.value))?.value || 'blue'
    const updated = [...options, { label: `Option ${options.length + 1}`, color: nextColor }]
    onUpdate({ decision_options: updated })
  }

  const removeOption = (index: number) => {
    if (options.length <= 2) return
    const updated = options.filter((_, i) => i !== index)
    onUpdate({
      decision_options: updated,
      decision_yes_label: updated[0]?.label,
      decision_no_label: updated[1]?.label,
    })
  }

  return (
    <Field label="Decision Options">
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {/* Color dot selector */}
            <button
              type="button"
              onClick={() => {
                const colorIdx = DECISION_COLORS.findIndex((c) => c.value === opt.color)
                const next = DECISION_COLORS[(colorIdx + 1) % DECISION_COLORS.length]
                updateOption(i, 'color', next.value)
              }}
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm shrink-0"
              style={{ backgroundColor: DECISION_COLORS.find((c) => c.value === opt.color)?.hex || '#6B7280' }}
              title={`Color: ${opt.color} (click to cycle)`}
            />
            {/* Label input */}
            <input
              type="text"
              value={opt.label}
              onChange={(e) => updateOption(i, 'label', e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
            />
            {/* Remove button (only if more than 2 options) */}
            {options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                className="p-0.5 text-gray-300 hover:text-red-400 rounded"
                title="Remove option"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {options.length < 4 && (
          <button
            onClick={addOption}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-500 mt-1"
          >
            <Plus className="w-3 h-3" />
            Add option
          </button>
        )}
      </div>
    </Field>
  )
}

function TagInput({
  tags,
  onChange,
  placeholder,
  color,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder: string
  color: 'blue' | 'amber'
}) {
  const [input, setInput] = useState('')
  const colorClasses = color === 'blue'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      onChange([...tags, input.trim()])
      setInput('')
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((tag, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colorClasses}`}
        >
          {tag}
          <button
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            className="hover:opacity-70"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-sm border-0 px-0 py-0.5 focus:outline-none focus:ring-0 bg-transparent"
      />
    </div>
  )
}
