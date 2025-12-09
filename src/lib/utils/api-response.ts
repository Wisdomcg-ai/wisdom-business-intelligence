import { NextResponse } from 'next/server'

/**
 * Standardized API response utilities
 * Use these for consistent API responses across all routes
 */

export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Return a successful response with data
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data },
    { status }
  )
}

/**
 * Return an error response
 */
export function errorResponse(
  message: string,
  status = 400,
  code?: string
) {
  return NextResponse.json(
    { success: false, error: message, ...(code && { code }) },
    { status }
  )
}

/**
 * Return a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total
    }
  })
}

/**
 * Common error responses
 */
export const CommonErrors = {
  unauthorized: () => errorResponse('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => errorResponse('Forbidden', 403, 'FORBIDDEN'),
  notFound: (resource = 'Resource') => errorResponse(`${resource} not found`, 404, 'NOT_FOUND'),
  badRequest: (message = 'Bad request') => errorResponse(message, 400, 'BAD_REQUEST'),
  internalError: () => errorResponse('Internal server error', 500, 'INTERNAL_ERROR'),
  rateLimit: (retryAfter?: number) => {
    const headers: Record<string, string> = {}
    if (retryAfter) {
      headers['Retry-After'] = String(retryAfter)
    }
    return NextResponse.json(
      { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
      { status: 429, headers }
    )
  }
}
