'use client';

import { WorkshopStep, STEP_LABELS, PART_LABELS } from '../types';
import { Clock, HelpCircle } from 'lucide-react';

interface StepHeaderProps {
  step: WorkshopStep;
  subtitle?: string;
  estimatedTime?: number; // in minutes
  tip?: string;
}

export function StepHeader({ step, subtitle, estimatedTime, tip }: StepHeaderProps) {
  const part = step.split('.')[0];
  const partLabel = PART_LABELS[part] || 'Pre-Work';
  const stepLabel = STEP_LABELS[step];

  return (
    <div className="mb-8">
      {/* Part Badge */}
      {part && PART_LABELS[part] && (
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium mb-3">
          <span>Part {part}</span>
          <span className="text-blue-400">•</span>
          <span>{partLabel}</span>
        </div>
      )}

      {/* Step Title */}
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
        {stepLabel}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-gray-600 text-lg mb-4">{subtitle}</p>
      )}

      {/* Meta Info */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        {estimatedTime && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>~{estimatedTime} min</span>
          </div>
        )}
        {tip && (
          <div className="flex items-center gap-1.5 bg-slate-50 text-slate-600 px-3 py-1 rounded-lg">
            <HelpCircle className="w-4 h-4" />
            <span>{tip}</span>
          </div>
        )}
      </div>
    </div>
  );
}
