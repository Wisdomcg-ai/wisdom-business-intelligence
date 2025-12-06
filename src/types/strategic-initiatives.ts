// Complete types for Strategic Initiatives component with all features
export type InitiativeCategory = 
  | 'attract' 
  | 'convert' 
  | 'deliver' 
  | 'delight' 
  | 'systems' 
  | 'people' 
  | 'profit' 
  | 'strategy'

export type InitiativeSourceType = 'client' | 'coach' | 'ai' | 'roadmap'

export type InitiativeStatus = 'not_started' | 'in_progress' | 'completed'

export type InitiativePriority = 'low' | 'medium' | 'high'

// Main Strategic Initiative interface matching database schema
export interface StrategicInitiative {
  id: string
  user_id: string
  title: string
  category: InitiativeCategory
  priority: InitiativePriority
  status: InitiativeStatus
  source_type: InitiativeSourceType
  assessment_suggestion_type?: string
  roadmap_item_id?: string
  selected_for_action: boolean
  selected_for_annual_plan: boolean
  created_at?: string
  updated_at?: string
}

// Roadmap completion tracking interface
export interface RoadmapCompletion {
  id: string
  user_id: string
  stage: string
  category: string
  item_text: string
  completed: boolean
  completed_at?: string
  created_at?: string
  updated_at?: string
}

// Assessment data from assessments table
export interface AssessmentData {
  foundation_score?: number
  strategic_wheel_score?: number
  engines_score?: number
  disciplines_score?: number
  profitability_score?: number
  health_score?: number
}

// Revenue stage definition
export interface RevenueStage {
  id: string
  name: string
  range: string
  min: number
  max: number
  priorities: Record<InitiativeCategory, string[]>
}

// Assessment-based suggestion system
export interface AssessmentSuggestion {
  key: string
  title: string
  description: string
  currentScore: number
  maxScore: number
  initiatives: Array<{
    title: string
    category: InitiativeCategory
  }>
}

// Category information for UI
export const categoryInfo: Record<InitiativeCategory, { label: string; description: string }> = {
  attract: {
    label: 'Attract',
    description: 'Marketing, lead generation, and customer acquisition'
  },
  convert: {
    label: 'Convert', 
    description: 'Sales processes, closing deals, and revenue generation'
  },
  deliver: {
    label: 'Deliver',
    description: 'Product/service delivery, operations, and fulfillment'
  },
  delight: {
    label: 'Delight',
    description: 'Customer experience, satisfaction, and retention'
  },
  systems: {
    label: 'Systems',
    description: 'Technology, processes, and automation'
  },
  people: {
    label: 'People',
    description: 'Team, hiring, training, and culture'
  },
  profit: {
    label: 'Profit',
    description: 'Financial management, margins, and profitability'
  },
  strategy: {
    label: 'Strategy',
    description: 'Planning, goals, and strategic direction'
  }
}

// Source type information for UI
export const sourceTypeInfo: Record<InitiativeSourceType, { label: string; description: string; color: string }> = {
  client: {
    label: 'You',
    description: 'Added by client/user',
    color: 'bg-green-100 text-green-700'
  },
  coach: {
    label: 'Coach',
    description: 'Suggested by coach',
    color: 'bg-brand-navy-50 text-brand-navy'
  },
  ai: {
    label: 'AI',
    description: 'AI-generated suggestion',
    color: 'bg-yellow-100 text-yellow-700'
  },
  roadmap: {
    label: 'Roadmap',
    description: 'From revenue stage roadmap',
    color: 'bg-blue-100 text-blue-700'
  }
}