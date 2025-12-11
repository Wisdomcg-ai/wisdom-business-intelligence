'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SwotItem as SwotItemType } from '@/lib/swot/types';
import {
  Edit2,
  Trash2,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Hash
} from 'lucide-react';

interface SwotItemProps {
  item: SwotItemType;
  onUpdate: (updates: Partial<SwotItemType>) => void;
  onDelete: () => void;
  isReadOnly?: boolean;
  color?: string;
  bgColor?: string;
  recurrenceCount?: number;
}

export function SwotItem({
  item,
  onUpdate,
  onDelete,
  isReadOnly = false,
  recurrenceCount
}: SwotItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [editImpact, setEditImpact] = useState(item.impact_level);
  const [editLikelihood, setEditLikelihood] = useState(item.likelihood || 3);
  const [editTags, setEditTags] = useState((item.tags || []).join(', '));
  const [showActions, setShowActions] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  // Handle save
  const handleSave = () => {
    if (editTitle.trim()) {
      const updates: Partial<SwotItemType> = {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        impact_level: editImpact as 1 | 2 | 3 | 4 | 5,
        likelihood: editLikelihood as 1 | 2 | 3 | 4 | 5,
        tags: editTags ? editTags.split(',').map(tag => tag.trim()).filter(Boolean) : []
      };

      onUpdate(updates);
      setIsEditing(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setEditTitle(item.title);
    setEditDescription(item.description || '');
    setEditImpact(item.impact_level);
    setEditLikelihood(item.likelihood || 3);
    setEditTags((item.tags || []).join(', '));
    setIsEditing(false);
  };

  // Handle delete confirmation
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      onDelete();
    }
  };

  // Get impact label - plain English for SME owners
  const getImpactLabel = (level: number): string => {
    const labels = ['Tiny', 'Small', 'Medium', 'Large', 'Huge'];
    return labels[level - 1] || 'Medium';
  };

  // Get actionability label - plain English for SME owners
  const getActionabilityLabel = (level: number): string => {
    const labels = ['Very Hard', 'Hard', 'Moderate', 'Easy', 'Very Easy'];
    return labels[level - 1] || 'Moderate';
  };

  // Calculate Focus Score (Impact × Actionability)
  const getFocusScore = (): number => {
    return item.impact_level * (item.likelihood || 3);
  };

  // Get Focus Score badge style - this is the ONLY colored badge now
  const getFocusBadgeStyle = (): { className: string; icon: string } => {
    const score = getFocusScore();
    if (score >= 16) return { className: 'bg-orange-100 text-orange-800 border border-orange-300', icon: '🔥' };
    if (score >= 9) return { className: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '⚡' };
    if (score >= 6) return { className: 'bg-blue-100 text-blue-800 border border-blue-300', icon: '📌' };
    return { className: 'bg-gray-100 text-gray-600 border border-gray-200', icon: '📋' };
  };

  // Render edit mode
  if (isEditing) {
    return (
      <div className="p-4 rounded-lg border-2 border-blue-400 bg-white">
        {/* Title */}
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSave()}
          className="w-full px-3 py-2 text-base font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          placeholder="Title"
        />

        {/* Description */}
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 resize-none"
          placeholder="Description (optional)"
          rows={2}
        />

        {/* Impact Level - "How Big?" */}
        <div className="mb-3">
          <label className="text-sm text-gray-700 font-medium">How Big? (Impact)</label>
          <div className="flex space-x-1 mt-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setEditImpact(level as 1 | 2 | 3 | 4 | 5)}
                className={`
                  flex-1 py-2 text-sm rounded-lg transition-colors font-medium
                  ${editImpact === level
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
                title={getImpactLabel(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">1 = Tiny, 5 = Huge</p>
        </div>

        {/* Actionability - "Can We Act?" */}
        <div className="mb-3">
          <label className="text-sm text-gray-700 font-medium">Can We Act? (Actionability)</label>
          <div className="flex space-x-1 mt-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setEditLikelihood(level as 1 | 2 | 3 | 4 | 5)}
                className={`
                  flex-1 py-2 text-sm rounded-lg transition-colors font-medium
                  ${editLikelihood === level
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
                title={getActionabilityLabel(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">1 = Out of our control, 5 = Easy to act on</p>
        </div>

        {/* Tags */}
        <input
          type="text"
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          placeholder="Tags (comma-separated)"
        />

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
          >
            <Check className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  // Render view mode - CLEAN white card design
  const focusBadge = getFocusBadgeStyle();

  return (
    <div
      className={`
        group p-4 rounded-lg border border-gray-200 bg-white transition-all
        ${!isReadOnly ? 'hover:shadow-md hover:border-gray-300 cursor-pointer' : ''}
        ${item.status === 'carried-forward' ? 'border-dashed' : 'border-solid'}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mr-2 mt-1 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <div className="flex-1 flex items-start gap-2 flex-wrap">
              <h4 className="text-base font-medium text-gray-900 flex-1 min-w-0">
                {item.title}
              </h4>
              {/* Focus Score - primary visual indicator */}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium ${focusBadge.className}`}>
                {focusBadge.icon} {getFocusScore()}
              </span>
              {recurrenceCount && recurrenceCount > 0 && (
                <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200" title={`Appeared in ${recurrenceCount} previous quarter${recurrenceCount > 1 ? 's' : ''}`}>
                  🔄 {recurrenceCount}Q
                </span>
              )}
            </div>
          </div>

          {/* Collapsed view - minimal info */}
          {!isExpanded && (
            <div className="flex items-center mt-2 ml-6 space-x-3 text-sm text-gray-500">
              <span>Impact: {item.impact_level}</span>
              <span>•</span>
              <span>Actionability: {item.likelihood || 3}</span>
              {item.tags && item.tags.length > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center">
                    <Hash className="h-3.5 w-3.5 mr-0.5" />
                    {item.tags.length}
                  </span>
                </>
              )}
              {item.description && (
                <>
                  <span>•</span>
                  <MessageSquare className="h-3.5 w-3.5" />
                </>
              )}
            </div>
          )}

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-3 ml-6 space-y-3">
              {/* Description */}
              {item.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
              )}

              {/* Metadata - clean gray badges */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-700">
                  Impact: {getImpactLabel(item.impact_level)} ({item.impact_level})
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-700">
                  Actionability: {getActionabilityLabel(item.likelihood || 3)} ({item.likelihood || 3})
                </span>
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${focusBadge.className}`}>
                  {focusBadge.icon} Focus Score: {getFocusScore()}
                </span>
                {item.status === 'carried-forward' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-amber-100 text-amber-700">
                    Carried Forward
                  </span>
                )}
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm bg-gray-50 text-gray-600 border border-gray-200"
                    >
                      <Hash className="h-3 w-3 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isReadOnly && showActions && (
          <div className="flex items-center space-x-1 ml-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
