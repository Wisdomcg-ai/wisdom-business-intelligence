// Phase 35: Next.js App Router default fallback for the implicit children slot.
// Without this, client-side navigation into /reports/view/[token] can trigger a
// "No default component was found for a parallel route" warning and fall back
// to the local not-found.tsx even when the page renders successfully on SSR.
// See: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#defaultjs
export { default } from './page'
