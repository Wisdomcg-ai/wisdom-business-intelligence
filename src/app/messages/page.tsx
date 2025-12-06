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
import PageHeader from '@/components/ui/PageHeader'

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
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Messages"
        subtitle={coachId
          ? `Chat with ${coachName || 'your coach'}`
          : 'No coach assigned yet'}
        icon={MessageSquare}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col h-[calc(100vh-12rem)]">
            {/* Chat Header */}
            <div className="bg-white rounded-t-xl shadow-sm border border-gray-200 border-b-0 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-orange-100 rounded-full flex items-center justify-center">
                  <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    {coachName || 'Your Coach'}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {coachId ? 'Online' : 'Not assigned'}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 bg-white shadow-sm border-x border-gray-200 overflow-y-auto p-4 sm:p-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-brand-orange animate-spin" />
              </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 bg-brand-orange-100 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-brand-orange" />
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                    {coachId ? 'No Messages Yet' : 'No Coach Assigned'}
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 max-w-md mb-6">
                    {coachId
                      ? 'Start a conversation with your coach. Ask questions, share updates, or request guidance.'
                      : 'Once a coach is assigned to you, you can start chatting here.'}
                  </p>
                  {!coachId && (
                    <Link
                      href="/help"
                      className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-colors"
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
                        <div className={`flex gap-2 sm:gap-3 max-w-[85%] sm:max-w-2xl ${isFromCoach ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isFromCoach ? 'bg-brand-orange-100' : 'bg-gray-100'
                          }`}>
                            {isFromCoach ? (
                              <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-orange" />
                            ) : (
                              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-medium mb-1 ${isFromCoach ? 'text-left' : 'text-right'} text-gray-600`}>
                              {senderName}
                            </div>
                            <div className={`rounded-xl px-3 py-2 sm:px-4 sm:py-3 ${
                              isFromCoach
                                ? 'bg-brand-orange-50 text-gray-900 border border-brand-orange-100'
                                : 'bg-gray-900 text-white'
                            }`}>
                              {message.content && (
                                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                              )}

                              {/* Attachment */}
                              {message.attachment_url && (
                                <div className={`mt-2 ${message.content ? 'pt-2 border-t' : ''} ${
                                  isFromCoach ? 'border-brand-orange-200' : 'border-gray-700'
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
                                        className="max-w-full sm:max-w-xs rounded-lg hover:opacity-90 transition-opacity"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={message.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                        isFromCoach
                                          ? 'bg-brand-orange-100 hover:bg-brand-orange-200 text-brand-orange-800'
                                          : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                                      }`}
                                    >
                                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs sm:text-sm font-medium truncate">{message.attachment_name}</p>
                                        {message.attachment_size && (
                                          <p className={`text-xs ${isFromCoach ? 'text-brand-orange' : 'text-gray-400'}`}>
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

            {/* Attachment Preview */}
            {attachment && (
              <div className="bg-white shadow-sm border-x border-gray-200 px-4 py-2">
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
              <div className="bg-white shadow-sm border-x border-gray-200 px-4 py-2">
                <div className="p-2 bg-red-50 text-red-700 text-sm rounded-lg">
                  {uploadError}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} className="bg-white rounded-b-xl shadow-sm border border-gray-200 border-t-0 p-4 sm:p-6">
              <div className="flex gap-2 sm:gap-3 items-end">
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
                  className="p-2 sm:p-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={coachId ? "Type your message..." : "No coach assigned yet"}
                  className="flex-1 px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  disabled={sending || !businessId || !coachId}
                />
                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !attachment) || sending || !businessId || !coachId}
                  className="bg-brand-orange hover:bg-brand-orange-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
    </div>
  )
}
