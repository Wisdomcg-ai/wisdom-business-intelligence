/**
 * Simple in-memory rate limiter for API routes
 * For production with multiple servers, consider using Redis
 */

interface RateLimitRecord {
  count: number
  resetTime: number
}

interface RateLimitConfig {
  windowMs: number    // Time window in milliseconds
  maxRequests: number // Max requests per window
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number
}

// In-memory storage for rate limit records
const rateLimitMap = new Map<string, RateLimitRecord>()

// Default configurations for different route types
export const RATE_LIMIT_CONFIGS = {
  // Strict limit for auth routes (5 attempts per 15 minutes)
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  // Password reset (3 attempts per hour)
  passwordReset: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 3
  },
  // API routes (100 requests per minute)
  api: {
    windowMs: 60 * 1000,
    maxRequests: 100
  },
  // File uploads (20 per hour)
  upload: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 20
  }
} as const

/**
 * Check if a request is allowed under rate limiting
 * @param identifier - Unique identifier (usually IP address or user ID)
 * @param config - Rate limit configuration
 * @returns Object with allowed status, remaining requests, and reset time
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): RateLimitResult {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  // If no record exists or window has expired, create new record
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs
    }
  }

  // Check if limit exceeded
  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetTime - now
    }
  }

  // Increment count and allow request
  record.count++
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetIn: record.resetTime - now
  }
}

/**
 * Get client IP from request headers
 * Handles both direct connections and proxy forwarded headers
 */
export function getClientIP(request: Request): string {
  // Check forwarded headers (in order of trust)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Fallback
  return 'unknown'
}

/**
 * Create a rate limit key combining route and identifier
 */
export function createRateLimitKey(route: string, identifier: string): string {
  return `${route}:${identifier}`
}

// Cleanup old entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}
