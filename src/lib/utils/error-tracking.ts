// Sentry is dynamically imported to avoid webpack patching issues in development
import type { SeverityLevel } from '@sentry/nextjs'

/**
 * Error tracking utility
 * Provides consistent error handling and reporting via Sentry
 */

interface ErrorContext {
  userId?: string
  route?: string
  action?: string
  metadata?: Record<string, unknown>
}

interface TrackedError {
  message: string
  stack?: string
  context: ErrorContext
  timestamp: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

class ErrorTracker {
  private isDev = process.env.NODE_ENV === 'development'
  private errorQueue: TrackedError[] = []
  private maxQueueSize = 100

  /**
   * Track an error with context
   */
  trackError(
    error: Error | string,
    context: ErrorContext = {},
    severity: TrackedError['severity'] = 'medium'
  ): void {
    const trackedError: TrackedError = {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
      severity,
    }

    // Log to console in development
    if (this.isDev) {
      const severityColors = {
        low: '\x1b[34m',     // blue
        medium: '\x1b[33m',  // yellow
        high: '\x1b[31m',    // red
        critical: '\x1b[35m' // magenta
      }
      const reset = '\x1b[0m'
      console.error(
        `${severityColors[severity]}[ERROR - ${severity.toUpperCase()}]${reset}`,
        trackedError.message,
        context
      )
      if (trackedError.stack) {
        console.error(trackedError.stack)
      }
    }

    // Add to queue
    this.errorQueue.push(trackedError)

    // Trim queue if too large
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize)
    }

    // Send to Sentry in production
    if (process.env.NODE_ENV === 'production') {
      import('@sentry/nextjs').then((Sentry) => {
        const severityMap: Record<string, string> = {
          critical: 'fatal',
          high: 'error',
          medium: 'warning',
          low: 'info',
        }
        const sentryLevel = severityMap[severity] || 'error'

        if (error instanceof Error) {
          Sentry.captureException(error, {
            level: sentryLevel as SeverityLevel,
            tags: { action: context.action },
            extra: { ...context.metadata, userId: context.userId, route: context.route },
          })
        } else {
          Sentry.captureMessage(String(error), {
            level: sentryLevel as SeverityLevel,
            tags: { action: context.action },
            extra: { ...context.metadata, userId: context.userId, route: context.route },
          })
        }
      }).catch(() => {})
    }
  }

  /**
   * Track a warning (non-critical issue)
   */
  trackWarning(message: string, context: ErrorContext = {}): void {
    this.trackError(message, context, 'low')
  }

  /**
   * Track a critical error that needs immediate attention
   */
  trackCritical(error: Error | string, context: ErrorContext = {}): void {
    this.trackError(error, context, 'critical')
  }

  /**
   * Get recent errors (useful for debugging)
   */
  getRecentErrors(count = 10): TrackedError[] {
    return this.errorQueue.slice(-count)
  }

  /**
   * Clear error queue
   */
  clearErrors(): void {
    this.errorQueue = []
  }

  /**
   * Create a wrapper for async functions that automatically tracks errors
   */
  wrapAsync<T>(
    fn: () => Promise<T>,
    context: ErrorContext = {}
  ): Promise<T> {
    return fn().catch((error) => {
      this.trackError(error, context)
      throw error
    })
  }

  /**
   * Track an API error with additional details
   */
  trackApiError(
    endpoint: string,
    status: number,
    error: Error | string,
    context: ErrorContext = {}
  ): void {
    const severity: TrackedError['severity'] =
      status >= 500 ? 'high' :
      status === 401 || status === 403 ? 'medium' : 'low'

    this.trackError(error, {
      ...context,
      action: `API ${endpoint}`,
      metadata: {
        ...context.metadata,
        status,
        endpoint,
      },
    }, severity)
  }

  /**
   * Track authentication-related errors
   */
  trackAuthError(
    action: string,
    error: Error | string,
    userId?: string
  ): void {
    this.trackError(error, {
      action: `Auth: ${action}`,
      userId,
    }, 'high')
  }

  /**
   * Track database operation errors
   */
  trackDbError(
    operation: string,
    table: string,
    error: Error | string,
    context: ErrorContext = {}
  ): void {
    this.trackError(error, {
      ...context,
      action: `DB: ${operation} on ${table}`,
    }, 'high')
  }
}

// Export singleton instance
export const errorTracker = new ErrorTracker()

/**
 * Higher-order function to wrap API route handlers with error tracking
 */
export function withErrorTracking<T>(
  handler: () => Promise<T>,
  context: ErrorContext = {}
): Promise<T> {
  return errorTracker.wrapAsync(handler, context)
}

/**
 * Utility to safely parse JSON with error tracking
 */
export function safeJsonParse<T>(
  json: string,
  fallback: T,
  context: ErrorContext = {}
): T {
  try {
    return JSON.parse(json) as T
  } catch (error) {
    errorTracker.trackError(
      error instanceof Error ? error : 'JSON parse error',
      { ...context, action: 'JSON parse' },
      'low'
    )
    return fallback
  }
}
