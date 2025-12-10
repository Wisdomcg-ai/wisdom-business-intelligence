'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Loader2, Mail, MailX, Users, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'

interface TeamMember {
  firstName: string
  lastName: string
  email: string
  position: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

interface ClientFormData {
  businessName: string
  firstName: string
  lastName: string
  email: string
  position: string
  accessLevel: 'full' | 'view_only' | 'limited'
  sendInvitation: boolean
  teamMembers: TeamMember[]
}

export default function NewClientPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState<ClientFormData>({
    businessName: '',
    firstName: '',
    lastName: '',
    email: '',
    position: 'Owner',
    accessLevel: 'full',
    sendInvitation: true,
    teamMembers: []
  })
  const [showTeamSection, setShowTeamSection] = useState(false)

  const updateField = (field: keyof ClientFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const addTeamMember = () => {
    setFormData(prev => ({
      ...prev,
      teamMembers: [...prev.teamMembers, {
        firstName: '',
        lastName: '',
        email: '',
        position: '',
        role: 'member'
      }]
    }))
    setShowTeamSection(true)
  }

  const updateTeamMember = (index: number, field: keyof TeamMember, value: string) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      )
    }))
  }

  const removeTeamMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.businessName || !formData.firstName || !formData.lastName || !formData.email) {
      setError('All fields are required')
      return
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create client')
      }

      // Success! Redirect to success page
      const params = new URLSearchParams({
        email: data.user.email,
        name: `${formData.firstName} ${formData.lastName}`,
        business: formData.businessName,
        emailSent: data.emailSent ? 'true' : 'false',
        invitationDeferred: data.invitationDeferred ? 'true' : 'false'
      })
      router.push(`/admin/clients/success?${params.toString()}`)

    } catch (err) {
      console.error('Error creating client:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Add New Client</h1>
              <p className="text-sm text-gray-600">Create a new client account</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="w-6 h-6 text-brand-orange" />
              <h2 className="text-xl font-semibold">Client Details</h2>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => updateField('businessName', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                placeholder="ABC Construction Pty Ltd"
                required
              />
            </div>

            {/* First Name & Last Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  placeholder="John"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  placeholder="Smith"
                  required
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                placeholder="john@example.com"
                required
              />
            </div>

            {/* Position */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position *
              </label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => updateField('position', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                placeholder="Owner, CEO, Manager, etc."
                required
              />
            </div>

            {/* Access Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Level *
              </label>
              <select
                value={formData.accessLevel}
                onChange={(e) => updateField('accessLevel', e.target.value as 'full' | 'view_only' | 'limited')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                required
              >
                <option value="full">Full Access - Can view and edit everything</option>
                <option value="view_only">View Only - Can view but not edit</option>
                <option value="limited">Limited - Basic access to essential features</option>
              </select>
            </div>

            {/* Send Invitation Toggle */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => updateField('sendInvitation', !formData.sendInvitation)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 ${
                    formData.sendInvitation ? 'bg-brand-orange' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.sendInvitation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {formData.sendInvitation ? (
                      <Mail className="w-4 h-4 text-brand-orange" />
                    ) : (
                      <MailX className="w-4 h-4 text-gray-400" />
                    )}
                    <label className="text-sm font-medium text-gray-900">
                      {formData.sendInvitation ? 'Send invitation email now' : 'Don\'t send invitation email'}
                    </label>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.sendInvitation
                      ? 'The client will receive an email with their login credentials immediately.'
                      : 'Account will be created but no email sent. You can send the invitation later from the client list.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Team Members Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTeamSection(!showTeamSection)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">
                    Add Business Partners / Team Members
                  </span>
                  {formData.teamMembers.length > 0 && (
                    <span className="px-2 py-0.5 bg-brand-orange text-white text-xs rounded-full">
                      {formData.teamMembers.length}
                    </span>
                  )}
                </div>
                {showTeamSection ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showTeamSection && (
                <div className="p-4 space-y-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Add additional team members who will have access to this business. They will receive login credentials via email.
                  </p>

                  {formData.teamMembers.map((member, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Team Member {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={member.firstName}
                          onChange={(e) => updateTeamMember(index, 'firstName', e.target.value)}
                          placeholder="First Name *"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={member.lastName}
                          onChange={(e) => updateTeamMember(index, 'lastName', e.target.value)}
                          placeholder="Last Name"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                      </div>

                      <input
                        type="email"
                        value={member.email}
                        onChange={(e) => updateTeamMember(index, 'email', e.target.value)}
                        placeholder="Email Address *"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={member.position}
                          onChange={(e) => updateTeamMember(index, 'position', e.target.value)}
                          placeholder="Position (e.g., Partner, Manager)"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        />
                        <select
                          value={member.role}
                          onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                        >
                          <option value="owner">Owner/Partner - Full access</option>
                          <option value="admin">Admin - Can manage team</option>
                          <option value="member">Member - View & edit</option>
                          <option value="viewer">Viewer - Read only</option>
                        </select>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addTeamMember}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-brand-orange hover:text-brand-orange transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Team Member
                  </button>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className={`rounded-lg p-4 ${formData.sendInvitation ? 'bg-brand-orange-50 border border-brand-orange-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className={`text-sm font-medium mb-2 ${formData.sendInvitation ? 'text-brand-navy' : 'text-amber-900'}`}>What happens next:</p>
              <ul className={`text-sm space-y-1 ${formData.sendInvitation ? 'text-brand-orange-800' : 'text-amber-800'}`}>
                <li>✓ Account created with temporary password</li>
                <li>✓ Client can log in immediately</li>
                {formData.sendInvitation ? (
                  <li>✓ Client will receive email with login credentials</li>
                ) : (
                  <>
                    <li>✓ Password will be shown after creation (copy it!)</li>
                    <li>⚠ No email sent - you'll need to share credentials manually or send invitation later</li>
                  </>
                )}
                {formData.teamMembers.length > 0 && (
                  <li>✓ {formData.teamMembers.length} team member{formData.teamMembers.length > 1 ? 's' : ''} will be invited</li>
                )}
              </ul>
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Create Client Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
