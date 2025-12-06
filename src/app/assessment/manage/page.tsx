'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Trash2, Plus, AlertTriangle, FileText, Calendar, CheckCircle, XCircle } from 'lucide-react'

interface Assessment {
  id: string
  created_at: string
  completion_percentage: number
  total_score: number
  health_status: string
  revenue_stage: string
}

export default function ManageAssessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null)
  const router = useRouter()
  // supabase client imported from lib

  useEffect(() => {
    loadAssessments()
  }, [])

  const loadAssessments = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user's business
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

      if (!profile?.business_id) {
        setLoading(false)
        return
      }

      // Get all assessments for this business
      const { data: assessmentData, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: false })

      if (!error && assessmentData) {
        setAssessments(assessmentData)
      }
    } catch (error) {
      console.error('Error loading assessments:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteAssessment = async (assessmentId: string) => {
    setDeleting(assessmentId)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('id', assessmentId)

      if (error) {
        alert('Failed to delete assessment: ' + error.message)
      } else {
        // Remove from local state
        setAssessments(prev => prev.filter(a => a.id !== assessmentId))
        setShowConfirmDelete(null)
      }
    } catch (error) {
      console.error('Error deleting assessment:', error)
      alert('Failed to delete assessment')
    } finally {
      setDeleting(null)
    }
  }

  const deleteAllAssessments = async () => {
    if (!confirm('Are you ABSOLUTELY sure? This will permanently delete ALL assessments and cannot be undone!')) {
      return
    }

    setDeleting('all')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

      if (!profile?.business_id) return

      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('business_id', profile.business_id)

      if (error) {
        alert('Failed to delete assessments: ' + error.message)
      } else {
        setAssessments([])
        alert('All assessments have been deleted')
      }
    } catch (error) {
      console.error('Error deleting all assessments:', error)
      alert('Failed to delete assessments')
    } finally {
      setDeleting(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'THRIVING': return 'text-green-600 bg-green-50'
      case 'STRONG': return 'text-green-500 bg-green-50'
      case 'STABLE': return 'text-yellow-600 bg-yellow-50'
      case 'BUILDING': return 'text-brand-orange-600 bg-brand-orange-50'
      case 'STRUGGLING': return 'text-red-500 bg-red-50'
      case 'URGENT': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading assessments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Manage Assessments</h1>
            <button
              onClick={() => router.push('/assessment')}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-brand-orange to-brand-orange-700 text-white rounded-lg hover:from-brand-orange-700 hover:to-brand-orange-800 transition-all duration-200 shadow-lg"
            >
              <Plus className="h-5 w-5 mr-2" />
              New Assessment
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Bar */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Assessment History</h2>
              <p className="text-gray-600 mt-1">
                You have {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} on record
              </p>
            </div>
            {assessments.length > 0 && (
              <button
                onClick={deleteAllAssessments}
                disabled={deleting === 'all'}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting === 'all' ? 'Deleting...' : 'Delete All'}
              </button>
            )}
          </div>
        </div>

        {assessments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Assessments Found</h2>
            <p className="text-gray-600 mb-6">Start fresh with a new assessment to evaluate your business.</p>
            <button
              onClick={() => router.push('/assessment')}
              className="px-6 py-3 bg-gradient-to-r from-brand-orange to-brand-orange-700 text-white rounded-lg hover:from-brand-orange-700 hover:to-brand-orange-800 transition-all duration-200 shadow-lg"
            >
              Start New Assessment
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-3">
                      <div className="flex items-center text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span className="text-sm">{formatDate(assessment.created_at)}</span>
                      </div>
                      {assessment.completion_percentage === 100 ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          <span className="text-sm font-medium">Complete</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-brand-orange-600">
                          <XCircle className="h-4 w-4 mr-1" />
                          <span className="text-sm font-medium">{assessment.completion_percentage}% Complete</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(assessment.health_status)}`}>
                        {assessment.health_status || 'Not Calculated'}
                      </span>
                      <span className="text-sm text-gray-600">
                        Score: <span className="font-semibold text-gray-900">{assessment.total_score || 0} points</span>
                      </span>
                      <span className="text-sm text-gray-600">
                        Stage: <span className="font-semibold text-gray-900">{assessment.revenue_stage || 'Unknown'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {assessment.completion_percentage === 100 && (
                      <button
                        onClick={() => router.push('/assessment/results')}
                        className="px-3 py-1.5 text-brand-orange border border-brand-orange-300 rounded-lg hover:bg-brand-orange-50 transition-colors text-sm"
                      >
                        View Report
                      </button>
                    )}
                    
                    {showConfirmDelete === assessment.id ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-red-600 font-medium">Delete?</span>
                        <button
                          onClick={() => deleteAssessment(assessment.id)}
                          disabled={deleting === assessment.id}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          {deleting === assessment.id ? 'Deleting...' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setShowConfirmDelete(null)}
                          className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-sm"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowConfirmDelete(assessment.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-brand-orange mt-0.5" />
            <div>
              <h3 className="font-semibold text-brand-navy mb-1">About Assessments</h3>
              <ul className="text-sm text-brand-orange-800 space-y-1">
                <li>• We recommend completing assessments quarterly to track progress</li>
                <li>• Each assessment provides a snapshot of your business at that point in time</li>
                <li>• Deleting assessments is permanent and cannot be undone</li>
                <li>• Your selected Success Disciplines and Strategic Wheel data are stored separately</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}