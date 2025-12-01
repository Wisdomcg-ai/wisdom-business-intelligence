import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const supabase = await createRouteHandlerClient();
  let redirectPath = '/dashboard';

  // Step 1: Establish the session
  if (code) {
    // Exchange the code for a session (PKCE flow from magic link)
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error('[Auth Callback] Code exchange error:', exchangeError);
      return NextResponse.redirect(new URL('/auth/login?error=session_error', request.url));
    }
  }

  // Step 2: Get fresh user data (metadata may have been stale in exchange response)
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  console.log('[Auth Callback] User fetched:', {
    hasUser: !!user,
    userId: user?.id,
    email: user?.email,
    error: userError?.message
  });

  if (!user) {
    console.error('[Auth Callback] No user after session:', userError);
    return NextResponse.redirect(new URL('/auth/login?error=no_user', request.url));
  }

  // Step 3: Check onboarding state from fresh user metadata
  const mustChangePassword = user.user_metadata?.must_change_password;
  const onboardingStep = user.user_metadata?.onboarding_step;
  const onboardingCompleted = user.user_metadata?.onboarding_completed;

  console.log('[Auth Callback] User metadata:', {
    mustChangePassword,
    onboardingStep,
    onboardingCompleted,
    email: user.email,
    allMetadata: user.user_metadata
  });

  // Determine redirect based on onboarding state
  if (mustChangePassword === true) {
    redirectPath = '/change-password';
  } else if (onboardingStep === 'business-profile') {
    redirectPath = '/business-profile';
  } else if (onboardingStep === 'assessment') {
    redirectPath = '/assessment';
  } else if (onboardingStep === 'results') {
    redirectPath = '/dashboard/assessment-results';
  }

  console.log('[Auth Callback] Redirecting to:', redirectPath);

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(redirectPath, request.url));
}