import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST() {
  try {
    console.log('Running migration: Add forecast_method and analysis columns');

    // Add forecast_method column
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql_query: `
        ALTER TABLE forecast_pl_lines
        ADD COLUMN IF NOT EXISTS forecast_method JSONB DEFAULT NULL;
      `
    });

    if (error1) {
      console.error('Error adding forecast_method column:', error1);
    }

    // Add analysis column
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql_query: `
        ALTER TABLE forecast_pl_lines
        ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;
      `
    });

    if (error2) {
      console.error('Error adding analysis column:', error2);
    }

    // Try direct approach if RPC doesn't work
    if (error1 || error2) {
      // Just update the schema through a regular query
      const { error: directError } = await supabase
        .from('forecast_pl_lines')
        .select('forecast_method, analysis')
        .limit(1);

      if (directError && directError.message.includes('column')) {
        return NextResponse.json({
          success: false,
          error: 'Columns do not exist. Please run the migration manually in Supabase SQL Editor.',
          sql: `
ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS forecast_method JSONB DEFAULT NULL;

ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;
          `
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully'
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sql: `
ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS forecast_method JSONB DEFAULT NULL;

ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;
      `
    }, { status: 500 });
  }
}
