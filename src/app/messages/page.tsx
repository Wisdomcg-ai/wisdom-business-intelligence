'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare,
  Send,
  User,
  Briefcase,
  CheckCheck,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Download,
  Mail
} from 'lucide-react'
import Link from 'next/link'
import { uploadMessageAttachment, formatFileSize, isAllowedFileType } from '@/lib/services/messageAttachments'

interface Message {
  id: string
  business_id: string
  content: string
  sender_id: string
  sender_type: string
  recipient_id: string | null
  created_at: string
  read: boolean
  attachment_url?: string
  attachment_name?: string
  attachment_size?: number
  attachment_type?: string
}

export default function MessagesPage() {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserId(user.id)

    // Set default name - profiles table doesn't have name fields
    setUserName('You')

    // First try to get business via business_users join table
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let businessData = null

    if (businessUser) {
      const { data } = await supabase
        .from('businesses')
        .select('id, assigned_coach_id')
        .eq('id', businessUser.business_id)
        .maybeSingle()
      businessData = data
    } else {
      // Fallback: try direct owner_id lookup
      const { data } = await supabase
        .from('businesses')
        .select('id, assigned_coach_id')
        .eq('owner_id', user.id)
        .maybeSingle()
      businessData = data
    }

    if (!businessData) {
      setLoading(false)
      return
    }

    setBusinessId(businessData.id)
    setCoachId(businessData.assigned_coach_id)

    // Set coach name - profiles table doesn't have name fields
    if (businessData.assigned_coach_id) {
      setCoachName('Your Coach')
    }

    // Load messages
    const { data: messagesData, error } = await supabase
      .from('messages')
      .select('*')
      .eq('business_id', businessData.id)
      .order('created_at', { ascending: true })

    if (!error && messagesData) {
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
      .channel('messages-page-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        const newMsg = payload.new as Message

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)

    // Validate file
    if (!isAllowedFileType(file)) {
      setUploadError('File type not allowed. Please use documents, images, or PDFs.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 10MB.')
      return
    }

    setAttachment(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = () => {
    setAttachment(null)
    setUploadError(null)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if ((!newMessage.trim() && !attachment) || !businessId || !userId) return

    setSending(true)
    setUploadError(null)

    try {
      let attachmentData = null

      // Upload attachment if present
      if (attachment) {
        try {
          attachmentData = await uploadMessageAttachment(attachment, businessId)
        } catch (err: any) {
          setUploadError(err.message || 'Failed to upload file')
          setSending(false)
          return
        }
      }

      // Create message
      const messageData: any = {
        business_id: businessId,
        sender_id: userId,
        sender_type: 'client',
        recipient_id: coachId,
        content: newMessage.trim(),
        read: false
      }

      // Add attachment fields if present
      if (attachmentData) {
        messageData.attachment_url = attachmentData.url
        messageData.attachment_name = attachmentData.name
        messageData.attachment_size = attachmentData.size
        messageData.attachment_type = attachmentData.type
      }

      const { data: newMsg, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single()

      if (!error && newMsg) {
        setMessages(prev => [...prev, newMsg])
        setNewMessage('')
        setAttachment(null)
      }
    } catch (err) {
      console.error('Error sending message:', err)
      setUploadError('Failed to send message')
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

  const isImageAttachment = (type?: string) => {
    return type?.startsWith('image/')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col h-[calc(100vh-8rem)]">
          {/* Header */}
          <div className="bg-white rounded-t-xl border border-gray-200 border-b-0 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
                <p className="text-sm text-gray-600">
                  {coachId
                    ? `Chat with ${coachName || 'your coach'}`
                    : 'No coach assigned yet'}
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 bg-white border-x border-gray-200 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-teal-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {coachId ? 'No Messages Yet' : 'No Coach Assigned'}
                </h3>
                <p className="text-gray-600 max-w-md mb-6">
                  {coachId
                    ? 'Start a conversation with your coach. Ask questions, share updates, or request guidance.'
                    : 'Once a coach is assigned to you, you can start chatting here.'}
                </p>
                {!coachId && (
                  <Link
                    href="/help"
                    className="inline-flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors"
                  >
                    <Mail className="w-5 h-5" />
                    Contact Support
                  </Link>
                )}
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const isFromCoach = message.sender_type === 'coach'
                  const senderName = isFromCoach ? (coachName || 'Coach') : (userName || 'You')
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isFromCoach ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className={`flex gap-3 max-w-2xl ${isFromCoach ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isFromCoach ? 'bg-teal-100' : 'bg-gray-100'
                        }`}>
                          {isFromCoach ? (
                            <Briefcase className="w-4 h-4 text-teal-600" />
                          ) : (
                            <User className="w-4 h-4 text-gray-600" />
                          )}
                        </div>
                        <div>
                          <div className={`text-xs font-medium mb-1 ${isFromCoach ? 'text-left' : 'text-right'} text-gray-600`}>
                            {senderName}
                          </div>
                          <div className={`rounded-xl px-4 py-3 ${
                            isFromCoach
                              ? 'bg-teal-50 text-gray-900 border border-teal-100'
                              : 'bg-gray-900 text-white'
                          }`}>
                            {message.content && (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            )}

                            {/* Attachment */}
                            {message.attachment_url && (
                              <div className={`mt-2 ${message.content ? 'pt-2 border-t' : ''} ${
                                isFromCoach ? 'border-teal-200' : 'border-gray-700'
                              }`}>
                                {isImageAttachment(message.attachment_type) ? (
                                  <a
                                    href={message.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={message.attachment_url}
                                      alt={message.attachment_name || 'Attached image'}
                                      className="max-w-xs rounded-lg hover:opacity-90 transition-opacity"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={message.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                      isFromCoach
                                        ? 'bg-teal-100 hover:bg-teal-200 text-teal-800'
                                        : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                                    }`}
                                  >
                                    <FileText className="w-5 h-5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{message.attachment_name}</p>
                                      {message.attachment_size && (
                                        <p className={`text-xs ${isFromCoach ? 'text-teal-600' : 'text-gray-400'}`}>
                                          {formatFileSize(message.attachment_size)}
                                        </p>
                                      )}
                                    </div>
                                    <Download className="w-4 h-4 flex-shrink-0" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 mt-1 ${isFromCoach ? 'justify-start' : 'justify-end'}`}>
                            <span className="text-xs text-gray-500">
                              {formatTime(message.created_at)}
                            </span>
                            {!isFromCoach && message.read && (
                              <CheckCheck className="w-3 h-3 text-teal-500" />
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

          {/* Attachment Preview */}
          {attachment && (
            <div className="bg-white border-x border-gray-200 px-4 py-2">
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
                {attachment.type.startsWith('image/') ? (
                  <ImageIcon className="w-5 h-5 text-gray-500" />
                ) : (
                  <FileText className="w-5 h-5 text-gray-500" />
                )}
                <span className="flex-1 text-sm text-gray-700 truncate">{attachment.name}</span>
                <span className="text-xs text-gray-500">{formatFileSize(attachment.size)}</span>
                <button
                  onClick={removeAttachment}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {uploadError && (
            <div className="bg-white border-x border-gray-200 px-4 py-2">
              <div className="p-2 bg-red-50 text-red-700 text-sm rounded-lg">
                {uploadError}
              </div>
            </div>
          )}

          {/* Input */}
          <form onSubmit={sendMessage} className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-4">
            <div className="flex gap-3 items-end">
              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || !businessId || !coachId}
                className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={coachId ? "Type your message..." : "No coach assigned yet"}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={sending || !businessId || !coachId}
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !attachment) || sending || !businessId || !coachId}
                className="bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
