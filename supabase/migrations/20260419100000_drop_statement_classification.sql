-- Phase 28.4 rollback: remove AASB 107 Cashflow Statement infrastructure
--
-- Decision: the AASB 107 Cashflow Statement view we built in 28.4 was overkill.
-- Xero already produces this report natively — we shouldn't replicate it.
-- The coach can read the forecast cashflow table directly to explain movements
-- to the client (that IS the coaching moment).
--
-- Phase 29 ("Where Did Our Money Go?") was also removed as redundant with the
-- existing cashflow breakdown.
--
-- Dropping the classification table to keep the schema clean.

DROP TABLE IF EXISTS cashflow_statement_classification;
