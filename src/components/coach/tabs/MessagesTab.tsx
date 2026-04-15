'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  business_id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
}

interface MessagesTabProps {
  businessId: string
  businessName: string
}

export function MessagesTab({ businessId, businessName }: MessagesTabProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Fetch current user and messages on mount
  useEffect(() => {
    const supabase = createClient()

    async function init() {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setCurrentUserId(user.id)

      // Fetch messages for this business
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })

      if (!error && messagesData) {
        setMessages(messagesData)
      }

      // Mark unread messages from others as read
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('business_id', businessId)
        .neq('sender_id', user.id)
        .eq('read', false)

      setLoading(false)
    }

    init()
  }, [businessId])

  // Real-time subscription for new messages in this conversation
  useEffect(() => {
    if (!currentUserId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-tab-${businessId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        const newMsg = payload.new as Message
        if (newMsg.sender_id === currentUserId) return
        setMessages(prev => [...prev, newMsg])
        // Mark as read since we're viewing
        supabase.from('messages').update({ read: true }).eq('id', newMsg.id).then(() => {})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [businessId, currentUserId])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function handleSend() {
    if (!newMessage.trim() || !currentUserId || sending) return

    setSending(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        sender_id: currentUserId,
        content: newMessage.trim(),
        read: false,
      })
      .select()
      .single()

    if (!error && data) {
      setMessages((prev) => [...prev, data])
      setNewMessage('')
    }

    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatTimestamp(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()

    const time = date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    if (isToday) return time
    if (isYesterday) return `Yesterday ${time}`

    return `${date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
    })} ${time}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-brand-orange animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-brand-navy">Messages</h2>
        <p className="text-sm text-gray-500">
          Conversation with {businessName}
        </p>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto max-h-[500px] rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No messages yet
            </h3>
            <p className="text-gray-500">
              Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isCoach = message.sender_id === currentUserId
            return (
              <div
                key={message.id}
                className={`flex ${isCoach ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isCoach
                      ? 'bg-brand-orange text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className={`text-xs font-medium mb-1 ${
                    isCoach ? 'text-white/80' : 'text-gray-500'
                  }`}>
                    {isCoach ? 'You' : businessName}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    isCoach ? 'text-white/60' : 'text-gray-400'
                  }`}>
                    {formatTimestamp(message.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="mt-4 flex items-end gap-3">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent placeholder:text-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="flex items-center justify-center w-11 h-11 rounded-xl bg-brand-orange text-white hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  )
}

export default MessagesTab
