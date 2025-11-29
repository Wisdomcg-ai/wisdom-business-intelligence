// TypeScript interfaces for Business Profile

export interface Partner {
  name: string
  ownership_percentage: number
  role: string
  involvement: 'Full-time active' | 'Part-time active' | 'Advisory only' | 'Silent partner' | ''
  years_with_business: number
  responsibilities: string
}

export interface OwnerInfo {
  owner_name?: string
  ownership_percentage?: number
  date_of_birth?: string
  total_years_business?: number
  years_this_business?: number
  key_expertise?: string
  partners?: Partner[]
  primary_goal?: 'Build income & wealth' | 'Create freedom & lifestyle' | 'Make an impact' | 'Build to sell' | 'Create legacy' | 'Survive & stabilize' | ''
  time_horizon?: '1-2 years' | '3-5 years' | '5-10 years' | '10+ years' | 'Forever/retirement' | ''
  exit_strategy?: 'Sell to third party' | 'Pass to family' | 'Management buyout' | 'Run forever' | "Haven't thought about it" | ''
  current_hours?: number
  desired_hours?: number
  desired_role?: 'Working IN - doing the work' | 'Working ON - building systems' | 'Mix of both' | 'Strategic only - minimal operations' | 'Want to step back completely' | ''
  love_doing?: string
  hate_doing?: string
  minimum_income?: number
  target_income?: number
  risk_tolerance?: 'Conservative - Minimize risk' | 'Moderate - Balanced approach' | 'Aggressive - High growth focus' | ''
  additional_context?: string
}

export interface SocialMedia {
  website?: string
  linkedin?: string
  facebook?: string
  instagram?: string
  twitter?: string
}

export interface KeyRole {
  title: string
  name: string
  status: 'Full Time' | 'Part Time' | 'Casual' | 'Virtual Assistant' | ''
}

export interface BusinessProfile {
  // IDs
  id?: string
  user_id?: string
  business_id?: string

  // Company Information
  name: string
  industry?: string
  business_model?: string
  years_in_operation?: number
  locations?: string[]
  social_media?: SocialMedia

  // Owner Information
  owner_info?: OwnerInfo

  // Financial Data
  annual_revenue?: number
  gross_profit?: number
  gross_profit_margin?: number
  net_profit?: number
  net_profit_margin?: number
  cash_in_bank?: number

  // Team & Organization
  employee_count?: number
  contractors_count?: number
  key_roles?: KeyRole[]
  reporting_structure?: string

  // Current Situation
  top_challenges?: string[]
  growth_opportunities?: string[]
  current_priorities?: string[]

  // Metadata
  profile_completed?: boolean
  profile_updated_at?: string
  created_at?: string
  updated_at?: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ValidationError {
  field: string
  message: string
}
