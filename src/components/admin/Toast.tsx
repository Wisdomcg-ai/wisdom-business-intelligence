'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const newToast = { ...toast, id }
    setToasts((prev) => [...prev, newToast])

    // Auto remove after duration (default 5 seconds)
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: 'success', title, message })
  }, [addToast])

  const error = useCallback((title: string, message?: string) => {
    addToast({ type: 'error', title, message, duration: 8000 })
  }, [addToast])

  const warning = useCallback((title: string, message?: string) => {
    addToast({ type: 'warning', title, message })
  }, [addToast])

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: 'info', title, message })
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

// Toast Container
function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-0 right-0 z-[100] p-4 flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

// Individual Toast
function ToastItem({ toast, onClose }: { toast: Toast, onClose: () => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }

  const colors = {
    success: {
      bg: 'bg-green-50 border-green-200',
      icon: 'text-green-500',
      title: 'text-green-900',
      message: 'text-green-700',
    },
    error: {
      bg: 'bg-red-50 border-red-200',
      icon: 'text-red-500',
      title: 'text-red-900',
      message: 'text-red-700',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      icon: 'text-amber-500',
      title: 'text-amber-900',
      message: 'text-amber-700',
    },
    info: {
      bg: 'bg-brand-orange-50 border-brand-orange-200',
      icon: 'text-brand-orange',
      title: 'text-brand-navy',
      message: 'text-brand-orange-700',
    },
  }

  const Icon = icons[toast.type]
  const color = colors[toast.type]

  return (
    <div
      className={`
        pointer-events-auto w-full rounded-xl border shadow-lg p-4
        animate-in slide-in-from-right-full duration-300
        ${color.bg}
      `}
    >
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${color.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${color.title}`}>{toast.title}</p>
          {toast.message && (
            <p className={`mt-1 text-sm ${color.message}`}>{toast.message}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className={`flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors ${color.icon}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
