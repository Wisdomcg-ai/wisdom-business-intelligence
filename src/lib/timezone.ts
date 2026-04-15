// Centralized timezone configuration for the platform
// All date/time display should use these helpers to ensure Sydney timezone consistency

export const TIMEZONE = 'Australia/Sydney'
export const LOCALE = 'en-AU'

/** Format a date string or Date to a localized date string in Sydney timezone */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, ...options })
}

/** Format a date string or Date to a localized time string in Sydney timezone */
export function formatTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', ...options })
}

/** Format a date string or Date to a full localized date+time string in Sydney timezone */
export function formatDateTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(LOCALE, { timeZone: TIMEZONE, ...options })
}

/** Get the hour (0-23) in Sydney timezone for a given date */
export function getSydneyHour(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, hour: 'numeric', hour12: false }).formatToParts(d)
  const hourPart = parts.find(p => p.type === 'hour')
  return parseInt(hourPart?.value || '0', 10)
}

/** Get a Sydney-timezone date string (YYYY-MM-DD) for a given Date */
export function getSydneyDateString(date: Date): string {
  return formatDate(date, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-') // Convert DD/MM/YYYY to YYYY-MM-DD
}

/** Check if two dates fall on the same day in Sydney timezone */
export function isSameSydneyDay(a: Date, b: Date): boolean {
  return getSydneyDateString(a) === getSydneyDateString(b)
}
