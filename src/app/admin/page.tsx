'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/admin/AdminLayout'
import { StatsCard } from '@/components/admin/StatsCard'
import { Badge } from '@/components/admin/Badge'
import { ToastProvider, useToast } from '@/components/admin/Toast'
import {
  Building2,
  Users,
  Briefcase,
  TrendingUp,
  AlertCircle,
  Clock,
  Send,
  Plus,
  ArrowRight,
  Mail,
  UserPlus,
  CheckCircle,
  Calendar,
  Loader2,
  ExternalLink
} from 'lucide-react'

interface DashboardStats {
  totalClients: number
  activeClients: number
  pendingClients: number
  totalCoaches: number
  unassignedClients: number
  pendingInvitations: number
  newThisMonth: number
}

interface PendingInvitation {
  id: string
  business_name: string
  created_at: string
}

interface UnassignedClient {
  id: string
  business_name: string
  industry: string | null
  created_at: string
}

interface RecentActivity {
  id: string
  type: 'client_added' | 'invitation_sent' | 'coach_assigned'
  title: string
  subtitle: string
  timestamp: string
}

function DashboardContent() {
  const supabase = createClient()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeClients: 0,
    pendingClients: 0,
    totalCoaches: 0,
    unassignedClients: 0,
    pendingInvitations: 0,
    newThisMonth: 0
  })
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [unassignedClients, setUnassignedClients] = useState<UnassignedClient[]>([])
  const [sendingInvitation, setSendingInvitation] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    try {
      // Load clients
      const { data: clients } = await supabase
        .from('businesses')
        .select('id, business_name, industry, status, assigned_coach_id, invitation_sent, temp_password, created_at')
        .order('created_at', { ascending: false })

      // Load coaches
      const { data: coaches } = await supabase
        .from('users')
        .select('id')
        .in('system_role', ['coach', 'super_admin'])

      if (clients) {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        const pending = clients.filter(c => !c.invitation_sent && c.temp_password)
        const unassigned = clients.filter(c => !c.assigned_coach_id)

        setStats({
          totalClients: clients.length,
          activeClients: clients.filter(c => c.status === 'active').length,
          pendingClients: clients.filter(c => c.status === 'pending').length,
          totalCoaches: coaches?.length || 0,
          unassignedClients: unassigned.length,
          pendingInvitations: pending.length,
          newThisMonth: clients.filter(c => new Date(c.created_at) >= startOfMonth).length
        })

        setPendingInvitations(pending.slice(0, 5))
        setUnassignedClients(unassigned.slice(0, 5))
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  async function sendInvitation(clientId: string, clientName: string) {
    setSendingInvitation(clientId)
    try {
      const response = await fetch('/api/clients/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: clientId })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send invitation')
      }

      toast.success('Invitation sent!', `${clientName} will receive their login details shortly.`)
      await loadDashboardData()
    } catch (error) {
      toast.error('Failed to send invitation', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setSendingInvitation(null)
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your coaching business</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-500/20"
        >
          <Plus className="w-4 h-4" />
          Add New Client
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Clients"
          value={stats.totalClients}
          icon={Building2}
          iconColor="teal"
          onClick={() => window.location.href = '/admin/clients'}
        />
        <StatsCard
          title="Active Clients"
          value={stats.activeClients}
          icon={CheckCircle}
          iconColor="green"
          subtitle={`${Math.round((stats.activeClients / Math.max(stats.totalClients, 1)) * 100)}% of total`}
        />
        <StatsCard
          title="Coaches"
          value={stats.totalCoaches}
          icon={Briefcase}
          iconColor="purple"
          onClick={() => window.location.href = '/admin/coaches'}
        />
        <StatsCard
          title="New This Month"
          value={stats.newThisMonth}
          icon={TrendingUp}
          iconColor="blue"
        />
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Invitations */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Pending Invitations</h2>
                <p className="text-sm text-slate-500">{stats.pendingInvitations} clients awaiting invite</p>
              </div>
            </div>
            {stats.pendingInvitations > 0 && (
              <Badge variant="warning" pulse>{stats.pendingInvitations}</Badge>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {pendingInvitations.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-slate-600 font-medium">All caught up!</p>
                <p className="text-slate-400 text-sm">No pending invitations</p>
              </div>
            ) : (
              pendingInvitations.map((client) => (
                <div key={client.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{client.business_name}</p>
                      <p className="text-sm text-slate-500">Added {formatDate(client.created_at)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => sendInvitation(client.id, client.business_name)}
                    disabled={sendingInvitation === client.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 font-medium text-sm rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
                  >
                    {sendingInvitation === client.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send Invite
                  </button>
                </div>
              ))
            )}
          </div>

          {stats.pendingInvitations > 5 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
              <Link
                href="/admin/clients?filter=pending-invite"
                className="text-sm text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1"
              >
                View all {stats.pendingInvitations} pending
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Unassigned Clients */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Unassigned Clients</h2>
                <p className="text-sm text-slate-500">{stats.unassignedClients} clients need a coach</p>
              </div>
            </div>
            {stats.unassignedClients > 0 && (
              <Badge variant="danger" pulse>{stats.unassignedClients}</Badge>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {unassignedClients.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-slate-600 font-medium">All assigned!</p>
                <p className="text-slate-400 text-sm">Every client has a coach</p>
              </div>
            ) : (
              unassignedClients.map((client) => (
                <div key={client.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{client.business_name}</p>
                      <p className="text-sm text-slate-500">{client.industry || 'No industry set'}</p>
                    </div>
                  </div>
                  <Link
                    href={`/coach/clients/${client.id}?tab=profile`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    Assign
                  </Link>
                </div>
              ))
            )}
          </div>

          {stats.unassignedClients > 5 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
              <Link
                href="/admin/clients?filter=unassigned"
                className="text-sm text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1"
              >
                View all {stats.unassignedClients} unassigned
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/clients/new"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all"
          >
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center group-hover:bg-teal-500 transition-colors">
              <Plus className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Add Client</p>
              <p className="text-sm text-slate-500">Create new business</p>
            </div>
          </Link>

          <Link
            href="/admin/coaches"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50 transition-all"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-500 transition-colors">
              <Briefcase className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Manage Coaches</p>
              <p className="text-sm text-slate-500">Add or edit coaches</p>
            </div>
          </Link>

          <Link
            href="/admin/users"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-500 transition-colors">
              <Users className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">User Management</p>
              <p className="text-sm text-slate-500">Reset passwords</p>
            </div>
          </Link>

          <Link
            href="/coach/clients"
            className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-colors">
              <ExternalLink className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Coach Portal</p>
              <p className="text-sm text-slate-500">View as coach</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <ToastProvider>
      <AdminLayout>
        <DashboardContent />
      </AdminLayout>
    </ToastProvider>
  )
}
