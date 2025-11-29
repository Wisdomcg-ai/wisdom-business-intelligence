'use client'

import Link from 'next/link'
import {
  MessageSquare,
  ChevronRight,
  User
} from 'lucide-react'

interface Message {
  id: string
  content: string
  senderName: string
  senderType: 'coach' | 'client'
  timestamp: string
  isRead: boolean
}

interface RecentMessagesProps {
  messages: Message[]
}

export function RecentMessages({ messages }: RecentMessagesProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Recent Messages</h3>
            <p className="text-sm text-gray-500">Your conversation with your coach</p>
          </div>
        </div>
        <Link
          href="/messages"
          className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
        >
          View all
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-gray-300" />
          </div>
          <h4 className="font-medium text-gray-900 mb-1">No messages yet</h4>
          <p className="text-sm text-gray-500 mb-4">Start a conversation with your coach</p>
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            Send Message
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {messages.slice(0, 4).map(message => (
            <Link
              key={message.id}
              href="/messages"
              className={`block px-6 py-4 hover:bg-gray-50 transition-colors ${
                !message.isRead && message.senderType === 'coach' ? 'bg-teal-50/50' : ''
              }`}
            >
              <div className="flex gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.senderType === 'coach' ? 'bg-teal-600' : 'bg-gray-200'
                }`}>
                  <User className={`w-4 h-4 ${
                    message.senderType === 'coach' ? 'text-white' : 'text-gray-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-sm font-medium ${
                      !message.isRead && message.senderType === 'coach' ? 'text-gray-900' : 'text-gray-700'
                    }`}>
                      {message.senderName}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(message.timestamp)}</span>
                  </div>
                  <p className={`text-sm truncate ${
                    !message.isRead && message.senderType === 'coach' ? 'text-gray-700 font-medium' : 'text-gray-500'
                  }`}>
                    {message.content}
                  </p>
                </div>
                {!message.isRead && message.senderType === 'coach' && (
                  <div className="w-2 h-2 bg-teal-500 rounded-full flex-shrink-0 mt-2" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="p-4 border-t border-gray-100">
          <Link
            href="/messages"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors font-medium text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            Open Messages
          </Link>
        </div>
      )}
    </div>
  )
}

export default RecentMessages
