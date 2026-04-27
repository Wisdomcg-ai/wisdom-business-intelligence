/**
 * Phase 44 — Wave 0 scaffold (created by plan 44-01).
 * All tests are it.todo until plan 44-03 implements the parser
 * (covers D-05, D-09, D-16, D-17 per 44-VALIDATION.md).
 * See .planning/phases/44-forecast-pipeline-fix/44-VALIDATION.md for the
 * decision-to-test map.
 */
import { describe, it, expect, vi } from 'vitest'
import envisageFY26 from './fixtures/envisage-fy26.json'
import jdsFY26 from './fixtures/jds-fy26.json'

describe('PL-by-Month Parser', () => {
  it.todo('returns 12 monthly columns')
  it.todo('sparse tenant')
  it.todo('envisage')
  it.todo('jds')
})

// Reference suppression so the imports survive lint passes before plan 44-03
// fills the bodies in.
void envisageFY26
void jdsFY26
void expect
void vi
