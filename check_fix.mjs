import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  console.log('Checking notifications table structure...');
  
  // Try to select from notifications to see the columns
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('Error querying notifications:', error.message);
  } else {
    console.log('Notifications columns:', data.length > 0 ? Object.keys(data[0]) : 'No rows, but table exists');
  }
  
  // Try adding the data column
  console.log('\nAttempting to add data column via insert test...');
  const testInsert = await supabase
    .from('notifications')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      type: 'test',
      title: 'Test',
      message: 'Test',
      data: { test: true }
    });
  
  if (testInsert.error) {
    console.log('Insert with data column failed:', testInsert.error.message);
    
    // The column doesn't exist, we need to add it via SQL
    console.log('\n⚠️  The "data" column needs to be added to the notifications table.');
    console.log('Run this SQL in Supabase Dashboard:\n');
    console.log('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB;');
  } else {
    console.log('Insert succeeded - data column exists');
    // Delete the test row
    await supabase.from('notifications').delete().eq('type', 'test');
  }
}

main().catch(console.error);
