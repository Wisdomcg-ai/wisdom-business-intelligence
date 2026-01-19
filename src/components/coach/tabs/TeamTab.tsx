'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  ShieldCheck,
  Eye,
  Trash2,
  Edit,
  Check,
  X,
  Loader2,
  AlertCircle,
  Crown,
  Phone,
  Briefcase,
  Clock,
  Send
} from 'lucide-react'
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from '@/components/ui/DropdownMenu'

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

interface PendingInvite {
  id: string
  email: string
  first_name: string
  last_name: string | null
  phone: string | null
  position: string | null
  role: string
  status: string
  invited_at: string
}

interface TeamTabProps {
  clientId: string
  businessName: string
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

export function TeamTab({ clientId, businessName }: TeamTabProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<string | null>(null)

  useEffect(() => {
    loadTeamData()
  }, [clientId])

  async function loadTeamData() {
    try {
      setLoading(true)

      // Load team members for this business
      const { data: members, error: membersError } = await supabase
        .from('business_users')
        .select(`
          id,
          user_id,
          role,
          status,
          invited_at
        `)
        .eq('business_id', clientId)
        .order('role', { ascending: true })
        .order('invited_at', { ascending: true })

      if (membersError) {
        console.error('Error loading team members:', membersError)
      } else if (members) {
        // Get user details for each member
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
      }

      // Load pending invites
      const { data: invites } = await supabase
        .from('team_invites')
        .select('*')
        .eq('business_id', clientId)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false })

      if (invites) {
        setPendingInvites(invites as PendingInvite[])
      }
    } catch (error) {
      console.error('Error loading team data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function inviteTeamMember() {
    if (!inviteForm.email || !inviteForm.firstName) return

    setInviting(true)
    setError(null)

    try {
      // Use the team invite API which handles user creation and emails
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: clientId,
          firstName: inviteForm.firstName,
          lastName: inviteForm.lastName,
          email: inviteForm.email,
          phone: inviteForm.phone,
          position: inviteForm.position,
          role: inviteForm.role,
          createAccount: true // Create auth account and send credentials
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to invite team member')
        return
      }

      setSuccess(data.message || `${inviteForm.firstName} has been added to the team`)
      setShowInviteModal(false)
      resetInviteForm()
      loadTeamData()

    } catch (error: any) {
      console.error('Error inviting team member:', error)
      setError(error.message || 'Failed to invite team member')
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

  async function cancelInvite(inviteId: string) {
    try {
      const { error } = await supabase
        .from('team_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId)

      if (error) throw error

      setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
      setSuccess('Invite cancelled')
    } catch (error) {
      console.error('Error cancelling invite:', error)
    }
  }

  async function resendInvite(invite: PendingInvite) {
    // TODO: Implement email resend
    setSuccess(`Invite resent to ${invite.email}`)
  }

  async function updateMemberRole(memberId: string, newRole: string) {
    try {
      const { error } = await supabase
        .from('business_users')
        .update({ role: newRole })
        .eq('id', memberId)

      if (error) throw error

      setTeamMembers(prev =>
        prev.map(m => m.id === memberId ? { ...m, role: newRole as any } : m)
      )
      setEditingMember(null)
    } catch (error) {
      console.error('Error updating role:', error)
    }
  }

  async function removeMember(memberId: string, deleteCompletely: boolean = false) {
    const confirmMsg = deleteCompletely
      ? 'Are you sure you want to PERMANENTLY DELETE this user from the system? This cannot be undone.'
      : 'Are you sure you want to remove this team member from the team?'

    if (!confirm(confirmMsg)) return

    try {
      const response = await fetch('/api/team/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          businessId: clientId,
          deleteCompletely
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to remove team member')
        return
      }

      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      setSuccess(data.message || 'Team member removed')
    } catch (error) {
      console.error('Error removing member:', error)
      setError('Failed to remove team member')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-orange" />
            </div>
            Team Members
          </h2>
          <p className="text-gray-600 mt-1">
            Manage who has access to {businessName}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Team Member
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">
            {teamMembers.length} Team Member{teamMembers.length !== 1 ? 's' : ''}
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {teamMembers.map((member) => {
            const roleInfo = ROLE_INFO[member.role]
            const RoleIcon = roleInfo.icon

            return (
              <div
                key={member.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {member.user?.first_name?.[0] || member.user?.email?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900">
                      {member.user?.first_name
                        ? `${member.user.first_name} ${member.user.last_name || ''}`
                        : member.user?.email?.split('@')[0] || 'Unknown User'
                      }
                    </p>
                    <p className="text-sm text-gray-500">{member.user?.email || 'No email'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {editingMember === member.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="owner">Owner/Partner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => setEditingMember(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${roleInfo.bgColor}`}>
                      <RoleIcon className={`w-4 h-4 ${roleInfo.color}`} />
                      <span className={`text-sm font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </div>
                  )}

                  <DropdownMenu align="right">
                    <DropdownTrigger aria-label={`Actions for ${member.user?.first_name || 'team member'}`} />
                    <DropdownContent>
                      <DropdownItem
                        icon={Edit}
                        onClick={() => setEditingMember(member.id)}
                      >
                        Change Role
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem
                        icon={Trash2}
                        variant="danger"
                        onClick={() => removeMember(member.id, false)}
                      >
                        Remove from Team
                      </DropdownItem>
                      <DropdownItem
                        icon={Trash2}
                        variant="danger"
                        onClick={() => removeMember(member.id, true)}
                      >
                        Delete User Completely
                      </DropdownItem>
                    </DropdownContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}

          {teamMembers.length === 0 && (
            <div className="px-6 py-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No team members yet</p>
              <button
                onClick={() => setShowInviteModal(true)}
                className="mt-4 text-brand-orange hover:text-brand-orange-700 font-medium"
              >
                Add the first team member
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
            <h3 className="font-semibold text-amber-900 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Invites ({pendingInvites.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {pendingInvites.map((invite) => {
              const roleInfo = ROLE_INFO[invite.role as keyof typeof ROLE_INFO] || ROLE_INFO.member
              const RoleIcon = roleInfo.icon

              return (
                <div
                  key={invite.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>

                    <div>
                      <p className="font-medium text-gray-900">
                        {invite.first_name} {invite.last_name || ''}
                      </p>
                      <p className="text-sm text-gray-500">{invite.email}</p>
                      {invite.position && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3 h-3" />
                          {invite.position}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${roleInfo.bgColor}`}>
                      <RoleIcon className={`w-4 h-4 ${roleInfo.color}`} />
                      <span className={`text-sm font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => resendInvite(invite)}
                        className="p-2 text-gray-400 hover:text-brand-orange rounded-lg hover:bg-gray-100"
                        title="Resend invite"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => cancelInvite(invite.id)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
                        title="Cancel invite"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Role Descriptions */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(ROLE_INFO).map(([role, info]) => {
            const Icon = info.icon
            return (
              <div key={role} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${info.bgColor}`}>
                  <Icon className={`w-4 h-4 ${info.color}`} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{info.label}</p>
                  <p className="text-sm text-gray-500">{info.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-orange" />
                  Add Team Member
                </h2>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

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
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
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

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowInviteModal(false)
                      resetInviteForm()
                      setError(null)
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

export default TeamTab
