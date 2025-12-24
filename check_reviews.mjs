import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://uudfstpvndurzwnapibf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZGZzdHB2bmR1cnp3bmFwaWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI0NDU1NiwiZXhwIjoyMDY5ODIwNTU2fQ.-hhZzqVGaWMhIYMNvoEZMgpIekRClNcIOwjn-gfZN5c'
);

const businessId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00';

const { data: reviews } = await supabase
  .from('quarterly_reviews')
  .select('id, quarter, year, status, current_step, completed_at')
  .eq('business_id', businessId)
  .order('year', { ascending: false })
  .order('quarter', { ascending: false });

console.log('All reviews for Envisage:');
reviews.forEach(r => {
  console.log('  Q' + r.quarter, r.year, '-', r.status, '(step:', r.current_step + ')');
});

const currentQuarter = 4;
const currentYear = 2025;
const currentQuarterReview = reviews.find(r => r.quarter === currentQuarter && r.year === currentYear);

console.log('');
console.log('Current quarter (Q4 2025) review:');
if (currentQuarterReview) {
  console.log('  ID:', currentQuarterReview.id);
  console.log('  Status:', currentQuarterReview.status);
  console.log('  Current Step:', currentQuarterReview.current_step);
  console.log('  Completed At:', currentQuarterReview.completed_at);
}
