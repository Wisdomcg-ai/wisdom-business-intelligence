/**
 * Account name matching utilities
 *
 * Used to match Xero account names to forecast P&L line names
 * when exact matches aren't found (e.g., "Wages & Salaries" vs "Salaries & Wages")
 */

/**
 * Normalize an account name for fuzzy matching:
 * - Lowercase
 * - Replace "&" with "and"
 * - Strip punctuation
 * - Collapse whitespace
 * - Sort words alphabetically (so "Wages & Salaries" == "Salaries & Wages")
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize with word-order independence.
 * "Wages & Salaries" and "Salaries & Wages" both produce the same key.
 */
export function normalizeNameSorted(name: string): string {
  return normalizeName(name)
    .split(' ')
    .sort()
    .join(' ')
}

/**
 * Check if two account names are a fuzzy match.
 * Tries: exact (lowered), normalized, and word-order independent matching.
 */
export function isAccountMatch(nameA: string, nameB: string): boolean {
  if (nameA.toLowerCase() === nameB.toLowerCase()) return true
  if (normalizeName(nameA) === normalizeName(nameB)) return true
  if (normalizeNameSorted(nameA) === normalizeNameSorted(nameB)) return true
  return false
}

/**
 * Build a lookup map that supports fuzzy matching.
 * Returns a function that finds the best match for a given name.
 */
export function buildFuzzyLookup<T>(
  items: T[],
  getName: (item: T) => string
): (name: string) => T | undefined {
  // Build three tiers of lookup
  const exactMap = new Map<string, T>()
  const normalizedMap = new Map<string, T>()
  const sortedMap = new Map<string, T>()

  for (const item of items) {
    const name = getName(item)
    if (!name) continue
    const lower = name.toLowerCase()
    const normalized = normalizeName(name)
    const sorted = normalizeNameSorted(name)

    if (!exactMap.has(lower)) exactMap.set(lower, item)
    if (!normalizedMap.has(normalized)) normalizedMap.set(normalized, item)
    if (!sortedMap.has(sorted)) sortedMap.set(sorted, item)
  }

  return (searchName: string): T | undefined => {
    const lower = searchName.toLowerCase()
    const normalized = normalizeName(searchName)
    const sorted = normalizeNameSorted(searchName)

    return exactMap.get(lower)
      || normalizedMap.get(normalized)
      || sortedMap.get(sorted)
  }
}
