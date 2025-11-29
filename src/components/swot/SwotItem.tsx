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
        tags: editTags ? editTags.split(',').map(tag => tag.trim()).filter(Boolean) : []
      };
      
      // Include likelihood for opportunities and threats
      if (item.category === 'opportunity' || item.category === 'threat') {
        updates.likelihood = editLikelihood as 1 | 2 | 3 | 4 | 5;
      }
      
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
  
  // Get impact/likelihood label
  const getImpactLabel = (level: number): string => {
    const labels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
    return labels[level - 1] || 'Medium';
  };
  
  // Get impact/likelihood color
  const getImpactColor = (level: number): string => {
    if (level <= 2) return 'text-green-600 bg-green-100';
    if (level === 3) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  // Get border color based on priority
  const getPriorityBorderColor = (): string => {
    const priorityScore = getPriorityScore();
    if (priorityScore) {
      // For opportunities and threats with priority score
      if (priorityScore >= 16) return 'border-l-4 border-l-red-500'; // Critical
      if (priorityScore >= 9) return 'border-l-4 border-l-orange-500'; // High
      if (priorityScore >= 6) return 'border-l-4 border-l-yellow-500'; // Medium
      return 'border-l-4 border-l-green-500'; // Low
    } else {
      // For strengths and weaknesses (just impact)
      if (item.impact_level >= 4) return 'border-l-4 border-l-red-500'; // High impact
      if (item.impact_level === 3) return 'border-l-4 border-l-yellow-500'; // Medium impact
      return 'border-l-4 border-l-green-500'; // Low impact
    }
  };

  // Get context-appropriate label for likelihood
  const getLikelihoodLabel = (): string => {
    if (item.category === 'threat') return 'Urgency';
    if (item.category === 'opportunity') return 'Probability';
    return 'Likelihood';
  };
  
  // Calculate priority score (for opportunities and threats)
  const getPriorityScore = (): number | null => {
    if (item.category === 'opportunity' || item.category === 'threat') {
      return item.impact_level * (item.likelihood || 3);
    }
    return null;
  };
  
  // Render edit mode
  if (isEditing) {
    return (
      <div className={`p-4 rounded-lg border-2 border-teal-400 ${bgColor}`}>
        {/* Title */}
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSave()}
          className="w-full px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
          placeholder="Title"
        />
        
        {/* Description */}
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2 resize-none"
          placeholder="Description (optional)"
          rows={2}
        />
        
        {/* Impact Level */}
        <div className="mb-2">
          <label className="text-xs text-gray-600 font-medium">Impact Level</label>
          <div className="flex space-x-1 mt-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setEditImpact(level as 1 | 2 | 3 | 4 | 5)}
                className={`
                  flex-1 py-1 text-xs rounded transition-colors
                  ${editImpact === level 
                    ? 'bg-teal-600 text-white' 
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }
                `}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        
        {/* Likelihood (for opportunities and threats) */}
        {(item.category === 'opportunity' || item.category === 'threat') && (
          <div className="mb-2">
            <label className="text-xs text-gray-600 font-medium">{getLikelihoodLabel()}</label>
            <div className="flex space-x-1 mt-1">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  onClick={() => setEditLikelihood(level as 1 | 2 | 3 | 4 | 5)}
                  className={`
                    flex-1 py-1 text-xs rounded transition-colors
                    ${editLikelihood === level
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }
                  `}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Tags */}
        <input
          type="text"
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
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
  return (
    <div
      className={`
        group p-3 rounded-lg border transition-all
        ${bgColor} ${color}
        ${!isReadOnly ? 'hover:shadow-sm cursor-pointer' : ''}
        ${item.status === 'carried-forward' ? 'border-dashed' : 'border-solid'}
        ${getPriorityBorderColor()}
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
                {/* Impact */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getImpactColor(item.impact_level)}`}>
                  Impact: {getImpactLabel(item.impact_level)}
                </span>
                
                {/* Likelihood */}
                {item.likelihood && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getImpactColor(item.likelihood)}`}>
                    {getLikelihoodLabel()}: {getImpactLabel(item.likelihood)}
                  </span>
                )}
                
                {/* Priority Score */}
                {getPriorityScore() && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                    Score: {getPriorityScore()}
                  </span>
                )}
                
                {/* Status */}
                {item.status === 'carried-forward' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">
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
              className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
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
        <div className="flex items-center mt-2 ml-4 space-x-2 flex-wrap">
          {/* Impact Badge */}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getImpactColor(item.impact_level)}`}>
            Impact: {getImpactLabel(item.impact_level)}
          </span>

          {/* Likelihood/Urgency Badge for Opportunities and Threats */}
          {item.likelihood && (item.category === 'opportunity' || item.category === 'threat') && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getImpactColor(item.likelihood)}`}>
              {getLikelihoodLabel()}: {getImpactLabel(item.likelihood)}
            </span>
          )}

          {/* Priority Score */}
          {getPriorityScore() && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
              Priority: {getPriorityScore()}
            </span>
          )}

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