'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/admin/AdminLayout'
import { SlideOver, SlideOverSection } from '@/components/admin/SlideOver'
import { ActionMenu } from '@/components/admin/ActionMenu'
import { Badge, RoleBadge } from '@/components/admin/Badge'
import { EmptyState } from '@/components/admin/EmptyState'
import { ToastProvider, useToast } from '@/components/admin/Toast'
import PageHeader from '@/components/ui/PageHeader'
import {
  Briefcase,
  Search,
  Plus,
  Mail,
  Phone,
  Edit,
  Trash2,
  Users,
  Loader2,
  X,
  Eye,
  Copy,
  Check,
  Building2
} from 'lucide-react'

interface Coach {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  system_role: string | null
}

interface Client {
  id: string
  business_name: string
  assigned_coach_id: string | null
}

function CoachesContent() {
  const supabase = createClient()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [coachesResult, clientsResult] = await Promise.all([
        supabase.from('users').select('*').in('system_role', ['coach', 'super_admin']).order('first_name'),
        supabase.from('businesses').select('id, business_name, assigned_coach_id')
      ])

      if (coachesResult.data) setCoaches(coachesResult.data)
      if (clientsResult.data) setClients(clientsResult.data)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load coaches')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCoach(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch('/api/admin/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add coach')
      }

      if (data.tempPassword) {
        setTempPassword(data.tempPassword)
      } else {
        toast.success('Coach added', `${formData.firstName} has been added successfully.`)
        closeAddModal()
      }

      await loadData()
    } catch (error) {
      toast.error('Failed to add coach', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateCoach(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCoach) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/coaches?id=${editingCoach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error)
      }

      toast.success('Coach updated', 'Changes have been saved.')
      setEditingCoach(null)
      await loadData()
    } catch (error) {
      toast.error('Failed to update coach', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteCoach(coach: Coach) {
    const clientCount = clients.filter(c => c.assigned_coach_id === coach.id).length
    const confirmMessage = clientCount > 0
      ? `${coach.first_name} ${coach.last_name} has ${clientCount} assigned client(s). Deleting will unassign them. Continue?`
      : `Are you sure you want to delete ${coach.first_name} ${coach.last_name}?`

    if (!confirm(confirmMessage)) return

    try {
      const response = await fetch(`/api/admin/coaches?id=${coach.id}`, { method: 'DELETE' })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error)
      }

      toast.success('Coach deleted', `${coach.first_name} has been removed.`)
      setSelectedCoach(null)
      await loadData()
    } catch (error) {
      toast.error('Failed to delete coach', error instanceof Error ? error.message : 'Please try again')
    }
  }

  function closeAddModal() {
    setShowAddModal(false)
    setTempPassword(null)
    setFormData({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  }

  function openEditModal(coach: Coach) {
    setEditingCoach(coach)
    setFormData({
      firstName: coach.first_name || '',
      lastName: coach.last_name || '',
      email: coach.email,
      phone: coach.phone || '',
      password: ''
    })
  }

  function copyPassword() {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  // Filter coaches
  const filteredCoaches = coaches.filter(coach => {
    const fullName = `${coach.first_name || ''} ${coach.last_name || ''}`.toLowerCase()
    return fullName.includes(searchTerm.toLowerCase()) ||
      coach.email.toLowerCase().includes(searchTerm.toLowerCase())
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
          <p className="text-gray-500 text-sm">Loading coaches...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Coaches"
        subtitle={`${coaches.length} team member${coaches.length !== 1 ? 's' : ''}`}
        icon={Users}
        variant="simple"
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add New Coach</span>
            <span className="sm:hidden">Add</span>
          </button>
        }
      />

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search coaches..."
            className="w-full pl-10 sm:pl-12 pr-10 sm:pr-4 py-2.5 sm:py-3 bg-gray-50 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Coaches Grid */}
      {filteredCoaches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <EmptyState
            icon={Briefcase}
            title="No coaches found"
            description={searchTerm ? "Try adjusting your search" : "Add your first coach to start assigning clients"}
            action={!searchTerm ? {
              label: 'Add Coach',
              onClick: () => setShowAddModal(true)
            } : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredCoaches.map((coach) => {
            const assignedClients = clients.filter(c => c.assigned_coach_id === coach.id)

            return (
              <div
                key={coach.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer"
                onClick={() => setSelectedCoach(coach)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-brand-orange-400 to-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-sm flex-shrink-0">
                      {coach.first_name?.[0]}{coach.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-brand-navy text-sm sm:text-base truncate">
                        {coach.first_name} {coach.last_name}
                      </h3>
                      <RoleBadge role={coach.system_role as 'super_admin' | 'coach'} />
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={[
                        { label: 'Edit', icon: Edit, onClick: () => openEditModal(coach) },
                        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => deleteCoach(coach) }
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{coach.email}</span>
                  </div>
                  {coach.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{coach.phone}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span>{assignedClients.length} client{assignedClients.length !== 1 ? 's' : ''}</span>
                  </div>
                  <Badge variant={assignedClients.length > 0 ? 'success' : 'neutral'}>
                    {assignedClients.length > 0 ? 'Active' : 'Available'}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Coach Detail Slide-Over */}
      <SlideOver
        open={!!selectedCoach}
        onClose={() => setSelectedCoach(null)}
        title={selectedCoach ? `${selectedCoach.first_name} ${selectedCoach.last_name}` : ''}
        subtitle={selectedCoach?.email}
        size="md"
        footer={
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedCoach && deleteCoach(selectedCoach)}
              className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedCoach(null)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => selectedCoach && openEditModal(selectedCoach)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
            </div>
          </div>
        }
      >
        {selectedCoach && (
          <>
            <SlideOverSection>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-brand-orange-400 to-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm">
                  {selectedCoach.first_name?.[0]}{selectedCoach.last_name?.[0]}
                </div>
                <div>
                  <RoleBadge role={selectedCoach.system_role as 'super_admin' | 'coach'} />
                </div>
              </div>
            </SlideOverSection>

            <SlideOverSection title="Contact Information">
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm font-medium text-brand-navy flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {selectedCoach.email}
                  </dd>
                </div>
                {selectedCoach.phone && (
                  <div>
                    <dt className="text-sm text-gray-500">Phone</dt>
                    <dd className="mt-1 text-sm font-medium text-brand-navy flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      {selectedCoach.phone}
                    </dd>
                  </div>
                )}
              </dl>
            </SlideOverSection>

            <SlideOverSection title="Assigned Clients">
              {clients.filter(c => c.assigned_coach_id === selectedCoach.id).length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No clients assigned yet</p>
              ) : (
                <div className="space-y-2">
                  {clients.filter(c => c.assigned_coach_id === selectedCoach.id).map(client => (
                    <div
                      key={client.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                    >
                      <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-gray-500" />
                      </div>
                      <span className="font-medium text-brand-navy">{client.business_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </SlideOverSection>
          </>
        )}
      </SlideOver>

      {/* Add Coach Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeAddModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-navy">Add New Coach</h2>
              <button onClick={closeAddModal} className="p-2 text-slate-400 hover:text-gray-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {tempPassword ? (
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-brand-navy mb-2">Coach Created!</h3>
                <p className="text-sm text-gray-500 mb-4">Share these credentials with the coach:</p>

                <div className="bg-gray-50 rounded-xl p-4 text-left mb-4">
                  <div className="mb-3">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium text-brand-navy">{formData.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Temporary Password</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm">
                        {tempPassword}
                      </code>
                      <button
                        onClick={copyPassword}
                        className="p-2 text-gray-500 hover:text-brand-orange hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        {copiedPassword ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-4">They should change their password after first login.</p>

                <button
                  onClick={closeAddModal}
                  className="w-full py-3 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddCoach} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+61 400 000 000"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to generate a temporary password</p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Coach
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
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingCoach(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-navy">Edit Coach</h2>
              <button onClick={() => setEditingCoach(null)} className="p-2 text-slate-400 hover:text-gray-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCoach} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+61 400 000 000"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingCoach(null)}
                  className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminCoachesPage() {
  return (
    <ToastProvider>
      <AdminLayout>
        <CoachesContent />
      </AdminLayout>
    </ToastProvider>
  )
}
