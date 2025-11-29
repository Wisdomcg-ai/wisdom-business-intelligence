'use client'

import {
  Calendar,
  Users,
  Clock,
  MessageSquare,
  Target,
  TrendingUp,
  CheckCircle,
  Star
} from 'lucide-react'
import { MetricCard, MiniMetric } from './MetricCard'

interface CoachPerformanceData {
  sessionsThisMonth: number
  sessionsLastMonth: number
  totalClients: number
  activeClients: number
  avgSessionDuration: number
  responseTime: number // hours
  clientRetention: number // percentage
  avgClientHealth: number // percentage
  goalsCompleted: number
  actionsCompleted: number
  messagesThisWeek: number
}

interface CoachPerformanceProps {
  data: CoachPerformanceData
  period?: 'week' | 'month' | 'quarter' | 'year'
}

export function CoachPerformance({ data, period = 'month' }: CoachPerformanceProps) {
  const sessionTrend = data.sessionsLastMonth > 0
    ? Math.round(((data.sessionsThisMonth - data.sessionsLastMonth) / data.sessionsLastMonth) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Coach Performance</h2>
        <select className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="year">This Year</option>
        </select>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Sessions Completed"
          value={data.sessionsThisMonth}
          trend={{
            value: sessionTrend,
            label: 'vs last month'
          }}
          icon={Calendar}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-100"
        />
        <MetricCard
          title="Active Clients"
          value={data.activeClients}
          subtitle={`of ${data.totalClients} total`}
          icon={Users}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
        />
        <MetricCard
          title="Client Retention"
          value={`${data.clientRetention}%`}
          trend={{
            value: 5,
            label: 'vs last quarter',
            isPositive: true
          }}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
        />
        <MetricCard
          title="Avg Response Time"
          value={`${data.responseTime}h`}
          subtitle="to client messages"
          icon={MessageSquare}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
        />
      </div>

      {/* Secondary Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Activity Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{data.avgSessionDuration}m</p>
              <p className="text-sm text-gray-500">Avg Session</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{data.goalsCompleted}</p>
              <p className="text-sm text-gray-500">Goals Completed</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{data.actionsCompleted}</p>
              <p className="text-sm text-gray-500">Actions Done</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{data.messagesThisWeek}</p>
              <p className="text-sm text-gray-500">Messages/Week</p>
            </div>
          </div>
        </div>
      </div>

      {/* Client Health Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Average Client Health</h3>
          <span className={`text-2xl font-bold ${
            data.avgClientHealth >= 70 ? 'text-green-600' :
            data.avgClientHealth >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {data.avgClientHealth}%
          </span>
        </div>
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              data.avgClientHealth >= 70 ? 'bg-green-500' :
              data.avgClientHealth >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${data.avgClientHealth}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Struggling</span>
          <span>Stable</span>
          <span>Thriving</span>
        </div>
      </div>
    </div>
  )
}

export default CoachPerformance
