import * as Sentry from '@sentry/nextjs';

/**
 * Report a swallowed WRITE failure in the quarterly review.
 *
 * The workshop runs in the owner's browser during a live coaching session, so a
 * bare `console.error` is evidence nobody will ever see — the session ends, the
 * tab closes, and the only trace that a plan never reached the strategic tables
 * is a gap in the data weeks later. Every write we choose not to re-throw on
 * gets captured here instead.
 *
 * Capturing must never itself break the session, hence the inner try/catch.
 */
export function captureReviewWriteFailure(
  err: unknown,
  operation: string,
  extra: Record<string, unknown> = {}
): void {
  console.error(`[QuarterlyReview] write failed: ${operation}`, err);
  try {
    Sentry.captureException(err, {
      tags: {
        invariant: 'quarterly_review_write_failed',
        qr_operation: operation,
      },
      extra,
    } as any);
  } catch {
    /* Sentry must not break the workshop */
  }
}
