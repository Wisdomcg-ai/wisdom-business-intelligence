'use client';

import type { QuarterlyReview, ActionReplay, FeedbackLoop, FeedbackLoopMode } from '../../types';
import { ActionReplayStep } from './ActionReplayStep';
import { FeedbackLoopStep } from './FeedbackLoopStep';
import { StepTabs } from './StepTabs';

/**
 * Quarterly Review v2 — Retro (merge of old 1.4 Action Replay + 2.1 Feedback Loop).
 *
 * One honest behavioural retro instead of two overlapping ones. Composes the two
 * existing (tested) components as tabs for now; the simplified single-surface
 * "Keep / Stop or change / Planned but didn't do" rebuild is a later increment.
 */
interface RetroStepProps {
  review: QuarterlyReview;
  onUpdateActionReplay: (data: ActionReplay) => void;
  onUpdateFeedbackLoop: (data: FeedbackLoop) => void;
  onUpdateFeedbackLoopMode: (mode: FeedbackLoopMode) => void;
}

export function RetroStep({
  review,
  onUpdateActionReplay,
  onUpdateFeedbackLoop,
  onUpdateFeedbackLoopMode,
}: RetroStepProps) {
  return (
    <StepTabs
      tabs={[
        {
          id: 'replay',
          label: "What's working / what to change",
          content: <ActionReplayStep review={review} onUpdate={onUpdateActionReplay} />,
        },
        {
          id: 'feedback',
          label: 'Start / Stop / Continue',
          content: (
            <FeedbackLoopStep
              review={review}
              onUpdate={onUpdateFeedbackLoop}
              onUpdateMode={onUpdateFeedbackLoopMode}
            />
          ),
        },
      ]}
    />
  );
}
