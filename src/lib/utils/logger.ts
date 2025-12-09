/**
 * Structured logging utility
 * Provides consistent logging format across the application
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development'

  private formatMessage(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context && { context })
    }
  }

  private output(level: LogLevel, message: string, context?: LogContext) {
    const entry = this.formatMessage(level, message, context)

    if (this.isDev) {
      const colors = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m'  // red
      }
      const reset = '\x1b[0m'
      const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`

      if (context && Object.keys(context).length > 0) {
        console[level](prefix, message, context)
      } else {
        console[level](prefix, message)
      }
    } else {
      // Production: output as JSON for log aggregation
      console[level](JSON.stringify(entry))
    }
  }

  debug(message: string, context?: LogContext) {
    if (this.isDev) {
      this.output('debug', message, context)
    }
  }

  info(message: string, context?: LogContext) {
    this.output('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.output('warn', message, context)
  }

  error(message: string, context?: LogContext) {
    this.output('error', message, context)
  }

  // Convenience method for API routes
  api(method: string, path: string, status: number, duration?: number) {
    const context: LogContext = { method, path, status }
    if (duration !== undefined) {
      context.duration = `${duration}ms`
    }

    if (status >= 500) {
      this.error('API Error', context)
    } else if (status >= 400) {
      this.warn('API Client Error', context)
    } else {
      this.info('API Request', context)
    }
  }

  // Convenience method for auth events
  auth(event: string, userId?: string, success = true) {
    const context: LogContext = { event, success }
    if (userId) {
      context.userId = userId
    }

    if (success) {
      this.info('Auth Event', context)
    } else {
      this.warn('Auth Event Failed', context)
    }
  }

  // Convenience method for database operations
  db(operation: string, table: string, duration?: number, success = true) {
    const context: LogContext = { operation, table, success }
    if (duration !== undefined) {
      context.duration = `${duration}ms`
    }

    if (success) {
      this.debug('DB Operation', context)
    } else {
      this.error('DB Operation Failed', context)
    }
  }
}

export const logger = new Logger()
