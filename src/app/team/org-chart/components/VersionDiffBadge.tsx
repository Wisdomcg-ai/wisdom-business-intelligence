'use client'

interface VersionDiffBadgeProps {
  status: 'new' | 'modified' | 'removed'
}

export default function VersionDiffBadge({ status }: VersionDiffBadgeProps) {
  const styles = {
    new: 'bg-green-100 text-green-700 border-green-200',
    modified: 'bg-amber-100 text-amber-700 border-amber-200',
    removed: 'bg-red-100 text-red-700 border-red-200',
  }

  const labels = {
    new: 'New',
    modified: 'Modified',
    removed: 'Removed',
  }

  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}
