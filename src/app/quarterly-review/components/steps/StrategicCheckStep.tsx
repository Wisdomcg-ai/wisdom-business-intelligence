'use client';

import type { QuarterlyReview, AssessmentSnapshot, RoadmapSnapshot } from '../../types';
import { AssessmentRoadmapStep } from './AssessmentRoadmapStep';
import { SwotUpdateStep } from './SwotUpdateStep';
import { StepTabs } from './StepTabs';

/**
 * Quarterly Review v2 — Strategic Check (merge of old 3.1 Assessment & Roadmap + 3.2 SWOT).
 *
 * One strategic zoom-out before planning: score & stage, then SWOT. Composes the two
 * existing components as tabs; the "capture the one focus engine" + traffic-light/delta
 * + SWOT comparison fixes are a later increment.
 */
interface StrategicCheckStepProps {
  review: QuarterlyReview;
  onUpdateAssessment: (snapshot: AssessmentSnapshot) => void;
  onUpdateRoadmap: (snapshot: RoadmapSnapshot) => void;
  onUpdateSwot: (id: string | null) => void;
}

export function StrategicCheckStep({
  review,
  onUpdateAssessment,
  onUpdateRoadmap,
  onUpdateSwot,
}: StrategicCheckStepProps) {
  return (
    <StepTabs
      tabs={[
        {
          id: 'score',
          label: 'Score & Stage',
          content: (
            <AssessmentRoadmapStep
              review={review}
              onUpdateAssessment={onUpdateAssessment}
              onUpdateRoadmap={onUpdateRoadmap}
            />
          ),
        },
        {
          id: 'swot',
          label: 'SWOT',
          content: <SwotUpdateStep review={review} onUpdate={onUpdateSwot} />,
        },
      ]}
    />
  );
}
