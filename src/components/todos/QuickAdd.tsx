// QuickAdd.tsx - Natural language quick add input component
// Location: /src/components/todos/QuickAdd.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Calendar,
  Hash,
  AtSign,
  Repeat,
  Zap,
  HelpCircle,
  X
} from 'lucide-react';
import { parseTaskInput, validateParsedTask } from './utils/naturalLanguage';
import { ParsedTask } from './utils/types';
import { toast } from 'sonner';

interface QuickAddProps {
  onAdd: (task: ParsedTask) => Promise<void>;
  assigneeOptions?: string[];
  defaultAssignee?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onClose?: () => void;
}

export default function QuickAdd({
  onAdd,
  assigneeOptions = [],
  defaultAssignee,
  placeholder = "What needs to be done?",
  autoFocus = true,
  onClose
}: QuickAddProps) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParsedTask | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAssigneeHint, setShowAssigneeHint] = useState(false);
  const [filteredAssignees, setFilteredAssignees] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<'today' | 'this-week' | 'next-week' | 'backlog' | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus input on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);
  
  // Parse input in real-time for preview
  useEffect(() => {
    if (input.trim().length > 0) {
      try {
        const parsed = parseTaskInput(input);
        const validationErrors = validateParsedTask(parsed);
        
        if (validationErrors.length > 0) {
          setErrors(validationErrors);
          setPreview(null);
        } else {
          setPreview(parsed);
          setErrors([]);
        }
      } catch (err) {
        setErrors(['Invalid input format']);
        setPreview(null);
      }
    } else {
      setPreview(null);
      setErrors([]);
    }
    
    // Check for @ symbol to show assignee hints
    if (input.includes('@') && assigneeOptions.length > 0) {
      const atIndex = input.lastIndexOf('@');
      const searchTerm = input.slice(atIndex + 1).split(' ')[0].toLowerCase();
      const filtered = assigneeOptions.filter(name => 
        name.toLowerCase().includes(searchTerm)
      );
      setFilteredAssignees(filtered);
      setShowAssigneeHint(filtered.length > 0);
    } else {
      setShowAssigneeHint(false);
    }
  }, [input, assigneeOptions]);
  
  // Handle form submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!preview || errors.length > 0) {
      toast.error('Please fix errors before adding task');
      return;
    }
    
    setIsLoading(true);
    try {
      // Add default assignee if not specified
      const taskToAdd = {
        ...preview,
        assigned_to: preview.assigned_to || defaultAssignee
      };
      
      await onAdd(taskToAdd);
      setInput('');
      setPreview(null);
      toast.success('Task added successfully!');
      
      // Keep focus on input for rapid entry
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (err) {
      console.error('Error adding task:', err);
      toast.error('Failed to add task. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle assignee selection from hint
  const selectAssignee = (name: string) => {
    const atIndex = input.lastIndexOf('@');
    const beforeAt = input.slice(0, atIndex);
    const afterAt = input.slice(atIndex + 1);
    const afterAtWords = afterAt.split(' ');
    afterAtWords[0] = name.toLowerCase();
    setInput(beforeAt + '@' + afterAtWords.join(' '));
    setShowAssigneeHint(false);
    inputRef.current?.focus();
  };
  
  // Add date shortcut to input
  const addDateToInput = (dateType: 'today' | 'this-week' | 'next-week' | 'backlog') => {
    setSelectedDate(dateType);
    let newInput = input.replace(/ today| tomorrow| this week| next week/gi, '').trim();
    
    switch (dateType) {
      case 'today':
        setInput(newInput + ' today');
        break;
      case 'this-week':
        setInput(newInput + ' this week');
        break;
      case 'next-week':
        setInput(newInput + ' next week');
        break;
      case 'backlog':
        // Remove any date from input for backlog
        setInput(newInput);
        break;
    }
    inputRef.current?.focus();
  };
  
  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    
    // Close on Escape
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
    
    // Show help on ?
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      setShowHelp(!showHelp);
    }
  };
  
  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <div className="absolute left-3 flex items-center pointer-events-none">
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={`
              w-full pl-10 pr-32 py-3 text-base
              border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-brand-orange
              ${errors.length > 0 ? 'border-red-300' : 'border-gray-300'}
              ${isLoading ? 'bg-gray-50' : 'bg-white'}
            `}
          />
          
          <div className="absolute right-3 flex items-center gap-2">
            {/* Help button */}
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Show shortcuts (Shift+?)"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            
            {/* Submit button */}
            <button
              type="submit"
              disabled={!preview || errors.length > 0 || isLoading}
              className={`
                px-4 py-1.5 rounded-md font-medium transition-colors
                ${preview && errors.length === 0 && !isLoading
                  ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isLoading ? 'Adding...' : 'Add Task'}
            </button>
            
            {/* Close button if onClose is provided */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Error messages */}
        {errors.length > 0 && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
            <ul className="text-sm text-red-600 space-y-1">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Preview */}
        {preview && errors.length === 0 && (
          <div className="mt-2 p-3 bg-brand-orange-50 border border-brand-orange-200 rounded-md">
            <div className="text-sm text-brand-navy">
              <div className="font-medium mb-1">Task Preview:</div>
              <div className="space-y-1 text-brand-orange-700">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Title:</span>
                  <span>{preview.title}</span>
                </div>
                {preview.due_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Due: {new Date(preview.due_date).toLocaleDateString()}
                      {preview.time && ` at ${preview.time}`}
                    </span>
                  </div>
                )}
                {preview.priority === 'important' && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 font-medium">❗ Important</span>
                  </div>
                )}
                {preview.category && (
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    <span>{preview.category}</span>
                  </div>
                )}
                {preview.assigned_to && (
                  <div className="flex items-center gap-2">
                    <AtSign className="w-4 h-4" />
                    <span>{preview.assigned_to}</span>
                  </div>
                )}
                {preview.recurrence_pattern && (
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4" />
                    <span>{preview.recurrence_pattern}</span>
                  </div>
                )}
                {preview.effort_size === 'quick-win' && (
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>Quick Win (2 min)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Assignee hints */}
        {showAssigneeHint && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-1">Select assignee:</div>
              {filteredAssignees.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectAssignee(name)}
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
                >
                  @{name}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Help overlay */}
        {showHelp && (
          <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Quick Add Shortcuts</h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium text-gray-700 mb-1">📅 Dates</div>
                <div className="text-gray-600 space-y-0.5">
                  <div><code>today</code>, <code>tomorrow</code>, <code>friday</code></div>
                  <div><code>this week</code> (due Friday), <code>next week</code></div>
                  <div><code>dec 15</code>, <code>12/25</code></div>
                  <div>Add time: <code>3pm</code>, <code>15:30</code></div>
                  <div className="text-xs text-gray-500 mt-1">No date = goes to Backlog</div>
                </div>
              </div>
              
              <div>
                <div className="font-medium text-gray-700 mb-1">❗ Priority</div>
                <div className="text-gray-600">
                  Add <code>!</code> or <code>!!</code> anywhere for important
                </div>
              </div>
              
              <div>
                <div className="font-medium text-gray-700 mb-1">🔄 Recurring</div>
                <div className="text-gray-600 space-y-0.5">
                  <div><code>daily</code>, <code>weekly</code>, <code>monthly</code></div>
                  <div><code>every monday</code>, <code>weekdays</code></div>
                </div>
              </div>
              
              <div>
                <div className="font-medium text-gray-700 mb-1">👤 Assignment</div>
                <div className="text-gray-600">
                  Use <code>@name</code> to assign to someone
                </div>
              </div>
              
              <div>
                <div className="font-medium text-gray-700 mb-1">⚡ Quick Win</div>
                <div className="text-gray-600">
                  Add <code>quick</code> or <code>2 min</code> for quick wins
                </div>
              </div>
              
              <div className="pt-2 border-t border-gray-200">
                <div className="text-gray-500">
                  <div>Press <kbd>Enter</kbd> to add task</div>
                  <div>Press <kbd>Esc</kbd> to close</div>
                  <div>Press <kbd>Shift+?</kbd> to toggle help</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}