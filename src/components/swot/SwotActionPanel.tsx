'use client';

import React, { useState, useEffect } from 'react';
import { SwotItem, SwotActionItem, ActionType, Priority } from '@/lib/swot/types';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Target,
  User,
  Calendar,
  Flag
} from 'lucide-react';

interface SwotActionPanelProps {
  swotAnalysisId: string;
  swotItems: SwotItem[];
}

export function SwotActionPanel({ swotAnalysisId, swotItems }: SwotActionPanelProps) {
  const [actionItems, setActionItems] = useState<SwotActionItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SwotItem | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // Form state for new action
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionType, setActionType] = useState<ActionType>('pursue');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  // Load existing action items
  useEffect(() => {
    loadActionItems();
  }, [swotAnalysisId]);
  
  const loadActionItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('swot_action_items')
        .select('*')
        .eq('swot_analysis_id', swotAnalysisId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setActionItems(data || []);
    } catch (err) {
      console.error('Error loading action items:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Create new action item
  const handleCreateAction = async () => {
    if (!actionTitle.trim() || !selectedItem) return;
    
    try {
      // For testing, use a fallback user ID if auth fails
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'test-user-123';
      
      const { data, error } = await supabase
        .from('swot_action_items')
        .insert({
          swot_item_id: selectedItem.id,
          swot_analysis_id: swotAnalysisId,
          title: actionTitle.trim(),
          description: actionDescription.trim(),
          action_type: actionType,
          priority,
          assigned_to_email: assignedTo,
          due_date: dueDate || null,
          created_by: userId
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setActionItems([data, ...actionItems]);
      
      // Reset form
      setActionTitle('');
      setActionDescription('');
      setActionType('pursue');
      setPriority('medium');
      setAssignedTo('');
      setDueDate('');
      setSelectedItem(null);
      setIsCreating(false);
    } catch (err) {
      console.error('Error creating action item:', err);
    }
  };
  
  // Update action item status
  const handleUpdateStatus = async (actionId: string, status: SwotActionItem['status']) => {
    try {
      const updates: any = { status };
      if (status === 'completed') {
        updates.completed_date = new Date().toISOString();
        updates.progress_percentage = 100;
      }
      
      const { error } = await supabase
        .from('swot_action_items')
        .update(updates)
        .eq('id', actionId);
      
      if (error) throw error;
      
      setActionItems(actionItems.map(item =>
        item.id === actionId ? { ...item, ...updates } : item
      ));
    } catch (err) {
      console.error('Error updating action item:', err);
    }
  };
  
  // Get action type for SWOT category
  const getDefaultActionType = (category: SwotItem['category']): ActionType => {
    switch (category) {
      case 'strength': return 'leverage';
      case 'weakness': return 'improve';
      case 'opportunity': return 'pursue';
      case 'threat': return 'mitigate';
      default: return 'monitor';
    }
  };
  
  // Get priority color
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'critical': return 'text-red-700 bg-red-100';
      case 'high': return 'text-brand-orange-700 bg-brand-orange-100';
      case 'medium': return 'text-yellow-700 bg-yellow-100';
      case 'low': return 'text-green-700 bg-green-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };
  
  // Get status color
  const getStatusColor = (status: SwotActionItem['status']) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-100';
      case 'in-progress': return 'text-brand-orange-700 bg-brand-orange-100';
      case 'pending': return 'text-yellow-700 bg-yellow-100';
      case 'cancelled': return 'text-gray-700 bg-gray-100';
      case 'deferred': return 'text-brand-navy-700 bg-brand-navy-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };
  
  const pendingActions = actionItems.filter(a => a.status === 'pending').length;
  const inProgressActions = actionItems.filter(a => a.status === 'in-progress').length;
  const completedActions = actionItems.filter(a => a.status === 'completed').length;
  
  return (
    <div className="fixed bottom-0 right-0 w-96 bg-white border-l border-t border-gray-200 shadow-lg rounded-tl-lg max-h-[600px] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Action Items</h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="p-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        
        {/* Stats */}
        <div className="flex items-center space-x-4 mt-2 text-xs">
          <span className="flex items-center text-yellow-600">
            <Clock className="h-3 w-3 mr-1" />
            {pendingActions} Pending
          </span>
          <span className="flex items-center text-brand-orange">
            <AlertCircle className="h-3 w-3 mr-1" />
            {inProgressActions} In Progress
          </span>
          <span className="flex items-center text-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            {completedActions} Completed
          </span>
        </div>
      </div>
      
      {/* Create Form */}
      {isCreating && (
        <div className="px-6 py-4 border-b border-gray-200 bg-brand-orange-50">
          {/* SWOT Item Selection */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-700">Related SWOT Item</label>
            <select
              value={selectedItem?.id || ''}
              onChange={(e) => {
                const item = swotItems.find(i => i.id === e.target.value);
                setSelectedItem(item || null);
                if (item) {
                  setActionType(getDefaultActionType(item.category));
                }
              }}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-orange"
            >
              <option value="">Select a SWOT item...</option>
              {swotItems.map(item => (
                <option key={item.id} value={item.id}>
                  [{item.category}] {item.title}
                </option>
              ))}
            </select>
          </div>
          
          {/* Action Title */}
          <input
            type="text"
            placeholder="Action title..."
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2"
          />
          
          {/* Action Description */}
          <textarea
            placeholder="Description (optional)..."
            value={actionDescription}
            onChange={(e) => setActionDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-orange mb-2 resize-none"
            rows={2}
          />
          
          {/* Action Type & Priority */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-600">Type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value="leverage">Leverage</option>
                <option value="improve">Improve</option>
                <option value="pursue">Pursue</option>
                <option value="mitigate">Mitigate</option>
                <option value="monitor">Monitor</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          
          {/* Assigned To & Due Date */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="email"
              placeholder="Assigned to..."
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>
          
          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                setIsCreating(false);
                setActionTitle('');
                setActionDescription('');
                setSelectedItem(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateAction}
              disabled={!actionTitle.trim() || !selectedItem}
              className={`px-3 py-1.5 text-sm text-white rounded-md ${
                actionTitle.trim() && selectedItem
                  ? 'bg-brand-orange hover:bg-brand-orange-600'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Create Action
            </button>
          </div>
        </div>
      )}
      
      {/* Action Items List */}
      <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
        {loading ? (
          <div className="p-6 text-center text-gray-500">
            Loading action items...
          </div>
        ) : actionItems.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <Target className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No action items yet</p>
            <p className="text-xs mt-1">Click + to create your first action</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {actionItems.map(action => (
              <div key={action.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">
                      {action.title}
                    </h4>
                    {action.description && (
                      <p className="text-xs text-gray-600 mt-1">
                        {action.description}
                      </p>
                    )}
                    
                    <div className="flex items-center space-x-3 mt-2">
                      {/* Priority */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(action.priority)}`}>
                        <Flag className="h-3 w-3 mr-1" />
                        {action.priority}
                      </span>
                      
                      {/* Status */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(action.status)}`}>
                        {action.status}
                      </span>
                      
                      {/* Assigned To */}
                      {action.assigned_to_email && (
                        <span className="inline-flex items-center text-xs text-gray-500">
                          <User className="h-3 w-3 mr-1" />
                          {action.assigned_to_email}
                        </span>
                      )}
                      
                      {/* Due Date */}
                      {action.due_date && (
                        <span className="inline-flex items-center text-xs text-gray-500">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(action.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Quick Status Update */}
                  {action.status !== 'completed' && action.status !== 'cancelled' && (
                    <select
                      value={action.status}
                      onChange={(e) => handleUpdateStatus(action.id, e.target.value as SwotActionItem['status'])}
                      className="ml-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-orange"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="deferred">Deferred</option>
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}