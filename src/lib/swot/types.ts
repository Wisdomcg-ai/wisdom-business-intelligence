export type SwotType = 'initial' | 'quarterly' | 'ad-hoc';
export type SwotStatus = 'draft' | 'in-progress' | 'final' | 'archived';
export type SwotCategory = 'strength' | 'weakness' | 'opportunity' | 'threat';
export type ItemStatus = 'active' | 'resolved' | 'archived' | 'carried-forward';
export type ActionType = 'leverage' | 'improve' | 'pursue' | 'mitigate' | 'monitor';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type ActionStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled' | 'deferred';
export type CollaboratorRole = 'owner' | 'editor' | 'contributor' | 'viewer';
export type BusinessStage = 'startup' | 'growth' | 'mature' | 'turnaround';
export type HistoryActionType = 'created' | 'updated' | 'deleted' | 'status_changed' | 'finalized' | 'carried_forward';

// Main SWOT Analysis interface
export interface SwotAnalysis {
  id: string;
  business_id: string;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  type: SwotType;
  status: SwotStatus;
  title?: string;
  description?: string;
  swot_score?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  finalized_at?: string;
  due_date?: string;
  
  // Joined data (not in table, but often fetched)
  items?: SwotItem[];
  action_items?: SwotActionItem[];
  collaborators?: SwotCollaborator[];
  
  // Computed fields from view
  total_items?: number;
  strengths_count?: number;
  weaknesses_count?: number;
  opportunities_count?: number;
  threats_count?: number;
  action_items_count?: number;
  completed_actions_count?: number;
}

// Individual SWOT item
export interface SwotItem {
  id: string;
  swot_analysis_id: string;
  category: SwotCategory;
  title: string;
  description?: string;
  impact_level: 1 | 2 | 3 | 4 | 5;
  likelihood?: 1 | 2 | 3 | 4 | 5; // For opportunities and threats
  priority_order: number;
  status: ItemStatus;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  carried_from_item_id?: string;
  
  // Joined data
  comments?: SwotComment[];
  action_items?: SwotActionItem[];
}

// SWOT Comparison between quarters
export interface SwotComparison {
  id: string;
  from_analysis_id: string;
  to_analysis_id: string;
  comparison_date: string;
  items_added: number;
  items_removed: number;
  items_modified: number;
  items_carried_forward: number;
  strengths_change: number;
  weaknesses_change: number;
  opportunities_change: number;
  threats_change: number;
  overall_improvement_score?: number;
  notes?: string;
  created_by: string;
  created_at: string;
  
  // Joined data
  from_analysis?: SwotAnalysis;
  to_analysis?: SwotAnalysis;
}

// Action item derived from SWOT
export interface SwotActionItem {
  id: string;
  swot_item_id: string;
  swot_analysis_id: string;
  title: string;
  description?: string;
  action_type?: ActionType;
  priority: Priority;
  status: ActionStatus;
  assigned_to?: string;
  assigned_to_email?: string;
  assigned_to_name?: string;
  due_date?: string;
  completed_date?: string;
  progress_percentage: number;
  effort_hours?: number;
  notes?: string;
  last_update?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  
  // Joined data
  swot_item?: SwotItem;
}

// SWOT Template for prompts
export interface SwotTemplate {
  id: string;
  name: string;
  industry?: string;
  business_stage?: BusinessStage;
  category: SwotCategory;
  prompt_text: string;
  example_items?: string[];
  is_active: boolean;
  created_at: string;
}

// Collaborator on SWOT analysis
export interface SwotCollaborator {
  id: string;
  swot_analysis_id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  role: CollaboratorRole;
  invited_at: string;
  last_accessed?: string;
}

// Comment on SWOT item
export interface SwotComment {
  id: string;
  swot_item_id: string;
  parent_comment_id?: string;
  comment_text: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  is_deleted: boolean;
  
  // Nested replies
  replies?: SwotComment[];
}

// History/audit trail entry
export interface SwotHistory {
  id: string;
  swot_analysis_id?: string;
  swot_item_id?: string;
  action_type: HistoryActionType;
  old_value?: any;
  new_value?: any;
  change_description?: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: string;
}

// Form data types for creating/updating
export interface CreateSwotAnalysisInput {
  business_id: string;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  type: SwotType;
  title?: string;
  description?: string;
  due_date?: string;
}

export interface UpdateSwotAnalysisInput {
  title?: string;
  description?: string;
  status?: SwotStatus;
  swot_score?: number;
  due_date?: string;
}

export interface CreateSwotItemInput {
  swot_analysis_id: string;
  category: SwotCategory;
  title: string;
  description?: string;
  impact_level?: 1 | 2 | 3 | 4 | 5;
  likelihood?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
}

export interface UpdateSwotItemInput {
  title?: string;
  description?: string;
  impact_level?: 1 | 2 | 3 | 4 | 5;
  likelihood?: 1 | 2 | 3 | 4 | 5;
  priority_order?: number;
  status?: ItemStatus;
  tags?: string[];
}

