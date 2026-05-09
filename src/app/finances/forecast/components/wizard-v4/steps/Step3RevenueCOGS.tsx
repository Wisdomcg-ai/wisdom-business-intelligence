'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Info, Lock, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, generateMonthKeys, getRevenueLineYearTotal, MonthlyData } from '../types';
import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner';
import type { DataQuality, PerTenantQuality } from '@/lib/services/forecast-read-service';
import { useEditableValue } from '../hooks/useEditableValue';
import { getEffectiveSeasonality } from '../utils/line-distribution';

/**
 * RevenueLineMixInputs — Phase 51-01 (UX-S3-01)
 *
 * Renders a % editor for a single revenue line (and an optional Y-on-Y growth
 * % editor for Y2/Y3). Uses useEditableValue (51-00) so the input doesn't
 * flicker or lose keystrokes when the upstream committed value re-derives
 * mid-edit.
 *
 * Why a child component: useEditableValue must be called from a stable
 * component (Rules of Hooks). Calling it inline inside `revenueLines.map(...)`
 * would violate the rule of hooks (hook count varies with array length).
 *
 * The paired $ editor was removed — the "Forecast Y1" column already shows
 * the dollar value, so duplicating it in the Split column was visual clutter
 * and out of step with COGS (which has always been % only).
 */
interface RevenueLineMixInputsProps {
  lineId: string;
  lineName: string;
  linePct: number;          // committed % split for this line
  onCommitPct: (value: number) => void;
  /** 'sm' (summary view ~text-sm) or 'xs' (monthly view ~text-xs) */
  size?: 'sm' | 'xs';

  // Phase 51-02 (UX-S3-02) — Y-on-Y Growth % editor for Y2/Y3 views.
  // When activeYear === 1 (or undefined), the growth editor is HIDDEN
  //   (Y1 has no prior wizard year line total to compute growth from —
  //    Y1 lives off goals.year1.revenue, not a prior-year line).
  // When activeYear === 2 or 3 AND onCommitGrowth is provided, a second
  //   editor renders to the right of the % editor.
  activeYear?: 1 | 2 | 3;       // default 1 (back-compat with 51-01 call sites)
  growthPct?: number;            // committed Y-on-Y growth % for the active year
  onCommitGrowth?: (value: number) => void;
}

function RevenueLineMixInputs({
  lineId: _lineId,
  lineName,
  linePct,
  onCommitPct,
  size = 'sm',
  activeYear,
  growthPct,
  onCommitGrowth,
}: RevenueLineMixInputsProps) {
  // Percent editor — clamp parse to 0..100 integer.
  const percentEditor = useEditableValue(linePct, onCommitPct, {
    parse: (raw) => {
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return 0;
      return Math.max(0, Math.min(100, n));
    },
  });
  // Growth editor — clamp parse to -100..1000 integer (Rules of Hooks
  // requires this hook to be called unconditionally; render gating is
  // applied at JSX time below).
  const growthEditor = useEditableValue(growthPct ?? 0, (value) => onCommitGrowth?.(value), {
    parse: (raw) => {
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return 0;
      return Math.max(-100, Math.min(1000, n));
    },
  });

  const percentClass =
    size === 'sm'
      ? 'w-14 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy'
      : 'w-12 px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy';
  const growthClass = percentClass;
  const symbolClass = size === 'sm' ? 'text-xs text-gray-400' : 'text-[10px] text-gray-400';
  const wrapperClass = size === 'sm' ? 'inline-flex items-center gap-1 justify-center' : 'inline-flex items-center gap-0.5';

  const showGrowth = (activeYear === 2 || activeYear === 3) && !!onCommitGrowth;

  return (
    <div className={wrapperClass}>
      <input
        type="number"
        aria-label={`Percent split for ${lineName}`}
        value={percentEditor.display}
        onChange={percentEditor.onChange}
        onBlur={percentEditor.onBlur}
        onKeyDown={percentEditor.onKeyDown}
        min="0"
        max="100"
        className={percentClass}
      />
      <span className={symbolClass}>%</span>
      {showGrowth && (
        <>
          <input
            type="number"
            aria-label={`Growth percent for ${lineName}`}
            value={growthEditor.display}
            onChange={growthEditor.onChange}
            onBlur={growthEditor.onBlur}
            onKeyDown={growthEditor.onKeyDown}
            min="-100"
            max="1000"
            className={growthClass}
          />
          <span className={symbolClass}>%▲</span>
        </>
      )}
    </div>
  );
}

/**
 * SeasonalityEditorModal — Phase 51-03 (UX-S3-03)
 *
 * 12-month per-line seasonality override editor. Opens as an inline modal
 * (no portal — matches the project's existing showAddRevenue / showAddVendor
 * pattern). Renders 12 percentage inputs (one per fiscal-year month), live
 * sum-to-100 validation, and Save / Reset / Cancel actions.
 *
 * - Save: calls `onSave(pattern)` with the 12-element array
 * - Reset: calls `onReset()` (parent clears `seasonalityPattern` to undefined)
 * - Cancel: calls `onCancel()` (no state change)
 *
 * Pre-populates with the line's effective seasonality:
 *   line.seasonalityPattern (if set) → businessSeasonality → 8.33% even split
 *
 * Disabled Save when sum is not within ±0.5 of 100 to prevent silent
 * mis-distribution downstream.
 */
interface SeasonalityEditorModalProps {
  lineName: string;
  initialPattern: number[];
  monthLabels: string[];
  onSave: (pattern: number[]) => void;
  onReset: () => void;
  onCancel: () => void;
}

