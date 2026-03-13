'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type {
  QuarterlyReview,
  PersonalCommitments,
  ActionItem,
  CoachNotes
} from '../../types';
import { getDefaultPersonalCommitments } from '../../types';
import {
  Target, Clock, Calendar, Heart, Plus, X, Trash2,
  User, CheckCircle2, Circle, MessageSquare, Sparkles, ArrowLeftRight
} from 'lucide-react';

interface SessionCloseStepProps {
  review: QuarterlyReview;
  onUpdateOneThing: (answer: string) => void;
  onUpdatePersonalCommitments: (commitments: PersonalCommitments) => void;
  onUpdateActionItems: (items: ActionItem[]) => void;
  onUpdateCoachNotes: (notes: CoachNotes) => void;
}

export function SessionCloseStep({
  review,
  onUpdateOneThing,
  onUpdatePersonalCommitments,
  onUpdateActionItems,
  onUpdateCoachNotes
}: SessionCloseStepProps) {
  const commitments = { ...getDefaultPersonalCommitments(), ...(review.personal_commitments || {}) };
  const actionItems = review.action_items || [];
  const coachNotes = review.coach_notes || {};

  const [newDate, setNewDate] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemOwner, setNewItemOwner] = useState('');
  const [newItemDueDate, setNewItemDueDate] = useState('');

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

  // ---- Personal Commitments ----
  const updateCommitmentField = (field: keyof PersonalCommitments, value: any) => {
    onUpdatePersonalCommitments({ ...commitments, [field]: value });
  };

  const addDayOff = () => {
    if (!newDate) return;
    const dates = commitments.daysOffScheduled || [];
    if (!dates.includes(newDate)) {
      updateCommitmentField('daysOffScheduled', [...dates, newDate].sort());
    }
    setNewDate('');
  };

  const removeDayOff = (date: string) => {
    updateCommitmentField(
      'daysOffScheduled',
      (commitments.daysOffScheduled || []).filter(d => d !== date)
    );
  };

  // ---- Action Items ----
  const addActionItem = () => {
    if (!newItemDescription.trim()) return;
    const newItem: ActionItem = {
      id: `action-${Date.now()}`,
      description: newItemDescription.trim(),
      owner: newItemOwner.trim(),
      dueDate: newItemDueDate,
      sourceStep: '4.4',
      completed: false
    };
    onUpdateActionItems([...actionItems, newItem]);
    setNewItemDescription('');
    setNewItemOwner('');
    setNewItemDueDate('');
  };

  const removeActionItem = (id: string) => {
    onUpdateActionItems(actionItems.filter(item => item.id !== id));
  };

  const toggleActionItem = (id: string) => {
    onUpdateActionItems(actionItems.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  // ---- Coach Notes ----
  const updateCoachSummary = (value: string) => {
    onUpdateCoachNotes({ ...coachNotes, session_close: value });
  };

  // Calculate summary stats
  const weeksInQuarter = 13;
  const totalHoursAvailable = (commitments.hoursPerWeekTarget || 0) * weeksInQuarter;
  const completedActions = actionItems.filter(a => a.completed).length;
  const pendingActions = actionItems.length - completedActions;

  return (
    <div>
      <StepHeader
        step="4.4"
        subtitle="Wrap up the session with personal commitments, action items, and final reflections"
        estimatedTime={15}
        tip="End strong - clarity creates momentum"
      />

      {/* "One Thing" Revisited - Side by Side */}
      <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 rounded-xl border border-brand-orange-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-brand-orange-200">
            <ArrowLeftRight className="w-5 h-5 text-brand-orange" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">&quot;One Thing&quot; Revisited</h3>
            <p className="text-sm text-gray-500">Compare your pre-work answer with how you feel now</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Pre-work answer */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pre-Work Answer</span>
            </div>
            <p className="text-sm text-gray-700 min-h-[60px]">
              {review.one_thing_for_success || (
                <span className="text-gray-400 italic">No pre-work answer recorded</span>
              )}
            </p>
          </div>

          {/* Current answer */}
          <div className="bg-white rounded-xl border border-brand-orange-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-brand-orange uppercase tracking-wide">Updated Answer</span>
            </div>
            <textarea
              value={review.one_thing_answer || ''}
              onChange={(e) => onUpdateOneThing(e.target.value)}
              placeholder="After today's session, what is the ONE thing that will make everything else easier or unnecessary?"
              rows={3}
              className="w-full px-3 py-2 border border-brand-orange-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Personal Commitments */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Personal Commitments for Q{nextQ.quarter} {nextQ.year}</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Your business serves you - not the other way around</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Hours Per Week */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Hours Per Week Target</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={commitments.hoursPerWeekTarget || ''}
                  onChange={(e) => updateCommitmentField('hoursPerWeekTarget', parseInt(e.target.value) || null)}
                  placeholder="40"
                  min={0}
                  max={80}
                  className="w-24 px-4 py-2 border border-gray-200 rounded-xl text-center text-lg font-bold focus:ring-2 focus:ring-brand-orange"
                />
                <span className="text-sm text-gray-500">
                  hours/week
                  {commitments.hoursPerWeekTarget ? ` = ${totalHoursAvailable} hrs this quarter` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Days Off */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <Calendar className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Days Off Planned</label>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="number"
                  value={commitments.daysOffPlanned || ''}
                  onChange={(e) => updateCommitmentField('daysOffPlanned', parseInt(e.target.value) || null)}
                  placeholder="10"
                  min={0}
                  className="w-24 px-4 py-2 border border-gray-200 rounded-xl text-center text-lg font-bold focus:ring-2 focus:ring-brand-orange"
                />
                <span className="text-sm text-gray-500">total days off</span>
              </div>

              {/* Schedule Specific Dates */}
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange"
                />
                <button
                  onClick={addDayOff}
                  disabled={!newDate}
                  className="px-3 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {(commitments.daysOffScheduled || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {commitments.daysOffScheduled?.map(date => (
                    <span
                      key={date}
                      className="inline-flex items-center gap-1 bg-slate-100 text-gray-700 px-2 py-1 rounded text-sm"
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

          {/* Personal Goal */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Personal Goal</label>
              <textarea
                value={commitments.personalGoal || ''}
                onChange={(e) => updateCommitmentField('personalGoal', e.target.value)}
                placeholder="e.g., Run a half marathon, Read 5 books, Take family on holiday..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">This isn&apos;t about your business - it&apos;s about YOU.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Items Recap */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Action Items</h3>
              <span className="text-sm text-gray-500">
                ({pendingActions} pending, {completedActions} done)
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">All accumulated action items from this session</p>
        </div>

        <div className="p-5">
          {/* Existing Action Items */}
          {actionItems.length > 0 ? (
            <div className="space-y-2 mb-5">
              {actionItems.map(item => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 rounded-lg p-3 border transition-colors ${
                    item.completed
                      ? 'bg-green-50 border-green-100'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <button
                    onClick={() => toggleActionItem(item.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 hover:text-brand-orange" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {item.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {item.owner && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {item.owner}
                        </span>
                      )}
                      {item.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(item.dueDate)}
                        </span>
                      )}
                      {item.sourceStep && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                          Step {item.sourceStep}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeActionItem(item.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic text-center py-4 mb-4">No action items yet</p>
          )}

          {/* Add New Action Item */}
          <div className="bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-orange" />
              Add Action Item
            </h4>
            <div className="space-y-3">
              <input
                type="text"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Owner</label>
                  <input
                    type="text"
                    value={newItemOwner}
                    onChange={(e) => setNewItemOwner(e.target.value)}
                    placeholder="Who's responsible?"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Due Date</label>
                  <input
                    type="date"
                    value={newItemDueDate}
                    onChange={(e) => setNewItemDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
              </div>
              <button
                onClick={addActionItem}
                disabled={!newItemDescription.trim()}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Coach Summary Notes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Coach Summary Notes</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Final observations and notes from the session</p>
        </div>

        <div className="p-5">
          <textarea
            value={coachNotes.session_close || ''}
            onChange={(e) => updateCoachSummary(e.target.value)}
            placeholder="Key takeaways from the session, areas to focus on, follow-up items, overall assessment..."
            rows={6}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Session Summary Card */}
      <div className="bg-gradient-to-r from-slate-50 to-brand-orange-50 rounded-xl border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-brand-orange" />
          Q{nextQ.quarter} {nextQ.year} Commitment Summary
        </h4>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {commitments.hoursPerWeekTarget || '---'}
            </div>
            <div className="text-xs text-gray-600">Hours/Week</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {commitments.daysOffPlanned || '---'}
            </div>
            <div className="text-xs text-gray-600">Days Off</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {actionItems.length}
            </div>
            <div className="text-xs text-gray-600">Action Items</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <div className="text-2xl font-bold text-gray-900">
              {(commitments.daysOffScheduled || []).length}
            </div>
            <div className="text-xs text-gray-600">Days Scheduled</div>
          </div>
        </div>

        {commitments.personalGoal && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-gray-100">
            <p className="text-sm text-gray-700">
              <strong>Personal Goal:</strong> {commitments.personalGoal}
            </p>
          </div>
        )}

        {review.one_thing_answer && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-brand-orange-100">
            <p className="text-sm text-gray-700">
              <strong className="text-brand-orange">One Thing:</strong> {review.one_thing_answer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