export interface CreateActionItemInput {
  swot_item_id: string;
  swot_analysis_id: string;
  title: string;
  description?: string;
  action_type?: ActionType;
  priority?: Priority;
  assigned_to?: string;
  assigned_to_email?: string;
  assigned_to_name?: string;
  due_date?: string;
}

export interface UpdateActionItemInput {
  title?: string;
  description?: string;
  action_type?: ActionType;
  priority?: Priority;
  status?: ActionStatus;
  assigned_to?: string;
  assigned_to_email?: string;
  assigned_to_name?: string;
  due_date?: string;
  progress_percentage?: number;
  effort_hours?: number;
  notes?: string;
  last_update?: string;
}

// Utility types for UI state
export interface SwotFilters {
  quarter?: 1 | 2 | 3 | 4;
  year?: number;
  type?: SwotType;
  status?: SwotStatus;
  category?: SwotCategory;
  search?: string;
}

export interface SwotSortOptions {
  field: 'created_at' | 'updated_at' | 'priority_order' | 'impact_level' | 'likelihood';
  direction: 'asc' | 'desc';
}

export interface SwotGridData {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export type YearType = 'FY' | 'CY';

export interface QuarterInfo {
  quarter: 1 | 2 | 3 | 4;
  year: number;
  label: string;
  months: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  yearType: YearType;
}

// Response types for API calls
export interface SwotAnalysisResponse {
  data: SwotAnalysis | null;
  error: Error | null;
}

export interface SwotAnalysisListResponse {
  data: SwotAnalysis[] | null;
  error: Error | null;
  count?: number;
}

export interface SwotItemResponse {
  data: SwotItem | null;
  error: Error | null;
}

export interface SwotActionItemResponse {
  data: SwotActionItem | null;
  error: Error | null;
}

// Statistics and metrics
export interface SwotStatistics {
  totalAnalyses: number;
  completedThisQuarter: number;
  averageSwotScore: number;
  totalActionItems: number;
  completedActionItems: number;
  activeStrengths: number;
  activeWeaknesses: number;
  activeOpportunities: number;
  activeThreats: number;
  trendsOverTime: {
    quarter: string;
    strengths: number;
    weaknesses: number;
    opportunities: number;
    threats: number;
    score: number;
  }[];
}

// Export data structure
export interface SwotExportData {
  analysis: SwotAnalysis;
  items: SwotGridData;
  actionItems: SwotActionItem[];
  comparison?: SwotComparison;
  statistics?: SwotStatistics;
  generatedAt: string;
  format: 'pdf' | 'csv' | 'json';
}

/**
 * Get quarter boundaries based on year type
 * FY = Fiscal Year ending June 30 (Australian style)
 * CY = Calendar Year ending December 31
 */
function getQuarterBoundaries(yearType: YearType, quarter: 1 | 2 | 3 | 4, displayYear: number) {
  if (yearType === 'FY') {
    // Fiscal Year ending June 30
    // Q1: Jul-Sep, Q2: Oct-Dec, Q3: Jan-Mar, Q4: Apr-Jun
    const fyStartYear = displayYear - 1; // FY2026 starts in July 2025

    switch (quarter) {
      case 1: // Jul-Sep
        return {
          months: 'Jul-Sep',
          startDate: new Date(fyStartYear, 6, 1),
          endDate: new Date(fyStartYear, 8, 30)
        };
      case 2: // Oct-Dec
        return {
          months: 'Oct-Dec',
          startDate: new Date(fyStartYear, 9, 1),
          endDate: new Date(fyStartYear, 11, 31)
        };
      case 3: // Jan-Mar
        return {
          months: 'Jan-Mar',
          startDate: new Date(displayYear, 0, 1),
          endDate: new Date(displayYear, 2, 31)
        };
      case 4: // Apr-Jun
        return {
          months: 'Apr-Jun',
          startDate: new Date(displayYear, 3, 1),
          endDate: new Date(displayYear, 5, 30)
        };
    }
  } else {
    // Calendar Year ending December 31
    // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
    switch (quarter) {
      case 1: // Jan-Mar
        return {
          months: 'Jan-Mar',
          startDate: new Date(displayYear, 0, 1),
          endDate: new Date(displayYear, 2, 31)
        };
      case 2: // Apr-Jun
        return {
          months: 'Apr-Jun',
          startDate: new Date(displayYear, 3, 1),
          endDate: new Date(displayYear, 5, 30)
        };
      case 3: // Jul-Sep
        return {
          months: 'Jul-Sep',
          startDate: new Date(displayYear, 6, 1),
          endDate: new Date(displayYear, 8, 30)
        };
      case 4: // Oct-Dec
        return {
          months: 'Oct-Dec',
          startDate: new Date(displayYear, 9, 1),
          endDate: new Date(displayYear, 11, 31)
        };
    }
  }
}

/**
 * Get current quarter based on year type
 * @param yearType - 'FY' for Fiscal Year (Jul-Jun) or 'CY' for Calendar Year (Jan-Dec)
 */
export function getCurrentQuarter(yearType: YearType = 'FY'): QuarterInfo {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();

  let quarter: 1 | 2 | 3 | 4;
  let displayYear: number;

  if (yearType === 'FY') {
    // Fiscal Year: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
    if (month >= 6 && month <= 8) {
      quarter = 1;
      displayYear = currentYear + 1; // FY ends next June
    } else if (month >= 9 && month <= 11) {
      quarter = 2;
      displayYear = currentYear + 1;
    } else if (month >= 0 && month <= 2) {
      quarter = 3;
      displayYear = currentYear;
    } else {
      quarter = 4;
      displayYear = currentYear;
    }
  } else {
    // Calendar Year: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
    if (month < 3) quarter = 1;
    else if (month < 6) quarter = 2;
    else if (month < 9) quarter = 3;
    else quarter = 4;
    displayYear = currentYear;
  }

  const boundaries = getQuarterBoundaries(yearType, quarter, displayYear);

  return {
    quarter,
    year: displayYear,
    label: `${yearType === 'FY' ? 'FY' : ''}Q${quarter} ${displayYear}`,
    months: boundaries.months,
    startDate: boundaries.startDate,
    endDate: boundaries.endDate,
    isCurrent: true,
    isPast: false,
    isFuture: false,
    yearType
  };
}

/**
 * Get quarter info from a specific date
 * @param date - The date to get quarter for
 * @param yearType - 'FY' for Fiscal Year or 'CY' for Calendar Year
 */
export function getQuarterFromDate(date: Date, yearType: YearType = 'FY'): QuarterInfo {
  const month = date.getMonth(); // 0-11
  const dateYear = date.getFullYear();
  const now = new Date();

  let quarter: 1 | 2 | 3 | 4;
  let displayYear: number;

  if (yearType === 'FY') {
    // Fiscal Year: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
    if (month >= 6 && month <= 8) {
      quarter = 1;
      displayYear = dateYear + 1;
    } else if (month >= 9 && month <= 11) {
      quarter = 2;
      displayYear = dateYear + 1;
    } else if (month >= 0 && month <= 2) {
      quarter = 3;
      displayYear = dateYear;
    } else {
      quarter = 4;
      displayYear = dateYear;
    }
  } else {
    // Calendar Year
    if (month < 3) quarter = 1;
    else if (month < 6) quarter = 2;
    else if (month < 9) quarter = 3;
    else quarter = 4;
    displayYear = dateYear;
  }

  const boundaries = getQuarterBoundaries(yearType, quarter, displayYear);

  return {
    quarter,
    year: displayYear,
    label: `${yearType === 'FY' ? 'FY' : ''}Q${quarter} ${displayYear}`,
    months: boundaries.months,
    startDate: boundaries.startDate,
    endDate: boundaries.endDate,
    isCurrent: now >= boundaries.startDate && now <= boundaries.endDate,
    isPast: boundaries.endDate < now,
    isFuture: boundaries.startDate > now,
    yearType
  };
}

/**
 * Get all quarters for a given year
 * @param yearType - 'FY' for Fiscal Year or 'CY' for Calendar Year
 * @param displayYear - The year to get quarters for (e.g., 2025 for CY2025 or FY2025)
 */
export function getAllQuartersForYear(yearType: YearType, displayYear: number): QuarterInfo[] {
  const now = new Date();
  const quarters: QuarterInfo[] = [];

  for (let q = 1; q <= 4; q++) {
    const quarter = q as 1 | 2 | 3 | 4;
    const boundaries = getQuarterBoundaries(yearType, quarter, displayYear);

    quarters.push({
      quarter,
      year: displayYear,
      label: `${yearType === 'FY' ? 'FY' : ''}Q${quarter} ${displayYear}`,
      months: boundaries.months,
      startDate: boundaries.startDate,
      endDate: boundaries.endDate,
      isCurrent: now >= boundaries.startDate && now <= boundaries.endDate,
      isPast: boundaries.endDate < now,
      isFuture: boundaries.startDate > now,
      yearType
    });
  }

  return quarters;
}

// Helper to format quarter display
export function formatQuarter(quarter: number, year: number): string {
  return `Q${quarter} ${year}`;
}

// Helper to get color for SWOT category
export function getCategoryColor(category: SwotCategory): string {
  switch (category) {
    case 'strength':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'weakness':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'opportunity':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'threat':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

// Helper to get icon for SWOT category
export function getCategoryIcon(category: SwotCategory): string {
  switch (category) {
    case 'strength':
      return '💪';
    case 'weakness':
      return '⚠️';
    case 'opportunity':
      return '🎯';
    case 'threat':
      return '🔥';
    default:
      return '📊';
  }
}

// Type guards
export function isSwotAnalysis(obj: any): obj is SwotAnalysis {
  return obj && typeof obj.id === 'string' && typeof obj.business_id === 'string';
}

export function isSwotItem(obj: any): obj is SwotItem {
  return obj && typeof obj.id === 'string' && typeof obj.swot_analysis_id === 'string';
}