'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/admin/AdminLayout'
import { SlideOver, SlideOverSection } from '@/components/admin/SlideOver'
import { ActionMenu } from '@/components/admin/ActionMenu'
import { Badge, StatusBadge } from '@/components/admin/Badge'
import { EmptyState } from '@/components/admin/EmptyState'
import { ToastProvider, useToast } from '@/components/admin/Toast'
import PageHeader from '@/components/ui/PageHeader'
import {
  Building2,
  Search,
  Plus,
  Filter,
  Mail,
  Send,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  MoreHorizontal,
  Calendar,
  Briefcase,
  Globe,
  Phone,
  MapPin,
  ChevronRight,
  X,
  Sparkles,
  Crown,
  Shield,
  ShieldCheck,
  Users,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface Client {
  id: string
  business_name: string
  industry: string | null
  status: string
  assigned_coach_id: string | null
  invitation_sent: boolean | null
  temp_password: string | null
  created_at: string
  website: string | null
  address: string | null
  owner_id: string | null
  owner_email: string | null
}

interface Coach {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  system_role: string | null
}

interface TeamMember {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'active' | 'inactive'
  invited_at: string
  user: {
    email: string
    first_name?: string
    last_name?: string
  } | null
}

interface InviteForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  position: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

const ROLE_INFO = {
  owner: {
    label: 'Owner/Partner',
    description: 'Full access, can manage team and billing',
    icon: Crown,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50'
  },
  admin: {
    label: 'Admin',
    description: 'Full access, can manage team members',
    icon: ShieldCheck,
    color: 'text-brand-orange',
    bgColor: 'bg-brand-orange-50'
  },
  member: {
    label: 'Member',
    description: 'Can view and edit business data',
    icon: Shield,
    color: 'text-brand-orange',
    bgColor: 'bg-brand-orange-50'
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to business data',
    icon: Eye,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50'
  }
}

type FilterType = 'all' | 'active' | 'pending' | 'inactive' | 'unassigned' | 'pending-invite'

function ClientsContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [sendingInvitation, setSendingInvitation] = useState<string | null>(null)
  const [deletingClient, setDeletingClient] = useState<string | null>(null)
  const [assigningCoach, setAssigningCoach] = useState<string | null>(null)
  const [creatingDemo, setCreatingDemo] = useState(false)

  // Team management state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    role: 'member'
  })
  const [inviting, setInviting] = useState(false)
  const [teamSectionExpanded, setTeamSectionExpanded] = useState(true)

  // Read filter from URL
  useEffect(() => {
    const filter = searchParams?.get('filter') as FilterType
    if (filter) {
      setActiveFilter(filter)
    }
  }, [searchParams])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [clientsResult, coachesResult] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('id, email, first_name, last_name, system_role').in('system_role', ['coach', 'super_admin'])
      ])

      if (clientsResult.data) setClients(clientsResult.data)
      if (coachesResult.data) setCoaches(coachesResult.data)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  async function sendInvitation(client: Client) {
    setSendingInvitation(client.id)
    try {
      const response = await fetch('/api/clients/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: client.id })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error)
      }

      toast.success('Invitation sent!', `${client.business_name} will receive their login details.`)
      await loadData()
    } catch (error) {
      toast.error('Failed to send invitation', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setSendingInvitation(null)
    }
  }

  async function resendInvitation(email: string, businessName: string) {
    setSendingInvitation(email)
    try {
      const response = await fetch('/api/admin/clients/resend-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to resend invitation')
      }

      toast.success('Invitation resent!', `${businessName} will receive new login details.`)
      await loadData()
    } catch (error) {
      toast.error('Failed to resend invitation', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setSendingInvitation(null)
    }
  }

  async function assignCoach(clientId: string, coachId: string | null) {
    setAssigningCoach(clientId)
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ assigned_coach_id: coachId })
        .eq('id', clientId)

      if (error) throw error

      toast.success('Coach assigned', coachId ? 'Client has been assigned to the coach.' : 'Coach has been removed.')
      await loadData()

      // Update selected client if open
      if (selectedClient?.id === clientId) {
        setSelectedClient(prev => prev ? { ...prev, assigned_coach_id: coachId } : null)
      }
    } catch (error) {
      toast.error('Failed to assign coach')
    } finally {
      setAssigningCoach(null)
    }
  }

  async function deleteClient(client: Client) {
    if (!confirm(`Are you sure you want to delete "${client.business_name}"?\n\nThis will permanently delete all associated data and cannot be undone.`)) {
      return
    }

    setDeletingClient(client.id)
    try {
      const response = await fetch(`/api/admin/clients?id=${client.id}`, { method: 'DELETE' })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error)
      }

      toast.success('Client deleted', `${client.business_name} has been removed.`)
      setSelectedClient(null)
      await loadData()
    } catch (error) {
      toast.error('Failed to delete client', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setDeletingClient(null)
    }
  }

  async function createDemoClient() {
    setCreatingDemo(true)
    try {
      const response = await fetch('/api/admin/demo-client', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create demo client')
      }

      toast.success(
        'Demo Client Created!',
        `Smith's Plumbing is ready. Login: ${data.credentials.email} / ${data.credentials.password}`
      )
      await loadData()
    } catch (error) {
      toast.error('Failed to create demo client', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setCreatingDemo(false)
    }
  }

  // Team management functions
  async function loadTeamMembers(businessId: string) {
    setLoadingTeam(true)
    try {
      const { data: members, error: membersError } = await supabase
        .from('business_users')
        .select('id, user_id, role, status, invited_at')
        .eq('business_id', businessId)
        .order('role', { ascending: true })
        .order('invited_at', { ascending: true })

      if (membersError) {
        console.error('Error loading team members:', membersError)
        return
      }

      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id)
        const { data: users } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', userIds)

        const membersWithUsers = members.map(m => ({
          ...m,
          user: users?.find(u => u.id === m.user_id) || null
        }))

        setTeamMembers(membersWithUsers as TeamMember[])
      } else {
        setTeamMembers([])
      }
    } catch (error) {
      console.error('Error loading team:', error)
    } finally {
      setLoadingTeam(false)
    }
  }

  async function inviteTeamMember() {
    if (!inviteForm.email || !inviteForm.firstName || !selectedClient) return

    setInviting(true)
    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedClient.id,
          firstName: inviteForm.firstName,
          lastName: inviteForm.lastName,
          email: inviteForm.email,
          phone: inviteForm.phone,
          position: inviteForm.position,
          role: inviteForm.role,
          createAccount: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to invite team member')
      }

      toast.success('Team member added!', `${inviteForm.firstName} has been invited to ${selectedClient.business_name}`)
      setShowInviteModal(false)
      resetInviteForm()
      loadTeamMembers(selectedClient.id)

    } catch (error: unknown) {
      toast.error('Failed to add team member', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setInviting(false)
    }
  }

  function resetInviteForm() {
    setInviteForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      role: 'member'
    })
  }

  async function removeTeamMember(memberId: string, memberName: string) {
    if (!confirm(`Are you sure you want to remove ${memberName} from this team?`)) return

    try {
      const response = await fetch('/api/team/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          businessId: selectedClient?.id,
          deleteCompletely: false
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove team member')
      }

      toast.success('Team member removed')
      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (error) {
      toast.error('Failed to remove team member', error instanceof Error ? error.message : 'Please try again')
    }
  }

  // Load team when client is selected
  useEffect(() => {
    if (selectedClient) {
      loadTeamMembers(selectedClient.id)
    } else {
      setTeamMembers([])
    }
  }, [selectedClient?.id])

  // Filter clients
  const filteredClients = clients.filter(client => {
    // Search filter
    const matchesSearch = searchTerm === '' ||
      client.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchTerm.toLowerCase())

    // Status filter
    let matchesFilter = true
    switch (activeFilter) {
      case 'active':
        matchesFilter = client.status === 'active'
        break
      case 'pending':
        matchesFilter = client.status === 'pending'
        break
      case 'inactive':
        matchesFilter = client.status === 'inactive'
        break
      case 'unassigned':
        matchesFilter = !client.assigned_coach_id
        break
      case 'pending-invite':
        matchesFilter = !client.invitation_sent && !!client.temp_password
        break
    }

    return matchesSearch && matchesFilter
  })

  // Filter counts
  const filterCounts = {
    all: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    pending: clients.filter(c => c.status === 'pending').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
    unassigned: clients.filter(c => !c.assigned_coach_id).length,
    'pending-invite': clients.filter(c => !c.invitation_sent && c.temp_password).length,
  }

  function getCoachName(coachId: string | null) {
    if (!coachId) return null
    const coach = coaches.find(c => c.id === coachId)
    if (!coach) return null
    return coach.first_name ? `${coach.first_name} ${coach.last_name || ''}`.trim() : coach.email.split('@')[0]
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filters: { key: FilterType; label: string; icon?: typeof Building2 }[] = [
    { key: 'all', label: 'All Clients' },
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'pending-invite', label: 'Awaiting Invite' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
          <p className="text-gray-500 text-sm">Loading clients...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="Clients"
        subtitle={`${clients.length} total clients`}
        icon={Building2}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={createDemoClient}
              disabled={creatingDemo}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-purple-600 text-white font-medium text-sm sm:text-base rounded-lg hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50"
            >
              {creatingDemo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Create Demo Client
            </button>
            <Link
              href="/admin/clients/new"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-brand-orange text-white font-medium text-sm sm:text-base rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Client
            </Link>
          </div>
        }
      />

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by business name or industry..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeFilter === filter.key
                  ? 'bg-brand-orange text-white shadow-sm'
                  : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                }
              `}
            >
              {filter.label}
              {filterCounts[filter.key] > 0 && (
                <span className={`
                  px-1.5 py-0.5 rounded-md text-xs font-semibold
                  ${activeFilter === filter.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-gray-600'}
                `}>
                  {filterCounts[filter.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Clients List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredClients.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No clients found"
            description={searchTerm ? "Try adjusting your search or filters" : "Get started by adding your first client"}
            action={!searchTerm ? {
              label: 'Add Client',
              onClick: () => window.location.href = '/admin/clients/new'
            } : undefined}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredClients.map((client) => {
              const coachName = getCoachName(client.assigned_coach_id)
              const needsInvite = !client.invitation_sent && client.temp_password

              return (
                <div
                  key={client.id}
                  className="px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedClient(client)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-sm sm:text-base text-brand-navy truncate">{client.business_name}</h3>
                          <StatusBadge status={client.status as 'active' | 'pending' | 'inactive'} />
                          {needsInvite && (
                            <Badge variant="warning" pulse>
                              <Mail className="w-3 h-3" />
                              <span className="hidden sm:inline">Needs Invite</span>
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
                          {client.industry && <span>{client.industry}</span>}
                          {coachName ? (
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {coachName}
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              No coach
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(client.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:ml-4 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                      {needsInvite && (
                        <button
                          onClick={() => sendInvitation(client)}
                          disabled={sendingInvitation === client.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 font-medium text-xs sm:text-sm rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
                        >
                          {sendingInvitation === client.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Send Invite</span>
                        </button>
                      )}
                      <ActionMenu
                        items={[
                          {
                            label: 'View Details',
                            icon: Eye,
                            onClick: () => setSelectedClient(client)
                          },
                          {
                            label: 'View as Coach',
                            icon: Briefcase,
                            onClick: () => window.location.href = `/coach/clients/${client.id}`
                          },
                          {
                            label: 'Delete Client',
                            icon: Trash2,
                            variant: 'danger',
                            onClick: () => deleteClient(client)
                          }
                        ]}
                      />
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Client Detail Slide-Over */}
      <SlideOver
        open={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        title={selectedClient?.business_name || ''}
        subtitle={selectedClient?.industry || 'No industry set'}
        size="lg"
        footer={
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedClient && deleteClient(selectedClient)}
              disabled={deletingClient === selectedClient?.id}
              className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {deletingClient === selectedClient?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedClient(null)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Close
              </button>
              <Link
                href={`/coach/clients/${selectedClient?.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Full Profile
              </Link>
            </div>
          </div>
        }
      >
        {selectedClient && (
          <>
            {/* Status */}
            <SlideOverSection>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedClient.status as 'active' | 'pending' | 'inactive'} />
                {!selectedClient.invitation_sent && selectedClient.temp_password && (
                  <Badge variant="warning" pulse>Awaiting Invitation</Badge>
                )}
                {selectedClient.invitation_sent && (
                  <Badge variant="success">
                    <CheckCircle className="w-3 h-3" />
                    Invitation Sent
                  </Badge>
                )}
              </div>
            </SlideOverSection>

            {/* Send Invitation */}
            {!selectedClient.invitation_sent && selectedClient.temp_password && (
              <SlideOverSection className="bg-amber-50 border-y border-amber-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-amber-900">Invitation Pending</p>
                    <p className="text-sm text-amber-700">Client hasn't received login credentials yet</p>
                  </div>
                  <button
                    onClick={() => sendInvitation(selectedClient)}
                    disabled={sendingInvitation === selectedClient.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {sendingInvitation === selectedClient.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send Invitation
                  </button>
                </div>
              </SlideOverSection>
            )}

            {/* Resend Invitation - for clients who already received an invite */}
            {selectedClient.invitation_sent && selectedClient.owner_email && (
              <SlideOverSection className="bg-blue-50 border-y border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-blue-900">Resend Login Credentials</p>
                    <p className="text-sm text-blue-700">Send new password to {selectedClient.owner_email}</p>
                  </div>
                  <button
                    onClick={() => resendInvitation(selectedClient.owner_email!, selectedClient.business_name)}
                    disabled={sendingInvitation === selectedClient.owner_email}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {sendingInvitation === selectedClient.owner_email ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Resend Invitation
                  </button>
                </div>
              </SlideOverSection>
            )}

            {/* Team Management - Inline */}
            <SlideOverSection title="">
              <div className="space-y-4">
                {/* Header with collapse toggle */}
                <button
                  onClick={() => setTeamSectionExpanded(!teamSectionExpanded)}
                  className="w-full flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-brand-orange" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-brand-navy">Team Members</p>
                      <p className="text-sm text-gray-500">
                        {loadingTeam ? 'Loading...' : `${teamMembers.length} member${teamMembers.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowInviteModal(true)
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add
                    </button>
                    {teamSectionExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Team Members List */}
                {teamSectionExpanded && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    {loadingTeam ? (
                      <div className="p-6 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-orange mx-auto" />
                      </div>
                    ) : teamMembers.length === 0 ? (
                      <div className="p-6 text-center">
                        <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No team members yet</p>
                        <button
                          onClick={() => setShowInviteModal(true)}
                          className="mt-2 text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                        >
                          Add the first team member
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {teamMembers.map((member) => {
                          const roleInfo = ROLE_INFO[member.role]
                          const RoleIcon = roleInfo.icon
                          const memberName = member.user?.first_name
                            ? `${member.user.first_name} ${member.user.last_name || ''}`
                            : member.user?.email?.split('@')[0] || 'Unknown'

                          return (
                            <div
                              key={member.id}
                              className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-medium text-gray-600">
                                    {member.user?.first_name?.[0] || member.user?.email?.[0]?.toUpperCase() || '?'}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{memberName}</p>
                                  <p className="text-xs text-gray-500 truncate">{member.user?.email || 'No email'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${roleInfo.bgColor}`}>
                                  <RoleIcon className={`w-3 h-3 ${roleInfo.color}`} />
                                  <span className={`font-medium ${roleInfo.color}`}>{roleInfo.label}</span>
                                </div>
                                <button
                                  onClick={() => removeTeamMember(member.id, memberName)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SlideOverSection>

            {/* Coach Assignment */}
            <SlideOverSection title="Assigned Coach">
              <div className="relative">
                <select
                  value={selectedClient.assigned_coach_id || ''}
                  onChange={(e) => assignCoach(selectedClient.id, e.target.value || null)}
                  disabled={assigningCoach === selectedClient.id}
                  className={`
                    w-full px-4 py-3 rounded-xl border text-sm font-medium appearance-none
                    focus:ring-2 focus:ring-brand-orange focus:border-transparent transition-all
                    ${selectedClient.assigned_coach_id
                      ? 'border-slate-200 bg-white text-brand-navy'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                    }
                    ${assigningCoach === selectedClient.id ? 'opacity-50' : ''}
                  `}
                >
                  <option value="">No coach assigned</option>
                  {coaches.map(coach => (
                    <option key={coach.id} value={coach.id}>
                      {coach.first_name ? `${coach.first_name} ${coach.last_name || ''}`.trim() : coach.email.split('@')[0]}
                      {coach.system_role === 'super_admin' ? ' (Admin)' : ''}
                    </option>
                  ))}
                </select>
                {assigningCoach === selectedClient.id && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>
            </SlideOverSection>

            {/* Details */}
            <SlideOverSection title="Business Details">
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Industry</dt>
                  <dd className="mt-1 text-sm font-medium text-brand-navy">{selectedClient.industry || 'Not set'}</dd>
                </div>
                {selectedClient.website && (
                  <div>
                    <dt className="text-sm text-gray-500">Website</dt>
                    <dd className="mt-1">
                      <a
                        href={selectedClient.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-orange hover:text-brand-orange-700 flex items-center gap-1"
                      >
                        <Globe className="w-4 h-4" />
                        {selectedClient.website}
                      </a>
                    </dd>
                  </div>
                )}
                {selectedClient.address && (
                  <div>
                    <dt className="text-sm text-gray-500">Address</dt>
                    <dd className="mt-1 text-sm font-medium text-brand-navy flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      {selectedClient.address}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm font-medium text-brand-navy flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {formatDate(selectedClient.created_at)}
                  </dd>
                </div>
              </dl>
            </SlideOverSection>
          </>
        )}
      </SlideOver>

      {/* Add Team Member Modal */}
      {showInviteModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setShowInviteModal(false)
              resetInviteForm()
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-orange" />
                  Add Team Member
                </h2>
                <button
                  onClick={() => {
                    setShowInviteModal(false)
                    resetInviteForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedClient && (
                <p className="text-sm text-gray-500 mb-4 -mt-4">
                  Adding member to <strong>{selectedClient.business_name}</strong>
                </p>
              )}

              <div className="space-y-4">
                {/* Name Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={inviteForm.firstName}
                      onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                      placeholder="John"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={inviteForm.lastName}
                      onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                      placeholder="Smith"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      placeholder="john@company.com"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                      placeholder="0400 000 000"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    />
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position in Company
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={inviteForm.position}
                      onChange={(e) => setInviteForm({ ...inviteForm, position: e.target.value })}
                      placeholder="Operations Manager"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    />
                  </div>
                </div>

                {/* Access Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as InviteForm['role'] })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  >
                    <option value="owner">Owner/Partner - Full access, can manage billing</option>
                    <option value="admin">Admin - Full access, can manage team</option>
                    <option value="member">Member - Can view and edit data</option>
                    <option value="viewer">Viewer - Read-only access</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {inviteForm.role === 'owner' && 'Owners/Partners have full access to all features including billing and team management'}
                    {inviteForm.role === 'admin' && 'Admins can add/remove team members and access all features'}
                    {inviteForm.role === 'member' && 'Members can view and edit business data but cannot manage the team'}
                    {inviteForm.role === 'viewer' && 'Viewers have read-only access to view reports and dashboards'}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowInviteModal(false)
                      resetInviteForm()
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={inviteTeamMember}
                    disabled={inviting || !inviteForm.email || !inviteForm.firstName}
                    className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {inviting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Add Member
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function AdminClientsPage() {
  return (
    <ToastProvider>
      <AdminLayout>
        <ClientsContent />
      </AdminLayout>
    </ToastProvider>
  )
}
