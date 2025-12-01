import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

// PROTECTED: Requires super_admin role
// Migration for OPEX fields

export async function POST() {
  try {
    // Verify user is authenticated and is super_admin
    const authSupabase = await createRouteHandlerClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData } = await authSupabase
      .from('users')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (userData?.system_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    // Create service role client for migrations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Run the migration SQL
    const { error } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE financial_forecasts
        ADD COLUMN IF NOT EXISTS cogs_percentage DECIMAL(5, 4),
        ADD COLUMN IF NOT EXISTS opex_wages DECIMAL(15, 2),
        ADD COLUMN IF NOT EXISTS opex_fixed DECIMAL(15, 2),
        ADD COLUMN IF NOT EXISTS opex_variable DECIMAL(15, 2),
        ADD COLUMN IF NOT EXISTS opex_variable_percentage DECIMAL(5, 4),
        ADD COLUMN IF NOT EXISTS opex_other DECIMAL(15, 2);
      `
    })

    if (error) {
      console.error('Migration error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Migration completed' })
  } catch (err) {
    console.error('Migration failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
