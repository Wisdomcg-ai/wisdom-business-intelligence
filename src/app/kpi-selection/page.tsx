'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import EnhancedKPIModal from '@/components/EnhancedKPIModal'
import PageHeader from '@/components/ui/PageHeader'
import { Target, TrendingUp, DollarSign, Users, Package, Heart, Settings, Check, AlertCircle, ChevronRight, Edit, Trash2, Plus, BarChart2 } from 'lucide-react'

// This is your complete KPI Selection page
export default function KPISelectionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedKPIs, setSelectedKPIs] = useState<any[]>([])
  const [businessProfile, setBusinessProfile] = useState({
    id: '', // Will be set from localStorage or database
    business_name: 'Your Business',
    industry: 'building_construction', // Default - will be updated
    revenueStage: 'TRACTION',
    currentRevenue: 500000
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // Load business profile and KPIs on component mount
  useEffect(() => {
    const initializeData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        loadBusinessProfile(user.id)
        loadExistingKPIs(user.id)
      } else {
        // Fallback to localStorage for non-authenticated users
        loadBusinessProfile()
        loadExistingKPIs()
      }
    }
    initializeData()
  }, [])

  // Function to load business profile from database or localStorage
  const loadBusinessProfile = async (authenticatedUserId?: string) => {
    try {
      // Try to load from database if user is authenticated
      if (authenticatedUserId) {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', authenticatedUserId)
          .single()

        if (data && !error) {
          setBusinessProfile({
            id: data.id,
            business_name: data.business_name || 'Your Business',
            industry: data.industry || 'building_construction',
            revenueStage: getRevenueStage(data.annual_revenue),
            currentRevenue: data.annual_revenue || 500000
          })
          return
        }
      }

      // Fallback to localStorage
      const storedProfile = localStorage.getItem('businessProfile')
      if (storedProfile) {
        const profile = JSON.parse(storedProfile)
        setBusinessProfile({
          id: profile.id || 'temp-id-123',
          business_name: profile.business_name || 'Your Business',
          industry: profile.industry || 'building_construction',
          revenueStage: getRevenueStage(profile.annual_revenue),
          currentRevenue: profile.annual_revenue || 500000
        })
      }
    } catch (error) {
      console.error('Error loading business profile:', error)
    }
  }

  // Function to load existing KPIs from database or localStorage
  const loadExistingKPIs = async (authenticatedUserId?: string) => {
    try {
      // Try to load from database if user is authenticated
      if (authenticatedUserId) {
        const { data, error } = await supabase
          .from('user_kpis')
          .select('*')
          .eq('user_id', authenticatedUserId)

        if (data && data.length > 0 && !error) {
          // Transform database format to component format
          const kpis = data.map(kpi => ({
            id: kpi.kpi_id || kpi.id,
            name: kpi.name,
            friendlyName: kpi.friendly_name,
            description: kpi.description,
            category: kpi.category,
            frequency: kpi.frequency,
            unit: kpi.unit,
            targetBenchmark: kpi.target_benchmark,
            whyItMatters: kpi.why_it_matters,
            whatToDo: kpi.what_to_do,
            isUniversal: kpi.is_universal
          }))
          setSelectedKPIs(kpis)
          return
        }
      }

      // Fallback to localStorage
      const storedKPIs = localStorage.getItem('selectedKPIs')
      if (storedKPIs) {
        setSelectedKPIs(JSON.parse(storedKPIs))
      }
    } catch (error) {
      console.error('Error loading KPIs:', error)
    }
  }

  // Helper function to determine revenue stage
  const getRevenueStage = (revenue: number): string => {
    if (revenue < 250000) return 'FOUNDATION'
    if (revenue < 1000000) return 'TRACTION'
    if (revenue < 2500000) return 'GROWTH'
    return 'SCALE'
  }

  // Handle saving KPIs - Complete implementation with database persistence
  const handleSaveKPIs = async (kpis: any[]) => {
    setIsSaving(true)
    setSaveMessage('')

    try {
      // Always save to localStorage as backup
      localStorage.setItem('selectedKPIs', JSON.stringify(kpis))
      setSelectedKPIs(kpis)

      // Save to database if user is authenticated
      if (userId) {
        // First, delete existing KPIs for this user
        const { error: deleteError } = await supabase
          .from('user_kpis')
          .delete()
          .eq('user_id', userId)

        if (deleteError) {
          console.error('Error deleting existing KPIs:', deleteError)
          // Continue anyway - we'll try to insert
        }

        // Insert all new KPIs
        if (kpis.length > 0) {
          const kpiRecords = kpis.map(kpi => ({
            user_id: userId,
            kpi_id: kpi.id,
            name: kpi.name,
            friendly_name: kpi.friendlyName,
            description: kpi.description,
            category: kpi.category,
            frequency: kpi.frequency,
            unit: kpi.unit,
            target_benchmark: kpi.targetBenchmark || null,
            why_it_matters: kpi.whyItMatters,
            what_to_do: kpi.whatToDo,
            is_universal: kpi.isUniversal
          }))

          const { error: insertError } = await supabase
            .from('user_kpis')
            .insert(kpiRecords)

          if (insertError) {
            console.error('Error inserting KPIs:', insertError)
            throw new Error('Failed to save to database')
          }
        }

        setSaveMessage(`Successfully saved ${kpis.length} KPIs!`)
      } else {
        setSaveMessage(`Saved ${kpis.length} KPIs locally. Sign in to sync across devices.`)
      }

      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('Error saving KPIs:', error)
      setSaveMessage('Saved locally. Database save failed.')
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // Remove a KPI from the list
  const removeKPI = (kpiId: string) => {
    const updatedKPIs = selectedKPIs.filter(kpi => kpi.id !== kpiId)
    handleSaveKPIs(updatedKPIs)
  }

  // Update business profile (for testing different industries)
  const updateIndustry = (newIndustry: string) => {
    const updatedProfile = { ...businessProfile, industry: newIndustry }
    setBusinessProfile(updatedProfile)
    localStorage.setItem('businessProfile', JSON.stringify(updatedProfile))
  }

  // Category icons mapping
  const getCategoryIcon = (category: string) => {
    switch(category) {
      case 'ATTRACT': return <Target className="w-4 h-4" />
      case 'CONVERT': return <TrendingUp className="w-4 h-4" />
      case 'DELIVER': return <Package className="w-4 h-4" />
      case 'DELIGHT': return <Heart className="w-4 h-4" />
      case 'PEOPLE': return <Users className="w-4 h-4" />
      case 'PROFIT': return <DollarSign className="w-4 h-4" />
      case 'SYSTEMS': return <Settings className="w-4 h-4" />
      default: return null
    }
  }

  // Category colors mapping - using brand colors for consistency
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'ATTRACT': return 'bg-brand-navy/10 text-brand-navy border-brand-navy/20'
      case 'CONVERT': return 'bg-brand-orange-100 text-brand-orange-800 border-brand-orange-200'
      case 'DELIVER': return 'bg-green-100 text-green-800 border-green-200'
      case 'DELIGHT': return 'bg-brand-orange-50 text-brand-orange-700 border-brand-orange-100'
      case 'PEOPLE': return 'bg-brand-orange/10 text-brand-orange-700 border-brand-orange/20'
      case 'PROFIT': return 'bg-brand-orange-100 text-brand-orange-800 border-brand-orange-200'
      case 'SYSTEMS': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="KPI Dashboard"
        subtitle={`Track what matters for ${businessProfile.business_name}`}
        icon={BarChart2}
        backLink={{ href: '/dashboard', label: 'Back to Dashboard' }}
      />

      {/* Business Context Bar */}
      <div className="bg-brand-orange-50 border-b border-brand-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm">
              <span className="text-gray-600">
                Industry: <span className="font-semibold text-gray-900">
                  {businessProfile.industry.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </span>
              <span className="text-gray-600">
                Stage: <span className="font-semibold text-gray-900">{businessProfile.revenueStage}</span>
              </span>
              <span className="text-gray-600">
                Revenue: <span className="font-semibold text-gray-900">
                  ${(businessProfile.currentRevenue / 1000000).toFixed(1)}M
                </span>
              </span>
            </div>
            
            {/* Industry Selector for Testing */}
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Test Industry:</label>
              <select
                value={businessProfile.industry}
                onChange={(e) => updateIndustry(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="building_construction">Building & Construction</option>
                <option value="trades">Trades</option>
                <option value="allied_health">Allied Health</option>
                <option value="fitness">Fitness</option>
                <option value="professional_services">Professional Services</option>
                <option value="retail">Retail</option>
                <option value="ecommerce">E-commerce</option>
                <option value="logistics">Logistics</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Bar */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-brand-navy">Your KPIs</h2>
            <p className="text-sm text-gray-600 mt-1">
              {selectedKPIs.length > 0 
                ? `Tracking ${selectedKPIs.length} key metrics`
                : 'No KPIs selected yet - click below to get started'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            {selectedKPIs.length > 0 ? 'Manage KPIs' : 'Select KPIs'}
          </button>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`mb-6 p-4 rounded-lg flex items-center ${
            saveMessage.includes('Successfully') 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {saveMessage.includes('Successfully') ? (
              <Check className="w-5 h-5 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2" />
            )}
            {saveMessage}
          </div>
        )}

        {/* KPI Grid */}
        {selectedKPIs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedKPIs.map((kpi) => (
              <div key={kpi.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-brand-navy">{kpi.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{kpi.friendlyName}</p>
                  </div>
                  <button
                    onClick={() => removeKPI(kpi.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <p className="text-xs text-gray-700 mb-3">{kpi.description}</p>
                
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
                    getCategoryColor(kpi.category)
                  }`}>
                    {getCategoryIcon(kpi.category)}
                    <span className="ml-1">{kpi.category}</span>
                  </span>
                  
                  <span className="text-xs text-gray-500">
                    {kpi.frequency}
                  </span>
                </div>

                {kpi.targetBenchmark && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Target:</span>
                      <span className="font-semibold text-gray-900">
                        {kpi.unit === 'percentage' ? `${kpi.targetBenchmark}%` : 
                         kpi.unit === 'currency' ? `$${kpi.targetBenchmark}` :
                         kpi.unit === 'days' ? `${kpi.targetBenchmark} days` :
                         kpi.targetBenchmark}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Empty State
          <div className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 p-12 text-center">
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-brand-navy mb-2">No KPIs Selected</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Start tracking your business performance by selecting the key metrics that matter most to your success.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Select Your First KPIs
            </button>
          </div>
        )}

        {/* Quick Stats */}
        {selectedKPIs.length > 0 && (
          <div className="mt-8 bg-gray-100 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-brand-navy mb-4">KPI Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Total KPIs</p>
                <p className="text-2xl font-bold text-gray-900">{selectedKPIs.length}</p>
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Daily Tracking</p>
                <p className="text-2xl font-bold text-gray-900">
                  {selectedKPIs.filter(k => k.frequency === 'daily').length}
                </p>
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Weekly Tracking</p>
                <p className="text-2xl font-bold text-gray-900">
                  {selectedKPIs.filter(k => k.frequency === 'weekly').length}
                </p>
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Monthly Tracking</p>
                <p className="text-2xl font-bold text-gray-900">
                  {selectedKPIs.filter(k => k.frequency === 'monthly').length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Selection Modal */}
      <EnhancedKPIModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveKPIs}
        businessProfile={businessProfile}
      />

      {/* Loading Overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange mr-4"></div>
            <span>Saving KPIs...</span>
          </div>
        </div>
      )}
    </div>
  )
}