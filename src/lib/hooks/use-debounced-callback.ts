/**
 * useDebouncedCallback — shared 500ms / configurable debounce hook.
 *
 * Lifted to `src/lib/hooks` during Phase 42 (Plan 42-00) so the monthly-report
 * auto-save flow and the forecast wizard share a single, audited implementation.
 *
 * Phase 42 — Pitfall 1 (paid down here, once):
 *   The original in-tree copy at
 *   `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:23-42`
 *   cleared its pending timer on every new call, but NEVER on unmount. Result:
 *   if the host component unmounted within `delay` ms of the last call, the
 *   timer fired against an unmounted tree, producing the React warning
 *   "Can't perform a React state update on an unmounted component" and a
 *   potential save-with-stale-data hazard.
 *
 *   This implementation adds an unmount-cleanup effect that calls
 *   clearTimeout on the in-flight ref, eliminating the regression.
 *
 * Behaviour preserved verbatim from the original:
 *   - latest-wins: a second call within `delay` cancels the first
 *   - setState-friendly: callback ref is updated on every render so closures
 *     in the deferred call always see the latest values
 *   - identity-stable: the returned function is stable across renders (only
 *     `delay` is in the useCallback deps), so it can be safely used in
 *     useEffect dependency arrays without retriggering
 *
 * @see .planning/phases/42-monthly-report-save-flow-consolidation/42-RESEARCH.md
 *      — Pitfall 1, Code Examples
 */
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Pitfall 1: clear pending timer on unmount so the deferred callback
  // does not fire against an unmounted React tree.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay],
  );
}
