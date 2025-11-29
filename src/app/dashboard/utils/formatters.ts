/**
 * Format currency values with K/M suffixes for large numbers
 */
export function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

/**
 * Format percentage values with one decimal place
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/**
 * Get status color class for rock progress
 */
export function getRockStatusColor(status: string): string {
  switch (status) {
    case 'on_track':
      return 'bg-green-500'
    case 'at_risk':
      return 'bg-yellow-500'
    case 'completed':
      return 'bg-blue-500'
    default:
      return 'bg-gray-400'
  }
}

/**
 * Get quarter display name
 */
export function getQuarterDisplayName(quarter: string): string {
  const quarterNames: Record<string, string> = {
    q1: 'Q1 (Jul-Sep)',
    q2: 'Q2 (Oct-Dec)',
    q3: 'Q3 (Jan-Mar)',
    q4: 'Q4 (Apr-Jun)'
  }
  return quarterNames[quarter] || quarter.toUpperCase()
}
