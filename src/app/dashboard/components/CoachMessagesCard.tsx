'use client'

import { MessageCircle, ChevronRight, Mail, UserX } from 'lucide-react'
import Link from 'next/link'

interface CoachMessagesCardProps {
  onOpenChat: () => void
  unreadCount: number
  lastMessagePreview?: string
  lastMessageTime?: string
  coachName?: string
  hasCoach?: boolean
}

export default function CoachMessagesCard({
  onOpenChat,
  unreadCount,
  lastMessagePreview,
  lastMessageTime,
  coachName = 'Your Coach',
  hasCoach = true
}: CoachMessagesCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-brand-orange border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-brand-navy">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center relative">
              <MessageCircle className="h-4 w-4 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold text-brand-navy bg-brand-orange rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white">Coach Messages</h3>
              <p className="text-xs text-white/70">
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
        {!hasCoach ? (
          // No coach assigned state
          <>
            <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                <UserX className="h-5 w-5 text-brand-orange flex-shrink-0" />
                <p className="text-sm text-gray-700">
                  No coach assigned yet. Contact support to get matched with a coach.
                </p>
              </div>
            </div>
            <Link
              href="/help"
              className="w-full flex items-center justify-between px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium group shadow-sm"
            >
              <span className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Support
              </span>
              <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </>
        ) : (
          // Coach assigned state
          <>
            {/* Last Message Preview */}
            {lastMessagePreview ? (
              <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-lg p-4 mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-brand-navy mb-1">
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
              <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500 text-center">
                  No messages yet. Start a conversation with your coach.
                </p>
              </div>
            )}

            {/* Open Chat Button */}
            <button
              type="button"
              onClick={onOpenChat}
              className="w-full flex items-center justify-between px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium group shadow-sm"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {unreadCount > 0 ? 'View Messages' : 'Message Your Coach'}
              </span>
              <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
