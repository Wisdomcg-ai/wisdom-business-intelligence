import { createClient } from '@/lib/supabase/client'

const BUCKET_NAME = 'message-attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface AttachmentData {
  url: string
  name: string
  size: number
  type: string
}

/**
 * Upload a file to message attachments storage
 */
export async function uploadMessageAttachment(
  file: File,
  businessId: string
): Promise<AttachmentData> {
  const supabase = createClient()

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 10MB limit')
  }

  // Create a unique filename
  const timestamp = Date.now()
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const filePath = `${businessId}/${timestamp}-${sanitizedName}`

  // Upload to storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error('Upload error:', error)
    throw new Error(`Failed to upload file: ${error.message}`)
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return {
    url: urlData.publicUrl,
    name: file.name,
    size: file.size,
    type: file.type
  }
}

/**
 * Delete an attachment from storage
 */
export async function deleteMessageAttachment(url: string): Promise<void> {
  const supabase = createClient()

  // Extract path from URL
  const urlParts = url.split(`/${BUCKET_NAME}/`)
  if (urlParts.length < 2) return

  const filePath = urlParts[1]

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath])

  if (error) {
    console.error('Delete error:', error)
    throw new Error(`Failed to delete file: ${error.message}`)
  }
}

/**
 * Get file icon based on MIME type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet'
  if (mimeType.includes('document') || mimeType.includes('word')) return 'document'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation'
  return 'file'
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check if file type is allowed
 */
export function isAllowedFileType(file: File): boolean {
  const allowedTypes = [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
  ]

  return allowedTypes.includes(file.type) || file.type.startsWith('image/')
}
