# Task 14 — Fix AI narrative stale step labels + content swap

**Ship batch:** B5 (Cleanup) · **Wave:** 6 · **Dependencies:** T05 · **Risk:** LOW

## Goal

Update the AI narrative components (`AICFOPanel.tsx`, `AIAssistant.tsx`) to reflect the new step ordering — both labels AND the actual narrative content. Currently the panel says "Step 5: Operating Expenses" and "Step 8: Final Review" — both wrong post-Phase-57 (and "Step 8: Final Review" was wrong before Phase 57 too — pre-existing bug noted in research).

**Critical:** the narrative TEXT for each step also needs to swap. The paragraph that today references "fixed/variable/ad-hoc OpEx classification" sits on step 5 — that block must MOVE to step 6 in the new ordering. Conversely, the subscription audit narrative moves from step 6 to step 5.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx` (~30 lines — labels + content swap)
  - Line 586: "**Step 5: Operating Expenses**" → "**Step 5: Subscriptions Audit**" (label)
  - Line 586+ paragraph: swap content from OpEx classification language → vendor/SaaS audit language
  - Line 667: "**Step 6: Subscriptions Audit**" → "**Step 6: Operating Expenses**" (label)
  - Line 667+ paragraph: swap content from vendor/SaaS audit → fixed/variable/ad-hoc OpEx classification
  - Line 746: "**Step 7: Capital Expenditure**" — no change (CapEx still step 7)
  - Line 869: "**Step 8: Final Review**" → "**Step 9: Final Review**" (pre-existing bug — review IS step 9)
  - Line 952: `STEP_CONFIG[currentStep]` lookup — verify the config map has correct labels for keys 5 and 6 (swap if it does)
- `src/app/finances/forecast/components/wizard-v4/components/AIAssistant.tsx` (~10 lines)
  - Line 204: `STEP_PROMPTS[currentStep]` lookup — verify prompts for keys 5 and 6 match new step content
  - If the file branches on `currentStep === 5` vs `=== 6`, swap

## Implementation notes

### AICFOPanel narrative — label AND content swap

Read the actual file first — the line numbers in research are approximate. The change is mechanical: find each occurrence of "Step N: Label" and update Label to match the new WIZARD_STEPS ordering, AND swap the paragraph content so step 5 talks about subscriptions and step 6 talks about OpEx.

Example (paraphrased — read the actual file):

Before (line 586):
```typescript
narrative += "**Step 5: Operating Expenses**\n\n" +
  "In this step, you'll classify your operating expenses as fixed, variable, or ad-hoc. " +
  "Fixed costs include rent and insurance; variable costs scale with revenue (like merchant fees); " +
  "ad-hoc covers discretionary spend. Aim to keep total OpEx below 25% of revenue...";
```

Before (line 667):
```typescript
narrative += "**Step 6: Subscriptions Audit**\n\n" +
  "Walk through every recurring software subscription. Confirm each vendor's monthly budget, " +
  "frequency, and account code mapping. This is where SaaS sprawl becomes visible — vendors " +
  "above 1% of revenue deserve scrutiny...";
```

After (line 586, label "Step 5" + subscription content):
```typescript
narrative += "**Step 5: Subscriptions Audit**\n\n" +
  "Walk through every recurring software subscription. Confirm each vendor's monthly budget, " +
  "frequency, and account code mapping. This is where SaaS sprawl becomes visible — vendors " +
  "above 1% of revenue deserve scrutiny. Subscriptions feed the forecast P&L directly and " +
  "appear as a dedicated line in the OpEx Budget on the next step...";
```

After (line 667, label "Step 6" + OpEx content):
```typescript
narrative += "**Step 6: Operating Expenses**\n\n" +
  "In this step, you'll classify your operating expenses as fixed, variable, or ad-hoc. " +
  "Fixed costs include rent and insurance; variable costs scale with revenue (like merchant fees); " +
  "ad-hoc covers discretionary spend. Subscription accounts already covered in Step 5 are marked " +
  "and won't double-count. Aim to keep discretionary OpEx below your Available OpEx ceiling...";
```

The key insight: the WHOLE paragraph (label + body) for the OpEx-classification narrative moves to where step 6's narrative was, and the subscription-audit paragraph moves to where step 5's narrative was. Optionally tweak language to reference the new cross-step flow (subscriptions feeding OpEx ceiling, "covered by Step 5" badge, etc.).

### STEP_CONFIG lookup

If `AICFOPanel.tsx` has something like:
```typescript
const STEP_CONFIG: Record<number, { label: string; ... }> = {
  1: { label: 'Goals' },
  2: { label: 'Prior Year' },
  // ...
  5: { label: 'OpEx' },
  6: { label: 'Subscriptions' },
  // ...
};
```

Swap entries 5 and 6.

### AIAssistant.tsx STEP_PROMPTS

Same pattern. Swap the prompt entries for keys 5 and 6.

### API routes

Per research: `/api/ai/forecast-assistant` and `/api/ai/forecast-insights` may consume step numbers from request bodies. **Verify** these routes don't bake in step numbers. If they do (e.g., a server-side prompt template uses step number to fetch a system prompt), update them.

```bash
grep -rn "currentStep\|step ===" src/app/api/ai/
```

If hits exist, document and update; otherwise no API change needed.

## Acceptance criteria

- [ ] AICFOPanel narrative for step 5 references Subscriptions Audit content
- [ ] AICFOPanel narrative for step 6 references OpEx content
- [ ] AICFOPanel narrative for step 9 (was mis-labeled "Step 8: Final Review") now says "Step 9: Final Review"
- [ ] AIAssistant prompts for currentStep 5 and 6 match new step content
- [ ] Any API routes that branch on currentStep are updated (if they exist)
- [ ] `grep "Step 5:\|Step 6:\|Step 8: Final Review" src/app/finances/forecast/components/` returns zero stale references (label check)
- [ ] **Content swap verified by grep:**
  - `grep -A20 'Step 5' src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx | grep -E 'vendor|subscription|SaaS|recurring' | wc -l` should be > 0 (step 5 narrative talks about subs)
  - `grep -A20 'Step 6' src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx | grep -E 'fixed|variable|ad.hoc|discretionary' | wc -l` should be > 0 (step 6 narrative talks about OpEx classification)
- [ ] **Inverse check (no leftover swap):**
  - `grep -A20 'Step 5' src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx | grep -E 'fixed.*variable|ad.hoc'` should return empty (step 5 should NOT reference OpEx classification anymore)
  - `grep -A20 'Step 6' src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx | grep -E 'SaaS|vendor audit'` should return empty (step 6 should NOT reference subscription auditing anymore)
- [ ] No new tsc errors

## Regression risks

- **AI prompts cached server-side:** if any prompt is cached (Vercel KV, in-memory), the cache returns stale content until invalidated. Worst case: AI references "OpEx" while looking at the Subscriptions step. Mitigation: cache TTL is presumably short; if not, add a cache-bust on Phase 57 deploy.
- **Translated copy:** if these strings are i18n'd, update the i18n keys too. (Verify — Phase 57 codebase may not have i18n.)
- **R9 — deploy window between B3 and B5:** between B3 (step swap live) and B5 (this task), the AI panel will show wrong step labels for that deploy window. Mitigation: deploy B3+B4+B5 together where possible. T14 acceptance criteria explicitly verify content swap (not just label swap) so the cosmetic bug is fully resolved on B5 land.

## Estimated effort

0.4 day (label + content swap + grep verification).
