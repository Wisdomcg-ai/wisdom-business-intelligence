'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, PersonalCommitments } from '../../types';
import { getDefaultPersonalCommitments } from '../../types';
import { User, Clock, Calendar, Target, Heart, Plus, X, Sparkles } from 'lucide-react';

interface PersonalCommitmentsStepProps {
  review: QuarterlyReview;
  onUpdate: (commitments: PersonalCommitments) => void;
}

export function PersonalCommitmentsStep({ review, onUpdate }: PersonalCommitmentsStepProps) {
  const commitments = review.personal_commitments || getDefaultPersonalCommitments();
  const [newDate, setNewDate] = useState('');

  const updateField = (field: keyof PersonalCommitments, value: any) => {
    onUpdate({ ...commitments, [field]: value });
  };

  const addDayOff = () => {
    if (!newDate) return;
    const dates = commitments.daysOffScheduled || [];
    if (!dates.includes(newDate)) {
      updateField('daysOffScheduled', [...dates, newDate].sort());
    }
    setNewDate('');
  };

  const removeDayOff = (date: string) => {
    updateField(
      'daysOffScheduled',
      (commitments.daysOffScheduled || []).filter(d => d !== date)
    );
  };

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return { quarter: 1, year: review.year + 1 };
    }
    return { quarter: review.quarter + 1, year: review.year };
  };

  const nextQ = getNextQuarter();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculate weeks in quarter
  const weeksInQuarter = 13;
  const totalHoursAvailable = (commitments.hoursPerWeekTarget || 0) * weeksInQuarter;

  return (
    <div>
      <StepHeader
        step="4.4"
        subtitle="Set your personal work/life commitments for the quarter"
        estimatedTime={10}
        tip="Your business serves you - not the other way around"
      />

      {/* Quote */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
        <blockquote className="text-lg text-gray-800 italic mb-2">
          "The goal isn't to build a business that runs you ragged. It's to build a business that gives you the life you want."
        </blockquote>
        <cite className="text-sm text-gray-600">— Matt Malouf</cite>
      </div>

      {/* Hours Per Week */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Work Hours Target</h3>
            <p className="text-sm text-gray-500">How many hours per week will you work?</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="number"
            value={commitments.hoursPerWeekTarget || ''}
            onChange={(e) => updateField('hoursPerWeekTarget', parseInt(e.target.value) || null)}
            placeholder="40"
            min={0}
            max={80}
            className="w-24 px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl font-bold focus:ring-2 focus:ring-brand-orange"
          />
          <div className="text-sm text-gray-600">
            <p>hours per week</p>
            {commitments.hoursPerWeekTarget && (
              <p className="text-gray-400">= {totalHoursAvailable} hours this quarter</p>
            )}
          </div>
        </div>

        {/* Compare to last quarter */}
        {review.hours_worked_avg && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Last quarter you averaged <strong>{review.hours_worked_avg} hours/week</strong>.
              {commitments.hoursPerWeekTarget && commitments.hoursPerWeekTarget < review.hours_worked_avg && (
                <span className="text-gray-600 ml-1">
                  Great goal to reduce!
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Days Off */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Days Off Planned</h3>
            <p className="text-sm text-gray-500">Schedule your rest and recovery</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Number of Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total days off planned
            </label>
            <input
              type="number"
              value={commitments.daysOffPlanned || ''}
              onChange={(e) => updateField('daysOffPlanned', parseInt(e.target.value) || null)}
              placeholder="10"
              min={0}
              className="w-24 px-4 py-3 border border-gray-200 rounded-xl text-center text-xl font-bold focus:ring-2 focus:ring-brand-orange"
            />
            {review.days_off_taken !== null && (
              <p className="text-xs text-gray-500 mt-2">
                Last quarter: {review.days_off_taken} days
              </p>
            )}
          </div>

          {/* Specific Dates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule specific days
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
              />
              <button
                onClick={addDayOff}
                disabled={!newDate}
                className="px-3 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:bg-gray-200"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Scheduled Days */}
            {(commitments.daysOffScheduled || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {commitments.daysOffScheduled?.map(date => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1 bg-slate-100 text-brand-navy px-2 py-1 rounded text-sm"
                  >
                    {formatDate(date)}
                    <button
                      onClick={() => removeDayOff(date)}
                      className="hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personal Goal */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Heart className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Personal Goal</h3>
            <p className="text-sm text-gray-500">What personal goal will you achieve this quarter?</p>
          </div>
        </div>

        <textarea
          value={commitments.personalGoal || ''}
          onChange={(e) => updateField('personalGoal', e.target.value)}
          placeholder="e.g., Run a half marathon, Read 5 books, Take family on holiday, Start meditating daily..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
        />

        <p className="text-xs text-gray-500 mt-2">
          This isn't about your business - it's about YOU.
        </p>
      </div>

      {/* Summary Card */}
      <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-gray-600" />
          Q{nextQ.quarter} Personal Commitment Summary
        </h4>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {commitments.hoursPerWeekTarget || '—'}
            </div>
            <div className="text-xs text-gray-600">Hours/Week</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {commitments.daysOffPlanned || '—'}
            </div>
            <div className="text-xs text-gray-600">Days Off</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {(commitments.daysOffScheduled || []).length}
            </div>
            <div className="text-xs text-gray-600">Scheduled</div>
          </div>
        </div>

        {commitments.personalGoal && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-gray-100">
            <p className="text-sm text-gray-700">
              <strong>Personal Goal:</strong> {commitments.personalGoal}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
