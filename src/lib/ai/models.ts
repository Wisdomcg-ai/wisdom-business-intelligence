/**
 * Single source of truth for the AI model ids used across the app's AI routes.
 *
 * WHY THIS EXISTS: a hard-coded Anthropic model id silently went RETIRED
 * (`claude-sonnet-4-20250514` → 404 not_found on the prod key), and because the
 * routes fall back to OpenAI it went unnoticed until a coach hit the one route
 * without a fallback. Centralising the ids here means (a) a model swap is a
 * one-line change, and (b) the daily health-check (`checkAnthropicModels`) pings
 * EXACTLY the models production uses — so a retired/inaccessible model is caught
 * before a user does.
 *
 * Keep every AI route's model id referencing this file. Current model ids as of
 * 2026-06 — bump here when Anthropic/OpenAI roll versions.
 */
export const AI_MODELS = {
  anthropic: {
    /**
     * rock-breakdown: Sonnet 4.6 — right tier for a quick best-effort draft, and
     * API-reachable on the prod key. (Opus 4.8 showed in the Console workbench but
     * 404'd on the API key repeatedly — Opus is gated separately from the
     * workbench, so it fell back to GPT-4o every time.)
     */
    rockBreakdown: 'claude-sonnet-4-6',
    /** forecast-assistant: current Sonnet (was retired claude-sonnet-4-20250514). */
    forecastAssistant: 'claude-sonnet-4-6',
    /** forecast-insights: current Haiku 4.5 — fast + cheap for structured output. */
    forecastInsights: 'claude-haiku-4-5-20251001',
  },
  openai: {
    rockBreakdown: 'gpt-4o',
    forecastAssistant: 'gpt-4',
    forecastInsights: 'gpt-4o-mini',
  },
} as const

/**
 * The distinct Anthropic model ids the app depends on — exactly what the daily
 * health-check pings against the prod key. Derived from AI_MODELS so it can
 * never drift from what the routes actually call.
 */
export const ANTHROPIC_MODELS_IN_USE: readonly string[] = Array.from(
  new Set(Object.values(AI_MODELS.anthropic)),
)
