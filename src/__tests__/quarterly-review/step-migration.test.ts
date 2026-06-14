/**
 * QR v2 step-migration safety — old reviews must remap onto the v2 sequence, and
 * valid v2 IDs must pass through untouched (no corruption of current reviews).
 */
import { describe, it, expect } from 'vitest'
import { migrateStep, migrateSteps } from '@/app/quarterly-review/utils/step-migration'
import { WORKSHOP_STEPS } from '@/app/quarterly-review/types'

describe('migrateStep', () => {
  it('remaps dropped/merged old IDs to their v2 home', () => {
    expect(migrateStep('1.1')).toBe('prework') // Pre-Work Review → Check-in
    expect(migrateStep('2.1')).toBe('1.4') // Feedback Loop → Retro
    expect(migrateStep('2.3')).toBe('2.2') // Issues → Open Items
    expect(migrateStep('3.2')).toBe('3.1') // SWOT → Strategic Check
  })

  it('leaves EVERY valid v2 step ID untouched (current reviews are not corrupted)', () => {
    for (const step of WORKSHOP_STEPS) {
      expect(migrateStep(step)).toBe(step)
    }
  })

  it('does not re-apply the removed buggy 4.2→4.1 / 4.3→4.2 remap', () => {
    expect(migrateStep('4.2')).toBe('4.2')
    expect(migrateStep('4.3')).toBe('4.3')
  })
})

describe('migrateSteps', () => {
  it('remaps + dedups an old 16-step completed review onto the v2 12-step sequence', () => {
    const old16 = [
      'prework', '1.1', '1.2', '1.3', '1.4',
      '2.1', '2.2', '2.3', '2.4', '2.5',
      '3.1', '3.2',
      '4.1', '4.2', '4.3', 'complete',
    ]
    expect(migrateSteps(old16)).toEqual([...WORKSHOP_STEPS])
  })
})
