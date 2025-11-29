import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createRouteHandlerClient()
  const documentId = params.id

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get document record
    const { data: document, error: docError } = await supabase
      .from('shared_documents')
      .select('*, businesses!inner(assigned_coach_id, owner_id)')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify access
    const business = (document as any).businesses
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get signed URL for download
    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(document.file_path, 60) // 60 seconds expiry

    if (urlError || !urlData) {
      console.error('Error creating signed URL:', urlError)
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      downloadUrl: urlData.signedUrl,
      fileName: document.file_name
    })

  } catch (error) {
    console.error('Download document API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
