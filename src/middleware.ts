// src/middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
    '/auth/verify',
    '/auth/callback',
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

  // If user is logged in and trying to access auth pages
  if (user && pathname.startsWith('/auth')) {
    // Redirect to dashboard instead of goals
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Onboarding flow check - only for authenticated users
  if (user) {
    // Get user metadata for onboarding state
    const mustChangePassword = user.user_metadata?.must_change_password
    const onboardingStep = user.user_metadata?.onboarding_step
    const onboardingCompleted = user.user_metadata?.onboarding_completed

    // Coach and Admin portals bypass onboarding
    if (pathname.startsWith('/coach') || pathname.startsWith('/admin')) {
      return response
    }

    // Define the linear onboarding flow
    // Step 1: Change password (must_change_password = true)
    // Step 2: Business profile (onboarding_step = 'business-profile')
    // Step 3: Assessment (onboarding_step = 'assessment')
    // Step 4: Results (onboarding_step = 'results')
    // After: Dashboard (onboarding_completed = true OR no onboarding_step)

    // Allow access to current onboarding step pages
    const onboardingPages = {
      password: '/change-password',
      'business-profile': '/business-profile',
      assessment: '/assessment',
      results: '/dashboard/assessment-results'
    }

    // If user must change password, redirect to change-password unless already there
    if (mustChangePassword) {
      if (!pathname.startsWith('/change-password')) {
        return NextResponse.redirect(new URL('/change-password', request.url))
      }
      return response
    }

    // If user has an onboarding step, enforce it
    if (onboardingStep && !onboardingCompleted) {
      const currentStepPage = onboardingPages[onboardingStep as keyof typeof onboardingPages]

      if (currentStepPage) {
        // Check if user is on the correct onboarding page
        if (!pathname.startsWith(currentStepPage)) {
          return NextResponse.redirect(new URL(currentStepPage, request.url))
        }
      }
      return response
    }

    // If onboarding is not completed (no step set and no completed flag), check DB fallback
    if (!onboardingCompleted && !onboardingStep) {
      try {
        // Check if business profile is completed
        const { data: businessProfile, error: profileError } = await supabase
          .from('business_profiles')
          .select('profile_completed')
          .eq('user_id', user.id)
          .maybeSingle()

        if (profileError || !businessProfile || !businessProfile.profile_completed) {
          if (!pathname.startsWith('/business-profile')) {
            return NextResponse.redirect(new URL('/business-profile', request.url))
          }
          return response
        }

        // Check if assessment is completed
        const { data: completedAssessment, error: assessmentError } = await supabase
          .from('assessments')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!assessmentError && !completedAssessment) {
          if (!pathname.startsWith('/assessment')) {
            return NextResponse.redirect(new URL('/assessment', request.url))
          }
          return response
        }
      } catch (error) {
        console.error('Error checking onboarding completion:', error)
      }
    }
  }

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