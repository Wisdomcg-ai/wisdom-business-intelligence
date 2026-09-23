import { getCompletionPercentage } from './constants'

export type VisionMissionModuleStatus = 'completed' | 'in_progress' | 'not_started'

/**
 * Coach-dashboard status for the Vision & Mission module, derived from the
 * strategy_data.vision_mission JSON that /vision-mission writes (keyed by the
 * owner's user_id — its only write path).
 *
 * Uses the page's own completeness rule (getCompletionPercentage: mission +
 * vision + ≥3 core values → 100%). Anything typed but below the thresholds is
 * in_progress; an absent or empty document is not_started. Tolerant of a
 * malformed row — it reads as not_started rather than throwing, so one bad
 * JSON blob cannot take the whole coach dashboard down.
 *
 * History: the route used to select business_profiles.mission / .vision —
 * columns that have never existed — so the profiles query failed outright
 * (WISDOM-BI-T), emptied the profile-id list, and cascaded into every
 * profile-keyed query failing on a '__none__' uuid placeholder (WISDOM-BI-S).
 */
export function visionMissionStatus(vm: unknown): VisionMissionModuleStatus {
  if (!vm || typeof vm !== 'object') return 'not_started'
  const d = vm as Record<string, unknown>
  const mission = typeof d.mission_statement === 'string' ? d.mission_statement : ''
  const vision = typeof d.vision_statement === 'string' ? d.vision_statement : ''
  const values = Array.isArray(d.core_values)
    ? d.core_values.filter((v): v is string => typeof v === 'string')
    : []

  const pct = getCompletionPercentage({
    mission_statement: mission,
    vision_statement: vision,
    core_values: values,
  })
  if (pct >= 100) return 'completed'
  if (pct > 0) return 'in_progress'

  const anyText =
    mission.trim().length > 0 ||
    vision.trim().length > 0 ||
    values.some((v) => v.trim().length > 0)
  return anyText ? 'in_progress' : 'not_started'
}
