### Phase 73: Annual plan reset (full-year reset reusing the goals wizard; data-driven entry off year1_end_date; snapshot before overwrite; zero impact to clients with a current plan)

**Goal:** When a client's plan year has ended, snapshot the ending year's full plan then route them into the EXISTING Goals & Targets wizard (/goals) with the 3-year ladder rolled forward (new Year 1 = new FY, prepopulated from prior Year 2) and plan dates rolled — data-driven off business_financial_goals.year1_end_date so clients already on the new FY (Armstrong, Fit2Shine) are never prompted/affected. Snapshot before any overwrite, fully reversible, zero behaviour change for clients with a current valid plan.
**Requirements**: none mapped (design-locked phase)
**Depends on:** Phase 72
**Plans:** 4/6 plans executed

Plans:
- [x] 73-01-PLAN.md — Annual-reset snapshot service (capture full plan to plan_snapshots before overwrite) + documented restore path [wave 1]
- [x] 73-02-PLAN.md — Rollover action: shift 3-year ladder + plan dates, clear quarterly_targets, carry incomplete initiatives; snapshot-gated [wave 2]
- [x] 73-03-PLAN.md — Data-driven entry detection (3 states incl. already-planned guard) + read-only landing CTA [wave 1]
- [x] 73-04-PLAN.md — /goals rollover mode (?reset=annual triggers gated rollover once, then loads prepopulated) [wave 3, has checkpoint]
- [ ] 73-05-PLAN.md — Retire quarterly-review annual steps + Q4-gated button (keep jsonb columns; don't break getWorkshopSteps) [wave 4]
- [ ] 73-06-PLAN.md — Integration tests (rollover FY+CY, entry 3 states, snapshot round-trip) + full vitest gate [wave 5]

---