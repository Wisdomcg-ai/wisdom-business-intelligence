'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Lock, CheckCircle, AlertCircle } from 'lucide-react'

function UpdatePasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') || null

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    verifyToken()
  }, [token])

  const verifyToken = async () => {
    if (!token) {
      setTokenError('No reset token provided')
      setIsVerifying(false)
      return
    }

    try {
      const response = await fetch(`/api/auth/update-password?token=${token}`)
      const data = await response.json()

      if (!data.valid) {
        setTokenError(data.error || 'Invalid or expired token')
      }
    } catch (err) {
      setTokenError('Failed to verify reset link')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password')
      }

      setSuccess(true)

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state while verifying token
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-800 to-brand-navy-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange mx-auto" />
          <p className="text-gray-600 mt-4">Verifying reset link...</p>
        </div>
      </div>
    )
  }

  // Invalid or expired token
  if (tokenError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-800 to-brand-navy-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid or Expired Link</h1>
            <p className="text-gray-600 mb-6">
              {tokenError}. Please request a new password reset link.
            </p>
            <Link
              href="/auth/reset-password"
              className="inline-flex items-center justify-center w-full bg-brand-orange text-white py-2 px-4 rounded-lg hover:bg-brand-orange-600 font-medium"
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-800 to-brand-navy-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Updated!</h1>
            <p className="text-gray-600 mb-6">
              Your password has been successfully updated. Redirecting you to login...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-brand-orange mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-800 to-brand-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-orange-100 rounded-full mb-4">
            <Lock className="h-8 w-8 text-brand-orange" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set New Password</h1>
          <p className="text-gray-600 mt-2">
            Enter your new password below.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                placeholder="Enter new password"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Password must be at least 6 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
                placeholder="Confirm new password"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-orange text-white py-2 px-4 rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 mr-2" />
                Updating Password...
              </>
            ) : (
              'Update Password'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-800 to-brand-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-orange mx-auto" />
        <p className="text-gray-600 mt-4">Loading...</p>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UpdatePasswordContent />
    </Suspense>
  )
}
