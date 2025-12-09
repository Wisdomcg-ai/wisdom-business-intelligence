# System Improvement Execution Plan
## From Current State to 10/10 Quality

**Generated**: December 9, 2025
**Current Overall Score**: 5.1/10
**Target Score**: 10/10

---

## Executive Summary

This plan addresses 17 security vulnerabilities, 500+ code quality issues, 21 localStorage usages, and UI/UX gaps identified in the system audit. The approach is **incremental and safe** - each phase can be deployed independently without breaking existing functionality.

---

## Phase 0: Pre-Flight Checklist (Before Starting)

### Database Migrations to Run
Run these SQL migrations in Supabase SQL Editor **before** proceeding:

```sql
-- Migration 1: Daily Tasks table (for /todo page)
-- File: database/migrations/create-daily-tasks-table.sql
-- Run the full contents of that file

-- Migration 2: Tasks column for strategic initiatives
ALTER TABLE strategic_initiatives
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';

COMMENT ON COLUMN strategic_initiatives.tasks IS
'Array of subtasks for this initiative. Each task has: id, name, owner, dueDate, status, minutesAllocated';
```

### Create Development Branch
```bash
git checkout -b feature/system-improvements
```

---

## Phase 1: CRITICAL Security Fixes (Priority: Immediate)

**Estimated Effort**: 4-6 hours
**Risk Level**: Low (targeted fixes)
**Deployment**: Can deploy after each fix

### 1.1 Fix Code Injection Vulnerability

**File**: `src/app/finances/forecast/components/PLForecastTable.tsx`
**Line**: 223
**Issue**: `new Function()` allows arbitrary code execution

**Current Code**:
```typescript
const func = new Function('value', formula)
return func(value)
```

**Safe Replacement**:
```typescript
// Create a safe math expression evaluator
const evaluateFormula = (formula: string, value: number): number => {
  // Only allow: numbers, operators (+, -, *, /), parentheses, and 'value'
  const safePattern = /^[\d\s\+\-\*\/\(\)\.value]+$/
  const sanitized = formula.replace(/value/g, String(value))

  if (!safePattern.test(sanitized)) {
    console.warn('Invalid formula pattern:', formula)
    return value
  }

  // Use Function.prototype approach with strict validation
  try {
    // Simple math-only parser
    return Function(`"use strict"; return (${sanitized})`)()
  } catch (e) {
    console.error('Formula evaluation error:', e)
    return value
  }
}
```

**Alternative**: Use `mathjs` library for safe expression evaluation:
```bash
npm install mathjs
```

```typescript
import { evaluate } from 'mathjs'

const result = evaluate(formula, { value })
```

**Test After**:
- Navigate to `/finances/forecast`
- Verify all calculations still work
- Try entering malicious formula in console to confirm it's blocked

---

### 1.2 Remove Password Exposure in API Routes

**Files to Fix**:
1. `src/app/api/admin/clients/route.ts`
2. `src/app/api/admin/coaches/route.ts`

**Current Issue**: Passwords included in API responses

**Fix Pattern** (apply to both files):
```typescript
// Before returning user data, strip sensitive fields
const sanitizeUser = (user: any) => {
  const { password, password_hash, ...safeUser } = user
  return safeUser
}

// In your response:
return NextResponse.json({
  users: users.map(sanitizeUser)
})
```

**Test After**:
- Call GET `/api/admin/clients` and verify no password fields
- Call GET `/api/admin/coaches` and verify no password fields

---

### 1.3 Add File Upload Validation

**File**: `src/app/api/documents/route.ts`

**Add at top of POST handler**:
```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// In POST handler:
if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return NextResponse.json(
    { error: 'File type not allowed' },
    { status: 400 }
  )
}

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: 'File too large. Maximum 10MB allowed.' },
    { status: 400 }
  )
}
```

---

### 1.4 Add Rate Limiting to API Routes

**Create utility file**: `src/lib/utils/rate-limiter.ts`

```typescript
// Simple in-memory rate limiter (for production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

interface RateLimitConfig {
  windowMs: number    // Time window in milliseconds
  maxRequests: number // Max requests per window
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs }
  }

  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetTime - now
    }
  }

  record.count++
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetIn: record.resetTime - now
  }
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)
```

**Apply to auth routes first**:
```typescript
// In src/app/api/auth/login/route.ts
import { checkRateLimit } from '@/lib/utils/rate-limiter'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const rateLimit = checkRateLimit(`login:${ip}`, {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 5              // 5 attempts
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000))
        }
      }
    )
  }
  // ... rest of login logic
}
```

---

### 1.5 Add CSRF Protection

