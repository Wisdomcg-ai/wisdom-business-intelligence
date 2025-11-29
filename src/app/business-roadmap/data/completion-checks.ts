/**
 * Build Completion Check Questions
 *
 * Each build has 2-3 yes/no questions derived from the ToDo items.
 * These determine the completion percentage of each build.
 *
 * Score: answered "yes" / total questions = completion %
 */

export interface CompletionCheck {
  id: string
  question: string
}

export interface BuildCompletionChecks {
  buildName: string
  checks: CompletionCheck[]
}

// ===========================================
// FOUNDATION STAGE ($0-$500K)
// ===========================================

export const FOUNDATION_CHECKS: BuildCompletionChecks[] = [
  {
    buildName: "The Hero's Quest",
    checks: [
      { id: "f1-1", question: "Have you defined your 3-year vision (revenue, team size, lifestyle)?" },
      { id: "f1-2", question: "Have you calculated your Freedom Number (monthly income for ideal life)?" },
      { id: "f1-3", question: "Do you block weekly CEO time (2+ hours) for strategic work?" }
    ]
  },
  {
    buildName: "Money in the Bank",
    checks: [
      { id: "f2-1", question: "Do you check your bank balance at least weekly?" },
      { id: "f2-2", question: "Do you have a 13-week cash flow projection?" },
      { id: "f2-3", question: "Do you know your weekly burn rate and runway?" }
    ]
  },
  {
    buildName: "Niche & Offer",
    checks: [
      { id: "f3-1", question: "Have you defined your ideal client profile (industry, size, main problem)?" },
      { id: "f3-2", question: "Do you have ONE clearly packaged core offer (not multiple services)?" },
      { id: "f3-3", question: "Is your offer priced with at least 50% gross margin?" }
    ]
  },
  {
    buildName: "Leads Aplenty",
    checks: [
      { id: "f4-1", question: "Do you have a database/CRM tracking all prospects and clients?" },
      { id: "f4-2", question: "Are you consistently doing outreach (LinkedIn, email, referrals) weekly?" },
      { id: "f4-3", question: "Do you generate at least 20 new conversations per month?" }
    ]
  },
  {
    buildName: "Getting to Yes",
    checks: [
      { id: "f5-1", question: "Do you have a documented sales process (discovery → proposal → close)?" },
      { id: "f5-2", question: "Do you track every prospect in a CRM with pipeline stages?" },
      { id: "f5-3", question: "Do you track your conversion rate (aiming for 30-50%)?" }
    ]
  },
  {
    buildName: "Getting Things Done",
    checks: [
      { id: "f6-1", question: "Do you have a documented delivery process (SOPs or Loom videos)?" },
      { id: "f6-2", question: "Do you have a client onboarding checklist?" },
      { id: "f6-3", question: "Do you have at least 5 client testimonials?" }
    ]
  },
  {
    buildName: "Zone of Genius",
    checks: [
      { id: "f7-1", question: "Have you tracked your time for a week to identify where it goes?" },
      { id: "f7-2", question: "Do you spend 70%+ of your time in Genius/Excellence activities?" },
      { id: "f7-3", question: "Have you delegated or eliminated your Incompetence tasks?" }
    ]
  },
  {
    buildName: "Strategic Time",
    checks: [
      { id: "f8-1", question: "Do you spend 50%+ of your time on revenue activities?" },
      { id: "f8-2", question: "Do you have an 'ideal week' template with time blocks?" },
      { id: "f8-3", question: "Do you have a weekly planning ritual?" }
    ]
  }
]

// ===========================================
// TRACTION STAGE ($500K-$1M)
// ===========================================

