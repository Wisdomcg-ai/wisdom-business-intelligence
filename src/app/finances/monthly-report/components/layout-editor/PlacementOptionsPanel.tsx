'use client'

/**
 * Options for a placed cover, summary or Where Did Our Money Go page — what
 * the cover says about reconciliation, whether the summary prints its margins,
 * which bank accounts the money-flow page lists, and how it ends.
 *
 * Thin by design, like the ratio panel: the options, their defaults, what
 * Apply stores and the reading the PDF applies all live in
 * lib/monthly-report/placement-options. Every choice starts at the page as it
 * printed before the option existed, and a choice left at that default is not
 * stored.
 */
import { useEffect, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import type { LayoutWidget } from '../../types/pdf-layout'
import {
  PLACEMENT_OPTIONS,
  applyPlacementOptions,
  readPlacementOptions,
  type PlacementOptionsType,
} from '@/lib/monthly-report/placement-options'

interface PlacementOptionsPanelProps {
  widget: LayoutWidget & { type: PlacementOptionsType }
  onCancel: () => void
  /** Called only when the stored config would change. */
  onApply: (config: Record<string, unknown>) => void
}

const headingClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'
const helpClass = 'text-[11px] text-gray-500'

export default function PlacementOptionsPanel({ widget, onCancel, onApply }: PlacementOptionsPanelProps) {
  const set = PLACEMENT_OPTIONS[widget.type]
  // Read once: the panel is keyed on the placement.
  const [initial] = useState(() => readPlacementOptions(widget.type, widget.config))
  const [values, setValues] = useState<Record<string, string>>(initial.values)
  const [dropUnrecognised, setDropUnrecognised] = useState(false)
  const headingId = `placement-options-${widget.id}`

  // The editor's own shortcuts are suspended while this is open; Escape here
  // cancels the panel and leaves the layout exactly as it was.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const apply = () => {
    const next = applyPlacementOptions(widget.type, widget.config, values, { dropUnrecognised })
    // Nothing changed: no history entry, and the layout is not marked unsaved.
    // Compared key by key — Apply writes the keys in its own order.
    const stored = widget.config ?? {}
    const unchanged =
      Object.keys(next).length === Object.keys(stored).length &&
      Object.entries(next).every(([key, value]) => JSON.stringify(stored[key]) === JSON.stringify(value))
    if (unchanged) onCancel()
    else onApply(next)
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* No click-to-close, as on the ratio panel: a stray click must not throw the choices away. */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-[460px] h-full bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Settings2 className="w-4 h-4 text-brand-orange" />
            {set.title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Close without applying"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {(initial.unrecognised.length > 0 || initial.invalid.length > 0) && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
              {initial.invalid.length > 0 && (
                <p>
                  {initial.invalid.join(', ')} held a value this page does not offer; Apply replaces it with the choice shown.
                </p>
              )}
              {initial.unrecognised.length > 0 && (
                <>
                  <p>
                    This page also has settings made by hand that this panel does not show: {initial.unrecognised.join(', ')}.
                    {widget.type === 'money_flow' && ' The page prints a configuration error until they are removed.'}
                  </p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dropUnrecognised} onChange={(e) => setDropUnrecognised(e.target.checked)} />
                    Remove them when I apply
                  </label>
                </>
              )}
            </div>
          )}

          {set.options.map((option) => (
            <fieldset key={option.key} className="space-y-2">
              <legend className={headingClass}>{option.label}</legend>
              {option.help && <p className={helpClass}>{option.help}</p>}
              {option.choices.map((choice) => (
                <label key={choice.value} className="flex items-start gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    className="mt-0.5"
                    name={`${widget.id}-${option.key}`}
                    value={choice.value}
                    checked={values[option.key] === choice.value}
                    onChange={() => setValues({ ...values, [option.key]: choice.value })}
                  />
                  <span className="space-y-0.5">
                    <span className="block">{choice.label}</span>
                    {choice.help && <span className={`block ${helpClass}`}>{choice.help}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-white">
          <p className={helpClass}>Apply updates this page in the layout. Press Save Layout to keep it.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-md"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
