'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import {
  Bell,
  Mail,
  MessageSquare,
  Calendar,
  Users,
  FileEdit,
  Clock,
  Loader2,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Smartphone,
  Globe,
  Moon,
  Sun
} from 'lucide-react'

interface NotificationPreferences {
  id?: string
  user_id?: string
  business_id?: string
  // Notification toggles
  weekly_report_reminder: boolean
  report_feedback: boolean
  data_changed: boolean
  someone_editing: boolean
  team_member_joined: boolean
  coaching_session: boolean
  weekly_digest: boolean
  // Delivery preferences
  email_enabled: boolean
  push_enabled: boolean
  in_app_enabled: boolean
  // Quiet hours
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  timezone: string
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  weekly_report_reminder: true,
  report_feedback: true,
  data_changed: true,
  someone_editing: false,
  team_member_joined: true,
  coaching_session: true,
  weekly_digest: true,
  email_enabled: true,
  push_enabled: true,
  in_app_enabled: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
}

interface NotificationItem {
  key: keyof NotificationPreferences
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  category: 'reports' | 'collaboration' | 'coaching'
}

const NOTIFICATION_ITEMS: NotificationItem[] = [
  // Reports category
  {
    key: 'weekly_report_reminder',
    label: 'Weekly Report Reminder',
    description: 'Get reminded every Friday to submit your weekly report',
    icon: Calendar,
    category: 'reports',
  },
  {
    key: 'report_feedback',
    label: 'Report Feedback',
    description: 'When someone comments on or reviews your weekly report',
    icon: MessageSquare,
    category: 'reports',
  },
  {
    key: 'weekly_digest',
    label: 'Weekly Digest',
    description: 'Weekly summary email with key updates and metrics',
    icon: Mail,
    category: 'reports',
  },
  // Collaboration category
  {
    key: 'data_changed',
    label: 'Data Changes',
    description: 'When someone edits data you created or are responsible for',
    icon: FileEdit,
    category: 'collaboration',
  },
  {
    key: 'someone_editing',
    label: 'Real-time Edit Alerts',
    description: 'Get notified when someone starts editing a page you\'re viewing',
    icon: Users,
    category: 'collaboration',
  },
  {
    key: 'team_member_joined',
    label: 'New Team Members',
    description: 'When a new team member accepts their invitation',
    icon: Users,
    category: 'collaboration',
  },
  // Coaching category
  {
    key: 'coaching_session',
    label: 'Coaching Sessions',
    description: 'Reminders and notes from coaching sessions',
    icon: Calendar,
    category: 'coaching',
  },
]

