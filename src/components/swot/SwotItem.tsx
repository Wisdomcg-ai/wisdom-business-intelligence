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
  color = 'text-gray-700',
  bgColor = 'bg-gray-50',
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
        likelihood: editLikelihood as 1 | 2 | 3 | 4 | 5, // Now applies to ALL quadrants (actionability)
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

  // Get sentiment-based color for impact/actionability badges
  // For Strengths/Opportunities: high = green (good!)
  // For Weaknesses/Threats: high = red (bad!)
  const getSentimentColor = (level: number, isPositiveQuadrant: boolean): string => {
    if (isPositiveQuadrant) {
      // Strengths & Opportunities: high is good
      if (level >= 4) return 'text-green-700 bg-green-100';
      if (level === 3) return 'text-yellow-700 bg-yellow-100';
      return 'text-gray-600 bg-gray-100';
    } else {
      // Weaknesses & Threats: high is bad
      if (level >= 4) return 'text-red-700 bg-red-100';
      if (level === 3) return 'text-yellow-700 bg-yellow-100';
      return 'text-gray-600 bg-gray-100';
    }
  };

  // Check if this is a positive quadrant (strength/opportunity)
  const isPositiveQuadrant = item.category === 'strength' || item.category === 'opportunity';

  // Get border color based on sentiment (category) and score intensity
  const getSentimentBorderColor = (): string => {
    const focusScore = getFocusScore();
    const intensity = focusScore >= 16 ? '500' : focusScore >= 9 ? '400' : focusScore >= 6 ? '300' : '200';

    if (isPositiveQuadrant) {
      return `border-l-4 border-l-green-${intensity}`;
    } else {
      return `border-l-4 border-l-red-${intensity}`;
    }
  };

  // Calculate Focus Score (Impact × Actionability) - applies to ALL quadrants now
  const getFocusScore = (): number => {
    return item.impact_level * (item.likelihood || 3);
  };

  // Get Focus Score badge style based on urgency
  const getFocusBadgeStyle = (): { className: string; icon: string } => {
    const score = getFocusScore();
    if (score >= 16) return { className: 'bg-brand-orange-100 text-brand-orange-800 border border-brand-orange-300', icon: '🔥' };
    if (score >= 9) return { className: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '⚡' };
    if (score >= 6) return { className: 'bg-blue-100 text-blue-800 border border-blue-300', icon: '📌' };
    return { className: 'bg-gray-100 text-gray-600 border border-gray-300', icon: '📋' };
  };
  
  // Render edit mode
  if (isEditing) {
    return (
      <div className={`p-4 rounded-lg border-2 border-brand-orange-400 ${bgColor}`}>
        {/* Title */}
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSave()}
          className="w-full px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2"
          placeholder="Title"
        />
        
        {/* Description */}
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2 resize-none"
          placeholder="Description (optional)"
          rows={2}
        />
        
        {/* Impact Level - "How Big?" */}
        <div className="mb-2">
          <label className="text-xs text-gray-600 font-medium">How Big? (Impact)</label>
          <div className="flex space-x-1 mt-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setEditImpact(level as 1 | 2 | 3 | 4 | 5)}
                className={`
                  flex-1 py-1 text-xs rounded transition-colors
                  ${editImpact === level
                    ? 'bg-brand-orange text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }
                `}
                title={getImpactLabel(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">1 = Tiny, 5 = Huge</p>
        </div>

        {/* Actionability - "Can We Act?" - Now applies to ALL quadrants */}
        <div className="mb-2">
          <label className="text-xs text-gray-600 font-medium">Can We Act? (Actionability)</label>
          <div className="flex space-x-1 mt-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setEditLikelihood(level as 1 | 2 | 3 | 4 | 5)}
                className={`
                  flex-1 py-1 text-xs rounded transition-colors
                  ${editLikelihood === level
                    ? 'bg-brand-orange text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }
                `}
                title={getActionabilityLabel(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">1 = Out of our control, 5 = Easy to act on</p>
        </div>
        
        {/* Tags */}
        <input
          type="text"
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2"
          placeholder="Tags (comma-separated)"
        />
        
        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleCancel}
            className="p-1.5 text-gray-600 hover:text-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 text-green-600 hover:text-green-800"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }
  
  // Render view mode
  const focusBadge = getFocusBadgeStyle();

  return (
    <div
      className={`
        group p-3 rounded-lg border transition-all
        ${bgColor} ${color}
        ${!isReadOnly ? 'hover:shadow-sm cursor-pointer' : ''}
        ${item.status === 'carried-forward' ? 'border-dashed' : 'border-solid'}
        ${getSentimentBorderColor()}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Title and expand button */}
          <div className="flex items-start">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mr-1 mt-0.5 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            <div className="flex-1 flex items-start gap-2">
              <h4 className="text-sm font-medium truncate pr-2 flex-1">
                {item.title}
              </h4>
              {recurrenceCount && recurrenceCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap" title={`Appeared in ${recurrenceCount} previous quarter${recurrenceCount > 1 ? 's' : ''}`}>
                  🔄 {recurrenceCount}Q
                </span>
              )}
            </div>
          </div>

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-2 ml-4 space-y-2">
              {/* Description */}
              {item.description && (
                <p className="text-xs text-gray-600">{item.description}</p>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap gap-2">
                {/* Impact - sentiment-aware colors */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSentimentColor(item.impact_level, isPositiveQuadrant)}`}>
                  How Big: {getImpactLabel(item.impact_level)}
                </span>

                {/* Actionability - neutral colors (always shows now) */}
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                  Can Act: {getActionabilityLabel(item.likelihood || 3)}
                </span>

                {/* Focus Score with icon */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${focusBadge.className}`}>
                  {focusBadge.icon} Focus: {getFocusScore()}
                </span>

                {/* Status */}
                {item.status === 'carried-forward' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-orange-100 text-brand-orange-700">
                    Carried Forward
                  </span>
                )}
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                    >
                      <Hash className="h-2.5 w-2.5 mr-0.5" />
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
          <div className="flex items-center space-x-1 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 text-gray-400 hover:text-brand-orange transition-colors"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Quick stats (always visible) */}
      {!isExpanded && (
        <div className="flex items-center mt-2 ml-4 space-x-2 flex-wrap gap-y-1">
          {/* Impact Badge - sentiment-aware */}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSentimentColor(item.impact_level, isPositiveQuadrant)}`}>
            {getImpactLabel(item.impact_level)}
          </span>

          {/* Actionability Badge - now shows for all quadrants */}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
            {getActionabilityLabel(item.likelihood || 3)}
          </span>

          {/* Focus Score with icon */}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${focusBadge.className}`}>
            {focusBadge.icon} {getFocusScore()}
          </span>

          {/* Tags indicator */}
          {item.tags && item.tags.length > 0 && (
            <span className="flex items-center text-xs text-gray-500">
              <Hash className="h-3 w-3 mr-0.5" />
              {item.tags.length}
            </span>
          )}

          {/* Description indicator */}
          {item.description && (
            <span className="flex items-center text-xs text-gray-500">
              <MessageSquare className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}