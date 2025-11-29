'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientLayout from '@/components/client/ClientLayout'
import DocumentUpload from '@/components/documents/DocumentUpload'
import {
  FileText,
  Download,
  Folder,
  Search,
  File,
  Image,
  FileSpreadsheet,
  FileCode,
  Calendar
} from 'lucide-react'
import { useBusinessContext } from '@/hooks/useBusinessContext'

interface Document {
  id: string
  file_name: string
  file_path: string
  folder: string
  created_at: string
  uploaded_by: string
}

export default function DocumentsPage() {
  const supabase = createClient()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>('all')

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user's business
    const { data: businessData } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!businessData) {
      setLoading(false)
      return
    }

    setBusinessId(businessData.id)

    // Get documents from API
    const res = await fetch(`/api/documents?business_id=${businessData.id}`)
    const data = await res.json()

    if (data.success) {
      setDocuments(data.documents || [])
    } else {
      console.error('Error loading documents:', data.error)
    }

    setLoading(false)
  }

  async function downloadDocument(docId: string) {
    const res = await fetch(`/api/documents/${docId}/download`)
    const data = await res.json()

    if (data.success && data.downloadUrl) {
      // Open download URL in new tab
      window.open(data.downloadUrl, '_blank')
    } else {
      alert('Failed to download document')
    }
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-500" />
      case 'doc':
      case 'docx':
        return <FileText className="w-8 h-8 text-teal-500" />
      case 'xls':
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="w-8 h-8 text-green-500" />
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <Image className="w-8 h-8 text-purple-500" />
      case 'txt':
      case 'md':
        return <FileCode className="w-8 h-8 text-gray-500" />
      default:
        return <File className="w-8 h-8 text-gray-400" />
    }
  }

  const folders = Array.from(new Set(documents.map(d => d.folder)))
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.file_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFolder = selectedFolder === 'all' || doc.folder === selectedFolder
    return matchesSearch && matchesFolder
  })

  return (
    <ClientLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-600 mt-1">Shared resources and files from your coach</p>
        </div>

        {/* Upload Section */}
        {businessId && (
          <DocumentUpload
            businessId={businessId}
            folder={selectedFolder === 'all' ? 'root' : selectedFolder}
            onUploadComplete={loadDocuments}
          />
        )}

        {/* Search and Filters */}
        {documents.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Folder Filter */}
            <div className="relative">
              <Folder className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Folders</option>
                {folders.map(folder => (
                  <option key={folder} value={folder}>
                    {folder.charAt(0).toUpperCase() + folder.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Documents Grid */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Loading documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {documents.length === 0 ? 'No Documents Yet' : 'No documents found'}
            </h3>
            <p className="text-gray-600">
              {documents.length === 0
                ? 'Documents shared by your coach will appear here.'
                : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-lg border-2 border-gray-200 p-5 hover:border-teal-400 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-4">
                  {/* File Icon */}
                  <div className="flex-shrink-0">
                    {getFileIcon(doc.file_name)}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">
                      {doc.file_name}
                    </h3>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Folder className="w-3 h-3" />
                        <span className="truncate">{doc.folder}</span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(doc.created_at).toLocaleDateString('en-AU', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => downloadDocument(doc.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {documents.length > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-teal-700 font-medium">
                {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
                {searchTerm || selectedFolder !== 'all' ? ' found' : ' total'}
              </span>
              {folders.length > 1 && (
                <span className="text-teal-600">
                  {folders.length} folders
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  )
}
