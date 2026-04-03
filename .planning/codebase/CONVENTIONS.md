# Coding Conventions

**Analysis Date:** 2026-04-04

## Naming Patterns

**Files:**
- Page components: `page.tsx` (Next.js App Router convention)
- Error boundaries: `error.tsx` per route segment
- Layout files: `layout.tsx` per route segment
- API routes: `route.ts` inside `src/app/api/[endpoint]/`
- Components: PascalCase (`PageHeader.tsx`, `ErrorBoundary.tsx`, `GoalsCard.tsx`)
- Hooks: camelCase with `use` prefix (`useActiveBusinessId.ts`, `useAutoSave.ts`, `useDashboardData.ts`)
- Services: kebab-case or camelCase (`financial-service.ts`, `issuesService.ts`, `strategic-planning-service.ts`)
- Types files: lowercase (`types.ts`) co-located with feature
- Utility files: kebab-case (`api-response.ts`, `rate-limiter.ts`, `env-validation.ts`)
- UI primitives: lowercase (`button.tsx`, `card.tsx`) in `src/components/ui/`

**Functions:**
- Use camelCase for all functions: `loadCurrentUser`, `handleAuth`, `getActiveIssues`
- Component functions: PascalCase (`PageHeader`, `ErrorBoundary`, `StatCard`)
- Event handlers: `handle` prefix (`handleAuth`, `handleRetry`, `handleReload`)
- Boolean getters: `is`/`has`/`can` prefix (`isSuperAdmin`, `hasPermission`, `canEdit`)
- Async data loaders: `load` prefix (`loadCurrentUser`, `loadOwnBusiness`, `loadMessageData`)

**Variables:**
- camelCase for all variables: `businessId`, `isLoading`, `currentUser`
- Boolean state: `is`/`has`/`show` prefix (`isLoading`, `hasActiveBusiness`, `showOnboarding`)
- Constants: UPPER_SNAKE_CASE (`CSRF_TOKEN_NAME`, `FULL_PERMISSIONS`, `COLORS`)

**Types:**
- Interfaces: PascalCase with descriptive names (`BusinessContextType`, `ViewerPermissions`, `PageHeaderProps`)
- Props interfaces: `{ComponentName}Props` pattern (`PageHeaderProps`, `CardProps`, `ButtonProps`)
- Type aliases: PascalCase (`SaveStatus`, `SystemRole`, `InitiativeCategory`)
- Enums expressed as union types, not TypeScript enums: `type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'`
- `interface` preferred over `type` for object shapes; `type` used for unions and aliases

## Code Style

**Formatting:**
- No Prettier config -- formatting is manual/editor-based
- 2-space indentation (consistent across codebase)
- Single quotes for imports and strings
- Semicolons: mixed -- some files use them, some do not. Services and lib files tend to use semicolons; component files tend to omit them
- Trailing commas in multi-line structures

**Linting:**
- ESLint with `next/core-web-vitals` and `next/typescript` extends
- Config files: `.eslintrc.json` (legacy) and `eslint.config.mjs` (flat config)
- Key rule overrides:
  - `react/no-unescaped-entities`: off
  - `@next/next/no-assign-module-variable`: off
  - Edge runtime restriction: Node.js modules (`crypto`, `fs`, `path`, `child_process`) forbidden in `src/middleware.ts`
- ESLint is **ignored during builds** (`next.config.js`: `eslint.ignoreDuringBuilds: true`)
- Lint command: `npm run lint` (runs `next lint`)

**TypeScript:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- `noUnusedLocals`: false, `noUnusedParameters`: false (relaxed)
- Target: ES2020, Module: ESNext, JSX: preserve
- `any` types exist in the codebase (used sparingly for snapshot/metadata fields in types like `kpisSnapshot: any`)

## Import Organization

**Order** (observed convention, not enforced):
1. React/Next.js framework imports (`react`, `next/server`, `next/navigation`)
2. Third-party libraries (`@supabase/ssr`, `lucide-react`, `sonner`, `zustand`)
3. Internal absolute imports using `@/` alias (`@/lib/supabase/client`, `@/components/ui/PageHeader`)
4. Relative imports for co-located files (`./hooks/useStrategicPlanning`, `../types`)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- Use `@/` for cross-feature imports: `@/components/`, `@/lib/`, `@/hooks/`, `@/contexts/`, `@/types/`
- Use relative imports for within-feature files (e.g., `./components/Step1GoalsAndKPIs`)

