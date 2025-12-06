'use client';

import { useState, useMemo } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview } from '../../types';
import {
  Star, Lightbulb, AlertTriangle, BookOpen, Clock, Calendar,
  Battery, Target, ChevronRight, CheckCircle2
} from 'lucide-react';

interface PreWorkStepProps {
  review: QuarterlyReview;
  onUpdate: (data: Partial<QuarterlyReview>) => void;
}

type SectionId = 'reflection' | 'pulse' | 'ahead';

interface Section {
  id: SectionId;
  number: number;
  label: string;
  description: string;
  icon: typeof Star;
  fields: (keyof QuarterlyReview)[];
}

const SECTIONS: Section[] = [
  {
    id: 'reflection',
    number: 1,
    label: 'Last Quarter Reflection',
    description: 'Review your wins, challenges & learnings',
    icon: Star,
    fields: ['last_quarter_rating', 'biggest_win', 'biggest_challenge', 'key_learning']
  },
  {
    id: 'pulse',
    number: 2,
    label: 'Personal Pulse Check',
    description: 'How are you doing personally?',
    icon: Battery,
    fields: ['hours_worked_avg', 'days_off_taken', 'energy_level', 'purpose_alignment']
  },
  {
    id: 'ahead',
    number: 3,
    label: 'Looking Ahead',
    description: 'Set intentions for next quarter',
    icon: Target,
    fields: ['one_thing_for_success', 'coach_support_needed']
  }
];