function SeasonalityEditorModal({
  lineName,
  initialPattern,
  monthLabels,
  onSave,
  onReset,
  onCancel,
}: SeasonalityEditorModalProps) {
  // Hold the editing pattern in local state. Defensive copy so onCancel
  // doesn't bleed mutations to the source array.
  const [pattern, setPattern] = useState<number[]>(() => {
    const copy = [...initialPattern];
    while (copy.length < 12) copy.push(8.33);
    return copy.slice(0, 12);
  });

  const sum = pattern.reduce((a, b) => a + b, 0);
  const sumValid = Math.abs(sum - 100) < 0.5;

  const handleCellChange = (idx: number, raw: string) => {
    const parsed = parseFloat(raw);
    const next = [...pattern];
    next[idx] = Number.isNaN(parsed) ? 0 : parsed;
    setPattern(next);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-label={`Seasonality editor for ${lineName}`}
    >
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Seasonality for {lineName}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Set the percentage of the annual total for each month. Sum must equal 100.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {monthLabels.map((label, idx) => (
            <label key={`${label}-${idx}`} className="flex flex-col">
              <span className="text-xs text-gray-500 mb-1">{label}</span>
              <input
                type="number"
                step="0.01"
                value={pattern[idx] ?? 0}
                onChange={(e) => handleCellChange(idx, e.target.value)}
                aria-label={`Seasonality month ${label}`}
                className="px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
              />
            </label>
          ))}
        </div>
        <div
          className={`text-sm mb-4 ${sumValid ? 'text-green-600' : 'text-red-600'}`}
          aria-live="polite"
        >
          Sum: {sum.toFixed(2)}% {sumValid ? '✓' : '(must equal 100)'}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Reset to business seasonality
          </button>
          <button
            type="button"
            onClick={() => onSave(pattern)}
            disabled={!sumValid}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              sumValid
                ? 'bg-brand-navy text-white hover:bg-brand-navy-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface Step3RevenueCOGSProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}

export function Step3RevenueCOGS({ state, actions, fiscalYear }: Step3RevenueCOGSProps) {
  const { revenuePattern, revenueLines, cogsLines, activeYear, goals, priorYear, currentYTD, businessId } = state;

  // D-44.2-03 read-path quality gate; surfaces in DataIntegrityBanner.
  // Refetches on tab focus / visibility change so a sync triggered from the
  // Integrations tab (or elsewhere) updates the banner without a full reload.
  const [dataQuality, setDataQuality] = useState<DataQuality>('verified')
  const [perTenantQuality, setPerTenantQuality] = useState<PerTenantQuality[]>([])
  useEffect(() => {
    if (!businessId) return
    let aborted = false
    const fetchQuality = async () => {
      try {
        const r = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`)
        if (!r.ok || aborted) return
        const data = await r.json()
        if (aborted || !data?.summary) return
        if (data.summary.data_quality) setDataQuality(data.summary.data_quality)
        if (Array.isArray(data.summary.per_tenant_quality)) setPerTenantQuality(data.summary.per_tenant_quality)
      } catch {
        // Non-blocking — banner stays as 'verified' (silent) on fetch failure.
      }
    }
    void fetchQuality()
    const onFocus = () => { void fetchQuality() }
    const onVisibility = () => { if (document.visibilityState === 'visible') void fetchQuality() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      aborted = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [businessId, fiscalYear])

  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [showAddCOGS, setShowAddCOGS] = useState(false);
  // Phase 51-03 (UX-S3-03): per-line seasonality override editor.
  // Holds the lineId of the line currently being edited (revenue OR fixed COGS),
  // or null when the modal is closed. Variable-COGS rows hide the trigger button.
  const [showSeasonalityFor, setShowSeasonalityFor] = useState<string | null>(null);
  // Local "pending" state for the COGS % Split inputs. The displayed value is
  // DERIVED from monthly totals (rounded, with last-line residual fix), so
  // a controlled input bound directly to the derived value re-renders to a
  // different number than what the user typed mid-edit. We hold the typed
  // string in pending state until blur / Enter, then commit.
  //
  // Phase 51-01 (UX-S3-01): the REVENUE pendingMixPcts state was removed —
  // both revenue $ and % editors now use the useEditableValue hook (51-00) per
  // <RevenueLineMixInputs> child component. COGS still uses the local pattern
  // because Phase 51-01 is scoped to the revenue branch only.
  const [pendingCogsMixPcts, setPendingCogsMixPcts] = useState<Record<string, string>>({});
  const [newRevenueName, setNewRevenueName] = useState('');
  const [newCOGSName, setNewCOGSName] = useState('');
  const [viewMode, setViewMode] = useState<'summary' | 'monthly'>('summary');
  const [expandedRevLines, setExpandedRevLines] = useState<Set<string>>(new Set());

  const months = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH);
  // Generate month keys for the active year (Y1 starts at fiscalYear-1, Y2 at fiscalYear, Y3 at fiscalYear+1)
  const monthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));

  // ─── Peak/Low helpers (Summary view) ─────────────────────────────────────
  // Surfaces the highest and lowest month from a line's monthly distribution.
  // When operators toggle the revenue pattern (Straight Line / Seasonal /
  // Manual), annual line totals stay pinned to the goal — only the monthly
  // distribution changes. Without these columns the toggle appears broken in
  // Summary view. Peak/Low shifts visibly: Straight Line → all months equal,
  // Seasonal → Peak Dec / Low Feb, etc.
  const getPeakLow = (
    monthly: MonthlyData | undefined,
  ): { peak: { label: string; value: number } | null; low: { label: string; value: number } | null } => {
    if (!monthly) return { peak: null, low: null };
    let peakIdx = -1;
    let lowIdx = -1;
    let peakVal = -Infinity;
    let lowVal = Infinity;
    for (let i = 0; i < monthKeys.length; i++) {
      const v = monthly[monthKeys[i]] || 0;
      if (v > peakVal) { peakVal = v; peakIdx = i; }
      if (v < lowVal) { lowVal = v; lowIdx = i; }
    }
    if (peakIdx < 0 || lowIdx < 0 || peakVal <= 0) return { peak: null, low: null };
    return {
      peak: { label: months[peakIdx], value: peakVal },
      low: { label: months[lowIdx], value: lowVal },
    };
  };
  // Short money form: $120k, $1.2m, $850 — keeps Peak/Low cells narrow.
  const formatMoneyShort = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return '$0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
    return `${sign}$${Math.round(abs)}`;
  };

  // Determine which months are actuals (locked) vs projected (editable)
  const actualMonthKeys = useMemo(() => {
    if (!currentYTD?.revenue_by_month) return new Set<string>();
    return new Set(Object.keys(currentYTD.revenue_by_month));
  }, [currentYTD]);

  const isActualMonth = (monthKey: string) => actualMonthKeys.has(monthKey);

  // Commit a pending COGS % edit. Clamps 0..100 and fires the line-update
  // handler. Revenue uses useEditableValue per <RevenueLineMixInputs>; COGS
  // is intentionally left on the local pending pattern (out of scope for 51-01).
  const commitMixPct = (lineId: string, raw: string | undefined, kind: 'revenue' | 'cogs') => {
    if (raw === undefined) return;
    const parsed = parseInt(raw, 10);
    const clamped = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed));
    if (kind === 'revenue') {
      // Defensive — Phase 51-01 routes revenue through useEditableValue, so
      // this branch is unreachable from the JSX. Left here so future re-use
      // (e.g., another revenue control still on the local pattern) keeps
      // working without surprises.
      handleMixChange(lineId, clamped);
    } else {
      handleCogsMixChange(lineId, clamped);
      setPendingCogsMixPcts((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
    }
  };

  // Calculate line percentages for all years
  const getLinePercentages = () => {
    const percentages: Record<string, number> = {};

    if (revenueLines.length === 0) return percentages;

    if (activeYear === 1) {
      // For Year 1, calculate % from current values (actuals + projections)
      let year1Total = 0;
      revenueLines.forEach((line) => {
        const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
        year1Total += lineTotal;
      });

      if (year1Total > 0) {
        revenueLines.forEach((line) => {
          const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
          percentages[line.id] = Math.round((lineTotal / year1Total) * 100);
        });
      } else {
        // Fallback to equal split
        revenueLines.forEach((line) => {
          percentages[line.id] = Math.round(100 / revenueLines.length);
        });
      }
    } else {
      // For Year 2/3, check if values are set
      let hasYearValues = false;
      let yearTotalFromLines = 0;
      revenueLines.forEach((line) => {
        const lineTotal = getRevenueLineYearTotal(line, activeYear as 2 | 3);
        yearTotalFromLines += lineTotal;
        if (lineTotal > 0) hasYearValues = true;
      });

      if (hasYearValues && yearTotalFromLines > 0) {
        revenueLines.forEach((line) => {
          const lineTotal = getRevenueLineYearTotal(line, activeYear as 2 | 3);
          percentages[line.id] = Math.round((lineTotal / yearTotalFromLines) * 100);
        });
      } else {
        // Default to Year 1 split
        let year1Total = 0;
        revenueLines.forEach((line) => {
          const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
          year1Total += lineTotal;
        });

        if (year1Total > 0) {
          revenueLines.forEach((line) => {
            const lineTotal = Object.values(line.year1Monthly).reduce((sum, val) => sum + val, 0);
            percentages[line.id] = Math.round((lineTotal / year1Total) * 100);
          });
        } else {
          revenueLines.forEach((line) => {
            percentages[line.id] = Math.round(100 / revenueLines.length);
          });
        }
      }
    }

    // Ensure percentages sum to 100
    const total = Object.values(percentages).reduce((a, b) => a + b, 0);
    if (total !== 100 && revenueLines.length > 0) {
      const lastLineId = revenueLines[revenueLines.length - 1].id;
      percentages[lastLineId] += (100 - total);
    }

    return percentages;
  };

  const linePercentages = getLinePercentages();
  const linePctTotal = Object.values(linePercentages).reduce((a, b) => a + b, 0);

  // Phase 51-01 (UX-S3-01): year-level revenue target for the active year.
  // Used by <RevenueLineMixInputs> so the % column means "share of goal" (NOT
  // "share of forecast total"); handleMixChange targets goals.year[N].revenue.
  const yearTargetRevenue =
    activeYear === 1
      ? goals.year1?.revenue || 0
      : activeYear === 2
        ? goals.year2?.revenue || 0
        : goals.year3?.revenue || 0;

  // Handle line percentage change
  const handleLinePctChange = (lineId: string, value: string) => {
    const newPct = Math.max(0, Math.min(100, parseInt(value) || 0));

    if (activeYear === 1) {
      // For Year 1, redistribute projected months only (keep actuals locked)
      const yearTarget = goals.year1?.revenue || 0;
      const line = revenueLines.find(l => l.id === lineId);
      if (!line || yearTarget <= 0) return;

      // Calculate total actuals for this line (locked months)
      let lineActualsTotal = 0;
      monthKeys.forEach((key) => {
        if (isActualMonth(key)) {
          lineActualsTotal += line.year1Monthly[key] || 0;
        }
      });

      // Calculate remaining target for projected months
      const lineTarget = yearTarget * (newPct / 100);
      const lineProjectedTarget = Math.max(0, lineTarget - lineActualsTotal);

      // Phase 51-03 (UX-S3-03): per-line override → business → 8.33 fallback.
      // Tasks 4 + 5 add the line.seasonalityPattern field + editor; this read
      // becomes override-aware automatically because every reader funnels here.
      const seasonality = getEffectiveSeasonality(line, priorYear?.seasonalityPattern);
      let totalRemainingSeasonality = 0;
      monthKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) {
          totalRemainingSeasonality += seasonality[idx] ?? 8.33;
        }
      });

      // Build new monthly values
      const newMonthly: { [key: string]: number } = {};
      monthKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          // Keep actual values
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeasonality > 0 && lineProjectedTarget > 0) {
          // Distribute using seasonality
          const monthSeasonality = seasonality[idx] ?? 8.33;
          newMonthly[key] = Math.round(lineProjectedTarget * (monthSeasonality / totalRemainingSeasonality));
        } else {
          newMonthly[key] = 0;
        }
      });

      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Year 2/3 - distribute across months using seasonality
      const yearTarget = activeYear === 2 ? (goals.year2?.revenue || 0) : (goals.year3?.revenue || 0);
      // Phase 51-03 (UX-S3-03): look up the line so seasonality can pick up
      // a per-line override (else falls through to business seasonality).
      const line = revenueLines.find(l => l.id === lineId);
      const seasonality = getEffectiveSeasonality(line ?? {}, priorYear?.seasonalityPattern);
      const totalSeasonality = seasonality.reduce((a: number, b: number) => a + b, 0);

      if (yearTarget > 0 && totalSeasonality > 0) {
        const lineTarget = yearTarget * (newPct / 100);
        const yearMonthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
        const monthly: MonthlyData = {};
        yearMonthKeys.forEach((key, idx) => {
          monthly[key] = Math.round(lineTarget * ((seasonality[idx] ?? 8.33) / totalSeasonality));
        });

        if (activeYear === 2) {
          actions.updateRevenueLine(lineId, { year2Monthly: monthly });
        } else {
          actions.updateRevenueLine(lineId, { year3Monthly: monthly });
        }
      }
    }
  };

  // Calculate totals for actuals vs projections
  const ytdActualTotal = currentYTD?.total_revenue || 0;
  const completedMonthsCount = currentYTD?.months_count || 0;
  const remainingMonthsCount = 12 - completedMonthsCount;

  const handlePatternChange = (pattern: 'seasonal' | 'straight-line' | 'manual') => {
    actions.setRevenuePattern(pattern);

    // Manual mode: don't auto-distribute, let user enter each cell
    if (pattern === 'manual') return;

    if (revenueLines.length === 0) return;

    // Get targets for ALL years
    const year1Target = goals.year1?.revenue || 0;
    const year2Target = goals.year2?.revenue || 0;
    const year3Target = goals.year3?.revenue || 0;

    // ═════════════════════════════════════════════════════════════════════════
    // STABLE LINE WEIGHTS
    // ═════════════════════════════════════════════════════════════════════════
    // Weights MUST be deterministic so clicking a pattern N times produces the
    // same result. The previous fallback (current Y1 share) drifted between
    // clicks for manually-added lines (lines not in prior year) and caused
    // "random numbers" on repeated switches.
    //
    // New rule:
    //   - Lines IN prior year: use prior-year share (line_total / prior_total)
    //   - Lines NOT in prior year (manually added): equal share of the
    //     remaining weight (1 - sum_of_prior_shares_for_current_lines)
    //   - All lines: normalised so weights sum to 1.0 exactly.
    //
    // This is invariant given (priorYear, revenueLines.length, list of which
    // lines have prior-year matches). Repeated clicks → identical weights →
    // identical distribution.
    const priorByLine: Record<string, number> = {};
    let priorRevTotal = 0;
    if (priorYear?.revenue?.byLine) {
      for (const pl of priorYear.revenue.byLine) {
        priorByLine[pl.id] = pl.total || 0;
        priorRevTotal += pl.total || 0;
      }
    }
    const linesWithPrior: string[] = [];
    const linesWithoutPrior: string[] = [];
    let priorWeightCovered = 0;
    for (const line of revenueLines) {
      const share = priorRevTotal > 0 ? (priorByLine[line.id] || 0) / priorRevTotal : 0;
      if (share > 0) {
        linesWithPrior.push(line.id);
        priorWeightCovered += share;
      } else {
        linesWithoutPrior.push(line.id);
      }
    }
    const remainingForNoPrior = Math.max(0, 1 - priorWeightCovered);
    const equalShareForNoPrior = linesWithoutPrior.length > 0
      ? remainingForNoPrior / linesWithoutPrior.length
      : 0;
    const lineWeights: Record<string, number> = {};
    for (const line of revenueLines) {
      const priorShare = priorRevTotal > 0 ? (priorByLine[line.id] || 0) / priorRevTotal : 0;
      lineWeights[line.id] = priorShare > 0 ? priorShare : equalShareForNoPrior;
    }
    // Normalise (defensive — handles floating-point drift + edge case where
    // prior-year covers all but no equal share is possible).
    const totalWeight = revenueLines.reduce((s, l) => s + (lineWeights[l.id] || 0), 0);
    if (totalWeight > 0) {
      for (const line of revenueLines) {
        lineWeights[line.id] = lineWeights[line.id] / totalWeight;
      }
    } else {
      for (const line of revenueLines) {
        lineWeights[line.id] = 1 / revenueLines.length;
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PER-LINE TARGETS WITH CROSS-LINE RESIDUE ABSORPTION
    // ═════════════════════════════════════════════════════════════════════════
    // Round each line's annual target, with the LAST line absorbing the
    // rounding residue. This guarantees Σ lineYearTarget_i === year1Target
    // exactly (within $1), regardless of floating-point weights.
    const lineYearTargets: Record<string, number> = {};
    let runningLineTargetSum = 0;
    revenueLines.forEach((line, idx) => {
      const isLastLine = idx === revenueLines.length - 1;
      const target = isLastLine
        ? year1Target - runningLineTargetSum
        : Math.round(year1Target * (lineWeights[line.id] ?? 0));
      lineYearTargets[line.id] = target;
      runningLineTargetSum += target;
    });

    // Per-line YTD: real Xero per-line breakdown when available; else
    // proportional split of business-level YTD by line weight (cross-line
    // residue absorption ensures Σ lineYtd_i === ytdActualTotal exactly).
    const ytdByMonth = currentYTD?.revenue_by_month ?? {};
    const ytdLines: Array<{ account_name: string; by_month?: Record<string, number> }> =
      ((currentYTD as { revenue_lines?: Array<{ account_name: string; by_month?: Record<string, number> }> } | null)?.revenue_lines) ?? [];
    const matchKey = (name: string) => name.trim().toLowerCase();
    const ytdByLineName = new Map<string, Record<string, number>>();
    for (const yl of ytdLines) {
      if (yl.by_month) ytdByLineName.set(matchKey(yl.account_name), yl.by_month);
    }

    // Per-line YTD totals (sum across actual months for each line).
    const lineYtdTotals: Record<string, number> = {};
    if (ytdByLineName.size > 0) {
      // Real per-line YTD available — use it directly.
      for (const line of revenueLines) {
        const real = ytdByLineName.get(matchKey(line.name));
        if (real) {
          lineYtdTotals[line.id] = monthKeys
            .filter((k) => isActualMonth(k))
            .reduce((s, k) => s + (real[k] || 0), 0);
        } else {
          lineYtdTotals[line.id] = 0;
        }
      }
    } else {
      // No per-line YTD — proportional split with cross-line residue absorption.
      let runningYtdSum = 0;
      revenueLines.forEach((line, idx) => {
        const isLastLine = idx === revenueLines.length - 1;
        lineYtdTotals[line.id] = isLastLine
          ? ytdActualTotal - runningYtdSum
          : Math.round(ytdActualTotal * (lineWeights[line.id] ?? 0));
        runningYtdSum += lineYtdTotals[line.id];
      });
    }

    // Same idea for actual months when no per-line YTD: each actual month's
    // ytdByMonth[key] gets split across lines; last line absorbs residue.
    // Pre-compute the per-(line, actualMonth) values so the loop below can
    // read them directly.
    const lineActualMonthly: Record<string, Record<string, number>> = {};
    for (const line of revenueLines) lineActualMonthly[line.id] = {};
    monthKeys.forEach((key) => {
      if (!isActualMonth(key)) return;
      // Real per-line YTD takes precedence.
      const haveAllRealForThisMonth = revenueLines.every((l) => {
        const real = ytdByLineName.get(matchKey(l.name));
        return real && real[key] !== undefined;
      });
      if (haveAllRealForThisMonth) {
        for (const line of revenueLines) {
          const real = ytdByLineName.get(matchKey(line.name))!;
          lineActualMonthly[line.id][key] = Math.round(real[key]);
        }
        return;
      }
      // Proportional split with last-line residue absorption.
      const monthYtd = ytdByMonth[key] || 0;
      let runningMonthSum = 0;
      revenueLines.forEach((line, idx) => {
        const isLastLine = idx === revenueLines.length - 1;
        lineActualMonthly[line.id][key] = isLastLine
          ? Math.round(monthYtd - runningMonthSum)
          : Math.round(monthYtd * (lineWeights[line.id] ?? 0));
        runningMonthSum += lineActualMonthly[line.id][key];
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PER-LINE DISTRIBUTION WITH PER-LINE RESIDUE ABSORPTION
    // ═════════════════════════════════════════════════════════════════════════
    // Issue 1 (May 2026 user report) — accumulate the per-line updates into
    // a single new array and dispatch ONE setRevenueLines call at the end,
    // instead of N independent updateRevenueLine calls. The previous loop
    // worked under React 18 batching for the monthly grid (each child re-
    // reads its own line), but the SUMMARY view computes derived totals
    // (linePercentages, totalRevenue, cogsLinePercentages) from the whole
    // revenueLines array. Sequential updateRevenueLine calls each produced
    // a different array reference within the same batch, and downstream
    // useMemo dep checks (which compare references) could miss intermediate
    // states. A single atomic setRevenueLines guarantees all readers see
    // the final, fully-redistributed array on the very next render — no
    // stale partial states.
    const updatedRevenueLines = revenueLines.map((line) => {
      const seasonality = getEffectiveSeasonality(line, priorYear?.seasonalityPattern);
      const updates: Partial<typeof line> = {};
      const lineYearTarget = lineYearTargets[line.id];
      const lineYtd = lineYtdTotals[line.id];
      const lineRemainingTarget = lineYearTarget - lineYtd;

      // === YEAR 1 ===
      const y1Monthly: { [key: string]: number } = {};
      // 1. Lock actual months from pre-computed values.
      for (const key of monthKeys) {
        if (isActualMonth(key)) {
          y1Monthly[key] = lineActualMonthly[line.id][key] ?? 0;
        }
      }
      // 2. Distribute lineRemainingTarget across non-actual months WITH
      //    last-month residue absorption. Guarantees Σ non-actual === lineRemainingTarget.
      const nonActualKeys = monthKeys.filter((k) => !isActualMonth(k));
      let totalRemainingSeasonality = 0;
      nonActualKeys.forEach((k) => {
        const idx = monthKeys.indexOf(k);
        totalRemainingSeasonality += seasonality[idx] ?? 8.33;
      });
      let runningNonActualSum = 0;
      nonActualKeys.forEach((key, ni) => {
        const isLast = ni === nonActualKeys.length - 1;
        if (isLast) {
          y1Monthly[key] = Math.max(0, lineRemainingTarget - runningNonActualSum);
        } else if (pattern === 'straight-line') {
          const val = nonActualKeys.length > 0 ? Math.round(lineRemainingTarget / nonActualKeys.length) : 0;
          y1Monthly[key] = Math.max(0, val);
          runningNonActualSum += y1Monthly[key];
        } else if (pattern === 'seasonal') {
          if (totalRemainingSeasonality > 0 && lineRemainingTarget > 0) {
            const idx = monthKeys.indexOf(key);
            const monthFactor = (seasonality[idx] ?? 8.33) / totalRemainingSeasonality;
            y1Monthly[key] = Math.max(0, Math.round(lineRemainingTarget * monthFactor));
          } else {
            y1Monthly[key] = 0;
          }
          runningNonActualSum += y1Monthly[key];
        } else {
          y1Monthly[key] = 0;
        }
      });
      updates.year1Monthly = y1Monthly;

      // === YEAR 2 (no actuals; full target distribution) ===
      if (year2Target > 0) {
        const lineYear2TargetRaw = year2Target * (lineWeights[line.id] ?? 0);
        const lineYear2Target = Math.round(lineYear2TargetRaw);
        const y2MonthKeys = generateMonthKeys(fiscalYear);
        const totalPct = seasonality.reduce((a: number, b: number) => a + b, 0);
        const y2Monthly: MonthlyData = {};
        let y2Running = 0;
        y2MonthKeys.forEach((key, idx) => {
          const isLast = idx === y2MonthKeys.length - 1;
          if (isLast) {
            y2Monthly[key] = Math.max(0, lineYear2Target - y2Running);
          } else if (pattern === 'seasonal' && totalPct > 0) {
            y2Monthly[key] = Math.max(0, Math.round(lineYear2Target * ((seasonality[idx] ?? 8.33) / totalPct)));
            y2Running += y2Monthly[key];
          } else {
            y2Monthly[key] = Math.max(0, Math.round(lineYear2Target / 12));
            y2Running += y2Monthly[key];
          }
        });
        updates.year2Monthly = y2Monthly;
      }

      // === YEAR 3 ===
      if (year3Target > 0) {
        const lineYear3TargetRaw = year3Target * (lineWeights[line.id] ?? 0);
        const lineYear3Target = Math.round(lineYear3TargetRaw);
        const y3MonthKeys = generateMonthKeys(fiscalYear + 1);
        const totalPct = seasonality.reduce((a: number, b: number) => a + b, 0);
        const y3Monthly: MonthlyData = {};
        let y3Running = 0;
        y3MonthKeys.forEach((key, idx) => {
          const isLast = idx === y3MonthKeys.length - 1;
          if (isLast) {
            y3Monthly[key] = Math.max(0, lineYear3Target - y3Running);
          } else if (pattern === 'seasonal' && totalPct > 0) {
            y3Monthly[key] = Math.max(0, Math.round(lineYear3Target * ((seasonality[idx] ?? 8.33) / totalPct)));
            y3Running += y3Monthly[key];
          } else {
            y3Monthly[key] = Math.max(0, Math.round(lineYear3Target / 12));
            y3Running += y3Monthly[key];
          }
        });
        updates.year3Monthly = y3Monthly;
      }

      return Object.keys(updates).length > 0 ? { ...line, ...updates } : line;
    });
    actions.setRevenueLines(updatedRevenueLines);
  };

  // Get prior year total for a revenue line
  const getLinePriorYear = (lineId: string): number => {
    const priorLine = priorYear?.revenue.byLine.find(l => l.id === lineId);
    return priorLine?.total || 0;
  };

  // Phase 51-02 (UX-S3-02) — base for Y-on-Y growth comes from the WIZARD's
  // previous year line total (Y1 → Y2 baseline; Y2 → Y3 baseline). The Xero
  // priorYear data (getLinePriorYear) is unused here because operators want
  // "Y3 grows X% from Y2", not "Y3 grows X% from last year's Xero data".
  // For Y1, return 0 — Y1 doesn't expose a Growth editor (the column is
  // hidden in Y1 view per the plan's must-haves).
  const getPreviousWizardYearLineTotal = (lineId: string, year: 1 | 2 | 3): number => {
    if (year === 1) return 0;
    const line = revenueLines.find(l => l.id === lineId);
    if (!line) return 0;
    const previousYear: 1 | 2 = year === 2 ? 1 : 2;
    return getRevenueLineYearTotal(line, previousYear);
  };

  // Handle growth % change — recalculate Y2/Y3 forecast from previous wizard
  // year line total × (1 + growth%). Y1 is a no-op (no prior wizard year).
  // Distribution uses the same business seasonality the rest of Step 3 uses.
  const handleGrowthChange = (lineId: string, growthPct: number) => {
    const priorTotal = getPreviousWizardYearLineTotal(lineId, activeYear as 1 | 2 | 3);
    if (priorTotal <= 0) return;

    const newTarget = Math.round(priorTotal * (1 + growthPct / 100));
    const line = revenueLines.find(l => l.id === lineId);
    if (!line) return;

    // Phase 51-03 (UX-S3-03): per-line override → business → 8.33 fallback.
    const seasonality = getEffectiveSeasonality(line, priorYear?.seasonalityPattern);
    const totalSeasonality = seasonality.reduce((a: number, b: number) => a + b, 0);

    if (activeYear === 1) {
      // Calculate actuals total (locked months)
      let actualsTotal = 0;
      monthKeys.forEach((key) => {
        if (isActualMonth(key)) {
          actualsTotal += line.year1Monthly[key] || 0;
        }
      });

      const remainingTarget = Math.max(0, newTarget - actualsTotal);
      let totalRemainingSeasonality = 0;
      monthKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) {
          totalRemainingSeasonality += seasonality[idx] ?? 8.33;
        }
      });

      const newMonthly: MonthlyData = {};
      monthKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeasonality > 0 && remainingTarget > 0) {
          const monthSeasonality = seasonality[idx] ?? 8.33;
          newMonthly[key] = Math.round(remainingTarget * (monthSeasonality / totalRemainingSeasonality));
        } else {
          newMonthly[key] = 0;
        }
      });

      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Year 2/3 - distribute full target across months using seasonality
      const yearMonthKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
      const monthly: MonthlyData = {};
      yearMonthKeys.forEach((key, idx) => {
        if (totalSeasonality > 0) {
          monthly[key] = Math.round(newTarget * ((seasonality[idx] ?? 8.33) / totalSeasonality));
        } else {
          monthly[key] = Math.round(newTarget / 12);
        }
      });

      if (activeYear === 2) {
        actions.updateRevenueLine(lineId, { year2Monthly: monthly });
      } else {
        actions.updateRevenueLine(lineId, { year3Monthly: monthly });
      }
    }
  };

  const toggleRevLineExpand = (lineId: string) => {
    setExpandedRevLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  // Prior year mix percentages
  const priorYearMix = useMemo(() => {
    const mix: Record<string, number> = {};
    if (!priorYear) return mix;
    const total = priorYear.revenue.total;
    if (total <= 0) return mix;
    priorYear.revenue.byLine.forEach(line => {
      mix[line.id] = Math.round((line.total / total) * 100);
    });
    return mix;
  }, [priorYear]);

  // Phase 51-02 (UX-S3-02): commit a Growth % edit. Clamps to [-100, 1000]
  // and delegates to handleGrowthChange (single source of truth — distribution
  // math is owned by handleGrowthChange, not duplicated here).
  const commitGrowthValue = (lineId: string, growthValue: number) => {
    const clamped = Math.max(-100, Math.min(1000, growthValue));
    handleGrowthChange(lineId, clamped);
  };

  // Phase 51-02 (UX-S3-02): per-line implied growth % for the active year.
  // Display floor: when this-year total is 0 (no entry yet) and prior is
  // positive, display 0 instead of -100 to avoid showing -100% as the default.
  const getDisplayGrowthPct = (lineId: string, thisYearTotal: number): number => {
    if (activeYear === 1) return 0;
    const priorTotal = getPreviousWizardYearLineTotal(lineId, activeYear as 1 | 2 | 3);
    if (priorTotal <= 0) return 0;
    if (thisYearTotal <= 0) return 0; // floor: don't surface -100% as the default
    return Math.round(((thisYearTotal - priorTotal) / priorTotal) * 100);
  };

  // Handle mix % change — recalculate forecast from target × mix × seasonality
  const handleMixChange = (lineId: string, newMixPct: number) => {
    const yearTarget = activeYear === 1 ? (goals.year1?.revenue || 0)
      : activeYear === 2 ? (goals.year2?.revenue || 0)
      : (goals.year3?.revenue || 0);
    if (yearTarget <= 0) return;

    const lineTarget = Math.round(yearTarget * (newMixPct / 100));
    const yearMKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
    // Phase 51-03 (UX-S3-03): per-line override → business → 8.33 fallback.
    // Look up the line up-front so seasonality honors the override regardless
    // of which year-branch runs below.
    const lineLookup = revenueLines.find(l => l.id === lineId);
    const seasonality = getEffectiveSeasonality(lineLookup ?? {}, priorYear?.seasonalityPattern);

    // For Y1, preserve actuals and distribute remaining across projected months
    if (activeYear === 1) {
      const line = lineLookup;
      if (!line) return;

      let actualsTotal = 0;
      yearMKeys.forEach(key => {
        if (isActualMonth(key)) actualsTotal += line.year1Monthly[key] || 0;
      });

      const remainingTarget = Math.max(0, lineTarget - actualsTotal);
      let totalRemainingSeason = 0;
      yearMKeys.forEach((key, idx) => {
        if (!isActualMonth(key)) totalRemainingSeason += seasonality[idx] ?? 8.33;
      });

      const newMonthly: Record<string, number> = {};
      yearMKeys.forEach((key, idx) => {
        if (isActualMonth(key)) {
          newMonthly[key] = line.year1Monthly[key] || 0;
        } else if (totalRemainingSeason > 0 && remainingTarget > 0) {
          newMonthly[key] = Math.round(remainingTarget * ((seasonality[idx] ?? 8.33) / totalRemainingSeason));
        } else {
          newMonthly[key] = 0;
        }
      });
      actions.updateRevenueLine(lineId, { year1Monthly: newMonthly });
    } else {
      // Y2/Y3 — distribute fully using seasonality
      const totalSeason = seasonality.reduce((s, v) => s + v, 0);
      const monthly: Record<string, number> = {};
      yearMKeys.forEach((key, idx) => {
        monthly[key] = Math.round(lineTarget * ((seasonality[idx] ?? 8.33) / totalSeason));
      });
      if (activeYear === 2) {
        actions.updateRevenueLine(lineId, { year2Monthly: monthly });
      } else {
        actions.updateRevenueLine(lineId, { year3Monthly: monthly });
      }
    }
  };

  const handleAddRevenueLine = () => {
    if (!newRevenueName.trim()) return;
    actions.addRevenueLine({
      name: newRevenueName.trim(),
      year1Monthly: {},
      year2Monthly: {},
      year3Monthly: {},
    });
    setNewRevenueName('');
    setShowAddRevenue(false);
  };

  const handleAddCOGSLine = () => {
    if (!newCOGSName.trim()) return;
    actions.addCOGSLine({
      name: newCOGSName.trim(),
      costBehavior: 'variable',
      percentOfRevenue: 0,
    });
    setNewCOGSName('');
    setShowAddCOGS(false);
  };

  // Calculate COGS amount for a line — uses monthly data if available
  const calculateCOGSAmount = (line: typeof cogsLines[0]) => {
    const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
    const monthly = line[yearKey as keyof typeof line] as Record<string, number> | undefined;
    if (monthly && Object.keys(monthly).length > 0) {
      return Object.values(monthly).reduce((a, b) => a + b, 0);
    }
    if (line.costBehavior === 'fixed') {
      return (line.monthlyAmount || 0) * 12;
    }
    return (totalRevenue * (line.percentOfRevenue || 0)) / 100;
  };

  // Prior year COGS mix
  const priorYearCogsMix = useMemo(() => {
    const mix: Record<string, number> = {};
    if (!priorYear) return mix;
    const total = priorYear.cogs.total;
    if (total <= 0) return mix;
    priorYear.cogs.byLine.forEach(line => {
      mix[line.id] = Math.round((line.total / total) * 100);
    });
    return mix;
  }, [priorYear]);

  const handleRevenueChange = (lineId: string, period: string, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    const line = revenueLines.find((l) => l.id === lineId);
    if (!line) return;

    if (activeYear === 1) {
      actions.updateRevenueLine(lineId, {
        year1Monthly: { ...line.year1Monthly, [period]: numValue },
      });
    } else if (activeYear === 2) {
      actions.updateRevenueLine(lineId, {
        year2Monthly: { ...(line.year2Monthly || {}), [period]: numValue },
      });
    } else {
      actions.updateRevenueLine(lineId, {
        year3Monthly: { ...(line.year3Monthly || {}), [period]: numValue },
      });
    }
  };

  const getLineTotal = (line: typeof revenueLines[0]) => {
    return getRevenueLineYearTotal(line, activeYear as 1 | 2 | 3);
  };

  const totalRevenue = revenueLines.reduce((sum, line) => sum + getLineTotal(line), 0);
  const totalCOGS = cogsLines.reduce((sum, line) => sum + calculateCOGSAmount(line), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const grossProfitPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Current COGS line percentages (of total COGS).
  // Last line absorbs rounding residue so the displayed sum is exactly 100%
  // (independent rounding per line drifts to 98/99/101/102 with 3+ lines).
  //
  // Issue 1 (May 2026 user report): pattern changes (Seasonal/Straight-line/
  // Manual) redistribute the active year's per-month values across revenue
  // lines, which can shift `totalRevenue` by rounding residue ($1–$2). When
  // that residue happens to round-trip identically (same goal × same weights →
  // same total), `totalRevenue` was bit-identical and React would skip the
  // recompute, leaving the summary's COGS % shares stale even though the
  // monthly grid had visibly redistributed. `revenuePattern` and `revenueLines`
  // are now in the dep list so a pattern toggle ALWAYS triggers a fresh
  // computation — variable-COGS rows depend on per-month revenue, not just
  // the annual total, so reading from `revenueLines` directly is the correct
  // dependency surface (handlePatternChange always produces a new revenueLines
  // array reference via setState).
  const cogsLinePercentages = useMemo(() => {
    const pcts: Record<string, number> = {};
    if (cogsLines.length === 0) return pcts;
    if (totalCOGS <= 0) {
      const evenSplit = Math.floor(100 / cogsLines.length);
      const lastIdx = cogsLines.length - 1;
      cogsLines.forEach((line, i) => {
        pcts[line.id] = i === lastIdx ? 100 - evenSplit * lastIdx : evenSplit;
      });
      return pcts;
    }
    let runningSum = 0;
    const lastIdx = cogsLines.length - 1;
    cogsLines.forEach((line, i) => {
      if (i === lastIdx) {
        pcts[line.id] = Math.max(0, 100 - runningSum);
      } else {
        const rounded = Math.round((calculateCOGSAmount(line) / totalCOGS) * 100);
        pcts[line.id] = rounded;
        runningSum += rounded;
      }
    });
    return pcts;
  }, [cogsLines, totalCOGS, totalRevenue, activeYear, revenuePattern, revenueLines]);

  const cogsPctTotal = Object.values(cogsLinePercentages).reduce((a, b) => a + b, 0);

  // Handle COGS mix % change — redistribute COGS total by mix using seasonality
  const handleCogsMixChange = (lineId: string, newMixPct: number) => {
    if (totalCOGS <= 0) return;
    const lineTarget = Math.round(totalCOGS * (newMixPct / 100));
    const yearMKeys = generateMonthKeys(fiscalYear - 1 + (activeYear - 1));
    // Phase 51-03 (UX-S3-03): per-line override (on the COGS line) → business
    // → 8.33 fallback. Variable-COGS lines hide the editor button (Task 5),
    // but the read still funnels through the helper for symmetry + safety.
    const cogsLineLookup = cogsLines.find(l => l.id === lineId);
    const seasonality = getEffectiveSeasonality(cogsLineLookup ?? {}, priorYear?.seasonalityPattern);
    const totalSeason = seasonality.reduce((s, v) => s + v, 0);

    const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
    const monthly: Record<string, number> = {};
    yearMKeys.forEach((key, idx) => {
      monthly[key] = Math.round(lineTarget * ((seasonality[idx] ?? 8.33) / totalSeason));
    });
    actions.updateCOGSLine(lineId, { [yearKey]: monthly });
  };

  // Check if lines came from Xero/CSV
  const hasImportedData = priorYear && (priorYear.revenue.byLine.length > 0 || priorYear.cogs.byLine.length > 0);

  return (
    <div className="space-y-4">
      {/* D-44.2-02 — read-path data integrity banner. Renders nothing when verified.
          Suppress 'no_sync' when actuals are already loaded — the API returns
          'no_sync' if xero_connections.is_active is false or sync_jobs is in
          'running'/unknown, but xero_pl_lines may still hold last-good data.
          Telling the coach to "Connect Xero" when YTD is visibly populated is
          contradictory; partial / failed / stale still fire correctly. */}
      <DataIntegrityBanner
        quality={dataQuality === 'no_sync' && (currentYTD?.months_count ?? 0) > 0 ? 'verified' : dataQuality}
        perTenantQuality={perTenantQuality}
        lastSyncAt={perTenantQuality[0]?.last_sync_at ?? null}
      />
      {/* Compact context bar */}
      {(activeYear === 1 && completedMonthsCount > 0 || hasImportedData) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4 text-gray-600">
            {completedMonthsCount > 0 && activeYear === 1 && (
              <span>{completedMonthsCount}/12 months actual &bull; {formatCurrency(ytdActualTotal)} YTD</span>
            )}
            {hasImportedData && (
              <span className="text-gray-400">Lines from Xero</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeYear === 1 && completedMonthsCount > 0 && (
              <span className="text-gray-500">Remaining: {formatCurrency(Math.max(0, (goals.year1?.revenue || 0) - ytdActualTotal))}</span>
            )}
          </div>
        </div>
      )}

      {/* View Mode Toggle + Forecast Pattern Selector */}
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('summary')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'summary' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'monthly' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Monthly Detail
          </button>
        </div>
        {/* Forecast pattern selector — wires existing handlePatternChange. Default: 'seasonal'. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Forecast pattern:</span>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handlePatternChange('seasonal')}
              title="Distribute by your prior-year shape (or per-line override). Best when revenue varies by month."
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                revenuePattern === 'seasonal' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Seasonal
            </button>
            <button
              onClick={() => handlePatternChange('straight-line')}
              title="Equal monthly amount across remaining months. Best for recurring or steady revenue."
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                revenuePattern === 'straight-line' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Straight-line
            </button>
            <button
              onClick={() => handlePatternChange('manual')}
              title="Don't auto-distribute. Type each cell yourself."
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                revenuePattern === 'manual' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Manual
            </button>
          </div>
          <Info className="w-3 h-3 text-gray-400" />
        </div>
      </div>

      {/* Add Revenue Line form (above the table) */}
      {showAddRevenue && (
        <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <input
            type="text"
            value={newRevenueName}
            onChange={(e) => setNewRevenueName(e.target.value)}
            placeholder="Enter revenue line item name..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
            autoFocus
          />
          <button
            onClick={handleAddRevenueLine}
            className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setShowAddRevenue(false); setNewRevenueName(''); }}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add COGS Line form (above the table) */}
      {showAddCOGS && (
        <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <input
            type="text"
            value={newCOGSName}
            onChange={(e) => setNewCOGSName(e.target.value)}
            placeholder="Enter COGS item name..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
            autoFocus
          />
          <button
            onClick={handleAddCOGSLine}
            className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setShowAddCOGS(false); setNewCOGSName(''); }}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Unified P&L Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* ======== SUMMARY VIEW ======== */}
        {viewMode === 'summary' && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '24%' }}>Line Item</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '14%' }}>Prior Year</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '12%' }}>
                  % Split
                  {(activeYear === 2 || activeYear === 3) && (
                    <span className="ml-1 text-gray-400 normal-case">/ Growth</span>
                  )}
                </th>
                {/* Peak/Low — visible on md+ so pattern toggles (Straight/Seasonal/Manual)
                    are obvious in summary view. Annual totals stay constant when goal
                    is pinned, so monthly extremes are the visual signal of distribution. */}
                <th className="hidden md:table-cell px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '11%' }}>Peak</th>
                <th className="hidden md:table-cell px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '11%' }}>Low</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '16%' }}>Forecast {activeYear === 1 ? 'Y1' : `Y${activeYear}`}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ width: '12%' }}>vs Prior / % of Rev</th>
              </tr>
            </thead>
            <tbody>
              {/* REVENUE section header */}
              <tr className="bg-gray-50">
                <td colSpan={7} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Revenue</span>
                    <button
                      onClick={() => setShowAddRevenue(true)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Line
                    </button>
                  </div>
                </td>
              </tr>

              {/* Revenue lines */}
              {revenueLines.map((line) => {
                const priorTotal = getLinePriorYear(line.id);
                const forecastTotal = getLineTotal(line);
                const currentMixPct = linePercentages[line.id] || 0;
                const growthPct = priorTotal > 0 ? ((forecastTotal - priorTotal) / priorTotal) * 100 : 0;
                const isExpanded = expandedRevLines.has(line.id);
                const lineMonthly = activeYear === 1
                  ? line.year1Monthly
                  : activeYear === 2
                    ? (line.year2Monthly || {})
                    : (line.year3Monthly || {});
                const { peak, low } = getPeakLow(lineMonthly);
                return (
                  <React.Fragment key={line.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleRevLineExpand(line.id)} className="text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <span className="text-sm font-medium text-gray-900 truncate">{line.name}</span>
                          {/* Phase 51-03 (UX-S3-03): per-line seasonality override editor trigger. */}
                          <button
                            type="button"
                            onClick={() => setShowSeasonalityFor(line.id)}
                            aria-label={`Edit seasonality for ${line.name}`}
                            className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>{line.seasonalityPattern ? 'edit seasonality (custom)' : 'edit seasonality'}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                        {priorTotal > 0 ? formatCurrency(priorTotal) : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {/* Phase 51-01 (UX-S3-01): % split editor.
                            % is share of goals.year[N].revenue (not share of revenue-line total)
                            so it matches handleMixChange semantics. The $ value is shown in the
                            adjacent "Forecast Y[N]" column; it doesn't need to be duplicated here. */}
                        <RevenueLineMixInputs
                          lineId={line.id}
                          lineName={line.name}
                          linePct={
                            yearTargetRevenue > 0
                              ? Math.round((forecastTotal / yearTargetRevenue) * 100)
                              : currentMixPct
                          }
                          onCommitPct={(val) => handleMixChange(line.id, val)}
                          size="sm"
                          activeYear={activeYear}
                          growthPct={getDisplayGrowthPct(line.id, forecastTotal)}
                          onCommitGrowth={
                            activeYear === 2 || activeYear === 3
                              ? (val) => commitGrowthValue(line.id, val)
                              : undefined
                          }
                        />
                      </td>
                      <td className="hidden md:table-cell px-2 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                        {peak ? (
                          <span><span className="text-gray-400">{peak.label}</span> {formatMoneyShort(peak.value)}</span>
                        ) : (
                          <span className="text-gray-300">&mdash;</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                        {low ? (
                          <span><span className="text-gray-400">{low.label}</span> {formatMoneyShort(low.value)}</span>
                        ) : (
                          <span className="text-gray-300">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(forecastTotal)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {priorTotal > 0 ? (
                            <span className={`text-sm ${growthPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {growthPct >= 0 ? '+' : ''}{Math.round(growthPct)}%
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">\u2014</span>
                          )}
                          <button
                            onClick={() => actions.removeRevenueLine(line.id)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded monthly detail row */}
                    {isExpanded && (
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="grid grid-cols-12 gap-1">
                            {monthKeys.map((key, idx) => {
                              const isActual = activeYear === 1 && isActualMonth(key);
                              const yearMonthly = activeYear === 1
                                ? line.year1Monthly
                                : activeYear === 2
                                  ? (line.year2Monthly || {})
                                  : (line.year3Monthly || {});
                              const cellValue = yearMonthly[key] || 0;
                              return (
                                <div key={key} className="text-center">
                                  <div className={`text-[10px] font-medium mb-1 ${isActual ? 'text-blue-600' : 'text-gray-400'}`}>
                                    {months[idx]}{isActual ? ' \u2713' : ''}
                                  </div>
                                  {isActual ? (
                                    <div className="px-1 py-1 text-xs text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium">
                                      {cellValue.toLocaleString()}
                                    </div>
                                  ) : (
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={cellValue || ''}
                                      onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                                      placeholder="0"
                                      className="w-full px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* TOTAL REVENUE */}
              <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2.5 text-sm text-gray-900">TOTAL REVENUE</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {priorYear ? formatCurrency(priorYear.revenue.total) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {linePctTotal}%{linePctTotal !== 100 && (linePctTotal < 100 ? ' under' : ' over')}
                  </span>
                </td>
                <td className="hidden md:table-cell"></td>
                <td className="hidden md:table-cell"></td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-900">{formatCurrency(totalRevenue)}</td>
                <td className="px-4 py-2.5 text-right text-sm">
                  {priorYear && priorYear.revenue.total > 0 ? (
                    <span className={totalRevenue >= priorYear.revenue.total ? 'text-green-600' : 'text-red-600'}>
                      {totalRevenue >= priorYear.revenue.total ? '+' : ''}{((totalRevenue - priorYear.revenue.total) / priorYear.revenue.total * 100).toFixed(0)}%
                    </span>
                  ) : '\u2014'}
                </td>
              </tr>

              {/* Spacer */}
              <tr><td colSpan={7} className="py-2"></td></tr>

              {/* COST OF SALES section header */}
              <tr className="bg-gray-50">
                <td colSpan={7} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Cost of Sales</span>
                      <div className="group relative">
                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                          <p className="mb-1"><strong>Variable:</strong> Costs that change with revenue (e.g., materials, commissions)</p>
                          <p><strong>Fixed:</strong> Costs that stay constant regardless of revenue (rare for COGS)</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddCOGS(true)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Line
                    </button>
                  </div>
                </td>
              </tr>

              {/* COGS lines */}
              {cogsLines.map((line) => {
                const priorPct = priorYearCogsMix[line.id] || 0;
                const currentPct = cogsLinePercentages[line.id] || 0;
                const lineAmount = calculateCOGSAmount(line);
                const pctOfRev = totalRevenue > 0 ? (lineAmount / totalRevenue * 100) : 0;
                const cogsLineMonthly = activeYear === 1
                  ? line.year1Monthly
                  : activeYear === 2
                    ? (line.year2Monthly || {})
                    : (line.year3Monthly || {});
                const { peak: cogsPeak, low: cogsLow } = getPeakLow(cogsLineMonthly);
                return (
                  <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{line.name}</span>
                        <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                          line.costBehavior === 'variable' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                        }`}>
                          {line.costBehavior === 'variable' ? 'Var' : 'Fix'}
                        </span>
                        {/* Phase 51-03 (UX-S3-03): per-line seasonality override
                            trigger. HIDDEN for variable COGS — variable COGS
                            distributes by revenue, so per-line seasonality is
                            redundant (operator decision encoded). */}
                        {line.costBehavior !== 'variable' && (
                          <button
                            type="button"
                            onClick={() => setShowSeasonalityFor(line.id)}
                            aria-label={`Edit seasonality for ${line.name}`}
                            className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>{line.seasonalityPattern ? 'edit seasonality (custom)' : 'edit seasonality'}</span>
                          </button>
                        )}
                      </div>
                      {state.forecastDuration > 1 && (
                        <select
                          value={line.y2y3Trend || 'same'}
                          onChange={(e) => actions.updateCOGSLine(line.id, { y2y3Trend: e.target.value as 'same' | 'improves' | 'increases' })}
                          className="mt-1 text-[10px] text-gray-400 bg-transparent border-0 p-0 cursor-pointer hover:text-gray-600"
                        >
                          <option value="same">Y2/Y3: Same %</option>
                          <option value="improves">Y2/Y3: Improves ~2%</option>
                          <option value="increases">Y2/Y3: Increases ~2%</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                      {line.priorYearTotal != null && line.priorYearTotal > 0 ? formatCurrency(line.priorYearTotal) : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          value={pendingCogsMixPcts[line.id] !== undefined ? pendingCogsMixPcts[line.id] : currentPct}
                          onChange={(e) => setPendingCogsMixPcts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          onBlur={() => commitMixPct(line.id, pendingCogsMixPcts[line.id], 'cogs')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          min="0"
                          max="100"
                          className="w-14 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-2 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                      {cogsPeak ? (
                        <span><span className="text-gray-400">{cogsPeak.label}</span> {formatMoneyShort(cogsPeak.value)}</span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-2 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                      {cogsLow ? (
                        <span><span className="text-gray-400">{cogsLow.label}</span> {formatMoneyShort(cogsLow.value)}</span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(lineAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm text-gray-500">{pctOfRev.toFixed(1)}%</span>
                        <button
                          onClick={() => actions.removeCOGSLine(line.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {cogsLines.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    {priorYear && priorYear.cogs.byLine.length === 0 ? (
                      <>
                        <div className="font-medium text-gray-700 mb-1">No Cost of Sales accounts found in Xero</div>
                        <div className="text-xs">Service businesses often don&apos;t have COGS. If you have direct product or service-delivery costs, click &quot;Add Line&quot; above to enter them manually.</div>
                      </>
                    ) : (
                      <>No COGS lines added. Click &quot;Add Line&quot; above.</>
                    )}
                  </td>
                </tr>
              )}

              {/* TOTAL COST OF SALES */}
              <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2.5 text-sm text-gray-900">TOTAL COST OF SALES</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {priorYear ? formatCurrency(priorYear.cogs.total) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs font-bold ${cogsPctTotal >= 99 && cogsPctTotal <= 101 ? 'text-green-600' : 'text-amber-600'}`}>
                    {cogsPctTotal}%
                  </span>
                </td>
                <td className="hidden md:table-cell"></td>
                <td className="hidden md:table-cell"></td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-900">{formatCurrency(totalCOGS)}</td>
                <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                  {totalRevenue > 0 ? `${(totalCOGS / totalRevenue * 100).toFixed(1)}%` : '\u2014'}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ======== MONTHLY VIEW ======== */}
        {viewMode === 'monthly' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[180px]">
                    Line Item
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase w-[60px]">
                    % Split
                  </th>
                  {months.map((m, idx) => {
                    const monthKey = monthKeys[idx];
                    const isActual = activeYear === 1 && isActualMonth(monthKey);
                    return (
                      <th
                        key={monthKey}
                        className={`px-2 py-3 text-right text-xs font-medium uppercase w-[72px] ${
                          isActual ? 'bg-blue-50 text-blue-700' : 'text-gray-500'
                        }`}
                      >
                        <div className="flex flex-col items-end">
                          <span>{m}</span>
                          {isActual && (
                            <span className="text-[10px] font-normal text-blue-500">Actual</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-[100px]">Total</th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {/* REVENUE header */}
                <tr className="bg-gray-50">
                  <td colSpan={16} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Revenue</span>
                      <button
                        onClick={() => setShowAddRevenue(true)}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Revenue lines */}
                {revenueLines.map((line) => {
                  const yearMonthly = activeYear === 1
                    ? line.year1Monthly
                    : activeYear === 2
                      ? (line.year2Monthly || {})
                      : (line.year3Monthly || {});
                  const revMixPct = linePercentages[line.id] || 0;

                  return (
                    <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{line.name}</span>
                          {/* Phase 51-03 (UX-S3-03): per-line seasonality override editor trigger. */}
                          <button
                            type="button"
                            onClick={() => setShowSeasonalityFor(line.id)}
                            aria-label={`Edit seasonality for ${line.name}`}
                            className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center"
                          >
                            <Calendar className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        {/* Phase 51-01 (UX-S3-01): paired $/% editor (was % only).
                            % is share of goals.year[N].revenue so it round-trips with $. */}
                        {(() => {
                          const lineTotalNow = Object.values(yearMonthly).reduce((s, v) => s + (v || 0), 0);
                          return (
                            <RevenueLineMixInputs
                              lineId={line.id}
                              lineName={line.name}
                              linePct={
                                yearTargetRevenue > 0
                                  ? Math.round((lineTotalNow / yearTargetRevenue) * 100)
                                  : revMixPct
                              }
                              onCommitPct={(val) => handleMixChange(line.id, val)}
                              size="xs"
                              activeYear={activeYear}
                              growthPct={getDisplayGrowthPct(line.id, lineTotalNow)}
                              onCommitGrowth={
                                activeYear === 2 || activeYear === 3
                                  ? (val) => commitGrowthValue(line.id, val)
                                  : undefined
                              }
                            />
                          );
                        })()}
                      </td>
                      {monthKeys.map((key) => {
                        const isActual = activeYear === 1 && isActualMonth(key);
                        const cellValue = yearMonthly[key] || 0;
                        return (
                          <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                            {isActual ? (
                              <div className="w-full px-2 py-1 text-sm text-right bg-blue-100 border border-blue-200 rounded text-blue-900 font-medium flex items-center justify-end gap-1">
                                <Lock className="w-3 h-3 text-blue-500" />
                                <span>{cellValue ? cellValue.toLocaleString() : '0'}</span>
                              </div>
                            ) : (
                              <input
                                type="number"
                                inputMode="decimal"
                                value={cellValue || ''}
                                onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                                placeholder="0"
                                className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(getLineTotal(line))}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => actions.removeRevenueLine(line.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* TOTAL REVENUE */}
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-100">TOTAL REVENUE</td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-[10px] font-bold ${linePctTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                      {linePctTotal}%
                    </span>
                  </td>
                  {monthKeys.map((key) => {
                    const monthTotal = revenueLines.reduce((sum, line) => {
                      const yearMonthly = activeYear === 1
                        ? line.year1Monthly
                        : activeYear === 2
                          ? (line.year2Monthly || {})
                          : (line.year3Monthly || {});
                      return sum + (yearMonthly[key] || 0);
                    }, 0);
                    const isActual = activeYear === 1 && isActualMonth(key);
                    return (
                      <td key={key} className={`px-2 py-3 text-sm text-right ${isActual ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`}>
                        {monthTotal > 0 ? formatCurrency(monthTotal) : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalRevenue)}</td>
                  <td></td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={16} className="py-2"></td></tr>

                {/* COST OF SALES header */}
                <tr className="bg-gray-50">
                  <td colSpan={16} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Cost of Sales</span>
                      <button
                        onClick={() => setShowAddCOGS(true)}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    </div>
                  </td>
                </tr>

                {/* COGS lines */}
                {cogsLines.map((line) => {
                  const yearKey = activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly';
                  const existingMonthly = line[yearKey] || {};
                  const hasMonthlyData = Object.keys(existingMonthly).length > 0;

                  const monthlyRevForLine = monthKeys.map(key =>
                    revenueLines.reduce((sum, rl) => {
                      const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                      return sum + (rm[key] || 0);
                    }, 0)
                  );

                  const getMonthValue = (key: string, idx: number): number => {
                    if (hasMonthlyData) return existingMonthly[key] || 0;
                    if (line.costBehavior === 'variable') return Math.round(monthlyRevForLine[idx] * (line.percentOfRevenue || 0) / 100);
                    return line.monthlyAmount || 0;
                  };

                  const monthValues = monthKeys.map((key, idx) => getMonthValue(key, idx));
                  const lineTotal = monthValues.reduce((a, b) => a + b, 0);

                  const handleCOGSMonthChange = (key: string, value: string) => {
                    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
                    const updated = { ...existingMonthly };
                    if (!hasMonthlyData) {
                      monthKeys.forEach((k, i) => { updated[k] = getMonthValue(k, i); });
                    }
                    updated[key] = numValue;
                    actions.updateCOGSLine(line.id, { [yearKey]: updated });
                  };

                  const cogsMixPct = cogsLinePercentages[line.id] || 0;

                  return (
                    <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 sticky left-0 bg-white min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900 truncate">{line.name}</div>
                          {/* Phase 51-03 (UX-S3-03): per-line seasonality override
                              trigger. HIDDEN for variable COGS rows. */}
                          {line.costBehavior !== 'variable' && (
                            <button
                              type="button"
                              onClick={() => setShowSeasonalityFor(line.id)}
                              aria-label={`Edit seasonality for ${line.name}`}
                              className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center"
                            >
                              <Calendar className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {line.costBehavior === 'variable' ? `${line.percentOfRevenue || 0}% of rev` : `$${(line.monthlyAmount || 0).toLocaleString()}/mo`}
                          {hasMonthlyData && <span className="ml-1 text-amber-500">(edited)</span>}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            value={pendingCogsMixPcts[line.id] !== undefined ? pendingCogsMixPcts[line.id] : cogsMixPct}
                            onChange={(e) => setPendingCogsMixPcts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            onBlur={() => commitMixPct(line.id, pendingCogsMixPcts[line.id], 'cogs')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            min="0"
                            max="100"
                            className="w-12 px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      </td>
                      {monthKeys.map((key, idx) => {
                        const isActual = activeYear === 1 && isActualMonth(key);
                        const val = monthValues[idx];
                        return (
                          <td key={key} className={`px-1 py-1 ${isActual ? 'bg-blue-50' : ''}`}>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={val || ''}
                              onChange={(e) => handleCOGSMonthChange(key, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                              placeholder="0"
                              className={`w-full px-1 py-1 text-xs text-right border border-gray-200 rounded focus:ring-1 focus:ring-brand-navy focus:border-brand-navy ${
                                !hasMonthlyData ? 'text-gray-400' : 'text-gray-900'
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => actions.removeCOGSLine(line.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {cogsLines.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-500">
                      {priorYear && priorYear.cogs.byLine.length === 0 ? (
                        <>
                          <div className="font-medium text-gray-700 mb-1">No Cost of Sales accounts found in Xero</div>
                          <div className="text-xs">Service businesses often don&apos;t have COGS. If you have direct product or service-delivery costs, click &quot;Add Line&quot; to enter them manually.</div>
                        </>
                      ) : (
                        <>No COGS lines added. Click &quot;Add Line&quot; to add cost of goods sold items.</>
                      )}
                    </td>
                  </tr>
                )}

                {/* TOTAL COST OF SALES */}
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-100">TOTAL COST OF SALES</td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-[10px] font-bold ${cogsPctTotal >= 99 && cogsPctTotal <= 101 ? 'text-green-600' : 'text-amber-600'}`}>
                      {cogsPctTotal}%
                    </span>
                  </td>
                  {monthKeys.map((key) => {
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const monthRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(monthRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    return (
                      <td key={key} className="px-2 py-3 text-sm text-gray-900 text-right">{formatCurrency(monthCogs)}</td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalCOGS)}</td>
                  <td></td>
                </tr>

                {/* GROSS PROFIT */}
                <tr className="bg-green-50 font-semibold border-t-2 border-green-300">
                  <td className="px-4 py-3 text-sm text-green-900 sticky left-0 bg-green-50">GROSS PROFIT</td>
                  <td></td>
                  {monthKeys.map((key) => {
                    const monthRev = revenueLines.reduce((sum, line) => {
                      const yearMonthly = activeYear === 1
                        ? line.year1Monthly
                        : activeYear === 2
                          ? (line.year2Monthly || {})
                          : (line.year3Monthly || {});
                      return sum + (yearMonthly[key] || 0);
                    }, 0);
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const mRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(mRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    const monthGP = monthRev - monthCogs;
                    return (
                      <td key={key} className="px-2 py-3 text-sm text-green-900 text-right">
                        {monthRev > 0 ? formatCurrency(monthGP) : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm text-green-900 text-right">{formatCurrency(grossProfit)}</td>
                  <td></td>
                </tr>

                {/* Gross Margin % */}
                <tr className="bg-green-50">
                  <td className="px-4 py-2 text-xs text-green-700 sticky left-0 bg-green-50">Gross Margin %</td>
                  <td></td>
                  {monthKeys.map((key) => {
                    const monthRev = revenueLines.reduce((sum, line) => {
                      const yearMonthly = activeYear === 1
                        ? line.year1Monthly
                        : activeYear === 2
                          ? (line.year2Monthly || {})
                          : (line.year3Monthly || {});
                      return sum + (yearMonthly[key] || 0);
                    }, 0);
                    const monthCogs = cogsLines.reduce((sum, line) => {
                      const ym = line[activeYear === 1 ? 'year1Monthly' : activeYear === 2 ? 'year2Monthly' : 'year3Monthly'] || {};
                      if (Object.keys(ym).length > 0) return sum + (ym[key] || 0);
                      const mRev = revenueLines.reduce((s, rl) => {
                        const rm = activeYear === 1 ? rl.year1Monthly : activeYear === 2 ? (rl.year2Monthly || {}) : (rl.year3Monthly || {});
                        return s + (rm[key] || 0);
                      }, 0);
                      if (line.costBehavior === 'variable') return sum + Math.round(mRev * (line.percentOfRevenue || 0) / 100);
                      return sum + (line.monthlyAmount || 0);
                    }, 0);
                    const monthGM = monthRev > 0 ? ((monthRev - monthCogs) / monthRev * 100) : 0;
                    return (
                      <td key={key} className="px-2 py-2 text-xs text-green-700 text-right">
                        {monthRev > 0 ? `${monthGM.toFixed(1)}%` : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-xs text-green-700 text-right font-semibold">
                    {grossProfitPct.toFixed(1)}%
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* GP summary callout inside the card */}
        {(() => {
          const gpTarget = activeYear === 1
            ? goals.year1?.grossProfitPct
            : activeYear === 2
              ? goals.year2?.grossProfitPct
              : goals.year3?.grossProfitPct;
          const gpMet = gpTarget ? grossProfitPct >= gpTarget : true;
          const gpGap = gpTarget ? grossProfitPct - gpTarget : 0;
          return (
            <div className={`mx-5 mb-5 mt-3 rounded-lg p-4 ${gpMet ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold">Gross Profit</span>
                  <span className="text-sm text-gray-500 ml-2">Revenue minus COGS</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold">{formatCurrency(grossProfit)}</span>
                  <span className="text-sm ml-2">{grossProfitPct.toFixed(1)}%</span>
                </div>
              </div>
              {gpTarget && totalRevenue > 0 && (
                <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm">
                  <span>Target: {gpTarget}%</span>
                  <span>{gpMet ? '\u2713 On track' : `${gpGap.toFixed(1)}% below target`}</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Phase 51-03 (UX-S3-03): per-line seasonality override editor.
          Inline conditional render \u2014 matches showAddRevenue / showAddVendor
          pattern (no portal). Resolves the edited line by id, then dispatches
          to updateRevenueLine or updateCOGSLine on save / reset. */}
      {showSeasonalityFor && (() => {
        const revLine = revenueLines.find(l => l.id === showSeasonalityFor);
        const cogsLine = cogsLines.find(l => l.id === showSeasonalityFor);
        const targetLine = revLine ?? cogsLine;
        if (!targetLine) {
          // Stale id (e.g., line was removed). Clear and bail.
          setShowSeasonalityFor(null);
          return null;
        }
        const isRevenue = !!revLine;
        // Pre-populate with the line's effective seasonality (override \u2192 business \u2192 8.33).
        const initialPattern = getEffectiveSeasonality(targetLine, priorYear?.seasonalityPattern);
        return (
          <SeasonalityEditorModal
            lineName={targetLine.name}
            initialPattern={initialPattern}
            monthLabels={months}
            onSave={(pattern) => {
              if (isRevenue) {
                actions.updateRevenueLine(targetLine.id, { seasonalityPattern: pattern });
              } else {
                actions.updateCOGSLine(targetLine.id, { seasonalityPattern: pattern });
              }
              setShowSeasonalityFor(null);
            }}
            onReset={() => {
              if (isRevenue) {
                actions.updateRevenueLine(targetLine.id, { seasonalityPattern: undefined });
              } else {
                actions.updateCOGSLine(targetLine.id, { seasonalityPattern: undefined });
              }
              setShowSeasonalityFor(null);
            }}
            onCancel={() => setShowSeasonalityFor(null)}
          />
        );
      })()}
    </div>
  );
}