**Barrel Files:**
- Used selectively for component groups via `index.ts`
- Pattern: `export { default as ComponentName } from './ComponentName'`
- Examples: `src/app/dashboard/components/index.ts`, `src/components/coach/messages/index.ts`
- Not universal -- many directories import directly from files without barrel files

## Component Patterns

**Functional components only.** No class components except `ErrorBoundary` (React requirement).

**Client vs Server components:**
- Most page components are client components (`'use client'` directive at top)
- Server components are rare -- this is primarily a client-rendered app
- API routes use server-side Supabase client (`createRouteHandlerClient`)
- The `'use client'` directive is placed at the very first line of the file

**Component declaration patterns:**
- Default exports for page components: `export default function DashboardPage() {}`
- Named exports for reusable components: `export function Card({...}: CardProps) {}`
- `React.forwardRef` used for primitive UI components like `Button`
- Arrow function components NOT used -- prefer function declarations

**Props typing:**
- Props defined as interfaces directly above the component
- Destructured in function signature: `function PageHeader({ title, subtitle, ...}: PageHeaderProps)`
- Default values via destructuring: `variant = 'default'`, `className = ''`
- Children typed as `ReactNode`
- Icon props typed as `LucideIcon` or `React.ElementType`

**UI component library:**
- Custom component library in `src/components/ui/` -- no shadcn/ui or similar
- Components: `Button`, `Card`, `CardHeader`, `CardContent`, `CardFooter`, `StatCard`, `EmptyCard`, `PageHeader`, `PageLayout`, `Skeleton`, `Tooltip`, `ConfirmDialog`, `DropdownMenu`, `BrandedLoader`, `EmptyState`, `LoadingState`, `SaveIndicator`
- Brand design tokens centralized in `src/lib/design-tokens.ts`
- Tailwind CSS classes composed with `cn()` utility from `src/lib/utils.ts` (using `clsx` + `tailwind-merge`)

## Error Handling

**Client-side errors:**
- `ErrorBoundary` component wraps the entire app in `src/app/layout.tsx`
- Route-level `error.tsx` files use shared `RouteError` component from `src/components/RouteError.tsx`
- Error pattern in error.tsx files:
  ```tsx
  'use client'
  import RouteError from '@/components/RouteError'
  export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError error={error} reset={reset} section="Goals" />
  }
  ```
- Client error logging to database via `src/lib/error-logger.ts` (`logError`, `logSaveError`, `logRLSError`)

**API route errors:**
- Standard pattern: try/catch with `NextResponse.json` returning `{ error: string }` and HTTP status codes
- Standardized API response utilities in `src/lib/utils/api-response.ts`:
  - `successResponse(data)`, `errorResponse(message, status)`, `paginatedResponse(...)`
  - `CommonErrors.unauthorized()`, `CommonErrors.forbidden()`, `CommonErrors.notFound()`, etc.
- Auth check at start of every API route: `const { data: { user }, error: authError } = await supabase.auth.getUser()`
- NOTE: Not all API routes use the standardized helpers -- many still use raw `NextResponse.json`

**Async/service errors:**
- Services return `{ success: boolean; error?: string }` objects
- Hooks use `try/catch` with `console.error` logging and state-based error tracking
- Console logging with component prefix: `console.error('[ComponentName] Error:', error)`

## Toast Notifications

**Primary: `sonner`** -- configured globally in `src/app/layout.tsx` via `<Toaster>` component
- Import: `import { toast } from 'sonner'`
- Usage: `toast.success('Saved')`, `toast.error('Failed to save')`

**Legacy: `react-hot-toast`** -- still present in a few older pages
- Files using react-hot-toast: `src/app/business-profile/page.tsx`, `src/app/vision-mission/page.tsx`
- These import their own `<Toaster>` component inline
- New code should use `sonner`, not `react-hot-toast`

## Data Fetching Patterns

**Client-side data fetching (primary pattern):**
- Direct Supabase client calls in `useEffect` or custom hooks
- No React Query, SWR, or other data-fetching library
- Supabase client created via `createClient()` from `@/lib/supabase/client`
- Pattern:
  ```tsx
  const supabase = createClient()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('table').select('*')
      setData(data)
      setIsLoading(false)
    }
    load()
  }, [dependency])
  ```

**Custom data hooks:**
- Feature-specific hooks encapsulate data loading: `useDashboardData`, `useStrategicPlanning`, `useActiveBusinessId`
- Return `{ data, isLoading, error }` pattern
- Business context provides the active business ID for multi-tenant queries

