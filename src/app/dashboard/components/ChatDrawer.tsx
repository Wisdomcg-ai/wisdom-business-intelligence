'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X,
  Send,
  Loader2,
  MessageSquare,
  User,
  Briefcase,
  CheckCheck
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

interface ChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  businessId: string | null
  userId: string | null
  coachId: string | null
}

export default function ChatDrawer({
  isOpen,
  onClose,
  businessId,
  userId,
  coachId
}: ChatDrawerProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    if (!businessId) return

    setLoading(true)
    const { data: messagesData, error } = await supabase
      .from('messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
    } else if (messagesData) {
      setMessages(messagesData)

      // Mark unread messages as read
      if (userId) {
        const unreadIds = messagesData
          .filter(m => !m.read && m.sender_id !== userId)
          .map(m => m.id)

        if (unreadIds.length > 0) {
          await supabase
            .from('messages')
            .update({ read: true })
            .in('id', unreadIds)
        }
      }
    }

    setLoading(false)
  }, [supabase, businessId, userId])

  useEffect(() => {
    if (isOpen && businessId) {
      loadMessages()
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen, businessId, loadMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Real-time subscription
  useEffect(() => {
    if (!isOpen || !businessId) return

    const channel = supabase
      .channel('chat-drawer-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        const newMsg = payload.new as Message
        if (newMsg.business_id === businessId) {
          setMessages(prev => [...prev, newMsg])

          if (userId && newMsg.sender_id !== userId && !newMsg.read) {
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
  }, [isOpen, businessId, userId, supabase])

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
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(e)
    }
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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col"
        style={{ animation: 'slideIn 0.2s ease-out' }}
      >
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-orange to-brand-orange-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Coach Messages</h2>
              <p className="text-xs text-brand-orange-100">
                {coachId ? 'Your direct line to your coach' : 'No coach assigned yet'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-brand-orange animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading messages...</p>
              </div>
            </div>
          ) : !coachId ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <Briefcase className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Coach Assigned</h3>
              <p className="text-sm text-gray-500">
                You don&apos;t have a coach assigned yet. Contact support to get connected with a coach.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-brand-orange-100 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-brand-orange" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Start a Conversation</h3>
              <p className="text-sm text-gray-500">
                Send your first message to your coach. Ask questions, share updates, or request guidance.
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
                    <div className={`flex gap-2 max-w-[85%] ${isFromCoach ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isFromCoach ? 'bg-brand-orange-100' : 'bg-brand-orange-100'
                      }`}>
                        {isFromCoach ? (
                          <Briefcase className="w-4 h-4 text-brand-orange" />
                        ) : (
                          <User className="w-4 h-4 text-brand-orange" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className={`rounded-2xl px-4 py-2.5 ${
                          isFromCoach
                            ? 'bg-white border border-gray-200 text-gray-900 rounded-tl-md'
                            : 'bg-brand-orange text-white rounded-tr-md'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-1 px-1 ${isFromCoach ? 'justify-start' : 'justify-end'}`}>
                          <span className="text-[11px] text-gray-400">
                            {formatTime(message.created_at)}
                          </span>
                          {!isFromCoach && message.read && (
                            <CheckCheck className="w-3.5 h-3.5 text-brand-orange-500" />
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

        {/* Input - Fixed at bottom */}
        <div className="flex-shrink-0 p-4 bg-white border-t border-gray-200">
          <form onSubmit={sendMessage} className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={coachId ? "Type your message..." : "No coach assigned"}
                rows={1}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-orange focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
                disabled={sending || !businessId || !coachId}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim() || sending || !businessId || !coachId}
              className="flex-shrink-0 w-12 h-12 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-sm"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}
