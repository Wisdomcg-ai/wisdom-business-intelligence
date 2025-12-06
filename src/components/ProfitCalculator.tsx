// /src/components/ProfitCalculator.tsx
import { useState, useEffect } from 'react'
import { Calculator, X } from 'lucide-react'

export interface ProfitCalculatorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
  businessId?: string
  initialRevenue?: number
  industry?: string
}

export default function ProfitCalculator({
  isOpen,
  onClose,
  onSave,
  businessId,
  initialRevenue = 500000,
  industry = 'general'
}: ProfitCalculatorProps) {
  const [revenue, setRevenue] = useState(initialRevenue)
  const [grossMargin, setGrossMargin] = useState(40)
  const [netMargin, setNetMargin] = useState(15)

  // Reset values when modal opens
  useEffect(() => {
    if (isOpen) {
      setRevenue(initialRevenue)
      setGrossMargin(40)
      setNetMargin(15)
    }
  }, [isOpen, initialRevenue])

  // Industry benchmarks
  const industryBenchmarks = {
    'saas': { grossMargin: 70, netMargin: 20 },
    'manufacturing': { grossMargin: 30, netMargin: 10 },
    'consulting': { grossMargin: 50, netMargin: 20 },
    'retail': { grossMargin: 35, netMargin: 5 },
    'construction': { grossMargin: 25, netMargin: 8 },
    'general': { grossMargin: 40, netMargin: 15 }
  }

  const calculateProjections = () => {
    const data = {
      currentRevenue: revenue,
      currentProfit: Math.round(revenue * (netMargin / 100)),
      year1Revenue: Math.round(revenue * 1.5),
      year1Profit: Math.round(revenue * 1.5 * (netMargin / 100)),
      year2Revenue: Math.round(revenue * 3),
      year2Profit: Math.round(revenue * 3 * ((netMargin + 5) / 100)),
      year3Revenue: Math.round(revenue * 6),
      year3Profit: Math.round(revenue * 6 * ((netMargin + 5) / 100)),
    }
    onSave(data)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-lg p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-orange-100 rounded-lg">
                <Calculator className="w-6 h-6 text-brand-orange" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Profit Calculator</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-brand-orange-50 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Industry Benchmarks</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Industry:</span>
                  <span className="ml-2 font-medium capitalize">{industry}</span>
                </div>
                <div>
                  <span className="text-gray-600">Typical Gross Margin:</span>
                  <span className="ml-2 font-medium">
                    {industryBenchmarks[industry as keyof typeof industryBenchmarks]?.grossMargin || 40}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Typical Net Margin:</span>
                  <span className="ml-2 font-medium">
                    {industryBenchmarks[industry as keyof typeof industryBenchmarks]?.netMargin || 15}%
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Current Annual Revenue</label>
                <input
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(Number(e.target.value))}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Target Gross Margin %</label>
                <input
                  type="number"
                  value={grossMargin}
                  onChange={(e) => setGrossMargin(Number(e.target.value))}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Target Net Margin %</label>
                <input
                  type="number"
                  value={netMargin}
                  onChange={(e) => setNetMargin(Number(e.target.value))}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={calculateProjections}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Apply to Goals
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
