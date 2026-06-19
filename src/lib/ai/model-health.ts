import { ANTHROPIC_MODELS_IN_USE } from './models'

export interface ModelCheck {
  model: string
  ok: boolean
  /** Present only on failure — e.g. "NotFoundError: 404 ... not_found_error". */
  error?: string
}

export interface AnthropicModelHealth {
  /** true when every model responded; false on any failure OR when skipped. */
  ok: boolean
  /** true when there is no ANTHROPIC_API_KEY to test against. */
  skipped: boolean
  results: ModelCheck[]
  failures: ModelCheck[]
}

/** Minimal shape of the Anthropic client we depend on — also the test seam. */
export interface AnthropicLike {
  messages: {
    create: (args: {
      model: string
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }) => Promise<unknown>
  }
}

/**
 * Ping every Anthropic model the app uses (ANTHROPIC_MODELS_IN_USE) against the
 * prod key with a minimal 1-token request. A retired or inaccessible model fails
 * fast with a 404 not_found_error — exactly the failure that silently shipped.
 *
 * Pure of side effects (no email/Sentry here) so it stays unit-testable and the
 * caller decides how to alert. Pass `client` in tests; in prod it's constructed
 * lazily from ANTHROPIC_API_KEY so importing this module never builds a client.
 */
export async function checkAnthropicModels(client?: AnthropicLike): Promise<AnthropicModelHealth> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!client && !apiKey) {
    return { ok: false, skipped: true, results: [], failures: [] }
  }

  let anthropic = client
  if (!anthropic) {
    const Anthropic = require('@anthropic-ai/sdk').default
    anthropic = new Anthropic({ apiKey }) as AnthropicLike
  }

  const results: ModelCheck[] = await Promise.all(
    ANTHROPIC_MODELS_IN_USE.map(async (model): Promise<ModelCheck> => {
      try {
        await anthropic!.messages.create({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        })
        return { model, ok: true }
      } catch (e) {
        return {
          model,
          ok: false,
          error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        }
      }
    }),
  )

  const failures = results.filter((r) => !r.ok)
  return { ok: failures.length === 0, skipped: false, results, failures }
}
