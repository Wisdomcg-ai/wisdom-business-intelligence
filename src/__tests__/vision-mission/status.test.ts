/**
 * visionMissionStatus — the coach-dashboard reading of strategy_data.vision_mission.
 * Shares the /vision-mission page's own completeness rule so the coach sees the
 * same "done" the client sees.
 */
import { describe, it, expect } from 'vitest'
import { visionMissionStatus } from '@/lib/vision-mission/status'

const mission = 'We exist to help family businesses become calm, profitable and worth owning.'
const vision = 'By 2030 every client business runs on a plan its owner understands, with a team that runs the week.'
const values = ['Integrity', 'Curiosity', 'Care']

describe('visionMissionStatus', () => {
  it('no document → not_started', () => {
    expect(visionMissionStatus(undefined)).toBe('not_started')
    expect(visionMissionStatus(null)).toBe('not_started')
    expect(visionMissionStatus('text')).toBe('not_started')
    expect(visionMissionStatus({})).toBe('not_started')
    expect(visionMissionStatus({ mission_statement: '', vision_statement: '  ', core_values: [] })).toBe('not_started')
  })

  it('mission + vision + ≥3 values → completed (the page rule)', () => {
    expect(
      visionMissionStatus({ mission_statement: mission, vision_statement: vision, core_values: values }),
    ).toBe('completed')
  })

  it('partially filled → in_progress', () => {
    expect(visionMissionStatus({ mission_statement: mission, vision_statement: '', core_values: [] })).toBe('in_progress')
    expect(visionMissionStatus({ mission_statement: '', vision_statement: '', core_values: values })).toBe('in_progress')
    // Typed, but below the page's minimums: started, not done.
    expect(visionMissionStatus({ mission_statement: 'Help.', vision_statement: '', core_values: [''] })).toBe('in_progress')
    // Only two values → the values leg is incomplete.
    expect(
      visionMissionStatus({ mission_statement: mission, vision_statement: vision, core_values: ['A', 'B'] }),
    ).toBe('in_progress')
  })

  it('malformed row reads as not_started and never throws', () => {
    expect(visionMissionStatus({ mission_statement: 42, vision_statement: null, core_values: 'oops' })).toBe('not_started')
    expect(visionMissionStatus({ core_values: [1, null, ''] })).toBe('not_started')
    expect(visionMissionStatus([])).toBe('not_started')
  })
})
