import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// For use in Server Components
export const createServerClient = () => {
  const cookieStore = cookies();
  return createServerComponentClient({ cookies: () => cookieStore });
};

// Type exports for better TypeScript support
export type SupabaseServerClient = ReturnType<typeof createServerClient>;