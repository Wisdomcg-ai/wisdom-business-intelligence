-- Drop the temporary debug log table — sync-xero FK bug identified and fixed.
-- See .planning/phases/28-cashflow-calxa-standard/28.0-SUMMARY.md

DROP TABLE IF EXISTS debug_log;
