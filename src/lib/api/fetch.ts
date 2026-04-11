'use client'

const CSRF_TOKEN_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Read CSRF token from cookie (client-side only).
 * Duplicated from csrf.ts to avoid importing next/headers in client code.
 */
function getClientCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(^| )${CSRF_TOKEN_NAME}=([^;]+)`))
  return match ? match[2] : null
}

/**
 * Fetch wrapper that automatically includes CSRF token for state-changing requests.
 * Use this instead of raw fetch() for API calls that modify data.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase()

  // Add CSRF token for state-changing methods
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = getClientCsrfToken()
    if (token) {
      options.headers = {
        ...options.headers,
        [CSRF_HEADER_NAME]: token,
      }
    }
  }

  return fetch(url, options)
}
