import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create a service role client for notification creation
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export interface CreateNotificationParams {
  userId: string
  businessId?: string
  type: 'session_reminder' | 'chat_message' | 'action_due' | 'document_shared' | 'welcome' | 'action_completed'
  title: string
  message: string
  link?: string
  metadata?: Record<string, any>
}

/**
 * Create a notification for a user
 * This will be queued for email sending by the Edge Function
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: params.userId,
        business_id: params.businessId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        metadata: params.metadata
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return { success: false, error }
    }

    return { success: true, notification: data }
  } catch (error) {
    console.error('Exception creating notification:', error)
    return { success: false, error }
  }
}

/**
 * Create a session reminder notification (24 hours before)
 */
export async function notifySessionReminder(userId: string, sessionId: string, sessionTitle: string, scheduledAt: Date) {
  return createNotification({
    userId,
    type: 'session_reminder',
    title: 'Upcoming Coaching Session',
    message: `You have a coaching session "${sessionTitle}" scheduled for ${scheduledAt.toLocaleString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}.`,
    link: `/client/sessions?session=${sessionId}`,
    metadata: { session_id: sessionId }
  })
}

/**
 * Create a new chat message notification
 */
export async function notifyChatMessage(userId: string, businessId: string, senderName: string, messagePreview: string) {
  return createNotification({
    userId,
    businessId,
    type: 'chat_message',
    title: `New message from ${senderName}`,
    message: messagePreview.length > 100 ? messagePreview.substring(0, 100) + '...' : messagePreview,
    link: `/client/chat`,
    metadata: { sender_name: senderName }
  })
}

/**
 * Create an action item due soon notification
 */
export async function notifyActionDue(userId: string, businessId: string, actionText: string, dueDate: Date, actionId: string) {
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return createNotification({
    userId,
    businessId,
    type: 'action_due',
    title: 'Action Item Due Soon',
    message: `"${actionText}" is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
    link: `/client/actions`,
    metadata: { action_id: actionId, due_date: dueDate.toISOString() }
  })
}

/**
 * Create a new document shared notification
 */
export async function notifyDocumentShared(userId: string, businessId: string, fileName: string, folder: string) {
  return createNotification({
    userId,
    businessId,
    type: 'document_shared',
    title: 'New Document Shared',
    message: `Your coach has shared a new document: "${fileName}" in the ${folder} folder.`,
    link: `/client/documents`,
    metadata: { file_name: fileName, folder }
  })
}

/**
 * Create a welcome notification for new clients
 */
export async function notifyWelcome(userId: string, businessId: string, businessName: string) {
  return createNotification({
    userId,
    businessId,
    type: 'welcome',
    title: 'Welcome to Business Coaching Platform',
    message: `Welcome aboard! Your coaching journey for ${businessName} starts here. Your coach will be in touch soon to schedule your first session.`,
    link: `/client/dashboard`,
    metadata: { business_name: businessName }
  })
}

/**
 * Notify coach when client completes an action
 */
export async function notifyCoachActionCompleted(coachId: string, businessId: string, actionText: string, clientName: string) {
  return createNotification({
    userId: coachId,
    businessId,
    type: 'action_completed',
    title: 'Client Completed Action',
    message: `${clientName} completed: "${actionText}"`,
    link: `/coach/clients/${businessId}`,
    metadata: { client_name: clientName, action_text: actionText }
  })
}
