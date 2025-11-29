# Supabase Edge Functions - Email Notifications

This directory contains Supabase Edge Functions for the Business Coaching Platform notification system.

## Functions

### 1. `send-notifications`
**Purpose:** Sends email notifications via Resend API
**Schedule:** Every 15 minutes
**What it does:**
- Fetches all unsent notifications from the `notifications` table
- Groups notifications by user
- Checks user notification preferences
- Sends emails via Resend API
- Marks notifications as sent

### 2. `check-session-reminders`
**Purpose:** Creates reminder notifications for upcoming sessions
**Schedule:** Every hour
**What it does:**
- Finds sessions scheduled in 24 hours
- Creates reminder notifications for clients
- Avoids duplicates by checking existing notifications

### 3. `check-actions-due`
**Purpose:** Creates reminder notifications for actions due soon
**Schedule:** Once daily (9 AM)
**What it does:**
- Finds open actions due in 3 days
- Creates reminder notifications for clients
- Avoids duplicates by checking existing notifications

## Setup Instructions

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Link to your Supabase project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Set environment variables

You need to set the following secrets in your Supabase project:

```bash
# Get a Resend API key from https://resend.com
supabase secrets set RESEND_API_KEY=re_your_api_key_here
```

The following are automatically available in Edge Functions:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-injected)

### 4. Deploy the functions

Deploy all functions:
```bash
supabase functions deploy send-notifications
supabase functions deploy check-session-reminders
supabase functions deploy check-actions-due
```

Or deploy individually:
```bash
supabase functions deploy send-notifications
```

### 5. Set up Cron Jobs

In your Supabase Dashboard, go to Database > Cron Jobs and create these schedules:

#### Send Notifications (Every 15 minutes)
```sql
SELECT cron.schedule(
  'send-notifications-every-15-min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

#### Check Session Reminders (Every hour)
```sql
SELECT cron.schedule(
  'check-session-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-session-reminders',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

#### Check Actions Due (Daily at 9 AM)
```sql
SELECT cron.schedule(
  'check-actions-due-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-actions-due',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

### 6. Configure Resend Domain

1. Sign up at [Resend.com](https://resend.com)
2. Add and verify your domain (e.g., `yourdomain.com`)
3. Update the `from` address in `send-notifications/index.ts`:
   ```typescript
   from: 'Business Coaching Platform <notifications@yourdomain.com>'
   ```

## Testing Functions Locally

Run functions locally for testing:

```bash
# Start local Supabase
supabase start

# Serve a specific function
supabase functions serve send-notifications --env-file ./supabase/.env.local

# Test with curl
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-notifications' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'
```

Create a `.env.local` file in `supabase/` directory:
```
RESEND_API_KEY=re_your_test_api_key
```

## Manual Testing

You can manually trigger functions via HTTP:

```bash
# Trigger send-notifications
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Trigger check-session-reminders
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-session-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Trigger check-actions-due
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-actions-due \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Monitoring

View function logs in the Supabase Dashboard:
- Go to Edge Functions → Select function → Logs

Or via CLI:
```bash
supabase functions logs send-notifications
```

## Environment Variables

Required environment variables (set via `supabase secrets set`):
- `RESEND_API_KEY` - Your Resend API key

Auto-injected by Supabase:
- `SUPABASE_URL` - Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

## Troubleshooting

### Function fails with authentication error
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is available (it's auto-injected)
- Check that your Supabase project is correctly linked

### Emails not sending
- Verify your Resend API key is correct: `supabase secrets list`
- Check that your domain is verified in Resend
- View function logs for specific error messages
- Ensure notification preferences allow emails

### Duplicate notifications
- The functions check for existing notifications before creating new ones
- If you see duplicates, check the `metadata` field matching logic

### Cron jobs not running
- Verify cron jobs are enabled in Supabase Dashboard
- Check the cron job schedule syntax
- Ensure `pg_cron` and `pg_net` extensions are enabled

## Architecture

```
User Action (e.g., session created)
  ↓
API creates notification record in DB
  ↓
Cron triggers send-notifications function (every 15 min)
  ↓
Function fetches unsent notifications
  ↓
Function sends email via Resend
  ↓
Function marks notification as sent
  ↓
User receives email
```

## Cost Considerations

- **Resend:** Free tier includes 3,000 emails/month
- **Supabase Edge Functions:** Free tier includes 500,000 invocations/month
- **Supabase Database:** Notifications table will grow over time - consider archiving old notifications

## Next Steps

- [ ] Customize email templates in `send-notifications/index.ts`
- [ ] Add more notification types as needed
- [ ] Implement notification preferences UI in settings
- [ ] Add weekly summary emails
- [ ] Archive old notifications (90+ days)
