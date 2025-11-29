// ============================================================================
// MOCK PROCESS DATA: Bathroom Renovation Workflow
// ============================================================================

export interface ProcessStep {
  id: string;
  swimlane_name: string;
  department: string;
  order_num: number;
  activity_name: string;
}

export interface ProcessFlow {
  id: string;
  from_step_id: string;
  to_step_id: string;
  condition_label?: string;
  condition_color?: 'green' | 'red' | 'orange';
  flow_type: string;
}

export interface ProcessPhase {
  id: string;
  phase_name: string;
  order_num: number;
}

// PHASES
export const mockPhases: ProcessPhase[] = [
  { id: 'phase-director', phase_name: 'Director/Admin', order_num: 1 },
  { id: 'phase-sales', phase_name: 'Sales', order_num: 2 },
  { id: 'phase-operations', phase_name: 'Operations', order_num: 3 },
  { id: 'phase-finance', phase_name: 'Finance', order_num: 4 },
  { id: 'phase-pm', phase_name: 'Project Management', order_num: 5 },
];

// ACTIVITIES
export const mockSteps: ProcessStep[] = [
  { id: 'activity-director-1', swimlane_name: 'Director/Admin', department: 'Director', order_num: 1, activity_name: 'Review Job with Director' },
  { id: 'activity-director-2', swimlane_name: 'Director/Admin', department: 'Director', order_num: 2, activity_name: 'Approve Job' },
  { id: 'activity-sales-1', swimlane_name: 'Sales', department: 'Sales', order_num: 1, activity_name: 'Enquiry' },
  { id: 'activity-sales-2', swimlane_name: 'Sales', department: 'Sales', order_num: 2, activity_name: 'Qualify Lead' },
  { id: 'activity-sales-3', swimlane_name: 'Sales', department: 'Sales', order_num: 3, activity_name: 'Schedule Onsite Visit' },
  { id: 'activity-sales-4', swimlane_name: 'Sales', department: 'Sales', order_num: 4, activity_name: 'Onsite Visit & Prepare Quote' },
  { id: 'activity-sales-5', swimlane_name: 'Sales', department: 'Sales', order_num: 5, activity_name: 'Review & Send Quote' },
  { id: 'activity-sales-6', swimlane_name: 'Sales', department: 'Sales', order_num: 6, activity_name: 'Follow Up Quotes' },
  { id: 'activity-sales-7', swimlane_name: 'Sales', department: 'Sales', order_num: 7, activity_name: 'Adjust Quote' },
  { id: 'activity-sales-8', swimlane_name: 'Sales', department: 'Sales', order_num: 8, activity_name: 'Quote Successful' },
  { id: 'activity-ops-1', swimlane_name: 'Operations', department: 'Operations', order_num: 1, activity_name: 'Prepare & Send Deposit Invoice 30%' },
  { id: 'activity-ops-2', swimlane_name: 'Operations', department: 'Operations', order_num: 2, activity_name: 'Discuss Timelines & Confirm Job' },
  { id: 'activity-ops-3', swimlane_name: 'Operations', department: 'Operations', order_num: 3, activity_name: 'Order Materials & Attach List' },
  { id: 'activity-ops-4', swimlane_name: 'Operations', department: 'Operations', order_num: 4, activity_name: 'Mark for Water Proofing' },
  { id: 'activity-ops-5', swimlane_name: 'Operations', department: 'Operations', order_num: 5, activity_name: 'Send Handover Email to Customer' },
  { id: 'activity-ops-6', swimlane_name: 'Operations', department: 'Operations', order_num: 6, activity_name: 'Brief Project Manager on Job' },
  { id: 'activity-ops-7', swimlane_name: 'Operations', department: 'Operations', order_num: 7, activity_name: 'Day 1: Strip Out & Prep' },
  { id: 'activity-ops-8', swimlane_name: 'Operations', department: 'Operations', order_num: 8, activity_name: 'Day 2: Rough-in Electrical & Plumbing' },
  { id: 'activity-ops-9', swimlane_name: 'Operations', department: 'Operations', order_num: 9, activity_name: 'Day 3: Water Proofing' },
  { id: 'activity-ops-10', swimlane_name: 'Operations', department: 'Operations', order_num: 10, activity_name: 'Day 4-5: Bedding & Tiling' },
  { id: 'activity-ops-11', swimlane_name: 'Operations', department: 'Operations', order_num: 11, activity_name: 'Day 6-9: Fit Off' },
  { id: 'activity-ops-12', swimlane_name: 'Operations', department: 'Operations', order_num: 12, activity_name: 'Day 10: Final Clean' },
  { id: 'activity-ops-13', swimlane_name: 'Operations', department: 'Operations', order_num: 13, activity_name: 'QA with Customer' },
  { id: 'activity-ops-14', swimlane_name: 'Operations', department: 'Operations', order_num: 14, activity_name: 'Handover & Feedback' },
  { id: 'activity-ops-15', swimlane_name: 'Operations', department: 'Operations', order_num: 15, activity_name: 'After Sales Feedback' },
  { id: 'activity-finance-1', swimlane_name: 'Finance', department: 'Finance', order_num: 1, activity_name: 'Email Quote to Finance' },
  { id: 'activity-finance-2', swimlane_name: 'Finance', department: 'Finance', order_num: 2, activity_name: 'Notify Finance' },
  { id: 'activity-finance-3', swimlane_name: 'Finance', department: 'Finance', order_num: 3, activity_name: 'Invoice Paid' },
  { id: 'activity-finance-4', swimlane_name: 'Finance', department: 'Finance', order_num: 4, activity_name: 'Automated Payment Reminders' },
  { id: 'activity-finance-5', swimlane_name: 'Finance', department: 'Finance', order_num: 5, activity_name: 'Invoice for 60% On Day 1' },
  { id: 'activity-finance-6', swimlane_name: 'Finance', department: 'Finance', order_num: 6, activity_name: 'Send Text to Accounts' },
  { id: 'activity-finance-7', swimlane_name: 'Finance', department: 'Finance', order_num: 7, activity_name: 'Release Final Invoice' },
  { id: 'activity-finance-8', swimlane_name: 'Finance', department: 'Finance', order_num: 8, activity_name: 'Invoice for 10%' },
  { id: 'activity-pm-1', swimlane_name: 'Project Management', department: 'Project Management', order_num: 1, activity_name: 'Update ServiceM8' },
  { id: 'activity-pm-2', swimlane_name: 'Project Management', department: 'Project Management', order_num: 2, activity_name: 'Schedule & Brief Team' },
  { id: 'activity-pm-3', swimlane_name: 'Project Management', department: 'Project Management', order_num: 3, activity_name: 'Day 1: Walk-through' },
  { id: 'activity-pm-4', swimlane_name: 'Project Management', department: 'Project Management', order_num: 4, activity_name: 'Day 2: Progress Check' },
  { id: 'activity-pm-5', swimlane_name: 'Project Management', department: 'Project Management', order_num: 5, activity_name: 'Day 3: Waterproofing' },
  { id: 'activity-pm-6', swimlane_name: 'Project Management', department: 'Project Management', order_num: 6, activity_name: 'Day 4-5: Tiling' },
  { id: 'activity-pm-7', swimlane_name: 'Project Management', department: 'Project Management', order_num: 7, activity_name: 'Day 6-9: Inspection' },
  { id: 'activity-pm-8', swimlane_name: 'Project Management', department: 'Project Management', order_num: 8, activity_name: 'Day 10: Final Walkthrough' },
];

