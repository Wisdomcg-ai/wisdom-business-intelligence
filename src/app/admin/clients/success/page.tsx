'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, ArrowLeft, Mail, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'

function ClientCreatedSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState('')

  const email = searchParams?.get('email') || ''
  const name = searchParams?.get('name') || ''
  const business = searchParams?.get('business') || ''
  const emailSent = searchParams?.get('emailSent') === 'true'
  const invitationDeferred = searchParams?.get('invitationDeferred') === 'true'

  useEffect(() => {
    // Redirect if no email (required param)
    if (!email) {
      router.push('/admin')
    }
  }, [email, router])

  const handleResendInvitation = async () => {
    setResending(true)
    setResendError('')
    setResendSuccess(false)

    try {
      const response = await fetch('/api/admin/clients/resend-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend invitation')
      }

      setResendSuccess(true)
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Failed to resend')
    } finally {
      setResending(false)
    }
  }

  if (!email) {
    return null
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
              <h1 className="text-2xl font-bold text-gray-900">Client Created Successfully</h1>
              <p className="text-sm text-gray-600">Account has been set up</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-lg font-semibold text-green-900">Account Created!</h2>
              <p className="text-sm text-green-700">
                {name} from {business} has been added to the platform
              </p>
            </div>
          </div>
        </div>

        {/* Email Status Notice */}
        {invitationDeferred ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-900">Invitation Not Sent Yet</h4>
                <p className="text-sm text-amber-800 mt-1">
                  The account was created but no invitation email was sent. Click below to send the invitation with login credentials.
                </p>
                <button
                  onClick={handleResendInvitation}
                  disabled={resending || resendSuccess}
                  className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Invitation Sent!
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invitation Email
                    </>
                  )}
                </button>
                {resendError && (
                  <p className="text-sm text-red-600 mt-2">{resendError}</p>
                )}
              </div>
            </div>
          </div>
        ) : emailSent || resendSuccess ? (
          <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-brand-navy">Invitation Email Sent</h4>
                <p className="text-sm text-brand-navy mt-1">
                  An email with login credentials has been sent to <strong>{email}</strong>.
                  The client can now log in using the temporary password in the email.
                </p>
                <button
                  onClick={handleResendInvitation}
                  disabled={resending}
                  className="mt-3 text-sm text-brand-orange hover:text-brand-orange-600 flex items-center gap-1"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Resending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      Resend invitation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Account Details */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {email}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {name}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {business}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Login URL
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'}
              </div>
            </div>
          </div>
        </div>

        {/* Info Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">How it works</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• The client receives an email with a temporary password</li>
            <li>• They can log in immediately using that password</li>
            <li>• They will be prompted to change their password on first login</li>
            <li>• You can resend the invitation anytime from the client list</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/admin/clients/new"
            className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-center"
          >
            Add Another Client
          </Link>
          <Link
            href="/admin"
            className="flex-1 px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors text-center"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ClientCreatedSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ClientCreatedSuccessContent />
    </Suspense>
  )
}
