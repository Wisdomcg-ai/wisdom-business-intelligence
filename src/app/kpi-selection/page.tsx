'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import EnhancedKPIModal from '@/components/EnhancedKPIModal'
import { Target, TrendingUp, DollarSign, Users, Package, Heart, Settings, Check, AlertCircle, ChevronRight, Edit, Trash2, Plus } from 'lucide-react'

// This is your complete KPI Selection page
export default function KPISelectionPage() {
  const router = useRouter()
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

  // Load business profile on component mount
  useEffect(() => {
    loadBusinessProfile()
    loadExistingKPIs()
  }, [])

  // Function to load business profile from localStorage or database
  const loadBusinessProfile = async () => {
    try {
      // First, try to get from localStorage (if you stored it there)
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

      // If you have a database connection, uncomment this:
      /*
      const response = await fetch('/api/business-profile')
      if (response.ok) {
        const data = await response.json()
        setBusinessProfile({
          id: data.id,
          business_name: data.business_name,
          industry: data.industry,
          revenueStage: getRevenueStage(data.annual_revenue),
          currentRevenue: data.annual_revenue
        })
      }
      */
    } catch (error) {
      console.error('Error loading business profile:', error)
    }
  }

  // Function to load existing KPIs from localStorage or database
  const loadExistingKPIs = async () => {
    try {
      // Load from localStorage first
      const storedKPIs = localStorage.getItem('selectedKPIs')
      if (storedKPIs) {
        setSelectedKPIs(JSON.parse(storedKPIs))
      }

      // If you have a database connection, uncomment this:
      /*
      const response = await fetch('/api/kpis')
      if (response.ok) {
        const data = await response.json()
        setSelectedKPIs(data.kpis || [])
      }
      */
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

  // Handle saving KPIs - Complete implementation
  const handleSaveKPIs = async (kpis: any[]) => {
    setIsSaving(true)
    setSaveMessage('')

    try {
      // Save to localStorage immediately
      localStorage.setItem('selectedKPIs', JSON.stringify(kpis))
      setSelectedKPIs(kpis)
      
      // Save to database if you have an API endpoint
      // Uncomment this section when your API is ready:
      /*
      const response = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: businessProfile.id,
          kpis: kpis.map(kpi => ({
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
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save to database')
      }
      */

      setSaveMessage(`Successfully saved ${kpis.length} KPIs!`)
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

  // Category colors mapping
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'ATTRACT': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'CONVERT': return 'bg-teal-100 text-teal-800 border-teal-200'
      case 'DELIVER': return 'bg-green-100 text-green-800 border-green-200'
      case 'DELIGHT': return 'bg-pink-100 text-pink-800 border-pink-200'
      case 'PEOPLE': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'PROFIT': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'SYSTEMS': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">KPI Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Track what matters for {businessProfile.business_name}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Business Context Bar */}
      <div className="bg-teal-50 border-b border-teal-100">
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
            <h2 className="text-xl font-semibold text-gray-900">Your KPIs</h2>
            <p className="text-sm text-gray-600 mt-1">
              {selectedKPIs.length > 0 
                ? `Tracking ${selectedKPIs.length} key metrics`
                : 'No KPIs selected yet - click below to get started'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
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
                    <h3 className="font-semibold text-gray-900">{kpi.name}</h3>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No KPIs Selected</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Start tracking your business performance by selecting the key metrics that matter most to your success.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Select Your First KPIs
            </button>
          </div>
        )}

        {/* Quick Stats */}
        {selectedKPIs.length > 0 && (
          <div className="mt-8 bg-gray-100 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">KPI Overview</h3>
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-4"></div>
            <span>Saving KPIs...</span>
          </div>
        </div>
      )}
    </div>
  )
}