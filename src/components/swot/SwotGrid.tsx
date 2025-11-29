'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  SwotItem, 
  SwotCategory, 
  SwotGridData,
  getCategoryColor,
  getCategoryIcon 
} from '@/lib/swot/types';
import { SwotItem as SwotItemComponent } from './SwotItem';
import { Plus, Lightbulb, AlertTriangle, Target, Shield, Info } from 'lucide-react';

interface SwotGridProps {
  items: SwotGridData;
  onAddItem: (category: SwotCategory, title: string, description?: string) => void;
  onUpdateItem: (itemId: string, updates: Partial<SwotItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onReorderItems: (category: SwotCategory, items: SwotItem[]) => void;
  isReadOnly?: boolean;
  recurringItems?: Map<string, number>;
}

interface CategorySection {
  category: SwotCategory;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

export function SwotGrid({
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  isReadOnly = false,
  recurringItems = new Map()
}: SwotGridProps) {
  const [activeCategory, setActiveCategory] = useState<SwotCategory | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [showAddForm, setShowAddForm] = useState<SwotCategory | null>(null);
  const [draggedItem, setDraggedItem] = useState<SwotItem | null>(null);
  const [draggedOverCategory, setDraggedOverCategory] = useState<SwotCategory | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState<{ [key in SwotCategory]?: boolean }>({});

  // Helper function to get correct plural form of category
  const getCategoryKey = (category: SwotCategory): keyof SwotGridData => {
    switch (category) {
      case 'strength':
        return 'strengths';
      case 'weakness':
        return 'weaknesses';
      case 'opportunity':
        return 'opportunities';
      case 'threat':
        return 'threats';
    }
  };

  // Define category sections with their properties
  const categorySections: CategorySection[] = [
    {
      category: 'strength',
      title: 'Strengths',
      description: 'Internal positive factors that give you an advantage',
      icon: <Shield className="h-5 w-5" />,
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      category: 'weakness',
      title: 'Weaknesses',
      description: 'Internal negative factors that need improvement',
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      category: 'opportunity',
      title: 'Opportunities',
      description: 'External positive factors you can capitalize on',
      icon: <Target className="h-5 w-5" />,
      color: 'text-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200'
    },
    {
      category: 'threat',
      title: 'Threats',
      description: 'External negative factors that could cause problems',
      icon: <Lightbulb className="h-5 w-5" />,
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  // Coaching help content for each category
  const categoryHelp: Record<SwotCategory, { prompts: string[]; examples: { strong: string; weak: string }; ratingGuidance: string }> = {
    strength: {
      prompts: [
        "What do customers say you do better than competitors?",
        "What unique resources, skills, or assets do you have?",
        "What processes or systems give you an edge?",
        "Jim Collins: What could you be the best in the world at?"
      ],
      examples: {
        strong: '"Exclusive 10-year supplier contract with major brand" - Specific, defensible advantage',
        weak: '"Good customer service" - Too vague, not measurable, hard to defend'
      },
      ratingGuidance: "Rate each strength by its IMPACT: How much competitive advantage does it give you? High-impact strengths (4-5) should be your foundation."
    },
    weakness: {
      prompts: [
        "Where do competitors consistently beat you?",
        "What do you avoid or struggle with internally?",
        "What complaints come up repeatedly from customers or staff?",
        "What resources, skills, or capabilities are you missing?"
      ],
      examples: {
        strong: '"No marketing expertise on team, relied 100% on referrals" - Specific, actionable',
        weak: '"Need to improve sales" - Too vague, what specifically needs improvement?'
      },
      ratingGuidance: "Rate each weakness by its IMPACT: How much is it holding you back? High-impact weaknesses (4-5) need immediate action plans."
    },
    opportunity: {
      prompts: [
        "What market trends are creating new demand?",
        "Are there underserved customer segments you could reach?",
        "What changes in regulations, technology, or economy help you?",
        "Could you leverage your strengths in new ways or markets?"
      ],
      examples: {
        strong: '"New zoning allows commercial construction in 3 nearby zones" - Specific, time-sensitive',
        weak: '"Grow into new markets" - Too vague, which markets and why now?'
      },
      ratingGuidance: "Rate IMPACT (potential value) and PROBABILITY (likelihood of success). High scores (4-5 on both) = pursue aggressively."
    },
    threat: {
      prompts: [
        "What are competitors doing that could hurt your business?",
        "What market trends are working against you?",
        "Are there regulatory, economic, or tech changes that threaten you?",
        "What would happen if your biggest customer left?"
      ],
      examples: {
        strong: '"Major competitor opened location 2 blocks away" - Specific, urgent, requires response',
        weak: '"Increased competition" - Too general, what specifically threatens you?'
      },
      ratingGuidance: "Rate IMPACT (potential damage) and URGENCY (how soon will it hit?). High scores (4-5 on both) = need mitigation plans NOW."
    }
  };

  const toggleHelp = (category: SwotCategory) => {
    setShowHelp(prev => ({ ...prev, [category]: !prev[category] }));
  };
  
  // Handle adding new item
  const handleSubmitNewItem = (category: SwotCategory) => {
    if (newItemTitle.trim()) {
      onAddItem(category, newItemTitle.trim(), newItemDescription.trim());
      setNewItemTitle('');
      setNewItemDescription('');
      setShowAddForm(null);
    }
  };
  
  // Handle drag start
  const handleDragStart = (item: SwotItem, category: SwotCategory) => {
    if (isReadOnly) return;
    setDraggedItem(item);
    setActiveCategory(category);
  };
  
  // Handle drag over
  const handleDragOver = (e: React.DragEvent, category: SwotCategory, index?: number) => {
    e.preventDefault();
    if (isReadOnly) return;
    setDraggedOverCategory(category);
    if (index !== undefined) {
      setDraggedOverIndex(index);
    }
  };
  
  // Handle drop
  const handleDrop = (e: React.DragEvent, targetCategory: SwotCategory, targetIndex?: number) => {
    e.preventDefault();
    if (isReadOnly || !draggedItem || !activeCategory) return;

    const categoryKey = getCategoryKey(targetCategory);
    const sourceCategoryKey = getCategoryKey(activeCategory);
    
    if (activeCategory === targetCategory) {
      // Reordering within the same category
      const categoryItems = [...items[categoryKey]];
      const draggedIndex = categoryItems.findIndex(item => item.id === draggedItem.id);
      
      if (draggedIndex !== -1 && targetIndex !== undefined && draggedIndex !== targetIndex) {
        categoryItems.splice(draggedIndex, 1);
        categoryItems.splice(targetIndex, 0, draggedItem);
        onReorderItems(targetCategory, categoryItems);
      }
    } else {
      // Moving between categories
      const updatedItem = { ...draggedItem, category: targetCategory };
      onUpdateItem(draggedItem.id, { category: targetCategory });
    }
    
    // Reset drag state
    setDraggedItem(null);
    setActiveCategory(null);
    setDraggedOverCategory(null);
    setDraggedOverIndex(null);
  };
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItem(null);
    setActiveCategory(null);
    setDraggedOverCategory(null);
    setDraggedOverIndex(null);
  };
  
  // Get items for a category
  const getCategoryItems = (category: SwotCategory): SwotItem[] => {
    const categoryKey = getCategoryKey(category);
    return items[categoryKey] || [];
  };
  
  // Render category section
  const renderCategorySection = (section: CategorySection) => {
    const categoryItems = getCategoryItems(section.category);
    const isAddingItem = showAddForm === section.category;
    const isDraggedOver = draggedOverCategory === section.category;
    
    return (
      <div
        key={section.category}
        className={`
          bg-white rounded-lg shadow-sm border-2 p-6 relative
          ${isDraggedOver ? 'border-teal-400 bg-teal-50' : section.borderColor}
          ${!isReadOnly ? 'hover:shadow-md transition-shadow' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, section.category)}
        onDrop={(e) => handleDrop(e, section.category, categoryItems.length)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg ${section.bgColor}`}>
              {section.icon}
            </div>
            <div>
              <h3 className={`text-2xl font-semibold ${section.color}`}>
                {section.title}
              </h3>
              <p className="text-base text-gray-600 mt-0.5">
                {section.description}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => toggleHelp(section.category)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Toggle help"
            >
              <Info className="w-5 h-5" />
            </button>
            <span className={`text-sm font-medium ${section.color}`}>
              {categoryItems.length} items
            </span>
            {!isReadOnly && (
              <button
                onClick={() => setShowAddForm(isAddingItem ? null : section.category)}
                className={`
                  p-1.5 rounded-md transition-colors
                  ${isAddingItem
                    ? 'bg-gray-200 text-gray-600'
                    : `${section.bgColor} ${section.color} hover:opacity-80`
                  }
                `}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Help Section */}
        {showHelp[section.category] && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-base font-medium text-gray-800 mb-3">💡 Strategic Questions:</p>
            <ul className="text-base text-gray-700 space-y-2 mb-4">
              {categoryHelp[section.category].prompts.map((prompt, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-teal-600 mr-2">•</span>
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>

            <div className="border-t border-gray-200 pt-3 mt-3 mb-3">
              <p className="text-base font-medium text-gray-800 mb-2">📊 Priority Rating:</p>
              <p className="text-base text-gray-700 bg-teal-50 p-2 rounded border border-teal-200">
                {categoryHelp[section.category].ratingGuidance}
              </p>
            </div>

            <div className="border-t border-gray-200 pt-3 mt-3">
              <p className="text-base font-medium text-gray-800 mb-2">Examples:</p>
              <div className="space-y-2">
                <div className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <p className="text-base text-gray-700">{categoryHelp[section.category].examples.strong}</p>
                </div>
                <div className="flex items-start">
                  <span className="text-red-600 font-bold mr-2">✗</span>
                  <p className="text-base text-gray-700">{categoryHelp[section.category].examples.weak}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Add Item Form */}
        {isAddingItem && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <input
              type="text"
              placeholder="Title (required)"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitNewItem(section.category)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={newItemDescription}
              onChange={(e) => setNewItemDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2 resize-none"
              rows={2}
            />
            <p className="text-xs text-gray-500 mb-2">
              💡 Click any item after adding to rate its impact and {section.category === 'threat' ? 'urgency' : section.category === 'opportunity' ? 'probability' : 'importance'}
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowAddForm(null);
                  setNewItemTitle('');
                  setNewItemDescription('');
                }}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitNewItem(section.category)}
                disabled={!newItemTitle.trim()}
                className={`
                  px-3 py-1 text-sm text-white rounded-md
                  ${newItemTitle.trim()
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-gray-400 cursor-not-allowed'
                  }
                `}
              >
                Add Item
              </button>
            </div>
          </div>
        )}
        
        {/* Items List */}
        <div className="space-y-2 min-h-[100px]">
          {categoryItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-base">No {section.title.toLowerCase()} identified</p>
              {!isReadOnly && (
                <p className="text-sm mt-1">Click + to add your first item</p>
              )}
            </div>
          ) : (
            categoryItems.map((item, index) => (
              <div
                key={item.id}
                draggable={!isReadOnly}
                onDragStart={() => handleDragStart(item, section.category)}
                onDragOver={(e) => handleDragOver(e, section.category, index)}
                onDrop={(e) => handleDrop(e, section.category, index)}
                onDragEnd={handleDragEnd}
                className={`
                  ${draggedOverIndex === index ? 'opacity-50' : ''}
                  ${!isReadOnly ? 'cursor-move' : ''}
                `}
              >
                <SwotItemComponent
                  item={item}
                  onUpdate={(updates) => onUpdateItem(item.id, updates)}
                  onDelete={() => onDeleteItem(item.id)}
                  isReadOnly={isReadOnly}
                  color={section.color}
                  bgColor={section.bgColor}
                  recurrenceCount={recurringItems.get(item.id)}
                />
              </div>
            ))
          )}
        </div>
        
        {/* Drop zone indicator */}
        {isDraggedOver && categoryItems.length === 0 && (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-teal-400 pointer-events-none">
            <div className="flex items-center justify-center h-full">
              <p className="text-teal-600 font-medium">Drop here</p>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {/* Strengths - Top Left */}
      {renderCategorySection(categorySections[0])}

      {/* Weaknesses - Top Right */}
      {renderCategorySection(categorySections[1])}

      {/* Opportunities - Bottom Left */}
      {renderCategorySection(categorySections[2])}

      {/* Threats - Bottom Right */}
      {renderCategorySection(categorySections[3])}
    </div>
  );
}