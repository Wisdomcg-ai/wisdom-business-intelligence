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
- Multi-tenant via Supabase RLS (154 tables, 397 policies, 41 SECURITY DEFINER functions)
- Coach view renders client pages inside coach shell via catch-all route
- Dual ID system: `businesses.id` vs `business_profiles.id` (known complexity)
- Xero OAuth with multi-tenant org selection for coaches
- AES-256-GCM encryption for Xero OAuth tokens at rest
- Strong domain layer in `src/lib/consolidation/` (engine, fx, balance-sheet, eliminations, oxr, cashflow) with 11 unit-test files
- Centralised tenant resolution via `src/lib/business/resolveBusinessId.ts`

## Current State
- Live in production at wisdombi.ai
- Active production tenants: **Dragon (AUD, 2 entities)**, **IICT (NZ + HK FX, 3 entities)**, **Fit2Shine (coaching)**, **Just Digital Signage**, others
- Forecast builder wizard V4 is the primary feature
- Monthly Report (Calxa replacement) shipped; consolidation engine live
- 992 TS/TSX files, ~303k LOC, 120 API routes, 95 pages, 8 active migrations

## Current Milestone: v1.1 Codebase Hardening

**Goal:** Systematically remediate findings from `CODEBASE-AUDIT.md` (production readiness 55→75/100) without disrupting active production tenants.

**Target features (all client-invisible or shadow-flagged):**
- Repair the test gate; PRs blocked on lint+typecheck+tests+build
- Sweep dead code, archives, dead wizards, unused dependencies
- Server-side hardening (cron-secret fail-open fix, encryption-key hardening, structured logging, dead-route deletion)
- Zod input-validation rollout in observe→enforce mode across 120 API routes
- Decimal money arithmetic in consolidation engine via shadow-compute pattern
- Database integrity (additive soft-delete columns, ON DELETE clauses on 56 orphan-prone FKs)

**Key context:**
- Source-of-truth audit: `CODEBASE-AUDIT.md` at repo root (635 lines, written 2026-04-28)
- Specialist reports archived in `.audit-tmp/` (security, architecture, correctness, database, redundancy)
- Every phase must be low-blast-radius — no behaviour change without flag or shadow-compute
- Deploys for risky phases (47, 48, 49) outside Australia/NZ business hours

## Active Requirements

(See `.planning/REQUIREMENTS.md` — 30 requirements across 6 categories: TEST, CLEAN, SEC, VALID, MONEY, DB.)

## Key Business Context
- Australian market (AUD, AU fiscal year Jul-Jun, AU payroll/super)
- NZ + HK fiscal contexts via IICT consolidation tenant
- Coaches access multiple client Xero orgs
- Financial forecasts built around P&L structure: Revenue → COGS → GP → Team → OpEx → Net Profit

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-28 — Milestone v1.1 (Codebase Hardening) started._
