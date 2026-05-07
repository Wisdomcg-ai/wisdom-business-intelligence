/**
 * Phase 57 T11 (B4) — Step 6 OpEx covered-by-Step-5 badge logic
 *
 * Verifies the badge predicate and the opexByYear exclusion behavior:
 *   - An OpExLine with accountCode ∈ coveredAccountCodes(activeSubscriptions)
 *     is "covered" → renders the badge AND contributes ZERO to opexByYear.
 *   - An OpExLine without accountCode (legacy v10 draft pre-refresh) is NOT
 *     covered (no name fallback per plan-check Blocker 2) — falls through
 *     and contributes to opexByYear as before. The R6 nudge banner is the
 *     mitigation for this case.
 *   - Inactive vendors do NOT contribute their accountCodes to the set.
 *
 * Pure-function form: mirrors the predicates inside Step5OpEx (`isLineCovered`,
 * `coveredAccountCodes` Set construction). If Step5OpEx changes, mirror the
 * change here.
 */

import { describe, it, expect } from 'vitest';

type Vendor = { isActive: boolean; accountCodes?: string[] };
type OpExLine = { id: string; accountCode?: string; accountId?: string; name: string };

function buildCoveredAccountCodes(vendors: Vendor[]): Set<string> {
  const set = new Set<string>();
  for (const v of vendors) {
    if (!v.isActive) continue;
    for (const code of (v.accountCodes || [])) {
      if (typeof code === 'string' && code.trim()) set.add(code.trim());
    }
  }
  return set;
}

function isLineCovered(line: OpExLine, covered: Set<string>): boolean {
  return !!line.accountCode && covered.has(line.accountCode);
}

