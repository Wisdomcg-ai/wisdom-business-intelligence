'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/admin/AdminLayout'
import { RoleBadge } from '@/components/admin/Badge'
import { ToastProvider, useToast } from '@/components/admin/Toast'
import PageHeader from '@/components/ui/PageHeader'
import {
  Users,
  Search,
  Key,
  Send,
  Loader2,
  X,
  Check,
  Copy,
  Mail,
  AlertCircle
} from 'lucide-react'

interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  system_role: string | null
}

function UsersContent() {
  const supabase = createClient()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // Modal states
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [resetMethod, setResetMethod] = useState<'email' | 'generate' | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<{ type: 'email' | 'password'; password?: string } | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, system_role')
        .order('email')

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(method: 'email' | 'generate') {
    if (!selectedUser) return

    setResetting(true)
    setResetMethod(method)

    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          email: selectedUser.email,
          action: method === 'email' ? 'send_email' : 'generate'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      if (data.method === 'email') {
        setResetResult({ type: 'email' })
        toast.success('Reset email sent', `Password reset link sent to ${selectedUser.email}`)
      } else {
        setResetResult({ type: 'password', password: data.tempPassword })
      }
    } catch (error) {
      toast.error('Failed to reset password', error instanceof Error ? error.message : 'Please try again')
      closeModal()
    } finally {
      setResetting(false)
    }
  }

  function closeModal() {
    setSelectedUser(null)
    setResetMethod(null)
    setResetResult(null)
    setCopiedPassword(false)
  }

  function copyPassword() {
    if (resetResult?.password) {
      navigator.clipboard.writeText(resetResult.password)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  // Filter users
  const filteredUsers = searchTerm.length >= 2
    ? users.filter(user => {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase()
        return fullName.includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
      }).slice(0, 20)
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
          <p className="text-gray-500 text-sm">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="User Management"
        subtitle="Search for users and reset their passwords"
        icon={Users}
        variant="simple"
      />

      {/* Search Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-orange-100 rounded-xl flex items-center justify-center">
            <Key className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-brand-navy">Password Reset</h2>
            <p className="text-xs sm:text-sm text-gray-500">Search for a user to reset their password</p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 bg-gray-50 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Hint */}
        {searchTerm.length > 0 && searchTerm.length < 2 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <AlertCircle className="w-4 h-4" />
            Type at least 2 characters to search...
          </div>
        )}

        {/* Results */}
        {searchTerm.length >= 2 && (
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
              {filteredUsers.length === 20 && ' (showing first 20)'}
            </p>

            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm sm:text-base text-gray-500">No users found matching "{searchTerm}"</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-brand-orange-400 to-emerald-500 rounded-xl flex items-center justify-center text-white text-sm sm:text-base font-semibold flex-shrink-0">
                        {user.first_name?.[0] || user.email[0].toUpperCase()}
                        {user.last_name?.[0] || ''}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm sm:text-base font-medium text-brand-navy truncate">
                            {user.first_name && user.last_name
                              ? `${user.first_name} ${user.last_name}`
                              : user.email.split('@')[0]}
                          </p>
                          {user.system_role && (
                            <RoleBadge role={user.system_role as 'super_admin' | 'coach' | 'client'} />
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange text-white font-medium text-xs sm:text-sm rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors w-full sm:w-auto flex-shrink-0"
                    >
                      <Key className="w-4 h-4" />
                      <span className="hidden sm:inline">Reset Password</span>
                      <span className="sm:hidden">Reset</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state when no search */}
        {searchTerm.length === 0 && (
          <div className="text-center py-8 sm:py-12 border-2 border-dashed border-slate-200 rounded-xl">
            <Search className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm sm:text-base text-gray-600 font-medium mb-1">Search for a user</p>
            <p className="text-xs sm:text-sm text-slate-400">Enter an email or name to find users and reset their passwords</p>
          </div>
        )}
      </div>

      {/* All Users Count */}
      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <span className="text-xs sm:text-sm text-gray-600">
            <strong>{users.length}</strong> total users in the system
          </span>
        </div>
      </div>

      {/* Reset Password Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-semibold text-brand-navy">Reset Password</h2>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-gray-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetResult ? (
              /* Success State */
              <div className="p-4 sm:p-6 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 sm:w-8 sm:h-8 text-green-600" />
                </div>

                {resetResult.type === 'email' ? (
                  <>
                    <h3 className="text-base sm:text-lg font-semibold text-brand-navy mb-2">Reset Email Sent!</h3>
                    <p className="text-sm sm:text-base text-gray-500 mb-6">
                      A password reset link has been sent to<br />
                      <strong className="text-brand-navy break-all">{selectedUser.email}</strong>
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base sm:text-lg font-semibold text-brand-navy mb-2">Password Reset!</h3>
                    <p className="text-xs sm:text-sm text-gray-500 mb-4">Share these credentials with the user:</p>

                    <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-left mb-4">
                      <div className="mb-3">
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm sm:text-base font-medium text-brand-navy break-all">{selectedUser.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">New Password</p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="flex-1 bg-white px-2 sm:px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs sm:text-sm break-all">
                            {resetResult.password}
                          </code>
                          <button
                            onClick={copyPassword}
                            className="p-2 text-gray-500 hover:text-brand-orange hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
                          >
                            {copiedPassword ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-4">They should change their password after logging in.</p>
                  </>
                )}

                <button
                  onClick={closeModal}
                  className="w-full py-2.5 sm:py-3 bg-brand-orange text-white font-medium text-sm sm:text-base rounded-lg hover:bg-brand-orange-600 shadow-sm transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Selection State */
              <div className="p-4 sm:p-6">
                {/* User Info */}
                <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-xl mb-4 sm:mb-6">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-brand-orange-400 to-emerald-500 rounded-xl flex items-center justify-center text-white text-sm sm:text-base font-semibold flex-shrink-0">
                    {selectedUser.first_name?.[0] || selectedUser.email[0].toUpperCase()}
                    {selectedUser.last_name?.[0] || ''}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-medium text-brand-navy truncate">
                      {selectedUser.first_name && selectedUser.last_name
                        ? `${selectedUser.first_name} ${selectedUser.last_name}`
                        : selectedUser.email.split('@')[0]}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{selectedUser.email}</p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">Choose how to reset the password:</p>

                {/* Reset Options */}
                <div className="space-y-3">
                  <button
                    onClick={() => handleResetPassword('email')}
                    disabled={resetting}
                    className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-slate-200 rounded-xl hover:border-brand-orange-500 hover:bg-brand-orange-50 transition-all disabled:opacity-50 group"
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-orange-100 rounded-xl flex items-center justify-center group-hover:bg-brand-orange-500 transition-colors flex-shrink-0">
                      {resetting && resetMethod === 'email' ? (
                        <Loader2 className="w-5 h-5 text-brand-orange group-hover:text-white animate-spin" />
                      ) : (
                        <Send className="w-5 h-5 text-brand-orange group-hover:text-white transition-colors" />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium text-brand-navy">Send Reset Email</p>
                      <p className="text-xs sm:text-sm text-gray-500">User will receive an email with a reset link</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleResetPassword('generate')}
                    disabled={resetting}
                    className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-slate-200 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all disabled:opacity-50 group"
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-500 transition-colors flex-shrink-0">
                      {resetting && resetMethod === 'generate' ? (
                        <Loader2 className="w-5 h-5 text-amber-600 group-hover:text-white animate-spin" />
                      ) : (
                        <Key className="w-5 h-5 text-amber-600 group-hover:text-white transition-colors" />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium text-brand-navy">Generate Temporary Password</p>
                      <p className="text-xs sm:text-sm text-gray-500">Get a password to share with the user directly</p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={closeModal}
                  className="w-full mt-4 py-2.5 text-sm sm:text-base text-gray-600 hover:text-brand-navy transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <ToastProvider>
      <AdminLayout>
        <UsersContent />
      </AdminLayout>
    </ToastProvider>
  )
}