**API routes:**
- Server-side Supabase: `createRouteHandlerClient()` from `@/lib/supabase/server`
- `export const dynamic = 'force-dynamic'` on all API routes
- Auth verification at start of every handler

**Service classes:**
- Domain services as static class methods: `FinancialService.saveFinancialGoals(...)`, `KPIService.loadKPIs(...)`
- Located co-located with features: `src/app/goals/services/financial-service.ts`
- Also in shared lib: `src/lib/services/issuesService.ts`

## State Management

**Local state:** React `useState` + `useEffect` (predominant pattern)

**Context:**
- `BusinessContext` (`src/contexts/BusinessContext.tsx`) -- the primary global state
- Provides: `currentUser`, `activeBusiness`, `viewerContext` (permissions), `businessProfileId`
- Consumed via `useBusinessContext()` hook

**Zustand (limited):**
- Single store: `src/lib/store/wizardStore.ts` for process wizard state
- Uses `persist` middleware for localStorage persistence
- Not the primary state management approach

**Auto-save:**
- Reusable `useAutoSave` hook in `src/hooks/useAutoSave.ts`
- Features: debounced saves, dirty tracking, localStorage backup, save status indicator
- Used in strategic planning wizard and other form-heavy pages

## Form Handling

**No form library in active use.** Despite `react-hook-form` and `@hookform/resolvers` being in `package.json`, no source files import them.

**Current pattern: controlled inputs with `useState`:**
```tsx
const [formData, setFormData] = useState({ email: '', password: '' })
const handleAuth = async (e: React.FormEvent) => {
  e.preventDefault()
  // validate and submit
}
return <form onSubmit={handleAuth}>...</form>
```

**Validation:**
- Manual validation in handlers
- `zod` is in dependencies and available for schema validation
- Validation utilities in `src/lib/utils/validation.ts` (`sanitizeString`, `isValidEmail`, `validatePassword`)

## Logging

**Framework:** `console` (primary), structured Logger class (available but not widely adopted)

**Patterns:**
- Component-prefixed logging: `console.log('[BusinessContext] Loading current user...')`
- Error logging: `console.error('[RouteError] Goals:', error)`
- Structured logger available at `src/lib/utils/logger.ts` -- supports debug/info/warn/error levels with JSON output in production
- Client error logging to Supabase: `src/lib/error-logger.ts`

## Comments

**When to Comment:**
- JSDoc blocks on hooks and reusable utilities (with `@example` and `@param` annotations)
- Architecture comments explaining "why" for complex ID relationships (see `src/app/goals/hooks/useStrategicPlanning.ts` header)
- Section dividers using comment blocks:
  ```typescript
  // ============================================
  // Type Definitions
  // ============================================
  ```
- Inline comments for non-obvious business logic

**JSDoc/TSDoc:**
- Used on public API of hooks, services, and utility functions
- Includes usage examples in doc blocks
- Not used on internal/private functions or component props

## Module Design

**Exports:**
- Pages: default export (`export default function PageName()`)
- Components: named export preferred (`export function Card()`) with occasional `export default`
- Hooks: named export (`export function useActiveBusinessId()`)
- Services: static class with static methods (`export class FinancialService { static async save() {...} }`)
- Types: named exports (`export interface`, `export type`)
- Utilities: named exports (`export function cn()`, `export function sanitizeString()`)

**Barrel Files:**
- Used for component groups that are imported together
- Pattern: `src/app/dashboard/components/index.ts` re-exports all dashboard components
- Not mandatory -- many features import directly from files

## Design System

**Brand colors** (use these Tailwind classes):
- Navy: `bg-brand-navy`, `text-brand-navy` (primary headers, dark backgrounds)
- Orange: `bg-brand-orange`, `text-brand-orange` (CTAs, accents, primary actions)
- Teal: `bg-brand-teal`, `text-brand-teal` (success states only)

**Tailwind configuration:** `tailwind.config.js`
- Custom font scale (bumped up for readability): `text-base` = 18px, `text-sm` = 16px
- Custom animations: `fadeIn`, `dropdown-enter`, `dropdown-exit`
- Custom color scales with full shade ranges (50-950)

**Font:** Inter (loaded via `next/font/google` in `src/app/layout.tsx`)

**Icons:** Lucide React (`lucide-react`) -- import individual icons: `import { Target, Calendar } from 'lucide-react'`

---

*Convention analysis: 2026-04-04*
