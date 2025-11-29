// src/lib/kpi/utils/formatters.ts
// Production-ready formatting utilities for KPI values

/**
 * Format a number as currency
 * @param value - The numeric value to format
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00'
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch (error) {
    // Fallback for invalid currency codes
    return `$${value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
}

/**
 * Format a number as a percentage
 * @param value - The numeric value to format (0-100 scale)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%'
  }

  return `${value.toFixed(decimals)}%`
}

/**
 * Format a number with locale-specific formatting
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 0)
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted number string
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 0,
  locale: string = 'en-US'
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0'
  }

  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format a number as days
 * @param value - The numeric value representing days
 * @returns Formatted days string
 */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0 days'
  }

  const rounded = Math.round(value)
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`
}

/**
 * Format a KPI value based on its unit type
 * @param value - The value to format
 * @param unit - The unit type
 * @returns Formatted value string
 */
export function formatKPIValue(
  value: number | null | undefined,
  unit: 'currency' | 'percentage' | 'number' | 'days' | 'ratio' | string
): string {
  switch (unit) {
    case 'currency':
      return formatCurrency(value)
    case 'percentage':
      return formatPercentage(value)
    case 'days':
      return formatDays(value)
    case 'number':
    case 'ratio':
    default:
      return formatNumber(value)
  }
}

/**
 * Compact large numbers into readable format (e.g., 1.2M, 3.4K)
 * @param value - The numeric value to format
 * @returns Compacted number string
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0'
  }

  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1)}M`
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(1)}K`
  }

  return `${sign}${absValue.toFixed(0)}`
}

/**
 * Format a percentage change with + or - indicator
 * @param value - The percentage change value
 * @returns Formatted change string with indicator
 */
export function formatPercentageChange(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%'
  }

  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}