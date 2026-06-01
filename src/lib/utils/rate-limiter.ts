/**
 * Rate limiter for API routes.
 *
 * R11: backed by Upstash Redis (shared state across all Vercel function
 * instances) when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are present;
 * otherwise falls back to a per-instance in-memory map so local dev, CI, and
 * preview (without Upstash provisioned) keep working. The in-memory path is
 * leaky across instances — Upstash is the correct production backing.
 *
 * `checkRateLimit` is async (the Upstash call is a network round-trip). On an
 * Upstash error it falls back to the in-memory check rather than failing open.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { ipAddress } from '@vercel/functions'

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

// In-memory storage for rate limit records (fallback when Upstash is absent).
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
  },
  // AI routes (30 requests per hour per user - protects against cost abuse)
  ai: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30
  },
  // Email sending (10 per hour per user)
  email: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10
  },
  // Report generation (20 per hour per user)
  report: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 20
  }
} as const

// ─── Upstash backing (production) ───────────────────────────────────────────
// Built lazily and cached per (window,max) so each config reuses one Ratelimit.
const upstashEnabled = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

let redisClient: Redis | null = null
function getRedis(): Redis | null {
  if (!upstashEnabled) return null
  if (!redisClient) {
    try {
      redisClient = Redis.fromEnv()
    } catch {
      redisClient = null
    }
  }
  return redisClient
}

const limiterCache = new Map<string, Ratelimit>()
function getUpstashLimiter(config: RateLimitConfig): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const key = `${config.windowMs}:${config.maxRequests}`
  let limiter = limiterCache.get(key)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      // Sliding window keyed on the caller-supplied identifier.
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${config.windowMs} ms`),
      prefix: 'rl',
      analytics: false,
    })
    limiterCache.set(key, limiter)
  }
  return limiter
}

/** In-memory fallback check (per-instance). */
function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs }
  }

  if (record.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now }
  }

  record.count++
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetIn: record.resetTime - now,
  }
}

/**
 * Check if a request is allowed under rate limiting.
 * @param identifier - Unique identifier (IP address, user ID, or route+id key)
 * @param config - Rate limit configuration
 * @returns allowed status, remaining requests, and reset-in (ms)
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(config)
  if (limiter) {
    try {
      const res = await limiter.limit(identifier)
      return {
        allowed: res.success,
        remaining: Math.max(0, res.remaining),
        resetIn: Math.max(0, res.reset - Date.now()),
      }
    } catch (err) {
      // Transient Upstash error → fall back to the in-memory limiter so we still
      // throttle rather than failing open.
      console.error('[rate-limiter] Upstash error, falling back to in-memory:', err)
    }
  }
  return checkRateLimitInMemory(identifier, config)
}

/**
 * Get the client IP from a request.
 *
 * R11: prefer Vercel's verified client IP (`ipAddress`) over the raw
 * `x-forwarded-for` header. The leftmost `x-forwarded-for` value is
 * attacker-controllable (a client can prepend a forged IP), which let callers
 * trivially evade IP-keyed limits. `ipAddress` reads the platform-set client IP
 * on Vercel. Off-Vercel we fall back to `x-real-ip`, then the LAST hop of
 * `x-forwarded-for` (closest trusted proxy), then 'unknown'.
 */
export function getClientIP(request: Request): string {
  try {
    const verified = ipAddress(request)
    if (verified) return verified
  } catch {
    // ipAddress throws off-Vercel / on unsupported request types — fall through.
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP.trim()

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }

  return 'unknown'
}

/**
 * Create a rate limit key combining route and identifier
 */
export function createRateLimitKey(route: string, identifier: string): string {
  return `${route}:${identifier}`
}

// Cleanup old in-memory entries every 5 minutes to prevent memory leaks.
// (No-op when Upstash is handling state — the map simply stays empty.)
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
