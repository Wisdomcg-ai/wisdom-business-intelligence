'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Paperclip,
  Smile,
  FileText,
  X,
  Loader2
} from 'lucide-react'

interface MessageComposerProps {
  onSend: (message: string, attachments?: File[]) => Promise<void>
  placeholder?: string
  disabled?: boolean
  templates?: { id: string; name: string; content: string }[]
}

export function MessageComposer({
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  templates = []
}: MessageComposerProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [message])

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return
    if (sending || disabled) return

    setSending(true)
    try {
      await onSend(message.trim(), attachments.length > 0 ? attachments : undefined)
      setMessage('')
      setAttachments([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const insertTemplate = (template: { content: string }) => {
    setMessage(template.content)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm"
            >
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <span className="text-gray-400 text-xs">{formatFileSize(file.size)}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Template Selector */}
      {showTemplates && templates.length > 0 && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Message Templates</h4>
            <button
              onClick={() => setShowTemplates(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {templates.map(template => (
              <button
                key={template.id}
                onClick={() => insertTemplate(template)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white transition-colors"
              >
                <p className="font-medium text-gray-900 text-sm">{template.name}</p>
                <p className="text-xs text-gray-500 truncate">{template.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2">
        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              disabled={disabled}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                showTemplates
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title="Use template"
            >
              <FileText className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Text Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white disabled:opacity-50"
            style={{ maxHeight: '150px' }}
          />
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || sending || (!message.trim() && attachments.length === 0)}
          className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Helper Text */}
      <p className="mt-2 text-xs text-gray-400 text-center">
        Press Enter to send, Shift + Enter for new line
      </p>
    </div>
  )
}

export default MessageComposer
