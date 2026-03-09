import type { ProcessSnapshot, SwimlaneDefinition, ProcessStepData, ProcessFlowData, DecisionOption, PhaseDefinition } from '@/types/process-builder'
import { SWIMLANE_COLOR_PALETTE, PHASE_COLOR_PALETTE } from '@/types/process-builder'
import type { StepType, FlowType } from '@/types/process-builder'
import { alignCrossLaneFlow } from './builder-reducer'

export interface TemplateStep {
  name: string
  lane: number
  column: number
  type: StepType
  phase?: string
  desc?: string
  duration?: string
  systems?: string[]
  documents?: string[]
  decisionYes?: string
  decisionNo?: string
}

export interface TemplateFlow {
  from: number
  to: number
  type?: FlowType
  label?: string
  color?: string
}

export interface ProcessTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'function' | 'industry'
  subcategory?: string
  swimlanes: { name: string; colorIndex: number }[]
  phases?: { name: string; colorIndex: number }[]
  steps: TemplateStep[]
  flows: TemplateFlow[]
}

// ─── Universal Business Function Templates ─────────────────────────────────
const UNIVERSAL_TEMPLATES: ProcessTemplate[] = [
  // ── 1. Marketing ────────────────────────────────────────────────────
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Lead generation through to qualified handoff',
    icon: '📣',
    category: 'function',
    swimlanes: [
      { name: 'Marketing Manager', colorIndex: 0 },
      { name: 'Content / Digital', colorIndex: 1 },
      { name: 'Sales', colorIndex: 4 },
    ],
    phases: [
      { name: 'Strategy', colorIndex: 0 },
      { name: 'Execution', colorIndex: 1 },
      { name: 'Handoff', colorIndex: 2 },
    ],
    steps: [
      // Phase: Strategy (cols 0-2) — Marketing Manager plans
      /* 0  */ { name: 'Define Campaign Goals', lane: 0, column: 0, type: 'action', phase: 'Strategy', desc: 'Set KPIs, target audience, and budget', duration: '2 hours', documents: ['Campaign brief'] },
      /* 1  */ { name: 'Select Channels', lane: 0, column: 1, type: 'action', phase: 'Strategy', desc: 'Choose paid, organic, email, social mix', duration: '1 hour', systems: ['Google Analytics'] },
      /* 2  */ { name: 'Approve Brief', lane: 0, column: 2, type: 'action', phase: 'Strategy', desc: 'Sign off campaign brief for production', duration: '30 mins' },

      // Phase: Execution (cols 3-7) — Content builds, Manager monitors
      /* 3  */ { name: 'Create Content & Assets', lane: 1, column: 3, type: 'action', phase: 'Execution', desc: 'Write copy, design graphics, produce video', duration: '2-5 days', systems: ['Canva', 'Adobe Creative Suite'] },
      /* 4  */ { name: 'Build Landing Pages', lane: 1, column: 4, type: 'action', phase: 'Execution', desc: 'Set up conversion-optimized pages', duration: '1-2 days', systems: ['WordPress', 'Unbounce'] },
      /* 5  */ { name: 'Launch Campaign', lane: 1, column: 5, type: 'action', phase: 'Execution', desc: 'Activate ads, send emails, publish content', duration: '2 hours', systems: ['Google Ads', 'Mailchimp'] },
      /* 6  */ { name: 'Monitor Performance', lane: 0, column: 6, type: 'action', phase: 'Execution', desc: 'Track KPIs against targets', duration: '30 mins/day', systems: ['Google Analytics', 'HubSpot'] },
      /* 7  */ { name: 'Hitting Targets?', lane: 0, column: 7, type: 'decision', phase: 'Execution', decisionYes: 'Yes', decisionNo: 'No' },
      /* 8  */ { name: 'Adjust Campaign', lane: 1, column: 8, type: 'action', phase: 'Execution', desc: 'Revise targeting, budget, or creative', duration: '1 hour' },

      // Phase: Handoff (cols 8-10) — Analyse and hand to Sales
      /* 9  */ { name: 'Analyse Results', lane: 0, column: 8, type: 'action', phase: 'Handoff', desc: 'Compile performance report', duration: '2 hours', documents: ['Campaign report template'] },
      /* 10 */ { name: 'Qualify Leads', lane: 2, column: 9, type: 'action', phase: 'Handoff', desc: 'Score and qualify marketing-generated leads', duration: '30 mins/lead', systems: ['CRM'] },
      /* 11 */ { name: 'Handoff to Sales', lane: 2, column: 10, type: 'action', phase: 'Handoff', desc: 'Transfer qualified leads with context', duration: '15 mins/lead', systems: ['CRM'], documents: ['Lead handoff form'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },                                                  // handoff to Content
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },                                                  // handoff back to Manager
      { from: 6, to: 7 },
      { from: 7, to: 9, label: 'Yes', color: 'green', type: 'decision' },  // Yes → analyse
      { from: 7, to: 8, label: 'No', color: 'red', type: 'decision' },     // No → adjust
      { from: 9, to: 10 },                                                 // handoff to Sales
      { from: 10, to: 11 },
    ],
  },

  // ── 2. Sales ────────────────────────────────────────────────────────
  {
    id: 'sales',
    name: 'Sales',
    description: 'Lead to close pipeline',
    icon: '📈',
    category: 'function',
    swimlanes: [
      { name: 'Sales Rep', colorIndex: 0 },
      { name: 'Sales Manager', colorIndex: 6 },
      { name: 'Account Management', colorIndex: 4 },
    ],
    phases: [
      { name: 'Prospecting', colorIndex: 0 },
      { name: 'Closing', colorIndex: 1 },
      { name: 'Post-Sale', colorIndex: 5 },
    ],
    steps: [
      // Phase: Prospecting (cols 0-3) — Sales Rep qualifies
      /* 0  */ { name: 'Generate / Receive Lead', lane: 0, column: 0, type: 'action', phase: 'Prospecting', desc: 'Inbound enquiry or outbound prospecting', duration: '15 mins', systems: ['CRM'] },
      /* 1  */ { name: 'Qualify Lead', lane: 0, column: 1, type: 'action', phase: 'Prospecting', desc: 'BANT qualification framework', duration: '30 mins', systems: ['CRM'] },
      /* 2  */ { name: 'Worth Pursuing?', lane: 0, column: 2, type: 'decision', phase: 'Prospecting', decisionYes: 'Yes', decisionNo: 'No' },
      /* 3  */ { name: 'Discovery Call', lane: 0, column: 3, type: 'action', phase: 'Prospecting', desc: 'Deep-dive into client needs and pain points', duration: '45 mins', systems: ['Zoom', 'CRM'] },
      /* 4  */ { name: 'Nurture & Re-engage', lane: 1, column: 3, type: 'action', phase: 'Prospecting', desc: 'Add to nurture sequence for future opportunity', systems: ['CRM', 'Mailchimp'] },

      // Phase: Closing (cols 4-7) — Rep presents, Manager approves
      /* 5  */ { name: 'Present Solution', lane: 0, column: 4, type: 'action', phase: 'Closing', desc: 'Tailored presentation or demo', duration: '1 hour', documents: ['Pitch deck'] },
      /* 6  */ { name: 'Send Proposal', lane: 0, column: 5, type: 'action', phase: 'Closing', desc: 'Formal proposal with pricing', duration: '2 hours', documents: ['Proposal template'], systems: ['CRM'] },
      /* 7  */ { name: 'Review & Approve', lane: 1, column: 6, type: 'action', phase: 'Closing', desc: 'Manager reviews pricing and terms', duration: '30 mins' },
      /* 8  */ { name: 'Deal Won?', lane: 1, column: 7, type: 'decision', phase: 'Closing', decisionYes: 'Won', decisionNo: 'Lost' },

      // Phase: Post-Sale (cols 8-9) — Account Management onboards
      /* 9  */ { name: 'Onboard Client', lane: 2, column: 8, type: 'action', phase: 'Post-Sale', desc: 'Welcome, setup accounts, kickoff', duration: '1-2 days', systems: ['CRM'], documents: ['Onboarding checklist'] },
      /* 10 */ { name: 'Nurture & Grow', lane: 2, column: 9, type: 'action', phase: 'Post-Sale', desc: 'Regular check-ins, upsell opportunities', duration: 'Ongoing', systems: ['CRM'] },
      /* 11 */ { name: 'Add to Lost Nurture', lane: 0, column: 8, type: 'action', phase: 'Post-Sale', desc: 'Add lost deal to re-engagement sequence', systems: ['CRM', 'Mailchimp'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green', type: 'decision' },
      { from: 2, to: 4, label: 'No', color: 'red', type: 'decision' },     // No → nurture (same col, diff lane)
      { from: 3, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },                                                  // handoff to Manager
      { from: 7, to: 8 },
      { from: 8, to: 9, label: 'Won', color: 'green', type: 'decision' },  // Won → Account Mgmt
      { from: 8, to: 11, label: 'Lost', color: 'red', type: 'decision' },  // Lost → nurture
      { from: 9, to: 10 },
    ],
  },

  // ── 3. Recruitment ──────────────────────────────────────────────────
  {
    id: 'recruitment',
    name: 'Recruitment',
    description: 'Job ad through to 90-day review',
    icon: '🎯',
    category: 'function',
    swimlanes: [
      { name: 'HR / Recruitment', colorIndex: 5 },
      { name: 'Hiring Manager', colorIndex: 6 },
      { name: 'IT / Admin', colorIndex: 7 },
    ],
    phases: [
      { name: 'Attract', colorIndex: 0 },
      { name: 'Select', colorIndex: 1 },
      { name: 'Onboard', colorIndex: 5 },
    ],
    steps: [
      // Phase: Attract (cols 0-2) — HR posts role
      /* 0  */ { name: 'Receive Role Brief', lane: 0, column: 0, type: 'action', phase: 'Attract', desc: 'Gather requirements from hiring manager', duration: '1 hour', documents: ['Role brief template'] },
      /* 1  */ { name: 'Write Job Ad', lane: 0, column: 1, type: 'action', phase: 'Attract', desc: 'Draft compelling job advertisement', duration: '2 hours', documents: ['Job ad template'] },
      /* 2  */ { name: 'Post Job Ad', lane: 0, column: 2, type: 'action', phase: 'Attract', desc: 'Publish across job boards and socials', duration: '30 mins', systems: ['Seek', 'LinkedIn', 'Indeed'] },

      // Phase: Select (cols 3-7) — HR screens, Manager interviews
      /* 3  */ { name: 'Screen Applications', lane: 0, column: 3, type: 'action', phase: 'Select', desc: 'Review resumes against criteria', duration: '2-4 hours', systems: ['ATS'] },
      /* 4  */ { name: 'Phone Screen', lane: 0, column: 4, type: 'action', phase: 'Select', desc: 'Short screening call with shortlisted candidates', duration: '20 mins each' },
      /* 5  */ { name: 'Interview Candidates', lane: 1, column: 5, type: 'action', phase: 'Select', desc: 'Structured interview with shortlist', duration: '1 hour each', documents: ['Interview scorecard'] },
      /* 6  */ { name: 'Reference Check', lane: 0, column: 6, type: 'action', phase: 'Select', desc: 'Contact 2-3 referees', duration: '1 hour', documents: ['Reference check form'] },
      /* 7  */ { name: 'Hire Decision', lane: 1, column: 7, type: 'decision', phase: 'Select', desc: 'Final go/no-go on preferred candidate', decisionYes: 'Hire', decisionNo: 'Decline' },

      // Phase: Onboard (cols 8-11) — Offer, setup, induction
      /* 8  */ { name: 'Send Offer Letter', lane: 0, column: 8, type: 'action', phase: 'Onboard', desc: 'Prepare and send formal offer', duration: '1 hour', documents: ['Offer letter template', 'Employment contract'] },
      /* 9  */ { name: 'Re-advertise Role', lane: 2, column: 8, type: 'action', phase: 'Onboard', desc: 'Re-open search if candidate declined', duration: '1 hour' },
      /* 10 */ { name: 'Pre-boarding Setup', lane: 2, column: 9, type: 'action', phase: 'Onboard', desc: 'Provision accounts, equipment, workspace', duration: '2-3 days', systems: ['Google Workspace', 'Slack'], documents: ['IT setup checklist'] },
      /* 11 */ { name: 'Day 1 Induction', lane: 1, column: 10, type: 'action', phase: 'Onboard', desc: 'Welcome, tour, team introductions', duration: '4 hours' },
      /* 12 */ { name: '90-Day Review', lane: 1, column: 11, type: 'action', phase: 'Onboard', desc: 'Formal probation review', duration: '1 hour', documents: ['90-day review form'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },                                                   // handoff to Hiring Manager
      { from: 5, to: 6 },                                                   // handoff back to HR for refs
      { from: 6, to: 7 },                                                   // handoff to Manager for decision
      { from: 7, to: 8, label: 'Hire', color: 'green', type: 'decision' },  // Hire → offer
      { from: 7, to: 9, label: 'Decline', color: 'red', type: 'decision' }, // Decline → re-advertise
      { from: 8, to: 10 },                                                  // handoff to IT
      { from: 10, to: 11 },                                                 // handoff to Manager
      { from: 11, to: 12 },
    ],
  },

  // ── 4. Staff Onboarding ─────────────────────────────────────────────
  {
    id: 'staff-onboarding',
    name: 'Staff Onboarding',
    description: 'Offer acceptance through first 90 days',
    icon: '👋',
    category: 'function',
    swimlanes: [
      { name: 'HR', colorIndex: 5 },
      { name: 'Manager', colorIndex: 6 },
      { name: 'IT / Admin', colorIndex: 7 },
    ],
    phases: [
      { name: 'Pre-boarding', colorIndex: 0 },
      { name: 'Week 1', colorIndex: 1 },
      { name: 'Ongoing', colorIndex: 5 },
    ],
    steps: [
      // Phase: Pre-boarding (cols 0-3) — HR collects, IT sets up
      /* 0  */ { name: 'Send Offer Letter', lane: 0, column: 0, type: 'action', phase: 'Pre-boarding', desc: 'Send formal offer and employment contract', duration: '1 hour', documents: ['Offer letter', 'Employment contract'] },
      /* 1  */ { name: 'Collect Paperwork', lane: 0, column: 1, type: 'action', phase: 'Pre-boarding', desc: 'Tax forms, super, bank details, ID verification', duration: '2 hours', documents: ['New starter form', 'Tax file declaration'] },
      /* 2  */ { name: 'Setup Systems & Accounts', lane: 2, column: 2, type: 'action', phase: 'Pre-boarding', desc: 'Email, Slack, software licences, VPN', duration: '2-3 hours', systems: ['Google Workspace', 'Slack', 'HRIS'] },
      /* 3  */ { name: 'Prepare Workspace', lane: 2, column: 3, type: 'action', phase: 'Pre-boarding', desc: 'Desk, equipment, access cards, phone', duration: '1-2 hours' },

      // Phase: Week 1 (cols 4-7) — HR orients, Manager trains
      /* 4  */ { name: 'Day 1 Orientation', lane: 0, column: 4, type: 'action', phase: 'Week 1', desc: 'Company overview, values, policies, tour', duration: '2 hours' },
      /* 5  */ { name: 'Team Introductions', lane: 1, column: 5, type: 'action', phase: 'Week 1', desc: 'Introduce to team members and key contacts', duration: '1 hour' },
      /* 6  */ { name: 'Role Training Plan', lane: 1, column: 6, type: 'action', phase: 'Week 1', desc: 'Walk through responsibilities, systems, and expectations', duration: '2-4 hours', documents: ['Training plan template'] },
      /* 7  */ { name: 'Assign Buddy', lane: 1, column: 7, type: 'action', phase: 'Week 1', desc: 'Pair with experienced team member for support', duration: '15 mins' },

      // Phase: Ongoing (cols 8-11) — Manager reviews
      /* 8  */ { name: '1-Week Check-in', lane: 1, column: 8, type: 'action', phase: 'Ongoing', desc: 'How is the first week going? Any concerns?', duration: '30 mins' },
      /* 9  */ { name: 'Settling In OK?', lane: 1, column: 9, type: 'decision', phase: 'Ongoing', desc: 'Is the new starter settling in well?', decisionYes: 'Yes', decisionNo: 'Needs Support' },
      /* 10 */ { name: 'Provide Additional Support', lane: 0, column: 10, type: 'action', phase: 'Ongoing', desc: 'Extra training, mentoring, or adjustments', duration: '1-2 hours' },
      /* 11 */ { name: '30-Day Review', lane: 1, column: 10, type: 'action', phase: 'Ongoing', desc: 'Formal check-in on progress and goals', duration: '45 mins', documents: ['30-day review form'] },
      /* 12 */ { name: '90-Day Review', lane: 1, column: 11, type: 'action', phase: 'Ongoing', desc: 'End of probation review', duration: '1 hour', documents: ['90-day review form'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },                                                             // handoff to IT
      { from: 2, to: 3 },
      { from: 3, to: 4 },                                                             // handoff to HR
      { from: 4, to: 5 },                                                             // handoff to Manager
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 11, label: 'Yes', color: 'green', type: 'decision' },            // Yes → 30-day review
      { from: 9, to: 10, label: 'Needs Support', color: 'red', type: 'decision' },    // No → HR support
      { from: 11, to: 12 },
    ],
  },

  // ── 5. Client Onboarding ────────────────────────────────────────────
  {
    id: 'client-onboarding',
    name: 'Client Onboarding',
    description: 'Welcome through to steady-state delivery',
    icon: '🤝',
    category: 'function',
    swimlanes: [
      { name: 'Account Manager', colorIndex: 0 },
      { name: 'Operations', colorIndex: 1 },
      { name: 'Client', colorIndex: 4 },
    ],
    phases: [
      { name: 'Welcome', colorIndex: 0 },
      { name: 'Setup', colorIndex: 1 },
      { name: 'Steady State', colorIndex: 5 },
    ],
    steps: [
      // Phase: Welcome (cols 0-3) — Account Manager + Client
      /* 0  */ { name: 'Send Welcome Email', lane: 0, column: 0, type: 'automation', phase: 'Welcome', desc: 'Automated welcome with next steps and contacts', duration: '5 mins', systems: ['CRM', 'Mailchimp'] },
      /* 1  */ { name: 'Schedule Kickoff Call', lane: 0, column: 1, type: 'action', phase: 'Welcome', desc: 'Book introductory call with key stakeholders', duration: '15 mins', systems: ['Calendly'] },
      /* 2  */ { name: 'Complete Intake Form', lane: 2, column: 2, type: 'action', phase: 'Welcome', desc: 'Provide business details, access credentials, brand assets', duration: '1-2 hours', documents: ['Client intake form'] },
      /* 3  */ { name: 'Kickoff Call', lane: 0, column: 3, type: 'action', phase: 'Welcome', desc: 'Introductions, confirm scope, set expectations', duration: '1 hour', systems: ['Zoom'] },

      // Phase: Setup (cols 4-6) — Operations configures
      /* 4  */ { name: 'Setup Client Account', lane: 1, column: 4, type: 'action', phase: 'Setup', desc: 'Configure systems, create project workspace', duration: '1-2 hours', systems: ['CRM', 'Asana', 'Google Drive'] },
      /* 5  */ { name: 'Assign Team Members', lane: 1, column: 5, type: 'action', phase: 'Setup', desc: 'Allocate resources and notify team', duration: '30 mins' },
      /* 6  */ { name: 'Create Project Plan', lane: 0, column: 6, type: 'action', phase: 'Setup', desc: 'Timeline, milestones, deliverables', duration: '2 hours', documents: ['Project plan template'], systems: ['Asana'] },

      // Phase: Steady State (cols 7-10) — Deliver and review
      /* 7  */ { name: 'Deliver First Milestone', lane: 1, column: 7, type: 'action', phase: 'Steady State', desc: 'Complete and deliver first key output', duration: '1-2 weeks' },
      /* 8  */ { name: 'Check-in Call', lane: 0, column: 8, type: 'action', phase: 'Steady State', desc: '2-week post-launch check-in', duration: '30 mins', systems: ['Zoom'] },
      /* 9  */ { name: 'Scope OK?', lane: 0, column: 9, type: 'decision', phase: 'Steady State', desc: 'Is scope and delivery on track?', decisionYes: 'Yes', decisionNo: 'Adjust' },
      /* 10 */ { name: 'Adjust Scope', lane: 1, column: 10, type: 'action', phase: 'Steady State', desc: 'Revise deliverables or timeline', duration: '1 hour', documents: ['Change request form'] },
      /* 11 */ { name: 'Transition to BAU', lane: 0, column: 10, type: 'action', phase: 'Steady State', desc: 'Move to business-as-usual delivery cadence', duration: '1 day', systems: ['CRM'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },                                                     // handoff to Client
      { from: 2, to: 3 },                                                     // handoff back to AM
      { from: 3, to: 4 },                                                     // handoff to Operations
      { from: 4, to: 5 },
      { from: 5, to: 6 },                                                     // handoff to AM
      { from: 6, to: 7 },                                                     // handoff to Operations
      { from: 7, to: 8 },                                                     // handoff to AM
      { from: 8, to: 9 },
      { from: 9, to: 11, label: 'Yes', color: 'green', type: 'decision' },    // Yes → BAU
      { from: 9, to: 10, label: 'Adjust', color: 'red', type: 'decision' },   // Adjust → Ops
    ],
  },

  // ── 6. Finance ──────────────────────────────────────────────────────
  {
    id: 'finance',
    name: 'Finance',
    description: 'Month-end close and reporting cycle',
    icon: '💰',
    category: 'function',
    swimlanes: [
      { name: 'Finance Manager', colorIndex: 0 },
      { name: 'Bookkeeper', colorIndex: 1 },
      { name: 'Leadership', colorIndex: 6 },
    ],
    phases: [
      { name: 'Close', colorIndex: 0 },
      { name: 'Review', colorIndex: 1 },
      { name: 'Report', colorIndex: 2 },
    ],
    steps: [
      // Phase: Close (cols 0-3) — Bookkeeper reconciles
      /* 0  */ { name: 'Send Cutoff Reminder', lane: 0, column: 0, type: 'action', phase: 'Close', desc: 'Notify all departments of month-end cutoff dates', duration: '15 mins', systems: ['Email', 'Slack'] },
      /* 1  */ { name: 'Reconcile Bank Accounts', lane: 1, column: 1, type: 'action', phase: 'Close', desc: 'Match all bank transactions', duration: '1-2 hours', systems: ['Xero'] },
      /* 2  */ { name: 'Reconcile Debtors & Creditors', lane: 1, column: 2, type: 'action', phase: 'Close', desc: 'Reconcile AR and AP ledgers', duration: '1-2 hours', systems: ['Xero'] },
      /* 3  */ { name: 'Reconcile Payroll', lane: 1, column: 3, type: 'action', phase: 'Close', desc: 'Verify payroll postings match payslips', duration: '1 hour', systems: ['Xero', 'KeyPay'] },

      // Phase: Review (cols 4-6) — Finance Manager reviews
      /* 4  */ { name: 'Review Expenses', lane: 0, column: 4, type: 'action', phase: 'Review', desc: 'Check expense claims and credit card statements', duration: '1-2 hours', systems: ['Xero', 'Dext'] },
      /* 5  */ { name: 'Accrue Outstanding Items', lane: 0, column: 5, type: 'action', phase: 'Review', desc: 'Accrue for unbilled revenue, prepayments, provisions', duration: '1 hour', systems: ['Xero'] },
      /* 6  */ { name: 'Adjustments Needed?', lane: 0, column: 6, type: 'decision', phase: 'Review', decisionYes: 'Yes', decisionNo: 'No' },
      /* 7  */ { name: 'Post Adjustments', lane: 1, column: 7, type: 'action', phase: 'Review', desc: 'Journal entries for corrections', duration: '30 mins', systems: ['Xero'] },

      // Phase: Report (cols 7-10) — Prepare and present
      /* 8  */ { name: 'Prepare P&L', lane: 0, column: 7, type: 'action', phase: 'Report', desc: 'Generate profit and loss statement', duration: '30 mins', systems: ['Xero'], documents: ['P&L template'] },
      /* 9  */ { name: 'Prepare Balance Sheet', lane: 0, column: 8, type: 'action', phase: 'Report', desc: 'Generate balance sheet report', duration: '30 mins', systems: ['Xero'], documents: ['Balance sheet template'] },
      /* 10 */ { name: 'Present to Leadership', lane: 2, column: 9, type: 'action', phase: 'Report', desc: 'Present financial results and commentary', duration: '1 hour', documents: ['Management report pack'] },
      /* 11 */ { name: 'Agree Action Items', lane: 2, column: 10, type: 'action', phase: 'Report', desc: 'Identify cost savings, revenue actions, follow-ups', duration: '30 mins' },
      /* 12 */ { name: 'Archive & Close Period', lane: 0, column: 11, type: 'action', phase: 'Report', desc: 'Lock period, file reports, update dashboards', duration: '30 mins', systems: ['Xero', 'Google Drive'] },
    ],
    flows: [
      { from: 0, to: 1 },                                                  // handoff to Bookkeeper
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },                                                  // handoff to Finance Manager
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7, label: 'Yes', color: 'red', type: 'decision' },    // Yes → adjustments
      { from: 6, to: 8, label: 'No', color: 'green', type: 'decision' },   // No → prepare P&L
      { from: 8, to: 9 },
      { from: 9, to: 10 },                                                 // handoff to Leadership
      { from: 10, to: 11 },
      { from: 11, to: 12 },                                                // handoff to Finance Manager
    ],
  },

  // ── 7. Customer Support ─────────────────────────────────────────────
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Ticket / complaint through to resolution',
    icon: '🎧',
    category: 'function',
    swimlanes: [
      { name: 'Support Agent', colorIndex: 1 },
      { name: 'Team Lead', colorIndex: 6 },
      { name: 'Customer', colorIndex: 4 },
    ],
    phases: [
      { name: 'Intake', colorIndex: 0 },
      { name: 'Resolution', colorIndex: 1 },
      { name: 'Follow-up', colorIndex: 5 },
    ],
    steps: [
      // Phase: Intake (cols 0-3) — Customer submits, Agent triages
      /* 0  */ { name: 'Submit Ticket', lane: 2, column: 0, type: 'action', phase: 'Intake', desc: 'Customer submits support request via email, chat, or portal', systems: ['Zendesk', 'Intercom'] },
      /* 1  */ { name: 'Receive & Log Ticket', lane: 0, column: 1, type: 'action', phase: 'Intake', desc: 'Ticket logged in support system', duration: '5 mins', systems: ['Zendesk'] },
      /* 2  */ { name: 'Categorise & Prioritise', lane: 0, column: 2, type: 'action', phase: 'Intake', desc: 'Assign category, priority level, and SLA', duration: '5 mins', systems: ['Zendesk'] },
      /* 3  */ { name: 'Acknowledge Customer', lane: 0, column: 3, type: 'automation', phase: 'Intake', desc: 'Auto-acknowledgement with ticket number and ETA', duration: '1 min', systems: ['Zendesk'] },

      // Phase: Resolution (cols 4-7) — Agent investigates, escalates if needed
      /* 4  */ { name: 'Investigate Issue', lane: 0, column: 4, type: 'action', phase: 'Resolution', desc: 'Research issue, check knowledge base, replicate if needed', duration: '15-60 mins', systems: ['Zendesk', 'Internal Wiki'] },
      /* 5  */ { name: 'Can Resolve?', lane: 0, column: 5, type: 'decision', phase: 'Resolution', decisionYes: 'Yes', decisionNo: 'No' },
      /* 6  */ { name: 'Resolve Issue', lane: 0, column: 6, type: 'action', phase: 'Resolution', desc: 'Apply fix, provide solution, or answer query', duration: '15-30 mins' },
      /* 7  */ { name: 'Escalation Review', lane: 1, column: 6, type: 'action', phase: 'Resolution', desc: 'Senior review of escalated issue', duration: '30-60 mins' },
      /* 8  */ { name: 'Resolve Escalated Issue', lane: 1, column: 7, type: 'action', phase: 'Resolution', desc: 'Apply advanced fix or coordinate with other teams', duration: '1-4 hours' },

      // Phase: Follow-up (cols 8-10) — Close and document
      /* 9  */ { name: 'Update Customer', lane: 0, column: 8, type: 'action', phase: 'Follow-up', desc: 'Communicate resolution to customer', duration: '10 mins', systems: ['Zendesk'] },
      /* 10 */ { name: 'Close Ticket', lane: 0, column: 9, type: 'action', phase: 'Follow-up', desc: 'Mark ticket as resolved and closed', duration: '5 mins', systems: ['Zendesk'] },
      /* 11 */ { name: 'Send Follow-up Survey', lane: 2, column: 10, type: 'automation', phase: 'Follow-up', desc: 'CSAT survey sent automatically', duration: '1 min', systems: ['Zendesk'] },
    ],
    flows: [
      { from: 0, to: 1 },                                                  // handoff to Agent
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6, label: 'Yes', color: 'green', type: 'decision' },  // Yes → resolve
      { from: 5, to: 7, label: 'No', color: 'red', type: 'decision' },     // No → escalate (same col, diff lane)
      { from: 7, to: 8 },
      { from: 6, to: 9 },
      { from: 8, to: 9 },                                                  // handoff back to Agent
      { from: 9, to: 10 },
      { from: 10, to: 11 },                                                // handoff to Customer
    ],
  },

  // ── 8. Project Delivery ─────────────────────────────────────────────
  {
    id: 'project-delivery',
    name: 'Project Delivery',
    description: 'Scope through to delivery and close-out',
    icon: '📦',
    category: 'function',
    swimlanes: [
      { name: 'Project Manager', colorIndex: 5 },
      { name: 'Team', colorIndex: 0 },
      { name: 'Client / Stakeholder', colorIndex: 4 },
    ],
    phases: [
      { name: 'Initiation', colorIndex: 0 },
      { name: 'Execution', colorIndex: 1 },
      { name: 'Close', colorIndex: 5 },
    ],
    steps: [
      // Phase: Initiation (cols 0-3) — PM plans, Client aligns
      /* 0  */ { name: 'Define Scope', lane: 0, column: 0, type: 'action', phase: 'Initiation', desc: 'Document project scope, objectives, and constraints', duration: '2-4 hours', documents: ['Scope document', 'Project charter'] },
      /* 1  */ { name: 'Stakeholder Alignment', lane: 2, column: 1, type: 'action', phase: 'Initiation', desc: 'Confirm objectives, success criteria, and governance', duration: '1 hour' },
      /* 2  */ { name: 'Create Project Plan', lane: 0, column: 2, type: 'action', phase: 'Initiation', desc: 'Work breakdown, timeline, milestones, dependencies', duration: '4-8 hours', systems: ['Asana', 'MS Project'], documents: ['Project plan template'] },
      /* 3  */ { name: 'Assign Resources', lane: 0, column: 3, type: 'action', phase: 'Initiation', desc: 'Allocate team members to work packages', duration: '1 hour', systems: ['Asana'] },

      // Phase: Execution (cols 4-7) — Team executes, PM reviews
      /* 4  */ { name: 'Kickoff Meeting', lane: 2, column: 4, type: 'action', phase: 'Execution', desc: 'Formal project launch with all stakeholders', duration: '1 hour', systems: ['Zoom'] },
      /* 5  */ { name: 'Execute Work Packages', lane: 1, column: 5, type: 'action', phase: 'Execution', desc: 'Deliver assigned tasks and deliverables', duration: '1-4 weeks' },
      /* 6  */ { name: 'Progress Review', lane: 0, column: 6, type: 'action', phase: 'Execution', desc: 'Track progress against plan, update status', duration: '1 hour/week', systems: ['Asana'] },
      /* 7  */ { name: 'On Track?', lane: 0, column: 7, type: 'decision', phase: 'Execution', desc: 'Is the project on schedule and within budget?', decisionYes: 'Yes', decisionNo: 'No' },
      /* 8  */ { name: 'Adjust Plan', lane: 1, column: 8, type: 'action', phase: 'Execution', desc: 'Re-plan, reallocate resources, manage risks', duration: '1-2 hours', systems: ['Asana'] },

      // Phase: Close (cols 8-11) — Deliver and close out
      /* 9  */ { name: 'Client Review', lane: 2, column: 8, type: 'action', phase: 'Close', desc: 'Present progress and gather feedback', duration: '1 hour', systems: ['Zoom'] },
      /* 10 */ { name: 'Final Delivery', lane: 1, column: 9, type: 'action', phase: 'Close', desc: 'Complete and hand over all deliverables', duration: '1-2 days', documents: ['Delivery checklist'] },
      /* 11 */ { name: 'Sign-off', lane: 2, column: 10, type: 'action', phase: 'Close', desc: 'Formal acceptance of deliverables', duration: '30 mins', documents: ['Sign-off form'] },
      /* 12 */ { name: 'Lessons Learned', lane: 0, column: 11, type: 'action', phase: 'Close', desc: 'Retrospective and archive documents', duration: '1-2 hours', documents: ['Lessons learned template'], systems: ['Asana', 'Google Drive'] },
    ],
    flows: [
      { from: 0, to: 1 },                                                  // handoff to Client
      { from: 1, to: 2 },                                                  // handoff to PM
      { from: 2, to: 3 },
      { from: 3, to: 4 },                                                  // handoff to Client
      { from: 4, to: 5 },                                                  // handoff to Team
      { from: 5, to: 6 },                                                  // handoff to PM
      { from: 6, to: 7 },
      { from: 7, to: 9, label: 'Yes', color: 'green', type: 'decision' },  // Yes → Client Review
      { from: 7, to: 8, label: 'No', color: 'red', type: 'decision' },     // No → Adjust Plan
      { from: 9, to: 10 },                                                 // handoff to Team
      { from: 10, to: 11 },                                                // handoff to Client
      { from: 11, to: 12 },                                                // handoff to PM
    ],
  },
]

