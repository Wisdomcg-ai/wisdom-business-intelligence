'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import ProcessBuilder from '../components/ProcessBuilder'
import type { ProcessDiagramRecord } from '@/types/process-builder'
import { DEFAULT_SNAPSHOT } from '@/types/process-builder'

export default function ProcessBuilderPage({
  params,
}: {
  params: { id: string }
}) {
  const id = params.id
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [loading, setLoading] = useState(true)
  const [process, setProcess] = useState<ProcessDiagramRecord | null>(null)
  const activeBusinessRef = useRef(activeBusiness)
  activeBusinessRef.current = activeBusiness

  useEffect(() => {
    if (!contextLoading) {
      loadProcess()
    }
  }, [contextLoading, id])

  const loadProcess = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const res = await fetch(`/api/processes/${id}`)
      const json = await res.json()

      if (res.ok && json.process) {
        setProcess(json.process)
      } else {
        router.push('/systems/processes')
      }
    } catch (error) {
      console.error('Error loading process:', error)
      router.push('/systems/processes')
    } finally {
      setLoading(false)
    }
  }

  if (loading || contextLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading process builder...</p>
        </div>
      </div>
    )
  }

  if (!process) return null

  return (
    <ProcessBuilder
      processId={process.id}
      initialName={process.name}
      initialDescription={process.description || ''}
      initialSnapshot={process.process_data || DEFAULT_SNAPSHOT}
    />
  )
}