export function PreWorkStep({ review, onUpdate }: PreWorkStepProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('reflection');

  const handleChange = (field: keyof QuarterlyReview, value: any) => {
    onUpdate({ [field]: value });
  };

  // Calculate completion for each section
  const sectionCompletion = useMemo(() => {
    const completion: Record<SectionId, { completed: number; total: number; percentage: number }> = {
      reflection: { completed: 0, total: 4, percentage: 0 },
      pulse: { completed: 0, total: 4, percentage: 0 },
      ahead: { completed: 0, total: 2, percentage: 0 }
    };

    SECTIONS.forEach(section => {
      const completed = section.fields.filter(field => {
        const value = review[field];
        return value !== null && value !== '' && value !== undefined;
      }).length;
      completion[section.id] = {
        completed,
        total: section.fields.length,
        percentage: Math.round((completed / section.fields.length) * 100)
      };
    });

    return completion;
  }, [review]);

  const totalCompletion = useMemo(() => {
    const allFields = SECTIONS.flatMap(s => s.fields);
    const completed = allFields.filter(field => {
      const value = review[field];
      return value !== null && value !== '' && value !== undefined;
    }).length;
    return Math.round((completed / allFields.length) * 100);
  }, [review]);

  const goToNextSection = () => {
    const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);
    if (currentIndex < SECTIONS.length - 1) {
      setActiveSection(SECTIONS[currentIndex + 1].id);
    }
  };

  const isLastSection = activeSection === 'ahead';
  const currentSectionIndex = SECTIONS.findIndex(s => s.id === activeSection);

  const renderRatingInput = (
    field: keyof QuarterlyReview,
    value: number | null,
    label: string,
    icon: React.ReactNode
  ) => (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        {icon}
        {label}
      </label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
          <button
            key={num}
            onClick={() => handleChange(field, num)}
            className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all ${
              value === num
                ? 'bg-brand-orange text-white shadow-md scale-110'
                : 'bg-gray-100 text-gray-600 hover:bg-brand-orange-50 hover:text-brand-orange-700'
            }`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <StepHeader
        step="prework"
        subtitle="Complete this questionnaire before the review to make the most of your time"
        estimatedTime={15}
      />

      {/* Progress Overview */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 rounded-xl border border-brand-orange-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-bold text-brand-orange-700">{totalCompletion}% complete</span>
        </div>
        <div className="h-2 bg-white rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange rounded-full transition-all duration-500"
            style={{ width: `${totalCompletion}%` }}
          />
        </div>
      </div>

      {/* Section Navigation - Card Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const completion = sectionCompletion[section.id];
          const isComplete = completion.percentage === 100;

          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                isActive
                  ? 'bg-brand-orange-50 border-brand-orange-500 shadow-md'
                  : isComplete
                  ? 'bg-green-50 border-green-300 hover:border-green-400'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {/* Step Number Badge */}
              <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isActive
                  ? 'bg-brand-orange text-white'
                  : isComplete
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {isComplete && !isActive ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  section.number
                )}
              </div>

              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  isActive
                    ? 'bg-brand-orange-100 text-brand-orange-700'
                    : isComplete
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-sm ${
                    isActive ? 'text-brand-navy' : isComplete ? 'text-green-900' : 'text-gray-900'
                  }`}>
                    {section.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {section.description}
                  </p>
                  {/* Mini progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isComplete ? 'bg-green-500' : 'bg-brand-orange-500'
                        }`}
                        style={{ width: `${completion.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {completion.completed}/{completion.total}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          {(() => {
            const section = SECTIONS.find(s => s.id === activeSection)!;
            const Icon = section.icon;
            return (
              <>
                <div className="p-2.5 bg-brand-orange-100 rounded-xl">
                  <Icon className="w-6 h-6 text-brand-orange-700" />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-gray-900">{section.label}</h2>
                  <p className="text-sm text-gray-500">{section.description}</p>
                </div>
              </>
            );
          })()}
        </div>

        {activeSection === 'reflection' && (
          <div className="space-y-8">
            {/* Quarter Rating */}
            {renderRatingInput(
              'last_quarter_rating',
              review.last_quarter_rating,
              'How would you rate last quarter overall? (1 = Poor, 10 = Excellent)',
              <Star className="w-4 h-4 text-amber-500" />
            )}

            {/* Biggest Win */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Lightbulb className="w-4 h-4 text-green-500" />
                What was your biggest win last quarter?
              </label>
              <textarea
                value={review.biggest_win || ''}
                onChange={(e) => handleChange('biggest_win', e.target.value)}
                placeholder="Describe your most significant achievement..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
              />
            </div>

            {/* Biggest Challenge */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                What was your biggest challenge?
              </label>
              <textarea
                value={review.biggest_challenge || ''}
                onChange={(e) => handleChange('biggest_challenge', e.target.value)}
                placeholder="What obstacle or difficulty stood out most?"
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
              />
            </div>

            {/* Key Learning */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <BookOpen className="w-4 h-4 text-brand-navy" />
                What was your key learning?
              </label>
              <textarea
                value={review.key_learning || ''}
                onChange={(e) => handleChange('key_learning', e.target.value)}
                placeholder="What important lesson will you take forward?"
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
              />
            </div>
          </div>
        )}

        {activeSection === 'pulse' && (
          <div className="space-y-8">
            {/* Hours Worked */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Clock className="w-4 h-4 text-brand-orange" />
                Average hours worked per week last quarter
              </label>
              <input
                type="number"
                value={review.hours_worked_avg || ''}
                onChange={(e) => handleChange('hours_worked_avg', parseInt(e.target.value) || null)}
                placeholder="e.g., 45"
                min={0}
                max={168}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
              />
            </div>

            {/* Days Off */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar className="w-4 h-4 text-green-500" />
                Days off taken last quarter
              </label>
              <input
                type="number"
                value={review.days_off_taken || ''}
                onChange={(e) => handleChange('days_off_taken', parseInt(e.target.value) || null)}
                placeholder="e.g., 10"
                min={0}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
              />
            </div>

            {/* Energy Level */}
            {renderRatingInput(
              'energy_level',
              review.energy_level,
              'Current energy level (1 = Exhausted, 10 = Full of energy)',
              <Battery className="w-4 h-4 text-green-500" />
            )}

            {/* Purpose Alignment */}
            {renderRatingInput(
              'purpose_alignment',
              review.purpose_alignment,
              'How aligned do you feel with your business purpose? (1 = Lost, 10 = Fully aligned)',
              <Target className="w-4 h-4 text-brand-navy" />
            )}
          </div>
        )}

        {activeSection === 'ahead' && (
          <div className="space-y-8">
            {/* One Thing for Success */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Target className="w-4 h-4 text-brand-orange" />
                If you could only achieve ONE thing next quarter, what would make the biggest impact?
              </label>
              <textarea
                value={review.one_thing_for_success || ''}
                onChange={(e) => handleChange('one_thing_for_success', e.target.value)}
                placeholder="What single achievement would move the needle most?"
                rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
              />
            </div>

            {/* Coach Support */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                What support would you like from your coach this quarter?
              </label>
              <textarea
                value={review.coach_support_needed || ''}
                onChange={(e) => handleChange('coach_support_needed', e.target.value)}
                placeholder="What areas would you like coaching focus on?"
                rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* Section Navigation */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Section {currentSectionIndex + 1} of {SECTIONS.length}
          </div>

          {!isLastSection ? (
            <button
              onClick={goToNextSection}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 transition-colors"
            >
              Next: {SECTIONS[currentSectionIndex + 1].label}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Pre-work complete! Click Continue below.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
