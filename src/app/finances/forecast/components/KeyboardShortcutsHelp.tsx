'use client'

import React from 'react'
import { X, Keyboard } from 'lucide-react'
import { FORECAST_SHORTCUTS, type ShortcutHelpItem } from '../hooks/useKeyboardShortcuts'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null

  const categories = ['Navigation', 'Editing', 'Actions'] as const
  const groupedShortcuts = categories.map(category => ({
    category,
    shortcuts: FORECAST_SHORTCUTS.filter(s => s.category === category)
  }))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <Keyboard className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Keyboard Shortcuts</h2>
                <p className="text-sm text-gray-500">Boost your productivity with these shortcuts</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-100px)]">
            <div className="space-y-6">
              {groupedShortcuts.map(({ category, shortcuts }) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {shortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg"
                      >
                        <span className="text-sm text-gray-700">{shortcut.description}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, keyIndex) => (
                            <React.Fragment key={keyIndex}>
                              {keyIndex > 0 && (
                                <span className="text-gray-400 mx-1">+</span>
                              )}
                              <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded shadow-sm">
                                {key}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Note */}
            <div className="mt-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
              <p className="text-xs text-teal-800">
                <strong>Tip:</strong> Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-teal-900 bg-teal-100 border border-teal-300 rounded">?</kbd> anytime to show this help dialog.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