**Create middleware**: `src/middleware.ts` (if not exists, update if exists)

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // CSRF protection for state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')

    // Allow if origin matches host or is localhost in development
    const isValidOrigin = origin && (
      origin.includes(host || '') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    )

    if (!isValidOrigin && !request.nextUrl.pathname.startsWith('/api/webhook')) {
      return NextResponse.json(
        { error: 'Invalid request origin' },
        { status: 403 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*'
}
```

---

### Phase 1 Checkpoint
After completing Phase 1:
```bash
npm run build
npm run dev
# Test all affected routes
git add -A && git commit -m "fix: critical security vulnerabilities (injection, passwords, rate limiting)"
```

---

## Phase 2: HIGH Priority - Data Persistence Migration

**Estimated Effort**: 8-12 hours
**Risk Level**: Medium (requires careful migration)
**Strategy**: Dual-write during transition

### 2.1 Files Requiring localStorage to Supabase Migration

| File | Data Type | Priority |
|------|-----------|----------|
| `src/app/vision-mission/page.tsx` | Vision/Mission/Values | HIGH |
| `src/app/swot/page.tsx` | SWOT Analysis | HIGH |
| `src/app/ideas/page.tsx` | Business Ideas | HIGH |
| `src/app/one-page-plan/page.tsx` | Business Plan | HIGH |
| `src/app/open-loops/page.tsx` | Open Loops | MEDIUM |
| `src/app/stop-doing/page.tsx` | Stop Doing List | MEDIUM |
| `src/app/quarterly-review/page.tsx` | Reviews | MEDIUM |
| `src/components/onboarding/*.tsx` | Onboarding State | LOW |

### 2.2 Migration Pattern (Apply to Each File)

**Step 1**: Create database table
```sql
-- Example for vision_mission
CREATE TABLE IF NOT EXISTS vision_mission_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  vision TEXT,
  mission TEXT,
  values JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);

-- RLS
ALTER TABLE vision_mission_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own data"
  ON vision_mission_data FOR ALL
  USING (auth.uid() = user_id);
```

**Step 2**: Create service file
```typescript
// src/lib/services/visionMissionService.ts
import { createClient } from '@/lib/supabase/client'

export interface VisionMissionData {
  vision: string
  mission: string
  values: string[]
}

class VisionMissionService {
  private supabase = createClient()

  async getData(businessId: string): Promise<VisionMissionData | null> {
    const { data, error } = await this.supabase
      .from('vision_mission_data')
      .select('*')
      .eq('business_id', businessId)
      .single()

    if (error || !data) return null
    return {
      vision: data.vision || '',
      mission: data.mission || '',
      values: data.values || []
    }
  }

  async saveData(
    businessId: string,
    userId: string,
    data: VisionMissionData
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('vision_mission_data')
      .upsert({
        business_id: businessId,
        user_id: userId,
        vision: data.vision,
        mission: data.mission,
        values: data.values,
        updated_at: new Date().toISOString()
      }, { onConflict: 'business_id' })

    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  // Migration helper: import from localStorage
  async migrateFromLocalStorage(businessId: string, userId: string): Promise<void> {
    if (typeof window === 'undefined') return

    const localData = localStorage.getItem('vision-mission-data')
    if (!localData) return

    try {
      const parsed = JSON.parse(localData)
      await this.saveData(businessId, userId, parsed)
      localStorage.removeItem('vision-mission-data') // Clean up after migration
    } catch (e) {
      console.error('Migration failed:', e)
    }
  }
}

export const visionMissionService = new VisionMissionService()
```

**Step 3**: Update page component
```typescript
// In the page component
useEffect(() => {
  const loadData = async () => {
    if (!businessId || !userId) return

    // Try migration first (runs once if localStorage data exists)
    await visionMissionService.migrateFromLocalStorage(businessId, userId)

    // Load from database
    const data = await visionMissionService.getData(businessId)
    if (data) {
      setVision(data.vision)
      setMission(data.mission)
      setValues(data.values)
    }
  }
  loadData()
}, [businessId, userId])

const handleSave = async () => {
  const result = await visionMissionService.saveData(businessId, userId, {
    vision, mission, values
  })
  if (result.success) {
    toast.success('Saved successfully')
  } else {
    toast.error('Save failed: ' + result.error)
  }
}
```

### 2.3 Required Database Tables

Create migration file: `database/migrations/phase2-data-persistence.sql`

```sql
-- Vision/Mission/Values
CREATE TABLE IF NOT EXISTS vision_mission_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  vision TEXT,
  mission TEXT,
  core_values JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);

-- SWOT Analysis
CREATE TABLE IF NOT EXISTS swot_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'SWOT Analysis',
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  opportunities JSONB DEFAULT '[]',
  threats JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Ideas
CREATE TABLE IF NOT EXISTS business_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT DEFAULT 'draft',
  evaluation_score INTEGER,
  evaluation_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One Page Plan
CREATE TABLE IF NOT EXISTS one_page_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);

-- Open Loops
CREATE TABLE IF NOT EXISTS open_loops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stop Doing List
CREATE TABLE IF NOT EXISTS stop_doing_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  reason TEXT,
  impact TEXT,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE vision_mission_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE swot_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_page_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_doing_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (same pattern for each)
CREATE POLICY "Users can manage their vision_mission_data"
  ON vision_mission_data FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their swot_analyses"
  ON swot_analyses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their business_ideas"
  ON business_ideas FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their one_page_plans"
  ON one_page_plans FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their open_loops"
  ON open_loops FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their stop_doing_items"
  ON stop_doing_items FOR ALL USING (auth.uid() = user_id);
```

---

## Phase 3: Code Quality Improvements

**Estimated Effort**: 12-16 hours
**Risk Level**: Low (type safety improvements)

### 3.1 Replace `any` Types - Priority Files

**Top 10 files with most `any` usage**:

1. `src/app/goals/page.tsx` - ~25 instances
2. `src/app/finances/forecast/page.tsx` - ~20 instances
3. `src/app/coach/clients/[id]/page.tsx` - ~18 instances
4. `src/app/assessment/[id]/page.tsx` - ~15 instances
5. `src/app/admin/page.tsx` - ~12 instances

**Strategy**: Create proper type definitions

**Create**: `src/types/index.ts`
```typescript
// Core business types
export interface Business {
  id: string
  name: string
  owner_id: string
  industry?: string
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  full_name?: string
  role: 'admin' | 'coach' | 'client'
  business_id?: string
  created_at: string
}

export interface Assessment {
  id: string
  user_id: string
  business_id: string
  type: string
  status: 'draft' | 'in_progress' | 'completed'
  responses: Record<string, unknown>
  score?: number
  completed_at?: string
  created_at: string
}

export interface Goal {
  id: string
  business_id: string
  title: string
  description?: string
  target_date?: string
  status: 'not_started' | 'in_progress' | 'completed' | 'cancelled'
  progress: number
  kpis?: KPI[]
  created_at: string
}

export interface KPI {
  id: string
  name: string
  target: number
  current: number
  unit: string
  trend: 'up' | 'down' | 'flat'
}

export interface Session {
  id: string
  coach_id: string
  client_id: string
  business_id: string
  scheduled_at: string
  duration_minutes: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes?: string
  action_items?: ActionItem[]
}

export interface ActionItem {
  id: string
  description: string
  owner?: string
  due_date?: string
  status: 'pending' | 'in_progress' | 'completed'
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
```

### 3.2 Standardize API Responses

**Create**: `src/lib/utils/api-response.ts`
```typescript
import { NextResponse } from 'next/server'

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data, success: true }, { status })
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, success: false }, { status })
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    success: true
  })
}
```

### 3.3 Add Error Boundaries

**Create**: `src/components/ErrorBoundary.tsx`
```typescript
'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    // TODO: Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

**Usage in layouts**:
```typescript
// In src/app/layout.tsx or page layouts
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function Layout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}
```

---

## Phase 4: Architecture Improvements

**Estimated Effort**: 16-24 hours
**Risk Level**: Medium (refactoring)

### 4.1 Standardize Service Layer

**Pattern to follow** (based on existing `dailyTasksService.ts`):

```typescript
// src/lib/services/baseService.ts
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

export abstract class BaseService {
  protected supabase: SupabaseClient

  constructor() {
    this.supabase = createClient()
  }

  protected async getCurrentUserId(): Promise<string | null> {
    const { data: { user } } = await this.supabase.auth.getUser()
    return user?.id || null
  }

  protected async getCurrentBusinessId(): Promise<string | null> {
    const userId = await this.getCurrentUserId()
    if (!userId) return null

    const { data } = await this.supabase
      .from('users')
      .select('business_id')
      .eq('id', userId)
      .single()

    return data?.business_id || null
  }
}
```

### 4.2 State Management Consolidation

**Create custom hooks for shared state**:

```typescript
// src/hooks/useBusinessContext.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BusinessState {
  businessId: string | null
  businessName: string | null
  userId: string | null
  userRole: string | null
  setBusinessContext: (context: Partial<BusinessState>) => void
  clearContext: () => void
}

export const useBusinessContext = create<BusinessState>()(
  persist(
    (set) => ({
      businessId: null,
      businessName: null,
      userId: null,
      userRole: null,
      setBusinessContext: (context) => set((state) => ({ ...state, ...context })),
      clearContext: () => set({
        businessId: null,
        businessName: null,
        userId: null,
        userRole: null
      })
    }),
    { name: 'business-context' }
  )
)
```

### 4.3 Component Architecture

**Standardize page structure**:
```
src/app/[feature]/
├── page.tsx           # Main page component
├── components/        # Feature-specific components
│   ├── FeatureCard.tsx
│   └── FeatureList.tsx
├── hooks/             # Feature-specific hooks
│   └── useFeatureData.ts
├── services/          # Feature-specific services
│   └── featureService.ts
└── types.ts           # Feature-specific types
```

---

## Phase 5: UI/UX Consistency

**Estimated Effort**: 8-12 hours
**Risk Level**: Low (visual improvements)

### 5.1 Accessibility Improvements

**Priority additions**:

1. **Add skip link** (in main layout):
```typescript
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded z-50"
>
  Skip to main content
</a>
// ... navigation ...
<main id="main-content">
```

2. **Add ARIA labels to all interactive elements**:
```typescript
// Pattern for buttons
<button aria-label="Add new task">
  <PlusIcon className="h-5 w-5" />
</button>

// Pattern for icon-only buttons
<button aria-label="Delete item" title="Delete">
  <TrashIcon className="h-5 w-5" />
</button>
```

3. **Add focus indicators** (in globals.css):
```css
/* Ensure all focusable elements have visible focus */
*:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* Remove outline for mouse users, keep for keyboard */
*:focus:not(:focus-visible) {
  outline: none;
}
```

### 5.2 Loading States Standardization

**Create**: `src/components/ui/LoadingState.tsx`
```typescript
export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8" role="status">
      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      <p className="mt-4 text-gray-600">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingState message="Loading page..." />
    </div>
  )
}

