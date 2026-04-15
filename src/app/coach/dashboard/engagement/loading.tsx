import { Loader2 } from 'lucide-react'

export default function EngagementLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
        <p className="text-gray-500 text-sm">Loading engagement data...</p>
      </div>
    </div>
  )
}
