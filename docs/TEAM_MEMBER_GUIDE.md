# Team Member Access Guide

## Overview

This guide explains how team member access works in the business coaching platform.

---

## Adding a Team Member

1. Go to **Settings → Team**
2. Click **"Invite Team Member"**
3. Enter the team member's email address
4. Select their role (Admin, Member, or Viewer)
5. Configure section permissions
6. Click **"Send Invite"**

The team member will receive an email with a link to accept the invitation.

---

## Roles

| Role | Access Level | Can Manage Team |
|------|--------------|-----------------|
| **Owner** | Full access to everything | ✅ Yes |
| **Admin** | Full access based on permissions | ✅ Yes |
| **Member** | Edit access based on permissions | ❌ No |
| **Viewer** | Read-only access based on permissions | ❌ No |

### Role Details

**Owner**
- The business owner has full access to everything
- Cannot be removed from the business
- Only one owner per business

**Admin**
- Full access to all sections (regardless of permission settings)
- Can invite and manage other team members
- Can change team member roles and permissions

**Member**
- Can view and edit data based on section permissions
- Cannot manage team members
- Cannot change settings

**Viewer**
- Read-only access based on section permissions
- Cannot edit any data
- Cannot manage team members

---

## Section Permissions

Each team member (Member or Viewer role) can have granular access to different sections:

| Section | Description |
|---------|-------------|
| **Dashboard** | Main dashboard view |
| **Business Plan** | Roadmap, Vision, SWOT, Goals |
| **Finances** | Financial Forecast, Budget vs Actual, Cashflow |
| **Execute** | KPIs, Weekly Review, Issues, Ideas, Productivity |
| **Business Engines** | Marketing, Team, Systems |
| **Review** | Quarterly Reviews |
| **Coaching** | Messages, Session Notes |

### Default Permissions

New team members get these defaults:
- ✅ Dashboard
- ✅ Business Plan
- ✅ Execute
- ✅ Business Engines
- ✅ Review
- ✅ Coaching
- ❌ Finances (disabled by default)
- ❌ Team Settings (disabled by default)

---

## Invite Flow

```
1. Owner/Admin sends invite
        ↓
2. Email sent to team member
        ↓
3. Team member clicks link
        ↓
4. Team member creates account (or logs in)
        ↓
5. Invite accepted - team member can access business
```

### Invite Expiration

- Invites expire after **7 days**
- Admins can resend invites up to **3 times**
- Expired invites must be re-sent

---

## Troubleshooting

### "Access Denied" Error

1. Check that the user has the correct role
2. Verify their section permissions in Team Settings
3. Ensure their status is "active" (not "invited" or "removed")

### User Can't Login

1. Verify the user exists in the system
2. Check if their email matches exactly (case-sensitive)
3. Try the password reset flow

### User Can't See Expected Data

1. Check their section permissions
2. Verify they're accessing the correct business
3. For Members/Viewers, confirm the section is enabled

### Invite Not Received

1. Check spam/junk folder
2. Verify the email address is correct
3. Resend the invite from Team Settings
4. Check if maximum resends (3) has been reached

---

## For Developers

### Permission Checking

Server-side permission checks are handled in `src/lib/permissions/server.ts`:

```typescript
import { requirePermission } from '@/lib/permissions/server';

// In API route
await requirePermission(userId, businessId, 'finances');
```

### Audit Logging

Team actions are logged via `src/lib/audit/server.ts`:

```typescript
import { logTeamMemberInvited } from '@/lib/audit/server';

await logTeamMemberInvited(userId, businessId, { email, role });
```

### Error Handling

Use standardized errors from `src/lib/errors.ts`:

```typescript
import { PermissionError, AuthError } from '@/lib/errors';

throw new PermissionError('Access denied', 'finances');
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `business_users` | Team membership records |
| `system_roles` | System-level roles (super_admin, coach, client) |
| `audit_log` | Action history |

### Key Columns in `business_users`

- `business_id` - The business this membership is for
- `user_id` - The user (null until invite accepted)
- `email` - Email address (for invites)
- `role` - owner, admin, member, viewer
- `status` - invited, active, inactive, removed
- `section_permissions` - JSON object of permission flags
- `invite_token` - Token for accepting invite
- `invite_expires_at` - When the invite expires
