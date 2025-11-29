'use client'

import { useState, useRef } from 'react'
import { Upload, X, File, Loader2, CheckCircle } from 'lucide-react'

interface DocumentUploadProps {
  businessId: string
  folder?: string
  onUploadComplete?: () => void
}

export default function DocumentUpload({
  businessId,
  folder = 'root',
  onUploadComplete
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setUploadSuccess(false)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('business_id', businessId)
      formData.append('folder', folder)

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()

      if (data.success) {
        setUploadSuccess(true)
        if (onUploadComplete) {
          onUploadComplete()
        }
        // Reset after 2 seconds
        setTimeout(() => {
          setUploadSuccess(false)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }, 2000)
      } else {
        alert('Upload failed: ' + data.error)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleChange}
        className="hidden"
        accept="*/*"
      />

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          dragActive
            ? 'border-teal-500 bg-teal-50'
            : uploadSuccess
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mb-4" />
            <p className="text-sm text-gray-600">Uploading...</p>
          </div>
        ) : uploadSuccess ? (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-12 h-12 text-green-600 mb-4" />
            <p className="text-sm font-medium text-green-700">Upload successful!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-500">
              PDF, Word, Excel, images, and more
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
