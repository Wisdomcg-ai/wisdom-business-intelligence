'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { X, AlertTriangle, Trash2, CheckCircle } from 'lucide-react'

interface ConfirmDialogOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean
  isLoading: boolean
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmDialogOptions) => void
  confirmDelete: (itemName: string, onConfirm: () => void | Promise<void>) => void
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null)

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider')
  }
  return context
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmDialogState>({
    isOpen: false,
    isLoading: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    setState({
      ...options,
      isOpen: true,
      isLoading: false,
    })
  }, [])

  const confirmDelete = useCallback((itemName: string, onConfirm: () => void | Promise<void>) => {
    confirm({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm,
    })
  }, [confirm])

  const handleClose = useCallback(() => {
    if (!state.isLoading) {
      state.onCancel?.()
      setState(prev => ({ ...prev, isOpen: false }))
    }
  }, [state])

  const handleConfirm = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      await state.onConfirm()
      setState(prev => ({ ...prev, isOpen: false, isLoading: false }))
    } catch (error) {
      console.error('Confirm action failed:', error)
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [state])

  const variantStyles = {
    danger: {
      icon: <Trash2 className="h-6 w-6 text-red-600" />,
      iconBg: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      iconBg: 'bg-amber-100',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      icon: <CheckCircle className="h-6 w-6 text-blue-600" />,
      iconBg: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  }

  const variant = state.variant || 'warning'
  const styles = variantStyles[variant]

  return (
    <ConfirmDialogContext.Provider value={{ confirm, confirmDelete }}>
      {children}

      {/* Dialog Overlay */}
      {state.isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          aria-labelledby="confirm-dialog-title"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all">
              {/* Close button */}
              <button
                onClick={handleClose}
                disabled={state.isLoading}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 disabled:opacity-50"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`flex-shrink-0 p-3 rounded-full ${styles.iconBg}`}>
                    {styles.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <h3
                      id="confirm-dialog-title"
                      className="text-lg font-semibold text-gray-900"
                    >
                      {state.title}
                    </h3>
                    <p className="mt-2 text-gray-600">
                      {state.message}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={handleClose}
                    disabled={state.isLoading}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {state.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={state.isLoading}
                    className={`px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${styles.button}`}
                  >
                    {state.isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      state.confirmLabel || 'Confirm'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  )
}

/**
 * Standalone ConfirmDialog component for direct use without context
 */
interface StandaloneConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void | Promise<void>
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  isLoading = false,
}: StandaloneConfirmDialogProps) {
  const variantStyles = {
    danger: {
      icon: <Trash2 className="h-6 w-6 text-red-600" />,
      iconBg: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      iconBg: 'bg-amber-100',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      icon: <CheckCircle className="h-6 w-6 text-blue-600" />,
      iconBg: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  }

  const styles = variantStyles[variant]

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="confirm-dialog-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 p-3 rounded-full ${styles.iconBg}`}>
                {styles.icon}
              </div>

              <div className="flex-1">
                <h3
                  id="confirm-dialog-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h3>
                <p className="mt-2 text-gray-600">{message}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${styles.button}`}
              >
                {isLoading ? 'Processing...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
