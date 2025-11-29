// Create this file: /src/components/ProfitCalculator.tsx
import { useState } from 'react'
import { Calculator, X } from 'lucide-react'

interface ProfitCalculatorProps {
  onComplete: (data: any) => void
  initialRevenue?: number
  industry?: string
}

export default function ProfitCalculator({ 
  onComplete, 
  initialRevenue = 500000,
  industry = 'general'
}: ProfitCalculatorProps) {
  const [revenue, setRevenue] = useState(initialRevenue)
  const [grossMargin, setGrossMargin] = useState(40)
  const [netMargin, setNetMargin] = useState(15)

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
    onComplete(data)
  }

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 rounded-lg p-4">
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

      <button
        onClick={calculateProjections}
        className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
      >
        Apply to Goals
      </button>
    </div>
  )
}