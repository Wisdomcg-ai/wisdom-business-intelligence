'use client'

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-gray-200 rounded-lg" />
        <div className="h-5 w-32 bg-gray-200 rounded" />
      </div>

      {/* Content rows */}
      <div className="space-y-4">
        <div className="bg-gray-100 rounded-lg p-3">
          <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-7 w-24 bg-gray-200 rounded" />
        </div>
        <div className="bg-gray-100 rounded-lg p-3">
          <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
          <div className="h-7 w-28 bg-gray-200 rounded" />
        </div>
        <div className="bg-gray-100 rounded-lg p-3">
          <div className="h-3 w-18 bg-gray-200 rounded mb-2" />
          <div className="h-7 w-24 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  )
}

function SkeletonSmallCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow p-6 animate-pulse ${className}`}>
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-4 w-5/6 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-center justify-between animate-pulse">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>

      {/* Top Row: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Second Row: 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <SkeletonSmallCard />
        <SkeletonSmallCard />
      </div>

      {/* Quick Actions skeleton */}
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-5 w-32 bg-gray-200 rounded mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center p-6 rounded-lg border-2 border-gray-100">
              <div className="w-12 h-12 bg-gray-200 rounded-full mb-3" />
              <div className="h-4 w-28 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
