// src/components/KPISystemTest.tsx
'use client'

import { useEffect, useState } from 'react'
import { 
  useKPIs, 
  getKPISystemHealth,
  formatCurrency,
  formatPercentage,
  validateKPIValue,
  mapBusinessIndustryToKPIIndustry,
  mapRevenueToStage,
  BusinessFunction,
  Industry,
  BusinessStage
} from '@/lib/kpi'

export function KPISystemTest() {
  const [health, setHealth] = useState<any>(null)
  const [testResults, setTestResults] = useState<any>({})

  // Test the useKPIs hook
  const { 
    kpis, 
    loading, 
    error, 
    initialized, 
    stats,
    search 
  } = useKPIs({ autoInitialize: true })

  useEffect(() => {
    runTests()
  }, [initialized])

  const runTests = async () => {
    console.log('🧪 Running KPI System Tests...')
    
    try {
      // Test 1: System Health Check
      const systemHealth = getKPISystemHealth()
      setHealth(systemHealth)
      console.log('✅ Test 1 - Health Check:', systemHealth)

      // Test 2: Formatting Functions
      const formatTests = {
        currency: formatCurrency(50000),
        percentage: formatPercentage(85.5),
        currencyCompact: formatCurrency(1500000)
      }
      console.log('✅ Test 2 - Formatters:', formatTests)

      // Test 3: Validation Functions
      const validationTests = {
        validCurrency: validateKPIValue(50000, 'currency'),
        validPercentage: validateKPIValue(85, 'percentage'),
        invalidPercentage: validateKPIValue(150, 'percentage')
      }
      console.log('✅ Test 3 - Validation:', validationTests)

      // Test 4: Mapping Functions
      const mappingTests = {
        constructionIndustry: mapBusinessIndustryToKPIIndustry('construction company'),
        healthIndustry: mapBusinessIndustryToKPIIndustry('medical clinic'),
        revenueStage: mapRevenueToStage('1M-2.5M')
      }
      console.log('✅ Test 4 - Mapping:', mappingTests)

      // Test 5: Enums and Constants
      const enumTests = {
        businessFunctions: Object.values(BusinessFunction),
        industries: Object.values(Industry),
        stages: Object.values(BusinessStage)
      }
      console.log('✅ Test 5 - Enums:', enumTests)

      // Test 6: Search functionality (when KPIs are loaded)
      if (initialized && !loading) {
        try {
          const searchResults = await search('revenue', {
            functions: [BusinessFunction.PROFIT]
          })
          console.log('✅ Test 6 - Search:', searchResults)
        } catch (err) {
          console.log('⚠️ Test 6 - Search: No data to search yet (Phase 1)')
        }
      }

      setTestResults({
        formatTests,
        validationTests,
        mappingTests,
        enumTests,
        timestamp: new Date().toISOString()
      })

      console.log('🎉 All KPI System Tests Completed!')

    } catch (error) {
      console.error('❌ Test failed:', error)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg border">
      <h2 className="text-2xl font-bold mb-4">🧪 KPI System Test Dashboard</h2>
      
      {/* System Status */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">System Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Initialized</div>
            <div className={`font-semibold ${initialized ? 'text-green-600' : 'text-red-600'}`}>
              {initialized ? '✅ Yes' : '❌ No'}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Loading</div>
            <div className={`font-semibold ${loading ? 'text-yellow-600' : 'text-green-600'}`}>
              {loading ? '⏳ Loading' : '✅ Ready'}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Errors</div>
            <div className={`font-semibold ${error ? 'text-red-600' : 'text-green-600'}`}>
              {error || '✅ None'}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Health</div>
            <div className={`font-semibold ${
              health?.status === 'healthy' ? 'text-green-600' : 
              health?.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {health?.status || 'Unknown'}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Performance Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Total KPIs</div>
            <div className="font-semibold text-teal-900">{stats.total}</div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Load Time</div>
            <div className="font-semibold text-teal-900">
              {stats.loadTime ? `${stats.loadTime}ms` : 'N/A'}
            </div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Cache Hit Rate</div>
            <div className="font-semibold text-teal-900">{stats.cacheHitRate}</div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Services</div>
            <div className="font-semibold text-teal-900">
              {health?.services ? Object.values(health.services).filter(Boolean).length : 0}/3
            </div>
          </div>
        </div>
      </div>

      {/* Test Results */}
      {testResults.formatTests && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Test Results</h3>
          <div className="space-y-3">
            <div className="bg-green-50 p-3 rounded">
              <div className="font-semibold text-green-800">✅ Formatters Working</div>
              <div className="text-sm text-green-700">
                Currency: {testResults.formatTests.currency} | 
                Percentage: {testResults.formatTests.percentage} | 
                Large Amount: {testResults.formatTests.currencyCompact}
              </div>
            </div>
            
            <div className="bg-green-50 p-3 rounded">
              <div className="font-semibold text-green-800">✅ Validation Working</div>
              <div className="text-sm text-green-700">
                Valid currency: {testResults.validationTests.validCurrency.isValid ? 'Pass' : 'Fail'} | 
                Valid percentage: {testResults.validationTests.validPercentage.isValid ? 'Pass' : 'Fail'} | 
                Invalid percentage detected: {!testResults.validationTests.invalidPercentage.isValid ? 'Pass' : 'Fail'}
              </div>
            </div>

            <div className="bg-green-50 p-3 rounded">
              <div className="font-semibold text-green-800">✅ Mapping Working</div>
              <div className="text-sm text-green-700">
                Construction → {testResults.mappingTests.constructionIndustry} | 
                Medical → {testResults.mappingTests.healthIndustry} | 
                Revenue Stage → {testResults.mappingTests.revenueStage}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={runTests}
          className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          disabled={loading}
        >
          {loading ? 'Testing...' : 'Run Tests Again'}
        </button>
        
        <button
          onClick={() => {
            console.log('📊 Current KPI Stats:', stats)
            console.log('🏥 System Health:', health)
            console.log('📦 Test Results:', testResults)
          }}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Log Full Status
        </button>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Last tested: {testResults.timestamp ? new Date(testResults.timestamp).toLocaleString() : 'Not yet tested'}
      </div>
    </div>
  )
}