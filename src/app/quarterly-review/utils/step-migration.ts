import type { WorkshopStep } from '../types';

/**
 * Quarterly Review v2 — step-ID migration.
 *
 * Review DATA lives in named columns (not step-keyed), so this ONLY remaps the
 * `current_step` / `steps_completed` navigation fields of OLD reviews onto the v2
 * 12-step sequence. New reviews never carry these old IDs, so the remap can't
 * corrupt them — and valid v2 IDs are passed through untouched.
 *
 * Dropped/merged in v2:  1.1→prework (Check-in)  ·  2.1→1.4 (Retro)  ·
 *   2.3→2.2 (Open Items)  ·  3.2→3.1 (Strategic Check).
 * Legacy Part-4 consolidation (very old reviews): 4.4/4.5/4.6→4.3.
 * (The prior 4.2→4.1 / 4.3→4.2 entries were removed — they wrongly remapped valid
 *  current reviews sitting at 4.2 / 4.3.)
 */
export const STEP_MIGRATION: Record<string, WorkshopStep> = {
  '1.1': 'prework',
  '2.1': '1.4',
  '2.3': '2.2',
  '3.2': '3.1',
  '4.4': '4.3',
  '4.5': '4.3',
  '4.6': '4.3',
};

export function migrateStep(step: string): WorkshopStep {
  return (STEP_MIGRATION[step] ?? step) as WorkshopStep;
}

export function migrateSteps(steps: string[]): WorkshopStep[] {
  return [...new Set(steps.map(migrateStep))];
}
