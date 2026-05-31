import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyDocumentShared } from '@/lib/notifications'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// GET searchParams: { business_id? } (string-typed query).
const GetQuerySchema = z.object({ business_id: z.string().optional() }).passthrough()

// POST is multipart/form-data (file upload). The wrapper's clone().json() no-ops on
// multipart so this stays observe-only; we still model the known form text fields.
const PostBodySchema = z
  .object({
    business_id: z.string().optional(),
    folder: z.string().optional(),
  })
  .passthrough()

async function getHandler(request: Request) {
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

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      // Super-admin bypass — see notes in chat/messages/route.ts.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin')
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Get documents
    const { data: documents, error: docsError } = await supabase
      .from('shared_documents')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (docsError) {
      Sentry.captureException(docsError, { tags: { route: 'documents' }, extra: { context: "Error loading documents" } } as any)
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      documents: documents || []
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'documents' }, extra: { context: "Get documents API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const GET = withQuerySchema('documents', GetQuerySchema, getHandler)

// Allowed file types for upload
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv'
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

async function postHandler(request: Request) {
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

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: PDF, images, Office documents, text, CSV` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10MB` },
        { status: 400 }
      )
    }

    // Validate file name (no path traversal)
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid file name' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const { data: business } = await supabase
      .from('businesses')
      .select('assigned_coach_id, owner_id')
      .eq('id', businessId)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    if (business.assigned_coach_id !== user.id && business.owner_id !== user.id) {
      // Super-admin bypass — see notes in chat/messages/route.ts.
      const { data: isSuper } = await supabase.rpc('auth_is_super_admin')
      if (!isSuper) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
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
      Sentry.captureException(uploadError, { tags: { route: 'documents' }, extra: { context: "Error uploading file" } } as any)
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
      Sentry.captureException(docError, { tags: { route: 'documents' }, extra: { context: "Error creating document record" } } as any)
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
    Sentry.captureException(error, { tags: { route: 'documents' }, extra: { context: "Upload document API error" } } as any)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const POST = withSchema('documents', PostBodySchema, postHandler)
