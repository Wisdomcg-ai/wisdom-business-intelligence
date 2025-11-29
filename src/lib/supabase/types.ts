// src/lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      business_profiles: {
        Row: {
          id: string
          user_id: string
          company_name: string
          current_revenue: number
          industry: string | null
          employee_count: number
          founded_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          current_revenue?: number
          industry?: string | null
          employee_count?: number
          founded_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          current_revenue?: number
          industry?: string | null
          employee_count?: number
          founded_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      strategic_goals: {
        Row: {
          id: string
          business_profile_id: string
          bhag_statement: string | null
          bhag_metrics: string | null
          bhag_deadline: string
          three_year_goals: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_profile_id: string
          bhag_statement?: string | null
          bhag_metrics?: string | null
          bhag_deadline?: string
          three_year_goals?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_profile_id?: string
          bhag_statement?: string | null
          bhag_metrics?: string | null
          bhag_deadline?: string
          three_year_goals?: Json
          created_at?: string
          updated_at?: string
        }
      }
      kpis: {
        Row: {
          id: string
          business_profile_id: string
          kpi_id: string
          name: string
          category: string
          current_value: number
          year1_target: number
          year2_target: number
          year3_target: number
          unit: string
          frequency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_profile_id: string
          kpi_id: string
          name: string
          category: string
          current_value?: number
          year1_target?: number
          year2_target?: number
          year3_target?: number
          unit: string
          frequency: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_profile_id?: string
          kpi_id?: string
          name?: string
          category?: string
          current_value?: number
          year1_target?: number
          year2_target?: number
          year3_target?: number
          unit?: string
          frequency?: string
          created_at?: string
          updated_at?: string
        }
      }
      strategic_initiatives: {
        Row: {
          id: string
          business_profile_id: string
          title: string
          category: string
          is_from_roadmap: boolean
          custom_source: string | null
          selected: boolean
          quarter_assignment: string | null
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_profile_id: string
          title: string
          category: string
          is_from_roadmap?: boolean
          custom_source?: string | null
          selected?: boolean
          quarter_assignment?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_profile_id?: string
          title?: string
          category?: string
          is_from_roadmap?: boolean
          custom_source?: string | null
          selected?: boolean
          quarter_assignment?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      quarterly_plans: {
        Row: {
          id: string
          business_profile_id: string
          year: number
          quarter: string
          revenue_target: number
          profit_target: number
          other_goals: Json
          kpi_targets: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_profile_id: string
          year: number
          quarter: string
          revenue_target?: number
          profit_target?: number
          other_goals?: Json
          kpi_targets?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_profile_id?: string
          year?: number
          quarter?: string
          revenue_target?: number
          profit_target?: number
          other_goals?: Json
          kpi_targets?: Json
          created_at?: string
          updated_at?: string
        }
      }
      ninety_day_sprints: {
        Row: {
          id: string
          business_profile_id: string
          title: string
          owner: string | null
          due_date: string
          status: string
          quarter: string
          year: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_profile_id: string
          title: string
          owner?: string | null
          due_date: string
          status?: string
          quarter: string
          year: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_profile_id?: string
          title?: string
          owner?: string | null
          due_date?: string
          status?: string
          quarter?: string
          year?: number
          created_at?: string
          updated_at?: string
        }
      }
      sprint_milestones: {
        Row: {
          id: string
          sprint_id: string
          description: string
          completed: boolean
          due_date: string
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sprint_id: string
          description: string
          completed?: boolean
          due_date: string
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sprint_id?: string
          description?: string
          completed?: boolean
          due_date?: string
          order_index?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_or_create_business_profile: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}