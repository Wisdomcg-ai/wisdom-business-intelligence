/**
 * Read an actual out of a stored quarterly snapshot, whatever shape it was saved in.
 *
 * quarterly_snapshots.financial_snapshot holds each line as an OBJECT —
 * createQuarterlySnapshot writes `revenue: { target, actual, variance }`. The
 * Quarterly Plan screen read it as a NUMBER (`fin.revenue || fin.revenue_actual`),
 * so it picked up the whole object: `object > 0` is false, the margins came out
 * 0, and the grid received an object where it expected money.
 *
 * It never showed, because for 39 of 41 users no snapshot ever saved (the
 * profiles FK, fixed in #568). Now they do, and a first session's baseline is
 * exactly what next quarter reads back through here.
 *
 * Accepts: a number, an object with `actual`, or the legacy flat `*_actual` field.
 */
export function snapshotActual(line: unknown, legacyFlat?: unknown): number {
  if (typeof line === 'number' && Number.isFinite(line)) return line;
  if (line && typeof line === 'object' && 'actual' in line) {
    const a = Number((line as { actual: unknown }).actual);
    return Number.isFinite(a) ? a : 0;
  }
  const flat = Number(legacyFlat);
  return Number.isFinite(flat) ? flat : 0;
}
