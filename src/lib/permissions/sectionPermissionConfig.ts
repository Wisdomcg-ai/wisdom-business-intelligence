import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import type { SectionPermissionVerdict } from './requireSectionPermission'

/**
 * Phase 65: Section-permission API enforcement.
 *
 * Read once at module load. To flip from LOG_ONLY to ENFORCE in prod,
 * set SECTION_PERMISSION_ENFORCE='true' in Vercel and redeploy. There is
 * no per-request re-read — the toggle is intentionally redeploy-gated for
 * auditability.
 *
 * Default: false (LOG_ONLY).
 *
 * Do NOT use NEXT_PUBLIC_* prefix — this is a server-only switch.
 * Do NOT add per-route variants — a single switch is the locked decision.
 */
export const SECTION_PERMISSION_ENFORCE: boolean =
  process.env.SECTION_PERMISSION_ENFORCE === 'true'

/**
 * Branches on the verdict + env-var to either let the route proceed (returns
 * null) or short-circuit with a 403 (returns NextResponse). In both LOG_ONLY
 * and ENFORCE modes, an `allow: false` verdict produces a Sentry event so we
 * can monitor the signal before flipping the kill switch.
 *
 * Route call site:
 *   const _sectionVerdict  = await requireSectionPermission(authClient, user.id, businessId, 'finances')
 *   const _sectionBlocked  = enforceSectionPermission(_sectionVerdict, 'finances', 'api/x/y', user.id, businessId)
 *   if (_sectionBlocked) return _sectionBlocked
 *   // ... route proceeds normally
 *
 * @param verdict     The verdict from requireSectionPermission.
 * @param sectionKey  The section key checked (e.g. 'finances').
 * @param routeConst  Stable path string matching the file location, e.g.
 *                    'api/monthly-report/generate'. Used as a Sentry tag.
 * @param userId      Authenticated user's UUID.
 * @param businessId  The businesses.id the check was made against.
 *
 * @returns NextResponse(403) when ENFORCE mode and verdict is allow:false.
 *          null in all other cases (route proceeds).
 */
export function enforceSectionPermission(
  verdict: SectionPermissionVerdict,
  sectionKey: string,
  routeConst: string,
  userId: string,
  businessId: string,
): NextResponse | null {
  // Allow path is intentionally silent — no Sentry call, no overhead.
  if (verdict.allow) return null

  // Denied path — always log, regardless of enforce mode.
  Sentry.captureMessage('section_permission_check', {
    level: SECTION_PERMISSION_ENFORCE ? 'warning' : 'info',
    tags: {
      route: routeConst,
      section_key: sectionKey,
      verdict_reason: verdict.reason,
      enforced: SECTION_PERMISSION_ENFORCE,
    },
    extra: {
      user_id: userId,
      business_id: businessId,
    },
  })

  if (SECTION_PERMISSION_ENFORCE) {
    return NextResponse.json(
      { error: 'Insufficient permissions', section: sectionKey },
      { status: 403 },
    )
  }

  // LOG_ONLY: log fired above, route proceeds.
  return null
}
