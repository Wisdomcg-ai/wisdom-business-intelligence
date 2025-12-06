// /src/components/todos/CoachDashboard.tsx
// Coach dashboard for viewing all clients' progress

import React, { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/auth-helpers-nextjs'
import type { CoachClient } from './utils/types'
import { Users, TrendingUp, AlertCircle, CheckCircle2, X } from 'lucide-react'

interface CoachDashboardProps {
  coachId: string
  supabase: SupabaseClient
  onClose: () => void
}

export function CoachDashboard({ coachId, supabase, onClose }: CoachDashboardProps) {
  const [clients, setClients] = useState<CoachClient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  
  useEffect(() => {
    loadClientsData()
  }, [])
  
  async function loadClientsData() {
    try {
      setLoading(true)
      
      // Load all businesses associated with this coach
      // This is a simplified version - you'd need to set up proper coach-client relationships
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select(`
          id,
          business_name,
          owner_id,
          profiles!inner(full_name)
        `)
        .limit(10)
      
      if (error) throw error
      
      // For each business, get task statistics
      const clientsData: CoachClient[] = []
      
      for (const business of businesses || []) {
        const { data: todos } = await supabase
          .from('todo_items')
          .select('*')
          .eq('business_id', business.id)
        
        const totalTasks = todos?.length || 0
        const completedTasks = todos?.filter(t => t.status === 'completed').length || 0
        const overdueTasks = todos?.filter(t => {
          if (!t.due_date || t.status === 'completed') return false
          return new Date(t.due_date) < new Date()
        }).length || 0
        
        // Count MUSTs completed this week
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - 7)
        const mustsCompletedThisWeek = todos?.filter(t => 
          t.is_must && 
          t.status === 'completed' && 
          t.completed_at && 
          new Date(t.completed_at) > weekStart
        ).length || 0
        
        clientsData.push({
          id: business.id,
          business_id: business.id,
          business_name: business.business_name,
          owner_name: (business as any).profiles?.full_name || 'Unknown',
          last_activity: todos?.[0]?.updated_at || null,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          overdue_tasks: overdueTasks,
          musts_completed_this_week: mustsCompletedThisWeek
        })
      }
      
      setClients(clientsData)
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const getHealthColor = (client: CoachClient) => {
    const completionRate = client.total_tasks > 0 
      ? (client.completed_tasks / client.total_tasks) * 100 
      : 0
    
    if (client.overdue_tasks > 5) return 'text-red-600 bg-red-50'
    if (completionRate < 30) return 'text-brand-orange-600 bg-brand-orange-50'
    if (completionRate > 70) return 'text-green-600 bg-green-50'
    return 'text-yellow-600 bg-yellow-50'
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-orange to-brand-navy p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold mb-2">Coach Dashboard</h2>
              <p className="text-brand-orange-100">Monitor all client progress and engagement</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4"></div>
              <p className="text-gray-600">Loading client data...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No clients found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-brand-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-brand-orange">
                    {clients.length}
                  </div>
                  <div className="text-sm text-gray-600">Active Clients</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {clients.reduce((sum, c) => sum + c.completed_tasks, 0)}
                  </div>
                  <div className="text-sm text-gray-600">Tasks Completed</div>
                </div>
                <div className="bg-brand-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-brand-orange-600">
                    {clients.reduce((sum, c) => sum + c.overdue_tasks, 0)}
                  </div>
                  <div className="text-sm text-gray-600">Overdue Tasks</div>
                </div>
                <div className="bg-brand-navy-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-brand-navy">
                    {clients.reduce((sum, c) => sum + c.musts_completed_this_week, 0)}
                  </div>
                  <div className="text-sm text-gray-600">MUSTs This Week</div>
                </div>
              </div>
              
              {/* Client List */}
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MUSTs/Week
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Overdue
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Health
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Active
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clients.map((client) => {
                      const completionRate = client.total_tasks > 0 
                        ? Math.round((client.completed_tasks / client.total_tasks) * 100)
                        : 0
                      
                      return (
                        <tr 
                          key={client.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedClient(client.id)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {client.business_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {client.owner_name}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-brand-orange h-2 rounded-full"
                                  style={{ width: `${completionRate}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600">
                                {completionRate}%
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {client.completed_tasks}/{client.total_tasks} tasks
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {client.musts_completed_this_week}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`
                              text-sm font-medium
                              ${client.overdue_tasks > 0 ? 'text-red-600' : 'text-gray-400'}
                            `}>
                              {client.overdue_tasks}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`
                              px-2 py-1 text-xs font-medium rounded-full
                              ${getHealthColor(client)}
                            `}>
                              {client.overdue_tasks > 5 ? 'At Risk' :
                               completionRate > 70 ? 'Excellent' :
                               completionRate > 30 ? 'Good' : 'Needs Attention'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {client.last_activity 
                              ? new Date(client.last_activity).toLocaleDateString()
                              : 'Never'
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}