import { redirect } from 'next/navigation';

/**
 * The standalone /reviews/quarterly page (Initiatives Progress / KPI Actuals /
 * Reflections + "Complete Quarter") is superseded by the full quarterly review
 * workshop at /quarterly-review. Its reflection fields were local-state-only
 * (no autosave) and it wrote snapshots under a different key than the workshop,
 * fragmenting history — so any old link or bookmark redirects to the workshop.
 */
export default function LegacyQuarterlyReviewRedirect() {
  redirect('/quarterly-review');
}
