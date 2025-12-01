import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const supabase = await createRouteHandlerClient();
  let redirectPath = '/dashboard';
  let user = null;

  if (code) {
    // Exchange the code for a session (OAuth flow)
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    user = data?.user;
  } else {
    // Magic link flow - session is already set via cookies
    // Just get the current user
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  }

  // Check if user needs to complete onboarding
  if (user) {
    const onboardingStep = user.user_metadata?.onboarding_step;
    const mustChangePassword = user.user_metadata?.must_change_password;

    console.log('[Auth Callback] User metadata:', {
      mustChangePassword,
      onboardingStep,
      email: user.email
    });

    if (mustChangePassword) {
      redirectPath = '/change-password';
    } else if (onboardingStep === 'business-profile') {
      redirectPath = '/business-profile';
    } else if (onboardingStep === 'assessment') {
      redirectPath = '/assessment';
    } else if (onboardingStep === 'results') {
      redirectPath = '/dashboard/assessment-results';
    }
  }

  console.log('[Auth Callback] Redirecting to:', redirectPath);

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(redirectPath, request.url));
}