// FLOWS
export const mockFlows: ProcessFlow[] = [
  { id: 'flow-1', from_step_id: 'activity-sales-1', to_step_id: 'activity-sales-2', flow_type: 'sequence' },
  { id: 'flow-2', from_step_id: 'activity-sales-2', to_step_id: 'activity-sales-3', condition_label: 'Qualified', condition_color: 'green', flow_type: 'sequence' },
  { id: 'flow-3', from_step_id: 'activity-sales-3', to_step_id: 'activity-sales-4', flow_type: 'sequence' },
  { id: 'flow-4', from_step_id: 'activity-sales-4', to_step_id: 'activity-sales-5', flow_type: 'sequence' },
  { id: 'flow-5', from_step_id: 'activity-sales-5', to_step_id: 'activity-sales-6', flow_type: 'sequence' },
  { id: 'flow-6', from_step_id: 'activity-sales-6', to_step_id: 'activity-sales-7', condition_label: 'No Response', condition_color: 'orange', flow_type: 'sequence' },
  { id: 'flow-7', from_step_id: 'activity-sales-7', to_step_id: 'activity-sales-8', condition_label: 'Accepted', condition_color: 'green', flow_type: 'sequence' },
  { id: 'flow-8', from_step_id: 'activity-sales-8', to_step_id: 'activity-ops-1', flow_type: 'handoff' },
  { id: 'flow-9', from_step_id: 'activity-sales-5', to_step_id: 'activity-finance-1', flow_type: 'parallel' },
  { id: 'flow-10', from_step_id: 'activity-finance-1', to_step_id: 'activity-finance-2', flow_type: 'sequence' },
  { id: 'flow-11', from_step_id: 'activity-finance-2', to_step_id: 'activity-finance-3', condition_label: 'Payment Required', condition_color: 'orange', flow_type: 'sequence' },
  { id: 'flow-12', from_step_id: 'activity-finance-3', to_step_id: 'activity-ops-3', flow_type: 'sequence' },
  { id: 'flow-13', from_step_id: 'activity-ops-1', to_step_id: 'activity-ops-2', flow_type: 'sequence' },
  { id: 'flow-14', from_step_id: 'activity-ops-2', to_step_id: 'activity-ops-3', flow_type: 'sequence' },
  { id: 'flow-15', from_step_id: 'activity-ops-3', to_step_id: 'activity-ops-4', flow_type: 'sequence' },
  { id: 'flow-16', from_step_id: 'activity-ops-4', to_step_id: 'activity-ops-5', flow_type: 'sequence' },
  { id: 'flow-17', from_step_id: 'activity-ops-5', to_step_id: 'activity-ops-6', flow_type: 'sequence' },
  { id: 'flow-18', from_step_id: 'activity-ops-6', to_step_id: 'activity-pm-1', flow_type: 'sequence' },
  { id: 'flow-19', from_step_id: 'activity-pm-1', to_step_id: 'activity-pm-2', flow_type: 'sequence' },
  { id: 'flow-20', from_step_id: 'activity-pm-2', to_step_id: 'activity-director-1', flow_type: 'sequence' },
  { id: 'flow-21', from_step_id: 'activity-director-1', to_step_id: 'activity-director-2', flow_type: 'sequence' },
  { id: 'flow-22', from_step_id: 'activity-director-2', to_step_id: 'activity-ops-7', condition_label: 'Approved', condition_color: 'green', flow_type: 'sequence' },
  { id: 'flow-23', from_step_id: 'activity-director-2', to_step_id: 'activity-finance-5', flow_type: 'parallel' },
  { id: 'flow-24', from_step_id: 'activity-ops-7', to_step_id: 'activity-ops-8', flow_type: 'sequence' },
  { id: 'flow-25', from_step_id: 'activity-ops-8', to_step_id: 'activity-ops-9', flow_type: 'sequence' },
  { id: 'flow-26', from_step_id: 'activity-ops-9', to_step_id: 'activity-ops-10', flow_type: 'sequence' },
  { id: 'flow-27', from_step_id: 'activity-ops-10', to_step_id: 'activity-ops-11', flow_type: 'sequence' },
  { id: 'flow-28', from_step_id: 'activity-ops-11', to_step_id: 'activity-ops-12', flow_type: 'sequence' },
  { id: 'flow-29', from_step_id: 'activity-ops-12', to_step_id: 'activity-ops-13', flow_type: 'sequence' },
  { id: 'flow-30', from_step_id: 'activity-ops-13', to_step_id: 'activity-ops-14', flow_type: 'sequence' },
  { id: 'flow-31', from_step_id: 'activity-ops-14', to_step_id: 'activity-ops-15', flow_type: 'sequence' },
  { id: 'flow-32', from_step_id: 'activity-ops-7', to_step_id: 'activity-pm-3', flow_type: 'parallel' },
  { id: 'flow-33', from_step_id: 'activity-pm-3', to_step_id: 'activity-pm-4', flow_type: 'sequence' },
  { id: 'flow-34', from_step_id: 'activity-pm-4', to_step_id: 'activity-pm-5', flow_type: 'sequence' },
  { id: 'flow-35', from_step_id: 'activity-pm-5', to_step_id: 'activity-pm-6', flow_type: 'sequence' },
  { id: 'flow-36', from_step_id: 'activity-pm-6', to_step_id: 'activity-pm-7', flow_type: 'sequence' },
  { id: 'flow-37', from_step_id: 'activity-pm-7', to_step_id: 'activity-pm-8', flow_type: 'sequence' },
  { id: 'flow-38', from_step_id: 'activity-ops-14', to_step_id: 'activity-finance-8', flow_type: 'sequence' },
  { id: 'flow-39', from_step_id: 'activity-finance-8', to_step_id: 'activity-finance-7', condition_label: 'Completed', condition_color: 'green', flow_type: 'sequence' },
];

export function getMockProcessData() {
  return {
    diagram: {
      id: 'mock-bathroom-renovation',
      process_name: 'Bathroom Renovation Workflow',
      description: 'Complete workflow for bathroom renovation projects',
    },
    steps: mockSteps,
    flows: mockFlows,
    phases: mockPhases,
  };
}