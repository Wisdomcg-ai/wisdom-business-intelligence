'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { Calculator, Plus, Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProfitCalculator from '@/components/ProfitCalculator'
import { useBusinessContext } from '@/hooks/useBusinessContext'

interface VisionTarget {
  id?: string
  business_id: string
  
  // 3-Year Goals
  three_year_revenue?: number
  three_year_gross_margin_percent?: number
  three_year_net_margin_percent?: number
  three_year_team_size?: number
  three_year_strategic_position?: string
  three_year_capabilities?: string
  
  // 1-Year Goals
  one_year_revenue?: number
  one_year_gross_profit?: number
  one_year_gross_margin_percent?: number
  one_year_net_profit?: number
  one_year_net_margin_percent?: number
  
  // KPIs
  kpis?: KPI[]
  kpi_categories?: string[]
  
  created_at?: string
  updated_at?: string
}

interface KPI {
  id: string
  category: string
  name: string
  current_value: string
  target_value: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
}

const DEFAULT_KPI_CATEGORIES = [
  'Financial',
  'Marketing', 
  'Sales',
  'Operations',
  'People & Team',
  'Customer'
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' }
]

// People & Team specific KPI suggestions
const PEOPLE_METRICS = [
  'Total Headcount',
  'Revenue per Employee',
  'Employee Retention Rate',
  'Training Hours per Employee',
  'Team Satisfaction Score',
  'Billable Hours per Person',
  'Labour Cost as % of Revenue',
  'Overtime Hours',
  'Sick Days Taken',
  'Performance Review Scores'
]

