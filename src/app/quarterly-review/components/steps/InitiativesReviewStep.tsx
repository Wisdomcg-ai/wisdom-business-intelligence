'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, InitiativesChanges } from '../../types';
import { getDefaultInitiativesChanges } from '../../types';
import { Rocket, ArrowRight, Pause, Trash2, Plus, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface InitiativesReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (changes: InitiativesChanges) => void;
}

interface Initiative {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: 'active' | 'completed' | 'deferred';
  priority: number;
}

export function InitiativesReviewStep({ review, onUpdate }: InitiativesReviewStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [newInitiative, setNewInitiative] = useState({ title: '', category: 'growth', description: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const supabase = createClient();

  const changes = review.initiatives_changes || getDefaultInitiativesChanges();

  useEffect(() => {
    fetchInitiatives();
  }, []);

  const fetchInitiatives = async () => {
    try {
      // Get current user for query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Fetch strategic initiatives - uses user_id
      const { data, error } = await supabase
        .from('strategic_initiatives')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Handle errors gracefully
      if (error) {
        console.log('Strategic initiatives query error:', error.message);
        setInitiatives([]);
      } else {
        setInitiatives(data || []);
      }
    } catch (error) {
      console.log('Strategic initiatives table not available');
      setInitiatives([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitiativeStatus = (id: string): 'carried' | 'removed' | 'deferred' | 'unchanged' => {
    if (changes.carriedForward.includes(id)) return 'carried';
    if (changes.removed.includes(id)) return 'removed';
    if (changes.deferred.some(d => d.id === id)) return 'deferred';
    return 'unchanged';
  };

  const carryForward = (id: string) => {
    onUpdate({
      ...changes,
      carriedForward: [...changes.carriedForward.filter(i => i !== id), id],
      removed: changes.removed.filter(i => i !== id),
      deferred: changes.deferred.filter(d => d.id !== id)
    });
  };

  const removeInitiative = (id: string) => {
    onUpdate({
      ...changes,
      removed: [...changes.removed.filter(i => i !== id), id],
      carriedForward: changes.carriedForward.filter(i => i !== id),
      deferred: changes.deferred.filter(d => d.id !== id)
    });
  };

  const deferInitiative = (id: string, toQuarter: string) => {
    onUpdate({
      ...changes,
      deferred: [...changes.deferred.filter(d => d.id !== id), { id, toQuarter }],
      carriedForward: changes.carriedForward.filter(i => i !== id),
      removed: changes.removed.filter(i => i !== id)
    });
  };

  const resetInitiative = (id: string) => {
    onUpdate({
      ...changes,
      carriedForward: changes.carriedForward.filter(i => i !== id),
      removed: changes.removed.filter(i => i !== id),
      deferred: changes.deferred.filter(d => d.id !== id)
    });
  };

  const addNewInitiative = () => {
    if (!newInitiative.title.trim()) return;

    onUpdate({
      ...changes,
      added: [...changes.added, {
        title: newInitiative.title.trim(),
        category: newInitiative.category,
        description: newInitiative.description
      }]
    });

    setNewInitiative({ title: '', category: 'growth', description: '' });
    setShowAddForm(false);
  };

  const removeNewInitiative = (index: number) => {
    onUpdate({
      ...changes,
      added: changes.added.filter((_, i) => i !== index)
    });
  };

  const getNextQuarter = () => {
    if (review.quarter === 4) {
      return `Q1 ${review.year + 1}`;
    }
    return `Q${review.quarter + 1} ${review.year}`;
  };

  const getCategoryColor = (category: string) => {
    return 'bg-slate-100 text-gray-700';
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="4.2"
          subtitle="Review and update your strategic initiatives"
          estimatedTime={20}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="4.2"
        subtitle="Review your strategic initiatives - what continues, gets removed, or deferred?"
        estimatedTime={20}
        tip="Focus on what moves the needle for your targets"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{changes.carriedForward.length}</div>
          <div className="text-xs text-gray-600">Continuing</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{changes.removed.length}</div>
          <div className="text-xs text-gray-600">Removed</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{changes.deferred.length}</div>
          <div className="text-xs text-gray-600">Deferred</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-900">{changes.added.length}</div>
          <div className="text-xs text-gray-600">New</div>
        </div>
      </div>

      {/* Current Initiatives */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-gray-600" />
          Current Strategic Initiatives
        </h3>

        {initiatives.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
            <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">No strategic initiatives found. Add new ones below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {initiatives.map(initiative => {
              const status = getInitiativeStatus(initiative.id);

              return (
                <div
                  key={initiative.id}
                  className={`rounded-xl border p-4 transition-all ${
                    status === 'carried' ? 'bg-gray-50 border-slate-200' :
                    status === 'removed' ? 'bg-gray-50 border-slate-200 opacity-60' :
                    status === 'deferred' ? 'bg-gray-50 border-slate-200' :
                    'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h4 className={`font-medium ${status === 'removed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        {initiative.title}
                      </h4>
                      {initiative.description && (
                        <p className="text-sm text-gray-600 mt-1">{initiative.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(initiative.category)}`}>
                          {initiative.category}
                        </span>
                        {status !== 'unchanged' && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            status === 'carried' ? 'bg-slate-200 text-brand-navy' :
                            status === 'removed' ? 'bg-slate-200 text-brand-navy' :
                            'bg-slate-200 text-brand-navy'
                          }`}>
                            {status === 'carried' ? 'Continuing' :
                             status === 'removed' ? 'Removing' :
                             `Deferred to ${changes.deferred.find(d => d.id === initiative.id)?.toQuarter}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => status === 'carried' ? resetInitiative(initiative.id) : carryForward(initiative.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        status === 'carried'
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-brand-orange-100 hover:text-brand-orange-700'
                      }`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Continue
                    </button>
                    <button
                      onClick={() => deferInitiative(initiative.id, getNextQuarter())}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        status === 'deferred'
                          ? 'bg-brand-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-brand-orange-100 hover:text-brand-orange-700'
                      }`}
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Defer
                    </button>
                    <button
                      onClick={() => status === 'removed' ? resetInitiative(initiative.id) : removeInitiative(initiative.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        status === 'removed'
                          ? 'bg-gray-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-700'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Initiatives */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-gray-600" />
            New Initiatives for {getNextQuarter()}
          </h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
          >
            {showAddForm ? 'Cancel' : 'Add New'}
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
            <div className="space-y-3">
              <input
                type="text"
                value={newInitiative.title}
                onChange={(e) => setNewInitiative({ ...newInitiative, title: e.target.value })}
                placeholder="Initiative title..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
              />
              <div className="flex gap-3">
                <select
                  value={newInitiative.category}
                  onChange={(e) => setNewInitiative({ ...newInitiative, category: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="growth">Growth</option>
                  <option value="efficiency">Efficiency</option>
                  <option value="innovation">Innovation</option>
                  <option value="culture">Culture</option>
                  <option value="financial">Financial</option>
                </select>
                <input
                  type="text"
                  value={newInitiative.description}
                  onChange={(e) => setNewInitiative({ ...newInitiative, description: e.target.value })}
                  placeholder="Brief description (optional)..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange"
                />
              </div>
              <button
                onClick={addNewInitiative}
                disabled={!newInitiative.title.trim()}
                className="w-full py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed"
              >
                Add Initiative
              </button>
            </div>
          </div>
        )}

        {/* Added Initiatives */}
        {changes.added.length > 0 ? (
          <div className="space-y-2">
            {changes.added.map((init, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
              >
                <div>
                  <span className="font-medium text-gray-900">{init.title}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${getCategoryColor(init.category)}`}>
                    {init.category}
                  </span>
                </div>
                <button
                  onClick={() => removeNewInitiative(index)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-700">
            No new initiatives added yet. Click "Add New" to create one.
          </p>
        )}
      </div>
    </div>
  );
}
