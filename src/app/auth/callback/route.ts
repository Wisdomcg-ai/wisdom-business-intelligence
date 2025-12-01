import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const supabase = await createRouteHandlerClient();

  // Exchange the code for a session (OAuth/PKCE flow)
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error('[Auth Callback] Code exchange error:', exchangeError);
      return NextResponse.redirect(new URL('/auth/login?error=session_error', request.url));
    }
  }

  // Redirect to dashboard - middleware will handle any onboarding redirects
  // (e.g., redirect to /change-password if must_change_password is true)
  return NextResponse.redirect(new URL('/dashboard', request.url));
}