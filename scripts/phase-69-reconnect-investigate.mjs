// Phase 69-02 — investigate why Envisage reconnect didn't persist
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const { data: recent } = await sb
  .from('xero_connections')
  .select('id, business_id, tenant_id, tenant_name, expires_at, updated_at, is_active, created_at')
  .gte('updated_at', tenMinAgo)
  .order('updated_at', { ascending: false });

console.log(`\n=== xero_connections rows updated since ${tenMinAgo} (last 10 min) ===`);
console.log(recent && recent.length ? JSON.stringify(recent, null, 2) : '(none)');

const { data: envisage } = await sb
  .from('xero_connections')
  .select('id, business_id, tenant_id, tenant_name, expires_at, updated_at, is_active, created_at')
  .eq('business_id', '8c8c63b2-bdc4-4115-9375-8d0fd89acc00')
  .order('updated_at', { ascending: false });
console.log('\n=== ALL rows for Envisage businesses.id ===');
console.log(envisage && envisage.length ? JSON.stringify(envisage, null, 2) : '(none)');

const { data: malouf } = await sb
  .from('xero_connections')
  .select('id, business_id, tenant_id, tenant_name, expires_at, updated_at, is_active, created_at')
  .eq('tenant_id', '04d9df1f-53b0-4d1c-ba9e-4ce49b9c8860')
  .order('updated_at', { ascending: false });
console.log('\n=== ALL rows for Malouf tenant_id (across any business) ===');
console.log(malouf && malouf.length ? JSON.stringify(malouf, null, 2) : '(none)');

// Also: pending_xero_connection rows?
const { data: pending } = await sb
  .from('pending_xero_connections')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('\n=== pending_xero_connections (last 5) ===');
console.log(pending && pending.length ? JSON.stringify(pending, null, 2) : '(table missing or empty)');
