'use client'

import { useEffect, useState } from 'react'
import { getAllKPIs, getKPIStats, validateKPIs } from '@/lib/kpi/data/registry'

interface TestResults {
  totalKPIs: number
  byFunction: Record<string, number>
  byTier: Record<string, number>
  validation: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
  prefixCheck: { passed: boolean; issues: string[] }
  propertyCheck: { passed: boolean; issues: string[] }
  iconCheck: { passed: boolean; issues: string[] }
}

export default function VerifyKPISystemPage() {
  const [results, setResults] = useState<TestResults | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    runTests()
  }, [])

  const runTests = () => {
    console.log('🔍 Running KPI System Verification Tests...')

    // Get all KPIs using your registry
    const allKPIs = getAllKPIs()
    const stats = getKPIStats()
    const validation = validateKPIs()

    const testResults: TestResults = {
      totalKPIs: allKPIs.length,
      byFunction: stats.byFunction,
      byTier: stats.byTier,
      validation,
      prefixCheck: { passed: true, issues: [] },
      propertyCheck: { passed: true, issues: [] },
      iconCheck: { passed: true, issues: [] }
    }

    // Test 1: Verify ID Prefixes
    const functionPrefixes: Record<string, string> = {
      DELIGHT: 'delight-',
      PROFIT: 'profit-',
      PEOPLE: 'people-',
      SYSTEMS: 'systems-'
    }

    allKPIs.forEach(kpi => {
      const expectedPrefix = functionPrefixes[kpi.function] // ✅ FIXED: use 'function' not 'businessFunction'
      if (expectedPrefix && !kpi.id.startsWith(expectedPrefix)) {
        testResults.prefixCheck.passed = false
        testResults.prefixCheck.issues.push(
          `${kpi.id} should start with "${expectedPrefix}" (function: ${kpi.function})`
        )
      }
    })

    // Test 2: Verify Property Names - ✅ FIXED: Check for 'function' property instead of 'businessFunction'
    allKPIs.forEach(kpi => {
      if (!kpi.function) {
        testResults.propertyCheck.passed = false
        testResults.propertyCheck.issues.push(`${kpi.id} is missing "function" property`)
      }

      // Check if using old property name
      if ((kpi as any).businessFunction) {
        testResults.propertyCheck.passed = false
        testResults.propertyCheck.issues.push(
          `${kpi.id} uses deprecated "businessFunction" property instead of "function"`
        )
      }
    })

    // Test 3: Verify Icons
    allKPIs.forEach(kpi => {
      if (!kpi.icon) {
        testResults.iconCheck.passed = false
        testResults.iconCheck.issues.push(`${kpi.id} is missing an icon`)
      }
    })

    setResults(testResults)
    setLoading(false)

    // Console output
    console.log('📊 Test Results:', testResults)
    console.log('📈 KPI Stats:', stats)
    console.log('✅ Validation:', validation)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">KPI System Verification</h1>
          <p>Running tests...</p>
        </div>
      </div>
    )
  }

  if (!results) return null

  const allTestsPassed =
    results.validation.valid &&
    results.prefixCheck.passed &&
    results.propertyCheck.passed &&
    results.iconCheck.passed

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">🔍 KPI System Verification</h1>
          <p className="text-gray-600">Comprehensive testing of the KPI library implementation</p>
        </div>

        {/* Overall Status */}
        <div className={`rounded-lg shadow-sm p-6 mb-6 ${
          allTestsPassed ? 'bg-green-50 border-2 border-green-500' : 'bg-red-50 border-2 border-red-500'
        }`}>
          <h2 className="text-2xl font-bold mb-2">
            {allTestsPassed ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}
          </h2>
          <p className="text-gray-700">
            {allTestsPassed
              ? 'Your KPI system is properly configured and ready to use.'
              : 'Please review the failed tests below and make necessary corrections.'
            }
          </p>
        </div>

        {/* KPI Statistics */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📊 KPI Statistics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-teal-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total KPIs</p>
              <p className="text-3xl font-bold text-teal-600">{results.totalKPIs}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Essential Tier</p>
              <p className="text-3xl font-bold text-green-600">{results.byTier.ESSENTIAL}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Business Functions</p>
              <p className="text-3xl font-bold text-purple-600">8</p>
            </div>
          </div>

          <h3 className="font-semibold mb-3">KPIs by Business Function:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(results.byFunction).map(([func, count]) => (
              <div key={func} className="bg-gray-50 p-3 rounded">
                <p className="text-xs text-gray-600">{func}</p>
                <p className="text-xl font-bold">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Registry Validation */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h3 className={`text-lg font-bold mb-2 ${
            results.validation.valid ? 'text-green-600' : 'text-red-600'
          }`}>
            {results.validation.valid ? '✅' : '❌'} Registry Validation Test
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Comprehensive validation of all KPI data integrity
          </p>

          {!results.validation.valid && results.validation.errors.length > 0 && (
            <div className="bg-red-50 p-4 rounded mb-3">
              <p className="font-semibold mb-2 text-red-900">Errors Found:</p>
              <ul className="space-y-1">
                {results.validation.errors.map((error, idx) => (
                  <li key={idx} className="text-sm text-red-800">❌ {error}</li>
                ))}
              </ul>
            </div>
          )}

          {results.validation.warnings.length > 0 && (
            <div className="bg-yellow-50 p-4 rounded">
              <p className="font-semibold mb-2 text-yellow-900">Warnings:</p>
              <ul className="space-y-1">
                {results.validation.warnings.slice(0, 10).map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-800">⚠️ {warning}</li>
                ))}
                {results.validation.warnings.length > 10 && (
                  <li className="text-sm text-yellow-800 italic">
                    ... and {results.validation.warnings.length - 10} more warnings
                  </li>
                )}
              </ul>
            </div>
          )}

          {results.validation.valid && results.validation.warnings.length === 0 && (
            <p className="text-green-600">✓ All KPIs have valid data structure</p>
          )}
        </div>

        {/* Test Results */}
        <div className="space-y-4">
          {/* Prefix Check */}
          <TestResult
            title="ID Prefix Convention Test"
            description="Verifies that DELIGHT, PROFIT, PEOPLE, and SYSTEMS KPIs use correct ID prefixes"
            passed={results.prefixCheck.passed}
            issues={results.prefixCheck.issues}
          />

          {/* Property Check */}
          <TestResult
            title="Property Name Test"
            description='Verifies that all KPIs use "function" property'
            passed={results.propertyCheck.passed}
            issues={results.propertyCheck.issues}
          />

          {/* Icon Check */}
          <TestResult
            title="Icon Validation Test"
            description="Verifies that all KPIs have valid icons"
            passed={results.iconCheck.passed}
            issues={results.iconCheck.issues}
          />
        </div>

        {/* Action Items */}
        {!allTestsPassed && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mt-6">
            <h3 className="text-lg font-bold mb-3">🔧 Action Items</h3>
            <ul className="space-y-2">
              {!results.iconCheck.passed && (
                <li className="text-sm">
                  • Fix missing icons in KPI definitions
                </li>
              )}
              {!results.prefixCheck.passed && (
                <li className="text-sm">
                  • Update KPI IDs to follow naming conventions (delight-, profit-, people-, systems-)
                </li>
              )}
              {!results.propertyCheck.passed && (
                <li className="text-sm">
                  • Replace <code className="bg-yellow-100 px-2 py-1 rounded">businessFunction:</code> with{' '}
                  <code className="bg-yellow-100 px-2 py-1 rounded">function:</code> in all KPI definitions
                </li>
              )}
              {!results.validation.valid && (
                <li className="text-sm">
                  • Fix validation errors listed above
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Next Steps */}
        {allTestsPassed && (
          <div className="bg-teal-50 border-2 border-teal-400 rounded-lg p-6 mt-6">
            <h3 className="text-lg font-bold mb-3">🎉 Ready for Next Steps!</h3>
            <p className="mb-3">Your KPI system is properly configured. You can now:</p>
            <ul className="space-y-2">
              <li className="text-sm">✓ View the test page at /test-kpi</li>
              <li className="text-sm">✓ Integrate KPIs into the assessment results page</li>
              <li className="text-sm">✓ Build the goals wizard with proper KPI selection</li>
              <li className="text-sm">✓ Add industry-specific KPIs</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function TestResult({
  title,
  description,
  passed,
  issues
}: {
  title: string
  description: string
  passed: boolean
  issues: string[]
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className={`text-lg font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
        {passed ? '✅' : '❌'} {title}
      </h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>

      {!passed && issues.length > 0 && (
        <div className="bg-red-50 p-4 rounded">
          <p className="font-semibold mb-2">Issues Found:</p>
          <ul className="space-y-1">
            {issues.map((issue, idx) => (
              <li key={idx} className="text-sm text-red-800">❌ {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {passed && (
        <p className="text-green-600">✓ All checks passed</p>
      )}
    </div>
  )
}