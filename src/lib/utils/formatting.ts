/**
 * Shared formatting utilities
 *
 * Centralised formatting functions to replace the 90+ local definitions
 * scattered across the codebase. New code should import from here.
 */

/**
 * Format a number as AUD currency (whole dollars, no cents)
 * Handles null/undefined gracefully — returns '--' for missing values
 */
export function formatCurrency(
  amount: number | null | undefined,
  options?: {
    compact?: boolean
    decimals?: number
    placeholder?: string
  }
): string {
  const { compact = false, decimals = 0, placeholder = '--' } = options || {}

  if (amount === null || amount === undefined || isNaN(amount)) return placeholder

  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
    if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  }

  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/**
 * Format a percentage value
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 1,
  placeholder: string = '--'
): string {
  if (value === null || value === undefined || isNaN(value)) return placeholder
  return `${value.toFixed(decimals)}%`
}

/**
 * Format a number with comma separators
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 0,
  placeholder: string = '--'
): string {
  if (value === null || value === undefined || isNaN(value)) return placeholder
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
