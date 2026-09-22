/**
 * Phase 1 — the local draft must belong to the forecast being opened.
 *
 * The draft slot is keyed by business + fiscal year only, so every scenario for
 * a business shares ONE slot. Opening an existing forecast skips the full API
 * init whenever a usable draft is present (ForecastWizardV4.tsx), so the draft's
 * lines were shown under the newly-opened forecast's name and then autosaved
 * onto it: edit Best Case, open Base Case, and Base Case silently became Best
 * Case. These tests pin the guard that stops it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadStateFromStorage } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'

const BIZ = 'biz-1'
const FY = 2026
const KEY = `forecast-wizard-v4-${BIZ}-${FY}`

/** A draft with enough shape to pass the structural checks. */
function writeDraft(forecastId: string | null | undefined, extra: Record<string, unknown> = {}) {
  const draft: Record<string, unknown> = {
    businessId: BIZ,
    fiscalYearStart: FY,
    revenueLines: [{ id: 'r1', name: 'Sales', year1Monthly: { '2026-07': 100_000 } }],
    opexLines: [],
    teamMembers: [],
    priorYear: null,
    ...extra,
  }
  // `undefined` must be genuinely absent, not serialised — it stands for a draft
  // written before the guard existed.
  if (forecastId !== undefined) draft.forecastId = forecastId
  localStorage.setItem(KEY, JSON.stringify(draft))
}

beforeEach(() => {
  localStorage.clear()
})

describe('a draft belonging to another forecast is discarded', () => {
  it('does not hydrate forecast B with forecast A\'s draft', () => {
    writeDraft('forecast-A')
    expect(loadStateFromStorage(BIZ, FY, 'forecast-B')).toBeNull()
  })

  it('restores the draft when it belongs to the forecast being opened', () => {
    writeDraft('forecast-A')
    const loaded = loadStateFromStorage(BIZ, FY, 'forecast-A')
    expect(loaded).not.toBeNull()
    expect(loaded!.revenueLines[0].name).toBe('Sales')
  })

  it('does not leak a saved forecast\'s draft into a brand-new forecast', () => {
    writeDraft('forecast-A')
    expect(loadStateFromStorage(BIZ, FY, null)).toBeNull()
    expect(loadStateFromStorage(BIZ, FY, undefined)).toBeNull()
  })

  it('resumes an unsaved new forecast (no id on either side)', () => {
    writeDraft(null)
    expect(loadStateFromStorage(BIZ, FY, null)).not.toBeNull()
  })
})

describe('drafts written before the guard existed', () => {
  it('are discarded when opening a NAMED forecast — the dangerous case', () => {
    writeDraft(undefined) // no forecastId recorded at all
    expect(loadStateFromStorage(BIZ, FY, 'forecast-A')).toBeNull()
  })

  it('are still usable when no specific forecast was requested', () => {
    writeDraft(undefined)
    expect(loadStateFromStorage(BIZ, FY, null)).not.toBeNull()
  })
})

describe('the guard does not weaken the existing checks', () => {
  it('still rejects a draft whose recorded business does not match its slot', () => {
    // Write a mismatched businessId INTO this business's slot — reading with a
    // different businessId would just miss the key entirely and prove nothing.
    writeDraft('forecast-A', { businessId: 'other-biz' })
    expect(loadStateFromStorage(BIZ, FY, 'forecast-A')).toBeNull()
  })

  it('still rejects a draft from a newer wizard version', () => {
    writeDraft('forecast-A', { wizardVersion: 9_999 })
    expect(loadStateFromStorage(BIZ, FY, 'forecast-A')).toBeNull()
  })
})
