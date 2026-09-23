/**
 * D8 (22 Sep 2026 system diagnostic) — the goals autosave dropped a whole
 * column of initiatives and reported success.
 *
 * Step 4 shows a "Current FY remainder" pseudo-quarter during planning season,
 * and the hook sends its initiatives as `initiatives.current_remainder`. The
 * save route kept its OWN list of buckets, which never mentioned that key, and
 * its loop skips a bucket it does not recognise — silently. Production holds
 * zero rows of `step_type = 'current_remainder'` across 14 businesses, while
 * every other bucket has rows.
 *
 * One list now serves both sides. These tests fence the gap that made the two
 * drift: a bucket the client sends that the server does not know about.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { INITIATIVE_BUCKETS, INITIATIVE_BUCKET_KEYS } from '@/app/goals/initiative-buckets'

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf-8')

/** The keys inside the hook's `initiatives: { … }` payload literal. */
function payloadBucketKeys(hookSource: string): string[] {
  const start = hookSource.indexOf('initiatives: {')
  expect(start, 'the hook still sends an `initiatives` payload').toBeGreaterThan(-1)

  // Walk to the matching brace so a nested object cannot end the block early.
  let depth = 0
  let end = start
  for (let i = hookSource.indexOf('{', start); i < hookSource.length; i++) {
    if (hookSource[i] === '{') depth++
    else if (hookSource[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  const block = hookSource.slice(start, end)

  // Drop comments so a key named in prose is not mistaken for one that is sent.
  const code = block
    .split('\n')
    .filter(l => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

  const keys = new Set<string>()
  // `q1: …` anywhere, including inside a conditional spread's object literal.
  // A property access (`annualPlanByQuarter.current_remainder`) has no colon,
  // and a ternary's `:` follows `}` or `)`, never a word character.
  for (const m of code.matchAll(/(?:^|[{,\s])(\w+)\s*:/gm)) {
    if (m[1] !== 'initiatives') keys.add(m[1])
  }
  // Shorthand — `strategicIdeas,` on its own line.
  for (const line of code.split('\n')) {
    const shorthand = line.trim().match(/^(\w+)\s*,?$/)
    if (shorthand) keys.add(shorthand[1])
  }
  return [...keys]
}

describe('D8 — every bucket the goals page sends is a bucket the save route stores', () => {
  it('the shared list carries the planning-season remainder column', () => {
    const remainder = INITIATIVE_BUCKETS.find(b => b.key === 'current_remainder')
    expect(remainder, 'current_remainder must be saved, not skipped').toBeDefined()
    expect(remainder!.stepType).toBe('current_remainder')
  })

  it('the shared list carries every quarter and every step', () => {
    expect(INITIATIVE_BUCKET_KEYS).toEqual(
      expect.arrayContaining([
        'strategicIdeas', 'roadmapSuggestions', 'twelveMonthInitiatives',
        'current_remainder', 'q1', 'q2', 'q3', 'q4', 'sprintFocus',
      ]),
    )
    // Each step_type is stored under its own name — no two buckets share one.
    const stepTypes = INITIATIVE_BUCKETS.map(b => b.stepType)
    expect(new Set(stepTypes).size).toBe(stepTypes.length)
  })

  it('the hook sends nothing the route would skip', () => {
    const hook = read('../../app/goals/hooks/useStrategicPlanning.ts')
    const sent = payloadBucketKeys(hook)

    expect(sent.length, 'payload keys were parsed').toBeGreaterThan(4)
    const unknown = sent.filter(k => !INITIATIVE_BUCKET_KEYS.includes(k))
    expect(unknown, `these buckets are sent but never stored: ${unknown.join(', ')}`).toEqual([])
    expect(sent).toContain('current_remainder')
  })

  it('the route reads the shared list rather than keeping its own', () => {
    const route = read('../../app/api/goals/save/route.ts')
    expect(route).toContain("from '@/app/goals/initiative-buckets'")
    expect(route).toMatch(/INITIATIVE_BUCKETS\.map/)
    // The old hard-coded copy is gone.
    expect(route).not.toMatch(/\{\s*key:\s*'q1',\s*type:\s*'q1'\s*\}/)
  })

  it('the hook only sends the remainder bucket when that column exists', () => {
    // The route deletes whatever a sent bucket omits, so an unconditional
    // `current_remainder: []` would delete a business's stored remainder rows.
    const hook = read('../../app/goals/hooks/useStrategicPlanning.ts')
    expect(hook).not.toMatch(/current_remainder:\s*annualPlanByQuarter\.current_remainder\s*\|\|\s*\[\]/)
    expect(hook).toMatch(/\.\.\.\(annualPlanByQuarter\.current_remainder/)
  })

  it('a delete that fails is reported, not swallowed', () => {
    const route = read('../../app/api/goals/save/route.ts')
    expect(route).toContain('goals_initiative_delete_failed')
  })
})