export const TRACTION_CHECKS: BuildCompletionChecks[] = [
  {
    buildName: "The Integrated Action Plan",
    checks: [
      { id: "t1-1", question: "Do you have a written 3-year vision with specific revenue and lifestyle goals?" },
      { id: "t1-2", question: "Have you set quarterly goals (OKRs or similar framework)?" },
      { id: "t1-3", question: "Do you review your plan weekly to ensure daily actions align with vision?" }
    ]
  },
  {
    buildName: "Financial Forecast",
    checks: [
      { id: "t2-1", question: "Do you have a 13-week cash flow forecast?" },
      { id: "t2-2", question: "Do you have a weekly 'Money Monday' ritual to review finances?" },
      { id: "t2-3", question: "Do you track revenue, gross profit %, and net profit % monthly?" }
    ]
  },
  {
    buildName: "Content Engine",
    checks: [
      { id: "t3-1", question: "Do you post content consistently (3+ times per week) on at least one platform?" },
      { id: "t3-2", question: "Do you have a content calendar planned at least 2 weeks ahead?" },
      { id: "t3-3", question: "Do you track which content generates leads?" }
    ]
  },
  {
    buildName: "The Sales Pipeline",
    checks: [
      { id: "t4-1", question: "Do you use a CRM with defined pipeline stages?" },
      { id: "t4-2", question: "Do you have automated follow-up reminders for prospects?" },
      { id: "t4-3", question: "Do you review your pipeline weekly and track conversion rates?" }
    ]
  },
  {
    buildName: "Smooth Delivery",
    checks: [
      { id: "t5-1", question: "Have you documented your delivery process with SOPs or Loom videos?" },
      { id: "t5-2", question: "Do you use templates for recurring deliverables?" },
      { id: "t5-3", question: "Do you have a client portal or project management system for visibility?" }
    ]
  },
  {
    buildName: "The Next Hire",
    checks: [
      { id: "t6-1", question: "Have you hired at least one employee (not just contractors)?" },
      { id: "t6-2", question: "Do you have a documented onboarding process for new hires?" },
      { id: "t6-3", question: "Do you have regular 1-on-1 meetings with your team?" }
    ]
  },
  {
    buildName: "Productivity Systems",
    checks: [
      { id: "t7-1", question: "Do you use a project management tool (ClickUp, Asana, etc.) for team visibility?" },
      { id: "t7-2", question: "Have you set up at least 3 workflow automations (Zapier, Make.com)?" },
      { id: "t7-3", question: "Do you use AI tools (ChatGPT, etc.) regularly to speed up work?" }
    ]
  },
  {
    buildName: "Personal Rhythm",
    checks: [
      { id: "t8-1", question: "Do you have an 'ideal week' template with time blocked for different activities?" },
      { id: "t8-2", question: "Do you protect 90-minute focus blocks for deep work?" },
      { id: "t8-3", question: "Do you spend 10+ hours/week on your highest-value 'genius' work?" }
    ]
  }
]

// ===========================================
// GROWTH STAGE ($1M-$5M)
// ===========================================

export const GROWTH_CHECKS: BuildCompletionChecks[] = [
  {
    buildName: "Capacity Planning",
    checks: [
      { id: "g1-1", question: "Do you have a 12-month hiring roadmap?" },
      { id: "g1-2", question: "Do you have role scorecards with outcomes and KPIs for each position?" },
      { id: "g1-3", question: "Do you have a structured onboarding system for new hires?" }
    ]
  },
  {
    buildName: "The Core Product",
    checks: [
      { id: "g2-1", question: "Do you have a named, proprietary methodology or process?" },
      { id: "g2-2", question: "Is your core offer documented in a delivery playbook?" },
      { id: "g2-3", question: "Does your delivery achieve 60%+ gross margin?" }
    ]
  },
  {
    buildName: "Marketing Machine",
    checks: [
      { id: "g3-1", question: "Are you running paid advertising (LinkedIn, Facebook, or Google ads)?" },
      { id: "g3-2", question: "Do you have a lead magnet with landing page and email nurture sequence?" },
      { id: "g3-3", question: "Do you track full-funnel metrics (visitors → leads → customers)?" }
    ]
  },
  {
    buildName: "Sales Team Launch",
    checks: [
      { id: "g4-1", question: "Do you have at least one dedicated salesperson (not you)?" },
      { id: "g4-2", question: "Do you have a comprehensive Sales Playbook?" },
      { id: "g4-3", question: "Do you use conversation intelligence tools to review sales calls?" }
    ]
  },
  {
    buildName: "Client Success System",
    checks: [
      { id: "g5-1", question: "Do you track NPS (Net Promoter Score) for your clients?" },
      { id: "g5-2", question: "Do you have a mapped client journey with defined touchpoints?" },
      { id: "g5-3", question: "Do you have expansion offers for existing clients (upsell/cross-sell)?" }
    ]
  },
  {
    buildName: "People Power",
    checks: [
      { id: "g6-1", question: "Do you have defined company core values (3-5 values)?" },
      { id: "g6-2", question: "Do you have a weekly team meeting rhythm?" },
      { id: "g6-3", question: "Do you have a performance review process (quarterly or annual)?" }
    ]
  },
  {
    buildName: "Know Your Numbers",
    checks: [
      { id: "g7-1", question: "Do you review P&L, balance sheet, and cash flow monthly?" },
      { id: "g7-2", question: "Do you know your unit economics (CAC, LTV, profit per client)?" },
      { id: "g7-3", question: "Do you have a financial dashboard with real-time visibility?" }
    ]
  },
  {
    buildName: "Systems & Automation",
    checks: [
      { id: "g8-1", question: "Do you have your top 10-20 processes documented as SOPs?" },
      { id: "g8-2", question: "Do you use enterprise-grade tools (HubSpot/Salesforce, ClickUp/Asana)?" },
      { id: "g8-3", question: "Do you conduct quarterly tech reviews to optimize your stack?" }
    ]
  },
  {
    buildName: "The CEO Shift",
    checks: [
      { id: "g9-1", question: "Do you spend 50%+ of your time on growth activities (not operations)?" },
      { id: "g9-2", question: "Have you hired your replacement for your old operational role?" },
      { id: "g9-3", question: "Can you take a 2+ week vacation where the business runs without you?" }
    ]
  },
  {
    buildName: "Time Audits at Scale",
    checks: [
      { id: "g10-1", question: "Do you have an Executive Assistant managing your calendar?" },
      { id: "g10-2", question: "Do you have 2-3 full 'Maker days' per week for strategic work?" },
      { id: "g10-3", question: "Have you removed yourself from operational Slack channels and group chats?" }
    ]
  }
]

