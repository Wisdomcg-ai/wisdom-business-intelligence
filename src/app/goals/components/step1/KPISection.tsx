'use client'

import { ChevronDown, ChevronUp, Activity, Plus, Trash2, X, Search, AlertCircle, Sparkles, HelpCircle, ChevronRight } from 'lucide-react'
import { KPIData, YearType } from '../../types'
import { getYearLabel } from './types'
import { useKPIs } from '../../hooks/useKPIs'
import { useState, useMemo, useEffect } from 'react'
import CreateCustomKPIModal from '../CreateCustomKPIModal'
import { CustomKPIService, CustomKPI } from '../../services/custom-kpi-service'
import { createClient } from '@/lib/supabase/client'

interface KPISectionProps {
  kpis: KPIData[]
  updateKPIValue: (kpiId: string, field: 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target', value: number) => void
  addKPI?: (kpi: KPIData) => void
  deleteKPI: (kpiId: string) => void
  yearType: YearType
  isCollapsed: boolean
  onToggle: () => void
  showKPIModal: boolean
  setShowKPIModal: (show: boolean) => void
  businessId?: string
}

export default function KPISection({
  kpis,
  updateKPIValue,
  addKPI,
  deleteKPI,
  yearType,
  isCollapsed,
  onToggle,
  showKPIModal,
  setShowKPIModal,
  businessId
}: KPISectionProps) {
  const currentYear = new Date().getFullYear()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Custom KPI state
  const [showCustomKPIModal, setShowCustomKPIModal] = useState(false)
  const [customKPIs, setCustomKPIs] = useState<CustomKPI[]>([])
  const [userId, setUserId] = useState<string>('')
  const [customCategories, setCustomCategories] = useState<string[]>([])

  const {
    unselectedKPIs,
    categories,
    loading: kpisLoading,
    error: kpisError
  } = useKPIs({
    businessId,
    autoLoad: true,
    autoSync: true
  })

  useEffect(() => {
    const loadCustomKPIs = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        if (businessId) {
          const customKPIsList = await CustomKPIService.getAvailableCustomKPIs(user.id, businessId)
          setCustomKPIs(customKPIsList)
          const cats = [...new Set(customKPIsList.map(k => k.category))].sort()
          setCustomCategories(cats)
        }
      }
    }
    loadCustomKPIs()
  }, [businessId])

  const allAvailableKPIs = useMemo(() => {
    const customKPIsAsKPIData: KPIData[] = customKPIs.map(ck => ({
      id: ck.id || `custom-${ck.name}`,
      name: ck.name,
      friendlyName: ck.friendlyName || ck.name,
      category: ck.category,
      unit: ck.unit,
      frequency: ck.frequency,
      description: ck.description,
      isCustom: true,
      currentValue: 0,
      year1Target: 0,
      year2Target: 0,
      year3Target: 0
    }))

    const selectedKPIIds = new Set(kpis?.map(k => k.id) || [])
    const unselectedCustomKPIs = customKPIsAsKPIData.filter(ck => !selectedKPIIds.has(ck.id))
    return [...unselectedKPIs, ...unselectedCustomKPIs]
  }, [unselectedKPIs, customKPIs, kpis])

  const allCategories = useMemo(() => {
    const standardCats = categories || []
    return [...new Set([...standardCats, ...customCategories])].sort()
  }, [categories, customCategories])

  const filteredKPIs = useMemo(() => {
    let results = allAvailableKPIs
    if (selectedCategory) {
      results = results.filter(kpi => kpi.category === selectedCategory)
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      results = results.filter(kpi =>
        kpi.name.toLowerCase().includes(query) ||
        kpi.friendlyName?.toLowerCase().includes(query) ||
        (kpi.description && kpi.description.toLowerCase().includes(query))
      )
    }
    return results
  }, [allAvailableKPIs, searchQuery, selectedCategory])

  const groupedKPIs = useMemo(() => {
    const groups: Record<string, KPIData[]> = {}
    filteredKPIs.forEach(kpi => {
      const category = kpi.category || 'Other'
      if (!groups[category]) groups[category] = []
      groups[category].push(kpi)
    })
    return groups
  }, [filteredKPIs])

  const handleAddKPI = (kpi: KPIData) => {
    if (addKPI) {
      addKPI({ ...kpi, currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 })
    }
  }

  const handleCustomKPISuccess = async (customKPI: CustomKPI) => {
    if (userId && businessId) {
      const customKPIsList = await CustomKPIService.getAvailableCustomKPIs(userId, businessId)
      setCustomKPIs(customKPIsList)
      const cats = [...new Set(customKPIsList.map(k => k.category))].sort()
      setCustomCategories(cats)

      const kpiData: KPIData = {
        id: customKPI.id || `custom-${Date.now()}`,
        name: customKPI.name,
        friendlyName: customKPI.friendlyName || customKPI.name,
        category: customKPI.category,
        unit: customKPI.unit,
        frequency: customKPI.frequency,
        description: customKPI.description,
        isCustom: true,
        currentValue: 0,
        year1Target: 0,
        year2Target: 0,
        year3Target: 0
      }

      if (addKPI) addKPI(kpiData)
      if (customKPI.id) await CustomKPIService.trackUsage(customKPI.id)
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div
          onClick={onToggle}
          className="cursor-pointer p-5 flex items-center justify-between hover:bg-green-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Key Performance Indicators</h3>
              <p className="text-sm text-gray-600">Select from 200+ metrics across all business functions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(kpis || []).length > 0 && (
              <span className="text-xs font-bold text-white bg-green-600 px-2.5 py-1 rounded-full">
                {(kpis || []).length}
              </span>
            )}
            {isCollapsed ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div className="border-t border-gray-200 p-6 bg-gradient-to-b from-white to-gray-50">
            {(kpis || []).length === 0 ? (
              <EmptyKPIState onAddClick={() => {
                setSearchQuery('')
                setSelectedCategory(null)
                setShowKPIModal(true)
              }} />
            ) : (
              <KPITable
                kpis={kpis}
                yearType={yearType}
                currentYear={currentYear}
                updateKPIValue={updateKPIValue}
                deleteKPI={deleteKPI}
                onAddClick={() => {
                  setSearchQuery('')
                  setSelectedCategory(null)
                  setShowKPIModal(true)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* KPI Selection Modal */}
      {showKPIModal && (
        <KPISelectionModal
          isOpen={showKPIModal}
          onClose={() => setShowKPIModal(false)}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          allCategories={allCategories}
          allAvailableKPIs={allAvailableKPIs}
          filteredKPIs={filteredKPIs}
          groupedKPIs={groupedKPIs}
          kpisLoading={kpisLoading}
          kpisError={kpisError}
          onAddKPI={handleAddKPI}
          onCreateCustom={() => {
            setShowKPIModal(false)
            setShowCustomKPIModal(true)
          }}
        />
      )}

      {/* Custom KPI Modal */}
      {businessId && userId && (
        <CreateCustomKPIModal
          isOpen={showCustomKPIModal}
          onClose={() => setShowCustomKPIModal(false)}
          onSuccess={handleCustomKPISuccess}
          userId={userId}
          businessId={businessId}
          existingCategories={allCategories}
          allAvailableKPIs={allAvailableKPIs}
        />
      )}
    </>
  )
}

// Sub-components
function EmptyKPIState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Activity className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-700 font-medium mb-2">No KPIs selected yet</p>
      <p className="text-sm text-gray-600 mb-6">Add KPIs from our library of 200+ metrics to track your business health</p>
      <button
        onClick={onAddClick}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors inline-flex items-center gap-2 shadow-md"
      >
        <Plus className="w-4 h-4" />
        Add Your First KPI
      </button>
    </div>
  )
}

interface KPITableProps {
  kpis: KPIData[]
  yearType: YearType
  currentYear: number
  updateKPIValue: (kpiId: string, field: 'currentValue' | 'year1Target' | 'year2Target' | 'year3Target', value: number) => void
  deleteKPI: (kpiId: string) => void
  onAddClick: () => void
}

function KPITable({ kpis, yearType, currentYear, updateKPIValue, deleteKPI, onAddClick }: KPITableProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-green-50 to-green-100 border-b-2 border-green-200">
              <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-green-50 z-10 w-[250px]">
                KPI / Category
              </th>
              {[0, 1, 2, 3].map(idx => {
                const label = getYearLabel(idx, yearType, currentYear)
                return (
                  <th key={idx} className="text-center p-3 text-sm font-bold text-gray-700 w-[150px]">
                    <div>{label.main}</div>
                    {label.subtitle && (
                      <div className="text-xs font-normal text-gray-500 mt-1">{label.subtitle}</div>
                    )}
                  </th>
                )
              })}
              <th className="text-center p-3 text-sm font-bold text-gray-700 w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi, index) => (
              <tr
                key={kpi.id}
                className={`border-b border-gray-200 hover:bg-green-50 transition-colors ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
              >
                <td className="p-3 sticky left-0 z-10 bg-inherit">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm leading-tight">{kpi.name}</span>
                      {kpi.isCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-brand-orange text-white rounded font-bold">CUSTOM</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 leading-tight">{kpi.friendlyName}</span>
                    {kpi.category && (
                      <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded mt-1 w-fit">
                        {kpi.category}
                      </span>
                    )}
                  </div>
                </td>
                {(['currentValue', 'year1Target', 'year2Target', 'year3Target'] as const).map(field => (
                  <td key={field} className="p-2 text-center">
                    <input
                      type="number"
                      value={kpi[field] || 0}
                      onChange={(e) => updateKPIValue(kpi.id, field, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent hover:border-green-300 transition-colors"
                      placeholder="0"
                    />
                  </td>
                ))}
                <td className="p-2 text-center">
                  <button
                    onClick={() => deleteKPI(kpi.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded inline-flex items-center justify-center"
                    title="Delete KPI"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={onAddClick}
        className="w-full px-4 py-3 border-2 border-dashed border-green-300 text-green-700 rounded-lg hover:bg-green-50 hover:border-green-400 font-medium text-sm transition-colors flex items-center justify-center gap-2 mt-4"
      >
        <Plus className="w-4 h-4" />
        Add Another KPI
      </button>
    </div>
  )
}

interface KPISelectionModalProps {
  isOpen: boolean
  onClose: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedCategory: string | null
  setSelectedCategory: (category: string | null) => void
  allCategories: string[]
  allAvailableKPIs: KPIData[]
  filteredKPIs: KPIData[]
  groupedKPIs: Record<string, KPIData[]>
  kpisLoading: boolean
  kpisError: string | null
  onAddKPI: (kpi: KPIData) => void
  onCreateCustom: () => void
}

function KPISelectionModal({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  allCategories,
  allAvailableKPIs,
  filteredKPIs,
  groupedKPIs,
  kpisLoading,
  kpisError,
  onAddKPI,
  onCreateCustom
}: KPISelectionModalProps) {
  const [expandedKPI, setExpandedKPI] = useState<string | null>(null)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-50 to-green-100 border-b border-gray-200 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Select KPIs to Track</h3>
            <p className="text-sm text-gray-600 mt-1">Choose from 200+ KPIs across all business functions. Click the help icon for more details.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="border-b border-gray-200 p-4 bg-white space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search KPIs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              autoFocus
            />
          </div>

          {allCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  selectedCategory === null ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({allAvailableKPIs.length})
              </button>
              {allCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    selectedCategory === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat} ({allAvailableKPIs.filter(k => k.category === cat).length})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {kpisError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{kpisError}</p>
            </div>
          )}

          {kpisLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading KPI library...</p>
            </div>
          ) : filteredKPIs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 font-medium">
                {allAvailableKPIs.length === 0 ? 'All available KPIs already selected' : 'No KPIs match your search'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedKPIs).map(([category, categoryKPIs]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">{category} ({categoryKPIs.length})</h4>
                  <div className="space-y-3">
                    {categoryKPIs.map((kpi) => {
                      const isExpanded = expandedKPI === kpi.id
                      const hasDetails = kpi.whyItMatters || kpi.actionToTake

                      return (
                        <div
                          key={kpi.id}
                          className={`rounded-lg border transition-all ${
                            isExpanded ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          {/* Main KPI Card */}
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold text-gray-900">{kpi.name}</p>
                                  {kpi.isCustom && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-brand-orange text-white rounded font-bold">CUSTOM</span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600">{kpi.friendlyName}</p>
                                {kpi.description && (
                                  <p className="text-sm text-gray-700 mt-2">{kpi.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                    {kpi.category}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Track {kpi.frequency}
                                  </span>
                                  {kpi.benchmarks?.good && (
                                    <span className="text-xs text-gray-500">
                                      Target: {typeof kpi.benchmarks.good === 'number' && kpi.unit === 'percentage' ? `${kpi.benchmarks.good}%` : kpi.benchmarks.good}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {hasDetails && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setExpandedKPI(isExpanded ? null : kpi.id)
                                    }}
                                    className={`p-1.5 rounded transition-colors ${
                                      isExpanded ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
                                    title="Show details"
                                  >
                                    <HelpCircle className="w-5 h-5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    onAddKPI(kpi)
                                    onClose()
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Details Section */}
                          {isExpanded && hasDetails && (
                            <div className="border-t border-green-200 bg-green-50 p-4 space-y-3">
                              {kpi.whyItMatters && (
                                <div>
                                  <h5 className="font-semibold text-sm text-gray-900 mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 text-green-600" />
                                    Why This Matters
                                  </h5>
                                  <p className="text-sm text-gray-700 ml-5">{kpi.whyItMatters}</p>
                                </div>
                              )}
                              {kpi.actionToTake && (
                                <div>
                                  <h5 className="font-semibold text-sm text-gray-900 mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 text-green-600" />
                                    What To Do
                                  </h5>
                                  <p className="text-sm text-gray-700 ml-5">{kpi.actionToTake}</p>
                                </div>
                              )}
                              {kpi.benchmarks && (
                                <div>
                                  <h5 className="font-semibold text-sm text-gray-900 mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 text-green-600" />
                                    Benchmarks
                                  </h5>
                                  <div className="ml-5 flex gap-4 text-xs">
                                    <span className="text-red-600">Poor: {kpi.benchmarks.poor}</span>
                                    <span className="text-yellow-600">Average: {kpi.benchmarks.average}</span>
                                    <span className="text-green-600">Good: {kpi.benchmarks.good}</span>
                                    <span className="text-brand-teal">Excellent: {kpi.benchmarks.excellent}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-600">
              {allAvailableKPIs.length > 0 && `${allAvailableKPIs.length} available`}
            </p>
            <button
              onClick={onCreateCustom}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 font-medium text-xs transition-colors shadow-sm"
            >
              <Sparkles className="w-3 h-3" />
              Create Custom KPI
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