export default function VisionTargetsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [businessId, setBusinessId] = useState<string>('')
  const [showCalculator, setShowCalculator] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Financial'])
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  
  // Form state
  const [formData, setFormData] = useState<VisionTarget>({
    business_id: '',
    three_year_revenue: 0,
    three_year_gross_margin_percent: 0,
    three_year_net_margin_percent: 0,
    three_year_team_size: 0,
    three_year_strategic_position: '',
    three_year_capabilities: '',
    one_year_revenue: 0,
    one_year_gross_profit: 0,
    one_year_gross_margin_percent: 0,
    one_year_net_profit: 0,
    one_year_net_margin_percent: 0,
    kpis: [],
    kpi_categories: DEFAULT_KPI_CATEGORIES
  })

  useEffect(() => {
    if (!contextLoading) {
      checkAuth()
    }
  }, [contextLoading, activeBusiness?.id])

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Determine the correct business_profiles.id for data queries
      // Vision targets are stored with business_profiles.id
      let bizId: string | null = null
      if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to look up the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single()

        bizId = profile?.id || null
      } else {
        // Get user's own business profile
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single()

        bizId = profile?.id || null
      }

      if (bizId) {
        setBusinessId(bizId)
        await fetchVisionTargets(bizId)
      } else {
        router.push('/assessment')
      }
    } catch (error) {
      console.error('Error checking auth:', error)
      router.push('/auth/login')
    }
  }

  const fetchVisionTargets = async (bizId: string) => {
    try {
      const { data, error } = await supabase
        .from('vision_targets')
        .select('*')
        .eq('business_id', bizId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setFormData({
          ...data,
          kpis: data.kpis || [],
          kpi_categories: data.kpi_categories || DEFAULT_KPI_CATEGORIES
        })
      } else {
        setFormData(prev => ({
          ...prev,
          business_id: bizId,
          kpis: [],
          kpi_categories: DEFAULT_KPI_CATEGORIES
        }))
      }
    } catch (error) {
      console.error('Error fetching vision targets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof VisionTarget, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // Auto-calculate related fields
    if (field === 'one_year_revenue' || field === 'one_year_gross_margin_percent') {
      const revenue = field === 'one_year_revenue' ? value : formData.one_year_revenue
      const margin = field === 'one_year_gross_margin_percent' ? value : formData.one_year_gross_margin_percent
      const grossProfit = (revenue || 0) * ((margin || 0) / 100)
      setFormData(prev => ({
        ...prev,
        one_year_gross_profit: Math.round(grossProfit)
      }))
    }

    if (field === 'one_year_revenue' || field === 'one_year_net_margin_percent') {
      const revenue = field === 'one_year_revenue' ? value : formData.one_year_revenue
      const margin = field === 'one_year_net_margin_percent' ? value : formData.one_year_net_margin_percent
      const netProfit = (revenue || 0) * ((margin || 0) / 100)
      setFormData(prev => ({
        ...prev,
        one_year_net_profit: Math.round(netProfit)
      }))
    }
  }

  const handleCalculatorSave = (calculatorData: any) => {
    // Update financial goals
    setFormData(prev => ({
      ...prev,
      one_year_revenue: calculatorData.targetYearlyRevenue,
      one_year_gross_profit: calculatorData.yearlyGrossProfit,
      one_year_gross_margin_percent: calculatorData.grossMargin,
      one_year_net_profit: calculatorData.targetYearlyProfit,
      one_year_net_margin_percent: calculatorData.profitMargin
    }))
    
    // Add suggested KPIs from calculator
    if (calculatorData.suggestedKPIs && calculatorData.suggestedKPIs.length > 0) {
      const newKPIs = calculatorData.suggestedKPIs.map((kpi: any) => ({
        ...kpi,
        id: `kpi-${Date.now()}-${Math.random()}`
      }))
      
      setFormData(prev => ({
        ...prev,
        kpis: [...(prev.kpis || []), ...newKPIs]
      }))
      
      // Expand categories that have new KPIs
      const categoriesToExpand = [...new Set(newKPIs.map((kpi: any) =>
        kpi.category.charAt(0).toUpperCase() + kpi.category.slice(1)
      ))] as string[]
      setExpandedCategories(prev => [...new Set([...prev, ...categoriesToExpand])] as string[])
    }
    
    setShowCalculator(false)
  }

  const addKPI = (category: string) => {
    const newKPI: KPI = {
      id: `kpi-${Date.now()}`,
      category: category.toLowerCase(),
      name: '',
      current_value: '',
      target_value: '',
      frequency: 'monthly'
    }
    
    setFormData(prev => ({
      ...prev,
      kpis: [...(prev.kpis || []), newKPI]
    }))
  }

  const updateKPI = (id: string, field: keyof KPI, value: any) => {
    setFormData(prev => ({
      ...prev,
      kpis: (prev.kpis || []).map(kpi => 
        kpi.id === id ? { ...kpi, [field]: value } : kpi
      )
    }))
  }

  const deleteKPI = (id: string) => {
    setFormData(prev => ({
      ...prev,
      kpis: (prev.kpis || []).filter(kpi => kpi.id !== id)
    }))
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const addCategory = () => {
    const newCategory = prompt('Enter new category name:')
    if (newCategory && !formData.kpi_categories?.includes(newCategory)) {
      setFormData(prev => ({
        ...prev,
        kpi_categories: [...(prev.kpi_categories || []), newCategory]
      }))
    }
  }

  const renameCategory = (oldName: string) => {
    setEditingCategory(oldName)
    setNewCategoryName(oldName)
  }

  const saveCategory = (oldName: string) => {
    if (newCategoryName && newCategoryName !== oldName) {
      setFormData(prev => ({
        ...prev,
        kpi_categories: (prev.kpi_categories || []).map(cat => 
          cat === oldName ? newCategoryName : cat
        ),
        kpis: (prev.kpis || []).map(kpi => 
          kpi.category === oldName.toLowerCase() 
            ? { ...kpi, category: newCategoryName.toLowerCase() }
            : kpi
        )
      }))
    }
    setEditingCategory(null)
    setNewCategoryName('')
  }

  const deleteCategory = (category: string) => {
    if (confirm(`Delete category "${category}" and all its KPIs?`)) {
      setFormData(prev => ({
        ...prev,
        kpi_categories: (prev.kpi_categories || []).filter(cat => cat !== category),
        kpis: (prev.kpis || []).filter(kpi => kpi.category !== category.toLowerCase())
      }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        business_id: businessId,
        updated_at: new Date().toISOString()
      }

      if (formData.id) {
        const { error } = await supabase
          .from('vision_targets')
          .update(dataToSave)
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('vision_targets')
          .insert([dataToSave])
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      alert('Vision & Targets saved successfully!')
    } catch (error) {
      console.error('Error saving vision targets:', error)
      alert('Error saving vision targets. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation />
        <div className="flex justify-center items-center h-[calc(100vh-64px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Vision & Targets</h1>
          <p className="mt-2 text-gray-600">Define your long-term vision and measurable goals</p>
        </div>

        {/* 3-Year Goals */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">3-Year Goals</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Revenue Target
              </label>
              <div className="flex items-center">
                <span className="mr-2">$</span>
                <input
                  type="number"
                  value={formData.three_year_revenue || ''}
                  onChange={(e) => handleInputChange('three_year_revenue', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="5000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Size
              </label>
              <input
                type="number"
                value={formData.three_year_team_size || ''}
                onChange={(e) => handleInputChange('three_year_team_size', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gross Margin %
              </label>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.three_year_gross_margin_percent || ''}
                  onChange={(e) => handleInputChange('three_year_gross_margin_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="45"
                />
                <span className="ml-2">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Net Margin %
              </label>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.three_year_net_margin_percent || ''}
                  onChange={(e) => handleInputChange('three_year_net_margin_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="20"
                />
                <span className="ml-2">%</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategic Position
              </label>
              <textarea
                value={formData.three_year_strategic_position || ''}
                onChange={(e) => handleInputChange('three_year_strategic_position', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={2}
                placeholder="Market leader in our region, known for innovation and customer service..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Key Capabilities to Develop
              </label>
              <textarea
                value={formData.three_year_capabilities || ''}
                onChange={(e) => handleInputChange('three_year_capabilities', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={2}
                placeholder="Advanced data analytics, AI integration, international expansion capabilities..."
              />
            </div>
          </div>
        </div>

        {/* 1-Year Goals */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">1-Year Goals</h2>
            <button
              onClick={() => setShowCalculator(true)}
              className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
            >
              <Calculator className="h-4 w-4 mr-2" />
              Show Profit Calculator
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Revenue Target
              </label>
              <div className="flex items-center">
                <span className="mr-2">$</span>
                <input
                  type="number"
                  value={formData.one_year_revenue || ''}
                  onChange={(e) => handleInputChange('one_year_revenue', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="1500000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gross Profit $
              </label>
              <div className="flex items-center">
                <span className="mr-2">$</span>
                <input
                  type="number"
                  value={formData.one_year_gross_profit || ''}
                  onChange={(e) => handleInputChange('one_year_gross_profit', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="600000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gross Margin %
              </label>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.one_year_gross_margin_percent || ''}
                  onChange={(e) => handleInputChange('one_year_gross_margin_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="40"
                />
                <span className="ml-2">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Net Profit $
              </label>
              <div className="flex items-center">
                <span className="mr-2">$</span>
                <input
                  type="number"
                  value={formData.one_year_net_profit || ''}
                  onChange={(e) => handleInputChange('one_year_net_profit', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="225000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Net Margin %
              </label>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.one_year_net_margin_percent || ''}
                  onChange={(e) => handleInputChange('one_year_net_margin_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="15"
                />
                <span className="ml-2">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Key Performance Indicators (KPIs)</h2>
            <button
              onClick={addCategory}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Category
            </button>
          </div>
          
          {(formData.kpi_categories || DEFAULT_KPI_CATEGORIES).map(category => {
            const categoryKPIs = (formData.kpis || []).filter(kpi => 
              kpi.category === category.toLowerCase()
            )
            const isExpanded = expandedCategories.includes(category)
            
            return (
              <div key={category} className="mb-4 border rounded-lg">
                <div 
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleCategory(category)}
                >
                  {editingCategory === category ? (
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onBlur={() => saveCategory(category)}
                      onKeyPress={(e) => e.key === 'Enter' && saveCategory(category)}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 border rounded"
                      autoFocus
                    />
                  ) : (
                    <h3 className="font-medium text-gray-900">
                      {category} ({categoryKPIs.length})
                    </h3>
                  )}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        renameCategory(category)
                      }}
                      className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteCategory(category)
                      }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        addKPI(category)
                        if (!isExpanded) toggleCategory(category)
                      }}
                      className="p-1 text-teal-600 hover:bg-teal-50 rounded"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {category === 'People & Team' && categoryKPIs.length === 0 && (
                      <div className="mb-3 p-3 bg-teal-50 rounded text-sm">
                        <p className="font-medium mb-2">Suggested People Metrics:</p>
                        <div className="flex flex-wrap gap-2">
                          {PEOPLE_METRICS.map(metric => (
                            <button
                              key={metric}
                              onClick={() => {
                                const newKPI: KPI = {
                                  id: `kpi-${Date.now()}`,
                                  category: 'people & team',
                                  name: metric,
                                  current_value: '',
                                  target_value: '',
                                  frequency: 'monthly'
                                }
                                setFormData(prev => ({
                                  ...prev,
                                  kpis: [...(prev.kpis || []), newKPI]
                                }))
                              }}
                              className="px-2 py-1 bg-white border border-teal-300 rounded text-xs hover:bg-teal-100"
                            >
                              + {metric}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {categoryKPIs.length === 0 && category !== 'People & Team' ? (
                      <p className="text-gray-500 text-sm">No KPIs yet. Click + to add one.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600 mb-2">
                          <div className="col-span-4">KPI Name</div>
                          <div className="col-span-2">Frequency</div>
                          <div className="col-span-2">Current</div>
                          <div className="col-span-3">Target</div>
                          <div className="col-span-1"></div>
                        </div>
                        {categoryKPIs.map(kpi => (
                          <div key={kpi.id} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              value={kpi.name}
                              onChange={(e) => updateKPI(kpi.id, 'name', e.target.value)}
                              className="col-span-4 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="KPI Name"
                            />
                            <select
                              value={kpi.frequency}
                              onChange={(e) => updateKPI(kpi.id, 'frequency', e.target.value)}
                              className="col-span-2 px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {FREQUENCIES.map(freq => (
                                <option key={freq.value} value={freq.value}>
                                  {freq.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={kpi.current_value}
                              onChange={(e) => updateKPI(kpi.id, 'current_value', e.target.value)}
                              className="col-span-2 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="Current"
                            />
                            <input
                              type="text"
                              value={kpi.target_value}
                              onChange={(e) => updateKPI(kpi.id, 'target_value', e.target.value)}
                              className="col-span-3 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="Target"
                            />
                            <button
                              onClick={() => deleteKPI(kpi.id)}
                              className="col-span-1 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <button
            onClick={() => router.push('/goals/forecast')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Next: Quarterly Forecast →
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Vision & Targets'}
          </button>
        </div>
      </div>

      {/* Profit Calculator Modal */}
      <ProfitCalculator
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onSave={handleCalculatorSave}
        businessId={businessId}
      />
    </div>
  )
}