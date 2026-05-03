import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Find Sydney Pressed Metal profile
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('*')
    .ilike('business_name', '%sydney pressed%')
    .single();

  console.log('=== SYDNEY PRESSED METAL ===');
  console.log('Profile ID:', profile?.id);
  console.log('User ID:', profile?.user_id);

  if (!profile) {
    console.log('Profile not found!');
    return;
  }

  // Check business_kpis table
  console.log('\n=== business_kpis table ===');
  const { data: kpis, error: kpiError } = await supabase
    .from('business_kpis')
    .select('*')
    .eq('business_id', profile.id);

  if (kpiError) {
    console.log('Error:', kpiError.message);
  } else {
    console.log('Found', (kpis && kpis.length) || 0, 'KPIs');
    if (kpis && kpis.length > 0) {
      kpis.forEach(k => {
        console.log('\n  Name:', k.name);
        console.log('  KPI ID:', k.kpi_id);
        console.log('  Category:', k.category);
        console.log('  Current:', k.current_value);
        console.log('  Year1:', k.year1_target);
        console.log('  Year2:', k.year2_target);
        console.log('  Year3:', k.year3_target);
      });
    }
  }

  // Also check with user_id
  console.log('\n=== business_kpis by user_id ===');
  const { data: kpis2 } = await supabase
    .from('business_kpis')
    .select('*')
    .eq('business_id', profile.user_id);

  console.log('Found', (kpis2 && kpis2.length) || 0, 'KPIs under user_id');
  if (kpis2 && kpis2.length > 0) {
    kpis2.forEach(k => {
      console.log('  -', k.name, '| current:', k.current_value, '| y1:', k.year1_target);
    });
  }

  // Check table structure
  console.log('\n=== Table columns ===');
  if (kpis && kpis[0]) {
    console.log('Columns:', Object.keys(kpis[0]));
  }
}

check().catch(console.error);
