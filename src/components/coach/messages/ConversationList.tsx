'use client'

import { useState } from 'react'
import {
  Search,
  Building2,
  Circle,
  Clock,
  Filter,
  Star,
  Archive
} from 'lucide-react'

export interface Conversation {
  id: string
  businessId: string
  businessName: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
  isStarred?: boolean
  isArchived?: boolean
}

interface ConversationListProps {
  conversations: Conversation[]
  selectedId?: string
  onSelect: (conversation: Conversation) => void
  onToggleStar?: (conversationId: string) => void
}

type FilterType = 'all' | 'unread' | 'starred' | 'archived'

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onToggleStar
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredConversations = conversations.filter(conv => {
    // Search filter
    const matchesSearch = !searchQuery ||
      conv.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())

    // Type filter
    let matchesFilter = true
    if (filter === 'unread') matchesFilter = conv.unreadCount > 0
    if (filter === 'starred') matchesFilter = conv.isStarred === true
    if (filter === 'archived') matchesFilter = conv.isArchived === true
    if (filter === 'all') matchesFilter = !conv.isArchived

    return matchesSearch && matchesFilter
  })

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const unreadCount = conversations.filter(c => c.unreadCount > 0 && !c.isArchived).length
  const starredCount = conversations.filter(c => c.isStarred && !c.isArchived).length

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Messages</h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
            filter === 'all'
              ? 'bg-brand-orange-100 text-brand-orange-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-brand-orange-100 text-brand-orange-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Unread
          {unreadCount > 0 && (
            <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter('starred')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            filter === 'starred'
              ? 'bg-brand-orange-100 text-brand-orange-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          {starredCount > 0 && <span>({starredCount})</span>}
        </button>
        <button
          onClick={() => setFilter('archived')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
            filter === 'archived'
              ? 'bg-brand-orange-100 text-brand-orange-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'No conversations found' : 'No messages yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredConversations.map(conversation => (
              <div
                key={conversation.id}
                onClick={() => onSelect(conversation)}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedId === conversation.id
                    ? 'bg-brand-orange-50 border-l-2 border-brand-orange'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-gray-600" />
                    </div>
                    {conversation.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <h4 className={`font-medium truncate ${
                          conversation.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {conversation.businessName}
                        </h4>
                        {conversation.isStarred && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${
                      conversation.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'
                    }`}>
                      {conversation.lastMessage}
                    </p>
                  </div>

                  {/* Star Toggle */}
                  {onToggleStar && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleStar(conversation.id)
                      }}
                      className="p-2 text-gray-400 hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Star className={`w-4 h-4 ${
                        conversation.isStarred ? 'text-amber-500 fill-amber-500' : ''
                      }`} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationList
