'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import { StepHeader } from '../StepHeader';
import type { QuarterlyReview, PeopleReview, PersonAssessment, HiringNeed, PersonAction } from '../../types';
import { getDefaultPeopleReview } from '../../types';
import {
  Users, Plus, Trash2, UserPlus, Loader2, Briefcase, GraduationCap, Lightbulb
} from 'lucide-react';

interface PeopleReviewStepProps {
  review: QuarterlyReview;
  onUpdate: (review: PeopleReview) => void;
}

const ACTION_OPTIONS: { value: PersonAction; label: string; color: string }[] = [
  { value: 'retain', label: 'Retain', color: 'bg-green-100 text-green-700' },
  { value: 'develop', label: 'Develop', color: 'bg-blue-100 text-blue-700' },
  { value: 'performance_manage', label: 'Perf. Manage', color: 'bg-amber-100 text-amber-700' },
  { value: 'replace', label: 'Replace', color: 'bg-red-100 text-red-700' },
];

const PRIORITY_OPTIONS: { value: HiringNeed['priority']; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
  { value: 'next_quarter', label: 'Next Quarter', color: 'bg-amber-100 text-amber-700' },
  { value: 'future', label: 'Future', color: 'bg-gray-100 text-gray-700' },
];

export function PeopleReviewStep({ review, onUpdate }: PeopleReviewStepProps) {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();
  const [isLoading, setIsLoading] = useState(true);
  const [showHiringForm, setShowHiringForm] = useState(false);
  const [newHiringRole, setNewHiringRole] = useState('');
  const [newHiringPriority, setNewHiringPriority] = useState<HiringNeed['priority']>('next_quarter');
  const [newHiringNotes, setNewHiringNotes] = useState('');

  const peopleReview: PeopleReview = { ...getDefaultPeopleReview(), ...(review.people_review || {}) };

  // Fetch team roster from business_profiles
  useEffect(() => {
    fetchTeamRoster();
  }, []);

  const fetchTeamRoster = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const targetUserId = activeBusiness?.ownerId || user.id;

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('key_roles, owner_info')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (profile && peopleReview.assessments.length === 0) {
        const assessments: PersonAssessment[] = [];

        // Add owner if info available
        if (profile.owner_info) {
          const ownerInfo = typeof profile.owner_info === 'string'
            ? JSON.parse(profile.owner_info)
            : profile.owner_info;

          if (ownerInfo?.name) {
            assessments.push({
              name: ownerInfo.name,
              role: 'Owner',
              action: 'retain',
              notes: ''
            });
          }
        }

        // Add key roles
        if (profile.key_roles) {
          const roles = typeof profile.key_roles === 'string'
            ? JSON.parse(profile.key_roles)
            : profile.key_roles;

          if (Array.isArray(roles)) {
            roles.forEach((role: any) => {
              if (role.name || role.title) {
                assessments.push({
                  name: role.name || role.person || '',
                  role: role.title || role.role || '',
                  action: 'retain',
                  notes: ''
                });
              }
            });
          }
        }

        if (assessments.length > 0) {
          onUpdate({ ...peopleReview, assessments });
        }
      }
    } catch (err) {
      console.error('[PeopleReview] Error fetching team roster:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateAssessment = (index: number, field: keyof PersonAssessment, value: any) => {
    const updated = [...peopleReview.assessments];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ ...peopleReview, assessments: updated });
  };

  const addPerson = () => {
    const newPerson: PersonAssessment = {
      name: '',
      role: '',
      action: 'retain',
      notes: ''
    };
    onUpdate({ ...peopleReview, assessments: [...peopleReview.assessments, newPerson] });
  };

  const removePerson = (index: number) => {
    const updated = peopleReview.assessments.filter((_, i) => i !== index);
    onUpdate({ ...peopleReview, assessments: updated });
  };

  const addHiringNeed = () => {
    if (!newHiringRole.trim()) return;
    const need: HiringNeed = {
      role: newHiringRole.trim(),
      priority: newHiringPriority,
      notes: newHiringNotes.trim()
    };
    onUpdate({ ...peopleReview, hiringNeeds: [...peopleReview.hiringNeeds, need] });
    setNewHiringRole('');
    setNewHiringPriority('next_quarter');
    setNewHiringNotes('');
    setShowHiringForm(false);
  };

  const removeHiringNeed = (index: number) => {
    const updated = peopleReview.hiringNeeds.filter((_, i) => i !== index);
    onUpdate({ ...peopleReview, hiringNeeds: updated });
  };

  const updateField = (field: 'capacityNotes' | 'trainingNeeds', value: string) => {
    onUpdate({ ...peopleReview, [field]: value });
  };

  if (isLoading) {
    return (
      <div>
        <StepHeader
          step="2.5"
          subtitle="Review your team's performance and plan for people needs"
          estimatedTime={15}
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
        step="2.5"
        subtitle="Assess your team, identify development needs, and plan for hiring"
        estimatedTime={15}
        tip="Right people, right seats — it's the foundation of growth"
      />

      {/* Team Assessments Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-brand-orange-50 to-slate-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-orange" />
              <h3 className="font-semibold text-gray-900">Team Assessment</h3>
              <span className="text-sm text-gray-500">({peopleReview.assessments.length} people)</span>
            </div>
            <button
              onClick={addPerson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Person
            </button>
          </div>
        </div>

        <div className="p-5">
          {peopleReview.assessments.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h4 className="font-semibold text-gray-700 mb-2">No Team Members</h4>
              <p className="text-sm text-gray-500 mb-4">Add your team members to review their performance</p>
              <button
                onClick={addPerson}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600"
              >
                <Plus className="w-4 h-4" />
                Add First Team Member
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-3 w-[22%]">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-3 w-[22%]">Role</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-3 w-[18%]">Action</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 px-3">Comments</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {peopleReview.assessments.map((person, index) => (
                    <tr key={index} className="border-b border-gray-100 last:border-b-0 group">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={person.name}
                          onChange={(e) => updateAssessment(index, 'name', e.target.value)}
                          placeholder="Full name"
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={person.role}
                          onChange={(e) => updateAssessment(index, 'role', e.target.value)}
                          placeholder="Job title"
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={person.action}
                          onChange={(e) => updateAssessment(index, 'action', e.target.value as PersonAction)}
                          className={`w-full px-2 py-1.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-orange focus:border-transparent ${
                            ACTION_OPTIONS.find(o => o.value === person.action)?.color || 'bg-white text-gray-700'
                          }`}
                        >
                          {ACTION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={person.notes}
                          onChange={(e) => updateAssessment(index, 'notes', e.target.value)}
                          placeholder="Key observations..."
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removePerson(index)}
                          className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add Person Row */}
              <button
                onClick={addPerson}
                className="w-full mt-3 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-brand-orange-400 hover:text-brand-orange transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Another Person
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hiring Needs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Hiring Needs</h3>
            </div>
            <button
              onClick={() => setShowHiringForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Role
            </button>
          </div>
        </div>

        <div className="p-5">
          {peopleReview.hiringNeeds.length === 0 && !showHiringForm ? (
            <p className="text-sm text-gray-400 italic text-center py-4">No hiring needs identified yet</p>
          ) : (
            <div className="space-y-3">
              {peopleReview.hiringNeeds.map((need, index) => {
                const priorityOption = PRIORITY_OPTIONS.find(p => p.value === need.priority);
                return (
                  <div key={index} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <Briefcase className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 text-sm">{need.role}</span>
                      {need.notes && (
                        <p className="text-xs text-gray-500 truncate">{need.notes}</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityOption?.color || ''}`}>
                      {priorityOption?.label}
                    </span>
                    <button
                      onClick={() => removeHiringNeed(index)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Hiring Form */}
          {showHiringForm && (
            <div className="mt-4 bg-brand-orange-50 rounded-xl border border-brand-orange-200 p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">New Hiring Need</h4>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newHiringRole}
                  onChange={(e) => setNewHiringRole(e.target.value)}
                  placeholder="Role title (e.g., Sales Manager)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => setNewHiringPriority(option.value)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          newHiringPriority === option.value
                            ? `${option.color} ring-2 ring-brand-orange ring-opacity-30`
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={newHiringNotes}
                  onChange={(e) => setNewHiringNotes(e.target.value)}
                  placeholder="Notes about this role..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addHiringNeed}
                    disabled={!newHiringRole.trim()}
                    className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    Add Role
                  </button>
                  <button
                    onClick={() => { setShowHiringForm(false); setNewHiringRole(''); setNewHiringNotes(''); }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Capacity & Training */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Capacity Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Capacity Notes</h3>
          </div>
          <textarea
            value={peopleReview.capacityNotes}
            onChange={(e) => updateField('capacityNotes', e.target.value)}
            placeholder="Are you over or under capacity? Any resource constraints or bottlenecks?"
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none text-sm"
          />
        </div>

        {/* Training Needs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Training Needs</h3>
          </div>
          <textarea
            value={peopleReview.trainingNeeds}
            onChange={(e) => updateField('trainingNeeds', e.target.value)}
            placeholder="What skills or training does the team need? Any certifications or development programs?"
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none text-sm"
          />
        </div>
      </div>

      {/* Coaching Tip */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Think about it this way</h4>
            <p className="text-sm text-gray-600 mt-1">
              For each person, ask: &quot;If they resigned tomorrow, would I fight to keep them?&quot;
              That gut reaction often tells you more than any rating system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
