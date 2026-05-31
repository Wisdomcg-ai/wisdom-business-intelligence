/**
 * Phase 71 Plan 09 — S6 multi-tenant non-AUD redirect toast.
 *
 * Covers two pure helpers exported from
 *   src/app/finances/monthly-report/utils/multi-currency-toast.ts
 *
 * Background:
 *   Phase 67 added a silent tab-redirect when a multi-currency business
 *   lands on a non-consolidated tab (page.tsx:116-163). For IICT-HK
 *   (HKD + AUD entities) the tab silently switches mid-session with no
 *   explanation. S6's contract is a one-time per-session toast keyed by
 *   business_id via localStorage:
 *
 *     `monthly-report:s6-toast-shown:{businessId}`
 *
 * Why extract to a pure helper instead of rendering the full page:
 *   - page.tsx pulls in 30+ heavyweight imports (Xero hooks, Recharts,
 *     pdf generators) that exhaust memory in vitest jsdom.
 *   - The toast decision is a pure 3-input function — businessId,
 *     isMultiCurrency boolean, storage adapter. Testing the pure helper
 *     locks the contract that page.tsx wires.
 *
 * RED expectations on HEAD: helpers do not yet exist, so all 6 fail at
 *   import. Task 2 creates the helpers + wires into page.tsx → GREEN.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowMultiCurrencyToast,
  buildMultiCurrencyToastMessage,
} from '@/app/finances/monthly-report/utils/multi-currency-toast';

// ─── In-memory storage that satisfies the minimal subset of Storage we use.
function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string): void => {
      store.set(k, v);
    },
    // Mirror, for tests that want to inspect.
    _store: store,
    // Spy hook — overwritten in tests that need to assert call args.
    setItemSpy: undefined as undefined | ((k: string, v: string) => void),
  };
}

describe('shouldShowMultiCurrencyToast — S6 redirect toast gating', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('Test 1: returns true on first call when isMultiCurrency=true and storage is empty', () => {
    const result = shouldShowMultiCurrencyToast('biz-iict', true, storage);
    expect(result).toBe(true);
  });

  it('Test 2: returns false on second call for same business (session-scoped gate)', () => {
    const first = shouldShowMultiCurrencyToast('biz-iict', true, storage);
    expect(first).toBe(true);
    const second = shouldShowMultiCurrencyToast('biz-iict', true, storage);
    expect(second).toBe(false);
  });

  it('Test 3: returns false when isMultiCurrency=false regardless of storage state', () => {
    // Even with a clean storage, false isMultiCurrency = no toast.
    expect(shouldShowMultiCurrencyToast('biz-iict', false, storage)).toBe(false);
    // And with storage primed for a different business, still no toast.
    storage.setItem('monthly-report:s6-toast-shown:biz-other', '1');
    expect(shouldShowMultiCurrencyToast('biz-iict', false, storage)).toBe(false);
  });

  it('Test 4: different businessId fires its own toast (per-business gating)', () => {
    expect(shouldShowMultiCurrencyToast('biz-iict', true, storage)).toBe(true);
    // biz-iict is now stored. biz-jds is independent.
    expect(shouldShowMultiCurrencyToast('biz-jds', true, storage)).toBe(true);
    // ...and re-firing biz-iict still gates.
    expect(shouldShowMultiCurrencyToast('biz-iict', true, storage)).toBe(false);
  });

  it('Test 5: setItem is called with key starting with monthly-report:s6-toast-shown:', () => {
    const setItemCalls: Array<[string, string]> = [];
    const trackingStorage = {
      getItem: (_k: string): string | null => null,
      setItem: (k: string, v: string): void => {
        setItemCalls.push([k, v]);
      },
    };
    const result = shouldShowMultiCurrencyToast('biz-iict', true, trackingStorage);
    expect(result).toBe(true);
    expect(setItemCalls.length).toBe(1);
    expect(setItemCalls[0][0]).toMatch(/^monthly-report:s6-toast-shown:/);
    expect(setItemCalls[0][0]).toBe('monthly-report:s6-toast-shown:biz-iict');
  });
});

describe('buildMultiCurrencyToastMessage — exact text contract', () => {
  it('Test 6a: 2 currencies (HKD + AUD) produces exact S6 spec string', () => {
    // Spec: "Switched to consolidated view — this client has multiple currencies (HKD + AUD)"
    // Note: em-dash (—), sorted alphabetically (AUD before HKD).
    expect(buildMultiCurrencyToastMessage(['HKD', 'AUD'])).toBe(
      'Switched to consolidated view — this client has multiple currencies (AUD + HKD)',
    );
  });

  it('Test 6b: 3 currencies sort alphabetically and use " + " separator', () => {
    expect(buildMultiCurrencyToastMessage(['NZD', 'AUD', 'HKD'])).toBe(
      'Switched to consolidated view — this client has multiple currencies (AUD + HKD + NZD)',
    );
  });

  it('Test 6c: lowercase input is normalized to uppercase and deduped', () => {
    expect(buildMultiCurrencyToastMessage(['aud', 'AUD', 'hkd'])).toBe(
      'Switched to consolidated view — this client has multiple currencies (AUD + HKD)',
    );
  });
});