// ===========================================
// SCALE STAGE ($5M-$10M)
// ===========================================

export const SCALE_CHECKS: BuildCompletionChecks[] = [
  {
    buildName: "Leadership Team",
    checks: [
      { id: "s1-1", question: "Do you have a leadership team with defined roles (COO, CFO, etc.)?" },
      { id: "s1-2", question: "Do you have weekly and monthly leadership meeting rhythms?" },
      { id: "s1-3", question: "Do your leaders make most decisions without needing you?" }
    ]
  },
  {
    buildName: "Build to Sell",
    checks: [
      { id: "s2-1", question: "Is your business less dependent on you personally?" },
      { id: "s2-2", question: "Do you have recurring revenue (subscriptions, retainers, multi-year contracts)?" },
      { id: "s2-3", question: "Is no single customer more than 15% of your revenue?" }
    ]
  },
  {
    buildName: "Brand Authority",
    checks: [
      { id: "s3-1", question: "Have you published a book or significant thought leadership content?" },
      { id: "s3-2", question: "Do you speak at industry conferences or host your own events?" },
      { id: "s3-3", question: "Do you have 100+ testimonials and recognizable client logos?" }
    ]
  },
  {
    buildName: "Sales at Scale",
    checks: [
      { id: "s4-1", question: "Do you have a dedicated sales team with SDRs, AEs, and CSMs?" },
      { id: "s4-2", question: "Do you have a VP Sales or Head of Sales leading the team?" },
      { id: "s4-3", question: "Do you have a comprehensive Sales Playbook with methodology?" }
    ]
  },
  {
    buildName: "Client Advisory Board",
    checks: [
      { id: "s5-1", question: "Do you have a formal client advisory board (8-12 clients)?" },
      { id: "s5-2", question: "Do you meet with your advisory board quarterly?" },
      { id: "s5-3", question: "Do you use advisory board feedback to guide product development?" }
    ]
  },
  {
    buildName: "Talent Acquisition",
    checks: [
      { id: "s6-1", question: "Do you have an employer brand (careers page, culture content)?" },
      { id: "s6-2", question: "Do you proactively build a talent pipeline even without openings?" },
      { id: "s6-3", question: "Do you have a structured interview process assessing values and potential?" }
    ]
  },
  {
    buildName: "Strategic Finance",
    checks: [
      { id: "s7-1", question: "Do you have a CFO (fractional or full-time)?" },
      { id: "s7-2", question: "Do you have FP&A with rolling forecasts and scenario planning?" },
      { id: "s7-3", question: "Do you have a capital allocation strategy (reinvest vs. distribute)?" }
    ]
  },
  {
    buildName: "Remote Operations",
    checks: [
      { id: "s8-1", question: "Do you have an executive dashboard with real-time visibility into all metrics?" },
      { id: "s8-2", question: "Can you run the business from anywhere with just your phone?" },
      { id: "s8-3", question: "Can you take a 4+ week vacation with the business running smoothly?" }
    ]
  },
  {
    buildName: "The Replacement Plan",
    checks: [
      { id: "s9-1", question: "Do you have a COO or Integrator running day-to-day operations?" },
      { id: "s9-2", question: "Are you working 30 hours/week or less with zero operational tasks?" },
      { id: "s9-3", question: "Have you taken a 4-6 week sabbatical where business thrived?" }
    ]
  },
  {
    buildName: "Life by Design",
    checks: [
      { id: "s10-1", question: "Do you block personal time FIRST on your calendar?" },
      { id: "s10-2", question: "Are you working a 4-day week (or less)?" },
      { id: "s10-3", question: "Does your calendar reflect your stated life priorities?" }
    ]
  }
]

