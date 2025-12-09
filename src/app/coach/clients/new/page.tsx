'use client'

import { useRouter } from 'next/navigation'
import { OnboardingWizard, type WizardData } from '@/components/coach/OnboardingWizard'

export default function NewClientPage() {
  const router = useRouter()

  const handleComplete = async (data: WizardData) => {
    // Call the API to create client with auth user and send invitation
    const response = await fetch('/api/coach/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: data.businessName,
        industry: data.industry,
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
        ownerEmail: data.ownerEmail,
        ownerPhone: data.ownerPhone,
        website: data.website,
        address: data.address,
        programType: data.programType,
        sessionFrequency: data.programType === '1:1 Coaching' ? data.sessionFrequency : null,
        customFrequency: data.programType === 'Coaching + CFO Services' ? data.customFrequency : null,
        engagementStartDate: data.engagementStartDate,
        enabledModules: data.enabledModules,
        sendInvitation: true, // Always send invitation email
        teamMembers: data.teamMembers || [] // Include team members from Step 4
      })
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create client')
    }

    // Navigate to the new client's page
    router.push(`/coach/clients/${result.business.id}`)
  }

  const handleCancel = () => {
    router.push('/coach/clients')
  }

  return (
    <OnboardingWizard
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  )
}
