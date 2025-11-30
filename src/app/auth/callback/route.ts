import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  let redirectPath = '/dashboard';

  if (code) {
    const supabase = await createRouteHandlerClient();

    // Exchange the code for a session
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // Check if user needs to complete onboarding
    if (data?.user) {
      const onboardingStep = data.user.user_metadata?.onboarding_step;
      const mustChangePassword = data.user.user_metadata?.must_change_password;

      if (mustChangePassword) {
        redirectPath = '/change-password';
      } else if (onboardingStep === 'business-profile') {
        redirectPath = '/business-profile';
      } else if (onboardingStep === 'assessment') {
        redirectPath = '/assessment';
      } else if (onboardingStep === 'results') {
        redirectPath = '/assessment/results';
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(redirectPath, request.url));
}