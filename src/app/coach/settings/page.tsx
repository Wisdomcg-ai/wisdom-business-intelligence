'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ProfileSettings,
  NotificationSettings,
  CalendarIntegration,
  TemplatesLibrary,
  QuestionBank,
  type CoachProfile,
  type NotificationPreferences,
  type Template,
  type CoachingQuestion
} from '@/components/coach/settings'
import {
  User,
  Bell,
  Calendar,
  FileText,
  HelpCircle,
  Loader2
} from 'lucide-react'

type SettingsTab = 'profile' | 'notifications' | 'calendar' | 'templates' | 'questions'

export default function SettingsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  // Profile data
  const [profile, setProfile] = useState<CoachProfile>({
    firstName: '',
    lastName: '',
    email: '',
    timezone: 'Australia/Sydney',
    defaultSessionLength: 60
  })

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    email: {
      newMessage: true,
      sessionReminder: true,
      actionDue: true,
      clientActivity: true,
      weeklyDigest: true
    },
    push: {
      newMessage: true,
      sessionReminder: true,
      actionDue: false,
      clientActivity: false
    },
    reminderTiming: {
      sessionReminder: 24,
      actionDue: 2
    }
  })

  // Calendar connections
  const [calendarConnections, setCalendarConnections] = useState<Array<{
    provider: 'google' | 'outlook' | 'apple'
    connected: boolean
    email?: string
    lastSync?: string
  }>>([
    { provider: 'google', connected: false },
    { provider: 'outlook', connected: false },
    { provider: 'apple', connected: false }
  ])

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])

  // Questions
  const [questions, setQuestions] = useState<CoachingQuestion[]>([])

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load profile
      setProfile({
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
        businessName: user.user_metadata?.business_name || '',
        website: user.user_metadata?.website || '',
        bio: user.user_metadata?.bio || '',
        avatarUrl: user.user_metadata?.avatar_url || '',
        timezone: user.user_metadata?.timezone || 'Australia/Sydney',
        defaultSessionLength: user.user_metadata?.default_session_length || 60
      })

      // Load notification preferences (would come from a settings table)
      // Using defaults for now

      // Load templates
      const { data: templatesData } = await supabase
        .from('session_templates')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

      if (templatesData) {
        setTemplates(templatesData.map(t => ({
          id: t.id,
          type: t.type || 'session',
          name: t.name,
          description: t.description || undefined,
          content: t.agenda || t.content || '',
          isDefault: t.is_default || false,
          createdAt: t.created_at
        })))
      }

      // Load questions
      const { data: questionsData } = await supabase
        .from('coach_questions')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

      if (questionsData) {
        setQuestions(questionsData.map(q => ({
          id: q.id,
          question: q.question,
          category: q.category || 'discovery',
          subcategory: q.subcategory || undefined,
          isTemplate: q.is_template || false,
          useCount: q.use_count || 0,
          createdAt: q.created_at
        })))
      }

    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async (updatedProfile: CoachProfile) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: updatedProfile.firstName,
        last_name: updatedProfile.lastName,
        phone: updatedProfile.phone,
        business_name: updatedProfile.businessName,
        website: updatedProfile.website,
        bio: updatedProfile.bio,
        timezone: updatedProfile.timezone,
        default_session_length: updatedProfile.defaultSessionLength
      }
    })

    if (error) throw error
    setProfile(updatedProfile)
  }

  const handleSaveNotifications = async (prefs: NotificationPreferences) => {
    // Would save to a settings table
    setNotificationPrefs(prefs)
  }

  const handleConnectCalendar = async (provider: 'google' | 'outlook' | 'apple') => {
    // Would initiate OAuth flow
    console.log('Connect calendar:', provider)
    // Simulate connection
    setCalendarConnections(prev => prev.map(c =>
      c.provider === provider
        ? { ...c, connected: true, email: 'coach@example.com', lastSync: new Date().toISOString() }
        : c
    ))
  }

  const handleDisconnectCalendar = async (provider: 'google' | 'outlook' | 'apple') => {
    setCalendarConnections(prev => prev.map(c =>
      c.provider === provider
        ? { ...c, connected: false, email: undefined, lastSync: undefined }
        : c
    ))
  }

  const handleSyncCalendar = async (provider: 'google' | 'outlook' | 'apple') => {
    // Would trigger calendar sync
    await new Promise(resolve => setTimeout(resolve, 1000))
    setCalendarConnections(prev => prev.map(c =>
      c.provider === provider
        ? { ...c, lastSync: new Date().toISOString() }
        : c
    ))
  }

  const handleCreateTemplate = async (template: Omit<Template, 'id' | 'createdAt'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('session_templates')
      .insert({
        coach_id: user.id,
        type: template.type,
        name: template.name,
        description: template.description,
        agenda: template.content,
        is_default: template.isDefault || false
      })
      .select()
      .single()

    if (error) throw error
    if (data) {
      setTemplates(prev => [{
        id: data.id,
        type: data.type || 'session',
        name: data.name,
        description: data.description || undefined,
        content: data.agenda || '',
        isDefault: data.is_default || false,
        createdAt: data.created_at
      }, ...prev])
    }
  }

  const handleUpdateTemplate = async (id: string, updates: Partial<Template>) => {
    const { error } = await supabase
      .from('session_templates')
      .update({
        name: updates.name,
        description: updates.description,
        agenda: updates.content
      })
      .eq('id', id)

    if (error) throw error
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase
      .from('session_templates')
      .delete()
      .eq('id', id)

    if (error) throw error
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const handleDuplicateTemplate = async (id: string) => {
    const template = templates.find(t => t.id === id)
    if (!template) return

    await handleCreateTemplate({
      type: template.type,
      name: `${template.name} (Copy)`,
      description: template.description,
      content: template.content,
      isDefault: false
    })
  }

  const handleCreateQuestion = async (question: Omit<CoachingQuestion, 'id' | 'createdAt' | 'useCount'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('coach_questions')
      .insert({
        coach_id: user.id,
        question: question.question,
        category: question.category,
        subcategory: question.subcategory,
        is_template: question.isTemplate
      })
      .select()
      .single()

    if (error) throw error
    if (data) {
      setQuestions(prev => [{
        id: data.id,
        question: data.question,
        category: data.category || 'discovery',
        subcategory: data.subcategory || undefined,
        isTemplate: data.is_template || false,
        useCount: 0,
        createdAt: data.created_at
      }, ...prev])
    }
  }

  const handleUpdateQuestion = async (id: string, updates: Partial<CoachingQuestion>) => {
    const { error } = await supabase
      .from('coach_questions')
      .update({
        question: updates.question,
        category: updates.category,
        subcategory: updates.subcategory
      })
      .eq('id', id)

    if (error) throw error
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q))
  }

  const handleDeleteQuestion = async (id: string) => {
    const { error } = await supabase
      .from('coach_questions')
      .delete()
      .eq('id', id)

    if (error) throw error
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
    { id: 'templates' as const, label: 'Templates', icon: FileText },
    { id: 'questions' as const, label: 'Question Bank', icon: HelpCircle }
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your profile, preferences, and templates</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
          <nav className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 border-l-2 border-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span className="font-medium">{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <ProfileSettings
              profile={profile}
              onSave={handleSaveProfile}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationSettings
              preferences={notificationPrefs}
              onSave={handleSaveNotifications}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarIntegration
              connections={calendarConnections}
              onConnect={handleConnectCalendar}
              onDisconnect={handleDisconnectCalendar}
              onSync={handleSyncCalendar}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesLibrary
              templates={templates}
              onCreateTemplate={handleCreateTemplate}
              onUpdateTemplate={handleUpdateTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onDuplicateTemplate={handleDuplicateTemplate}
            />
          )}

          {activeTab === 'questions' && (
            <QuestionBank
              questions={questions}
              onCreateQuestion={handleCreateQuestion}
              onUpdateQuestion={handleUpdateQuestion}
              onDeleteQuestion={handleDeleteQuestion}
            />
          )}
        </div>
      </div>
    </div>
  )
}
