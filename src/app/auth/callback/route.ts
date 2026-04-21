import { createRouteHandlerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Only allow same-origin relative paths as `next` to prevent open-redirect abuse.
function safeNextPath(next: string | null): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  // Handle OAuth errors
  if (error) {
    console.error('[Auth Callback] OAuth error:', error, errorDescription);
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('error', errorDescription || error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    console.error('[Auth Callback] No code provided');
    return NextResponse.redirect(new URL('/auth/login?error=No authorization code provided', request.url));
  }

  try {
    const supabase = await createRouteHandlerClient();

    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[Auth Callback] Session exchange error:', exchangeError);
      return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(exchangeError.message)}`, request.url));
    }

    // Redirect to the appropriate dashboard based on role
    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', (await supabase.auth.getUser()).data.user!.id)
      .maybeSingle()

    const role = roleRow?.role
    const roleDefault = role === 'coach' ? '/coach/dashboard'
      : role === 'super_admin' ? '/admin'
      : '/dashboard'

    // If the caller gave a safe `next` path, prefer it — lets coaches return
    // to the exact client file they were editing before their session expired.
    const destination = next ?? roleDefault

    return NextResponse.redirect(new URL(destination, request.url));
  } catch (err) {
    console.error('[Auth Callback] Unexpected error:', err);
    return NextResponse.redirect(new URL('/auth/login?error=Authentication failed', request.url));
  }
}