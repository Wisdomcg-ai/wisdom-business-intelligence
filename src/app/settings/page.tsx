'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Settings,
  User,
  Mail,
  Lock,
  Save,
  AlertCircle,
  CheckCircle,
  Users,
  Zap,
  UserPlus,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

type TabType = 'profile' | 'team' | 'integrations'

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') as TabType | null

  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'profile')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Profile form states
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const navItems = [
    { id: 'profile' as TabType, label: 'Profile', icon: User, description: 'Your personal information' },
    { id: 'team' as TabType, label: 'Team Members', icon: Users, description: 'Manage your team' },
    { id: 'integrations' as TabType, label: 'Integrations', icon: Zap, description: 'Connected apps & services' },
  ]

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    if (tabParam && ['profile', 'team', 'integrations'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setMessage(null)
    router.push(`/settings?tab=${tab}`, { scroll: false })
  }

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUser(user)
      setEmail(user.email || '')
      setFirstName(user.user_metadata?.first_name || '')
      setLastName(user.user_metadata?.last_name || '')
    }
    setLoading(false)
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase.auth.updateUser({
        data: { first_name: firstName, last_name: lastName }
      })
      if (error) throw error
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      await loadUser()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase.auth.updateUser({ email })
      if (error) throw error
      setMessage({ type: 'success', text: 'Email update requested. Please check your new email for confirmation.' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      setSaving(false)
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      setSaving(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setMessage({ type: 'success', text: 'Password updated successfully!' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Settings className="w-8 h-8 text-brand-orange animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Settings"
        subtitle="Manage your account, team, and integrations"
        icon={Settings}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Left Sidebar Navigation */}
          <nav className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 sm:py-4 text-left transition-colors border-l-4 ${
                      isActive
                        ? 'bg-brand-orange-50 border-l-brand-orange text-brand-orange-700'
                        : 'border-l-transparent text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-brand-orange-100' : 'bg-gray-100'}`}>
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'text-brand-orange' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm sm:text-base font-medium ${isActive ? 'text-brand-orange-700' : 'text-gray-900'}`}>
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{item.description}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-brand-orange' : 'text-gray-400'}`} />
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Message Banner */}
            {message && (
              <div className={`mb-4 sm:mb-6 rounded-xl p-4 flex items-start gap-3 ${
                message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                  {message.text}
                </p>
              </div>
            )}

            {/* Profile Section */}
            {activeTab === 'profile' && (
              <div className="space-y-4 sm:space-y-6">
                {/* Profile Information */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <User className="w-5 h-5 text-brand-orange" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Profile Information</h2>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors disabled:bg-gray-400"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </form>
                </div>

                {/* Email */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <Mail className="w-5 h-5 text-brand-orange" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Email Address</h2>
                  </div>

                  <form onSubmit={handleUpdateEmail} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">Changing your email will require verification</p>
                    </div>
                    <button
                      type="submit"
                      disabled={saving || email === user?.email}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors disabled:bg-gray-400"
                    >
                      <Save className="w-4 h-4" />
                      Update Email
                    </button>
                  </form>
                </div>

                {/* Password */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <Lock className="w-5 h-5 text-brand-orange" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Change Password</h2>
                  </div>

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        placeholder="••••••••"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving || !newPassword || !confirmPassword}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors disabled:bg-gray-400"
                    >
                      <Save className="w-4 h-4" />
                      Update Password
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Team Section */}
            {activeTab === 'team' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-brand-orange" />
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900">Team Members</h2>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors text-sm font-medium">
                      <UserPlus className="w-4 h-4" />
                      Invite Member
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-200">
                      {/* Current User */}
                      <div className="flex items-center justify-between p-4 bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-brand-orange rounded-full flex items-center justify-center">
                            <span className="text-white font-medium">
                              {firstName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {firstName && lastName ? `${firstName} ${lastName}` : user?.email}
                            </p>
                            <p className="text-sm text-gray-500">{user?.email}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-brand-orange-100 text-brand-orange-700 text-xs font-medium rounded-full">
                          Owner
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-sm text-gray-600">
                      <strong>Coming Soon:</strong> Invite team members to collaborate on your business planning.
                      Team members will be able to view and contribute to your business goals and planning.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Integrations Section */}
            {activeTab === 'integrations' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <Zap className="w-5 h-5 text-brand-orange" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Integrations</h2>
                  </div>

                  <div className="space-y-4">
                    {/* Xero Integration */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="w-12 h-12 bg-[#13B5EA] rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">X</span>
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">Xero</h3>
                            <p className="text-sm text-gray-500">Connect your accounting software</p>
                          </div>
                        </div>
                        <a
                          href="/integrations"
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-sm font-medium"
                        >
                          Configure
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    {/* Future Integrations */}
                    <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Zap className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-medium text-gray-500">More Integrations Coming Soon</h3>
                          <p className="text-sm text-gray-400">QuickBooks, Google Calendar, Slack, and more</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Settings className="w-8 h-8 text-brand-orange animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
