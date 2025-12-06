'use client'

import { useState } from 'react'
import {
  Bell,
  Mail,
  MessageSquare,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Save,
  Loader2
} from 'lucide-react'

export interface NotificationPreferences {
  email: {
    newMessage: boolean
    sessionReminder: boolean
    actionDue: boolean
    clientActivity: boolean
    weeklyDigest: boolean
  }
  push: {
    newMessage: boolean
    sessionReminder: boolean
    actionDue: boolean
    clientActivity: boolean
  }
  reminderTiming: {
    sessionReminder: number // hours before
    actionDue: number // days before
  }
}

interface NotificationSettingsProps {
  preferences: NotificationPreferences
  onSave: (preferences: NotificationPreferences) => Promise<void>
}

export function NotificationSettings({ preferences: initialPrefs, onSave }: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(initialPrefs)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    try {
      setSaving(true)
      await onSave(preferences)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error saving preferences:', error)
    } finally {
      setSaving(false)
    }
  }

  const ToggleSwitch = ({
    enabled,
    onChange,
    label,
    description
  }: {
    enabled: boolean
    onChange: (enabled: boolean) => void
    label: string
    description?: string
  }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-brand-orange' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )

  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Notification Settings</h3>
        <p className="text-sm text-gray-500 mt-1">Control how and when you receive notifications</p>
      </div>

      <div className="p-6 space-y-8">
        {/* Email Notifications */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Email Notifications</h4>
              <p className="text-sm text-gray-500">Receive updates via email</p>
            </div>
          </div>

          <div className="pl-13 space-y-1 divide-y divide-gray-100">
            <ToggleSwitch
              enabled={preferences.email.newMessage}
              onChange={(enabled) => setPreferences({
                ...preferences,
                email: { ...preferences.email, newMessage: enabled }
              })}
              label="New Messages"
              description="When a client sends you a message"
            />
            <ToggleSwitch
              enabled={preferences.email.sessionReminder}
              onChange={(enabled) => setPreferences({
                ...preferences,
                email: { ...preferences.email, sessionReminder: enabled }
              })}
              label="Session Reminders"
              description="Reminder before scheduled sessions"
            />
            <ToggleSwitch
              enabled={preferences.email.actionDue}
              onChange={(enabled) => setPreferences({
                ...preferences,
                email: { ...preferences.email, actionDue: enabled }
              })}
              label="Action Due Dates"
              description="When client actions are due or overdue"
            />
            <ToggleSwitch
              enabled={preferences.email.clientActivity}
              onChange={(enabled) => setPreferences({
                ...preferences,
                email: { ...preferences.email, clientActivity: enabled }
              })}
              label="Client Activity"
              description="When clients complete goals or actions"
            />
            <ToggleSwitch
              enabled={preferences.email.weeklyDigest}
              onChange={(enabled) => setPreferences({
                ...preferences,
                email: { ...preferences.email, weeklyDigest: enabled }
              })}
              label="Weekly Digest"
              description="Summary of the week's activity every Monday"
            />
          </div>
        </div>

        {/* Push Notifications */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-brand-navy-50 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-brand-navy" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Push Notifications</h4>
              <p className="text-sm text-gray-500">Browser and mobile notifications</p>
            </div>
          </div>

          <div className="pl-13 space-y-1 divide-y divide-gray-100">
            <ToggleSwitch
              enabled={preferences.push.newMessage}
              onChange={(enabled) => setPreferences({
                ...preferences,
                push: { ...preferences.push, newMessage: enabled }
              })}
              label="New Messages"
              description="Instant notification for new messages"
            />
            <ToggleSwitch
              enabled={preferences.push.sessionReminder}
              onChange={(enabled) => setPreferences({
                ...preferences,
                push: { ...preferences.push, sessionReminder: enabled }
              })}
              label="Session Reminders"
              description="Alert before sessions start"
            />
            <ToggleSwitch
              enabled={preferences.push.actionDue}
              onChange={(enabled) => setPreferences({
                ...preferences,
                push: { ...preferences.push, actionDue: enabled }
              })}
              label="Action Due Dates"
              description="Reminder when actions are due"
            />
            <ToggleSwitch
              enabled={preferences.push.clientActivity}
              onChange={(enabled) => setPreferences({
                ...preferences,
                push: { ...preferences.push, clientActivity: enabled }
              })}
              label="Client Activity"
              description="Updates on client progress"
            />
          </div>
        </div>

        {/* Reminder Timing */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Reminder Timing</h4>
              <p className="text-sm text-gray-500">When to send reminder notifications</p>
            </div>
          </div>

          <div className="pl-13 grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Reminder
              </label>
              <select
                value={preferences.reminderTiming.sessionReminder}
                onChange={(e) => setPreferences({
                  ...preferences,
                  reminderTiming: {
                    ...preferences.reminderTiming,
                    sessionReminder: parseInt(e.target.value)
                  }
                })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value={1}>1 hour before</option>
                <option value={2}>2 hours before</option>
                <option value={24}>1 day before</option>
                <option value={48}>2 days before</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action Due Reminder
              </label>
              <select
                value={preferences.reminderTiming.actionDue}
                onChange={(e) => setPreferences({
                  ...preferences,
                  reminderTiming: {
                    ...preferences.reminderTiming,
                    actionDue: parseInt(e.target.value)
                  }
                })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
              >
                <option value={1}>1 day before</option>
                <option value={2}>2 days before</option>
                <option value={3}>3 days before</option>
                <option value={7}>1 week before</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-6 border-t border-gray-200 flex items-center justify-end gap-4">
          {saved && (
            <span className="text-sm text-green-600 font-medium">Preferences saved!</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationSettings
