import { createClient } from '@supabase/supabase-js';

// Replace these with your Supabase credentials from .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''; // You'll need to add this

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Sample business data
const sampleBusinesses = [
  { name: "Tech Solutions Inc", industry: "Technology", revenue: "$2.5M", stage: "SCALING" },
  { name: "Green Energy Co", industry: "Energy", revenue: "$8M", stage: "LEADERSHIP" },
  { name: "Local Coffee Roasters", industry: "Food & Beverage", revenue: "$450K", stage: "TRACTION" },
  { name: "Digital Marketing Agency", industry: "Marketing", revenue: "$1.2M", stage: "SCALING" },
  { name: "Construction Partners", industry: "Construction", revenue: "$5.5M", stage: "OPTIMIZATION" },
  { name: "Health & Wellness Center", industry: "Healthcare", revenue: "$750K", stage: "TRACTION" },
  { name: "E-commerce Store", industry: "Retail", revenue: "$3.2M", stage: "OPTIMIZATION" },
  { name: "Professional Services Ltd", industry: "Consulting", revenue: "$900K", stage: "TRACTION" },
  { name: "Manufacturing Co", industry: "Manufacturing", revenue: "$12M", stage: "MASTERY" },
  { name: "Software Startup", industry: "SaaS", revenue: "$150K", stage: "FOUNDATION" },
  { name: "Logistics Solutions", industry: "Transportation", revenue: "$4.1M", stage: "OPTIMIZATION" },
  { name: "Creative Design Studio", industry: "Design", revenue: "$650K", stage: "TRACTION" },
  { name: "Financial Advisors", industry: "Finance", revenue: "$2.8M", stage: "SCALING" },
  { name: "Auto Repair Shop", industry: "Automotive", revenue: "$380K", stage: "TRACTION" },
  { name: "Online Education Platform", industry: "Education", revenue: "$1.5M", stage: "SCALING" },
  { name: "Real Estate Group", industry: "Real Estate", revenue: "$7.2M", stage: "LEADERSHIP" },
  { name: "Fitness Chain", industry: "Fitness", revenue: "$3.5M", stage: "OPTIMIZATION" },
  { name: "IT Services Provider", industry: "IT Services", revenue: "$950K", stage: "TRACTION" },
  { name: "Legal Practice", industry: "Legal", revenue: "$2.1M", stage: "SCALING" },
  { name: "Event Management Co", industry: "Events", revenue: "$520K", stage: "TRACTION" },
  { name: "Home Services Pro", industry: "Home Services", revenue: "$1.8M", stage: "SCALING" },
  { name: "Import/Export Business", industry: "Trade", revenue: "$6.3M", stage: "LEADERSHIP" },
  { name: "Restaurant Group", industry: "Hospitality", revenue: "$4.5M", stage: "OPTIMIZATION" },
  { name: "Cleaning Services", industry: "Services", revenue: "$280K", stage: "FOUNDATION" },
  { name: "Security Solutions", industry: "Security", revenue: "$1.1M", stage: "SCALING" },
  { name: "Travel Agency", industry: "Travel", revenue: "$420K", stage: "TRACTION" },
  { name: "Agricultural Supply", industry: "Agriculture", revenue: "$3.8M", stage: "OPTIMIZATION" },
  { name: "Wholesale Distributor", industry: "Distribution", revenue: "$5.9M", stage: "LEADERSHIP" },
  { name: "Recruitment Firm", industry: "HR Services", revenue: "$780K", stage: "TRACTION" },
  { name: "Insurance Broker", industry: "Insurance", revenue: "$1.3M", stage: "SCALING" },
  { name: "Media Production", industry: "Media", revenue: "$890K", stage: "TRACTION" },
  { name: "Biotech Startup", industry: "Biotechnology", revenue: "$95K", stage: "FOUNDATION" },
  { name: "Dental Practice", industry: "Healthcare", revenue: "$1.6M", stage: "SCALING" },
  { name: "Accounting Firm", industry: "Accounting", revenue: "$2.3M", stage: "SCALING" },
  { name: "Solar Installation Co", industry: "Renewable Energy", revenue: "$3.1M", stage: "OPTIMIZATION" },
  { name: "Pet Care Services", industry: "Pet Services", revenue: "$340K", stage: "TRACTION" },
  { name: "Fashion Retailer", industry: "Fashion", revenue: "$1.9M", stage: "SCALING" },
  { name: "Engineering Consultancy", industry: "Engineering", revenue: "$4.7M", stage: "OPTIMIZATION" }
];

// Health statuses and scores
const healthStatuses = [
  { status: 'THRIVING', minScore: 90, maxScore: 100 },
  { status: 'STRONG', minScore: 80, maxScore: 89 },
  { status: 'STABLE', minScore: 70, maxScore: 79 },
  { status: 'BUILDING', minScore: 60, maxScore: 69 },
  { status: 'STRUGGLING', minScore: 50, maxScore: 59 },
  { status: 'URGENT', minScore: 30, maxScore: 49 }
];

// Revenue stages mapping
const revenueStages: Record<string, string> = {
  'FOUNDATION': 'Under $250K',
  'TRACTION': '$250K - $1M',
  'SCALING': '$1M - $3M', 
  'OPTIMIZATION': '$3M - $5M',
  'LEADERSHIP': '$5M - $10M',
  'MASTERY': '$10M+'
};

async function createTestData() {
  console.log('Starting to create test clients...\n');

  // Get the first user to be the owner
  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error('Error: No user found. Please make sure you have logged in at least once.');
    return;
  }

  const ownerId = users[0].id;
  console.log(`Using owner ID: ${ownerId}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const business of sampleBusinesses) {
    try {
      // Create the business
      const { data: newBusiness, error: businessError } = await supabase
        .from('businesses')
        .insert({
          business_name: business.name,
          industry: business.industry,
          revenue_stage: revenueStages[business.stage],
          created_by: ownerId
        })
        .select()
        .single();

      if (businessError) {
        console.error(`❌ Error creating ${business.name}:`, businessError.message);
        errorCount++;
        continue;
      }

      // Add the owner as a member
      const { error: memberError } = await supabase
        .from('business_members')
        .insert({
          business_id: newBusiness.id,
          user_id: ownerId,
          role: 'owner'
        });

      if (memberError) {
        console.error(`❌ Error adding member for ${business.name}:`, memberError.message);
      }

      // Create an assessment with random health score based on stage
      const healthRange = business.stage === 'FOUNDATION' ? healthStatuses[4] : // STRUGGLING
                         business.stage === 'TRACTION' ? healthStatuses[3] : // BUILDING
                         business.stage === 'SCALING' ? healthStatuses[2] : // STABLE
                         business.stage === 'OPTIMIZATION' ? healthStatuses[1] : // STRONG
                         business.stage === 'LEADERSHIP' ? healthStatuses[0] : // THRIVING
                         healthStatuses[0]; // THRIVING for MASTERY

      const healthScore = Math.floor(Math.random() * (healthRange.maxScore - healthRange.minScore + 1)) + healthRange.minScore;
      
      // Random days since assessment (0-120 days)
      const daysAgo = Math.floor(Math.random() * 120);
      const assessmentDate = new Date();
      assessmentDate.setDate(assessmentDate.getDate() - daysAgo);

      const { error: assessmentError } = await supabase
        .from('assessments')
        .insert({
          business_id: newBusiness.id,
          completed_by: ownerId,
          health_score: healthScore,
          health_status: healthRange.status,
          completion_percentage: 100,
          completed_at: assessmentDate.toISOString(),
          
          // Add some sample scores for different sections
          foundation_score: Math.floor(Math.random() * 20) + 20,
          foundation_max: 40,
          
          strategic_wheel_score: Math.floor(Math.random() * 30) + 30,
          strategic_wheel_max: 60,
          
          profitability_score: Math.floor(Math.random() * 15) + 15,
          profitability_max: 30,
          
          engines_score: Math.floor(Math.random() * 50) + 50,
          engines_max: 100,
          
          disciplines_score: Math.floor(Math.random() * 30) + 30,
          disciplines_max: 60,
          
          total_score: Math.floor(healthScore * 2.9), // Out of 290
          total_max: 290
        });

      if (assessmentError) {
        console.error(`❌ Error creating assessment for ${business.name}:`, assessmentError.message);
      } else {
        console.log(`✅ Created ${business.name} (${business.industry}) - ${healthRange.status} (${healthScore}%) - ${daysAgo} days ago`);
        successCount++;
      }

    } catch (error) {
      console.error(`❌ Unexpected error with ${business.name}:`, error);
      errorCount++;
    }
  }

  console.log('\n=====================================');
  console.log(`✅ Successfully created: ${successCount} clients`);
  if (errorCount > 0) {
    console.log(`❌ Errors encountered: ${errorCount}`);
  }
  console.log('=====================================\n');
  console.log('🎉 Test data creation complete!');
  console.log('Go to http://localhost:3000/coach-dashboard to see your clients');
}

// Run the script
createTestData().catch(console.error);
