'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Building2,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Download
} from 'lucide-react'
import { formatFileSize } from '@/lib/services/messageAttachments'

export interface Message {
  id: string
  content: string
  senderId: string
  senderName: string
  senderType: 'coach' | 'client'
  createdAt: string
  status: 'sending' | 'sent' | 'delivered' | 'read'
  attachmentUrl?: string
  attachmentName?: string
  attachmentSize?: number
  attachmentType?: string
}

interface MessageThreadProps {
  messages: Message[]
  businessId: string
  businessName: string
  currentUserId: string
}

export function MessageThread({
  messages,
  businessId,
  businessName,
  currentUserId
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-AU', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
    }
  }

  const getStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3.5 h-3.5 text-gray-400" />
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-gray-400" />
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-indigo-500" />
    }
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const dateKey = new Date(message.createdAt).toDateString()
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(message)
    return groups
  }, {} as Record<string, Message[]>)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href={`/coach/clients/${businessId}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
            <Building2 className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              {businessName}
            </h3>
            <p className="text-sm text-gray-500">View client profile</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
        </Link>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50"
      >
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Start a Conversation</h3>
            <p className="text-gray-500">
              Send your first message to {businessName}
            </p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
            <div key={dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-gray-300" />
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {formatDateHeader(dateKey)}
                </span>
                <div className="flex-1 h-px bg-gray-300" />
              </div>

              {/* Messages for this date */}
              <div className="space-y-3">
                {dateMessages.map((message, idx) => {
                  const isOwn = message.senderId === currentUserId
                  const showAvatar = idx === 0 ||
                    dateMessages[idx - 1].senderId !== message.senderId

                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                    >
                      {/* Avatar */}
                      {!isOwn && showAvatar ? (
                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-slate-600" />
                        </div>
                      ) : !isOwn ? (
                        <div className="w-8" />
                      ) : null}

                      {/* Message Bubble */}
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showAvatar && !isOwn && (
                          <p className="text-xs text-gray-500 mb-1 ml-1">
                            {message.senderName}
                          </p>
                        )}
                        <div
                          className={`px-4 py-2.5 rounded-2xl ${
                            isOwn
                              ? 'bg-indigo-600 text-white rounded-br-md'
                              : 'bg-white text-gray-900 rounded-bl-md shadow-sm border border-gray-100'
                          }`}
                        >
                          {message.content && (
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )}

                          {/* Attachment */}
                          {message.attachmentUrl && (
                            <div className={`${message.content ? 'mt-2 pt-2 border-t' : ''} ${
                              isOwn ? 'border-indigo-500' : 'border-gray-200'
                            }`}>
                              {message.attachmentType?.startsWith('image/') ? (
                                <a
                                  href={message.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={message.attachmentUrl}
                                    alt={message.attachmentName || 'Attached image'}
                                    className="max-w-xs rounded-lg hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={message.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                    isOwn
                                      ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
                                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                  }`}
                                >
                                  <FileText className="w-5 h-5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{message.attachmentName}</p>
                                    {message.attachmentSize && (
                                      <p className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-gray-500'}`}>
                                        {formatFileSize(message.attachmentSize)}
                                      </p>
                                    )}
                                  </div>
                                  <Download className="w-4 h-4 flex-shrink-0" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-xs ${isOwn ? 'text-gray-500' : 'text-gray-400'}`}>
                            {formatTime(message.createdAt)}
                          </span>
                          {isOwn && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default MessageThread
