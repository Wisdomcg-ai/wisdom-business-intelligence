'use client';

import React, { useState, useEffect, memo } from 'react';

/**
 * Numeric cell that commits on blur/Enter — the wizard's ONE way to edit a
 * number in a grid.
 *
 * Replaces the remount-as-sync hack that existed in three step files: an
 * uncontrolled input whose React key embedded the value being edited
 * (`key={`x-${id}-${value}`}`), so every commit destroyed the DOM node and
 * mounted a fresh one. Two user-facing defects came with it, fixed here once:
 *
 *  - Enter ran `.blur()`, focus fell to <body>, and the remount destroyed the
 *    node the operator was in — the next Tab restarted from the top of the
 *    page. Enter now commits and KEEPS focus (value re-selected, ready to
 *    retype); Escape reverts.
 *  - Clearing a field committed a hard 0 via `parseFloat('') || 0` — silent
 *    zeroing on a CFO-accuracy product. Empty now reverts to the canonical
 *    value; typing 0 explicitly still zeroes.
 *
 * Mechanics (same local-draft pattern as Step4Team's CurrencyInput and
 * Step 5's VendorBudgetInput): controlled on a LOCAL string while focused,
 * re-synced from the prop only when NOT focused — so typing is never
 * reformatted mid-keystroke — parsed once on commit.
 *
 * `type="text"` + `inputMode="decimal"`, never `type="number"`: number inputs
 * carry spinners, so a stray scroll or arrow key silently changes a value the
 * operator is not even looking at. inputMode keeps the numeric keyboard on
 * touch devices.
 */
export interface CommitNumberInputProps {
  /** Canonical value from state. null/undefined/0 render as empty when
   *  `zeroAsEmpty` (grid cells use placeholder="0" instead of a literal 0). */
  value: number | null | undefined;
  /** Called once with the parsed value on blur/Enter. Never called for empty
   *  or unparseable input — those revert. */
  onCommit: (parsed: number) => void;
  /** Render 0 as an empty field (default true — grid-cell convention). */
  zeroAsEmpty?: boolean;
  /** Round the displayed value to whole dollars (default true). Typed decimals
   *  are always preserved through parsing either way. */
  displayWhole?: boolean;
  /** Allow negative commits (default false: negatives revert). */
  allowNegative?: boolean;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  'data-testid'?: string;
}

export const CommitNumberInput = memo(function CommitNumberInput({
  value,
  onCommit,
  zeroAsEmpty = true,
  displayWhole = true,
  allowNegative = false,
  disabled,
  placeholder,
  title,
  className,
  'data-testid': dataTestId,
}: CommitNumberInputProps) {
  const format = (v: number | null | undefined): string => {
    if (v == null || (zeroAsEmpty && v === 0)) return '';
    const n = displayWhole ? Math.round(v) : v;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  const [localValue, setLocalValue] = useState(() => format(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setLocalValue(format(value));
    // format is stable per props; re-running on value/focus is the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused, zeroAsEmpty, displayWhole]);

  const commit = (): boolean => {
    const trimmed = localValue.trim();
    if (trimmed === '') {
      // Empty is "never mind", not "0".
      setLocalValue(format(value));
      return false;
    }
    const parsed = parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) {
      setLocalValue(format(value));
      return false;
    }
    onCommit(parsed);
    setLocalValue(format(parsed));
    return true;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      data-testid={dataTestId}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onBlur={() => {
        setIsFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.select();
        }
        if (e.key === 'Escape') {
          setLocalValue(format(value));
          e.currentTarget.select();
        }
        // Belt-and-braces: type="text" has no spinner, but some browsers still
        // scrub number-ish fields with arrows in autofill flows.
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
      }}
      className={className}
    />
  );
});
