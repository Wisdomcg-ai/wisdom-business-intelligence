# WisdomBI — Business Intelligence Platform

## Overview
A business coaching platform that connects to Xero accounting data, enables coaches to build financial forecasts with clients, and provides tools for strategic planning, team management, quarterly reviews, and business coaching workflows.

## Primary Users
- **Business Coaches** — manage multiple clients, connect Xero on their behalf, build forecasts, run coaching sessions
- **Business Owners/Clients** — view their financial data, collaborate on forecasts, track goals and KPIs

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **Key Integration:** Xero (Accounting, Payroll AU)
- **AI:** Claude API for CFO assistant, insights

## Architecture
- Multi-tenant via Supabase RLS
- Coach view renders client pages inside coach shell via catch-all route
- Dual ID system: `businesses.id` vs `business_profiles.id` (known complexity)
- Xero OAuth with multi-tenant org selection for coaches

## Current State
- Live in production at wisdombi.ai
- Active client: Just Digital Signage (Aeris Solutions Pty Ltd)
- Forecast builder wizard V4 is the primary feature
- Xero integration recently fixed (connection flow, P&L categorisation, multi-tenant selection)

## Key Business Context
- Australian market (AUD, AU fiscal year Jul-Jun, AU payroll/super)
- Coaches access multiple client Xero orgs
- Financial forecasts built around P&L structure: Revenue → COGS → GP → Team → OpEx → Net Profit
