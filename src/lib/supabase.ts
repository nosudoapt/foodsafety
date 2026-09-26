import { createBrowserClient } from '@supabase/ssr'

// Browser client with cookie-based session storage so middleware.ts can
// read the session server-side. Same `supabase` export as before — all
// existing imports keep working.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
)
