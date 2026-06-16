-- Annual Reset (Option B) — badge provenance.
--
-- Records which financial `current` values a year-end reset seeded from the real
-- just-finished-FY Xero actuals (vs the rolled-forward target), so the goals
-- wizard can mark them with an "Actual" pill. The wizard shows the pill while a
-- cell's live value still equals the stored seeded value, so editing the cell
-- self-clears the pill — no write-back needed.
--
-- Nullable + additive: normal wizard saves never touch this column (the upsert
-- lists only the columns it writes), so it persists until the next reset
-- overwrites it. Written ONLY by AnnualResetService.executeAnnualReset.
--
-- Shape:
--   { "fy": 2026,
--     "values": { "revenue": 1110000, "gross_profit": 444000, "net_profit": 111000,
--                 "gross_margin": 40, "net_margin": 10 } }
ALTER TABLE public.business_financial_goals
  ADD COLUMN IF NOT EXISTS current_actuals jsonb;

COMMENT ON COLUMN public.business_financial_goals.current_actuals IS
  'Annual-reset Option B provenance: { fy, values } of the financial *_current values seeded from the just-finished FY Xero actuals. Null when the last reset seeded nothing (or never ran). Display-only — the wizard shows an "Actual" pill while the live value still matches.';
