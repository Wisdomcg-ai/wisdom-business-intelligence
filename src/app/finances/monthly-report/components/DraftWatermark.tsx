'use client'

export default function DraftWatermark() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center overflow-hidden">
      <div className="rotate-[-30deg] text-red-200 text-[120px] font-bold opacity-20 select-none whitespace-nowrap">
        DRAFT
      </div>
    </div>
  )
}
