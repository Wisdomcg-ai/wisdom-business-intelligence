'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getUserSystemRole } from '@/lib/auth/roles'
import RoleSwitcher from '@/components/shared/RoleSwitcher'
import {
  Users,
  UserPlus,
  Building2,
  TrendingUp,
  Clock,
  Search,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  Shield,
  X,
  Briefcase,
  Phone,
  Mail,
  Loader2,
  Copy,
  Check
} from 'lucide-react'

interface Business {
  id: string
  business_name: string
  industry: string | null
  assigned_coach_id: string | null
  status: string
  created_at: string
  onboarding_completed: boolean
}

interface Coach {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

interface Stats {
  total: number
  active: number
  pending: number
  unassigned: number
  thisMonth: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Business[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    pending: 0,
    unassigned: 0,
    thisMonth: 0
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCoach, setFilterCoach] = useState<string>('all')
  const [userName, setUserName] = useState<string>('')
  const [assigningCoach, setAssigningCoach] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'clients' | 'coaches'>('clients')
  const [showAddCoachModal, setShowAddCoachModal] = useState(false)
  const [addingCoach, setAddingCoach] = useState(false)
  const [newCoach, setNewCoach] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [addCoachError, setAddCoachError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null)
  const [editCoachForm, setEditCoachForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [savingCoach, setSavingCoach] = useState(false)
  const [editCoachError, setEditCoachError] = useState<string | null>(null)

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  async function checkAuthAndLoadData() {
    setLoading(true)

    // Check authentication and role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/admin/login')
      return
    }

    const role = await getUserSystemRole()
    if (role !== 'super_admin') {
      router.push('/login')
      return
    }

    // Set user name from metadata or email
    const name = user.user_metadata?.first_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
      : user.email?.split('@')[0] || 'Admin'
    setUserName(name)

    // Load clients and coaches
    await Promise.all([loadClients(), loadCoaches()])
    setLoading(false)
  }

  async function loadCoaches() {
    // Load all users with coach role
    const { data, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, phone')
      .eq('system_role', 'coach')
      .order('first_name')

    if (error) {
      console.error('Error loading coaches:', error)
      return
    }

    setCoaches(data || [])
  }

  async function handleAddCoach(e: React.FormEvent) {
    e.preventDefault()
    setAddingCoach(true)
    setAddCoachError(null)
    setTempPassword(null)

    try {
      const response = await fetch('/api/admin/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCoach)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add coach')
      }

      // Show temp password if one was generated
      if (data.tempPassword) {
        setTempPassword(data.tempPassword)
      } else {
        // If password was provided, close modal and reset
        setShowAddCoachModal(false)
        setNewCoach({ firstName: '', lastName: '', email: '', phone: '', password: '' })
      }

      // Reload coaches
      await loadCoaches()
    } catch (error) {
      setAddCoachError(error instanceof Error ? error.message : 'Failed to add coach')
    } finally {
      setAddingCoach(false)
    }
  }

  async function handleDeleteCoach(coachId: string, coachName: string) {
    if (!confirm(`Are you sure you want to delete ${coachName}? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/coaches?id=${coachId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete coach')
      }

      // Reload coaches
      await loadCoaches()
    } catch (error) {
      console.error('Error deleting coach:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete coach')
    }
  }

  function copyPassword() {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  function closeAddCoachModal() {
    setShowAddCoachModal(false)
    setNewCoach({ firstName: '', lastName: '', email: '', phone: '', password: '' })
    setAddCoachError(null)
    setTempPassword(null)
    setCopiedPassword(false)
  }

  function openEditCoachModal(coach: Coach) {
    setEditingCoach(coach)
    setEditCoachForm({
      firstName: coach.first_name || '',
      lastName: coach.last_name || '',
      email: coach.email,
      phone: coach.phone || ''
    })
    setEditCoachError(null)
  }

  function closeEditCoachModal() {
    setEditingCoach(null)
    setEditCoachForm({ firstName: '', lastName: '', email: '', phone: '' })
    setEditCoachError(null)
  }

  async function handleSaveCoach(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCoach) return

    setSavingCoach(true)
    setEditCoachError(null)

    try {
      const response = await fetch(`/api/admin/coaches?id=${editingCoach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCoachForm)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update coach')
      }

      await loadCoaches()
      closeEditCoachModal()
    } catch (error) {
      setEditCoachError(error instanceof Error ? error.message : 'Failed to update coach')
    } finally {
      setSavingCoach(false)
    }
  }

