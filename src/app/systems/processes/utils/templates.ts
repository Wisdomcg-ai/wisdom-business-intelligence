import type { ProcessSnapshot, SwimlaneDefinition, ProcessStepData, ProcessFlowData, DecisionOption } from '@/types/process-builder'
import { SWIMLANE_COLOR_PALETTE } from '@/types/process-builder'
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
  swimlanes: { name: string; colorIndex: number }[]
  steps: TemplateStep[]
  flows: TemplateFlow[]
}

// ─── Trades / Renovation ─────────────────────────────────────────────
// Modelled on the "Bathroom Renovation Workflow" reference PDF
const TRADES_TEMPLATE: ProcessTemplate = {
  id: 'trades',
  name: 'Trades / Renovation',
  description: 'Enquiry to completion for trades businesses',
  icon: '🔨',
  swimlanes: [
    { name: 'Director', colorIndex: 4 },
    { name: 'Admin', colorIndex: 2 },
    { name: 'Finance', colorIndex: 1 },
    { name: 'Project Management', colorIndex: 6 },
  ],
  steps: [
    // ── Director (lane 0) ──
    /* 0  */ { name: 'Enquiry', lane: 0, column: 0, type: 'action', phase: 'Sales', desc: 'Phone call or email' },
    /* 1  */ { name: 'Qualify', lane: 0, column: 1, type: 'action', phase: 'Sales', desc: 'Refer on if not a fit', duration: '30 - 60 mins' },
    /* 2  */ { name: 'Schedule Onsite Visit', lane: 0, column: 2, type: 'action', phase: 'Sales' },
    /* 3  */ { name: 'Onsite Visit and Prepare Quote', lane: 0, column: 3, type: 'action', phase: 'Sales', documents: ['Photos'] },
    /* 4  */ { name: 'Review and Send Quote', lane: 0, column: 4, type: 'action', phase: 'Sales', systems: ['ServiceM8'], desc: 'Attach to Quote email in ServiceM8' },
    /* 5  */ { name: 'Adjust Quote', lane: 0, column: 6, type: 'action', phase: 'Sales' },
    /* 6  */ { name: 'Discuss Timelines and Confirm Job', lane: 0, column: 8, type: 'action', phase: 'Operations', desc: 'Deposit 30% 2 weeks before job\n60% on day 1\n10% on completion of QA' },
    /* 7  */ { name: 'Update Quote Spreadsheet with Schedule', lane: 0, column: 9, type: 'action', phase: 'Operations' },
    /* 8  */ { name: 'Notify Finance', lane: 0, column: 10, type: 'action', phase: 'Operations', desc: 'Email the quote to Finance' },
    /* 9  */ { name: 'Send Handover Email to Customer', lane: 0, column: 11, type: 'action', phase: 'Operations', documents: ['Handover email template'] },
    /* 10 */ { name: 'Brief Project Manager on Job', lane: 0, column: 12, type: 'action', phase: 'Operations', desc: 'Before start of job' },

    // ── Admin (lane 1) ──
    /* 11 */ { name: 'Prepare Quote', lane: 1, column: 0, type: 'action', phase: 'Sales', desc: 'Turnaround 48 hours\nAutomation set for follow-ups' },
    /* 12 */ { name: 'Notify Ready for Review', lane: 1, column: 1, type: 'action', phase: 'Sales', desc: 'Notify Quote Ready' },
    /* 13 */ { name: 'Accept?', lane: 1, column: 2, type: 'decision', phase: 'Sales', decisionYes: 'Yes', decisionNo: 'No' },
    /* 14 */ { name: 'Follow Up Quotes', lane: 1, column: 3, type: 'action', phase: 'Sales', desc: 'By phone first, if no contact send email' },
    /* 15 */ { name: 'Update Status in ServiceM8', lane: 1, column: 4, type: 'action', phase: 'Sales', systems: ['ServiceM8'], desc: 'Wait 5-7 days' },
    /* 16 */ { name: 'Change Job Status to Unsuccessful', lane: 1, column: 5, type: 'action', phase: 'Sales' },
    /* 17 */ { name: 'Convert Job to a Work Order', lane: 1, column: 7, type: 'action', phase: 'Sales', desc: 'Successful' },
    /* 18 */ { name: 'Schedule Job', lane: 1, column: 9, type: 'action', phase: 'Operations', desc: 'Shared calendar' },
    /* 19 */ { name: 'Send Confirmation Email to Customer', lane: 1, column: 10, type: 'action', phase: 'Operations', documents: ['Confirmation Email'] },
    /* 20 */ { name: 'Order Materials and Attach List to Job', lane: 1, column: 11, type: 'action', phase: 'Operations', documents: ['From quote'] },
    /* 21 */ { name: 'After Sales Feedback', lane: 1, column: 19, type: 'action', phase: 'Operations', desc: 'Call customer for feedback and send link for review', documents: ['After sales email template'] },

    // ── Finance (lane 2) ──
    /* 22 */ { name: 'Prepare and Send Deposit Invoice', lane: 2, column: 8, type: 'action', phase: 'Operations', desc: '$200 Deposit' },
    /* 23 */ { name: 'Prepare and Send Deposit Invoice 30%', lane: 2, column: 9, type: 'action', phase: 'Operations', desc: '2 weeks prior to start' },
    /* 24 */ { name: 'Invoice Paid?', lane: 2, column: 10, type: 'decision', phase: 'Operations', decisionYes: 'Yes', decisionNo: 'No' },
    /* 25 */ { name: 'Request Immediate Payment', lane: 2, column: 11, type: 'action', phase: 'Operations' },
    /* 26 */ { name: 'Invoice for 60%', lane: 2, column: 13, type: 'action', phase: 'Operations', desc: 'Onsite Day 1\nAutomated follow up if not paid within 7 days' },
    /* 27 */ { name: 'Purchase Home Warranty', lane: 2, column: 17, type: 'action', phase: 'Operations' },
    /* 28 */ { name: 'Invoice for 10%', lane: 2, column: 19, type: 'action', phase: 'Operations', desc: 'Automated payment reminders.\nCall if not paid within X days' },

    // ── Project Management (lane 3) ──
    /* 29 */ { name: 'Review Job with Director', lane: 3, column: 12, type: 'action', phase: 'Operations', systems: ['ServiceM8'], desc: 'Review details in ServiceM8' },
    /* 30 */ { name: 'Schedule and Brief the Team', lane: 3, column: 13, type: 'action', phase: 'Operations' },
    /* 31 */ { name: 'Walk-through with Customer', lane: 3, column: 14, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 1' },
    /* 32 */ { name: 'Strip Out and Prep for Rough-in', lane: 3, column: 15, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 1' },
    /* 33 */ { name: 'Rough-in Electrical and Plumbing', lane: 3, column: 16, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 2' },
    /* 34 */ { name: 'Water Proofing', lane: 3, column: 17, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 3' },
    /* 35 */ { name: 'Bedding and Tiling', lane: 3, column: 18, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 4-9' },
    /* 36 */ { name: 'Fit Off', lane: 3, column: 19, type: 'action', phase: 'Operations', desc: 'Onsite Day 10' },
    /* 37 */ { name: 'Electrical and Plumbing Fit Off', lane: 3, column: 20, type: 'action', phase: 'Operations', documents: ['Photos'], desc: 'Onsite Day 11' },
    /* 38 */ { name: 'Final Clean', lane: 3, column: 21, type: 'action', phase: 'Operations', documents: ['Checklist'], desc: 'Onsite Day 12' },
    /* 39 */ { name: 'QA with Customer', lane: 3, column: 22, type: 'action', phase: 'Operations' },
    /* 40 */ { name: 'Handover and Feedback', lane: 3, column: 23, type: 'action', phase: 'Operations', documents: ['Photos'] },
    /* 41 */ { name: 'Release Final Invoice', lane: 3, column: 24, type: 'action', phase: 'Operations' },
    /* 42 */ { name: 'Send Text to Accounts', lane: 3, column: 25, type: 'action', phase: 'Operations' },
  ],
  flows: [
    // Director chain
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    // Director → Admin handoff
    { from: 3, to: 11 },
    // Admin quote process
    { from: 11, to: 12 },
    { from: 12, to: 13 },
    // Decision: Accept?
    { from: 13, to: 17, label: 'Yes', color: 'green' },
    { from: 13, to: 14, label: 'No', color: 'red' },
    // No path: follow up
    { from: 14, to: 15, label: 'No Response' },
    { from: 15, to: 16, label: 'Unsuccessful' },
    // Adjust quote loops back
    { from: 5, to: 12 },
    // Yes path continues
    { from: 4, to: 5, label: 'No Response' },
    { from: 17, to: 6, label: 'Successful' },
    { from: 6, to: 7 },
    { from: 7, to: 8 },
    { from: 8, to: 9 },
    { from: 9, to: 10 },
    // Operations: scheduling
    { from: 17, to: 18 },
    { from: 18, to: 19 },
    { from: 19, to: 20 },
    // Finance
    { from: 8, to: 22 },
    { from: 22, to: 23 },
    { from: 23, to: 24 },
    { from: 24, to: 26, label: 'Yes', color: 'green' },
    { from: 24, to: 25, label: 'No', color: 'red' },
    // Director briefs PM
    { from: 10, to: 29 },
    // PM job execution
    { from: 29, to: 30 },
    { from: 30, to: 31 },
    { from: 26, to: 31 },
    { from: 31, to: 32 },
    { from: 32, to: 33 },
    { from: 33, to: 34 },
    { from: 34, to: 35 },
    { from: 35, to: 36 },
    { from: 36, to: 37 },
    { from: 37, to: 38 },
    { from: 38, to: 39 },
    { from: 39, to: 40 },
    { from: 40, to: 41 },
    { from: 41, to: 42 },
    // Final invoicing
    { from: 27, to: 28 },
    { from: 39, to: 28 },
    { from: 40, to: 21 },
  ],
}

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  TRADES_TEMPLATE,
  {
    id: 'professional-services',
    name: 'Professional Services',
    description: 'Client engagement from enquiry to delivery',
    icon: '💼',
    swimlanes: [
      { name: 'Business Development', colorIndex: 0 },
      { name: 'Delivery', colorIndex: 1 },
      { name: 'Finance', colorIndex: 2 },
    ],
    steps: [
      { name: 'Receive Enquiry', lane: 0, column: 0, type: 'action', phase: 'Sales', duration: '10 mins' },
      { name: 'Discovery Call', lane: 0, column: 1, type: 'action', phase: 'Sales', duration: '30 mins', desc: 'Understand client needs' },
      { name: 'Assess Fit', lane: 0, column: 2, type: 'decision', phase: 'Sales', decisionYes: 'Good fit', decisionNo: 'Not ideal' },
      { name: 'Write Proposal', lane: 0, column: 3, type: 'action', phase: 'Sales', duration: '2 hours', documents: ['Proposal template'] },
      { name: 'Accepted?', lane: 0, column: 4, type: 'decision', phase: 'Sales', decisionYes: 'Yes', decisionNo: 'No' },
      { name: 'Onboard Client', lane: 1, column: 5, type: 'action', phase: 'Delivery', duration: '1 hour' },
      { name: 'Deliver Service', lane: 1, column: 6, type: 'action', phase: 'Delivery' },
      { name: 'Review & Adjust', lane: 1, column: 7, type: 'action', phase: 'Delivery' },
      { name: 'Send Invoice', lane: 2, column: 8, type: 'action', phase: 'Finance', systems: ['Xero'] },
      { name: 'Collect Feedback', lane: 1, column: 9, type: 'action' },
      { name: 'Request Referral', lane: 0, column: 10, type: 'action' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Good fit', color: 'green' },
      { from: 2, to: 10, label: 'Not ideal', color: 'red' },
      { from: 3, to: 4 },
      { from: 4, to: 5, label: 'Yes', color: 'green' },
      { from: 4, to: 10, label: 'No', color: 'red' },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
      { from: 9, to: 10 },
    ],
  },
  {
    id: 'retail',
    name: 'Retail / E-commerce',
    description: 'Customer journey from browse to fulfilment',
    icon: '🛍️',
    swimlanes: [
      { name: 'Customer-Facing', colorIndex: 4 },
      { name: 'Warehouse', colorIndex: 1 },
      { name: 'Finance', colorIndex: 2 },
    ],
    steps: [
      { name: 'Customer Browses', lane: 0, column: 0, type: 'action', phase: 'Order' },
      { name: 'Add to Cart', lane: 0, column: 1, type: 'action', phase: 'Order' },
      { name: 'Checkout', lane: 0, column: 2, type: 'action', phase: 'Order' },
      { name: 'Payment', lane: 2, column: 3, type: 'automation', phase: 'Order', systems: ['Stripe'] },
      { name: 'Pick & Pack', lane: 1, column: 4, type: 'action', phase: 'Fulfilment' },
      { name: 'Ship Order', lane: 1, column: 5, type: 'action', phase: 'Fulfilment', systems: ['Auspost'] },
      { name: 'Delivery Confirm', lane: 1, column: 6, type: 'wait', phase: 'Fulfilment' },
      { name: 'Follow-Up Email', lane: 0, column: 7, type: 'automation', phase: 'Post-Sale' },
      { name: 'Return?', lane: 0, column: 8, type: 'decision', phase: 'Post-Sale', decisionYes: 'Return', decisionNo: 'Complete' },
      { name: 'Process Return', lane: 1, column: 9, type: 'action', phase: 'Post-Sale' },
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
      { from: 8, to: 9, label: 'Return', color: 'red' },
    ],
  },
  {
    id: 'hospitality',
    name: 'Hospitality / Events',
    description: 'Booking through to feedback',
    icon: '🍽️',
    swimlanes: [
      { name: 'Front of House', colorIndex: 5 },
      { name: 'Kitchen / Ops', colorIndex: 1 },
      { name: 'Management', colorIndex: 3 },
    ],
    steps: [
      { name: 'Receive Booking', lane: 0, column: 0, type: 'action', phase: 'Booking' },
      { name: 'Confirm Details', lane: 0, column: 1, type: 'action', phase: 'Booking' },
      { name: 'Prep Menu', lane: 1, column: 2, type: 'action', phase: 'Preparation' },
      { name: 'Staff Rostering', lane: 2, column: 2, type: 'action', phase: 'Preparation' },
      { name: 'Setup Venue', lane: 1, column: 3, type: 'action', phase: 'Preparation' },
      { name: 'Welcome Guests', lane: 0, column: 4, type: 'action', phase: 'Event' },
      { name: 'Service', lane: 0, column: 5, type: 'action', phase: 'Event' },
      { name: 'Process Payment', lane: 0, column: 6, type: 'action', phase: 'Close' },
      { name: 'Collect Feedback', lane: 2, column: 7, type: 'action', phase: 'Close' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
    ],
  },
  {
    id: 'sales',
    name: 'Generic Sales',
    description: 'Lead to close pipeline',
    icon: '📈',
    swimlanes: [
      { name: 'Sales', colorIndex: 0 },
      { name: 'Marketing', colorIndex: 7 },
      { name: 'Account Mgmt', colorIndex: 6 },
    ],
    steps: [
      { name: 'Generate Lead', lane: 1, column: 0, type: 'action', phase: 'Prospecting' },
      { name: 'Qualify Lead', lane: 0, column: 1, type: 'action', phase: 'Prospecting' },
      { name: 'Worth Pursuing?', lane: 0, column: 2, type: 'decision', phase: 'Prospecting', decisionYes: 'Yes', decisionNo: 'No' },
      { name: 'Present Solution', lane: 0, column: 3, type: 'action', phase: 'Closing' },
      { name: 'Handle Objections', lane: 0, column: 4, type: 'action', phase: 'Closing' },
      { name: 'Send Proposal', lane: 0, column: 5, type: 'action', phase: 'Closing', documents: ['Proposal template'] },
      { name: 'Close Deal', lane: 0, column: 6, type: 'decision', phase: 'Closing', decisionYes: 'Won', decisionNo: 'Lost' },
      { name: 'Onboard Customer', lane: 2, column: 7, type: 'action', phase: 'Post-Sale' },
      { name: 'Nurture Relationship', lane: 2, column: 8, type: 'action', phase: 'Post-Sale' },
      { name: 'Nurture & Retry', lane: 1, column: 9, type: 'action' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'Yes', color: 'green' },
      { from: 2, to: 9, label: 'No', color: 'red' },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
      { from: 6, to: 7, label: 'Won', color: 'green' },
      { from: 6, to: 9, label: 'Lost', color: 'red' },
      { from: 7, to: 8 },
    ],
  },
  {
    id: 'onboarding',
    name: 'Employee Onboarding',
    description: 'Hiring through to first 90 days',
    icon: '👋',
    swimlanes: [
      { name: 'HR / Recruitment', colorIndex: 5 },
      { name: 'Manager', colorIndex: 6 },
      { name: 'IT / Admin', colorIndex: 7 },
    ],
    steps: [
      { name: 'Post Job Ad', lane: 0, column: 0, type: 'action', phase: 'Recruitment' },
      { name: 'Screen Applications', lane: 0, column: 1, type: 'action', phase: 'Recruitment' },
      { name: 'Interview', lane: 1, column: 2, type: 'action', phase: 'Recruitment' },
      { name: 'Hire?', lane: 1, column: 3, type: 'decision', phase: 'Recruitment', decisionYes: 'Yes', decisionNo: 'No' },
      { name: 'Send Offer Letter', lane: 0, column: 4, type: 'action', phase: 'Pre-boarding' },
      { name: 'Setup Accounts', lane: 2, column: 4, type: 'action', phase: 'Pre-boarding' },
      { name: 'Prepare Workspace', lane: 2, column: 5, type: 'action', phase: 'Pre-boarding' },
      { name: 'Day 1 Induction', lane: 1, column: 6, type: 'action', phase: 'Onboarding' },
      { name: '30-Day Check-in', lane: 1, column: 7, type: 'action', phase: 'Onboarding' },
      { name: '90-Day Review', lane: 1, column: 8, type: 'action', phase: 'Onboarding' },
      { name: 'Re-advertise', lane: 0, column: 9, type: 'action' },
    ],
    flows: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4, label: 'Yes', color: 'green' },
      { from: 3, to: 5, label: 'Yes', color: 'green' },
      { from: 3, to: 10, label: 'No', color: 'red' },
      { from: 4, to: 7 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 7, to: 8 },
      { from: 8, to: 9 },
    ],
  },
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
    steps: alignedSteps,
    flows,
  }
}
