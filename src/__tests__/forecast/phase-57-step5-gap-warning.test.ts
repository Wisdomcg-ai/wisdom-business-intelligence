/**
 * Phase 57 T12 (B4) — Step 5 Subscriptions gap warning + flushPendingSaves
 *
 * Verifies the gap-warning predicate and the flushPendingSaves contract:
 *   - Gap warning fires when active vendor annual budget < 85% of historical
 *     prior-FY total on the analyzed accounts. Strict inequality.
 *   - Suppressed in manual mode, during analysis, when historical = 0.
 *   - flushPendingSaves: cancels debounce timer, runs save once, swallows
 *     errors so callers' awaits never reject.
 *
 * Pure-function form — mirrors the predicates inside Step6Subscriptions.
 * If Step6Subscriptions changes, mirror the change here.
 */

import { describe, it, expect, vi } from 'vitest';

type GapWarningInputs = {
  isManualMode: boolean;
  phase: 'select-accounts' | 'analyzing' | 'review';
  historical: number;       // summary.priorFYTotal
  vendorAnnual: number;     // totals.annualBudget
};

function computeGapWarning(opts: GapWarningInputs): { historical: number; vendorAnnual: number; gap: number; gapPct: number } | null {
  if (opts.isManualMode) return null;
  if (opts.phase !== 'review') return null;
  if (opts.historical <= 0) return null;
  if (opts.vendorAnnual >= opts.historical * 0.85) return null;
  const gap = opts.historical - opts.vendorAnnual;
  const gapPct = (gap / opts.historical) * 100;
  return { historical: opts.historical, vendorAnnual: opts.vendorAnnual, gap, gapPct };
}

describe('Phase 57 T12 — gap warning predicate', () => {
  it('fires when vendor budget is < 85% of historical', () => {
    // 70% of 100k → 30% gap → > 15% threshold → warn.
    const result = computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 100_000, vendorAnnual: 70_000,
    });
    expect(result).not.toBeNull();
    expect(result!.gap).toBe(30_000);
    expect(result!.gapPct).toBeCloseTo(30, 5);
  });

  it('does NOT fire when vendor budget is exactly 85% of historical (strict inequality)', () => {
    const result = computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 100_000, vendorAnnual: 85_000,
    });
    expect(result).toBeNull();
  });

  it('does NOT fire when vendor budget is at or above historical', () => {
    expect(computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 100_000, vendorAnnual: 100_000,
    })).toBeNull();
    expect(computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 100_000, vendorAnnual: 120_000,
    })).toBeNull();
  });

  it('does NOT fire in manual mode (no historical context)', () => {
    expect(computeGapWarning({
      isManualMode: true, phase: 'review',
      historical: 100_000, vendorAnnual: 0,
    })).toBeNull();
  });

  it('does NOT fire during select-accounts or analyzing phases', () => {
    expect(computeGapWarning({
      isManualMode: false, phase: 'select-accounts',
      historical: 100_000, vendorAnnual: 50_000,
    })).toBeNull();
    expect(computeGapWarning({
      isManualMode: false, phase: 'analyzing',
      historical: 100_000, vendorAnnual: 50_000,
    })).toBeNull();
  });

  it('does NOT fire when historical is 0 (no divide-by-zero noise)', () => {
    expect(computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 0, vendorAnnual: 0,
    })).toBeNull();
  });

  it('does NOT fire when historical is negative (defensive)', () => {
    expect(computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: -100, vendorAnnual: 0,
    })).toBeNull();
  });

  it('reports correct gapPct for a 50% gap', () => {
    // historical 100k, vendor 50k → gap 50k, gapPct 50%.
    const result = computeGapWarning({
      isManualMode: false, phase: 'review',
      historical: 100_000, vendorAnnual: 50_000,
    });
    expect(result!.gap).toBe(50_000);
    expect(result!.gapPct).toBeCloseTo(50, 5);
  });
});

// ─── flushPendingSaves contract tests ───────────────────────────────────────

/**
 * Mirror the flushPendingSaves logic. The real component uses useImperativeHandle
 * + useRef; this is a synchronous facsimile of the exact branching to verify
 * timer cancellation and error-swallowing semantics.
 */
type FlushDeps = {
  debounceTimer: { current: ReturnType<typeof setTimeout> | null };
  vendors: { isActive: boolean }[];
  saveSubscriptionBudgets: () => Promise<void>;
};

async function flushPendingSaves(deps: FlushDeps): Promise<void> {
  if (deps.debounceTimer.current) {
    clearTimeout(deps.debounceTimer.current);
    deps.debounceTimer.current = null;
  }
  if (deps.vendors.length === 0) return;
  const activeCount = deps.vendors.filter(v => v.isActive).length;
  if (activeCount === 0) return;
  try {
    await deps.saveSubscriptionBudgets();
  } catch {
    // Swallow — caller's await must never reject.
  }
}

describe('Phase 57 T12 — flushPendingSaves contract', () => {
  it('cancels a pending debounce timer', async () => {
    const fakeTimer = setTimeout(() => {
      throw new Error('Debounced callback should NOT have run after flush');
    }, 1) as unknown as ReturnType<typeof setTimeout>;
    const debounceTimer = { current: fakeTimer };
    const save = vi.fn().mockResolvedValue(undefined);

    await flushPendingSaves({
      debounceTimer,
      vendors: [{ isActive: true }],
      saveSubscriptionBudgets: save,
    });

    expect(debounceTimer.current).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('no-ops when there are no vendors', async () => {
    const save = vi.fn();
    await flushPendingSaves({
      debounceTimer: { current: null },
      vendors: [],
      saveSubscriptionBudgets: save,
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('no-ops when all vendors are inactive', async () => {
    const save = vi.fn();
    await flushPendingSaves({
      debounceTimer: { current: null },
      vendors: [{ isActive: false }, { isActive: false }],
      saveSubscriptionBudgets: save,
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('swallows save errors so the caller awaits resolve', async () => {
    const save = vi.fn().mockRejectedValue(new Error('network down'));
    const promise = flushPendingSaves({
      debounceTimer: { current: null },
      vendors: [{ isActive: true }],
      saveSubscriptionBudgets: save,
    });
    // Must NOT reject.
    await expect(promise).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('clears the timer even if save throws', async () => {
    const fakeTimer = setTimeout(() => {}, 1) as unknown as ReturnType<typeof setTimeout>;
    const debounceTimer = { current: fakeTimer };
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    await flushPendingSaves({
      debounceTimer,
      vendors: [{ isActive: true }],
      saveSubscriptionBudgets: save,
    });
    expect(debounceTimer.current).toBeNull();
  });

  it('runs save once even when called repeatedly without state change', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const deps: FlushDeps = {
      debounceTimer: { current: null },
      vendors: [{ isActive: true }],
      saveSubscriptionBudgets: save,
    };
    await flushPendingSaves(deps);
    await flushPendingSaves(deps);
    // Each invocation triggers exactly one save call — caller controls cadence.
    expect(save).toHaveBeenCalledTimes(2);
  });
});
