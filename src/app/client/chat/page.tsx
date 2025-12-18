'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientLayout from '@/components/client/ClientLayout'
import {
  MessageSquare,
  Send,
  User,
  Briefcase,
  CheckCheck,
  Loader2
} from 'lucide-react'

interface Message {
  id: string
  business_id: string
  content: string
  sender_id: string
  sender_type: string
  recipient_id: string | null
  created_at: string
  read: boolean
}

export default function ChatPage() {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    console.log('[Chat] User:', user?.id, user?.email)
    if (!user) return

    setUserId(user.id)

    // First try to get business via business_users join table
    const { data: businessUser, error: buError } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle()

    console.log('[Chat] business_users result:', businessUser, 'error:', buError?.message)

    let businessData = null

    if (businessUser) {
      // Get business details using the business_id from business_users
      const { data, error } = await supabase
        .from('businesses')
        .select('id, assigned_coach_id')
        .eq('id', businessUser.business_id)
        .maybeSingle()
      console.log('[Chat] Business via business_users:', data, 'error:', error?.message)
      businessData = data
    } else {
      // Fallback: try direct owner_id lookup
      const { data, error } = await supabase
        .from('businesses')
        .select('id, assigned_coach_id')
        .eq('owner_id', user.id)
        .maybeSingle()
      console.log('[Chat] Business via owner_id:', data, 'error:', error?.message)
      businessData = data
    }

    if (!businessData) {
      console.log('[Chat] No business found!')
      setLoading(false)
      return
    }

    console.log('[Chat] Final businessData:', businessData)
    setBusinessId(businessData.id)
    setCoachId(businessData.assigned_coach_id)

    // Load messages from messages table
    const { data: messagesData, error } = await supabase
      .from('messages')
      .select('*')
      .eq('business_id', businessData.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
    } else if (messagesData) {
      setMessages(messagesData)

      // Mark unread messages as read
      const unreadIds = messagesData
        .filter(m => !m.read && m.sender_id !== user.id)
        .map(m => m.id)

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadIds)
      }
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadMessages()

    // Subscribe to new messages
    const channel = supabase
      .channel('client-chat-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        const newMsg = payload.new as Message

        // Only add if it's for our business
        if (newMsg.business_id === businessId) {
          setMessages(prev => [...prev, newMsg])

          // Mark as read if from coach
          if (newMsg.sender_id !== userId && !newMsg.read) {
            await supabase
              .from('messages')
              .update({ read: true })
              .eq('id', newMsg.id)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadMessages, supabase, businessId, userId])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !businessId || !userId) return

    setSending(true)

    const { data: newMsg, error } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        sender_id: userId,
        sender_type: 'client',
        recipient_id: coachId,
        content: newMessage.trim(),
        read: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
    } else if (newMsg) {
      setMessages(prev => [...prev, newMsg])
      setNewMessage('')
    }

    setSending(false)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    return date.toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <ClientLayout>
      <div className="flex flex-col h-[calc(100svh-16rem)] sm:h-[calc(100vh-16rem)]">
        {/* Header */}
        <div className="bg-white rounded-t-lg border border-gray-200 border-b-0 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-orange-100 rounded-full flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Chat with Your Coach</h2>
              <p className="text-sm text-gray-600">
                {coachId ? 'Ask questions and get support' : 'No coach assigned yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-white border-x border-gray-200 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-brand-orange animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-16 h-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Messages Yet</h3>
              <p className="text-gray-600 max-w-md">
                Start a conversation with your coach. Ask questions, share updates, or request guidance.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => {
                const isFromCoach = message.sender_type === 'coach'
                return (
                  <div
                    key={message.id}
                    className={`flex ${isFromCoach ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`flex gap-3 max-w-2xl ${isFromCoach ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isFromCoach ? 'bg-brand-orange-100' : 'bg-brand-orange-100'
                      }`}>
                        {isFromCoach ? (
                          <Briefcase className="w-4 h-4 text-brand-orange" />
                        ) : (
                          <User className="w-4 h-4 text-brand-orange" />
                        )}
                      </div>
                      <div>
                        <div className={`rounded-lg px-4 py-3 ${
                          isFromCoach
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-brand-orange text-white'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-1 ${isFromCoach ? 'justify-start' : 'justify-end'}`}>
                          <span className="text-xs text-gray-500">
                            {formatTime(message.created_at)}
                          </span>
                          {!isFromCoach && message.read && (
                            <CheckCheck className="w-3 h-3 text-brand-orange-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={coachId ? "Type your message..." : "No coach assigned yet"}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              disabled={sending || !businessId || !coachId}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending || !businessId || !coachId}
              className="bg-brand-orange text-white px-6 py-2 rounded-lg shadow-sm font-medium hover:bg-brand-orange-600 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send
            </button>
          </div>
        </form>
      </div>
    </ClientLayout>
  )
}
