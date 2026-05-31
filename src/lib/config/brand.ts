/**
 * R7 (C-26/C-27, MNT-N5/N6/N7/N8/N10) — single source of truth for brand,
 * identity, sender and URL configuration.
 *
 * Why this module exists
 * ----------------------
 * "WisdomBI" brand strings, `wisdombi.ai` URLs, brand hex colors, sender
 * addresses, and the legal entity were hardcoded across 40+ files. That made
 * the inLIFE Pulse fork a hunt-every-literal exercise. Centralizing them here —
 * env-driven, with the current WisdomBI values as defaults — turns the fork's
 * rebrand into a config flip (set env vars) instead of a code change, while
 * keeping production byte-for-byte identical until those env vars are set.
 *
 * Conventions
 * -----------
 * - Every value reads an env var and falls back to the current WisdomBI value,
 *   so behavior is unchanged until the fork overrides it.
 * - Values that can be rendered in client components use the `NEXT_PUBLIC_`
 *   prefix (brand name, colors, logo, support email, legal text). Server-only
 *   secrets/addresses (the raw sender) do not need it.
 * - `.trim() || default` guards against an env var that is set-but-empty in a
 *   deploy environment silently blanking the brand.
 *
 * ⚠ Legal note (MNT-N5): the default legal entity + ABN below are WisdomBI's.
 * A fork MUST override `LEGAL_*` and have the new values reviewed by legal —
 * "Envisage" is both this legal entity and a live tenant name.
 */

const env = (key: string): string | undefined => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

// ─── Identity ────────────────────────────────────────────────────────────────

/** Short product name, e.g. used in email "from" name and UI chrome. */
export const APP_NAME = env('NEXT_PUBLIC_APP_NAME') ?? 'WisdomBI'

/** Full <title> shown in the browser tab / metadata. */
export const APP_TITLE = env('NEXT_PUBLIC_APP_TITLE') ?? 'WisdomBi - Business Intelligence'

/** Meta description. */
export const APP_DESCRIPTION =
  env('NEXT_PUBLIC_APP_DESCRIPTION') ??
  'Transform your business with data-driven coaching and business intelligence'

// ─── Logo / favicon ──────────────────────────────────────────────────────────

/**
 * Absolute logo URL. Emails must use an absolute, production-reachable URL
 * (mail clients can't load relative paths), which is why this defaults to the
 * production domain rather than a local `/images/...` path.
 */
export const BRAND_LOGO_URL =
  env('NEXT_PUBLIC_BRAND_LOGO_URL') ?? 'https://wisdombi.ai/images/logo-main.png'

/** Favicon / app-icon path (served from /public). */
export const FAVICON_PATH = env('NEXT_PUBLIC_FAVICON_PATH') ?? '/favicon.png'

// ─── Brand colors ────────────────────────────────────────────────────────────

export const BRAND_COLORS = {
  orange: env('NEXT_PUBLIC_BRAND_ORANGE') ?? '#F5821F',
  navy: env('NEXT_PUBLIC_BRAND_NAVY') ?? '#172238',
  orangeLight: env('NEXT_PUBLIC_BRAND_ORANGE_LIGHT') ?? '#fff8f1',
  navyLight: env('NEXT_PUBLIC_BRAND_NAVY_LIGHT') ?? '#f4f6f9',
} as const

// ─── Email identities ────────────────────────────────────────────────────────

/** Raw sender mailbox (must be a verified domain in the email provider). */
export const SENDER_EMAIL = env('SENDER_EMAIL') ?? 'noreply@mail.wisdombi.ai'

/** RFC-5322 "from" header, e.g. `WisdomBI <noreply@mail.wisdombi.ai>`. */
export const SENDER_FROM = env('SENDER_FROM') ?? `${APP_NAME} <${SENDER_EMAIL}>`

/** Public-facing support / contact address. */
export const SUPPORT_EMAIL = env('NEXT_PUBLIC_SUPPORT_EMAIL') ?? 'support@wisdombi.ai'

// ─── Legal (MNT-N5 — override + legal review required on fork) ────────────────

export const LEGAL_ENTITY =
  env('NEXT_PUBLIC_LEGAL_ENTITY') ?? 'Envisage Australia Pty Ltd ATF Malouf Family Trust'
export const LEGAL_ABN = env('NEXT_PUBLIC_LEGAL_ABN') ?? '11 331 804 705'
export const LEGAL_TRADING_AS = env('NEXT_PUBLIC_LEGAL_TRADING_AS') ?? 'Wisdom Coaching'

// ─── App URL (MNT-N10) ───────────────────────────────────────────────────────

/**
 * Canonical app base URL, trailing slashes stripped.
 *
 * MNT-N10: callers had inconsistent fallbacks — some defaulted to
 * `https://wisdombi.ai` (invite links), others to `http://localhost:3000`
 * (Xero OAuth redirect). The localhost fallback silently produced broken OAuth
 * redirects in any environment that forgot to set the env var. This helper
 * gives one consistent answer: use the configured URL; in local dev fall back
 * to localhost; otherwise fall back to the brand production domain so links are
 * never silently pointed at a dev host.
 */
export const DEFAULT_APP_URL = env('NEXT_PUBLIC_DEFAULT_APP_URL') ?? 'https://wisdombi.ai'

export function getAppBaseUrl(): string {
  const configured = env('NEXT_PUBLIC_APP_URL')
  if (configured) return configured.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return DEFAULT_APP_URL.replace(/\/+$/, '')
}
