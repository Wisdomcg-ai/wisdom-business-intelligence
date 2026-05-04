'use client';

/**
 * useEditableValue — Phase 51-00 (UX-S3-01 / UX-S3-03 / UX-S5-01 prerequisite)
 *
 * Generalised pending-state pattern for controlled inputs whose displayed
 * value is DERIVED from upstream state (rounded, residual-fixed, etc.).
 * Origin: PR #82 (Step3RevenueCOGS.tsx pendingMixPcts).
 *
 * Why this exists: a controlled input bound directly to a derived value
 * re-renders to a different number than what the user typed mid-edit (the
 * upstream rounding/residual-fix kicks in on every keystroke). We hold the
 * typed string in local pending state until blur / Enter, then commit.
 *
 * Usage:
 *   const editor = useEditableValue(
 *     committedValue,           // canonical value to display when not editing
 *     (n) => actions.update(n), // called on blur/Enter with parsed number
 *   );
 *   <input
 *     value={editor.display}
 *     onChange={editor.onChange}
 *     onBlur={editor.onBlur}
 *     onKeyDown={editor.onKeyDown}
 *   />
 *
 * Will be imported by:
 *   - 51-01 (Step3RevenueCOGS $ entry, replaces pendingMixPcts duplication)
 *   - 51-03 (per-line seasonality editor inputs)
 *   - 51-05 (Step5OpEx $/% toggle pending state)
 *
 * NOT imported by anything in 51-00 itself — this plan ships pure extraction.
 */

import { useState, useCallback } from 'react';

export interface UseEditableValueOptions {
  /**
   * Parse the raw input string into a number on blur. Defaults to parseFloat
   * with NaN→0. Override for integer-only fields, currency parsing, etc.
   */
  parse?: (raw: string) => number;
  /**
   * Format the committed numeric value into the display string when not
   * editing. Defaults to String(value) (with empty string for nullish/NaN).
   * Override for currency formatting, percentage suffix, etc.
   */
  format?: (value: number) => string;
}

export interface UseEditableValueResult {
  /** What to bind to <input value={...}>. Pending edit if any, else committed. */
  display: string;
  /** True while user has typed something not yet committed. */
  isPending: boolean;
  /** onChange handler — captures keystrokes into pending state. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** onBlur handler — parses pending value, calls commit, clears pending. */
  onBlur: () => void;
  /** onKeyDown handler — Enter triggers blur (which commits). */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const defaultParse = (raw: string): number => {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
};

const defaultFormat = (v: number): string => {
  if (v === undefined || v === null || Number.isNaN(v)) return '';
  return String(v);
};

export function useEditableValue(
  committedValue: number,
  commit: (value: number) => void,
  options?: UseEditableValueOptions,
): UseEditableValueResult {
  const parse = options?.parse ?? defaultParse;
  const format = options?.format ?? defaultFormat;

  // null = not editing; string = pending edit (even '' is a valid pending state)
  const [pending, setPending] = useState<string | null>(null);

  const isPending = pending !== null;
  const display = isPending ? (pending as string) : format(committedValue);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPending(e.target.value);
  }, []);

  const onBlur = useCallback(() => {
    if (pending === null) return;
    const parsed = parse(pending);
    commit(parsed);
    setPending(null);
  }, [pending, parse, commit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return { display, isPending, onChange, onBlur, onKeyDown };
}
