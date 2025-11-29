export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      assessments: {
        Row: {
          assessment_data: Json | null
          biggest_constraint: string | null
          biggest_opportunity: string | null
          business_id: string | null
          completed_at: string | null
          completed_by: string | null
          completion_percentage: number | null
          created_at: string | null
          current_profit: string | null
          current_revenue: string | null
          disciplines_score: number | null
          engines_score: number | null
          foundation_score: number | null
          health_status: string | null
          help_needed: string | null
          id: string
          ninety_day_priority: string | null
          profit_margin: string | null
          profitability_score: number | null
          raw_answers: Json | null
          responses: Json | null
          revenue_range: string | null
          revenue_stage: string | null
          score: number | null
          section1_foundation: Json | null
          section1_score: number | null
          section2_score: number | null
          section2_wheel: Json | null
          section3_profitability: Json | null
          section3_score: number | null
          section4_engines: Json | null
          section4_score: number | null
          section5_disciplines: Json | null
          section5_score: number | null
          strategic_wheel_score: number | null
          target_profit: string | null
          target_revenue: string | null
          team_size: string | null
          total_percentage: number | null
          total_score: number | null
          user_id: string | null
        }
        Insert: {
          assessment_data?: Json | null
          biggest_constraint?: string | null
          biggest_opportunity?: string | null
          business_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          current_profit?: string | null
          current_revenue?: string | null
          disciplines_score?: number | null
          engines_score?: number | null
          foundation_score?: number | null
          health_status?: string | null
          help_needed?: string | null
          id?: string
          ninety_day_priority?: string | null
          profit_margin?: string | null
          profitability_score?: number | null
          raw_answers?: Json | null
          responses?: Json | null
          revenue_range?: string | null
          revenue_stage?: string | null
          score?: number | null
          section1_foundation?: Json | null
          section1_score?: number | null
          section2_score?: number | null
          section2_wheel?: Json | null
          section3_profitability?: Json | null
          section3_score?: number | null
          section4_engines?: Json | null
          section4_score?: number | null
          section5_disciplines?: Json | null
          section5_score?: number | null
          strategic_wheel_score?: number | null
          target_profit?: string | null
          target_revenue?: string | null
          team_size?: string | null
          total_percentage?: number | null
          total_score?: number | null
          user_id?: string | null
        }
        Update: {
          assessment_data?: Json | null
          biggest_constraint?: string | null
          biggest_opportunity?: string | null
          business_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          current_profit?: string | null
          current_revenue?: string | null
          disciplines_score?: number | null
          engines_score?: number | null
          foundation_score?: number | null
          health_status?: string | null
          help_needed?: string | null
          id?: string
          ninety_day_priority?: string | null
          profit_margin?: string | null
          profitability_score?: number | null
          raw_answers?: Json | null
          responses?: Json | null
          revenue_range?: string | null
          revenue_stage?: string | null
          score?: number | null
          section1_foundation?: Json | null
          section1_score?: number | null
          section2_score?: number | null
          section2_wheel?: Json | null
          section3_profitability?: Json | null
          section3_score?: number | null
          section4_engines?: Json | null
          section4_score?: number | null
          section5_disciplines?: Json | null
          section5_score?: number | null
          strategic_wheel_score?: number | null
          target_profit?: string | null
          target_revenue?: string | null
          team_size?: string | null
          total_percentage?: number | null
          total_score?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments_backup: {
        Row: {
          business_id: string | null
          completed_at: string | null
          completed_by: string | null
          completion_percentage: number | null
          created_at: string | null
          id: string | null
          responses: Json | null
          scores: Json | null
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          id?: string | null
          responses?: Json | null
          scores?: Json | null
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          id?: string | null
          responses?: Json | null
          scores?: Json | null
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string | null
          id: string
          joined_at: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          abn_tax_id: string | null
          annual_revenue: number | null
          business_id: string | null
          business_model: string | null
          cash_position: number | null
          cash_runway_months: number | null
          coaching_relationship: Json | null
          company_structure: string | null
          completion_percentage: number | null
          contractors: number | null
          created_at: string | null
          customer_intelligence: Json | null
          ebitda: number | null
          financial_metrics: Json | null
          full_time_employees: number | null
          gross_margin: number | null
          gross_profit: number | null
          id: string
          industry_classification: string | null
          last_saved: string | null
          legal_name: string | null
          locations: string[] | null
          monthly_recurring_revenue: number | null
          net_margin: number | null
          net_profit: number | null
          operating_expenses: number | null
          operational_excellence: Json | null
          part_time_employees: number | null
          products_services: Json | null
          regulatory_requirements: string[] | null
          revenue_stage: string | null
          strategic_context: Json | null
          sub_industry: string | null
          team_structure: Json | null
          total_employees: number | null
          trading_name: string | null
          updated_at: string | null
          user_id: string
          working_capital: number | null
          years_in_business: number | null
        }
        Insert: {
          abn_tax_id?: string | null
          annual_revenue?: number | null
          business_id?: string | null
          business_model?: string | null
          cash_position?: number | null
          cash_runway_months?: number | null
          coaching_relationship?: Json | null
          company_structure?: string | null
          completion_percentage?: number | null
          contractors?: number | null
          created_at?: string | null
          customer_intelligence?: Json | null
          ebitda?: number | null
          financial_metrics?: Json | null
          full_time_employees?: number | null
          gross_margin?: number | null
          gross_profit?: number | null
          id?: string
          industry_classification?: string | null
          last_saved?: string | null
          legal_name?: string | null
          locations?: string[] | null
          monthly_recurring_revenue?: number | null
          net_margin?: number | null
          net_profit?: number | null
          operating_expenses?: number | null
          operational_excellence?: Json | null
          part_time_employees?: number | null
          products_services?: Json | null
          regulatory_requirements?: string[] | null
          revenue_stage?: string | null
          strategic_context?: Json | null
          sub_industry?: string | null
          team_structure?: Json | null
          total_employees?: number | null
          trading_name?: string | null
          updated_at?: string | null
          user_id: string
          working_capital?: number | null
          years_in_business?: number | null
        }
        Update: {
          abn_tax_id?: string | null
          annual_revenue?: number | null
          business_id?: string | null
          business_model?: string | null
          cash_position?: number | null
          cash_runway_months?: number | null
          coaching_relationship?: Json | null
          company_structure?: string | null
          completion_percentage?: number | null
          contractors?: number | null
          created_at?: string | null
          customer_intelligence?: Json | null
          ebitda?: number | null
          financial_metrics?: Json | null
          full_time_employees?: number | null
          gross_margin?: number | null
          gross_profit?: number | null
          id?: string
          industry_classification?: string | null
          last_saved?: string | null
          legal_name?: string | null
          locations?: string[] | null
          monthly_recurring_revenue?: number | null
          net_margin?: number | null
          net_profit?: number | null
          operating_expenses?: number | null
          operational_excellence?: Json | null
          part_time_employees?: number | null
          products_services?: Json | null
          regulatory_requirements?: string[] | null
          revenue_stage?: string | null
          strategic_context?: Json | null
          sub_industry?: string | null
          team_structure?: Json | null
          total_employees?: number | null
          trading_name?: string | null
          updated_at?: string | null
          user_id?: string
          working_capital?: number | null
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      strategic_wheels: {
        Row: {
          business_id: string | null
          communications_alignment: Json | null
          created_at: string | null
          id: string
          money_metrics: Json | null
          people_culture: Json | null
          strategy_market: Json | null
          systems_execution: Json | null
          updated_at: string | null
          vision_purpose: Json | null
        }
        Insert: {
          business_id?: string | null
          communications_alignment?: Json | null
          created_at?: string | null
          id?: string
          money_metrics?: Json | null
          people_culture?: Json | null
          strategy_market?: Json | null
          systems_execution?: Json | null
          updated_at?: string | null
          vision_purpose?: Json | null
        }
        Update: {
          business_id?: string | null
          communications_alignment?: Json | null
          created_at?: string | null
          id?: string
          money_metrics?: Json | null
          people_culture?: Json | null
          strategy_market?: Json | null
          systems_execution?: Json | null
          updated_at?: string | null
          vision_purpose?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "strategic_wheels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      success_disciplines: {
        Row: {
          business_id: string
          created_at: string | null
          discipline_1: string
          discipline_1_score: number | null
          discipline_2: string
          discipline_2_score: number | null
          discipline_3: string
          discipline_3_score: number | null
          id: string
          selection_reason: string | null
          target_completion_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          discipline_1: string
          discipline_1_score?: number | null
          discipline_2: string
          discipline_2_score?: number | null
          discipline_3: string
          discipline_3_score?: number | null
          id?: string
          selection_reason?: string | null
          target_completion_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          discipline_1?: string
          discipline_1_score?: number | null
          discipline_2?: string
          discipline_2_score?: number | null
          discipline_3?: string
          discipline_3_score?: number | null
          id?: string
          selection_reason?: string | null
          target_completion_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "success_disciplines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
