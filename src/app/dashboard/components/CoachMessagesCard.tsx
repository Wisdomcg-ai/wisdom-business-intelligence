'use client'

import { MessageCircle, ChevronRight } from 'lucide-react'

interface CoachMessagesCardProps {
  onOpenChat: () => void
  unreadCount: number
  lastMessagePreview?: string
  lastMessageTime?: string
  coachName?: string
}

export default function CoachMessagesCard({
  onOpenChat,
  unreadCount,
  lastMessagePreview,
  lastMessageTime,
  coachName = 'Your Coach'
}: CoachMessagesCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center relative">
              <MessageCircle className="h-4 w-4 text-teal-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Coach Messages</h3>
              <p className="text-xs text-gray-500">
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`
                  : 'Chat with your coach'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Last Message Preview */}
        {lastMessagePreview ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {coachName}
                </p>
                <p className="text-sm text-gray-700 truncate">
                  {lastMessagePreview}
                </p>
              </div>
              {lastMessageTime && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {lastMessageTime}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-500 text-center">
              No messages yet. Start a conversation with your coach.
            </p>
          </div>
        )}

        {/* Open Chat Button */}
        <button
          type="button"
          onClick={onOpenChat}
          className="w-full flex items-center justify-between px-5 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium group"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {unreadCount > 0 ? 'View Messages' : 'Message Your Coach'}
          </span>
          <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  )
}
