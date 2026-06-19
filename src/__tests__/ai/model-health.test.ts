import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkAnthropicModels, type AnthropicLike } from '@/lib/ai/model-health'
import { ANTHROPIC_MODELS_IN_USE, AI_MODELS } from '@/lib/ai/models'

const fakeClient = (create: AnthropicLike['messages']['create']): AnthropicLike => ({
  messages: { create },
})

describe('ANTHROPIC_MODELS_IN_USE (config)', () => {
  it('has no duplicate model ids', () => {
    expect(new Set(ANTHROPIC_MODELS_IN_USE).size).toBe(ANTHROPIC_MODELS_IN_USE.length)
  })

  it('covers every Anthropic model the routes use', () => {
    for (const id of Object.values(AI_MODELS.anthropic)) {
      expect(ANTHROPIC_MODELS_IN_USE).toContain(id)
    }
  })

  it('does NOT contain the retired id that broke production', () => {
    expect(ANTHROPIC_MODELS_IN_USE).not.toContain('claude-sonnet-4-20250514')
  })
})

describe('checkAnthropicModels', () => {
  const OLD_KEY = process.env.ANTHROPIC_API_KEY
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })
  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = OLD_KEY
  })

  it('skips (no call) when there is no ANTHROPIC_API_KEY and no client', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await checkAnthropicModels()
    expect(r.skipped).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('reports ok when every model responds, pinging each exactly once', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] })
    const r = await checkAnthropicModels(fakeClient(create))
    expect(r.skipped).toBe(false)
    expect(r.ok).toBe(true)
    expect(r.failures).toHaveLength(0)
    expect(r.results).toHaveLength(ANTHROPIC_MODELS_IN_USE.length)
    expect(create).toHaveBeenCalledTimes(ANTHROPIC_MODELS_IN_USE.length)
  })

  it('captures a 404/not-found as a failure with the model id + error (the exact bug)', async () => {
    const broken = ANTHROPIC_MODELS_IN_USE[0]
    const create = vi.fn().mockImplementation(({ model }: { model: string }) => {
      if (model === broken) {
        const e = new Error(`404 {"type":"not_found_error","message":"model: ${model}"}`)
        e.name = 'NotFoundError'
        return Promise.reject(e)
      }
      return Promise.resolve({ content: [] })
    })
    const r = await checkAnthropicModels(fakeClient(create))
    expect(r.ok).toBe(false)
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0].model).toBe(broken)
    expect(r.failures[0].error).toContain('NotFoundError')
    expect(r.failures[0].error).toContain('not_found_error')
  })

  it('uses max_tokens:1 for a cheap ping', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] })
    await checkAnthropicModels(fakeClient(create))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1 }))
  })
})
