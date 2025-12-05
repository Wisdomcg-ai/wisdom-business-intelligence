'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Briefcase, Lock, Mail, AlertCircle } from 'lucide-react'
import { getUserSystemRole } from '@/lib/auth/roles'

export default function CoachLogin() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      console.log('[CoachLogin] Attempting login...')

      // Sign in with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      console.log('[CoachLogin] SignIn result:', signInError ? signInError.message : 'success')

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      // Check if user has coach or super_admin role
      const role = await getUserSystemRole()
      console.log('[CoachLogin] User role:', role)

      if (role !== 'coach' && role !== 'super_admin') {
        // Not authorized for coach portal - sign them out
        await supabase.auth.signOut()
        setError('Access denied. Coach or Admin privileges required.')
        setLoading(false)
        return
      }

      console.log('[CoachLogin] Login successful! Redirecting...')
      router.push('/coach/dashboard')

    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Coach Portal
          </h1>
          <p className="text-teal-200">
            Wisdom Business Intelligence
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="coach@wisdombi.com.au"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>
              <div className="text-right mt-1">
                <a href="/auth/reset-password" className="text-sm text-indigo-600 hover:text-indigo-700">
                  Forgot password?
                </a>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In to Coach Portal'}
            </button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center space-y-2">
            <a href="/auth/login" className="text-sm text-indigo-600 hover:text-indigo-700">
              Client Login →
            </a>
            <br />
            <a href="/admin/login" className="text-sm text-indigo-600 hover:text-indigo-700">
              Admin Login →
            </a>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-sm text-teal-200">
            <Lock className="w-4 h-4 inline mr-1" />
            Secure coach access
          </p>
        </div>

        {/* Legal Links */}
        <div className="mt-4 text-center">
          <a href="/privacy" className="text-xs text-teal-300 hover:text-white mx-2">Privacy Policy</a>
          <span className="text-teal-400">•</span>
          <a href="/terms" className="text-xs text-teal-300 hover:text-white mx-2">Terms of Service</a>
        </div>
      </div>
    </div>
  )
}
