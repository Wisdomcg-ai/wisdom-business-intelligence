/**
 * Cross-org Xero account identity.
 *
 * A shared account CODE does not mean a shared account. Xero account codes are
 * per-org and sibling orgs drift: of the 74 codes Dragon Roofing's two orgs
 * share, 26 carry different names. Some divergences are cosmetic — one org
 * appends the code to the label ("Entertainment (420)") — but others are simply
 * different accounts wearing the same number: 401 is "Accounting" in Dragon
 * Roofing and "Advertising" in Easy Hail Claim; 402 is "Bad Debts expense" vs
 * "Marketing".
 *
 * Anything that applies one org's selected account codes to another org must
 * therefore compare NAMES, not just codes, or it will quietly pull an unrelated
 * account's spend into the client's numbers.
 */

/**
 * Normalise an account name for cross-org comparison: lowercase, drop a trailing
 * "(code)" suffix, strip punctuation and spacing.
 */
export function normaliseAccountName(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')
}

/** True when two orgs' labels for the same account code refer to the same account. */
export function isSameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliseAccountName(a)
  const nb = normaliseAccountName(b)
  // Two blank names carry no evidence of sameness — treat as a mismatch so the
  // caller reports it rather than silently merging.
  if (!na || !nb) return false
  return na === nb
}
