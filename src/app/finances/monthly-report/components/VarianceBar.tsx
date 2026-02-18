'use client'

interface VarianceBarProps {
  percent: number
  isFavorable: boolean
}

export default function VarianceBar({ percent, isFavorable }: VarianceBarProps) {
  const clampedPercent = Math.min(Math.abs(percent), 100)
  const color = isFavorable ? 'bg-green-500' : 'bg-red-500'

  return (
    <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  )
}
