import { RoadmapBuild } from '../types'

/**
 * FOUNDATION STAGE ($0-$500K)
 * Finding product-market fit and proving the model works
 */

export const FOUNDATION_BUILDS: RoadmapBuild[] = [
  {
    name: "The Hero's Quest",
    outcome: "Commit to building a business that creates freedom, not just income",
    toDo: [
      "Define your 3-year vision: revenue goal, team size, lifestyle freedom",
      "Calculate your Freedom Number - monthly income needed for ideal life",
      "Identify the #1 thing stealing your joy right now",
      "Block weekly CEO time (2 hours minimum) for strategic work",
      "Share vision with accountability partner"
    ],
    engine: 'leadership'
  },
  {
    name: "Money in the Bank",
    outcome: "Know your cash position and collect money owed",
    toDo: [
      "Every Monday 9am: check bank balance, write it down",
      "Log money in and out weekly in spreadsheet or Xero/QuickBooks",
      "Calculate weekly burn rate (average expenses last 4 weeks)",
      "Project 13 weeks: where will cash be if nothing changes?",
      "Calculate runway: current balance ÷ weekly burn = weeks until zero",
      "Call clients with invoices 30+ days old",
      "Set up Stripe payment links for faster collection"
    ],
    engine: 'finance'
  },
  {
    name: "Niche & Offer",
    outcome: "Get crystal clear on who you serve and what you sell",
    toDo: [
      "Define ideal client: industry, revenue, size, main problem",
      "Interview 5 current/past clients: 'What problem did we solve?'",
      "Package ONE core offer (no complexity)",
      "Name it simply - avoid fancy names",
      "Price it: calculate cost + 50-70% margin minimum",
      "Write one-page offer: Who it's for, Problem solved, What they get, Price",
      "Test with 3-5 prospects, adjust based on feedback"
    ],
    engine: 'attract'
  },
  {
    name: "Leads Aplenty",
    outcome: "Generate consistent leads from your network and database",
    toDo: [
      "Export ALL contacts to spreadsheet (email, phone, LinkedIn, old CRMs)",
      "Categorize: Hot, Warm, Cold, Dead",
      "Set up simple CRM (HubSpot free, Notion, or Google Sheets)",
      "Email warm/cold contacts with value (not a pitch)",
      "Reactivate past clients: check in, ask how they're doing",
      "Ask top 10 clients for referrals",
      "Post value on LinkedIn 3x/week (lessons, case studies, insights)",
      "Join 2-3 communities where ideal clients hang out",
      "Goal: 20 new conversations per month"
    ],
    engine: 'attract'
  },
  {
    name: "Getting to Yes",
    outcome: "Close good-fit prospects with a simple sales process",
    toDo: [
      "Map your sales steps: Contact → Discovery → Proposal → Close",
      "Create simple sales script: Problem discovery, Solution, Pricing, Next steps",
      "Set up Calendly or Cal.com for easy booking",
      "Build sales pipeline in CRM - track every prospect",
      "Create FAQ doc - answer top 10 objections",
      "Follow up 3-5 times minimum (most sales happen on follow-up #4-7)",
      "Send personalized Loom videos in follow-ups",
      "Track conversion rate: aim for 30-50% close rate",
      "Simplify payment: Stripe links, payment plans available",
      "Offer guarantee: 30-day money-back or 'we'll make it right'"
    ],
    engine: 'convert'
  },
  {
    name: "Getting Things Done",
    outcome: "Deliver great results and get clients wins",
    toDo: [
      "Document your delivery process (use Loom to record yourself)",
      "Create client onboarding checklist",
      "Set clear expectations: timeline, deliverables, communication",
      "Use project management tool (ClickUp, Asana, or simple spreadsheet)",
      "Weekly client check-ins - proactive communication",
      "Celebrate client wins - small and big",
      "Ask for testimonials when clients get results",
      "Collect feedback: 'What could we do better?'"
    ],
    engine: 'deliver'
  },
  {
    name: "Zone of Genius",
    outcome: "Focus on your strengths, delegate or eliminate the rest",
    toDo: [
      "Track time for one week (Toggl, Clockify, or spreadsheet)",
      "Categorize: Genius (love + great at), Excellence, Competence, Incompetence",
      "Goal: 70%+ time in Genius + Excellence",
      "List all Incompetence tasks - must delegate, automate, or eliminate",
      "Identify your ONE superpower - what you do better than anyone",
      "Find someone to handle Incompetence tasks (VA, contractor, $500-1000/month)",
      "Use AI (ChatGPT, Claude) for repetitive writing/research",
      "Block 'Genius Time' in calendar (10+ hours/week)"
    ],
    engine: 'time'
  },
  {
    name: "Strategic Time",
    outcome: "Protect your calendar and invest time in high-leverage work",
    toDo: [
      "Audit last month's calendar: Revenue-generating vs Operations vs Waste",
      "Goal: 50%+ time on revenue activities (sales, delivery, marketing)",
      "Create ideal week template in Google Calendar - time-block everything",
      "Set up morning routine (30-60 min before work starts)",
      "Install Focus Blocks: 90-min deep work, phone on airplane mode",
      "Use Pomodoro or Flow app for focused sessions",
      "Decline meetings that don't require you",
      "Weekly planning session (Friday afternoon or Sunday evening)",
      "Use AI calendar tools (Reclaim.ai, Motion) to optimize your week"
    ],
    engine: 'time'
  }
]
