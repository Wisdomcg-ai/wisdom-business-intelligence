// Forecast Module Logger Utility
// Provides structured logging with log levels for development vs production

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogOptions {
  context?: string
  data?: unknown
}

const isDevelopment = process.env.NODE_ENV === 'development'

// Color codes for terminal (development only)
const colors = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m'
}

const formatMessage = (level: LogLevel, message: string, context?: string): string => {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8)
  const prefix = context ? `[Forecast:${context}]` : '[Forecast]'
  return `${timestamp} ${prefix} ${message}`
}

/**
 * Logger for the Forecast module
 * - In development: All levels are logged with colors
 * - In production: Only warn and error are logged
 */
export const logger = {
  /**
   * Debug level - only shown in development
   * Use for detailed debugging information
   */
  debug: (message: string, options?: LogOptions) => {
    if (!isDevelopment) return

    const formatted = formatMessage('debug', message, options?.context)
    if (options?.data !== undefined) {
      console.log(`${colors.debug}${formatted}${colors.reset}`, options.data)
    } else {
      console.log(`${colors.debug}${formatted}${colors.reset}`)
    }
  },

  /**
   * Info level - only shown in development
   * Use for general operational information
   */
  info: (message: string, options?: LogOptions) => {
    if (!isDevelopment) return

    const formatted = formatMessage('info', message, options?.context)
    if (options?.data !== undefined) {
      console.log(`${colors.info}${formatted}${colors.reset}`, options.data)
    } else {
      console.log(`${colors.info}${formatted}${colors.reset}`)
    }
  },

  /**
   * Warning level - shown in all environments
   * Use for potentially problematic situations
   */
  warn: (message: string, options?: LogOptions) => {
    const formatted = formatMessage('warn', message, options?.context)
    if (options?.data !== undefined) {
      console.warn(`${colors.warn}${formatted}${colors.reset}`, options.data)
    } else {
      console.warn(`${colors.warn}${formatted}${colors.reset}`)
    }
  },

  /**
   * Error level - shown in all environments
   * Use for error conditions
   */
  error: (message: string, options?: LogOptions) => {
    const formatted = formatMessage('error', message, options?.context)
    if (options?.data !== undefined) {
      console.error(`${colors.error}${formatted}${colors.reset}`, options.data)
    } else {
      console.error(`${colors.error}${formatted}${colors.reset}`)
    }

    // In production, you could send to an error tracking service here
    // e.g., Sentry.captureException(options?.data)
  },

  /**
   * Group related logs together (development only)
   */
  group: (label: string, fn: () => void) => {
    if (!isDevelopment) {
      fn()
      return
    }
    console.group(`[Forecast] ${label}`)
    fn()
    console.groupEnd()
  },

  /**
   * Measure execution time (development only)
   */
  time: (label: string) => {
    if (isDevelopment) {
      console.time(`[Forecast] ${label}`)
    }
  },

  timeEnd: (label: string) => {
    if (isDevelopment) {
      console.timeEnd(`[Forecast] ${label}`)
    }
  }
}

export default logger
