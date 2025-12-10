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
  Sparkles
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

            {/* Team Management */}
            <SlideOverSection title="Team Management" className="bg-slate-50 border-y border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-brand-navy">Manage Team Members</p>
                  <p className="text-sm text-gray-500">Add owners, partners, and team members</p>
                </div>
                <Link
                  href={`/coach/clients/${selectedClient.id}?tab=team`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Manage Team
                </Link>
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
