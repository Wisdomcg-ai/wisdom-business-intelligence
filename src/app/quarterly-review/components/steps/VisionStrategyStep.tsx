'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, VisionStrategyCheck } from '../../types';
import { getDefaultVisionStrategyCheck } from '../../types';
import {
  Eye,
  Compass,
  Heart,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Target,
} from 'lucide-react';

interface VisionStrategyStepProps {
  review: QuarterlyReview;
  onUpdate: (data: VisionStrategyCheck) => void;
}

export function VisionStrategyStep({ review, onUpdate }: VisionStrategyStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);
  const [newValue, setNewValue] = useState('');
  const [newPriority, setNewPriority] = useState('');

  const data: VisionStrategyCheck = {
    ...getDefaultVisionStrategyCheck(),
    ...(review.vision_strategy || {}),
  };

  useEffect(() => {
    loadVisionData();
  }, []);

  const loadVisionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const targetUserId = activeBusiness?.ownerId || user.id;
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id, business_plan')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (profile?.business_plan) {
        const plan = typeof profile.business_plan === 'string'
          ? JSON.parse(profile.business_plan)
          : profile.business_plan;

        // Pre-populate from business plan if not yet set
        if (!data.currentVision && !data.currentMission) {
          onUpdate({
            ...data,
            currentVision: plan.vision || plan.threeYearVision || '',
            currentMission: plan.mission || plan.purpose || '',
            coreValues: plan.values || plan.coreValues || [],
          });
        }
      }

      // Also load 12-month priorities from strategic_initiatives
      const businessId = profile?.id || review.business_id;
      const { data: initiatives } = await supabase
        .from('strategic_initiatives')
        .select('title')
        .eq('business_id', businessId)
        .eq('step_type', 'twelve_month')
        .order('order_index', { ascending: true });

      if (initiatives && initiatives.length > 0 && data.oneYearPriorities.length === 0) {
        onUpdate({
          ...data,
          oneYearPriorities: initiatives.map(i => i.title),
        });
      }
    } catch (err) {
      console.error('Error loading vision data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof VisionStrategyCheck, value: any) => {
    onUpdate({ ...data, [field]: value });
  };

  const addCoreValue = () => {
    if (!newValue.trim()) return;
    updateField('coreValues', [...data.coreValues, newValue.trim()]);
    setNewValue('');
  };

  const removeCoreValue = (index: number) => {
    updateField('coreValues', data.coreValues.filter((_, i) => i !== index));
  };

  const addPriority = () => {
    if (!newPriority.trim()) return;
    updateField('oneYearPriorities', [...data.oneYearPriorities, newPriority.trim()]);
    setNewPriority('');
  };

  const removePriority = (index: number) => {
    updateField('oneYearPriorities', data.oneYearPriorities.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader step="A4.2" subtitle="Review your vision, mission, and strategic direction" estimatedTime={20} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="A4.2"
        subtitle="Check that your vision and strategy still align with where you want to go"
        estimatedTime={20}
        tip="Don't change things just for the sake of change. Only adjust if genuinely misaligned."
      />

      {/* Vision */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Eye className="w-5 h-5 text-brand-orange" />
          3-Year Vision
        </h3>
        <p className="text-sm text-gray-500 mb-2">Where do you see the business in 3 years?</p>
        <textarea
          value={data.currentVision}
          onChange={(e) => updateField('currentVision', e.target.value)}
          placeholder="In 3 years, the business will be..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
        />
      </div>

      {/* Mission */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Compass className="w-5 h-5 text-brand-orange" />
          Mission / Purpose
        </h3>
        <textarea
          value={data.currentMission}
          onChange={(e) => updateField('currentMission', e.target.value)}
          placeholder="We exist to..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
        />
      </div>

      {/* Core Values */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Heart className="w-5 h-5 text-brand-orange" />
          Core Values
        </h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.coreValues.map((value, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 bg-brand-orange-50 text-brand-orange-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              {value}
              <button onClick={() => removeCoreValue(i)} className="text-brand-orange-400 hover:text-brand-orange-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Add a core value..."
            onKeyDown={(e) => { if (e.key === 'Enter') addCoreValue(); }}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          />
          <button
            onClick={addCoreValue}
            disabled={!newValue.trim()}
            className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alignment Check */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Still Aligned?</h3>
        <p className="text-sm text-gray-600 mb-4">After reviewing your vision, mission, and values — are they still guiding you in the right direction?</p>
        <div className="flex gap-3">
          <button
            onClick={() => updateField('stillAligned', true)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
              data.stillAligned
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Yes, Still Aligned
          </button>
          <button
            onClick={() => updateField('stillAligned', false)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
              !data.stillAligned
                ? 'border-amber-500 bg-amber-50 text-amber-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            Needs Adjustment
          </button>
        </div>

        {!data.stillAligned && (
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Proposed Changes</label>
            <textarea
              value={data.proposedChanges}
              onChange={(e) => updateField('proposedChanges', e.target.value)}
              placeholder="What needs to change and why?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
            />
          </div>
        )}
      </div>

      {/* 1-Year Strategic Priorities */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-brand-orange" />
          1-Year Strategic Priorities
        </h3>
        <p className="text-sm text-gray-500 mb-3">What are the top priorities for the coming year?</p>
        <div className="space-y-2 mb-3">
          {data.oneYearPriorities.map((priority, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="w-6 h-6 rounded-full bg-brand-orange text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-gray-800">{priority}</span>
              <button onClick={() => removePriority(i)} className="text-gray-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            placeholder="Add a strategic priority..."
            onKeyDown={(e) => { if (e.key === 'Enter') addPriority(); }}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          />
          <button
            onClick={addPriority}
            disabled={!newPriority.trim()}
            className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
          >
            Add
          </button>
        </div>
      </div>

      {/* Strategic Shifts */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h4 className="font-medium text-slate-700 mb-2">Any Major Strategic Shifts?</h4>
        <p className="text-sm text-slate-500 mb-2">Are there fundamental changes in strategy for next year?</p>
        <textarea
          value={data.strategicShifts}
          onChange={(e) => updateField('strategicShifts', e.target.value)}
          placeholder="e.g., shifting from services to products, entering new market, changing pricing model..."
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none bg-white"
        />
      </div>
    </div>
  );
}
