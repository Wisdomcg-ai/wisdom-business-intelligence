'use client'

import { LucideIcon } from 'lucide-react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  icon?: LucideIcon
  size?: 'sm' | 'md'
  pulse?: boolean
}

const variantClasses = {
  success: 'bg-brand-teal-100 text-brand-teal-700 border-brand-teal-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200',
  neutral: 'bg-slate-100 text-gray-600 border-slate-200',
  primary: 'bg-brand-navy-50 text-brand-navy border-brand-navy-200',
}

const pulseColors = {
  success: 'bg-brand-teal',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-brand-orange',
  neutral: 'bg-gray-500',
  primary: 'bg-brand-navy',
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
  super_admin: { label: 'Admin', variant: 'primary' as BadgeVariant },
  coach: { label: 'Coach', variant: 'info' as BadgeVariant },
  client: { label: 'Client', variant: 'neutral' as BadgeVariant },
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfig[role]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
