'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Database } from '@/types/database.types';

// Type definitions
interface ClientData {
  id: string;
  business_name: string;
  industry?: string;
  revenue_stage?: string;
  created_at: string;
  latest_assessment?: {
    id: string;
    health_score: number;
    health_status: string;
    completed_at: string;
    days_since: number;
  };
}

export default function CoachDashboard() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'activity'>('activity');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Load all businesses with their latest assessment
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select(`
          id,
          business_name,
          industry,
          revenue_stage,
          created_at,
          assessments (
            id,
            health_score,
            health_status,
            completed_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading clients:', error);
        return;
      }

      // Process the data to include latest assessment
      const processedClients = (businesses || []).map(business => {
        const assessments = business.assessments || [];
        const latestAssessment = assessments.sort((a: any, b: any) => 
          new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        )[0];

        let clientData: ClientData = {
          id: business.id,
          business_name: business.business_name,
          industry: business.industry,
          revenue_stage: business.revenue_stage,
          created_at: business.created_at
        };

        if (latestAssessment) {
          const daysSince = Math.floor(
            (Date.now() - new Date(latestAssessment.completed_at).getTime()) / (1000 * 60 * 60 * 24)
          );

          clientData.latest_assessment = {
            id: latestAssessment.id,
            health_score: latestAssessment.health_score || 0,
            health_status: latestAssessment.health_status || 'Unknown',
            completed_at: latestAssessment.completed_at,
            days_since: daysSince
          };
        }

        return clientData;
      });

      setClients(processedClients);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get status color and emoji
  const getStatusIndicator = (status?: string) => {
    if (!status) return { color: 'bg-gray-200', emoji: '❓', textColor: 'text-gray-600' };
    
    switch (status.toUpperCase()) {
      case 'THRIVING':
        return { color: 'bg-green-500', emoji: '🟢', textColor: 'text-green-600' };
      case 'STRONG':
        return { color: 'bg-green-400', emoji: '🟢', textColor: 'text-green-500' };
      case 'STABLE':
        return { color: 'bg-yellow-400', emoji: '🟡', textColor: 'text-yellow-600' };
      case 'BUILDING':
        return { color: 'bg-orange-400', emoji: '🟠', textColor: 'text-orange-600' };
      case 'STRUGGLING':
        return { color: 'bg-red-400', emoji: '🔴', textColor: 'text-red-500' };
      case 'URGENT':
        return { color: 'bg-red-600', emoji: '🔴', textColor: 'text-red-600' };
      default:
        return { color: 'bg-gray-200', emoji: '❓', textColor: 'text-gray-600' };
    }
  };

  // Filter and sort clients
  const filteredClients = clients
    .filter(client => {
      const matchesSearch = client.business_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === 'all' || 
        client.latest_assessment?.health_status?.toUpperCase() === filterStatus.toUpperCase();
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.business_name.localeCompare(b.business_name);
        case 'score':
          return (b.latest_assessment?.health_score || 0) - (a.latest_assessment?.health_score || 0);
        case 'activity':
          return (a.latest_assessment?.days_since || 999) - (b.latest_assessment?.days_since || 999);
        default:
          return 0;
      }
    });

  // Calculate analytics
  const analytics = {
    totalClients: clients.length,
    averageScore: clients.reduce((acc, c) => acc + (c.latest_assessment?.health_score || 0), 0) / clients.length || 0,
    needingAttention: clients.filter(c => 
      c.latest_assessment?.health_status === 'URGENT' || 
      c.latest_assessment?.health_status === 'STRUGGLING'
    ).length,
    overdue: clients.filter(c => 
      !c.latest_assessment || c.latest_assessment.days_since > 90
    ).length,
    statusCounts: {
      thriving: clients.filter(c => c.latest_assessment?.health_status === 'THRIVING').length,
      strong: clients.filter(c => c.latest_assessment?.health_status === 'STRONG').length,
      stable: clients.filter(c => c.latest_assessment?.health_status === 'STABLE').length,
      building: clients.filter(c => c.latest_assessment?.health_status === 'BUILDING').length,
      struggling: clients.filter(c => c.latest_assessment?.health_status === 'STRUGGLING').length,
      urgent: clients.filter(c => c.latest_assessment?.health_status === 'URGENT').length,
      unassessed: clients.filter(c => !c.latest_assessment).length
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">
                Coach Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Manage your client portfolio</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              Back to Main Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Clients</h3>
            <p className="text-3xl font-bold text-gray-900">{analytics.totalClients}</p>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Average Health Score</h3>
            <p className="text-3xl font-bold text-teal-600">{analytics.averageScore.toFixed(1)}%</p>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Needing Attention</h3>
            <p className="text-3xl font-bold text-orange-600">{analytics.needingAttention}</p>
            <p className="text-xs text-gray-500 mt-1">Struggling or Urgent</p>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Assessment Overdue</h3>
            <p className="text-3xl font-bold text-red-600">{analytics.overdue}</p>
            <p className="text-xs text-gray-500 mt-1">90+ days</p>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Health Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(analytics.statusCounts).map(([status, count]) => {
              const indicator = getStatusIndicator(status === 'unassessed' ? undefined : status);
              return (
                <div key={status} className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${indicator.color} bg-opacity-20 mb-2`}>
                    <span className="text-2xl">{indicator.emoji}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500 capitalize">{status}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Status</option>
              <option value="thriving">Thriving</option>
              <option value="strong">Strong</option>
              <option value="stable">Stable</option>
              <option value="building">Building</option>
              <option value="struggling">Struggling</option>
              <option value="urgent">Urgent</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            >
              <option value="activity">Sort by Activity</option>
              <option value="name">Sort by Name</option>
              <option value="score">Sort by Score</option>
            </select>
          </div>
        </div>

        {/* Client Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => {
            const indicator = getStatusIndicator(client.latest_assessment?.health_status);
            const needsAttention = !client.latest_assessment || client.latest_assessment.days_since > 90;
            
            return (
              <div
                key={client.id}
                className={`bg-white rounded-xl shadow-lg p-6 border-2 transition-all hover:shadow-xl cursor-pointer ${
                  needsAttention ? 'border-red-200' : 'border-gray-100'
                }`}
                onClick={() => router.push(`/assessment/results?businessId=${client.id}`)}
              >
                {/* Status Badge */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">
                      {client.business_name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {client.industry || 'Industry not specified'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{indicator.emoji}</span>
                  </div>
                </div>

                {/* Metrics */}
                {client.latest_assessment ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Health Score</span>
                      <span className="text-lg font-bold text-gray-900">
                        {client.latest_assessment.health_score.toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Status</span>
                      <span className={`text-sm font-medium ${indicator.textColor}`}>
                        {client.latest_assessment.health_status}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Last Assessment</span>
                      <span className={`text-sm font-medium ${
                        client.latest_assessment.days_since > 90 ? 'text-red-600' :
                        client.latest_assessment.days_since > 60 ? 'text-orange-600' :
                        'text-green-600'
                      }`}>
                        {client.latest_assessment.days_since === 0 ? 'Today' :
                         client.latest_assessment.days_since === 1 ? 'Yesterday' :
                         `${client.latest_assessment.days_since} days ago`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-red-600 font-medium">No Assessment</p>
                    <p className="text-red-500 text-sm mt-1">Needs initial assessment</p>
                  </div>
                )}

                {/* Revenue Stage */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Revenue Stage</span>
                    <span className="text-sm font-medium text-gray-900">
                      {client.revenue_stage || 'Not specified'}
                    </span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/business-profile?id=${client.id}`);
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement scheduling
                      alert('Scheduling feature coming soon!');
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredClients.length === 0 && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <p className="text-gray-500 text-lg">No clients found matching your criteria</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
        )}

        {/* Alert Section */}
        {(analytics.needingAttention > 0 || analytics.overdue > 0) && (
          <div className="mt-8 bg-white rounded-xl shadow-lg p-6 border-2 border-orange-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ Requires Attention</h3>
            <div className="space-y-3">
              {clients.filter(c => c.latest_assessment?.health_status === 'URGENT').map(client => (
                <div key={client.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="font-medium text-red-900">{client.business_name}</span>
                  <span className="text-sm text-red-600">URGENT STATUS</span>
                </div>
              ))}
              {clients.filter(c => !c.latest_assessment || c.latest_assessment.days_since > 90).map(client => (
                <div key={client.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                  <span className="font-medium text-orange-900">{client.business_name}</span>
                  <span className="text-sm text-orange-600">
                    {!client.latest_assessment ? 'Never assessed' : `${client.latest_assessment.days_since} days overdue`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
