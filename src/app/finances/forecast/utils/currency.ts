import type { Currency } from '../types'

/**
 * Currency configuration for different currencies
 */
export const CURRENCY_CONFIG: Record<Currency, {
  code: Currency
  symbol: string
  name: string
  locale: string
  decimals: number
}> = {
  AUD: {
    code: 'AUD',
    symbol: 'A$',
    name: 'Australian Dollar',
    locale: 'en-AU',
    decimals: 2
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    decimals: 2
  },
  NZD: {
    code: 'NZD',
    symbol: 'NZ$',
    name: 'New Zealand Dollar',
    locale: 'en-NZ',
    decimals: 2
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    locale: 'en-GB',
    decimals: 2
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'en-EU',
    decimals: 2
  }
}

/**
 * Format a number as currency with proper locale and rounding
 * Uses banker's rounding (round half to even) for financial accuracy
 */
export function formatCurrency(
  value: number,
  currency: Currency = 'AUD',
  options: {
    showSymbol?: boolean
    showCode?: boolean
    decimals?: number
    compact?: boolean
  } = {}
): string {
  const config = CURRENCY_CONFIG[currency]
  const {
    showSymbol = true,
    showCode = false,
    decimals = config.decimals,
    compact = false
  } = options

  // Apply banker's rounding
  const rounded = roundToPrecision(value, decimals)

  // Format with Intl.NumberFormat
  const formatter = new Intl.NumberFormat(config.locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency: config.code,
    minimumFractionDigits: compact && rounded % 1 === 0 ? 0 : decimals,
    maximumFractionDigits: decimals,
    notation: compact ? 'compact' : 'standard'
  })

  let formatted = formatter.format(rounded)

  // Add currency code if requested
  if (showCode && !showSymbol) {
    formatted = `${formatted} ${config.code}`
  }

  return formatted
}

/**
 * Banker's rounding (round half to even)
 * This is the standard for financial calculations
 * Examples:
 *   2.5 -> 2 (even)
 *   3.5 -> 4 (even)
 *   2.555 (2 decimals) -> 2.56
 */
export function roundToPrecision(value: number, decimals: number = 2): number {
  if (decimals === 0) {
    // For integers, use banker's rounding
    const lower = Math.floor(value)
    const upper = Math.ceil(value)
    const fraction = value - lower

    if (fraction === 0.5) {
      // Round to nearest even
      return lower % 2 === 0 ? lower : upper
    }
    return Math.round(value)
  }

  // For decimals, apply banker's rounding at the precision level
  const multiplier = Math.pow(10, decimals)
  const scaled = value * multiplier
  const rounded = roundToPrecision(scaled, 0) // Recursive call for integer rounding
  return rounded / multiplier
}

/**
 * Parse a currency string to a number
 * Handles various formats: $1,234.56, 1234.56, 1.234,56 (EU format)
 */
export function parseCurrency(value: string, currency: Currency = 'AUD'): number {
  if (!value || typeof value !== 'string') return 0

  const config = CURRENCY_CONFIG[currency]

  // Remove currency symbols and spaces
  let cleaned = value.trim()
  cleaned = cleaned.replace(config.symbol, '')
  cleaned = cleaned.replace(config.code, '')
  cleaned = cleaned.trim()

  // Handle different decimal separators
  // EU format uses comma as decimal separator
  if (config.locale.includes('EU')) {
    cleaned = cleaned.replace(/\./g, '') // Remove thousand separators
    cleaned = cleaned.replace(',', '.') // Convert comma to period
  } else {
    cleaned = cleaned.replace(/,/g, '') // Remove thousand separators
  }

  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currency: Currency = 'AUD'): string {
  return CURRENCY_CONFIG[currency].symbol
}

/**
 * Get currency name for a currency code
 */
export function getCurrencyName(currency: Currency = 'AUD'): string {
  return CURRENCY_CONFIG[currency].name
}

/**
 * Convert between currencies (placeholder - would need real exchange rates)
 * For now, returns the same value
 */
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  exchangeRate?: number
): number {
  if (from === to) return amount
  if (exchangeRate) {
    return roundToPrecision(amount * exchangeRate, 2)
  }
  // In production, this would fetch live exchange rates
  console.warn('Currency conversion requires exchange rate. Returning original amount.')
  return amount
}
