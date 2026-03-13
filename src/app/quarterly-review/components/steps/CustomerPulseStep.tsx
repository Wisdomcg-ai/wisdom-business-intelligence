'use client';

import { useState } from 'react';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, CustomerPulse } from '../../types';
import { getDefaultCustomerPulse } from '../../types';
import {
  ThumbsUp, AlertTriangle, TrendingUp,
  Plus, X, MessageSquare, Lightbulb
} from 'lucide-react';

interface CustomerPulseStepProps {
  review: QuarterlyReview;
  onUpdate: (pulse: CustomerPulse) => void;
}

type PulseCategory = 'compliments' | 'complaints' | 'trends';

const CATEGORIES: { key: PulseCategory; label: string; icon: React.ElementType; color: string; bgColor: string; borderColor: string; placeholder: string; description: string }[] = [
  {
    key: 'compliments',
    label: 'Compliments',
    icon: ThumbsUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    placeholder: 'e.g., "Client X loved the turnaround time on the last project"',
    description: 'What positive feedback have you received? What are people thanking you for?'
  },
  {
    key: 'complaints',
    label: 'Complaints',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    placeholder: 'e.g., "Two clients mentioned our invoicing is confusing"',
    description: 'What negative feedback or frustrations have you heard? Where are people unhappy?'
  },
  {
    key: 'trends',
    label: 'Trends',
    icon: TrendingUp,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    placeholder: 'e.g., "More enquiries coming through social media than referrals now"',
    description: 'What patterns are you noticing? Any shifts in your market or customer behaviour?'
  }
];

export function CustomerPulseStep({ review, onUpdate }: CustomerPulseStepProps) {
  const pulse: CustomerPulse = { ...getDefaultCustomerPulse(), ...(review.customer_pulse || {}) };
  const [newItems, setNewItems] = useState<Record<PulseCategory, string>>({
    compliments: '',
    complaints: '',
    trends: ''
  });

  const updateField = (field: keyof CustomerPulse, value: any) => {
    onUpdate({ ...pulse, [field]: value });
  };

  const addItem = (category: PulseCategory) => {
    const value = newItems[category].trim();
    if (!value) return;
    const current = pulse[category] || [];
    updateField(category, [...current, value]);
    setNewItems({ ...newItems, [category]: '' });
  };

  const removeItem = (category: PulseCategory, index: number) => {
    const current = pulse[category] || [];
    updateField(category, current.filter((_: string, i: number) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, category: PulseCategory) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(category);
    }
  };

  const totalItems = (pulse.compliments?.length || 0) + (pulse.complaints?.length || 0) + (pulse.trends?.length || 0);

  return (
    <div>
      <StepHeader
        step="2.4"
        subtitle="What are your customers telling you? Capture the signal in the noise."
        estimatedTime={10}
        tip="Patterns in feedback reveal where to focus next"
      />

      {/* Three Categories */}
      <div className="space-y-6">
        {CATEGORIES.map(({ key, label, icon: Icon, color, bgColor, borderColor, placeholder, description }) => {
          const items = pulse[key] || [];

          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 ${bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{label}</h3>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
                {items.length > 0 && (
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${bgColor} ${color}`}>
                    {items.length}
                  </span>
                )}
              </div>

              {/* Items List */}
              {items.length > 0 && (
                <div className="space-y-2 mb-3">
                  {items.map((item: string, index: number) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 ${bgColor} rounded-lg px-3 py-2 border ${borderColor} group`}
                    >
                      <span className="flex-1 text-sm text-gray-700">{item}</span>
                      <button
                        onClick={() => removeItem(key, index)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/50 rounded transition-opacity flex-shrink-0"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Item */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItems[key]}
                  onChange={(e) => setNewItems({ ...newItems, [key]: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, key)}
                  placeholder={placeholder}
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
                <button
                  onClick={() => addItem(key)}
                  disabled={!newItems[key].trim()}
                  className={`p-2 rounded-lg transition-colors ${
                    newItems[key].trim()
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

      {/* Notes */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Additional Notes</h3>
        </div>
        <textarea
          value={pulse.notes || ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Anything else worth noting about your customers this quarter..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none text-sm"
        />
      </div>

      {/* Coaching Tip */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Why this matters</h4>
            <p className="text-sm text-gray-600 mt-1">
              Compliments tell you what to double down on. Complaints reveal problems to solve in the Issues step.
              Trends help you see around corners before it&apos;s too late.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
