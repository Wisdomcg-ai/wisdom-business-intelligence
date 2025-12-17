// src/middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CSRF_TOKEN_NAME = 'csrf_token'

// Generate CSRF token using Web Crypto API (Edge runtime compatible)
function generateCsrfToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Set CSRF token if not present
  if (!request.cookies.get(CSRF_TOKEN_NAME)) {
    const csrfToken = generateCsrfToken()
    response.cookies.set(CSRF_TOKEN_NAME, csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Get the pathname for easier checking
  const pathname = request.nextUrl.pathname

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/auth/login',
    '/auth/signup',
    '/auth/reset-password',
    '/auth/update-password',
    '/coach/login',
    '/admin/login',
    '/login'
  ]
  // Check if it's a public route OR the home page OR legal pages
  const isPublicRoute = pathname === '/' || pathname === '/privacy' || pathname === '/terms' || publicRoutes.some(route => pathname.startsWith(route))

  // If user is not logged in and trying to access protected routes
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // If user is logged in and trying to access auth pages (except update-password)
  if (user && pathname.startsWith('/auth') && !pathname.startsWith('/auth/update-password')) {
    // Redirect to dashboard instead of goals
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Onboarding flow check - only for authenticated users
  if (user) {
    // Routes that don't require onboarding completion
    const onboardingExemptRoutes = [
      '/business-profile',
      '/assessment',
      '/auth/callback',
      '/auth/logout',
      '/coach',        // Coach portal doesn't require client onboarding
      '/admin',        // Admin portal doesn't require client onboarding
      '/dashboard'     // Allow dashboard access - it handles its own auth/data
    ]
    // Also exempt public marketing pages from onboarding checks
    const isExemptRoute = isPublicRoute || onboardingExemptRoutes.some(route => pathname.startsWith(route))

    // Only check onboarding if not on exempt routes
    if (!isExemptRoute) {
      try {
        // FIRST: Check if user is a coach or super_admin - they can bypass onboarding
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        // Coaches and super_admins can navigate freely without completing onboarding
        if (roleData?.role === 'coach' || roleData?.role === 'super_admin') {
          // Allow access - skip onboarding checks
          return response
        }

        // TEMPORARILY DISABLED: Onboarding checks removed to allow business plan access
        // TODO: Re-enable once business plan development is complete

        // // STEP 1: Check if business profile is completed (clients only)
        // const { data: businessProfile, error: profileError } = await supabase
        //   .from('business_profiles')
        //   .select('profile_completed')
        //   .eq('user_id', user.id)
        //   .maybeSingle()  // Use maybeSingle to avoid errors if no row exists

        // // If profile doesn't exist or is not completed, redirect to business profile
        // if (profileError || !businessProfile || !businessProfile.profile_completed) {
        //   return NextResponse.redirect(new URL('/business-profile', request.url))
        // }

        // // STEP 2: Check if assessment is completed
        // const { data: completedAssessment, error: assessmentError } = await supabase
        //   .from('assessments')
        //   .select('id')
        //   .eq('user_id', user.id)
        //   .eq('status', 'completed')
        //   .order('completed_at', { ascending: false })
        //   .limit(1)
        //   .maybeSingle()

        // // If no completed assessment (and no error), redirect to assessment page
        // if (!assessmentError && !completedAssessment) {
        //   return NextResponse.redirect(new URL('/assessment', request.url))
        // }

        // Allow access to all routes - onboarding checks disabled
      } catch (error) {
        // If there's an unexpected error, log it but allow the request through
        // This prevents redirect loops when DB is having issues
        console.error('Error checking onboarding completion:', error)
        // Don't redirect on errors - let the page handle it
      }
    }
  }

  // Add security headers
  const securityHeaders: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }

  // Add HSTS header in production
  if (process.env.NODE_ENV === 'production') {
    // Strict-Transport-Security: max-age=1 year, include subdomains, allow preload
    securityHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
  }

  // Content Security Policy
  // This is a relatively permissive policy that works with most Next.js apps
  // Adjust as needed for your specific requirements
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.xero.com https://identity.xero.com https://api.openai.com https://vercel.live wss://ws-us3.pusher.com",
    "frame-src 'self' https://js.stripe.com https://login.xero.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ]
  securityHeaders['Content-Security-Policy'] = cspDirectives.join('; ')

  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}