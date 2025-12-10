import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Demo Client Setup API
 * Creates "Smith's Plumbing" - a comprehensive demo client with full data
 * for demonstration purposes
 */

// Service role client to bypass RLS for demo data creation
const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Demo client configuration
const DEMO_CLIENT = {
  email: 'demo@smithsplumbing.com.au',
  password: 'DemoPassword123!',
  firstName: 'John',
  lastName: 'Smith',
  businessName: "Smith's Plumbing Services",
  industry: 'Plumbing & Trade Services',
  annualRevenue: 1800000, // $1.8M
  employeeCount: 12,
  yearsInBusiness: 8,
  phone: '0412 345 678',
  website: 'www.smithsplumbing.com.au',
  address: '42 Industrial Drive',
  city: 'Melbourne',
  state: 'VIC',
  postalCode: '3000',
  country: 'Australia'
}

export async function POST(request: Request) {
  const authClient = await createRouteHandlerClient()
  const supabase = getServiceClient() // Use service role for all inserts

  try {
    // Check if user is authenticated and is super admin (use authClient for auth check)
    const { data: { user }, error: userError } = await authClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied. Super admin privileges required.' }, { status: 403 })
    }

    console.log('[Demo Client] Starting demo client creation...')

    // STEP 1: Create auth user
    const authResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        },
        body: JSON.stringify({
          email: DEMO_CLIENT.email,
          password: DEMO_CLIENT.password,
          email_confirm: true,
          user_metadata: {
            first_name: DEMO_CLIENT.firstName,
            last_name: DEMO_CLIENT.lastName
          }
        })
      }
    )

    const authData = await authResponse.json()

    if (!authResponse.ok) {
      // Check if user already exists
      if (authData.msg?.includes('already been registered') || authData.message?.includes('already been registered')) {
        // Find existing user by email - look up in auth system
        const listResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(DEMO_CLIENT.email)}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
            }
          }
        )
        const listData = await listResponse.json()

        // If user exists in auth but no business, delete the orphaned auth user and retry
        const { data: existingBusiness } = await supabase
          .from('businesses')
          .select('id, owner_id')
          .eq('owner_email', DEMO_CLIENT.email)
          .single()

        if (existingBusiness) {
          return NextResponse.json({
            success: true,
            message: 'Demo client already exists',
            businessId: existingBusiness.id,
            userId: existingBusiness.owner_id,
            credentials: {
              email: DEMO_CLIENT.email,
              password: DEMO_CLIENT.password
            }
          })
        }

        // Orphaned auth user - delete it and return error to retry
        if (listData.users && listData.users.length > 0) {
          const orphanedUserId = listData.users[0].id
          console.log('[Demo Client] Deleting orphaned auth user:', orphanedUserId)
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${orphanedUserId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
            }
          })
          return NextResponse.json({
            error: 'Cleaned up orphaned user. Please try again.',
            retry: true
          }, { status: 409 })
        }
      }
      console.error('[Demo Client] Auth error:', authData)
      return NextResponse.json({ error: `Failed to create user: ${authData.msg || authData.message}` }, { status: 400 })
    }

    const demoUserId = authData.id
    console.log('[Demo Client] Created auth user:', demoUserId)

    // STEP 2: Create business record
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: DEMO_CLIENT.businessName,
        business_name: DEMO_CLIENT.businessName,
        owner_id: demoUserId,
        owner_name: `${DEMO_CLIENT.firstName} ${DEMO_CLIENT.lastName}`,
        owner_email: DEMO_CLIENT.email,
        assigned_coach_id: user.id,
        enabled_modules: {
          plan: true,
          forecast: true,
          goals: true,
          chat: true,
          documents: true
        },
        status: 'active',
        invitation_sent: true,
        invitation_sent_at: new Date().toISOString(),
        industry: DEMO_CLIENT.industry,
        website: DEMO_CLIENT.website,
        address: `${DEMO_CLIENT.address}, ${DEMO_CLIENT.city} ${DEMO_CLIENT.state} ${DEMO_CLIENT.postalCode}`
      })
      .select()
      .single()

    if (businessError) {
      console.error('[Demo Client] Business creation error:', businessError)
      // Rollback auth user
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${demoUserId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        }
      })
      return NextResponse.json({ error: `Failed to create business: ${businessError.message}` }, { status: 500 })
    }

    const businessId = business.id
    console.log('[Demo Client] Created business:', businessId)

    // STEP 3: Create business profile (minimal columns - schema varies)
    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .insert({
        business_id: businessId,
        user_id: demoUserId,
        business_name: DEMO_CLIENT.businessName,
        company_name: DEMO_CLIENT.businessName,
        industry: DEMO_CLIENT.industry,
        annual_revenue: DEMO_CLIENT.annualRevenue,
        employee_count: DEMO_CLIENT.employeeCount
      })
      .select()
      .single()

    if (profileError) {
      console.error('[Demo Client] Profile creation error:', profileError)
    }

    const profileId = profile?.id

    // STEP 4: Create user roles and system roles
    await supabase.from('user_roles').insert({
      user_id: demoUserId,
      business_id: businessId,
      role: 'owner',
      created_by: user.id
    })

    await supabase.from('business_users').insert({
      business_id: businessId,
      user_id: demoUserId,
      role: 'owner'
    })

    await supabase.from('system_roles').insert({
      user_id: demoUserId,
      role: 'client',
      created_by: user.id
    })

    await supabase.from('user_permissions').insert({
      user_id: demoUserId,
      business_id: businessId,
      can_view_annual_plan: true,
      can_view_forecast: true,
      can_view_goals: true,
      can_view_documents: true,
      can_view_chat: true,
      can_edit_annual_plan: true,
      can_edit_forecast: true,
      can_edit_goals: true,
      can_upload_documents: true,
      can_manage_users: true
    })

    console.log('[Demo Client] Created roles and permissions')

    // STEP 5: Create strategy data (Vision, Mission, Core Values)
    await supabase.from('strategy_data').insert({
      user_id: demoUserId,
      business_id: businessId,
      vision: "To be Melbourne's most trusted plumbing company, known for exceptional service, reliability, and technical excellence. By 2027, we aim to serve 5,000+ customers annually while maintaining a 98% satisfaction rate.",
      mission: "We deliver professional plumbing solutions that exceed expectations. Through skilled craftsmanship, honest communication, and respect for our customers' homes and businesses, we solve plumbing problems efficiently and build lasting relationships.",
      core_values: JSON.stringify([
        { id: '1', title: 'Reliability', description: 'We show up on time, every time. Our customers can count on us.' },
        { id: '2', title: 'Integrity', description: 'Honest quotes, quality work, no hidden fees. We do what we say.' },
        { id: '3', title: 'Excellence', description: 'We take pride in our craft and continuously improve our skills.' },
        { id: '4', title: 'Respect', description: 'We treat every customer\'s property as if it were our own.' },
        { id: '5', title: 'Safety', description: 'The safety of our team and customers comes first, always.' }
      ]),
      purpose_statement: 'Keeping Melbourne homes and businesses flowing smoothly',
      brand_promise: 'Fixed right, priced right, on time.'
    })

    console.log('[Demo Client] Created strategy data')

    // STEP 6: Create completed assessment (using actual schema columns)
    await supabase.from('assessments').insert({
      user_id: demoUserId,
      status: 'completed',
      percentage: 68,
      total_score: 204,
      health_status: 'STABLE',
      attract_score: 27,  // out of 40
      convert_score: 24,  // out of 40
      deliver_score: 30,  // out of 40
      people_score: 25,   // out of 40
      systems_score: 23,  // out of 40
      finance_score: 26,  // out of 40
      leadership_score: 28, // out of 40
      time_score: 21      // out of 40
    })

    console.log('[Demo Client] Created assessment')

    // STEP 7: Create vision targets (3-year and 1-year goals)
    await supabase.from('vision_targets').insert({
      business_id: profileId || demoUserId,
      user_id: demoUserId,
      three_year_revenue: 3500000,
      three_year_gross_margin_percent: 45,
      three_year_net_margin_percent: 15,
      three_year_team_size: 20,
      three_year_strategic_position: 'Market leader in residential plumbing services across Greater Melbourne',
      three_year_capabilities: 'Full-service plumbing, smart home integration, sustainable solutions, 24/7 emergency response',
      one_year_revenue: 2200000,
      one_year_gross_profit: 990000,
      one_year_gross_margin_percent: 45,
      one_year_net_profit: 286000,
      one_year_net_margin_percent: 13,
      kpis: JSON.stringify([
        { name: 'Jobs Completed', target: 2400, unit: 'jobs/year' },
        { name: 'Average Job Value', target: 917, unit: '$' },
        { name: 'Customer Satisfaction', target: 95, unit: '%' },
        { name: 'First-Time Fix Rate', target: 92, unit: '%' },
        { name: 'Response Time', target: 2, unit: 'hours' }
      ])
    })

    console.log('[Demo Client] Created vision targets')

    // STEP 8: Create annual targets
    const currentYear = new Date().getFullYear()
    await supabase.from('annual_targets').insert({
      business_id: businessId,
      user_id: demoUserId,
      fiscal_year: currentYear,
      target_revenue: 2200000,
      q1_target: 500000,
      q2_target: 550000,
      q3_target: 600000,
      q4_target: 550000,
      target_gross_profit: 990000,
      target_net_profit: 286000,
      target_gross_margin_percent: 45,
      target_net_margin_percent: 13,
      target_customer_count: 2000,
      target_transactions: 2400,
      target_average_transaction: 917,
      target_headcount: 15
    })

    console.log('[Demo Client] Created annual targets')

    // STEP 9: Create business KPIs
    const kpis = [
      { name: 'Monthly Revenue', category: 'financial', unit: '$', target_value: 183333, current_value: 175000 },
      { name: 'Gross Margin', category: 'financial', unit: '%', target_value: 45, current_value: 43 },
      { name: 'Net Profit Margin', category: 'financial', unit: '%', target_value: 13, current_value: 11 },
      { name: 'Jobs Completed', category: 'operations', unit: 'jobs', target_value: 200, current_value: 185 },
      { name: 'Average Job Value', category: 'sales', unit: '$', target_value: 917, current_value: 946 },
      { name: 'Customer Satisfaction', category: 'customer', unit: '%', target_value: 95, current_value: 94 },
      { name: 'First-Time Fix Rate', category: 'operations', unit: '%', target_value: 92, current_value: 89 },
      { name: 'Quote Conversion Rate', category: 'sales', unit: '%', target_value: 65, current_value: 62 },
      { name: 'Team Utilization', category: 'people', unit: '%', target_value: 85, current_value: 78 },
      { name: 'Google Reviews', category: 'marketing', unit: 'rating', target_value: 4.8, current_value: 4.7 }
    ]

    for (const kpi of kpis) {
      await supabase.from('business_kpis').insert({
        business_id: businessId,
        business_profile_id: profileId,
        user_id: demoUserId,
        ...kpi,
        frequency: 'monthly',
        is_active: true
      })
    }

    console.log('[Demo Client] Created KPIs')

    // STEP 10: Create strategic initiatives
    const initiatives = [
      {
        title: 'Launch 24/7 Emergency Service',
        description: 'Implement round-the-clock emergency plumbing response to capture premium market segment',
        category: 'growth',
        priority: 'high',
        step_type: 'twelve_month',
        selected: true,
        timeline: 'Q1-Q2'
      },
      {
        title: 'Implement Field Service Management Software',
        description: 'Deploy ServiceM8 or similar to improve scheduling, invoicing, and customer communication',
        category: 'systems',
        priority: 'high',
        step_type: 'twelve_month',
        selected: true,
        timeline: 'Q1'
      },
      {
        title: 'Hire 3 Licensed Plumbers',
        description: 'Recruit and onboard experienced plumbers to handle increased demand',
        category: 'team',
        priority: 'medium',
        step_type: 'twelve_month',
        selected: true,
        timeline: 'Q2-Q3'
      },
      {
        title: 'Google Ads Campaign Launch',
        description: 'Start targeted PPC campaign for emergency plumbing and hot water keywords',
        category: 'marketing',
        priority: 'high',
        step_type: 'q1',
        selected: true,
        timeline: 'Q1'
      },
      {
        title: 'Customer Referral Program',
        description: 'Launch formal referral program with $50 credit incentive for both parties',
        category: 'sales',
        priority: 'medium',
        step_type: 'q1',
        selected: true,
        timeline: 'Q1'
      },
      {
        title: 'Standard Operating Procedures Documentation',
        description: 'Document all key business processes for consistency and training',
        category: 'systems',
        priority: 'medium',
        step_type: 'q2',
        selected: true,
        timeline: 'Q2'
      }
    ]

    for (const init of initiatives) {
      await supabase.from('strategic_initiatives').insert({
        business_id: profileId,  // Use profile ID - this is what coach view queries
        user_id: demoUserId,
        ...init,
        source: init.step_type
      })
    }

    console.log('[Demo Client] Created strategic initiatives')

    // STEP 11: Create SWOT analysis
    const { data: swotAnalysis } = await supabase
      .from('swot_analyses')
      .insert({
        business_id: demoUserId,
        user_id: demoUserId,
        type: 'quarterly',
        quarter: Math.ceil((new Date().getMonth() + 1) / 3),
        year: currentYear,
        title: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${currentYear} SWOT Analysis`
      })
      .select()
      .single()

    if (swotAnalysis) {
      const swotItems = [
        // Strengths
        { category: 'strength', title: 'Strong reputation', description: '4.7 star Google rating with 200+ reviews', priority: 1 },
        { category: 'strength', title: 'Experienced team', description: 'Average 8+ years experience per plumber', priority: 2 },
        { category: 'strength', title: 'Wide service area', description: 'Cover all Melbourne metro within 1 hour', priority: 3 },
        { category: 'strength', title: 'Licensed and insured', description: 'Full compliance and $10M liability cover', priority: 4 },
        // Weaknesses
        { category: 'weakness', title: 'No after-hours service', description: 'Missing emergency market segment', priority: 1 },
        { category: 'weakness', title: 'Manual scheduling', description: 'Paper-based system causing inefficiencies', priority: 2 },
        { category: 'weakness', title: 'Limited online presence', description: 'Website needs updating, no social media', priority: 3 },
        { category: 'weakness', title: 'Cash flow timing', description: '45+ day average collection period', priority: 4 },
        // Opportunities
        { category: 'opportunity', title: 'Emergency services market', description: 'High-margin 24/7 service demand growing', priority: 1 },
        { category: 'opportunity', title: 'Commercial contracts', description: 'Strata and property management partnerships', priority: 2 },
        { category: 'opportunity', title: 'Hot water system upgrades', description: 'Rebate programs driving heat pump demand', priority: 3 },
        { category: 'opportunity', title: 'Trade shortage', description: 'Skilled plumber shortage = pricing power', priority: 4 },
        // Threats
        { category: 'threat', title: 'Competition from franchises', description: 'Jim\'s Plumbing and similar expanding', priority: 1 },
        { category: 'threat', title: 'Rising material costs', description: 'Copper and PVC prices up 15% YoY', priority: 2 },
        { category: 'threat', title: 'Apprentice shortage', description: 'Hard to find and train new plumbers', priority: 3 },
        { category: 'threat', title: 'Economic uncertainty', description: 'Renovation slowdown affecting job volume', priority: 4 }
      ]

      for (const item of swotItems) {
        await supabase.from('swot_items').insert({
          swot_analysis_id: swotAnalysis.id,
          ...item,
          status: 'active'
        })
      }
    }

    console.log('[Demo Client] Created SWOT analysis')

    // STEP 12: Create quarterly review
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)
    await supabase.from('quarterly_reviews').insert({
      business_id: businessId,
      user_id: demoUserId,
      quarter: currentQuarter,
      year: currentYear,
      status: 'in_progress',
      data: {
        wins: [
          'Completed bathroom renovation project for commercial client - $45K',
          'Achieved 94% customer satisfaction rating',
          'Hired 1 new licensed plumber',
          'Reduced quote response time to under 2 hours'
        ],
        challenges: [
          'Lost 2 commercial contracts to competitors',
          'Vehicle breakdown caused 3 missed appointments',
          'Cash flow tight in first 2 weeks of quarter'
        ],
        lessons: [
          'Need dedicated sales person for commercial tenders',
          'Vehicle maintenance schedule needs review',
          'Consider invoice financing for larger jobs'
        ],
        kpi_review: {
          revenue: { actual: 480000, target: 500000, variance: -4 },
          jobs: { actual: 510, target: 500, variance: 2 },
          satisfaction: { actual: 94, target: 95, variance: -1 }
        }
      }
    })

    console.log('[Demo Client] Created quarterly review')

    // STEP 13: Create weekly reviews (last 8 weeks)
    const weeklyReviews = []
    for (let i = 7; i >= 0; i--) {
      const weekDate = new Date()
      weekDate.setDate(weekDate.getDate() - (i * 7))
      const weekStart = new Date(weekDate)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday

      weeklyReviews.push({
        business_id: businessId,
        user_id: demoUserId,
        week_start: weekStart.toISOString().split('T')[0],
        status: i === 0 ? 'in_progress' : 'completed',
        data: {
          health_score: 70 + Math.floor(Math.random() * 20),
          biggest_win: [
            'Completed 3 hot water system installations',
            'Won commercial maintenance contract',
            'Received 5 new Google reviews',
            'Hired apprentice plumber',
            'Launched referral program',
            'Reduced response time to 1.5 hours',
            'Completed major bathroom reno',
            'Closed $25K commercial quote'
          ][7 - i],
          main_challenge: [
            'Parts delay on special order',
            'Staff illness affected scheduling',
            'Vehicle needed emergency repairs',
            'Cash flow timing issue',
            'Quote conversion below target',
            'Customer complaint resolution',
            'Scheduling conflict',
            'Weather delays on outdoor jobs'
          ][7 - i],
          priorities_next_week: [
            'Follow up on 5 outstanding quotes',
            'Complete warranty callback',
            'Interview 2 plumber candidates'
          ],
          metrics: {
            revenue: 38000 + Math.floor(Math.random() * 8000),
            jobs_completed: 42 + Math.floor(Math.random() * 15),
            quotes_sent: 25 + Math.floor(Math.random() * 10),
            quotes_won: 15 + Math.floor(Math.random() * 8)
          }
        }
      })
    }

    for (const review of weeklyReviews) {
      await supabase.from('weekly_reviews').insert(review)
    }

    console.log('[Demo Client] Created weekly reviews')

    // STEP 14: Create financial forecast data
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .insert({
        business_id: businessId,
        user_id: demoUserId,
        name: '2025 Growth Forecast',
        description: 'Primary forecast for scaling to $2.2M revenue',
        status: 'active',
        fiscal_year_start: `${currentYear}-07-01`,
        forecast_type: 'bottom_up',
        baseline_revenue: DEMO_CLIENT.annualRevenue,
        target_revenue: 2200000,
        baseline_gross_margin: 42,
        target_gross_margin: 45,
        assumptions: {
          growth_rate: 22,
          price_increase: 5,
          new_customers: 400,
          avg_transaction_growth: 8
        }
      })
      .select()
      .single()

    if (forecast) {
      // Create P&L lines
      const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
      const baseRevenue = [165000, 170000, 175000, 180000, 185000, 190000, 180000, 175000, 185000, 195000, 200000, 200000]

      for (let i = 0; i < 12; i++) {
        const revenue = baseRevenue[i]
        const cogs = revenue * 0.55
        const grossProfit = revenue - cogs
        const opex = revenue * 0.32
        const netProfit = grossProfit - opex

        await supabase.from('forecast_pl_lines').insert({
          forecast_id: forecast.id,
          period_index: i,
          period_label: months[i],
          revenue,
          cogs,
          gross_profit: grossProfit,
          opex,
          net_profit: netProfit
        })
      }
    }

    console.log('[Demo Client] Created financial forecast')

    // STEP 15: Create team members
    const teamMembers = [
      { first_name: 'Mike', last_name: 'Johnson', role: 'Lead Plumber', email: 'mike@smithsplumbing.com.au' },
      { first_name: 'Sarah', last_name: 'Chen', role: 'Office Manager', email: 'sarah@smithsplumbing.com.au' },
      { first_name: 'David', last_name: 'Williams', role: 'Senior Plumber', email: 'david@smithsplumbing.com.au' }
    ]

    for (const member of teamMembers) {
      await supabase.from('team_data').insert({
        business_id: businessId,
        user_id: demoUserId,
        ...member,
        status: 'active',
        department: member.role.includes('Plumber') ? 'Operations' : 'Admin'
      })
    }

    console.log('[Demo Client] Created team members')

    // STEP 16: Create some messages (coach-client communication)
    await supabase.from('messages').insert([
      {
        business_id: businessId,
        sender_id: user.id,
        content: "Hi John, great progress on the quarterly review! Let's discuss the 24/7 service launch in our next session.",
        is_from_coach: true,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        business_id: businessId,
        sender_id: demoUserId,
        content: "Thanks! Yes, I've been researching the software options. ServiceM8 looks promising. Can we review the ROI together?",
        is_from_coach: false,
        created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        business_id: businessId,
        sender_id: user.id,
        content: "Absolutely. I'll prepare a comparison of ServiceM8 vs Tradify for our session. Also noticed your quote conversion is at 62% - let's work on that.",
        is_from_coach: true,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    ])

    console.log('[Demo Client] Created messages')

    // STEP 17: Create coaching sessions
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    nextWeek.setHours(10, 0, 0, 0)

    await supabase.from('coaching_sessions').insert({
      coach_id: user.id,
      client_id: demoUserId,
      business_id: businessId,
      title: 'Monthly Strategy Session',
      description: 'Review Q1 progress, discuss 24/7 service launch, sales conversion strategies',
      scheduled_at: nextWeek.toISOString(),
      duration_minutes: 60,
      status: 'scheduled',
      meeting_url: 'https://meet.google.com/demo-session'
    })

    console.log('[Demo Client] Created coaching session')

    // STEP 18: Create onboarding progress
    await supabase.from('onboarding_progress').insert({
      business_id: businessId,
      profile_completed: true,
      assessment_completed: true,
      vision_completed: true,
      goals_completed: true,
      forecast_completed: true,
      profile_completed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      assessment_completed_at: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
    })

    console.log('[Demo Client] Created onboarding progress')

    console.log('[Demo Client] ✅ Demo client creation complete!')

    return NextResponse.json({
      success: true,
      message: 'Demo client created successfully',
      client: {
        businessId,
        userId: demoUserId,
        businessName: DEMO_CLIENT.businessName,
        profileId
      },
      credentials: {
        email: DEMO_CLIENT.email,
        password: DEMO_CLIENT.password
      },
      summary: {
        vision: '✅ Vision, Mission, Core Values',
        assessment: '✅ 8 Engine Assessment',
        targets: '✅ 3-Year and 1-Year Targets',
        kpis: '✅ 10 Business KPIs',
        initiatives: '✅ 6 Strategic Initiatives',
        swot: '✅ SWOT Analysis with 16 items',
        quarterlyReview: '✅ Current Quarter Review',
        weeklyReviews: '✅ 8 Weeks of Reviews',
        forecast: '✅ 12-Month Financial Forecast',
        team: '✅ 3 Team Members',
        messages: '✅ Coach-Client Messages',
        session: '✅ Upcoming Coaching Session'
      }
    })

  } catch (error) {
    console.error('[Demo Client] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET - Check if demo client exists
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, owner_id, owner_email, status, created_at')
      .eq('owner_email', DEMO_CLIENT.email)
      .single()

    if (business) {
      return NextResponse.json({
        exists: true,
        business,
        credentials: {
          email: DEMO_CLIENT.email,
          password: DEMO_CLIENT.password
        }
      })
    }

    return NextResponse.json({ exists: false })

  } catch (error) {
    return NextResponse.json({ exists: false })
  }
}

// DELETE - Remove demo client
export async function DELETE(request: Request) {
  const authClient = await createRouteHandlerClient()
  const supabase = getServiceClient() // Use service role for deletions

  try {
    const { data: { user }, error: userError } = await authClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Find demo business
    const { data: business } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('owner_email', DEMO_CLIENT.email)
      .single()

    if (!business) {
      return NextResponse.json({ success: true, message: 'Demo client does not exist' })
    }

    const { id: businessId, owner_id: ownerId } = business

    // Delete in order (foreign key constraints)
    await supabase.from('messages').delete().eq('business_id', businessId)
    await supabase.from('coaching_sessions').delete().eq('business_id', businessId)
    await supabase.from('weekly_reviews').delete().eq('business_id', businessId)
    await supabase.from('quarterly_reviews').delete().eq('business_id', businessId)

    // Get forecast IDs first, then delete
    const { data: forecasts } = await supabase
      .from('financial_forecasts')
      .select('id')
      .eq('business_id', businessId)

    if (forecasts && forecasts.length > 0) {
      const forecastIds = forecasts.map(f => f.id)
      await supabase.from('forecast_pl_lines').delete().in('forecast_id', forecastIds)
    }
    await supabase.from('financial_forecasts').delete().eq('business_id', businessId)

    // Delete initiatives by user_id since they were created with profile ID as business_id
    await supabase.from('strategic_initiatives').delete().eq('user_id', ownerId)
    await supabase.from('business_kpis').delete().eq('business_id', businessId)
    await supabase.from('annual_targets').delete().eq('business_id', businessId)
    await supabase.from('vision_targets').delete().eq('user_id', ownerId)

    // Get SWOT analysis IDs first, then delete items
    const { data: swotAnalyses } = await supabase
      .from('swot_analyses')
      .select('id')
      .eq('user_id', ownerId)

    if (swotAnalyses && swotAnalyses.length > 0) {
      const swotIds = swotAnalyses.map(s => s.id)
      await supabase.from('swot_items').delete().in('swot_analysis_id', swotIds)
    }
    await supabase.from('swot_analyses').delete().eq('user_id', ownerId)

    await supabase.from('strategy_data').delete().eq('user_id', ownerId)
    await supabase.from('assessments').delete().eq('user_id', ownerId)
    await supabase.from('team_data').delete().eq('business_id', businessId)
    await supabase.from('onboarding_progress').delete().eq('business_id', businessId)
    await supabase.from('user_permissions').delete().eq('business_id', businessId)
    await supabase.from('user_roles').delete().eq('business_id', businessId)
    await supabase.from('business_users').delete().eq('business_id', businessId)
    await supabase.from('business_profiles').delete().eq('business_id', businessId)
    await supabase.from('system_roles').delete().eq('user_id', ownerId)
    await supabase.from('businesses').delete().eq('id', businessId)

    // Delete auth user
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${ownerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      }
    })

    return NextResponse.json({ success: true, message: 'Demo client deleted' })

  } catch (error) {
    console.error('[Demo Client] Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete demo client' }, { status: 500 })
  }
}
