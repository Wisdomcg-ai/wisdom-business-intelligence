'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Copy, Check, ArrowLeft, Mail } from 'lucide-react'

function ClientCreatedSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const email = searchParams?.get('email') || ''
  const password = searchParams?.get('password') || ''
  const name = searchParams?.get('name') || ''
  const business = searchParams?.get('business') || ''

  useEffect(() => {
    // Redirect if no credentials
    if (!email || !password) {
      router.push('/admin')
    }
  }, [email, password, router])

  const copyToClipboard = async () => {
    const credentials = `
Welcome to Wisdom BI!

Your account has been created successfully.

Login Details:
Email: ${email}
Temporary Password: ${password}

Please log in at: ${window.location.origin}/client/login

For security, please change your password after your first login.
    `.trim()

    try {
      await navigator.clipboard.writeText(credentials)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (!email || !password) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
              <p className="text-sm text-gray-600">Account details and login credentials</p>
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
                {name} from {business} can now log in to Wisdom BI
              </p>
            </div>
          </div>
        </div>

        {/* Login Credentials */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Login Credentials</h3>

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
                Temporary Password
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm break-all">
                {password}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Login URL
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {typeof window !== 'undefined' ? `${window.location.origin}/client/login` : '/client/login'}
              </div>
            </div>
          </div>

          <button
            onClick={copyToClipboard}
            className="mt-6 w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" />
                Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copy All Credentials
              </>
            )}
          </button>
        </div>

        {/* Important Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">Important</h4>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• Share these credentials securely with your client</li>
            <li>• This password will not be shown again</li>
            <li>• Client should change their password after first login</li>
            <li>• Save this information before leaving this page</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/admin/clients/new"
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-center"
          >
            Add Another Client
          </Link>
          <Link
            href="/admin"
            className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-center"
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ClientCreatedSuccessContent />
    </Suspense>
  )
}
