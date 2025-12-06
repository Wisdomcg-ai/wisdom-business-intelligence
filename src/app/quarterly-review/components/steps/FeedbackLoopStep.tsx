'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, FeedbackLoop, FeedbackLoopArea, FeedbackLoopColumn } from '../../types';
import {
  getDefaultFeedbackLoop,
  FEEDBACK_LOOP_AREAS,
  FEEDBACK_LOOP_COLUMNS,
  FEEDBACK_LOOP_AREA_LABELS,
  FEEDBACK_LOOP_COLUMN_LABELS,
  FEEDBACK_LOOP_COLUMN_COLORS
} from '../../types';
import { Plus, X, Megaphone, ShoppingCart, Cog, Wallet, Users, User, StopCircle, Play, Sparkles } from 'lucide-react';

interface FeedbackLoopStepProps {
  review: QuarterlyReview;
  onUpdate: (feedbackLoop: FeedbackLoop) => void;
}

const AREA_ICONS: Record<FeedbackLoopArea, React.ElementType> = {
  marketing: Megaphone,
  sales: ShoppingCart,
  operations: Cog,
  finances: Wallet,
  people: Users,
  owner: User
};

const COLUMN_ICONS: Record<string, React.ElementType> = {
  stop: StopCircle,
  continue: Play,
  start: Sparkles
};

const COLUMN_HEADER_COLORS: Record<string, string> = {
  stop: 'bg-red-100 text-red-800',
  continue: 'bg-green-100 text-green-800',
  start: 'bg-brand-orange-100 text-brand-navy'
};

export function FeedbackLoopStep({ review, onUpdate }: FeedbackLoopStepProps) {
  const feedbackLoop = review.feedback_loop || getDefaultFeedbackLoop();
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  const getKey = (area: FeedbackLoopArea, column: FeedbackLoopColumn) => `${area}-${column}`;

  const addItem = (area: FeedbackLoopArea, column: FeedbackLoopColumn) => {
    const key = getKey(area, column);
    const value = (newItems[key] || '').trim();
    if (!value) return;

    const areaData = feedbackLoop[area];
    const updated: FeedbackLoop = {
      ...feedbackLoop,
      [area]: {
        ...areaData,
        [column]: [...areaData[column], value]
      }
    };
    onUpdate(updated);
    setNewItems({ ...newItems, [key]: '' });
  };

  const removeItem = (area: FeedbackLoopArea, column: FeedbackLoopColumn, index: number) => {
    const areaData = feedbackLoop[area];
    const updated: FeedbackLoop = {
      ...feedbackLoop,
      [area]: {
        ...areaData,
        [column]: areaData[column].filter((_, i) => i !== index)
      }
    };
    onUpdate(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent, area: FeedbackLoopArea, column: FeedbackLoopColumn) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(area, column);
    }
  };

  const getTotalItems = () => {
    let total = 0;
    FEEDBACK_LOOP_AREAS.forEach(area => {
      FEEDBACK_LOOP_COLUMNS.forEach(column => {
        total += feedbackLoop[area][column].length;
      });
    });
    return total;
  };

  return (
    <div>
      <StepHeader
        step="2.1"
        subtitle="What should you Stop, Continue, or Start in each area of your business?"
        estimatedTime={20}
        tip="Focus on actionable changes you can make next quarter"
      />

      {/* Single Grid View - 6 Areas × 3 Columns */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Header Row */}
          <thead>
            <tr>
              <th className="p-3 text-left bg-slate-100 rounded-tl-lg w-32">
                <span className="text-sm font-semibold text-gray-700">Area</span>
              </th>
              {FEEDBACK_LOOP_COLUMNS.map((column, idx) => {
                const Icon = COLUMN_ICONS[column];
                const isLast = idx === FEEDBACK_LOOP_COLUMNS.length - 1;
                return (
                  <th
                    key={column}
                    className={`p-3 text-center ${COLUMN_HEADER_COLORS[column]} ${isLast ? 'rounded-tr-lg' : ''}`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-semibold">{FEEDBACK_LOOP_COLUMN_LABELS[column]}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body Rows - One per Area */}
          <tbody>
            {FEEDBACK_LOOP_AREAS.map((area, areaIdx) => {
              const Icon = AREA_ICONS[area];
              const isLast = areaIdx === FEEDBACK_LOOP_AREAS.length - 1;

              return (
                <tr key={area} className={areaIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {/* Area Label */}
                  <td className={`p-3 border-r border-gray-200 ${isLast ? 'rounded-bl-lg' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        {FEEDBACK_LOOP_AREA_LABELS[area]}
                      </span>
                    </div>
                  </td>

                  {/* Column Cells */}
                  {FEEDBACK_LOOP_COLUMNS.map((column, colIdx) => {
                    const key = getKey(area, column);
                    const items = feedbackLoop[area][column];
                    const colorClasses = FEEDBACK_LOOP_COLUMN_COLORS[column];
                    const isLastCol = colIdx === FEEDBACK_LOOP_COLUMNS.length - 1;

                    return (
                      <td
                        key={column}
                        className={`p-2 border-r border-gray-100 ${colorClasses} ${isLast && isLastCol ? 'rounded-br-lg' : ''}`}
                      >
                        {/* Items */}
                        <div className="space-y-1 min-h-[60px] mb-2">
                          {items.map((item, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-1 bg-white rounded px-2 py-1 border border-gray-100 group text-xs"
                            >
                              <span className="flex-1 text-gray-700">{item}</span>
                              <button
                                onClick={() => removeItem(area, column, index)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-100 rounded transition-opacity"
                              >
                                <X className="w-3 h-3 text-gray-400" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add Input */}
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={newItems[key] || ''}
                            onChange={(e) => setNewItems({ ...newItems, [key]: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, area, column)}
                            placeholder="Add..."
                            className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange focus:border-brand-orange-500 bg-white"
                          />
                          <button
                            onClick={() => addItem(area, column)}
                            disabled={!(newItems[key] || '').trim()}
                            className="p-1 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:bg-gray-200 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-6 flex items-center justify-between bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-6">
          {FEEDBACK_LOOP_COLUMNS.map(column => {
            const Icon = COLUMN_ICONS[column];
            const count = FEEDBACK_LOOP_AREAS.reduce(
              (sum, area) => sum + feedbackLoop[area][column].length,
              0
            );
            return (
              <div key={column} className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${COLUMN_HEADER_COLORS[column]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-500">{FEEDBACK_LOOP_COLUMN_LABELS[column]}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-brand-orange">{getTotalItems()}</div>
          <div className="text-sm text-gray-500">Total Items</div>
        </div>
      </div>
    </div>
  );
}
