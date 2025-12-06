'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConversationList, type Conversation } from '@/components/coach/messages/ConversationList'
import { MessageThread, type Message } from '@/components/coach/messages/MessageThread'
import { MessageComposer } from '@/components/coach/messages/MessageComposer'
import { BroadcastModal } from '@/components/coach/messages/BroadcastModal'
import { uploadMessageAttachment } from '@/lib/services/messageAttachments'
import PageHeader from '@/components/ui/PageHeader'
import {
  Loader2,
  MessageSquare,
  Radio
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  industry?: string
  status: string
}

export default function MessagesPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)

  // Message templates
  const messageTemplates = [
    {
      id: '1',
      name: 'Session Reminder',
      content: 'Hi! Just a friendly reminder about our upcoming coaching session. Looking forward to speaking with you.'
    },
    {
      id: '2',
      name: 'Action Follow-up',
      content: 'Hi! I wanted to check in on the action items we discussed in our last session. How are you progressing?'
    },
    {
      id: '3',
      name: 'Weekly Check-in',
      content: 'Hi! Hope you\'re having a productive week. Is there anything you\'d like to discuss before our next session?'
    }
  ]

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.businessId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id])

  async function loadData() {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      // Load businesses (clients)
      const { data: businessesData } = await supabase
        .from('businesses')
        .select('id, business_name, industry, status')
        .eq('assigned_coach_id', user.id)
        .order('business_name')

      if (businessesData) {
        setClients(businessesData.map(b => ({
          id: b.id,
          businessName: b.business_name || 'Unnamed',
          industry: b.industry || undefined,
          status: b.status || 'active'
        })))
      }

      // Load conversations (aggregate messages by business)
      // First get all businesses for this coach
      if (!businessesData || businessesData.length === 0) {
        setLoading(false)
        return
      }

      const businessIds = businessesData.map(b => b.id)

      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .in('business_id', businessIds)
        .order('created_at', { ascending: false })

      // Group by business_id and get latest message per conversation
      const conversationMap = new Map<string, Conversation>()

      // Initialize conversations from businesses
      businessesData.forEach(b => {
        conversationMap.set(b.id, {
          id: b.id,
          businessId: b.id,
          businessName: b.business_name || 'Unknown',
          lastMessage: '',
          lastMessageAt: '',
          unreadCount: 0,
          isStarred: false,
          isArchived: false
        })
      })

      // Update with message data
      if (messagesData) {
        messagesData.forEach(msg => {
          if (!msg.business_id) return

          const existing = conversationMap.get(msg.business_id)

          if (existing) {
            // Set last message if this is the most recent
            if (!existing.lastMessageAt || msg.created_at > existing.lastMessageAt) {
              existing.lastMessage = msg.content || ''
              existing.lastMessageAt = msg.created_at
            }
            // Count unread from clients
            if (!msg.read && msg.sender_type !== 'coach') {
              existing.unreadCount++
            }
          }
        })
      }

      // Filter to only show conversations with messages
      const conversationsWithMessages = Array.from(conversationMap.values())
        .filter(c => c.lastMessageAt)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      setConversations(conversationsWithMessages)

      // Auto-select first conversation if none selected
      if (!selectedConversation && conversationsWithMessages.length > 0) {
        setSelectedConversation(conversationsWithMessages[0])
      }

    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(businessId: string) {
    try {
      setLoadingMessages(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })

      if (messagesData) {
        setMessages(messagesData.map(msg => ({
          id: msg.id,
          content: msg.content || '',
          senderId: msg.sender_id || '',
          senderName: msg.sender_type === 'coach' ? 'You' : 'Client',
          senderType: msg.sender_type === 'coach' ? 'coach' as const : 'client' as const,
          createdAt: msg.created_at,
          status: msg.read ? 'read' as const : 'delivered' as const,
          attachmentUrl: msg.attachment_url,
          attachmentName: msg.attachment_name,
          attachmentSize: msg.attachment_size,
          attachmentType: msg.attachment_type
        })))

        // Mark messages as read
        const unreadIds = messagesData
          .filter(m => !m.read && m.sender_id !== user.id)
          .map(m => m.id)

        if (unreadIds.length > 0) {
          await supabase
            .from('messages')
            .update({ read: true })
            .in('id', unreadIds)
        }

        // Update conversation unread count
        setConversations(prev => prev.map(conv =>
          conv.businessId === businessId
            ? { ...conv, unreadCount: 0 }
            : conv
        ))
      }

    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!selectedConversation || !currentUserId) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get business owner for recipient
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', selectedConversation.businessId)
      .single()

    // Prepare message data
    const messageData: any = {
      business_id: selectedConversation.businessId,
      sender_id: user.id,
      sender_type: 'coach',
      recipient_id: business?.owner_id || null,
      content,
      read: false
    }

    // Upload attachment if present
    if (attachments && attachments.length > 0) {
      const file = attachments[0] // Handle first attachment
      try {
        const attachmentData = await uploadMessageAttachment(file, selectedConversation.businessId)
        messageData.attachment_url = attachmentData.url
        messageData.attachment_name = attachmentData.name
        messageData.attachment_size = attachmentData.size
        messageData.attachment_type = attachmentData.type
      } catch (err) {
        console.error('Error uploading attachment:', err)
        throw new Error('Failed to upload attachment')
      }
    }

    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
      throw error
    }

    // Add to local state
    if (newMessage) {
      setMessages(prev => [...prev, {
        id: newMessage.id,
        content: newMessage.content,
        senderId: user.id,
        senderName: 'You',
        senderType: 'coach',
        createdAt: newMessage.created_at,
        status: 'sent',
        attachmentUrl: newMessage.attachment_url,
        attachmentName: newMessage.attachment_name,
        attachmentSize: newMessage.attachment_size,
        attachmentType: newMessage.attachment_type
      }])

      // Update conversation
      setConversations(prev => prev.map(conv =>
        conv.businessId === selectedConversation.businessId
          ? { ...conv, lastMessage: content || 'Sent an attachment', lastMessageAt: newMessage.created_at }
          : conv
      ))
    }
  }

  const handleBroadcastSend = async (clientIds: string[], message: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Send message to each client
    const promises = clientIds.map(async (businessId) => {
      const { data: business } = await supabase
        .from('businesses')
        .select('owner_id')
        .eq('id', businessId)
        .single()

      return supabase
        .from('messages')
        .insert({
          business_id: businessId,
          sender_id: user.id,
          sender_type: 'coach',
          recipient_id: business?.owner_id || null,
          content: message,
          read: false
        })
    })

    await Promise.all(promises)

    // Reload conversations
    await loadData()
  }

  const handleToggleStar = (conversationId: string) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, isStarred: !conv.isStarred }
        : conv
    ))
  }

  // Stats
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">Loading messages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Container with consistent width */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <PageHeader
          title="Messages"
          subtitle={`${conversations.length} conversations · ${totalUnread} unread`}
          icon={MessageSquare}
          actions={
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors"
            >
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">Broadcast</span>
            </button>
          }
          variant="simple"
        />

        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-280px)] sm:h-[calc(100vh-240px)] flex flex-col sm:flex-row">
          {/* Conversation List */}
          <div className="w-full sm:w-80 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200">
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversation?.id}
              onSelect={setSelectedConversation}
              onToggleStar={handleToggleStar}
            />
          </div>

          {/* Message Thread */}
          <div className="flex-1 flex flex-col bg-gray-50">
            {selectedConversation ? (
              <>
                {loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-orange" />
                  </div>
                ) : (
                  <MessageThread
                    messages={messages}
                    businessId={selectedConversation.businessId}
                    businessName={selectedConversation.businessName}
                    currentUserId={currentUserId}
                  />
                )}
                <MessageComposer
                  onSend={handleSendMessage}
                  templates={messageTemplates}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-1">No conversation selected</h3>
                  <p className="text-sm sm:text-base text-gray-500">
                    Select a conversation from the list to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Broadcast Modal */}
      <BroadcastModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        onSend={handleBroadcastSend}
        clients={clients}
      />
    </div>
  )
}
