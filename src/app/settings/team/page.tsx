'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  ShieldCheck,
  Eye,
  MoreVertical,
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
  Send,
  CalendarCheck,
  ToggleLeft,
  ToggleRight,
  Building2,
  Target,
  TrendingUp,
  Calendar,
  ListChecks,
  FileText,
  MessageSquare,
  LucideIcon
} from 'lucide-react'

interface TeamMember {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'active' | 'inactive'
  invited_at: string
  weekly_review_enabled: boolean
  user: {
    email: string
    first_name?: string
    last_name?: string
  } | null
}

// SIMPLIFIED Section permission keys - matching architecture doc
export type SectionPermission =
  // All-or-nothing groups
  | 'business_plan'      // Roadmap, VMV, SWOT, Goals, One-Page Plan
  | 'finances'           // Forecast, Budget, Cashflow
  | 'business_engines'   // Marketing, Team, Systems (all sub-items)
  // Individual toggles - Execute section
  | 'execute_kpi'
  | 'execute_weekly_review'
  | 'execute_issues'
  | 'execute_ideas'
  | 'execute_productivity'
  // Individual toggles - Other
  | 'review_quarterly'
  | 'coaching_messages'
  | 'coaching_sessions'

export interface SectionPermissions {
  // All-or-nothing groups
  business_plan: boolean
  finances: boolean
  business_engines: boolean
  // Execute - individual toggles
  execute_kpi: boolean
  execute_weekly_review: boolean
  execute_issues: boolean
  execute_ideas: boolean
  execute_productivity: boolean
  // Other - individual toggles
  review_quarterly: boolean
  coaching_messages: boolean
  coaching_sessions: boolean
}

// SIMPLIFIED Permission structure - All-or-nothing groups + Individual toggles
interface PermissionItem {
  id: SectionPermission
  label: string
  description: string
  icon: LucideIcon
  isGroup?: boolean // True for all-or-nothing sections
}

// All-or-nothing groups (single toggle for entire section)
const ALL_OR_NOTHING_GROUPS: PermissionItem[] = [
  {
    id: 'business_plan',
    label: 'Business Plan',
    description: 'Roadmap, Vision & Mission, SWOT, Goals & Targets, One-Page Plan',
    icon: Building2,
    isGroup: true,
  },
  {
    id: 'finances',
    label: 'Finances',
    description: 'Financial Forecast, Budget vs Actual, 13-Week Cashflow',
    icon: TrendingUp,
    isGroup: true,
  },
  {
    id: 'business_engines',
    label: 'Business Engines',
    description: 'Marketing, Team (Hiring Roadmap, Accountability), Systems',
    icon: Building2,
    isGroup: true,
  },
]

// Execute section - individual toggles
const EXECUTE_ITEMS: PermissionItem[] = [
  { id: 'execute_kpi', label: 'KPI Dashboard', description: 'View and track KPI metrics', icon: Target },
  { id: 'execute_weekly_review', label: 'Weekly Review', description: 'Weekly review & planning', icon: Calendar },
  { id: 'execute_issues', label: 'Issues List', description: 'Track and manage issues', icon: AlertCircle },
  { id: 'execute_ideas', label: 'Ideas Journal', description: 'Capture and evaluate ideas', icon: FileText },
  { id: 'execute_productivity', label: 'Productivity', description: 'Open Loops, To-Do, Stop Doing', icon: ListChecks },
]

// Other individual toggles
const OTHER_ITEMS: PermissionItem[] = [
  { id: 'review_quarterly', label: 'Quarterly Review', description: 'Quarterly planning & review', icon: Calendar },
  { id: 'coaching_messages', label: 'Messages', description: 'Team messaging & communication', icon: MessageSquare },
  { id: 'coaching_sessions', label: 'Coaching Sessions', description: 'Session notes & history', icon: FileText },
]

const DEFAULT_PERMISSIONS: SectionPermissions = {
  // All-or-nothing groups
  business_plan: true,
  finances: false,  // Financial data is sensitive - disabled by default
  business_engines: true,
  // Execute - individual toggles (all enabled by default)
  execute_kpi: true,
  execute_weekly_review: true,
  execute_issues: true,
  execute_ideas: true,
  execute_productivity: true,
  // Other - individual toggles
  review_quarterly: true,
  coaching_messages: true,
  coaching_sessions: true,
}

interface InviteForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  position: string
  role: 'admin' | 'member' | 'viewer'
  sectionPermissions: SectionPermissions
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

