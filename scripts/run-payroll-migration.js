const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = 'https://uudfstpvndurzwnapibf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZGZzdHB2bmR1cnp3bmFwaWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI0NDU1NiwiZXhwIjoyMDY5ODIwNTU2fQ.-hhZzqVGaWMhIYMNvoEZMgpIekRClNcIOwjn-gfZN5c'

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runMigration() {
  console.log('Running payroll migration...')

  const migrationPath = path.join(__dirname, '../supabase/migrations/20241123_enhanced_payroll_fields.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'))

  for (const statement of statements) {
    console.log('Executing:', statement.substring(0, 100) + '...')
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' })
      if (error) {
        // Try direct execution
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ query: statement + ';' })
        })
        if (!response.ok) {
          console.error('Error executing statement:', error || await response.text())
        } else {
          console.log('✓ Success')
        }
      } else {
        console.log('✓ Success')
      }
    } catch (err) {
      console.error('Error:', err.message)
    }
  }

  console.log('\nMigration complete!')
}

runMigration().catch(console.error)
