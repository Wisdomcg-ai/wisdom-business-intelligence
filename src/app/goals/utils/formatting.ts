// /app/goals/utils/formatting.ts
// Helper functions for formatting and parsing values

export const formatDollar = (value: number): string => {
  return '$' + value.toLocaleString('en-AU')
}

export const formatCurrency = (value: number): string => {
  return '$' + value.toLocaleString('en-AU')
}

export const formatNumber = (value: number): string => {
  return value.toLocaleString('en-AU')
}

export const formatPercentage = (value: number): string => {
  return value.toFixed(1) + '%'
}

export const parseDollarInput = (value: string): number => {
  return Number(value.replace(/[$,]/g, ''))
}

export const getUnitLabel = (unit: string): string => {
  switch(unit) {
    case 'currency': return '($)'
    case 'percentage': return '(%)'
    case 'number': return '(#)'
    default: return ''
  }
}

export const mapIndustryFromDatabase = (dbIndustry: string | null): string => {
  if (!dbIndustry) return 'building_construction'
  const lower = dbIndustry.toLowerCase()
  if (lower.includes('construction') || lower.includes('building')) return 'building_construction'
  if (lower.includes('allied') || lower.includes('health')) return 'allied_health'
  if (lower.includes('professional') || lower.includes('services')) return 'professional_services'
  if (lower.includes('retail')) return 'retail'
  return 'building_construction'
}