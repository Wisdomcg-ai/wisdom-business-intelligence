/**
 * Phase 71-01 (B2) — Vendor normalization single source of truth
 *
 * Locks four invariants:
 *   1. Round-trip: createVendorKey(extractVendorName(...)) is idempotent.
 *   2. createVendorKey collapses whitespace + punctuation + case.
 *   3. Single source of truth: neither monthly-report route inlines its own
 *      createVendorKey (would silently re-introduce the B2 mismatch).
 *   4. extractVendorInfo + createVendorKey align between subscription-detail
 *      and commentary routes (so budget rows key-match extracted Xero vendors).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createVendorKey,
  extractVendorName,
  extractVendorInfo,
} from '@/lib/utils/vendor-normalization';

describe('B2 — vendor-normalization single source of truth', () => {
  it('round-trips vendor_name → vendor_key → extractVendorName → vendor_key idempotently', () => {
    const fixtures = [
      'Stripe Au',
      'STRIPE AU PTY LTD',
      '  stripe  ',
      'Paypal Australia 1043714034893',
    ];

    for (const raw of fixtures) {
      const k1 = createVendorKey(extractVendorName('', raw));
      const k2 = createVendorKey(extractVendorName('', extractVendorName('', raw)));
      expect(k2).toBe(k1);
    }
  });

  it('collapses whitespace + punctuation + case in createVendorKey', () => {
    const a = createVendorKey('Stripe Au');
    const b = createVendorKey('STRIPE AU');
    const c = createVendorKey('  stripe-au  ');
    expect(a).toBe(b);
    expect(b).toBe(c);
    // sanity — collapsed form contains only [a-z0-9]
    expect(a).toMatch(/^[a-z0-9]+$/);
  });

  it('disallows inline createVendorKey duplicates in monthly-report routes', () => {
    const routes = [
      'src/app/api/monthly-report/subscription-detail/route.ts',
      'src/app/api/monthly-report/commentary/route.ts',
      'src/lib/monthly-report/commentary-documents.ts',
    ];
    const inlineDefRegex = /^\s*(function|const)\s+createVendorKey\b/gm;

    for (const relPath of routes) {
      const abs = resolve(process.cwd(), relPath);
      const src = readFileSync(abs, 'utf8');
      const matches = src.match(inlineDefRegex) || [];
      expect(matches, `Inline createVendorKey definition found in ${relPath} — import from src/lib/utils/vendor-normalization.ts instead`).toHaveLength(0);
    }
  });

  it('aligns extractVendorInfo.vendor with extractVendorName for createVendorKey purposes', () => {
    // The commentary route uses extractVendorInfo; subscription-detail uses
    // extractVendorName. Both must hash to the same key so budgeted vendors
    // match extracted Xero vendors.
    const samples = ['Stripe Au', 'STRIPE AU', 'Slack', 'paypal australia'];
    for (const raw of samples) {
      const fromInfo = createVendorKey(extractVendorInfo(raw, '').vendor);
      const fromName = createVendorKey(extractVendorName(raw, ''));
      expect(fromInfo).toBe(fromName);
    }
  });

  it('commentary route uses createVendorKey for map keying (not raw vendor name)', () => {
    // The actual B2 bug: commentary's addToVendor() keyed `vendorData` by the
    // raw `info.vendor` string. subscription-detail keys by `createVendorKey(...)`.
    //
    // The grouping moved out of the route into commentary-documents.ts
    // (summariseVendors) when the supplier lists were restricted to posted
    // documents, so the keying is asserted where it now lives — and the route
    // is asserted to delegate to it rather than grow its own map again.
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/monthly-report/commentary/route.ts'),
      'utf8',
    );
    expect(route).toMatch(/\bsummariseVendors\s*\(/);
    expect(route).not.toMatch(/new Map<string,\s*\{\s*display_name/);

    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/monthly-report/commentary-documents.ts'),
      'utf8',
    );

    // Import line must include createVendorKey
    expect(src).toMatch(/import\s*\{[^}]*\bcreateVendorKey\b[^}]*\}\s*from\s*['"]@\/lib\/utils\/vendor-normalization['"]/);

    // The grouping must wrap the vendor name with createVendorKey before using
    // it as the map key.
    expect(src).toMatch(/\bcreateVendorKey\s*\(\s*txn\.vendor\s*\)/);
  });
});
