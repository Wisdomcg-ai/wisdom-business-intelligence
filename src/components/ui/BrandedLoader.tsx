'use client'

import Image from 'next/image'

interface BrandedLoaderProps {
  message?: string
  submessage?: string
  size?: 'sm' | 'md' | 'lg'
  fullScreen?: boolean
}

export default function BrandedLoader({
  message = 'Loading...',
  submessage = 'Please wait',
  size = 'md',
  fullScreen = true
}: BrandedLoaderProps) {
  const sizeClasses = {
    sm: 'h-10',
    md: 'h-16',
    lg: 'h-20'
  }

  const spinnerSizes = {
    sm: '-inset-2 border-2',
    md: '-inset-4 border-4',
    lg: '-inset-5 border-4'
  }

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl'
  }

  const content = (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <Image
          src="/images/logo-wbi.png"
          alt="WisdomBi"
          width={410}
          height={170}
          className={`${sizeClasses[size]} w-auto animate-pulse`}
          priority
        />
        <div className={`absolute ${spinnerSizes[size]} border-brand-orange/30 border-t-brand-orange rounded-full animate-spin`} />
      </div>
      <div className="text-center">
        <p className={`text-white font-medium ${textSizes[size]}`}>{message}</p>
        {submessage && (
          <p className="text-brand-orange-300 text-sm mt-1">{submessage}</p>
        )}
      </div>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        {content}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      {content}
    </div>
  )
}
