'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import PageHeader from '@/components/ui/PageHeader'
import ProcessLibrary from './components/ProcessLibrary'
import type { ProcessDiagramRecord, ProcessSnapshot } from '@/types/process-builder'

export default function ProcessesPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [loading, setLoading] = useState(true)
  const [processes, setProcesses] = useState<ProcessDiagramRecord[]>([])
  const activeBusinessRef = useRef(activeBusiness)
  activeBusinessRef.current = activeBusiness

  useEffect(() => {
    if (!contextLoading) {
      loadProcesses()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadProcesses = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const biz = activeBusinessRef.current
      const targetUserId = biz?.ownerId || user.id

      const res = await fetch(`/api/processes?user_id=${targetUserId}`)
      const json = await res.json()

      if (res.ok) {
        setProcesses(json.processes || [])
      }
    } catch (error) {
      console.error('Error loading processes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (name: string, description: string, snapshot?: ProcessSnapshot) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const biz = activeBusinessRef.current
      const targetUserId = biz?.ownerId || user.id

      const res = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          user_id: targetUserId,
          ...(snapshot ? { process_data: snapshot } : {}),
        }),
      })

      const json = await res.json()
      if (res.ok && json.process) {
        router.push(`/systems/processes/${json.process.id}`)
      }
    } catch (error) {
      console.error('Error creating process:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/processes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProcesses((prev) => prev.filter((p) => p.id !== id))
      }
    } catch (error) {
      console.error('Error deleting process:', error)
    }
  }

  if (loading || contextLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-600">Loading processes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <PageHeader
        variant="banner"
        title="Systems & Processes"
        subtitle="Map your business workflows into professional diagrams"
        icon={Settings}
      />
      <div className="flex-1 overflow-auto">
        <ProcessLibrary
          processes={processes}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
