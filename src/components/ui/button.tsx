import * as React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'destructive-outline' | 'link' | 'navy' | 'success'
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'xl' | 'icon' | 'icon-sm' | 'icon-lg'
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', fullWidth = false, ...props }, ref) => {
    // Base styles - consistent foundation for all buttons
    const baseStyles = [
      'inline-flex items-center justify-center gap-2',
      'font-medium',
      'rounded-lg',
      'transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'select-none',
      fullWidth ? 'w-full' : '',
    ].join(' ')

    // Variant styles - visual appearance
    const variantStyles: Record<string, string> = {
      // Primary CTA - Orange (main actions: Save, Submit, Create, Continue)
      default: [
        'bg-brand-orange text-white',
        'hover:bg-brand-orange-600 active:bg-brand-orange-700',
        'focus-visible:ring-brand-orange',
        'shadow-sm hover:shadow-md',
      ].join(' '),

      // Secondary - White with border (Cancel, Back, secondary actions)
      secondary: [
        'bg-white text-gray-700 border border-gray-300',
        'hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100',
        'focus-visible:ring-gray-400',
        'shadow-sm',
      ].join(' '),

      // Outline - Transparent with border (alternative secondary)
      outline: [
        'bg-transparent text-gray-700 border border-gray-300',
        'hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100',
        'focus-visible:ring-gray-400',
      ].join(' '),

      // Ghost - No background (tertiary actions, in-table actions)
      ghost: [
        'bg-transparent text-gray-600',
        'hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
        'focus-visible:ring-gray-400',
      ].join(' '),

      // Destructive - Red (Delete, Remove)
      destructive: [
        'bg-red-600 text-white',
        'hover:bg-red-700 active:bg-red-800',
        'focus-visible:ring-red-500',
        'shadow-sm hover:shadow-md',
      ].join(' '),

      // Destructive Outline - Red border (softer delete option)
      'destructive-outline': [
        'bg-transparent text-red-600 border border-red-300',
        'hover:bg-red-50 hover:border-red-400 active:bg-red-100',
        'focus-visible:ring-red-400',
      ].join(' '),

      // Link - Text only with underline
      link: [
        'bg-transparent text-brand-orange',
        'hover:text-brand-orange-700 hover:underline',
        'focus-visible:ring-brand-orange',
        'underline-offset-4',
      ].join(' '),

      // Navy - Alternative primary for special emphasis
      navy: [
        'bg-brand-navy text-white',
        'hover:bg-brand-navy-700 active:bg-brand-navy-800',
        'focus-visible:ring-brand-navy',
        'shadow-sm hover:shadow-md',
      ].join(' '),

      // Success - Green for positive confirmations
      success: [
        'bg-green-600 text-white',
        'hover:bg-green-700 active:bg-green-800',
        'focus-visible:ring-green-500',
        'shadow-sm hover:shadow-md',
      ].join(' '),
    }

    // Size styles - dimensions and typography
    const sizeStyles: Record<string, string> = {
      xs: 'h-7 px-2.5 text-xs',
      sm: 'h-8 px-3 text-sm',
      default: 'h-10 px-4 text-sm',
      lg: 'h-11 px-6 text-base',
      xl: 'h-12 px-8 text-base',
      icon: 'h-10 w-10 p-0',
      'icon-sm': 'h-8 w-8 p-0',
      'icon-lg': 'h-12 w-12 p-0',
    }

    return (
      <button
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
