import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyDocumentShared } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Verify user has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', businessId)
      .single()

    if (!business || (business.assigned_coach_id !== user.id && business.owner_id !== user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get documents
    const { data: documents, error: docsError } = await supabase
      .from('shared_documents')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (docsError) {
      console.error('Error loading documents:', docsError)
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      documents: documents || []
    })

  } catch (error) {
    console.error('Get documents API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const businessId = formData.get('business_id') as string
    const folder = (formData.get('folder') as string) || 'root'

    if (!file || !businessId) {
      return NextResponse.json(
        { error: 'file and business_id are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', businessId)
      .single()

    if (!business || (business.assigned_coach_id !== user.id && business.owner_id !== user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Upload file to Supabase Storage
    const fileName = `${businessId}/${folder}/${Date.now()}_${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create document record
    const { data: document, error: docError } = await supabase
      .from('shared_documents')
      .insert({
        business_id: businessId,
        file_name: file.name,
        file_path: uploadData.path,
        folder,
        uploaded_by: user.id
      })
      .select()
      .single()

    if (docError) {
      console.error('Error creating document record:', docError)
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([fileName])
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    // If uploaded by coach, notify the client
    if (business.assigned_coach_id === user.id && business.owner_id) {
      await notifyDocumentShared(
        business.owner_id,
        businessId,
        file.name,
        folder
      )
    }

    return NextResponse.json({
      success: true,
      document
    })

  } catch (error) {
    console.error('Upload document API error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