  async function assignCoach(businessId: string, coachId: string | null) {
    setAssigningCoach(businessId)

    const { error } = await supabase
      .from('businesses')
      .update({ assigned_coach_id: coachId })
      .eq('id', businessId)

    if (error) {
      console.error('Error assigning coach:', error)
    } else {
      // Update local state
      setClients(prev => prev.map(c =>
        c.id === businessId ? { ...c, assigned_coach_id: coachId } : c
      ))
    }

    setAssigningCoach(null)
  }

  async function loadClients() {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading clients:', error)
      return
    }

    setClients(data || [])

    // Calculate stats
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const stats = {
      total: data?.length || 0,
      active: data?.filter(b => b.status === 'active').length || 0,
      pending: data?.filter(b => b.status === 'pending').length || 0,
      unassigned: data?.filter(b => !b.assigned_coach_id).length || 0,
      thisMonth: data?.filter(b => new Date(b.created_at) >= startOfMonth).length || 0
    }

    setStats(stats)
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      inactive: 'bg-gray-100 text-gray-800 border-gray-200',
      archived: 'bg-red-100 text-red-800 border-red-200'
    }

    const icons = {
      active: <CheckCircle className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      inactive: <AlertCircle className="w-3 h-3" />,
      archived: <XCircle className="w-3 h-3" />
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || styles.inactive}`}>
        {icons[status as keyof typeof icons]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         client.industry?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || client.status === filterStatus
    const matchesCoach = filterCoach === 'all' ||
                         (filterCoach === 'unassigned' && !client.assigned_coach_id) ||
                         client.assigned_coach_id === filterCoach

    return matchesSearch && matchesFilter && matchesCoach
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Portal</h1>
                <p className="text-sm text-gray-600">Wisdom Business Intelligence</p>
              </div>
            </div>
            <RoleSwitcher currentRole="admin" userName={userName} />
          </div>
          {/* Tabs */}
          <div className="mt-4 flex gap-1">
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'clients'
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Clients
              </div>
            </button>
            <button
              onClick={() => setActiveTab('coaches')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'coaches'
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Coaches ({coaches.length})
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'clients' ? (
          <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Clients</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Users className="w-10 h-10 text-teal-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-3xl font-bold text-green-600">{stats.active}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Setup</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </div>

          <button
            onClick={() => setFilterCoach('unassigned')}
            className="bg-white rounded-lg shadow p-6 text-left hover:bg-orange-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unassigned</p>
                <p className={`text-3xl font-bold ${stats.unassigned > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {stats.unassigned}
                </p>
              </div>
              <AlertCircle className={`w-10 h-10 ${stats.unassigned > 0 ? 'text-orange-500' : 'text-gray-300'}`} />
            </div>
          </button>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-3xl font-bold text-purple-600">{stats.thisMonth}</p>
              </div>
              <UserPlus className="w-10 h-10 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Coach Filter */}
              <select
                value={filterCoach}
                onChange={(e) => setFilterCoach(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">All Coaches</option>
                <option value="unassigned">Unassigned</option>
                {coaches.map(coach => (
                  <option key={coach.id} value={coach.id}>
                    {coach.first_name ? `${coach.first_name} ${coach.last_name || ''}`.trim() : coach.email.split('@')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Add Client Button */}
            <Link
              href="/admin/clients/new"
              className="w-full sm:w-auto bg-teal-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Add New Client
            </Link>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Industry
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No clients found
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Building2 className="w-5 h-5 text-gray-400 mr-3" />
                        <div className="text-sm font-medium text-gray-900">
                          {client.business_name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {client.industry || 'Not set'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={client.assigned_coach_id || ''}
                        onChange={(e) => assignCoach(client.id, e.target.value || null)}
                        disabled={assigningCoach === client.id}
                        className={`text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                          client.assigned_coach_id
                            ? 'border-gray-300 text-gray-700'
                            : 'border-yellow-300 bg-yellow-50 text-yellow-700'
                        } ${assigningCoach === client.id ? 'opacity-50' : ''}`}
                      >
                        <option value="">Unassigned</option>
                        {coaches.map(coach => (
                          <option key={coach.id} value={coach.id}>
                            {coach.first_name ? `${coach.first_name} ${coach.last_name || ''}`.trim() : coach.email.split('@')[0]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(client.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="text-teal-600 hover:text-teal-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/clients/${client.id}/edit`}
                          className="text-gray-600 hover:text-gray-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          </>
        ) : (
          /* Coaches Tab */
          <div className="space-y-6">
            {/* Coaches Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Coaches</h2>
                <p className="text-sm text-gray-500">{coaches.length} total coaches</p>
              </div>
              <button
                onClick={() => setShowAddCoachModal(true)}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Coach
              </button>
            </div>

            {/* Coaches Grid */}
            {coaches.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No coaches yet</h3>
                <p className="text-gray-500 mb-4">Add your first coach to start assigning clients.</p>
                <button
                  onClick={() => setShowAddCoachModal(true)}
                  className="bg-teal-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Your First Coach
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {coaches.map(coach => {
                  const clientCount = clients.filter(c => c.assigned_coach_id === coach.id).length
                  return (
                    <div key={coach.id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                            <span className="text-teal-700 font-semibold text-lg">
                              {coach.first_name?.[0]}{coach.last_name?.[0]}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {coach.first_name} {coach.last_name}
                            </h3>
                            <p className="text-sm text-gray-500">{clientCount} client{clientCount !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditCoachModal(coach)}
                            className="text-gray-400 hover:text-teal-600 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCoach(coach.id, `${coach.first_name} ${coach.last_name}`)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4 text-gray-400" />
                          {coach.email}
                        </div>
                        {coach.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {coach.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Coach Modal */}
      {showAddCoachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeAddCoachModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Add New Coach</h2>
              <button
                onClick={closeAddCoachModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {tempPassword ? (
              /* Success State - Show temporary password */
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Coach Created!</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Share these credentials with the coach so they can log in:
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left mb-4">
                  <div className="mb-2">
                    <span className="text-xs text-gray-500">Email:</span>
                    <p className="font-medium">{newCoach.email}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Temporary Password:</span>
                    <div className="flex items-center gap-2">
                      <code className="font-mono bg-white px-2 py-1 rounded border text-sm flex-1">
                        {tempPassword}
                      </code>
                      <button
                        onClick={copyPassword}
                        className="p-2 text-gray-500 hover:text-teal-600 transition-colors"
                      >
                        {copiedPassword ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  They should change their password after first login.
                </p>
                <button
                  onClick={closeAddCoachModal}
                  className="w-full bg-teal-600 text-white py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Form State */
              <form onSubmit={handleAddCoach} className="space-y-4">
                {addCoachError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {addCoachError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={newCoach.firstName}
                      onChange={(e) => setNewCoach(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={newCoach.lastName}
                      onChange={(e) => setNewCoach(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={newCoach.email}
                    onChange={(e) => setNewCoach(prev => ({ ...prev, email: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={newCoach.phone}
                    onChange={(e) => setNewCoach(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+61 400 000 000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={newCoach.password}
                    onChange={(e) => setNewCoach(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to generate a temporary password
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeAddCoachModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingCoach}
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {addingCoach ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Coach'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Coach Modal */}
      {editingCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditCoachModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Edit Coach</h2>
              <button
                onClick={closeEditCoachModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoach} className="space-y-4">
              {editCoachError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {editCoachError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={editCoachForm.firstName}
                    onChange={(e) => setEditCoachForm(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={editCoachForm.lastName}
                    onChange={(e) => setEditCoachForm(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={editCoachForm.email}
                  onChange={(e) => setEditCoachForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editCoachForm.phone}
                  onChange={(e) => setEditCoachForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+61 400 000 000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeEditCoachModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCoach}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingCoach ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
