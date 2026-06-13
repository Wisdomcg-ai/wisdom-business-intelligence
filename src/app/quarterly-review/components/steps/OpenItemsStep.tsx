'use client';

import type { QuarterlyReview, OpenLoopDecisionRecord, IssueResolution } from '../../types';
import { OpenLoopsStep } from './OpenLoopsStep';
import { IssuesListStep } from './IssuesListStep';
import { StepTabs } from './StepTabs';

/**
 * Quarterly Review v2 — Open Items (merge of old 2.2 Open Loops + 2.3 Issues).
 *
 * Open Loops and Issues are live tools (/open-loops, /issues-list, shared services).
 * Composes the two existing components as tabs for now; the single embedded triage
 * that writes back to the live services + "pick the 2–3 for this quarter" is a later
 * increment (Matt chose embedded write-back, not a read-only link-out).
 */
interface OpenItemsStepProps {
  review: QuarterlyReview;
  onUpdateOpenLoops: (decisions: OpenLoopDecisionRecord[]) => void;
  onUpdateIssues: (issues: IssueResolution[]) => void;
}

export function OpenItemsStep({ review, onUpdateOpenLoops, onUpdateIssues }: OpenItemsStepProps) {
  return (
    <StepTabs
      tabs={[
        {
          id: 'loops',
          label: 'Open Loops',
          content: <OpenLoopsStep review={review} onUpdate={onUpdateOpenLoops} />,
        },
        {
          id: 'issues',
          label: 'Issues',
          content: <IssuesListStep review={review} onUpdate={onUpdateIssues} />,
        },
      ]}
    />
  );
}