describe('Phase 57 T11 — coveredAccountCodes Set construction', () => {
  it('includes accountCodes from every active vendor', () => {
    const set = buildCoveredAccountCodes([
      { isActive: true, accountCodes: ['5100', '5101'] },
      { isActive: true, accountCodes: ['5200'] },
    ]);
    expect(set.has('5100')).toBe(true);
    expect(set.has('5101')).toBe(true);
    expect(set.has('5200')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('excludes accountCodes from inactive vendors', () => {
    const set = buildCoveredAccountCodes([
      { isActive: true,  accountCodes: ['5100'] },
      { isActive: false, accountCodes: ['5200'] },
    ]);
    expect(set.has('5100')).toBe(true);
    expect(set.has('5200')).toBe(false);
  });

  it('handles vendors without accountCodes', () => {
    const set = buildCoveredAccountCodes([
      { isActive: true, accountCodes: undefined as unknown as string[] },
      { isActive: true }, // no accountCodes field at all
    ]);
    expect(set.size).toBe(0);
  });

  it('trims whitespace and ignores blank codes', () => {
    const set = buildCoveredAccountCodes([
      { isActive: true, accountCodes: [' 5100 ', '', '   ', '5200'] },
    ]);
    expect(set.has('5100')).toBe(true);
    expect(set.has('5200')).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('Phase 57 T11 — isLineCovered predicate', () => {
  const covered = buildCoveredAccountCodes([
    { isActive: true, accountCodes: ['5100', '5200'] },
  ]);

  it('returns true for lines whose accountCode matches an active vendor', () => {
    expect(isLineCovered({ id: 'a', name: 'Software A', accountCode: '5100' }, covered)).toBe(true);
    expect(isLineCovered({ id: 'b', name: 'Software B', accountCode: '5200' }, covered)).toBe(true);
  });

  it('returns false for lines whose accountCode does not match', () => {
    expect(isLineCovered({ id: 'c', name: 'Other', accountCode: '5300' }, covered)).toBe(false);
  });

  it('returns false for lines WITHOUT an accountCode (legacy v10 drafts)', () => {
    // No name fallback per plan-check Blocker 2 — legacy lines fall through
    // and contribute to OpEx as before. The R6 banner nudges the operator
    // to refresh from Xero.
    expect(isLineCovered({ id: 'd', name: 'Software A', accountId: 'xero-id-1' }, covered)).toBe(false);
  });

  it('returns false when the covered set is empty (no active subscriptions)', () => {
    const emptySet = buildCoveredAccountCodes([]);
    expect(isLineCovered({ id: 'a', name: 'Software', accountCode: '5100' }, emptySet)).toBe(false);
  });
});

describe('Phase 57 T11 — opexByYear exclusion (parity with T07 rollup)', () => {
  // Mirror the activeOpexLines filter inside Step5OpEx.
  function totalOpex(lines: OpExLine[], covered: Set<string>): number {
    // Each line contributes 100 (just a sentinel — what matters is who's in vs. out).
    return lines.filter(l => !isLineCovered(l, covered)).length * 100;
  }

  it('covered lines contribute 0 to opexByYear (matches T07 rollup behavior)', () => {
    const covered = buildCoveredAccountCodes([
      { isActive: true, accountCodes: ['5100'] },
    ]);
    const lines: OpExLine[] = [
      { id: 'a', name: 'Covered', accountCode: '5100' },
      { id: 'b', name: 'Discretionary', accountCode: '6000' },
      { id: 'c', name: 'Discretionary 2', accountCode: '6100' },
    ];
    expect(totalOpex(lines, covered)).toBe(200); // a excluded, b + c counted
  });

  it('legacy lines without accountCode are still counted (no name fallback)', () => {
    const covered = buildCoveredAccountCodes([
      { isActive: true, accountCodes: ['5100'] },
    ]);
    const lines: OpExLine[] = [
      { id: 'a', name: 'Software A', accountCode: '5100' }, // covered, excluded
      { id: 'b', name: 'Software A', accountId: 'legacy-id' }, // legacy, NOT excluded by name
    ];
    expect(totalOpex(lines, covered)).toBe(100); // only `b` counts (`a` covered)
  });

  it('legacy forecasts (no subscriptions) — every line counts', () => {
    const covered = buildCoveredAccountCodes([]);
    const lines: OpExLine[] = [
      { id: 'a', name: 'X', accountCode: '5100' },
      { id: 'b', name: 'Y', accountCode: '5200' },
      { id: 'c', name: 'Z' },
    ];
    expect(totalOpex(lines, covered)).toBe(300);
  });
});

// ─── Refresh-from-Xero re-classification ────────────────────────────────────

/**
 * Mirror the re-classification logic inside handleRefreshFromXero.
 */
function reclassifyOpexLines(opexLines: OpExLine[], accounts: Array<{ code?: string; accountId?: string; name?: string }>): OpExLine[] {
  return opexLines.map((line) => {
    if (line.accountCode) return line;
    const match = accounts.find((a) => {
      if (line.accountId && a.accountId && a.accountId === line.accountId) return true;
      if (a.name && line.name && a.name.trim().toLowerCase() === line.name.trim().toLowerCase()) return true;
      return false;
    });
    if (match?.code) return { ...line, accountCode: match.code };
    return line;
  });
}

describe('Phase 57 T11 — refresh-from-Xero re-classification', () => {
  const xeroAccounts = [
    { code: '5100', accountId: 'xero-1', name: 'Software Subscriptions' },
    { code: '5200', accountId: 'xero-2', name: 'Marketing Software' },
    { code: '6000', accountId: 'xero-3', name: 'Office Rent' },
  ];

  it('populates accountCode on legacy lines via accountId match', () => {
    const lines: OpExLine[] = [
      { id: 'a', name: 'Software Subscriptions', accountId: 'xero-1' },
      { id: 'b', name: 'Office Rent', accountId: 'xero-3' },
    ];
    const updated = reclassifyOpexLines(lines, xeroAccounts);
    expect(updated[0].accountCode).toBe('5100');
    expect(updated[1].accountCode).toBe('6000');
  });

  it('populates accountCode via case-insensitive name match when accountId is missing', () => {
    const lines: OpExLine[] = [
      { id: 'a', name: 'software subscriptions' }, // lower-case, no accountId
      { id: 'b', name: '  OFFICE RENT  ' },        // extra whitespace + caps
    ];
    const updated = reclassifyOpexLines(lines, xeroAccounts);
    expect(updated[0].accountCode).toBe('5100');
    expect(updated[1].accountCode).toBe('6000');
  });

  it('leaves lines untouched when no Xero account matches', () => {
    const lines: OpExLine[] = [
      { id: 'a', name: 'Mystery Expense' },
    ];
    const updated = reclassifyOpexLines(lines, xeroAccounts);
    expect(updated[0].accountCode).toBeUndefined();
  });

  it('does NOT overwrite an existing accountCode', () => {
    const lines: OpExLine[] = [
      { id: 'a', name: 'Software Subscriptions', accountCode: 'CUSTOM-CODE', accountId: 'xero-1' },
    ];
    const updated = reclassifyOpexLines(lines, xeroAccounts);
    expect(updated[0].accountCode).toBe('CUSTOM-CODE');
  });
});