export default function NotificationPreferencesPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false)

  useEffect(() => {
    loadPreferences()
  }, [])

  async function loadPreferences() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's business
      const { data: businessUser } = await supabase
        .from('business_users')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!businessUser) {
        const { data: ownedBusiness } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (ownedBusiness) {
          setBusinessId(ownedBusiness.id)
        }
      } else {
        setBusinessId(businessUser.business_id)
      }

      const bizId = businessUser?.business_id || businessId
      if (!bizId) return

      // Load notification preferences
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('business_id', bizId)
        .maybeSingle()

      if (prefs) {
        setPreferences(prefs as NotificationPreferences)
        setQuietHoursEnabled(!!prefs.quiet_hours_start && !!prefs.quiet_hours_end)
      }
    } catch (err) {
      console.error('Error loading preferences:', err)
    } finally {
      setLoading(false)
    }
  }

  async function savePreferences() {
    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !businessId) return

      const prefsToSave = {
        ...preferences,
        user_id: user.id,
        business_id: businessId,
        quiet_hours_start: quietHoursEnabled ? preferences.quiet_hours_start : null,
        quiet_hours_end: quietHoursEnabled ? preferences.quiet_hours_end : null,
        updated_at: new Date().toISOString(),
      }

      const { error: upsertError } = await supabase
        .from('notification_preferences')
        .upsert(prefsToSave, { onConflict: 'user_id,business_id' })

      if (upsertError) throw upsertError

      setSuccess('Notification preferences saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error saving preferences:', err)
      setError(err.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  function togglePreference(key: keyof NotificationPreferences) {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const reportItems = NOTIFICATION_ITEMS.filter((i) => i.category === 'reports')
  const collaborationItems = NOTIFICATION_ITEMS.filter((i) => i.category === 'collaboration')
  const coachingItems = NOTIFICATION_ITEMS.filter((i) => i.category === 'coaching')

  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <PageHeader
        variant="banner"
        title="Notification Preferences"
        subtitle="Choose which notifications you want to receive"
        icon={Bell}
      />

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <X className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Delivery Methods */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900">Delivery Methods</h2>
            <p className="text-sm text-gray-500">Choose how you want to receive notifications</p>
          </div>
          <div className="p-6 space-y-4">
            {/* Email */}
            <button
              onClick={() => togglePreference('email_enabled')}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  preferences.email_enabled ? 'bg-brand-orange-100' : 'bg-gray-100'
                }`}>
                  <Mail className={`w-5 h-5 ${preferences.email_enabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-medium text-gray-900">Email</span>
                  <span className="block text-xs text-gray-500">Receive notifications via email</span>
                </div>
              </div>
              {preferences.email_enabled ? (
                <ToggleRight className="w-6 h-6 text-brand-orange" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-400" />
              )}
            </button>

            {/* In-App */}
            <button
              onClick={() => togglePreference('in_app_enabled')}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  preferences.in_app_enabled ? 'bg-brand-orange-100' : 'bg-gray-100'
                }`}>
                  <Globe className={`w-5 h-5 ${preferences.in_app_enabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-medium text-gray-900">In-App</span>
                  <span className="block text-xs text-gray-500">Show notifications in the app</span>
                </div>
              </div>
              {preferences.in_app_enabled ? (
                <ToggleRight className="w-6 h-6 text-brand-orange" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-400" />
              )}
            </button>

            {/* Push */}
            <button
              onClick={() => togglePreference('push_enabled')}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  preferences.push_enabled ? 'bg-brand-orange-100' : 'bg-gray-100'
                }`}>
                  <Smartphone className={`w-5 h-5 ${preferences.push_enabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-medium text-gray-900">Push Notifications</span>
                  <span className="block text-xs text-gray-500">Browser & mobile push notifications</span>
                </div>
              </div>
              {preferences.push_enabled ? (
                <ToggleRight className="w-6 h-6 text-brand-orange" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {/* Reports & Reviews */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900">Reports & Reviews</h2>
            <p className="text-sm text-gray-500">Weekly reports and team updates</p>
          </div>
          <div className="divide-y divide-gray-100">
            {reportItems.map((item) => {
              const Icon = item.icon
              const isEnabled = preferences[item.key] as boolean
              return (
                <button
                  key={item.key}
                  onClick={() => togglePreference(item.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <span className="block text-sm font-medium text-gray-900">{item.label}</span>
                      <span className="block text-xs text-gray-500">{item.description}</span>
                    </div>
                  </div>
                  {isEnabled ? (
                    <ToggleRight className="w-5 h-5 text-brand-orange flex-shrink-0" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Collaboration */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900">Collaboration</h2>
            <p className="text-sm text-gray-500">Team activity and real-time updates</p>
          </div>
          <div className="divide-y divide-gray-100">
            {collaborationItems.map((item) => {
              const Icon = item.icon
              const isEnabled = preferences[item.key] as boolean
              return (
                <button
                  key={item.key}
                  onClick={() => togglePreference(item.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <span className="block text-sm font-medium text-gray-900">{item.label}</span>
                      <span className="block text-xs text-gray-500">{item.description}</span>
                    </div>
                  </div>
                  {isEnabled ? (
                    <ToggleRight className="w-5 h-5 text-brand-orange flex-shrink-0" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Coaching */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900">Coaching</h2>
            <p className="text-sm text-gray-500">Session reminders and updates</p>
          </div>
          <div className="divide-y divide-gray-100">
            {coachingItems.map((item) => {
              const Icon = item.icon
              const isEnabled = preferences[item.key] as boolean
              return (
                <button
                  key={item.key}
                  onClick={() => togglePreference(item.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isEnabled ? 'text-brand-orange' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <span className="block text-sm font-medium text-gray-900">{item.label}</span>
                      <span className="block text-xs text-gray-500">{item.description}</span>
                    </div>
                  </div>
                  {isEnabled ? (
                    <ToggleRight className="w-5 h-5 text-brand-orange flex-shrink-0" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Quiet Hours</h2>
                <p className="text-sm text-gray-500">Pause notifications during specific hours</p>
              </div>
              <button
                onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                className="p-2"
              >
                {quietHoursEnabled ? (
                  <ToggleRight className="w-6 h-6 text-brand-orange" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-400" />
                )}
              </button>
            </div>
          </div>
          {quietHoursEnabled && (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Moon className="w-4 h-4 inline-block mr-1" />
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_start || '22:00'}
                    onChange={(e) => setPreferences({ ...preferences, quiet_hours_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Sun className="w-4 h-4 inline-block mr-1" />
                    End Time
                  </label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_end || '07:00'}
                    onChange={(e) => setPreferences({ ...preferences, quiet_hours_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Notifications will be paused between these hours ({preferences.timezone})
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={savePreferences}
            disabled={saving}
            className="px-6 py-2.5 bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Preferences
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
