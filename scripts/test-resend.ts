/**
 * Test Resend email sending - new invitation template
 */

import { Resend } from 'resend'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const resend = new Resend(process.env.RESEND_API_KEY)

async function testEmail() {
  console.log('\nSending test invitation email with new template...\n')

  const to = 'mattmalouf@wisdomcoaching.com.au'
  const clientName = 'Matt'
  const coachName = 'Your Coach'
  const businessName = 'Test Business'
  const tempPassword = 'xK7#mP2$nQ9@bL4'
  const authLoginUrl = 'https://wisdombi.ai/auth/login'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f9fafb;">
      <div style="background-color: #ffffff; margin: 20px; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0d9488, #14b8a6); padding: 40px 20px; text-align: center;">
          <div style="display: inline-block; width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 16px; line-height: 60px; margin-bottom: 16px;">
            <span style="color: white; font-size: 28px; font-weight: bold;">W</span>
          </div>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Welcome to Wisdom BI</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Let's get started</p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
          <p style="font-size: 18px; color: #1f2937; margin: 0 0 16px 0;">Hi ${clientName},</p>

          <p style="color: #4b5563; margin: 0 0 24px 0;">
            Great news! <strong>${coachName}</strong> has set up your <strong>${businessName}</strong> dashboard on Wisdom BI.
            You now have a dedicated space to track your goals, monitor progress, and stay aligned with your coach.
          </p>

          <!-- Credentials Box -->
          <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Details</p>

            <div style="margin-bottom: 12px;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; font-weight: 500;">EMAIL</p>
              <p style="margin: 0; font-size: 16px; color: #1e293b; font-family: monospace; background: #fff; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0;">${to}</p>
            </div>

            <div>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; font-weight: 500;">TEMPORARY PASSWORD</p>
              <p style="margin: 0; font-size: 16px; color: #1e293b; font-family: monospace; background: #fff; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0;">${tempPassword}</p>
            </div>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="background-color: #0d9488; border-radius: 10px; padding: 16px 48px;">
                  <a href="${authLoginUrl}" style="color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                    Log In to Your Dashboard
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <!-- Security Note -->
          <p style="text-align: center; color: #64748b; font-size: 13px; margin: 0 0 24px 0;">
            You'll be prompted to set your own password on first login.
          </p>

          <!-- What's Next -->
          <div style="background: #f0fdfa; border-radius: 10px; padding: 20px; margin-top: 24px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; color: #0d9488; font-size: 14px;">What you can do:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px;">
              <li style="margin-bottom: 6px;">Set and track your quarterly goals</li>
              <li style="margin-bottom: 6px;">Monitor your key business metrics</li>
              <li style="margin-bottom: 6px;">Communicate directly with your coach</li>
              <li>Review your progress anytime</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">
            Questions? Just reply to this email.
          </p>
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">
            Wisdom Business Intelligence
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: 'Wisdom BI <noreply@mail.wisdombi.ai>',
      to,
      subject: `Welcome to Wisdom BI, ${clientName}`,
      html
    })

    if (error) {
      console.error('Resend error:', error)
    } else {
      console.log('SUCCESS! Email sent with ID:', data?.id)
    }
  } catch (err) {
    console.error('Exception:', err)
  }
}

testEmail()
