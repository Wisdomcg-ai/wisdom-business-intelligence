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
    error
  } = useKPIs()

  const initialized = !loading && kpis.length > 0

  useEffect(() => {
    if (!loading) {
      runTests()
    }
  }, [loading])

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

      // Test 3: Validation
      const validationTests = {
        validValue: validateKPIValue(85.5, 'percentage'),
        invalidValue: validateKPIValue(-10, 'percentage')
      }
      console.log('✅ Test 3 - Validation:', validationTests)

      // Test 4: Mappers
      const mappingTests = {
        industry: mapBusinessIndustryToKPIIndustry('technology'),
        stage: mapRevenueToStage('$1M-$5M')
      }
      console.log('✅ Test 4 - Mappers:', mappingTests)

      // Test 5: Enum values
      const enumTests = {
        businessFunctions: Object.values(BusinessFunction),
        industries: Object.values(Industry),
        stages: Object.values(BusinessStage)
      }
      console.log('✅ Test 5 - Enums:', enumTests)

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
            <div className={`font-semibold ${health?.healthy ? 'text-green-600' : 'text-red-600'}`}>
              {health?.healthy ? '✅ Healthy' : '⚠️ Unknown'}
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
            <div className="font-semibold text-teal-900">{kpis.length}</div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Health Total</div>
            <div className="font-semibold text-teal-900">
              {health?.totalKPIs || 0}
            </div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Essential KPIs</div>
            <div className="font-semibold text-teal-900">{health?.essential || 0}</div>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <div className="text-sm text-teal-600">Last Checked</div>
            <div className="font-semibold text-teal-900 text-xs">
              {health?.lastChecked ? new Date(health.lastChecked).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Test Results */}
      {testResults.formatTests && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Test Results</h3>
          <div className="bg-green-50 p-4 rounded">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Formatters:</strong>
                <ul className="ml-4">
                  <li>Currency: {testResults.formatTests?.currency}</li>
                  <li>Percentage: {testResults.formatTests?.percentage}</li>
                </ul>
              </div>
              <div>
                <strong>Validation:</strong>
                <ul className="ml-4">
                  <li>Valid (85.5): {testResults.validationTests?.validValue?.isValid ? '✅' : '❌'}</li>
                  <li>Invalid (-10): {testResults.validationTests?.invalidValue?.isValid ? '✅' : '❌'}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp */}
      {testResults.timestamp && (
        <div className="text-xs text-gray-500 text-right">
          Last run: {new Date(testResults.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  )
}