// ─── Industry End-to-End Templates ──────────────────────────────────────────

const INDUSTRY_TEMPLATES: ProcessTemplate[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Plumbing — Maintenance
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'plumbing-maintenance',
    name: 'Plumbing — Maintenance',
    description: 'End-to-end maintenance callout from booking through to payment',
    icon: '🔧',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Office/Admin', colorIndex: 2 },
      { name: 'Plumber', colorIndex: 4 },
      { name: 'Finance', colorIndex: 1 },
    ],
    phases: [
      { name: 'Booking', colorIndex: 0 },
      { name: 'Service', colorIndex: 1 },
      { name: 'Close', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Call', lane: 0, column: 0, type: 'action', phase: 'Booking', desc: 'Customer calls or submits online request', duration: '5 mins', systems: ['ServiceM8', 'Phone System'] },
      /* 1  */ { name: 'Log Job', lane: 0, column: 1, type: 'action', phase: 'Booking', desc: 'Create job card with customer details and issue summary', duration: '10 mins', systems: ['ServiceM8'] },
      /* 2  */ { name: 'Schedule Technician', lane: 0, column: 2, type: 'action', phase: 'Booking', desc: 'Assign available plumber based on location and skill', duration: '10 mins', systems: ['ServiceM8', 'Google Calendar'] },
      /* 3  */ { name: 'Travel to Site', lane: 1, column: 3, type: 'action', phase: 'Service', desc: 'Drive to customer location', duration: '30-60 mins' },
      /* 4  */ { name: 'Diagnose Issue', lane: 1, column: 4, type: 'action', phase: 'Service', desc: 'Inspect and identify the plumbing fault', duration: '15-30 mins' },
      /* 5  */ { name: 'Parts Needed?', lane: 1, column: 5, type: 'decision', phase: 'Service', decisionYes: 'Yes', decisionNo: 'No' },
      /* 6  */ { name: 'Complete Repair', lane: 1, column: 6, type: 'action', phase: 'Service', desc: 'Carry out the plumbing repair or replacement', duration: '1-3 hours' },
      /* 7  */ { name: 'Source Parts', lane: 0, column: 6, type: 'action', phase: 'Service', desc: 'Order or collect required parts from supplier', duration: '1-4 hours', systems: ['Supplier Portal'] },
      /* 8  */ { name: 'Test & Sign Off', lane: 1, column: 7, type: 'action', phase: 'Service', desc: 'Test repair, get customer sign-off on work', duration: '15 mins', documents: ['Job Completion Form'] },
      /* 9  */ { name: 'Update Job Notes', lane: 0, column: 8, type: 'action', phase: 'Close', desc: 'Record work completed, parts used, photos', duration: '10 mins', systems: ['ServiceM8'] },
      /* 10 */ { name: 'Send Invoice', lane: 2, column: 9, type: 'action', phase: 'Close', desc: 'Generate and email invoice to customer', duration: '10 mins', systems: ['Xero', 'ServiceM8'] },
      /* 11 */ { name: 'Follow Up Payment', lane: 2, column: 10, type: 'action', phase: 'Close', desc: 'Chase outstanding payments after 7 days', duration: '10 mins', systems: ['Xero'] },
      /* 12 */ { name: 'Request Review', lane: 0, column: 11, type: 'action', phase: 'Close', desc: 'Send review request via SMS or email', duration: '5 mins', systems: ['Google Business'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6, label: 'No', color: 'green', type: 'decision' },
      { from: 5, to: 7, label: 'Yes', color: 'red', type: 'decision' },
      { from: 6, to: 8 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Plumbing — Construction
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'plumbing-construction',
    name: 'Plumbing — Construction',
    description: 'Tender to completion for commercial and residential plumbing projects',
    icon: '🏗️',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Estimator/Director', colorIndex: 4 },
      { name: 'Project Manager', colorIndex: 6 },
      { name: 'Admin/Finance', colorIndex: 2 },
    ],
    phases: [
      { name: 'Tender', colorIndex: 0 },
      { name: 'Construction', colorIndex: 1 },
      { name: 'Close', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Enquiry', lane: 0, column: 0, type: 'action', phase: 'Tender', desc: 'Builder or developer sends plans and specs', duration: '15 mins', systems: ['Email'] },
      /* 1  */ { name: 'Site Visit', lane: 0, column: 1, type: 'action', phase: 'Tender', desc: 'Inspect site conditions and measure', duration: '2-4 hours', documents: ['Site Photos'] },
      /* 2  */ { name: 'Prepare Estimate', lane: 0, column: 2, type: 'action', phase: 'Tender', desc: 'Cost labour, materials, subcontractors', duration: '1-2 days', systems: ['Estimation Software'], documents: ['BOQ'] },
      /* 3  */ { name: 'Submit Tender', lane: 0, column: 3, type: 'action', phase: 'Tender', desc: 'Submit formal tender response', duration: '1 hour', documents: ['Tender Response'] },
      /* 4  */ { name: 'Awarded?', lane: 0, column: 4, type: 'decision', phase: 'Tender', decisionYes: 'Yes', decisionNo: 'No' },
      /* 5  */ { name: 'Contract Review', lane: 0, column: 5, type: 'action', phase: 'Tender', desc: 'Review and sign subcontract agreement', duration: '2 hours', documents: ['Subcontract'] },
      /* 6  */ { name: 'Archive Tender', lane: 2, column: 5, type: 'action', phase: 'Tender', desc: 'File unsuccessful tender for future reference', duration: '15 mins' },
      /* 7  */ { name: 'Plan Works', lane: 1, column: 6, type: 'action', phase: 'Construction', desc: 'Schedule labour, order materials, coordinate with builder', duration: '1 day', systems: ['Procore', 'Google Calendar'] },
      /* 8  */ { name: 'Rough-In Plumbing', lane: 1, column: 7, type: 'action', phase: 'Construction', desc: 'First fix — pipes, drains, gas lines in walls/floors', duration: '3-5 days' },
      /* 9  */ { name: 'Inspection', lane: 1, column: 8, type: 'action', phase: 'Construction', desc: 'Council or certifier inspection of rough-in', duration: '1 day', documents: ['Inspection Certificate'] },
      /* 10 */ { name: 'Fit-Off & Final', lane: 1, column: 9, type: 'action', phase: 'Construction', desc: 'Second fix and final compliance inspection', duration: '3-5 days', documents: ['Compliance Certificate'] },
      /* 11 */ { name: 'Submit Claim', lane: 2, column: 10, type: 'action', phase: 'Close', desc: 'Submit progress claim or final invoice to builder', duration: '1 hour', systems: ['Xero'] },
      /* 12 */ { name: 'Defects & Sign-Off', lane: 2, column: 11, type: 'action', phase: 'Close', desc: 'Address defects within warranty, receive final payment', duration: '3-12 months', documents: ['Final Account'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5, label: 'Yes', color: 'green', type: 'decision' },
      { from: 4, to: 6, label: 'No', color: 'red', type: 'decision' },
      { from: 5, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Residential Home Building
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'home-building',
    name: 'Residential Home Building',
    description: 'Full home build from lead enquiry to handover and warranty',
    icon: '🏠',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Sales/Director', colorIndex: 0 },
      { name: 'Construction Manager', colorIndex: 6 },
      { name: 'Admin/Finance', colorIndex: 2 },
    ],
    phases: [
      { name: 'Sales', colorIndex: 0 },
      { name: 'Build', colorIndex: 1 },
      { name: 'Handover', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Lead Enquiry', lane: 0, column: 0, type: 'action', phase: 'Sales', desc: 'Receive lead via website, referral or display home', duration: '10 mins', systems: ['CRM'] },
      /* 1  */ { name: 'Site Assessment', lane: 0, column: 1, type: 'action', phase: 'Sales', desc: 'Inspect block, check easements, soil test', duration: '2-4 hours', documents: ['Site Report'] },
      /* 2  */ { name: 'Prepare & Present Quote', lane: 0, column: 2, type: 'action', phase: 'Sales', desc: 'Cost build based on plan and present to client', duration: '2-5 days', documents: ['Quotation'] },
      /* 3  */ { name: 'Accepted?', lane: 0, column: 3, type: 'decision', phase: 'Sales', decisionYes: 'Yes', decisionNo: 'No' },
      /* 4  */ { name: 'Contract & Deposit', lane: 0, column: 4, type: 'action', phase: 'Sales', desc: 'Client signs building contract and pays deposit', duration: '1 hour', documents: ['Building Contract'] },
      /* 5  */ { name: 'Nurture Lead', lane: 2, column: 4, type: 'action', phase: 'Sales', desc: 'Add to CRM nurture sequence for follow-up', duration: '10 mins', systems: ['CRM'] },
      /* 6  */ { name: 'Council Approvals', lane: 2, column: 5, type: 'action', phase: 'Build', desc: 'Lodge DA/CDC, obtain building permit', duration: '4-12 weeks', systems: ['Council Portal'], documents: ['DA Application'] },
      /* 7  */ { name: 'Site Prep & Slab', lane: 1, column: 6, type: 'action', phase: 'Build', desc: 'Clear site, set out, pour slab', duration: '2-4 weeks' },
      /* 8  */ { name: 'Frame & Lock-Up', lane: 1, column: 7, type: 'action', phase: 'Build', desc: 'Erect frames, trusses, roof, windows, doors', duration: '6-8 weeks', documents: ['Frame Inspection'] },
      /* 9  */ { name: 'Fit-Out & Completion', lane: 1, column: 8, type: 'action', phase: 'Build', desc: 'Internal linings, kitchen, bathrooms, paint, landscaping', duration: '8-12 weeks' },
      /* 10 */ { name: 'Final Inspection', lane: 1, column: 9, type: 'action', phase: 'Handover', desc: 'Building certifier final inspection', duration: '1 day', documents: ['Occupation Certificate'] },
      /* 11 */ { name: 'Client Handover', lane: 0, column: 10, type: 'action', phase: 'Handover', desc: 'Hand over keys, walk through, explain warranties', duration: '2 hours', documents: ['Handover Pack'] },
      /* 12 */ { name: 'Warranty Period', lane: 2, column: 11, type: 'action', phase: 'Handover', desc: 'Manage defects and warranty claims for 6 years', duration: '6 years' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4, label: 'Yes', color: 'green', type: 'decision' },
      { from: 3, to: 5, label: 'No', color: 'red', type: 'decision' },
      { from: 4, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Electrical — Maintenance
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'electrical-maintenance',
    name: 'Electrical — Maintenance',
    description: 'Callout to completion for electrical maintenance and repairs',
    icon: '⚡',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Office/Admin', colorIndex: 2 },
      { name: 'Electrician', colorIndex: 0 },
      { name: 'Finance', colorIndex: 1 },
    ],
    phases: [
      { name: 'Booking', colorIndex: 0 },
      { name: 'Service', colorIndex: 1 },
      { name: 'Close', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Callout', lane: 0, column: 0, type: 'action', phase: 'Booking', desc: 'Customer reports electrical issue via phone or online', duration: '5 mins', systems: ['ServiceM8', 'Phone System'] },
      /* 1  */ { name: 'Log and Prioritise', lane: 0, column: 1, type: 'action', phase: 'Booking', desc: 'Create job card, assess urgency (emergency vs standard)', duration: '10 mins', systems: ['ServiceM8'] },
      /* 2  */ { name: 'Dispatch Electrician', lane: 0, column: 2, type: 'action', phase: 'Booking', desc: 'Assign and notify the nearest available electrician', duration: '10 mins', systems: ['ServiceM8', 'Google Calendar'] },
      /* 3  */ { name: 'Travel to Site', lane: 1, column: 3, type: 'action', phase: 'Service', desc: 'Drive to customer location', duration: '30-60 mins' },
      /* 4  */ { name: 'Assess Fault', lane: 1, column: 4, type: 'action', phase: 'Service', desc: 'Inspect switchboard, circuits, wiring to identify fault', duration: '15-30 mins' },
      /* 5  */ { name: 'Isolate and Repair', lane: 1, column: 5, type: 'action', phase: 'Service', desc: 'Isolate circuit, replace faulty components, re-wire as needed', duration: '1-3 hours' },
      /* 6  */ { name: 'Test and Tag', lane: 1, column: 6, type: 'action', phase: 'Service', desc: 'Test circuits, tag equipment, verify safety', duration: '30 mins', documents: ['Test Results'] },
      /* 7  */ { name: 'Compliance Certificate', lane: 1, column: 7, type: 'action', phase: 'Service', desc: 'Issue CCEW or certificate of compliance', duration: '15 mins', documents: ['CCEW'] },
      /* 8  */ { name: 'Update Job Record', lane: 0, column: 8, type: 'action', phase: 'Close', desc: 'Record work completed, parts used, compliance details', duration: '10 mins', systems: ['ServiceM8'] },
      /* 9  */ { name: 'Invoice', lane: 2, column: 9, type: 'action', phase: 'Close', desc: 'Generate and send invoice for labour and materials', duration: '15 mins', systems: ['Xero', 'ServiceM8'] },
      /* 10 */ { name: 'Payment Follow-Up', lane: 2, column: 10, type: 'action', phase: 'Close', desc: 'Automated reminders, phone call after 14 days', duration: '10 mins', systems: ['Xero'] },
      /* 11 */ { name: 'Request Review', lane: 0, column: 11, type: 'action', phase: 'Close', desc: 'Send review request via SMS', duration: '5 mins', systems: ['Google Business'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Electrical — Construction
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'electrical-construction',
    name: 'Electrical — Construction',
    description: 'Tender to final sign-off for electrical construction projects',
    icon: '🔌',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Estimator', colorIndex: 0 },
      { name: 'Project Manager', colorIndex: 6 },
      { name: 'Admin/Finance', colorIndex: 2 },
    ],
    phases: [
      { name: 'Tender', colorIndex: 0 },
      { name: 'Installation', colorIndex: 1 },
      { name: 'Close', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Tender Docs', lane: 0, column: 0, type: 'action', phase: 'Tender', desc: 'Receive electrical drawings, specs, BOQ from builder', duration: '15 mins', systems: ['Email'] },
      /* 1  */ { name: 'Site Walk', lane: 0, column: 1, type: 'action', phase: 'Tender', desc: 'Walk the site with builder to assess scope', duration: '2-3 hours', documents: ['Site Notes'] },
      /* 2  */ { name: 'Prepare Estimate', lane: 0, column: 2, type: 'action', phase: 'Tender', desc: 'Price cable, switchboards, labour, fittings', duration: '1-3 days', systems: ['Estimation Software'], documents: ['BOQ'] },
      /* 3  */ { name: 'Submit Tender', lane: 0, column: 3, type: 'action', phase: 'Tender', desc: 'Submit tender to builder or developer', duration: '1 hour', documents: ['Tender Response'] },
      /* 4  */ { name: 'Awarded?', lane: 0, column: 4, type: 'decision', phase: 'Tender', decisionYes: 'Yes', decisionNo: 'No' },
      /* 5  */ { name: 'Plan Electrical Layout', lane: 1, column: 5, type: 'action', phase: 'Installation', desc: 'Finalise power, lighting, data layouts with builder', duration: '1-2 days', systems: ['AutoCAD'], documents: ['Electrical Layout'] },
      /* 6  */ { name: 'Archive Tender', lane: 2, column: 5, type: 'action', phase: 'Tender', desc: 'File unsuccessful tender for future reference', duration: '15 mins' },
      /* 7  */ { name: 'First Fix / Rough-In', lane: 1, column: 6, type: 'action', phase: 'Installation', desc: 'Run cables, install back-boxes, switchboard rough-in', duration: '1-2 weeks' },
      /* 8  */ { name: 'Inspection', lane: 1, column: 7, type: 'wait', phase: 'Installation', desc: 'Wait for building inspector to approve rough-in', duration: '1-3 days', documents: ['Inspection Report'] },
      /* 9  */ { name: 'Second Fix & Commission', lane: 1, column: 8, type: 'action', phase: 'Installation', desc: 'Install switches, GPOs, lights, test all circuits', duration: '1-2 weeks', documents: ['Test Results'] },
      /* 10 */ { name: 'Final Inspection', lane: 1, column: 9, type: 'action', phase: 'Installation', desc: 'Certifier final inspection and CCEW', duration: '1 day', documents: ['CCEW'] },
      /* 11 */ { name: 'Submit Claim', lane: 2, column: 10, type: 'action', phase: 'Close', desc: 'Submit progress claim or final invoice', duration: '1 hour', systems: ['Xero'] },
      /* 12 */ { name: 'Defects & Sign-Off', lane: 2, column: 11, type: 'action', phase: 'Close', desc: 'Address defect notices, receive retention release', duration: '3-12 months', documents: ['Final Account'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5, label: 'Yes', color: 'green', type: 'decision' },
      { from: 4, to: 6, label: 'No', color: 'red', type: 'decision' },
      { from: 5, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Pool Building
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'pool-building',
    name: 'Pool Building',
    description: 'End-to-end pool construction from enquiry through to handover',
    icon: '🏊',
    category: 'industry',
    subcategory: 'Trades',
    swimlanes: [
      { name: 'Sales/Designer', colorIndex: 0 },
      { name: 'Construction Manager', colorIndex: 6 },
      { name: 'Admin/Finance', colorIndex: 2 },
    ],
    phases: [
      { name: 'Design', colorIndex: 0 },
      { name: 'Construction', colorIndex: 1 },
      { name: 'Handover', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Enquiry', lane: 0, column: 0, type: 'action', phase: 'Design', desc: 'Lead from website, referral or display', duration: '10 mins', systems: ['CRM'] },
      /* 1  */ { name: 'Site Visit & Measure', lane: 0, column: 1, type: 'action', phase: 'Design', desc: 'Measure backyard, check access, assess soil and drainage', duration: '2 hours', documents: ['Site Photos'] },
      /* 2  */ { name: 'Design & Quote', lane: 0, column: 2, type: 'action', phase: 'Design', desc: 'Create 3D pool design and detailed quotation', duration: '3-5 days', systems: ['Pool Design Software'], documents: ['Pool Design', 'Quotation'] },
      /* 3  */ { name: 'Approved?', lane: 0, column: 3, type: 'decision', phase: 'Design', decisionYes: 'Yes', decisionNo: 'No' },
      /* 4  */ { name: 'Contract & Deposit', lane: 0, column: 4, type: 'action', phase: 'Design', desc: 'Sign contract and collect deposit from client', duration: '1 hour', documents: ['Contract'] },
      /* 5  */ { name: 'Follow Up Lead', lane: 2, column: 4, type: 'action', phase: 'Design', desc: 'Add to nurture sequence for future follow-up', duration: '10 mins', systems: ['CRM'] },
      /* 6  */ { name: 'Council Application', lane: 2, column: 5, type: 'action', phase: 'Design', desc: 'Lodge DA and pool safety barrier compliance', duration: '4-8 weeks', systems: ['Council Portal'], documents: ['DA Application'] },
      /* 7  */ { name: 'Excavation', lane: 1, column: 6, type: 'action', phase: 'Construction', desc: 'Excavate pool shell shape', duration: '1-2 days' },
      /* 8  */ { name: 'Steel & Plumbing', lane: 1, column: 7, type: 'action', phase: 'Construction', desc: 'Install steel reinforcement cage and pool plumbing', duration: '2-3 days' },
      /* 9  */ { name: 'Shell & Tiling', lane: 1, column: 8, type: 'action', phase: 'Construction', desc: 'Shotcrete shell, waterline tiles, coping stones', duration: '1-3 weeks' },
      /* 10 */ { name: 'Equipment & Fill', lane: 1, column: 9, type: 'action', phase: 'Construction', desc: 'Install pump, filter, chlorinator; fill and commission', duration: '3-5 days', documents: ['Equipment Manuals'] },
      /* 11 */ { name: 'Final Inspection', lane: 1, column: 10, type: 'action', phase: 'Handover', desc: 'Council or certifier pool safety inspection', duration: '1 day', documents: ['Pool Safety Certificate'] },
      /* 12 */ { name: 'Client Handover', lane: 0, column: 11, type: 'action', phase: 'Handover', desc: 'Walk client through equipment, chemicals, maintenance', duration: '1 hour', documents: ['Handover Pack'] },
      /* 13 */ { name: 'Warranty Registration', lane: 2, column: 12, type: 'action', phase: 'Handover', desc: 'Register warranties for equipment and shell', duration: '30 mins', documents: ['Warranty Cards'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4, label: 'Yes', color: 'green', type: 'decision' },
      { from: 3, to: 5, label: 'No', color: 'red', type: 'decision' },
      { from: 4, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
      { from: 12, to: 13 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Bookkeeping Practice
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'bookkeeping',
    name: 'Bookkeeping Practice',
    description: 'Client onboarding to ongoing service delivery for bookkeeping firms',
    icon: '📊',
    category: 'industry',
    subcategory: 'Professional Services',
    swimlanes: [
      { name: 'Practice Manager', colorIndex: 3 },
      { name: 'Bookkeeper', colorIndex: 1 },
      { name: 'Client', colorIndex: 5 },
    ],
    phases: [
      { name: 'Onboard', colorIndex: 0 },
      { name: 'Delivery', colorIndex: 1 },
      { name: 'Review', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Client Enquiry', lane: 0, column: 0, type: 'action', phase: 'Onboard', desc: 'Receive enquiry via website, referral, or BNI', duration: '10 mins', systems: ['CRM'] },
      /* 1  */ { name: 'Discovery Meeting', lane: 0, column: 1, type: 'action', phase: 'Onboard', desc: 'Understand business, pain points, current setup', duration: '45 mins', systems: ['Zoom'] },
      /* 2  */ { name: 'Good Fit?', lane: 0, column: 2, type: 'decision', phase: 'Onboard', decisionYes: 'Yes', decisionNo: 'No' },
      /* 3  */ { name: 'Proposal & Engagement', lane: 0, column: 3, type: 'action', phase: 'Onboard', desc: 'Send scope of work, pricing, and engagement terms', duration: '1 hour', documents: ['Engagement Letter', 'Proposal'] },
      /* 4  */ { name: 'Refer Out', lane: 2, column: 3, type: 'action', phase: 'Onboard', desc: 'Refer to another provider if not a good fit', duration: '10 mins' },
      /* 5  */ { name: 'Collect Access', lane: 2, column: 4, type: 'action', phase: 'Onboard', desc: 'Client provides bank feeds, software logins, source docs', duration: '1-3 days', documents: ['Onboarding Checklist'] },
      /* 6  */ { name: 'Software Setup', lane: 1, column: 5, type: 'action', phase: 'Onboard', desc: 'Configure chart of accounts, bank feeds, integrations', duration: '2-4 hours', systems: ['Xero', 'MYOB'] },
      /* 7  */ { name: 'Data Cleanup', lane: 1, column: 6, type: 'action', phase: 'Onboard', desc: 'Reconcile backlog, fix coding errors, tidy data', duration: '1-5 days', systems: ['Xero'] },
      /* 8  */ { name: 'First BAS / Month-End', lane: 1, column: 7, type: 'action', phase: 'Delivery', desc: 'Complete first BAS or month-end close process', duration: '2-4 hours', systems: ['Xero'], documents: ['BAS Report'] },
      /* 9  */ { name: 'Review with Client', lane: 0, column: 8, type: 'action', phase: 'Delivery', desc: 'Present first reports, answer questions, adjust approach', duration: '30 mins', systems: ['Zoom'] },
      /* 10 */ { name: 'Ongoing Processing', lane: 1, column: 9, type: 'action', phase: 'Delivery', desc: 'Bank rec, coding, payroll, BAS prep each month', duration: '4-8 hours/month', systems: ['Xero'] },
      /* 11 */ { name: 'Quarterly Review', lane: 1, column: 10, type: 'action', phase: 'Review', desc: 'Review P&L, balance sheet, cashflow with client', duration: '1 hour', systems: ['Xero'], documents: ['Quarterly Report'] },
      /* 12 */ { name: 'Annual Prep & Price Review', lane: 0, column: 11, type: 'action', phase: 'Review', desc: 'Year-end workpapers for tax accountant, review scope and pricing', duration: '1 day', systems: ['Xero'], documents: ['Year-End Workpapers'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green', type: 'decision' },
      { from: 2, to: 4, label: 'No', color: 'red', type: 'decision' },
      { from: 3, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Marketing Agency
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'marketing-agency',
    name: 'Marketing Agency',
    description: 'Campaign workflow from brief to post-campaign review',
    icon: '📢',
    category: 'industry',
    subcategory: 'Professional Services',
    swimlanes: [
      { name: 'Account Manager', colorIndex: 0 },
      { name: 'Creative Team', colorIndex: 3 },
      { name: 'Client', colorIndex: 5 },
    ],
    phases: [
      { name: 'Brief', colorIndex: 0 },
      { name: 'Production', colorIndex: 1 },
      { name: 'Delivery', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Brief', lane: 0, column: 0, type: 'action', phase: 'Brief', desc: 'Client submits campaign brief or request', duration: '15 mins', systems: ['Monday.com'] },
      /* 1  */ { name: 'Scope and Quote', lane: 0, column: 1, type: 'action', phase: 'Brief', desc: 'Define deliverables, timeline and pricing', duration: '2-4 hours', documents: ['Scope Document', 'Quote'] },
      /* 2  */ { name: 'Approved?', lane: 0, column: 2, type: 'decision', phase: 'Brief', decisionYes: 'Yes', decisionNo: 'No' },
      /* 3  */ { name: 'Strategy Development', lane: 1, column: 3, type: 'action', phase: 'Production', desc: 'Develop campaign strategy, targeting, messaging', duration: '2-3 days', documents: ['Strategy Doc'] },
      /* 4  */ { name: 'Revise Scope', lane: 0, column: 3, type: 'action', phase: 'Brief', desc: 'Revise scope based on client feedback', duration: '1 hour' },
      /* 5  */ { name: 'Content Creation', lane: 1, column: 4, type: 'action', phase: 'Production', desc: 'Design, copywriting, video production', duration: '3-7 days', systems: ['Adobe Creative Suite', 'Canva'] },
      /* 6  */ { name: 'Internal Review', lane: 1, column: 5, type: 'action', phase: 'Production', desc: 'Quality check and brand alignment review', duration: '1 day' },
      /* 7  */ { name: 'Client Review', lane: 2, column: 6, type: 'action', phase: 'Production', desc: 'Client reviews creative and provides feedback', duration: '2-3 days' },
      /* 8  */ { name: 'Client Approved?', lane: 2, column: 7, type: 'decision', phase: 'Production', decisionYes: 'Yes', decisionNo: 'No' },
      /* 9  */ { name: 'Campaign Setup', lane: 1, column: 8, type: 'action', phase: 'Delivery', desc: 'Build campaigns in ad platforms, schedule posts', duration: '1 day', systems: ['Meta Ads', 'Google Ads'] },
      /* 10 */ { name: 'Revisions', lane: 0, column: 8, type: 'action', phase: 'Production', desc: 'Implement client feedback and re-submit for review', duration: '1-3 days' },
      /* 11 */ { name: 'Launch & Monitor', lane: 0, column: 9, type: 'action', phase: 'Delivery', desc: 'Push campaigns live and track KPIs daily', duration: 'Ongoing', systems: ['Google Analytics', 'Meta Ads'] },
      /* 12 */ { name: 'Reporting', lane: 0, column: 10, type: 'action', phase: 'Delivery', desc: 'Compile performance report for client', duration: '2-4 hours', documents: ['Campaign Report'] },
      /* 13 */ { name: 'Post-Campaign Review', lane: 0, column: 11, type: 'action', phase: 'Delivery', desc: 'Review results with client, discuss next steps', duration: '1 hour', systems: ['Zoom'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green', type: 'decision' },
      { from: 2, to: 4, label: 'No', color: 'red', type: 'decision' },
      { from: 3, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9, label: 'Yes', color: 'green', type: 'decision' },
      { from: 8, to: 10, label: 'No', color: 'red', type: 'decision' },
      { from: 9, to: 11 },
      { from: 11, to: 12 },
      { from: 12, to: 13 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Ecommerce
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ecommerce',
    name: 'Ecommerce',
    description: 'Customer order journey from browse to post-sale follow-up',
    icon: '🛒',
    category: 'industry',
    subcategory: 'Ecommerce',
    swimlanes: [
      { name: 'Customer', colorIndex: 5 },
      { name: 'Warehouse/Ops', colorIndex: 6 },
      { name: 'Finance', colorIndex: 1 },
      { name: 'Support', colorIndex: 0 },
    ],
    phases: [
      { name: 'Order', colorIndex: 0 },
      { name: 'Fulfilment', colorIndex: 1 },
      { name: 'Post-Sale', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Browse & Add to Cart', lane: 0, column: 0, type: 'action', phase: 'Order', desc: 'Customer browses products and adds to cart', systems: ['Shopify'] },
      /* 1  */ { name: 'Checkout', lane: 0, column: 1, type: 'action', phase: 'Order', desc: 'Enter shipping details and select payment method', duration: '5 mins', systems: ['Shopify'] },
      /* 2  */ { name: 'Payment Processing', lane: 2, column: 2, type: 'automation', phase: 'Order', desc: 'Process payment via gateway', duration: '30 secs', systems: ['Stripe'] },
      /* 3  */ { name: 'Order Confirmation', lane: 0, column: 3, type: 'automation', phase: 'Order', desc: 'Automated order confirmation email', systems: ['Shopify', 'Klaviyo'] },
      /* 4  */ { name: 'Pick and Pack', lane: 1, column: 4, type: 'action', phase: 'Fulfilment', desc: 'Pick items from shelves, pack for shipping', duration: '15-30 mins', systems: ['WMS'] },
      /* 5  */ { name: 'Quality Check', lane: 1, column: 5, type: 'action', phase: 'Fulfilment', desc: 'Verify correct items, quantity and condition', duration: '5 mins' },
      /* 6  */ { name: 'Ship Order', lane: 1, column: 6, type: 'action', phase: 'Fulfilment', desc: 'Print label and hand to carrier', duration: '10 mins', systems: ['Shippit', 'Australia Post'] },
      /* 7  */ { name: 'Receive Delivery', lane: 0, column: 7, type: 'action', phase: 'Fulfilment', desc: 'Customer receives and inspects order' },
      /* 8  */ { name: 'Return?', lane: 0, column: 8, type: 'decision', phase: 'Post-Sale', decisionYes: 'Yes', decisionNo: 'No' },
      /* 9  */ { name: 'Process Return', lane: 3, column: 9, type: 'action', phase: 'Post-Sale', desc: 'Receive return, inspect, process refund', duration: '2-5 days', systems: ['Shopify', 'Stripe'] },
      /* 10 */ { name: 'Follow-Up Email', lane: 0, column: 9, type: 'automation', phase: 'Post-Sale', desc: 'Automated post-purchase email sequence', systems: ['Klaviyo'] },
      /* 11 */ { name: 'Request Review', lane: 3, column: 10, type: 'automation', phase: 'Post-Sale', desc: 'Send product review request', systems: ['Yotpo', 'Klaviyo'] },
      /* 12 */ { name: 'Analyse Purchase Data', lane: 2, column: 11, type: 'action', phase: 'Post-Sale', desc: 'Review sales data, margins, trends for optimisation', duration: '1 hour', systems: ['Google Analytics', 'Shopify'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9, label: 'Yes', color: 'red', type: 'decision' },
      { from: 8, to: 10, label: 'No', color: 'green', type: 'decision' },
      { from: 9, to: 11 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Gym & Personal Training
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gym-pt',
    name: 'Gym & Personal Training',
    description: 'Member journey from enquiry through onboarding to retention',
    icon: '💪',
    category: 'industry',
    subcategory: 'Health & Wellness',
    swimlanes: [
      { name: 'Reception/Sales', colorIndex: 0 },
      { name: 'Trainer', colorIndex: 4 },
      { name: 'Management', colorIndex: 6 },
    ],
    phases: [
      { name: 'Enquiry', colorIndex: 0 },
      { name: 'Onboard', colorIndex: 1 },
      { name: 'Retain', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Enquiry', lane: 0, column: 0, type: 'action', phase: 'Enquiry', desc: 'Walk-in, phone, or online enquiry', duration: '5 mins', systems: ['CRM'] },
      /* 1  */ { name: 'Facility Tour', lane: 0, column: 1, type: 'action', phase: 'Enquiry', desc: 'Show prospect the gym, explain membership options', duration: '20 mins' },
      /* 2  */ { name: 'Sign Up?', lane: 0, column: 2, type: 'decision', phase: 'Enquiry', decisionYes: 'Yes', decisionNo: 'No' },
      /* 3  */ { name: 'Membership Registration', lane: 0, column: 3, type: 'action', phase: 'Onboard', desc: 'Complete sign-up, set up direct debit', duration: '15 mins', systems: ['Gym Software', 'Payment Gateway'], documents: ['Membership Agreement'] },
      /* 4  */ { name: 'Nurture Lead', lane: 2, column: 3, type: 'action', phase: 'Enquiry', desc: 'Add to follow-up sequence for future conversion', duration: '5 mins', systems: ['CRM'] },
      /* 5  */ { name: 'Health Screening', lane: 1, column: 4, type: 'action', phase: 'Onboard', desc: 'Pre-exercise screening questionnaire and health check', duration: '15 mins', documents: ['PAR-Q Form'] },
      /* 6  */ { name: 'Initial Consultation', lane: 1, column: 5, type: 'action', phase: 'Onboard', desc: 'Discuss goals, assess fitness level, body measurements', duration: '30 mins' },
      /* 7  */ { name: 'Create Training Plan', lane: 1, column: 6, type: 'action', phase: 'Onboard', desc: 'Design personalised program based on goals', duration: '30 mins', systems: ['TrueCoach'], documents: ['Training Plan'] },
      /* 8  */ { name: 'First Session', lane: 1, column: 7, type: 'action', phase: 'Onboard', desc: 'Guided first workout, teach correct form', duration: '1 hour' },
      /* 9  */ { name: 'Progress Check-In', lane: 1, column: 8, type: 'action', phase: 'Retain', desc: 'Follow up on progress, update program', duration: '30 mins' },
      /* 10 */ { name: 'Membership Renewal', lane: 2, column: 9, type: 'action', phase: 'Retain', desc: 'Process renewal or address cancellation', duration: '10 mins', systems: ['Gym Software'] },
      /* 11 */ { name: 'Referral Program', lane: 2, column: 10, type: 'action', phase: 'Retain', desc: 'Offer referral incentive, request introductions', duration: '5 mins' },
      /* 12 */ { name: 'Ongoing Coaching', lane: 1, column: 11, type: 'action', phase: 'Retain', desc: 'Regular training sessions and program updates', duration: 'Ongoing' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green', type: 'decision' },
      { from: 2, to: 4, label: 'No', color: 'red', type: 'decision' },
      { from: 3, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Allied Health
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'allied-health',
    name: 'Allied Health',
    description: 'Patient journey from referral through treatment to discharge',
    icon: '🏥',
    category: 'industry',
    subcategory: 'Health & Wellness',
    swimlanes: [
      { name: 'Reception', colorIndex: 5 },
      { name: 'Practitioner', colorIndex: 4 },
      { name: 'Admin/Billing', colorIndex: 2 },
    ],
    phases: [
      { name: 'Intake', colorIndex: 0 },
      { name: 'Treatment', colorIndex: 1 },
      { name: 'Discharge', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Referral', lane: 0, column: 0, type: 'action', phase: 'Intake', desc: 'GP or specialist referral received via fax/email/portal', duration: '5 mins', systems: ['Practice Software'] },
      /* 1  */ { name: 'Book Appointment', lane: 0, column: 1, type: 'action', phase: 'Intake', desc: 'Schedule first appointment, send confirmation', duration: '10 mins', systems: ['Cliniko', 'SMS Gateway'] },
      /* 2  */ { name: 'Intake Paperwork', lane: 0, column: 2, type: 'action', phase: 'Intake', desc: 'Patient completes health history, consent, Medicare details', duration: '15 mins', documents: ['Intake Form', 'Consent Form'] },
      /* 3  */ { name: 'Initial Assessment', lane: 1, column: 3, type: 'action', phase: 'Intake', desc: 'Comprehensive assessment, diagnosis, baseline measures', duration: '45-60 mins', documents: ['Assessment Notes'] },
      /* 4  */ { name: 'Create Treatment Plan', lane: 1, column: 4, type: 'action', phase: 'Treatment', desc: 'Set goals, frequency, expected duration of treatment', duration: '15 mins', systems: ['Cliniko'], documents: ['Treatment Plan'] },
      /* 5  */ { name: 'Treatment Sessions', lane: 1, column: 5, type: 'action', phase: 'Treatment', desc: 'Deliver treatment (hands-on, exercise, education)', duration: '30-45 mins' },
      /* 6  */ { name: 'Progress Review', lane: 1, column: 6, type: 'action', phase: 'Treatment', desc: 'Re-assess outcomes against goals', duration: '30 mins' },
      /* 7  */ { name: 'Goals Met?', lane: 1, column: 7, type: 'decision', phase: 'Treatment', decisionYes: 'Yes', decisionNo: 'No' },
      /* 8  */ { name: 'Discharge Plan', lane: 1, column: 8, type: 'action', phase: 'Discharge', desc: 'Create home program and prevention advice', duration: '15 mins', documents: ['Home Exercise Program'] },
      /* 9  */ { name: 'Continue Treatment', lane: 0, column: 8, type: 'action', phase: 'Treatment', desc: 'Rebook sessions; practitioner updates plan', duration: '30 mins' },
      /* 10 */ { name: 'Final Session', lane: 1, column: 9, type: 'action', phase: 'Discharge', desc: 'Final treatment and discharge education', duration: '30 mins', documents: ['Discharge Letter'] },
      /* 11 */ { name: 'Invoice / Claim', lane: 2, column: 10, type: 'action', phase: 'Discharge', desc: 'Process Medicare/DVA/private health claim or invoice', duration: '10 mins', systems: ['Cliniko', 'Medicare Online'] },
      /* 12 */ { name: 'GP Letter & Follow-Up', lane: 2, column: 11, type: 'action', phase: 'Discharge', desc: 'Send GP letter and patient follow-up at 3 months', duration: '10 mins' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8, label: 'Yes', color: 'green', type: 'decision' },
      { from: 7, to: 9, label: 'No', color: 'red', type: 'decision' },
      { from: 8, to: 10 },
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Manufacturing / Wholesale
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'manufacturing',
    name: 'Manufacturing / Wholesale',
    description: 'Order to dispatch for manufacturing and wholesale businesses',
    icon: '🏭',
    category: 'industry',
    subcategory: 'Manufacturing',
    swimlanes: [
      { name: 'Sales', colorIndex: 0 },
      { name: 'Production', colorIndex: 6 },
      { name: 'Warehouse/Logistics', colorIndex: 4 },
      { name: 'Finance', colorIndex: 1 },
    ],
    phases: [
      { name: 'Order', colorIndex: 0 },
      { name: 'Production', colorIndex: 1 },
      { name: 'Dispatch', colorIndex: 2 },
    ],
    steps: [
      /* 0  */ { name: 'Receive Order', lane: 0, column: 0, type: 'action', phase: 'Order', desc: 'Customer PO received via EDI, email or portal', duration: '10 mins', systems: ['ERP', 'Email'] },
      /* 1  */ { name: 'Confirm Stock/Capacity', lane: 0, column: 1, type: 'action', phase: 'Order', desc: 'Check inventory levels and production capacity', duration: '15 mins', systems: ['ERP'] },
      /* 2  */ { name: 'Can Fulfil?', lane: 0, column: 2, type: 'decision', phase: 'Order', decisionYes: 'Yes', decisionNo: 'No' },
      /* 3  */ { name: 'Schedule Production', lane: 1, column: 3, type: 'action', phase: 'Production', desc: 'Slot into production schedule based on priority', duration: '30 mins', systems: ['ERP'] },
      /* 4  */ { name: 'Notify Backorder', lane: 0, column: 3, type: 'action', phase: 'Order', desc: 'Advise customer of lead time and backorder status', duration: '15 mins', systems: ['ERP'] },
      /* 5  */ { name: 'Raw Material Check', lane: 1, column: 4, type: 'action', phase: 'Production', desc: 'Verify raw materials available, order if needed', duration: '1 hour', systems: ['ERP'] },
      /* 6  */ { name: 'Production Run', lane: 1, column: 5, type: 'action', phase: 'Production', desc: 'Manufacture product per spec and work order', duration: '1-5 days' },
      /* 7  */ { name: 'Quality Control', lane: 1, column: 6, type: 'action', phase: 'Production', desc: 'Inspect finished goods against quality standards', duration: '30-60 mins', documents: ['QC Checklist'] },
      /* 8  */ { name: 'Pass QC?', lane: 1, column: 7, type: 'decision', phase: 'Production', decisionYes: 'Yes', decisionNo: 'No' },
      /* 9  */ { name: 'Pack for Dispatch', lane: 2, column: 8, type: 'action', phase: 'Dispatch', desc: 'Pack goods, label, prepare shipping documentation', duration: '30-60 mins', documents: ['Packing Slip'] },
      /* 10 */ { name: 'Rework', lane: 1, column: 8, type: 'action', phase: 'Production', desc: 'Fix defects and re-inspect', duration: '1-2 days' },
      /* 11 */ { name: 'Arrange Shipping', lane: 2, column: 9, type: 'action', phase: 'Dispatch', desc: 'Book freight, generate consignment note, send tracking', duration: '15 mins', systems: ['Freight Software'] },
      /* 12 */ { name: 'Confirm Delivery', lane: 2, column: 10, type: 'action', phase: 'Dispatch', desc: 'Confirm delivery received by customer', duration: '5 mins' },
      /* 13 */ { name: 'Invoice & Payment', lane: 3, column: 11, type: 'action', phase: 'Dispatch', desc: 'Generate invoice and chase payment per credit terms', duration: '15 mins', systems: ['Xero', 'ERP'] },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green', type: 'decision' },
      { from: 2, to: 4, label: 'No', color: 'red', type: 'decision' },
      { from: 3, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9, label: 'Yes', color: 'green', type: 'decision' },
      { from: 8, to: 10, label: 'No', color: 'red', type: 'decision' },
      { from: 9, to: 11 },
      { from: 11, to: 12 },
      { from: 12, to: 13 },
    ],
  },
]

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  ...UNIVERSAL_TEMPLATES,
  ...INDUSTRY_TEMPLATES,
]

/**
 * Convert a template into a complete ProcessSnapshot with steps placed
 * directly into swimlanes and flows pre-defined.
 */
export function templateToSnapshot(template: ProcessTemplate): ProcessSnapshot {
  const swimlanes: SwimlaneDefinition[] = template.swimlanes.map((lane, i) => ({
    id: crypto.randomUUID(),
    name: lane.name,
    color: SWIMLANE_COLOR_PALETTE[lane.colorIndex % SWIMLANE_COLOR_PALETTE.length],
    order: i,
  }))

  // Generate PhaseDefinitions from template phases
  const phases: PhaseDefinition[] = (template.phases || []).map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    color: PHASE_COLOR_PALETTE[p.colorIndex % PHASE_COLOR_PALETTE.length],
    order: i,
  }))

  // Build name → id lookup for phase assignment
  const phaseNameToId = new Map(phases.map((p) => [p.name, p.id]))

  const steps: ProcessStepData[] = template.steps.map((step) => {
    const decisionOptions: DecisionOption[] | undefined =
      step.type === 'decision' && (step.decisionYes || step.decisionNo)
        ? [
            { label: step.decisionYes || 'Yes', color: 'green' },
            { label: step.decisionNo || 'No', color: 'red' },
          ]
        : undefined

    return {
      id: crypto.randomUUID(),
      swimlane_id: swimlanes[step.lane].id,
      order_num: step.column,
      action_name: step.name,
      step_type: step.type,
      phase_id: step.phase ? phaseNameToId.get(step.phase) : undefined,
      phase_name: step.phase,
      description: step.desc,
      estimated_duration: step.duration,
      systems_used: step.systems || [],
      documents_needed: step.documents || [],
      decision_yes_label: step.decisionYes,
      decision_no_label: step.decisionNo,
      decision_options: decisionOptions,
    }
  })

  const flows: ProcessFlowData[] = template.flows.map((flow) => ({
    id: crypto.randomUUID(),
    from_step_id: steps[flow.from].id,
    to_step_id: steps[flow.to].id,
    flow_type: flow.type || 'sequential',
    condition_label: flow.label,
    condition_color: flow.color,
  }))

  // Linearize: align cross-lane flow targets with source columns
  // This ensures the flow reads left-to-right even when crossing lanes
  let alignedSteps = [...steps]
  for (const flow of flows) {
    const from = alignedSteps.find((s) => s.id === flow.from_step_id)
    const to = alignedSteps.find((s) => s.id === flow.to_step_id)
    if (from && to && from.swimlane_id !== to.swimlane_id) {
      alignedSteps = alignCrossLaneFlow(alignedSteps, from.id, to.id)
    }
  }

  return {
    notes: [],
    swimlanes,
    phases,
    steps: alignedSteps,
    flows,
  }
}
