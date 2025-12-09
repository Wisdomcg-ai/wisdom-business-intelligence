'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Loader2, Mail, MailX } from 'lucide-react'

interface ClientFormData {
  businessName: string
  firstName: string
  lastName: string
  email: string
  position: string
  accessLevel: 'full' | 'view_only' | 'limited'
  sendInvitation: boolean
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
    sendInvitation: true
  })

  const updateField = (field: keyof ClientFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
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
