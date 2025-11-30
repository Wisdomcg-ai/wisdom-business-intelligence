import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types';

export interface AssessmentSummary {
  id: string;
  created_at: string;
  percentage: number;
  health_status: string;
  business_foundation_score: number;
  strategic_wheel_score: number;
  profitability_health_score: number;
  business_engines_score: number;
}

export function getHealthStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'critical':
      return 'text-red-600 bg-red-100';
    case 'poor':
      return 'text-orange-600 bg-orange-100';
    case 'fair':
      return 'text-yellow-600 bg-yellow-100';
    case 'good':
      return 'text-green-600 bg-green-100';
    case 'excellent':
      return 'text-teal-600 bg-teal-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

export interface AssessmentData {
  userId: string;
  answers: Record<string, any>;
  totalScore: number;
  maxScore: number;
  completionPercentage: number;
  revenueStage: string;
}

export async function saveAssessment(data: AssessmentData): Promise<string> {
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
  
  try {
    // Get the user's business ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', data.userId)
      .single();

    // Calculate section scores
    const sectionScores = calculateSectionScores(data.answers);

    // Prepare assessment data
    const assessmentData = {
      business_id: profile?.business_id || null,
      assessment_type: 'comprehensive',
      status: 'completed',
      health_score: data.totalScore,
      completion_percentage: data.completionPercentage,
      answers: data.answers,
      revenue_stage: data.revenueStage,
      foundation_score: sectionScores.foundation || 0,
      strategic_wheel_score: sectionScores.strategicWheel || 0,
      profitability_score: sectionScores.profitability || 0,
      engines_score: sectionScores.engines || 0,
      disciplines_score: sectionScores.disciplines || 0,
      completed_by: data.userId,
      created_by: data.userId,
      created_at: new Date().toISOString()
    };

    // Save to database
    const { data: assessment, error } = await supabase
      .from('assessments')
      .insert(assessmentData)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Failed to save assessment: ${error.message}`);
    }

    if (!assessment) {
      throw new Error('No assessment data returned');
    }

    return assessment.id;
  } catch (error) {
    console.error('Error in saveAssessment:', error);
    throw error;
  }
}

function calculateSectionScores(answers: Record<string, any>) {
  let foundation = 0;
  let strategicWheel = 0;
  let profitability = 0;
  let engines = 0;
  let disciplines = 0;

  Object.keys(answers).forEach(key => {
    const answer = answers[key];
    const points = answer.points || 0;
    
    // Categorize by question ID ranges
    const qNum = parseInt(key.replace('q', ''));
    
    if (qNum >= 1 && qNum <= 6) {
      foundation += points;
    } else if (qNum >= 7 && qNum <= 20) {
      strategicWheel += points;
    } else if (qNum >= 21 && qNum <= 26) {
      profitability += points;
    } else if (qNum >= 27 && qNum <= 49) {
      engines += points;
    } else if (qNum >= 50) {
      disciplines += points;
    }
  });

  return {
    foundation,
    strategicWheel,
    profitability,
    engines,
    disciplines
  };
}