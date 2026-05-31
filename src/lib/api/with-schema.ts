/**
 * Phase 47 — VALID-01: input-validation fork-gate.
 *
 * `withSchema` / `withQuerySchema` are generic higher-order route wrappers that
 * validate a request body/query against a Zod schema WITHOUT consuming the
 * original request stream (clone-and-forward, "Option B"). They have two modes:
 *
 *   observe (default): a parse failure logs a Sentry `zod:would-reject` warning
 *     and the original handler still runs with the raw request — ZERO behavior
 *     change. This is how VALID-02..05 sweep 116 routes safely.
 *
 *   enforce (route listed in ZOD_ENFORCE_ROUTES, or the '*' sentinel): a parse
 *     failure returns HTTP 400 { error, issues } and the handler is NOT called.
 *     VALID-06 flips this on per-route via env var only.
 *
 * The wrapper is generic over the trailing args so the dynamic-route `ctx`
 * (`{ params: { id } }` OR `{ params: Promise<{ id }> }`) is forwarded verbatim,
 * never awaited or destructured here.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import type { ZodType } from 'zod'

/**
 * True when `routeId` should reject invalid input (enforce mode).
 * Reads `process.env.ZOD_ENFORCE_ROUTES` on EVERY call so tests / runtime config
 * can toggle it. Format: comma-separated route ids, or '*' to enforce all.
 */
export function isEnforced(routeId: string): boolean {
  const set = new Set(
    (process.env.ZOD_ENFORCE_ROUTES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return set.has('*') || set.has(routeId)
}

/**
 * Wrap a route handler with body validation.
 *
 * @param routeId  Path under src/app/api with /route.ts stripped (e.g. 'team/invite').
 *                 Matches the `tags.route` value used in existing Sentry calls.
 */
export function withSchema<TArgs extends unknown[]>(
  routeId: string,
  schema: ZodType,
  handler: (request: Request, ...rest: TArgs) => Promise<Response> | Response
): (request: Request, ...rest: TArgs) => Promise<Response> {
  return async (request: Request, ...rest: TArgs): Promise<Response> => {
    // Clone BEFORE any read so the original stream stays intact for the handler.
    let raw: unknown
    try {
      raw = await request.clone().json()
    } catch {
      raw = undefined
    }

    const result = await schema.safeParseAsync(raw)
    if (!result.success) {
      if (isEnforced(routeId)) {
        return NextResponse.json(
          { error: 'Validation failed', issues: result.error.flatten() },
          { status: 400 }
        )
      }
      Sentry.captureMessage('zod:would-reject', {
        level: 'warning',
        tags: { route: routeId, invariant: 'zod_would_reject' },
        extra: { issues: result.error.issues },
      } as any)
    }

    return handler(request, ...rest)
  }
}

/**
 * Wrap a route handler with query-string validation.
 * Same observe/enforce semantics as `withSchema`, but parses
 * `Object.fromEntries(searchParams)` instead of the JSON body.
 */
export function withQuerySchema<TArgs extends unknown[]>(
  routeId: string,
  schema: ZodType,
  handler: (request: Request, ...rest: TArgs) => Promise<Response> | Response
): (request: Request, ...rest: TArgs) => Promise<Response> {
  return async (request: Request, ...rest: TArgs): Promise<Response> => {
    const query = Object.fromEntries(new URL(request.url).searchParams)
    const result = await schema.safeParseAsync(query)
    if (!result.success) {
      if (isEnforced(routeId)) {
        return NextResponse.json(
          { error: 'Validation failed', issues: result.error.flatten() },
          { status: 400 }
        )
      }
      Sentry.captureMessage('zod:would-reject', {
        level: 'warning',
        tags: { route: routeId, invariant: 'zod_would_reject' },
        extra: { issues: result.error.issues },
      } as any)
    }

    return handler(request, ...rest)
  }
}
