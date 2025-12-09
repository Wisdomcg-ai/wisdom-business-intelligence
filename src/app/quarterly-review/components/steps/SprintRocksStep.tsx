'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, Rock } from '../../types';
import { Mountain, Plus, GripVertical, Trash2, User, Target, Link2, Sparkles } from 'lucide-react';

interface SprintRocksStepProps {
  review: QuarterlyReview;
  onUpdate: (rocks: Rock[]) => void;
}

const EMPTY_ROCK: Omit<Rock, 'id'> = {
  title: '',
  owner: '',
  successCriteria: '',  // Was doneDefinition
  priority: 0,
  status: 'not_started',
  progressPercentage: 0,
  linkedInitiatives: [],
  linkedKPIs: []
};

export function SprintRocksStep({ review, onUpdate }: SprintRocksStepProps) {
  const rocks = review.quarterly_rocks || [];
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const addRock = () => {
    const newRock: Rock = {
      ...EMPTY_ROCK,
      id: `rock-${Date.now()}`,
      priority: rocks.length + 1
    };
    onUpdate([...rocks, newRock]);
  };

  const updateRock = (id: string, field: keyof Rock, value: any) => {
    onUpdate(rocks.map(rock =>
      rock.id === id ? { ...rock, [field]: value } : rock
    ));
  };

  const removeRock = (id: string) => {
    onUpdate(rocks.filter(rock => rock.id !== id).map((rock, i) => ({
      ...rock,
      priority: i + 1
    })));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newRocks = [...rocks];
    const draggedRock = newRocks[draggedIndex];
    newRocks.splice(draggedIndex, 1);
    newRocks.splice(index, 0, draggedRock);

    // Update priorities
    const reordered = newRocks.map((rock, i) => ({ ...rock, priority: i + 1 }));
    onUpdate(reordered);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return { quarter: 1, year: review.year + 1 };
    }
    return { quarter: review.quarter + 1, year: review.year };
  };

  const nextQ = getNextQuarter();

  return (
    <div>
      <StepHeader
        step="4.2"  // Now merged into 4.2 (90-Day Sprint Planning)
        subtitle={`Define your 3-5 Rocks for Q${nextQ.quarter} ${nextQ.year} - your 90-day sprint priorities`}
        estimatedTime={20}
        tip="Less is more - focus on what matters most"
      />

      {/* Guidelines */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
        <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
          <Mountain className="w-4 h-4 text-gray-600" />
          What Makes a Great Rock?
        </h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• <strong>Specific:</strong> Clear, well-defined outcome</li>
          <li>• <strong>Measurable:</strong> You'll know when it's done</li>
          <li>• <strong>Achievable:</strong> Can be completed in 90 days</li>
          <li>• <strong>Relevant:</strong> Moves the needle on your targets</li>
          <li>• <strong>Time-bound:</strong> Has a clear deadline (end of quarter)</li>
        </ul>
      </div>

      {/* Rock Count Indicator */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          Q{nextQ.quarter} {nextQ.year} Rocks
        </h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          rocks.length >= 3 && rocks.length <= 5
            ? 'bg-slate-100 text-gray-700'
            : rocks.length > 5
            ? 'bg-slate-100 text-gray-700'
            : 'bg-slate-100 text-gray-700'
        }`}>
          {rocks.length} / 3-5 Rocks
        </div>
      </div>

      {/* Rocks List */}
      <div className="space-y-4 mb-6">
        {rocks.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center border border-dashed border-gray-300">
            <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-700 mb-2">No Rocks Yet</h3>
            <p className="text-gray-500 mb-4">Add your 3-5 most important priorities for the quarter</p>
            <button
              onClick={addRock}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600"
            >
              <Plus className="w-4 h-4" />
              Add First Rock
            </button>
          </div>
        ) : (
          rocks.map((rock, index) => (
            <div
              key={rock.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-white rounded-xl border border-gray-200 p-4 transition-all ${
                draggedIndex === index ? 'opacity-50 shadow-lg' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Drag Handle */}
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-5 h-5 text-gray-400" />
                </div>

                {/* Priority Number */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-brand-orange">
                  {index + 1}
                </div>

                {/* Rock Details */}
                <div className="flex-1 space-y-3">
                  {/* Title */}
                  <input
                    type="text"
                    value={rock.title}
                    onChange={(e) => updateRock(rock.id, 'title', e.target.value)}
                    placeholder="Rock title - What will you achieve?"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg font-medium focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />

                  {/* Success Criteria (was Done Definition) */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                      <Target className="w-3.5 h-3.5" />
                      Success Criteria
                    </label>
                    <textarea
                      value={rock.successCriteria || rock.doneDefinition || ''}
                      onChange={(e) => updateRock(rock.id, 'successCriteria', e.target.value)}
                      placeholder="Describe the specific, measurable outcome..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Owner & Link */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                        <User className="w-3.5 h-3.5" />
                        Owner
                      </label>
                      <input
                        type="text"
                        value={rock.owner}
                        onChange={(e) => updateRock(rock.id, 'owner', e.target.value)}
                        placeholder="Who's responsible?"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                        <Link2 className="w-3.5 h-3.5" />
                        Linked Initiatives (optional)
                      </label>
                      <input
                        type="text"
                        value={(rock.linkedInitiatives || [rock.linkedInitiativeId]).filter(Boolean).join(', ')}
                        onChange={(e) => {
                          const initiatives = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          updateRock(rock.id, 'linkedInitiatives', initiatives);
                        }}
                        placeholder="Initiative IDs (comma-separated)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeRock(rock.id)}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Rock Button */}
      {rocks.length > 0 && rocks.length < 7 && (
        <button
          onClick={addRock}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-brand-orange-400 hover:text-brand-orange transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Another Rock
        </button>
      )}

      {/* Warning if too many rocks */}
      {rocks.length > 5 && (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-700 text-sm flex items-center gap-2">
            <span className="text-gray-600">⚠️</span>
            You have more than 5 rocks. Consider reducing to maintain focus.
          </p>
        </div>
      )}

      {/* Rock Summary */}
      {rocks.length > 0 && (
        <div className="mt-6 bg-gray-50 rounded-xl p-4">
          <h4 className="font-medium text-gray-900 mb-3">Q{nextQ.quarter} Rock Summary</h4>
          <ol className="space-y-2">
            {rocks.map((rock, index) => (
              <li key={rock.id} className="flex items-start gap-2 text-sm">
                <span className="font-bold text-gray-500">{index + 1}.</span>
                <span className={rock.title ? 'text-gray-700' : 'text-gray-400 italic'}>
                  {rock.title || 'Untitled Rock'}
                </span>
                {rock.owner && (
                  <span className="text-gray-400">({rock.owner})</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
