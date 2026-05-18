import '@testing-library/jest-dom'

// Placeholder Supabase env vars so module-scoped client init in route files
// resolves a key instead of throwing under test. The publishable/secret
// resolvers (src/lib/supabase/keys.ts) throw when no key is set; production
// always has these set, so tests need a stub. The placeholder host keeps
// live-DB migration tests skipping via skipIfNoLiveDb().
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test_placeholder'
process.env.SUPABASE_SECRET_KEY ??= 'sb_secret_test_placeholder'
