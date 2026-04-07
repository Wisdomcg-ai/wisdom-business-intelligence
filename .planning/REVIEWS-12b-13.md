---
phases: [12b, 13]
reviewer: Claude (independent agent session)
reviewed_at: 2026-04-07T13:45:00Z
---

# Pre-Deploy Code Review — Phase 12b + Phase 13

## Summary

These two phases introduce an AI-powered forecast insights endpoint with Anthropic/OpenAI fallback, and a central fiscal year utility module that replaces hardcoded Jul-Jun assumptions across 15+ files. The AI endpoint is well-structured with auth, rate limiting, and prompt injection detection. The fiscal year utility is mathematically sound and cleanly designed. However, there are significant concerns: a critical semantic mismatch between two coexisting month-key generators, the prompt injection detector logs but never blocks malicious requests, and the DB column `fiscal_year_start` is never actually read from the database at runtime (everything still falls back to `DEFAULT_YEAR_START_MONTH = 7`). The AI work is solid for an initial release but the fiscal year refactor is foundation plumbing — configurable year types are not yet functional for end users.

## Strengths

- Well-layered AI endpoint: Auth, per-user rate limiting, prompt injection detection, Anthropic-primary with OpenAI fallback, JSON extraction from markdown fences
- Clean fiscal year math: Well-documented with JSDoc examples for both CY and AU FY. Modular arithmetic is correct. Quarter logic generalises properly.
- Graceful AI degradation: Step2 falls back to placeholder insights. Step8 narrative and scenario catch errors silently. User never sees broken state from AI outage.
- Backward-compatible defaults: All functions default yearStartMonth to 7 (AU FY). Existing import paths preserved via re-export facade.
- DB migration is safe: `ADD COLUMN IF NOT EXISTS` with DEFAULT 7 and CHECK constraint is non-destructive and backfills correctly.
- Rate limiting appropriately scoped: 30 AI requests/hour/user prevents cost blowout.

## Concerns

- **HIGH — Prompt injection detected but not blocked**: `detectPromptInjection` only logs. Malicious strings in business names or line items go through to LLM.
- **HIGH — Two competing month-key generators**: `types.ts:generateMonthKeys(fiscalYearStart)` takes calendar year, `fiscal-year-utils.ts:generateFiscalMonthKeys(fiscalYear)` takes fiscal year number. Produces same keys for AU FY by coincidence, but diverges for CY.
- **HIGH — Fiscal year config never propagated from DB**: Migration adds column but no component reads it. Everything uses DEFAULT_YEAR_START_MONTH. CY support not functional.
- **MEDIUM — Hardcoded month labels remain in Step3RevenueCOGS.tsx line 21**
- **MEDIUM — Step 8 fires two independent AI calls on mount**: 2 of 30/hour rate limit per wizard load.
- **MEDIUM — sanitizeAIInput imported but never called**: User-supplied fields go into prompts unsanitized.
- **LOW — In-memory rate limiter doesn't survive serverless cold starts**
- **LOW — require() for AI SDKs suppresses TypeScript checking**
- **LOW — AI endpoint reflects user input in 400 error**

## Suggestions

- Block or sanitize on injection detection (return 400/403 when suspicious, or run sanitizeAIInput on all string fields before building prompts)
- Consolidate to single month-key generator (deprecate types.ts version)
- Add AbortController for AI calls when user navigates away from Step 8
- Consider bundling narrative + scenario into one AI call
- Add unit tests for fiscal-year-utils.ts (CY, AU FY, UK FY=Apr, leap years)
- Wire fiscal_year_start from DB to runtime, or document as "schema only" phase
- Replace hardcoded months array in Step3RevenueCOGS.tsx

## Risk Assessment

**MEDIUM** — AI endpoint is well-defended and fails gracefully. Fiscal year utilities are mathematically correct and backward-compatible for AU FY. However, structural debt exists: competing month-key generators, injection detection that logs but doesn't block, and fiscal year config not read from DB. None are data-loss risks for existing AU FY users — they are latent bugs that surface when CY is activated or when an attacker probes the AI endpoint.
