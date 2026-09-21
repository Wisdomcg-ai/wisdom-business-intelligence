'use client';

import { useEffect, useState } from 'react';

/**
 * Parse a typed money amount. Accepts "$120,000", "120000", "-15,000" and the
 * accountant's "(15,000)" for a loss — the shared parseDollarInput turns the
 * last into NaN, and net profit is the line most likely to be a loss.
 * Anything unreadable is null, not 0, so a half-typed value is never saved as $0.
 */
export function parseMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '$') return null;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const digits = trimmed.replace(/[()$,\s-]/g, '');
  if (digits === '' || !/^\d+(\.\d+)?$/.test(digits)) return null;
  const n = Math.round(Number(digits));
  return negative ? -n : n;
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const abs = '$' + Math.abs(n).toLocaleString('en-AU');
  return n < 0 ? `-${abs}` : abs;
}

interface MoneyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  hint?: string;
  id: string;
  /** Hide the label visually (still read by screen readers) — for table cells
   *  whose row and column headers already say what the box is. */
  hideLabel?: boolean;
}

/**
 * A money field that shows "$120,000" at rest and lets you type freely. It only
 * reports a value it can read, so a stray keystroke never becomes a saved $0.
 */
export function MoneyInput({ value, onChange, label, hint, id, hideLabel = false }: MoneyInputProps) {
  const [text, setText] = useState(formatMoney(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (e.g. a re-seed) only while the field isn't being edited.
  useEffect(() => {
    if (!focused) setText(formatMoney(value));
  }, [value, focused]);

  return (
    <div>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block text-sm font-medium text-gray-700 mb-1'}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="$0"
        onFocus={() => setFocused(true)}
        onChange={e => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          setText(formatMoney(parseMoney(text)));
        }}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-right font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
