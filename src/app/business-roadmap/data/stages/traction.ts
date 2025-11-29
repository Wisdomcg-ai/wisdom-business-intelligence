import { RoadmapBuild } from '../types'

/**
 * TRACTION STAGE ($500K-$1M)
 * Proven model, now building infrastructure for growth
 */

export const TRACTION_BUILDS: RoadmapBuild[] = [
  {
    name: "The Integrated Action Plan",
    outcome: "Create a strategic plan that connects daily actions to your 3-year vision",
    toDo: [
      "Complete 3-year vision with specifics: revenue, team, lifestyle",
      "Work backward: What must be true in 1 year to hit 3-year goal?",
      "Set quarterly goals (3-5 big outcomes per quarter)",
      "Define monthly milestones toward quarterly goals",
      "Use OKR framework: Objective (goal) + Key Results (measurements)",
      "Create visual roadmap in Notion, Miro, or simple timeline",
      "Weekly: review if daily actions align with vision",
      "Quarterly: 2-day planning session to review and adjust",
      "Share with team so everyone knows how their work connects"
    ],
    engine: 'leadership'
  },
  {
    name: "Financial Forecast",
    outcome: "Predict revenue and cashflow with confidence for the next 13 weeks",
    toDo: [
      "Set up cashflow forecast in spreadsheet, Xero, or QuickBooks",
      "List all confirmed income for next 13 weeks",
      "List all committed expenses for next 13 weeks",
      "Calculate weekly net cashflow (income - expenses)",
      "Identify danger weeks (negative cashflow), create action plan",
      "Weekly 'Money Monday' ritual (15 min) to update forecast",
      "Track key metrics: revenue, gross profit %, net profit %, cash balance",
      "Monthly P&L review with bookkeeper/accountant",
      "Set revenue and profit targets for next 6-12 months",
      "Build financial dashboard (simple spreadsheet or tool like Jirav)"
    ],
    engine: 'finance'
  },
  {
    name: "Content Engine",
    outcome: "Implement consistent marketing that builds your brand and generates leads",
    toDo: [
      "Choose ONE primary content platform (LinkedIn, YouTube, podcast, blog)",
      "Create content calendar: 3-5 posts/week minimum",
      "Use AI to help create content (ChatGPT for ideas/drafts, Canva for design)",
      "Content types: lessons learned, case studies, client wins, industry insights",
      "Repurpose: one piece of content becomes 10 (video → blog → social posts → email)",
      "Optimize LinkedIn profile: creator mode, SEO headline, featured section",
      "Install Google Business Profile, optimize for local SEO",
      "Generate 5-star Google reviews from happy clients",
      "Track lead source: where did every lead come from?",
      "Double down on channels with best ROI"
    ],
    engine: 'attract'
  },
  {
    name: "The Sales Pipeline",
    outcome: "Install a systematic sales process so no leads fall through cracks",
    toDo: [
      "Set up proper CRM: HubSpot, Pipedrive, or upgrade from spreadsheets",
      "Define pipeline stages: Lead → Qualified → Discovery → Proposal → Negotiation → Won/Lost",
      "Log every prospect: name, company, source, stage, next action, close date",
      "Set up automated reminders for follow-ups",
      "Track conversion rates at each stage - find bottlenecks",
      "Weekly pipeline review: move deals forward or disqualify",
      "Create lead scoring: A (hot-30 days), B (warm-60-90 days), C (cold-nurture)",
      "Use Calendly with pre-meeting questionnaire to qualify before calls",
      "Integrate CRM with calendar - automatically log meetings",
      "Monthly: track leads, conversion rate, average deal size, sales cycle length"
    ],
    engine: 'convert'
  },
  {
    name: "Smooth Delivery",
    outcome: "Streamline delivery to reduce time while maintaining quality",
    toDo: [
      "Document every step of delivery process (Loom videos + written SOPs)",
      "Identify bottlenecks: where do projects get stuck?",
      "Remove unnecessary steps - challenge 'is this essential?'",
      "Create templates for recurring deliverables (reports, presentations)",
      "Build client portal: Notion, ClickUp, or Google Drive with clear structure",
      "Standardize onboarding: welcome email, questionnaire, kickoff call agenda",
      "Use project management: clients see progress in real-time",
      "Batch similar work: all calls on specific days, all delivery on others",
      "Use AI to speed delivery: ChatGPT for drafts, Canva for design, Descript for video",
      "Measure delivery time: look for ways to cut 20-30% without sacrificing quality"
    ],
    engine: 'deliver'
  },
  {
    name: "The Next Hire",
    outcome: "Hire your first A-player team member who can take work off your plate",
    toDo: [
      "Define the role clearly - use Big Picture Job Description (outcomes, not tasks)",
      "What will they own? What results do you expect in 90 days?",
      "Execute Affinity Mapping: list all your tasks, group by theme, identify what to delegate",
      "Write compelling job post - focus on mission and growth, not just tasks",
      "Include 2-min video explaining role and why it's exciting",
      "Post on LinkedIn, AngelList, We Work Remotely + your network",
      "Screen: phone screen (15 min) → skills test → working interview (paid trial) → final interview",
      "Check references: call 2+ past managers/colleagues",
      "Create 90-day onboarding plan with weekly milestones",
      "Weekly 1-on-1s first 90 days - coaching, not micromanaging",
      "Document everything you hand off (Loom + written SOPs in Notion)"
    ],
    engine: 'people'
  },
  {
    name: "Productivity Systems",
    outcome: "Install tools and automation to work smarter, not harder",
    toDo: [
      "Choose ONE task management system: Todoist, ClickUp, Notion",
      "Set up project management: ClickUp, Asana, Monday.com for team visibility",
      "Install communication tools: Slack/Teams for daily, Zoom for meetings",
      "Set up email automation: HubSpot, MailChimp, ConvertKit for marketing",
      "Use Zapier or Make.com for workflow automation (auto-add leads to CRM, send follow-ups)",
      "Create email templates for common scenarios",
      "Use AI writing assistant: ChatGPT, Claude for drafting emails, content, proposals",
      "Set up Calendly with smart routing and automated reminders",
      "Use Loom for async communication and training",
      "Monthly tech audit: what's slow or frustrating? What can we upgrade?"
    ],
    engine: 'systems'
  },
  {
    name: "Personal Rhythm",
    outcome: "Design your ideal week to maintain energy and focus on high-impact work",
    toDo: [
      "Track your energy for one week: when do you have peak energy?",
      "Schedule most important work during peak energy hours",
      "Create ideal week template - time-block everything including breaks",
      "Morning routine (30-60 min): exercise, mindfulness, or planning before work",
      "Install 90-minute Focus Time blocks with phone on airplane mode",
      "Set boundaries: no meetings before 10am or after 3pm (adjust to your energy)",
      "Weekly planning session: Friday afternoon or Sunday evening (1 hour)",
      "Use AI calendar tools (Reclaim.ai, Motion) to auto-optimize your schedule",
      "Daily: identify 3 Most Important Tasks (MITs), do these first",
      "Protect your Genius Time: 10+ hours/week on your superpower work"
    ],
    engine: 'time'
  }
]
