import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/resend'

// Brand colors for email
const BRAND_ORANGE = '#F5821F'
const BRAND_NAVY = '#172238'
const LOGO_URL = 'https://wisdombi.ai/images/logo-main.png'

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()

  try {
    // Get all coaches
    const { data: coaches } = await supabase
      .from('system_roles')
      .select('user_id, users!inner(id, email, first_name, last_name)')
      .in('role', ['coach', 'super_admin'])

    if (!coaches || coaches.length === 0) {
      return NextResponse.json({ message: 'No coaches found', sent: 0 })
    }

    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Week boundaries for "this week" sessions
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    let sentCount = 0
    const errors: string[] = []

    for (const coach of coaches) {
      try {
        const coachUser = (coach as any).users
        if (!coachUser?.email) continue

        const coachId = coach.user_id
        const coachName = coachUser.first_name
          ? `${coachUser.first_name} ${coachUser.last_name || ''}`.trim()
          : coachUser.email.split('@')[0]

        // Get coach's clients
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id, business_name, status, owner_id')
          .eq('assigned_coach_id', coachId)

        if (!businesses || businesses.length === 0) continue

        const businessIds = businesses.map(b => b.id)
        const ownerIds = businesses.map(b => b.owner_id).filter(Boolean) as string[]

        // Parallel queries for digest data
        const [
          sessionsResult,
          actionsResult,
          loginsResult,
          messagesResult
        ] = await Promise.all([
          // This week's sessions
          supabase
            .from('coaching_sessions')
            .select('id, business_id, scheduled_at, status')
            .eq('coach_id', coachId)
            .gte('scheduled_at', monday.toISOString())
            .lte('scheduled_at', sunday.toISOString())
            .order('scheduled_at', { ascending: true }),

          // All pending + overdue actions
          businessIds.length > 0
            ? supabase
                .from('session_actions')
                .select('id, business_id, status, due_date')
                .in('business_id', businessIds)
                .eq('status', 'pending')
            : Promise.resolve({ data: [] }),

          // Recent logins
          ownerIds.length > 0
            ? supabase
                .from('users')
                .select('id, last_login_at')
                .in('id', ownerIds)
            : Promise.resolve({ data: [] }),

          // Unread messages
          businessIds.length > 0
            ? supabase
                .from('messages')
                .select('id, business_id', { count: 'exact', head: true })
                .in('business_id', businessIds)
                .eq('read', false)
                .neq('sender_id', coachId)
            : Promise.resolve({ data: null, count: 0 })
        ])

        // Process data
        const sessions = sessionsResult.data || []
        const upcomingSessions = sessions.filter(s => s.status === 'scheduled')
        const completedSessions = sessions.filter(s => s.status === 'completed')

        const pendingActions = actionsResult.data || []
        const overdueActions = pendingActions.filter(a => {
          if (!a.due_date) return false
          return new Date(a.due_date) < now
        })

        // Clients needing attention
        const clientsNeedingAttention: { name: string; reason: string }[] = []

        const loginMap = new Map<string, string>()
        loginsResult.data?.forEach((u: any) => {
          if (u.last_login_at) loginMap.set(u.id, u.last_login_at)
        })

        for (const biz of businesses) {
          if (biz.status !== 'active') continue
          const lastLogin = biz.owner_id ? loginMap.get(biz.owner_id) : null
          if (!lastLogin) {
            clientsNeedingAttention.push({ name: biz.business_name || 'Unnamed', reason: 'Never logged in' })
          } else {
            const daysSince = Math.floor((now.getTime() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24))
            if (daysSince > 14) {
              clientsNeedingAttention.push({ name: biz.business_name || 'Unnamed', reason: `No login in ${daysSince} days` })
            }
          }

          // Check for overdue actions per client
          const clientOverdue = overdueActions.filter(a => a.business_id === biz.id)
          if (clientOverdue.length >= 3) {
            clientsNeedingAttention.push({ name: biz.business_name || 'Unnamed', reason: `${clientOverdue.length} overdue actions` })
          }
        }

        const unreadMessages = (messagesResult as any).count || 0

        // Build email HTML
        const html = buildDigestEmail({
          coachName,
          totalClients: businesses.filter(b => b.status === 'active').length,
          upcomingSessions: upcomingSessions.length,
          completedSessionsThisWeek: completedSessions.length,
          pendingActionsCount: pendingActions.length,
          overdueActionsCount: overdueActions.length,
          unreadMessages,
          clientsNeedingAttention,
          sessions: upcomingSessions.map(s => {
            const biz = businesses.find(b => b.id === s.business_id)
            return {
              clientName: biz?.business_name || 'Unknown',
              date: new Date(s.scheduled_at).toLocaleDateString('en-AU', {
                timeZone: 'Australia/Sydney',
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              }),
              time: new Date(s.scheduled_at).toLocaleTimeString('en-AU', {
                timeZone: 'Australia/Sydney',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
            }
          })
        })

        const result = await sendEmail({
          to: coachUser.email,
          subject: `Your Weekly Coaching Digest — ${now.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}`,
          html
        })

        if (result.success) {
          sentCount++
        } else {
          errors.push(`Failed for ${coachUser.email}: ${result.error}`)
        }
      } catch (coachError) {
        errors.push(`Error processing coach ${coach.user_id}: ${coachError}`)
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('[Weekly Digest] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildDigestEmail(data: {
  coachName: string
  totalClients: number
  upcomingSessions: number
  completedSessionsThisWeek: number
  pendingActionsCount: number
  overdueActionsCount: number
  unreadMessages: number
  clientsNeedingAttention: { name: string; reason: string }[]
  sessions: { clientName: string; date: string; time: string }[]
}): string {
  const attentionRows = data.clientsNeedingAttention.length > 0
    ? data.clientsNeedingAttention.map(c => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${c.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #dc2626;">${c.reason}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" style="padding: 12px; color: #6b7280; text-align: center;">All clients are on track</td></tr>'

  const sessionRows = data.sessions.length > 0
    ? data.sessions.map(s => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${s.clientName}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6;">${s.date}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6;">${s.time}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 12px; color: #6b7280; text-align: center;">No sessions scheduled this week</td></tr>'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: ${BRAND_NAVY}; padding: 24px; text-align: center;">
          <img src="${LOGO_URL}" alt="WisdomBI" style="max-width: 150px; height: auto; margin-bottom: 12px;" />
          <h1 style="color: white; margin: 0; font-size: 20px;">Weekly Coaching Digest</h1>
        </div>

        <div style="padding: 24px;">
          <p style="margin-top: 0;">Hi ${data.coachName},</p>
          <p>Here's your weekly summary across ${data.totalClients} active client${data.totalClients !== 1 ? 's' : ''}.</p>

          <!-- Stats Grid -->
          <div style="display: flex; gap: 12px; margin: 20px 0; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 120px; background: #fff8f1; border: 1px solid #fcd5b8; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${BRAND_ORANGE};">${data.upcomingSessions}</div>
              <div style="font-size: 12px; color: #92400e;">Sessions This Week</div>
            </div>
            <div style="flex: 1; min-width: 120px; background: ${data.overdueActionsCount > 0 ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${data.overdueActionsCount > 0 ? '#fecaca' : '#bbf7d0'}; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${data.overdueActionsCount > 0 ? '#dc2626' : '#16a34a'};">${data.overdueActionsCount}</div>
              <div style="font-size: 12px; color: ${data.overdueActionsCount > 0 ? '#991b1b' : '#166534'};">Overdue Actions</div>
            </div>
            <div style="flex: 1; min-width: 120px; background: #f4f6f9; border: 1px solid #cdd7e5; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${BRAND_NAVY};">${data.unreadMessages}</div>
              <div style="font-size: 12px; color: #374151;">Unread Messages</div>
            </div>
          </div>

          ${data.clientsNeedingAttention.length > 0 ? `
          <!-- Clients Needing Attention -->
          <div style="margin: 24px 0;">
            <h3 style="color: ${BRAND_NAVY}; font-size: 16px; margin-bottom: 8px;">⚠️ Clients Needing Attention</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Client</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Reason</th>
                </tr>
              </thead>
              <tbody>${attentionRows}</tbody>
            </table>
          </div>
          ` : ''}

          <!-- Upcoming Sessions -->
          <div style="margin: 24px 0;">
            <h3 style="color: ${BRAND_NAVY}; font-size: 16px; margin-bottom: 8px;">📅 Sessions This Week</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Client</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Date</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Time</th>
                </tr>
              </thead>
              <tbody>${sessionRows}</tbody>
            </table>
          </div>

          <!-- Quick Stats -->
          <div style="margin: 24px 0; padding: 16px; background: #f9fafb; border-radius: 8px;">
            <h3 style="color: ${BRAND_NAVY}; font-size: 16px; margin-top: 0; margin-bottom: 12px;">📊 This Week's Numbers</h3>
            <div style="font-size: 14px; color: #4b5563;">
              <p style="margin: 4px 0;">✅ ${data.pendingActionsCount} pending actions across all clients</p>
              <p style="margin: 4px 0;">💬 ${data.unreadMessages} unread message${data.unreadMessages !== 1 ? 's' : ''}</p>
              <p style="margin: 4px 0;">📆 ${data.upcomingSessions} session${data.upcomingSessions !== 1 ? 's' : ''} scheduled</p>
            </div>
          </div>

          <!-- CTA -->
          <div style="text-align: center; margin: 24px 0;">
            <a href="https://wisdombi.ai/coach/dashboard" style="display: inline-block; background: ${BRAND_ORANGE}; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Open Dashboard
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">
            WisdomBI — Weekly Coaching Digest<br>
            Sent every Monday at 7:00 AM AEST
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}
