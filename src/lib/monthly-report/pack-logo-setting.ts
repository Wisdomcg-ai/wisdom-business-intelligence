/**
 * Which mark the monthly pack prints: the WisdomBI lockup, or the coach's own.
 *
 * Calxa's Urban Road pack carries Wisdom Consulting Group's grey square "W" —
 * the mark the client has seen on every pack for two years — where ours prints
 * the WisdomBI lockup (#512). Matt's decision (14 Sep 2026): a setting, the
 * lockup by default, a custom image when chosen.
 *
 * Where it lives. There is no coach-level settings table (coaches are rows in
 * `users` with a role in `system_roles`, and neither carries configuration),
 * so the choice is per business, on monthly_report_settings.pack_logo — a
 * column of its own rather than a key inside `sections` or `pdf_layout`,
 * because both of those are REPLACED wholesale by other writers: applying a
 * report template swaps `sections` and `pdf_layout`, and the settings POST
 * rewrites `sections` with defaults when a caller omits it. A logo inside
 * either would be deleted by a coach toggling a page.
 *
 * The image is stored inline as a data URL, not fetched: generate() is
 * synchronous and the preview harness has no network (see pack-logo.ts), and a
 * 135-pixel mark is a few kilobytes.
 *
 * Fail-open, in three states: no setting → the lockup (every client today);
 * a readable custom image → that image; a setting that is there but cannot be
 * used → the lockup, and the renderer reports it to Sentry, because a pack that
 * silently prints a different logo from the one chosen is a substitution
 * nobody asked for.
 */

export type PackLogoSetting =
  | { kind: 'wisdombi' }
  | {
      kind: 'custom'
      /** data:image/png;base64,… or data:image/jpeg;base64,… */
      image: string
      /** Who the mark belongs to, for the coach's own reference ("Wisdom Consulting Group W"). */
      label?: string | null
    }

export type ResolvedPackLogo =
  | { kind: 'wisdombi'; problem: string | null }
  | { kind: 'custom'; image: string; format: 'PNG' | 'JPEG' }

/**
 * The largest image the setting accepts, as data-URL characters (~500KB of
 * image). The mark prints at 35mm; anything near this is a photograph, and it
 * would ride along on every settings read and every PDF.
 */
export const PACK_LOGO_MAX_CHARS = 700_000

const DATA_URL = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/

function imageProblem(image: unknown): string | null {
  if (typeof image !== 'string' || image.trim() === '') return 'the custom logo has no image'
  if (image.length > PACK_LOGO_MAX_CHARS) return `the custom logo is larger than ${Math.round(PACK_LOGO_MAX_CHARS / 1000)}KB`
  if (!DATA_URL.test(image)) return 'the custom logo is not a base64 PNG or JPEG data URL'
  return null
}

/**
 * For the writer (the settings POST): the value to store, `null` to clear it,
 * or a reason to refuse. Refused rather than stored-and-ignored — a coach who
 * uploads a GIF should be told, not find the lockup on the client's pack.
 */
export function parsePackLogoSetting(
  raw: unknown,
): { ok: true; value: PackLogoSetting | null } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'pack_logo must be an object or null' }
  const r = raw as Record<string, unknown>
  if (r.kind === 'wisdombi') return { ok: true, value: { kind: 'wisdombi' } }
  if (r.kind !== 'custom') return { ok: false, error: "pack_logo.kind must be 'wisdombi' or 'custom'" }
  const problem = imageProblem(r.image)
  if (problem) return { ok: false, error: problem }
  const label = typeof r.label === 'string' && r.label.trim() !== '' ? r.label.trim() : null
  return { ok: true, value: { kind: 'custom', image: r.image as string, label } }
}

/**
 * For the renderer: what to draw, from whatever the row holds. Never throws —
 * a title mark is never worth failing an export over.
 */
export function resolvePackLogo(raw: unknown): ResolvedPackLogo {
  if (raw === null || raw === undefined) return { kind: 'wisdombi', problem: null }
  if (typeof raw !== 'object') return { kind: 'wisdombi', problem: 'pack_logo is not an object' }
  const r = raw as Record<string, unknown>
  if (r.kind === 'wisdombi') return { kind: 'wisdombi', problem: null }
  if (r.kind !== 'custom') return { kind: 'wisdombi', problem: `pack_logo.kind '${String(r.kind)}' is not a known mark` }
  const problem = imageProblem(r.image)
  if (problem) return { kind: 'wisdombi', problem }
  const format = /^data:image\/png/.test(r.image as string) ? 'PNG' : 'JPEG'
  return { kind: 'custom', image: r.image as string, format }
}

/**
 * The boxes a custom mark is fitted into, in mm, measured off Urban Road's
 * August 2026 Calxa pack (rasterised at 72dpi, the grey of the "W" square):
 *
 *   cover   35mm square, top 26mm, centred     (p1: x 87.5-122.4, y 25.8-60.7)
 *   corner  22mm square, top 11.5mm, its right edge 17mm in from the sheet's
 *           (pp2-26: 21-22mm wide at 150-171ppi, y 11.3-33.5, 16.6-16.9mm gap,
 *           the same on portrait and landscape pages)
 *
 * A mark that is not square keeps its shape inside the box: the longer side
 * takes the box, and it stays top-aligned, centred on the cover and flush
 * right in the corner — where Calxa's edges are.
 *
 * The WisdomBI lockup keeps the sizes #512 gave it: it is a wide lockup, and a
 * 22mm box built for a square would change every client's pack for a decision
 * that was about Urban Road's.
 */
export const PACK_LOGO_COVER_BOX = { size: 35, top: 26 }
export const PACK_LOGO_CORNER_BOX = { size: 22, top: 11.5, right: 17 }

/** Width and height of an image of the given pixel size, fitted into a square box. */
export function fitLogo(pxWidth: number, pxHeight: number, box: number): { w: number; h: number } {
  if (!(pxWidth > 0) || !(pxHeight > 0)) return { w: box, h: box }
  return pxWidth >= pxHeight
    ? { w: box, h: (box * pxHeight) / pxWidth }
    : { w: (box * pxWidth) / pxHeight, h: box }
}