// ===========================================
// MASTERY STAGE ($10M+)
// ===========================================

export const MASTERY_CHECKS: BuildCompletionChecks[] = [
  {
    buildName: "The Board Chair",
    checks: [
      { id: "m1-1", question: "Are you working 20 hours/week or less?" },
      { id: "m1-2", question: "Do you only attend quarterly board-level meetings?" },
      { id: "m1-3", question: "Have you transitioned from CEO to board chair role?" }
    ]
  },
  {
    buildName: "The Succession Plan",
    checks: [
      { id: "m2-1", question: "Do you have all documents organized in a data room?" },
      { id: "m2-2", question: "Have you had financials audited or reviewed by a CPA firm?" },
      { id: "m2-3", question: "Do you have a clear succession plan documented?" }
    ]
  },
  {
    buildName: "Marketplace Domination",
    checks: [
      { id: "m3-1", question: "Are you the recognized leader in your market category?" },
      { id: "m3-2", question: "Do you host a signature annual industry event?" },
      { id: "m3-3", question: "Do you invest 10-15% of revenue in marketing?" }
    ]
  },
  {
    buildName: "The Sales Machine",
    checks: [
      { id: "m4-1", question: "Does your sales team drive 80%+ of revenue without your involvement?" },
      { id: "m4-2", question: "Do you have segmented sales processes (SMB, mid-market, enterprise)?" },
      { id: "m4-3", question: "Do you only close 5-10 strategic deals per year personally?" }
    ]
  },
  {
    buildName: "The Flywheel",
    checks: [
      { id: "m5-1", question: "Is your NPS score 50+ (world-class)?" },
      { id: "m5-2", question: "Is your net revenue retention over 110%?" },
      { id: "m5-3", question: "Does 20-30% of revenue come from expansion of existing clients?" }
    ]
  },
  {
    buildName: "Culture & Legacy",
    checks: [
      { id: "m6-1", question: "Are you recognized as a 'Best Place to Work' in your industry/region?" },
      { id: "m6-2", question: "Do you have ESOP or profit-sharing for employees?" },
      { id: "m6-3", question: "Do you have a leadership development program growing internal leaders?" }
    ]
  },
  {
    buildName: "Generational Wealth",
    checks: [
      { id: "m7-1", question: "Do you have wealth diversified beyond your operating company?" },
      { id: "m7-2", question: "Do you have an estate plan with wealth transfer strategy?" },
      { id: "m7-3", question: "Have you achieved your 'Freedom Number' where business funds ideal lifestyle?" }
    ]
  },
  {
    buildName: "Ultimate Freedom",
    checks: [
      { id: "m8-1", question: "Are you working 10-20 hours/week (or retired from operations)?" },
      { id: "m8-2", question: "Can you take 4-6 week trips with business running perfectly?" },
      { id: "m8-3", question: "Is your calendar filled with choices, not obligations?" }
    ]
  }
]

// ===========================================
// COMBINED EXPORTS
// ===========================================

export const ALL_COMPLETION_CHECKS: Record<string, BuildCompletionChecks[]> = {
  foundation: FOUNDATION_CHECKS,
  traction: TRACTION_CHECKS,
  growth: GROWTH_CHECKS,
  scale: SCALE_CHECKS,
  mastery: MASTERY_CHECKS
}

/**
 * Get completion checks for a specific build by name
 */
export function getCompletionChecks(buildName: string): CompletionCheck[] | undefined {
  for (const stageChecks of Object.values(ALL_COMPLETION_CHECKS)) {
    const buildChecks = stageChecks.find(b => b.buildName === buildName)
    if (buildChecks) return buildChecks.checks
  }
  return undefined
}

/**
 * Calculate completion percentage from answers
 * @param answers Record of check ID to boolean (true = yes)
 * @param checks The checks to calculate against
 */
export function calculateCompletionPercentage(
  answers: Record<string, boolean>,
  checks: CompletionCheck[]
): number {
  if (checks.length === 0) return 0
  const yesCount = checks.filter(c => answers[c.id] === true).length
  return Math.round((yesCount / checks.length) * 100)
}
