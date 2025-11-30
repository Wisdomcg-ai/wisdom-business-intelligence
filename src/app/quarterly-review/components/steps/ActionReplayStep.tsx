'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, ActionReplay } from '../../types';
import { getDefaultActionReplay } from '../../types';
import { Plus, X, CheckCircle2, XCircle, AlertTriangle, Lightbulb, Sparkles } from 'lucide-react';

interface ActionReplayStepProps {
  review: QuarterlyReview;
  onUpdate: (actionReplay: ActionReplay) => void;
}

type ActionColumn = 'worked' | 'didntWork' | 'plannedButDidnt' | 'newIdeas';

const COLUMN_CONFIG: Record<ActionColumn, {
  title: string;
  description: string;
  icon: React.ElementType;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  placeholder: string;
}> = {
  worked: {
    title: 'What Worked',
    description: 'Actions that delivered results',
    icon: CheckCircle2,
    bgColor: 'bg-slate-50',
    borderColor: 'border-gray-200',
    iconColor: 'text-slate-600',
    placeholder: 'e.g., Weekly team meetings improved communication'
  },
  didntWork: {
    title: "What Didn't Work",
    description: 'Actions that fell short',
    icon: XCircle,
    bgColor: 'bg-slate-50',
    borderColor: 'border-gray-200',
    iconColor: 'text-slate-600',
    placeholder: 'e.g., Cold email campaign had low response rate'
  },
  plannedButDidnt: {
    title: "Planned But Didn't Do",
    description: 'Intentions that got deferred',
    icon: AlertTriangle,
    bgColor: 'bg-slate-50',
    borderColor: 'border-gray-200',
    iconColor: 'text-slate-600',
    placeholder: 'e.g., Website redesign kept getting pushed back'
  },
  newIdeas: {
    title: 'New Ideas',
    description: 'Insights for next quarter',
    icon: Lightbulb,
    bgColor: 'bg-slate-50',
    borderColor: 'border-gray-200',
    iconColor: 'text-slate-600',
    placeholder: 'e.g., Partner with complementary businesses'
  }
};

export function ActionReplayStep({ review, onUpdate }: ActionReplayStepProps) {
  const actionReplay = review.action_replay || getDefaultActionReplay();
  const [newItems, setNewItems] = useState<Record<ActionColumn, string>>({
    worked: '',
    didntWork: '',
    plannedButDidnt: '',
    newIdeas: ''
  });

  const addItem = (column: ActionColumn) => {
    const value = newItems[column].trim();
    if (!value) return;

    const updated = {
      ...actionReplay,
      [column]: [...actionReplay[column], value]
    };
    onUpdate(updated);
    setNewItems({ ...newItems, [column]: '' });
  };

  const removeItem = (column: ActionColumn, index: number) => {
    const updated = {
      ...actionReplay,
      [column]: actionReplay[column].filter((_, i) => i !== index)
    };
    onUpdate(updated);
  };

  const updateKeyInsight = (insight: string) => {
    onUpdate({ ...actionReplay, keyInsight: insight });
  };

  const handleKeyDown = (e: React.KeyboardEvent, column: ActionColumn) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(column);
    }
  };

  return (
    <div>
      <StepHeader
        step="1.3"
        subtitle="Reflect on your actions from last quarter using the 4-column framework"
        estimatedTime={20}
        tip="Be honest - this is for learning, not judgment"
      />

      {/* Four Columns */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {(Object.keys(COLUMN_CONFIG) as ActionColumn[]).map(column => {
          const config = COLUMN_CONFIG[column];
          const Icon = config.icon;
          const items = actionReplay[column];

          return (
            <div key={column} className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bgColor}`}>
                  <Icon className={`w-4 h-4 ${config.iconColor}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{config.title}</h3>
                  <p className="text-xs text-gray-500">{config.description}</p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 mb-3 min-h-[100px]">
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No items added yet</p>
                ) : (
                  items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 group"
                    >
                      <span className="flex-1 text-sm text-gray-700">{item}</span>
                      <button
                        onClick={() => removeItem(column, index)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Item */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItems[column]}
                  onChange={(e) => setNewItems({ ...newItems, [column]: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, column)}
                  placeholder={config.placeholder}
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => addItem(column)}
                  disabled={!newItems[column].trim()}
                  className={`p-2 rounded-lg transition-colors ${
                    newItems[column].trim()
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Insight */}
      <div className="bg-slate-50 rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Key Insight</h3>
            <p className="text-sm text-gray-500">What's the ONE thing you'll take forward from this reflection?</p>
          </div>
        </div>
        <textarea
          value={actionReplay.keyInsight}
          onChange={(e) => updateKeyInsight(e.target.value)}
          placeholder="Summarize your most important learning from this action replay..."
          rows={3}
          className="w-full px-4 py-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
        />
      </div>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-4 gap-2">
        {(Object.keys(COLUMN_CONFIG) as ActionColumn[]).map(column => {
          const config = COLUMN_CONFIG[column];
          return (
            <div key={column} className={`${config.bgColor} rounded-lg p-3 text-center`}>
              <div className={`text-xl font-bold ${config.iconColor}`}>
                {actionReplay[column].length}
              </div>
              <div className="text-xs text-gray-600">{config.title.split(' ')[0]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