export function CardLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  )
}
```

### 5.3 Empty States Standardization

**Create**: `src/components/ui/EmptyState.tsx`
```typescript
import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-gray-500 mb-4 max-w-md mx-auto">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
```

---

## Phase 6: Testing & Monitoring

**Estimated Effort**: Ongoing
**Risk Level**: N/A (improvement)

### 6.1 Add Structured Logging

**Create**: `src/lib/utils/logger.ts`
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development'

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString()
    }

    if (this.isDev) {
      const emoji = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' }[level]
      console[level](`${emoji} [${level.toUpperCase()}]`, message, context || '')
    } else {
      // In production, send to logging service
      // TODO: Integrate with logging service (e.g., LogRocket, Sentry)
      console[level](JSON.stringify(entry))
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context)
  }
}

export const logger = new Logger()
```

### 6.2 Add Performance Monitoring

```typescript
// src/lib/utils/performance.ts
export function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now()
  return fn().finally(() => {
    const duration = performance.now() - start
    if (duration > 1000) {
      console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`)
    }
  })
}
```

---

## Implementation Schedule

### Week 1: Critical Security (Phase 1)
- Day 1-2: Fix code injection, password exposure
- Day 3: Add rate limiting, file validation
- Day 4: Add CSRF protection
- Day 5: Testing & deployment

### Week 2-3: Data Persistence (Phase 2)
- Days 1-3: Create all database tables
- Days 4-7: Migrate vision/mission, SWOT, ideas
- Days 8-10: Migrate remaining features
- Days 11-12: Testing & deployment

### Week 4: Code Quality (Phase 3)
- Days 1-2: Add type definitions
- Days 3-4: Replace `any` in top 5 files
- Day 5: Add error boundaries
- Day 6-7: Testing & deployment

### Week 5-6: Architecture (Phase 4)
- Days 1-3: Standardize service layer
- Days 4-6: State management consolidation
- Days 7-10: Component restructuring
- Days 11-14: Testing & deployment

### Week 7: UI/UX (Phase 5)
- Days 1-2: Accessibility improvements
- Days 3-4: Loading/empty states
- Day 5: Testing & deployment

### Ongoing: Monitoring (Phase 6)
- Add logging as you touch files
- Monitor performance in production

---

## Rollback Strategy

Each phase can be rolled back independently:

```bash
# If issues arise after deployment
git revert HEAD~N  # Revert last N commits
npm run build      # Verify build passes
npm run deploy     # Redeploy
```

For database changes:
```sql
-- Keep track of migrations and create rollback scripts
-- Example: DROP TABLE IF EXISTS vision_mission_data CASCADE;
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Security Score | 3/10 | 9/10 |
| Code Quality | 5/10 | 9/10 |
| Data Persistence | 6/10 | 10/10 |
| Architecture | 5.5/10 | 9/10 |
| UI/UX | 6/10 | 9/10 |
| **Overall** | **5.1/10** | **9.2/10** |

---

## Quick Reference Commands

```bash
# Run migrations
# Copy SQL to Supabase SQL Editor and execute

# Build check after each phase
npm run build

# Type check
npx tsc --noEmit

# Lint check
npm run lint

# Commit pattern
git add -A
git commit -m "feat: [phase] description"
git push origin feature/system-improvements

# Create PR when ready
gh pr create --title "System Improvements Phase X" --body "..."
```

---

**Remember**: Take it one phase at a time. Don't rush. Test thoroughly after each change. The goal is steady improvement, not perfection in one commit.
