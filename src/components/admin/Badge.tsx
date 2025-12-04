'use client'

import { LucideIcon } from 'lucide-react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  icon?: LucideIcon
  size?: 'sm' | 'md'
  pulse?: boolean
}

const variantClasses = {
  success: 'bg-green-100 text-green-700 border-green-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
}

const pulseColors = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-500',
  purple: 'bg-purple-500',
}

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export function Badge({
  children,
  variant = 'neutral',
  icon: Icon,
  size = 'sm',
  pulse = false
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variantClasses[variant]}
        ${sizeClasses[size]}
      `}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColors[variant]}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${pulseColors[variant]}`} />
        </span>
      )}
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  )
}

// Status badge with predefined states
interface StatusBadgeProps {
  status: 'active' | 'pending' | 'inactive' | 'invited' | 'overdue'
}

const statusConfig: Record<string, { label: string; variant: BadgeVariant; pulse?: boolean }> = {
  active: { label: 'Active', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  inactive: { label: 'Inactive', variant: 'neutral' },
  invited: { label: 'Invited', variant: 'info' },
  overdue: { label: 'Overdue', variant: 'danger', pulse: true },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.inactive
  return (
    <Badge variant={config.variant} pulse={config.pulse}>
      {config.label}
    </Badge>
  )
}

// Role badge
interface RoleBadgeProps {
  role: 'super_admin' | 'coach' | 'client'
}

const roleConfig = {
  super_admin: { label: 'Admin', variant: 'purple' as BadgeVariant },
  coach: { label: 'Coach', variant: 'info' as BadgeVariant },
  client: { label: 'Client', variant: 'neutral' as BadgeVariant },
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfig[role]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
