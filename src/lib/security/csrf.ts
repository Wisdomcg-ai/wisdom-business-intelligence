import { cookies } from 'next/headers'
import crypto from 'crypto'

const CSRF_TOKEN_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Get or create CSRF token from cookies
 */
export async function getCsrfToken(): Promise<string> {
  const cookieStore = await cookies()
  let token = cookieStore.get(CSRF_TOKEN_NAME)?.value

  if (!token) {
    token = generateCsrfToken()
    // Note: Setting cookie should be done in a route handler or middleware
  }

  return token
}

/**
 * Validate CSRF token from request headers against cookie
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_TOKEN_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) {
    return false
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken)
    )
  } catch {
    return false
  }
}

/**
 * Middleware helper to check CSRF for state-changing requests
 */
export async function csrfProtection(request: Request): Promise<{ valid: boolean; error?: string }> {
  const method = request.method.toUpperCase()

  // Only check CSRF for state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true }
  }

  // Skip CSRF check for API routes that use other auth (like API keys)
  const url = new URL(request.url)
  const skipPaths = [
    '/api/auth/callback',
    '/api/Xero/callback',
    '/api/webhook'
  ]

  if (skipPaths.some(path => url.pathname.startsWith(path))) {
    return { valid: true }
  }

  const isValid = await validateCsrfToken(request)

  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid or missing CSRF token'
    }
  }

  return { valid: true }
}

/**
 * Client-side: Get CSRF token for use in fetch requests
 */
export function getClientCsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(new RegExp(`(^| )${CSRF_TOKEN_NAME}=([^;]+)`))
  return match ? match[2] : null
}

/**
 * Client-side: Add CSRF token to fetch options
 */
export function withCsrf(options: RequestInit = {}): RequestInit {
  const token = getClientCsrfToken()

  if (!token) {
    return options
  }

  return {
    ...options,
    headers: {
      ...options.headers,
      [CSRF_HEADER_NAME]: token
    }
  }
}
