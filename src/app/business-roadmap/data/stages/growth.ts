import { RoadmapBuild } from '../types'

/**
 * GROWTH STAGE ($1M-$5M)
 * Building the team, systems, and processes to scale
 */

export const GROWTH_BUILDS: RoadmapBuild[] = [
  {
    name: "Capacity Planning",
    outcome: "Build a resourced team that scales with your business growth",
    toDo: [
      "Set revenue goals for next 12-36 months (be ambitious but realistic)",
      "Work backward: units to sell → campaigns needed → team capacity required",
      "Create hiring roadmap: when do you need each role?",
      "Document each role before hiring - create role scorecard with outcomes and KPIs",
      "Calculate: (Target revenue - Current revenue) ÷ Revenue per employee = Hires needed",
      "Build recruiting pipeline BEFORE you need people - always talent scouting",
      "Create attractive employer brand: careers page, culture videos, team testimonials",
      "Set up onboarding system: Week 1 (culture/tools), Week 2-4 (learn), Week 5-12 (do)",
      "Use capacity planning tool or spreadsheet to project team needs quarterly",
      "Budget for team growth: salaries, benefits, tools, training"
    ],
    engine: 'leadership'
  },
  {
    name: "The Core Product",
    outcome: "Package your methodology into a scalable, profitable core offer",
    toDo: [
      "Interview your best 10 clients: what transformation did we deliver?",
      "Unpack your unique method - what's your proprietary process? Name it simply",
      "Design delivery to minimize your involvement - use team, templates, automation",
      "Create modular delivery: break into phases so clients can start small and expand",
      "Build recurring profit model: monthly retainer, subscription, or phased payments",
      "Price for scale and profit: true cost to deliver + 60-70% margin",
      "Create delivery playbook in Notion: every step documented with templates and videos",
      "Set up client portal (ClickUp, Notion, or dedicated software) for self-service",
      "Launch to 10 clients, gather feedback, iterate rapidly",
      "Use AI to create delivery assets: ChatGPT for content, Canva for design",
      "Track delivery metrics: on-time %, client satisfaction, profit per client"
    ],
    engine: 'deliver'
  },
  {
    name: "Marketing Machine",
    outcome: "Install multiple lead generation channels that work together",
    toDo: [
      "Build on your content engine (from Traction) - now add paid amplification",
      "Install '100 leads bundle' paid campaign: LinkedIn ads, Facebook ads, or Google ads ($1500-3000/month)",
      "Create lead magnet: PDF guide, calculator, assessment, or video training",
      "Build landing page with form (Carrd, Leadpages, Webflow, HubSpot)",
      "Set up email nurture sequence: 5-7 emails to build trust and soft pitch",
      "Implement referral program: automate the process, make it easy, offer incentives",
      "Activate partnership strategy: 2-3 partners referring 10-20% of leads",
      "Host quarterly events: webinar, workshop, challenge, or virtual summit",
      "Syndicate content across platforms: LinkedIn, YouTube, podcast, email",
      "Track full funnel: visitors → leads → MQLs → SQLs → customers",
      "Hire marketing coordinator or VA to help execute (10-20 hrs/week)"
    ],
    engine: 'attract'
  },
  {
    name: "Sales Team Launch",
    outcome: "Hire your first salesperson and hand off sales process",
    toDo: [
      "Build comprehensive Sales Playbook: target customers, discovery framework, demo structure, proposals, objection handling, closing",
      "Record yourself on 5-10 sales calls - these become training materials",
      "Capture 10+ testimonials and case studies",
      "Create sales onboarding: 2-week training program",
      "Hire salesperson: advertise → screen → working interview → hire",
      "90-day ramp: Week 1-2 (learn), Week 3-6 (shadow you), Week 7-12 (close with coaching)",
      "Set compensation: base + commission structure (60/40 or 70/30 split)",
      "Weekly 1-on-1s: pipeline review, deal coaching, skill development",
      "Use conversation intelligence: Gong, Chorus, or Fireflies.ai to review calls",
      "Track: calls, meetings, proposals, close rate per salesperson"
    ],
    engine: 'convert'
  },
  {
    name: "Client Success System",
    outcome: "Ensure every client gets results and becomes a promoter",
    toDo: [
      "Map full client journey: onboarding → delivery → success → expansion → advocacy",
      "Implement NPS (Net Promoter Score) surveys: after onboarding, at completion, quarterly",
      "Follow-up: 'On scale 0-10, how likely to recommend us?' + 'Why that score?'",
      "Action on feedback: Promoters (9-10) = ask for referrals, Detractors (0-6) = fix immediately",
      "Create success metrics dashboard: track client results, not just your activities",
      "Weekly client check-ins: proactive outreach, celebrate wins",
      "Build customer support system: help desk (Intercom, Front) or simple email + tracking",
      "Create expansion offers: upsell and cross-sell to existing clients",
      "Quarterly Business Reviews (QBRs) with top clients: strategic conversations",
      "Hire Customer Success Manager when you hit 30-50 active clients",
      "Track: retention rate, expansion revenue, NPS score, testimonials collected"
    ],
    engine: 'deliver'
  },
  {
    name: "People Power",
    outcome: "Build and manage a productive team with clear roles and accountability",
    toDo: [
      "Create org chart: current and 12-month future state",
      "Define company core values (3-5 values that drive behavior)",
      "Create Big Picture Job Descriptions for each role (outcomes, not tasks)",
      "Assign roles, responsibilities, KPIs for each position",
      "Implement weekly team meeting: wins, metrics, problem-solving, action items",
      "Daily standup (15 min): yesterday's progress, today's plan, any blockers?",
      "Use ClickUp, Asana, or Monday.com for task management and visibility",
      "Install performance review process: quarterly check-ins, annual reviews",
      "Create team training plan: onboarding, skills development, career progression",
      "Build coaching culture: use GROW model, ask questions rather than give answers",
      "Set up Slack/Teams for communication with clear norms (what tool for what)",
      "Celebrate wins: recognize great work publicly, reward top performers"
    ],
    engine: 'people'
  },
  {
    name: "Know Your Numbers",
    outcome: "Master the financial metrics that drive profit and make data-driven decisions",
    toDo: [
      "Build financial team: you (CEO) + bookkeeper + accountant + CFO/advisor",
      "Monthly financial review (by 10th of following month): P&L, balance sheet, cashflow",
      "Track the 5 financial dials: Revenue, Gross Profit %, Operating Expenses, Net Profit %, Cash",
      "Understand unit economics: profit per client, CAC (cost to acquire), LTV (lifetime value)",
      "Calculate and track: LTV:CAC ratio (should be 3:1 or better)",
      "Define breakeven and breakeven for profit targets",
      "Build financial dashboard: real-time visibility into key metrics",
      "Monthly meeting with accountant: review financials, tax planning, identify opportunities",
      "Set up proper accounting: accrual basis, clean chart of accounts",
      "Separate business and personal finances completely",
      "Plan for taxes: quarterly estimates, year-end planning",
      "Work with financial advisor on wealth extraction strategy"
    ],
    engine: 'finance'
  },
  {
    name: "Systems & Automation",
    outcome: "Install technology and automation to handle 3x growth",
    toDo: [
      "Audit your current tech stack: what's working? What's slowing you down?",
      "Upgrade to enterprise tools: CRM (HubSpot/Salesforce), Project management (ClickUp/Asana), Accounting (Xero/QuickBooks)",
      "Map top 10-20 business processes, document with SOPs in Notion or Trainual",
      "Install Zapier or Make.com automation: connect apps, eliminate manual work",
      "Use AI strategically: ChatGPT for content/emails, customer service chatbot, data analysis",
      "Create 'how we work' playbook: every process documented, easy to find",
      "Build data infrastructure: centralized dashboard pulling from all systems",
      "Train team on systems thinking: 'Could this be automated or simplified?'",
      "Quarterly tech review: what's new? What could we upgrade? What should we cut?",
      "Budget 2-3% of revenue for technology investment"
    ],
    engine: 'systems'
  },
  {
    name: "The CEO Shift",
    outcome: "Transition from working IN the business to ON the business",
    toDo: [
      "Remove yourself from day-to-day operations: delegate or delete",
      "Hire your replacement for your old role (Operations Manager, Head of Delivery, etc.)",
      "Your new job: CEO work only - strategy, key hires, major clients, vision",
      "Aim for 50%+ time on growth activities (not operations)",
      "Install 'CEO Days': 1-2 days/week completely free from meetings",
      "Take first real vacation (2+ weeks) where business runs without you",
      "Quarterly off-sites: get out of the office, think strategically",
      "Stop doing tactical work: no more client delivery, project management, or daily operations",
      "Focus on: Vision/Strategy, Key Hires, Major Client Relationships, Culture, Growth Initiatives"
    ],
    engine: 'time'
  },
  {
    name: "Time Audits at Scale",
    outcome: "Ruthlessly eliminate low-value activities as the business grows",
    toDo: [
      "Quarterly time audit: What's on your calendar that shouldn't be?",
      "Create 'Stop Doing' list: 10 things you'll never do again",
      "Implement approval hierarchy: What decisions don't need you?",
      "Automate recurring decisions: playbooks, templates, SOPs",
      "Hire Executive Assistant: gatekeep calendar, protect your time",
      "Meeting rules: No meetings over 30min without agenda, max 3/day",
      "Install 'Maker time': 2-3 full days/week for deep strategic work",
      "Remove yourself from group chats and operational Slack channels",
      "Batch similar activities: all 1-on-1s on same day, all interviews on same day",
      "Use AI scheduling (Calendly, Reclaim.ai) to protect focus time automatically"
    ],
    engine: 'time'
  }
]
