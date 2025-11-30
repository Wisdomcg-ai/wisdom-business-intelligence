'use client'

import { CoachViewLayout } from '@/components/layouts/CoachViewLayout'

interface ViewLayoutProps {
  children: React.ReactNode
  params: {
    id: string
  }
}

export default function ViewLayout({ children, params }: ViewLayoutProps) {
  return (
    <CoachViewLayout clientId={params?.id}>
      {children}
    </CoachViewLayout>
  )
}
