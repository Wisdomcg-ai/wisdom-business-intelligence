import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST() {
  try {
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