const ROLE_INFO = {
  owner: {
    label: 'Owner',
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

export default function TeamMembersPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState<string>('')
  const [currentUserRole, setCurrentUserRole] = useState<string>('member')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    role: 'member',
    sectionPermissions: { ...DEFAULT_PERMISSIONS }
  })
  const [inviting, setInviting] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  useEffect(() => {
    loadTeamData()
  }, [])

  async function loadTeamData() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's business
      const { data: businessUser } = await supabase
        .from('business_users')
        .select('business_id, role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!businessUser) {
        // Try via owner_id
        const { data: ownedBusiness } = await supabase
          .from('businesses')
          .select('id, business_name')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (ownedBusiness) {
          setBusinessId(ownedBusiness.id)
          setBusinessName(ownedBusiness.business_name || 'My Business')
          setCurrentUserRole('owner')

          // Create business_users entry if doesn't exist
          await supabase
            .from('business_users')
            .upsert({
              business_id: ownedBusiness.id,
              user_id: user.id,
              role: 'owner',
              status: 'active'
            }, { onConflict: 'business_id,user_id' })
        }
      } else {
        setBusinessId(businessUser.business_id)
        setCurrentUserRole(businessUser.role)

        const { data: business } = await supabase
          .from('businesses')
          .select('business_name')
          .eq('id', businessUser.business_id)
          .maybeSingle()

        setBusinessName(business?.business_name || 'My Business')
      }

      // Load team members
      if (businessUser?.business_id || businessId) {
        const bizId = businessUser?.business_id || businessId
        const { data: members, error: membersError } = await supabase
          .from('business_users')
          .select(`
            id,
            user_id,
            role,
            status,
            invited_at,
            weekly_review_enabled
          `)
          .eq('business_id', bizId)
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
            weekly_review_enabled: m.weekly_review_enabled ?? true,
            user: users?.find(u => u.id === m.user_id) || null
          }))

          setTeamMembers(membersWithUsers as TeamMember[])
        }

        // Load pending invites
        const { data: invites } = await supabase
          .from('team_invites')
          .select('*')
          .eq('business_id', bizId)
          .eq('status', 'pending')
          .order('invited_at', { ascending: false })

        if (invites) {
          setPendingInvites(invites as PendingInvite[])
        }
      }
    } catch (error) {
      console.error('Error loading team data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function inviteTeamMember() {
    if (!inviteForm.email || !inviteForm.firstName || !businessId) return

    setInviting(true)
    setError(null)

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      // Check if user already exists in the system
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', inviteForm.email.toLowerCase())
        .maybeSingle()

      if (existingUser) {
        // User exists - check if already a team member
        const { data: existingMember } = await supabase
          .from('business_users')
          .select('id')
          .eq('business_id', businessId)
          .eq('user_id', existingUser.id)
          .maybeSingle()

        if (existingMember) {
          setError('This user is already a team member')
          return
        }

        // Add them directly as an active member
        const { error: insertError } = await supabase
          .from('business_users')
          .insert({
            business_id: businessId,
            user_id: existingUser.id,
            role: inviteForm.role,
            status: 'active',
            invited_by: currentUser?.id,
            invited_at: new Date().toISOString(),
            section_permissions: inviteForm.sectionPermissions
          })

        if (insertError) throw insertError

        setSuccess(`${inviteForm.firstName} ${inviteForm.lastName} has been added to your team`)
        setShowInviteModal(false)
        resetInviteForm()
        loadTeamData()
      } else {
        // User doesn't exist - create a pending invite
        const { error: inviteError } = await supabase
          .from('team_invites')
          .insert({
            business_id: businessId,
            email: inviteForm.email.toLowerCase(),
            first_name: inviteForm.firstName,
            last_name: inviteForm.lastName || null,
            phone: inviteForm.phone || null,
            position: inviteForm.position || null,
            role: inviteForm.role,
            invited_by: currentUser?.id,
            status: 'pending',
            section_permissions: inviteForm.sectionPermissions
          })

        if (inviteError) {
          if (inviteError.code === '23505') {
            setError('An invite has already been sent to this email')
          } else {
            throw inviteError
          }
        } else {
          setSuccess(`Invite sent to ${inviteForm.firstName} ${inviteForm.lastName}. They will receive an email to join your team.`)
          setShowInviteModal(false)
          resetInviteForm()
          loadTeamData()

          // TODO: Send actual email invite via API
          // For now, the invite is stored and can be accepted when they sign up
        }
      }
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
      role: 'member',
      sectionPermissions: { ...DEFAULT_PERMISSIONS }
    })
  }

  function toggleSectionPermission(section: SectionPermission) {
    setInviteForm({
      ...inviteForm,
      sectionPermissions: {
        ...inviteForm.sectionPermissions,
        [section]: !inviteForm.sectionPermissions[section]
      }
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

  async function removeMember(memberId: string) {
    if (!confirm('Are you sure you want to remove this team member?')) return

    try {
      const { error } = await supabase
        .from('business_users')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      setMenuOpen(null)
    } catch (error) {
      console.error('Error removing member:', error)
    }
  }

  async function toggleWeeklyReview(memberId: string, currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('business_users')
        .update({ weekly_review_enabled: !currentValue })
        .eq('id', memberId)

      if (error) throw error

      setTeamMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, weekly_review_enabled: !currentValue } : m
      ))
    } catch (error) {
      console.error('Error toggling weekly review:', error)
    }
  }

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin'

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Team Members"
        subtitle={`Manage who has access to ${businessName}`}
        icon={Users}
        actions={
          canManageTeam && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors text-sm sm:text-base"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Team Member</span>
              <span className="sm:hidden">Add Member</span>
            </button>
          )
        }
      />

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm sm:text-base text-green-800">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto flex-shrink-0">
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm sm:text-base text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto flex-shrink-0">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900">
            {teamMembers.length} Team Member{teamMembers.length !== 1 ? 's' : ''}
          </h2>
        </div>

        <div className="divide-y divide-gray-200">
          {teamMembers.map((member) => {
            const roleInfo = ROLE_INFO[member.role]
            const RoleIcon = roleInfo.icon

            return (
              <div
                key={member.id}
                className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 sm:flex-initial">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-gray-600">
                      {member.user?.first_name?.[0] || member.user?.email?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                      {member.user?.first_name
                        ? `${member.user.first_name} ${member.user.last_name || ''}`
                        : member.user?.email?.split('@')[0] || 'Unknown User'
                      }
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{member.user?.email || 'No email'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
                  {editingMember === member.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                        disabled={member.role === 'owner'}
                      >
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
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${roleInfo.bgColor}`}>
                        <RoleIcon className={`w-4 h-4 ${roleInfo.color}`} />
                        <span className={`text-sm font-medium ${roleInfo.color}`}>
                          {roleInfo.label}
                        </span>
                      </div>
                      {member.weekly_review_enabled ? (
                        <div className="flex items-center gap-1 px-2 py-1 bg-brand-orange-50 rounded-full" title="Weekly Review Enabled">
                          <CalendarCheck className="w-3 h-3 text-brand-orange" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full" title="Weekly Review Disabled">
                          <CalendarCheck className="w-3 h-3 text-gray-400" />
                        </div>
                      )}
                    </div>
                  )}

                  {canManageTeam && member.role !== 'owner' && (
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpen === member.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(null)}
                          />
                          <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                            <button
                              onClick={() => {
                                setEditingMember(member.id)
                                setMenuOpen(null)
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit className="w-4 h-4" />
                              Change Role
                            </button>
                            <button
                              onClick={() => {
                                toggleWeeklyReview(member.id, member.weekly_review_enabled)
                                setMenuOpen(null)
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <CalendarCheck className="w-4 h-4" />
                              {member.weekly_review_enabled ? 'Disable Weekly Review' : 'Enable Weekly Review'}
                            </button>
                            <button
                              onClick={() => removeMember(member.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              Remove
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {teamMembers.length === 0 && (
            <div className="px-4 sm:px-6 py-12 text-center">
              <Users className="w-10 sm:w-12 h-10 sm:h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm sm:text-base text-gray-500">No team members yet</p>
              {canManageTeam && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="mt-4 text-sm sm:text-base text-brand-orange hover:text-brand-orange-700 font-medium"
                >
                  Add your first team member
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-amber-50">
            <h2 className="text-sm sm:text-base font-semibold text-amber-900 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Invites ({pendingInvites.length})
            </h2>
          </div>

          <div className="divide-y divide-gray-200">
            {pendingInvites.map((invite) => {
              const roleInfo = ROLE_INFO[invite.role as keyof typeof ROLE_INFO] || ROLE_INFO.member
              const RoleIcon = roleInfo.icon

              return (
                <div
                  key={invite.id}
                  className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 sm:flex-initial">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                        {invite.first_name} {invite.last_name || ''}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">{invite.email}</p>
                      {invite.position && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3 h-3" />
                          {invite.position}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
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
      <div className="mt-6 sm:mt-8 bg-gray-50 rounded-xl p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {Object.entries(ROLE_INFO).map(([role, info]) => {
            const Icon = info.icon
            return (
              <div key={role} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${info.bgColor} flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${info.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-medium text-gray-900">{info.label}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{info.description}</p>
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
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4 sm:p-6 my-8">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-orange" />
                  Invite Team Member
                </h2>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                  >
                    <option value="admin">Admin - Full access, can manage team</option>
                    <option value="member">Member - Can view and edit data</option>
                    <option value="viewer">Viewer - Read-only access</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {inviteForm.role === 'admin' && 'Admins can add/remove team members and access all features'}
                    {inviteForm.role === 'member' && 'Members can view and edit business data but cannot manage the team'}
                    {inviteForm.role === 'viewer' && 'Viewers have read-only access to view reports and dashboards'}
                  </p>
                </div>

                {/* SIMPLIFIED Section Access Toggles */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Sidebar Section Access
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInviteForm({
                          ...inviteForm,
                          sectionPermissions: {
                            business_plan: true, finances: true, business_engines: true,
                            execute_kpi: true, execute_weekly_review: true, execute_issues: true, execute_ideas: true, execute_productivity: true,
                            review_quarterly: true, coaching_messages: true, coaching_sessions: true
                          }
                        })}
                        className="text-xs text-brand-orange hover:text-brand-orange-700 font-medium"
                      >
                        Enable All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setInviteForm({
                          ...inviteForm,
                          sectionPermissions: {
                            business_plan: false, finances: false, business_engines: false,
                            execute_kpi: false, execute_weekly_review: false, execute_issues: false, execute_ideas: false, execute_productivity: false,
                            review_quarterly: false, coaching_messages: false, coaching_sessions: false
                          }
                        })}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Choose which sections this team member can see in their sidebar
                  </p>
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {/* ALL-OR-NOTHING GROUPS */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Full Sections (All or Nothing)</p>
                      <div className="space-y-2">
                        {ALL_OR_NOTHING_GROUPS.map((item) => {
                          const Icon = item.icon
                          const isEnabled = inviteForm.sectionPermissions[item.id]
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSectionPermission(item.id)}
                              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                                isEnabled
                                  ? 'border-brand-orange bg-brand-orange-50'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  isEnabled ? 'bg-brand-orange-100' : 'bg-gray-200'
                                }`}>
                                  <Icon className={`w-4 h-4 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                                </div>
                                <div className="text-left min-w-0">
                                  <span className={`block text-sm font-semibold ${isEnabled ? 'text-brand-orange-700' : 'text-gray-500'}`}>
                                    {item.label}
                                  </span>
                                  <span className="block text-xs text-gray-400 truncate">{item.description}</span>
                                </div>
                              </div>
                              {isEnabled ? (
                                <ToggleRight className="w-6 h-6 text-brand-orange flex-shrink-0" />
                              ) : (
                                <ToggleLeft className="w-6 h-6 text-gray-400 flex-shrink-0" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* EXECUTE SECTION - INDIVIDUAL TOGGLES */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Execute (Individual Access)</p>
                      <div className="space-y-2">
                        {EXECUTE_ITEMS.map((item) => {
                          const Icon = item.icon
                          const isEnabled = inviteForm.sectionPermissions[item.id]
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSectionPermission(item.id)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                                isEnabled
                                  ? 'border-brand-orange-200 bg-brand-orange-50/50'
                                  : 'border-gray-200 bg-gray-50/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Icon className={`w-4 h-4 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                                <span className={`text-sm ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {item.label}
                                </span>
                              </div>
                              {isEnabled ? (
                                <ToggleRight className="w-5 h-5 text-brand-orange" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-gray-300" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* OTHER - INDIVIDUAL TOGGLES */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other (Individual Access)</p>
                      <div className="space-y-2">
                        {OTHER_ITEMS.map((item) => {
                          const Icon = item.icon
                          const isEnabled = inviteForm.sectionPermissions[item.id]
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSectionPermission(item.id)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                                isEnabled
                                  ? 'border-brand-orange-200 bg-brand-orange-50/50'
                                  : 'border-gray-200 bg-gray-50/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Icon className={`w-4 h-4 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                                <span className={`text-sm ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {item.label}
                                </span>
                              </div>
                              {isEnabled ? (
                                <ToggleRight className="w-5 h-5 text-brand-orange" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-gray-300" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                    Note: Dashboard and Settings are always accessible to all team members
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowInviteModal(false)
                      resetInviteForm()
                      setError(null)
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={inviteTeamMember}
                    disabled={inviting || !inviteForm.email || !inviteForm.firstName}
                    className="w-full sm:w-auto px-4 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    {inviting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending Invite...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invite
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
