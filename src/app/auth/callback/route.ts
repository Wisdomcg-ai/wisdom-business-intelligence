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

  // Step 2: Get user from session
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  console.log('[Auth Callback] Session user:', {
    hasUser: !!user,
    userId: user?.id,
    email: user?.email,
    error: userError?.message
  });

  if (!user) {
    console.error('[Auth Callback] No user after session:', userError);
    return NextResponse.redirect(new URL('/auth/login?error=no_user', request.url));
  }

  // Step 3: Fetch user metadata directly from Admin API (more reliable than session cache)
  let mustChangePassword = user.user_metadata?.must_change_password;
  let onboardingStep = user.user_metadata?.onboarding_step;
  let onboardingCompleted = user.user_metadata?.onboarding_completed;

  console.log('[Auth Callback] Session metadata:', {
    mustChangePassword,
    onboardingStep,
    onboardingCompleted
  });

  // If session metadata is missing key flags, fetch directly from Admin API
  if (mustChangePassword === undefined && onboardingStep === undefined) {
    console.log('[Auth Callback] Session metadata incomplete, fetching from Admin API...');

    try {
      const adminResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          }
        }
      );

      if (adminResponse.ok) {
        const adminUser = await adminResponse.json();
        mustChangePassword = adminUser.user_metadata?.must_change_password;
        onboardingStep = adminUser.user_metadata?.onboarding_step;
        onboardingCompleted = adminUser.user_metadata?.onboarding_completed;

        console.log('[Auth Callback] Admin API metadata:', {
          mustChangePassword,
          onboardingStep,
          onboardingCompleted,
          fullMetadata: adminUser.user_metadata
        });
      } else {
        console.error('[Auth Callback] Admin API fetch failed:', await adminResponse.text());
      }
    } catch (err) {
      console.error('[Auth Callback] Admin API error:', err);
    }
  }

  // Determine redirect based on onboarding state
  // Check for truthy value (handles both boolean true and string "true")
  if (mustChangePassword === true || mustChangePassword === 'true') {
    redirectPath = '/change-password';
  } else if (onboardingStep === 'business-profile') {
    redirectPath = '/business-profile';
  } else if (onboardingStep === 'assessment') {
    redirectPath = '/assessment';
  } else if (onboardingStep === 'results') {
    redirectPath = '/dashboard/assessment-results';
  }

  console.log('[Auth Callback] Final redirect:', redirectPath);

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(redirectPath, request.url));
}