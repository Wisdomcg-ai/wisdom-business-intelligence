// Assessment type - defined locally since table may not be in database types
interface Assessment {
  id: string;
  business_profile_id: string;
  business_foundation_score: number;
  strategic_wheel_score: number;
  profitability_health_score: number;
  business_engines_score: number;
  percentage: number;
  health_status: string;
  created_at: string;
  answers: Record<string, unknown> | null;
}

export interface SectionScore {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: 'excellent' | 'good' | 'needs-work' | 'critical';
}

export interface HealthStatus {
  score: number;
  maxScore: number;
  percentage: number;
  status: 'THRIVING' | 'STRONG' | 'STABLE' | 'BUILDING' | 'STRUGGLING' | 'URGENT';
  color: string;
  description: string;
}

export interface AssessmentInsight {
  type: 'strength' | 'improvement' | 'opportunity';
  title: string;
  description: string;
  section: string;
  priority: 'high' | 'medium' | 'low';
}

export function calculateDetailedScores(assessment: Assessment): {
  sections: SectionScore[];
  overall: HealthStatus;
  insights: AssessmentInsight[];
} {
  if (!assessment.answers || typeof assessment.answers !== 'object') {
    return {
      sections: [],
      overall: {
        score: 0,
        maxScore: 290,
        percentage: 0,
        status: 'URGENT',
        color: 'red',
        description: 'No assessment data available'
      },
      insights: []
    };
  }

  const answers = assessment.answers as Record<string, any>;
  
  // Calculate section scores based on your methodology
  const sections: SectionScore[] = [
    calculateFoundationScore(answers),
    calculateStrategicWheelScore(answers),
    calculateProfitabilityScore(answers),
    calculateBusinessEnginesScore(answers),
    calculateSuccessDisciplinesScore(answers),
  ];

  // Calculate overall score
  const totalScore = sections.reduce((sum, section) => sum + section.score, 0);
  const totalMaxScore = sections.reduce((sum, section) => sum + section.maxScore, 0);
  const percentage = Math.round((totalScore / totalMaxScore) * 100);

  // Determine health status
  const overall = getHealthStatus(totalScore, totalMaxScore, percentage);

  // Generate insights
  const insights = generateInsights(sections, answers);

  return { sections, overall, insights };
}

function calculateFoundationScore(answers: Record<string, any>): SectionScore {
  let score = 0;
  const maxScore = 40;

  // Q1: Revenue Stage (0-10 points)
  const revenueStage = answers['q1']?.value;
  const revenuePoints: Record<string, number> = {
    'under_250k': 2,
    '250k_1m': 4,
    '1m_3m': 6,
    '3m_5m': 8,
    '5m_10m': 9,
    'over_10m': 10
  };
  score += revenuePoints[revenueStage] || 0;

  // Q2: Profit Margin (0-10 points)
  const profitMargin = answers['q2']?.value;
  const profitPoints: Record<string, number> = {
    'losing': 0,
    'breakeven': 2,
    'small_5_10': 4,
    'healthy_10_15': 6,
    'strong_15_20': 8,
    'exceptional_20_plus': 10
  };
  score += profitPoints[profitMargin] || 0;

  // Q3: Owner Salary (0-5 points)
  const ownerSalary = answers['q3']?.value;
  const salaryPoints: Record<string, number> = {
    'no_rarely': 0,
    'sometimes': 2,
    'yes_below': 3,
    'yes_full': 4,
    'yes_plus_profit': 5
  };
  score += salaryPoints[ownerSalary] || 0;

  // Q5: Business Dependency (0-5 points, reverse scoring)
  const dependency = answers['q5']?.value;
  const dependencyPoints: Record<string, number> = {
    'completely': 0,
    'very': 2,
    'somewhat': 4,
    'minimal': 5
  };
  score += dependencyPoints[dependency] || 0;

  // Q6: Revenue Predictability (0-10 points)
  const predictability = answers['q6']?.value;
  const predictPoints: Record<string, number> = {
    'unpredictable': 0,
    'somewhat_50': 3,
    'very_25': 7,
    'extremely_recurring': 10
  };
  score += predictPoints[predictability] || 0;

  const percentage = Math.round((score / maxScore) * 100);

  return {
    name: 'Business Foundation',
    score,
    maxScore,
    percentage,
    status: getStatus(percentage)
  };
}

function calculateStrategicWheelScore(answers: Record<string, any>): SectionScore {
  let score = 0;
  const maxScore = 60;

  // Vision & Purpose (Q7-8)
  const visionClarity = answers['q7']?.value;
  const visionPoints: Record<string, number> = {
    'very_unclear': 0,
    'somewhat_clear': 3,
    'clear': 7,
    'crystal_clear': 10
  };
  score += visionPoints[visionClarity] || 0;

  const teamBuyin = answers['q8']?.value;
  const buyinPoints: Record<string, number> = {
    'no_understanding': 0,
    'some_understanding': 3,
    'good_understanding': 7,
    'complete_alignment': 10
  };
  score += buyinPoints[teamBuyin] || 0;

  // Strategy & Market (Q9-10)
  const targetMarket = answers['q9']?.value;
  const marketPoints: Record<string, number> = {
    'anyone': 0,
    'general': 3,
    'specific': 7,
    'laser_focused': 10
  };
  score += marketPoints[targetMarket] || 0;

  const competitive = answers['q10']?.value;
  const competitivePoints: Record<string, number> = {
    'price_only': 0,
    'some_differentiation': 3,
    'clear_value': 7,
    'dominant': 10
  };
  score += competitivePoints[competitive] || 0;

  // People & Culture (Q11-12) - simplified for now
  score += 10; // Placeholder for additional questions

  // Systems & Execution (Q13-14) - simplified for now
  score += 10; // Placeholder for additional questions

  const percentage = Math.round((score / maxScore) * 100);

  return {
    name: 'Strategic Wheel',
    score,
    maxScore,
    percentage,
    status: getStatus(percentage)
  };
}

function calculateProfitabilityScore(answers: Record<string, any>): SectionScore {
  let score = 0;
  const maxScore = 30;

  // Price increases, pricing confidence, expense reviews, etc.
  // For now, using simplified scoring
  score = 18; // Placeholder - you can expand this based on actual questions

  const percentage = Math.round((score / maxScore) * 100);

  return {
    name: 'Profitability Health',
    score,
    maxScore,
    percentage,
    status: getStatus(percentage)
  };
}

function calculateBusinessEnginesScore(answers: Record<string, any>): SectionScore {
  let score = 0;
  const maxScore = 100;

  // Placeholder scoring for the 5 business engines
  // Each engine worth 20 points
  score = 65; // Placeholder - expand based on actual questions

  const percentage = Math.round((score / maxScore) * 100);

  return {
    name: 'Business Engines',
    score,
    maxScore,
    percentage,
    status: getStatus(percentage)
  };
}

function calculateSuccessDisciplinesScore(answers: Record<string, any>): SectionScore {
  let score = 0;
  const maxScore = 60;

  // 12 disciplines, 5 points each
  // Count yes/no responses for discipline questions
  score = 36; // Placeholder - expand based on actual questions

  const percentage = Math.round((score / maxScore) * 100);

  return {
    name: 'Success Disciplines',
    score,
    maxScore,
    percentage,
    status: getStatus(percentage)
  };
}

function getStatus(percentage: number): 'excellent' | 'good' | 'needs-work' | 'critical' {
  if (percentage >= 80) return 'excellent';
  if (percentage >= 60) return 'good';
  if (percentage >= 40) return 'needs-work';
  return 'critical';
}

function getHealthStatus(score: number, maxScore: number, percentage: number): HealthStatus {
  let status: HealthStatus['status'];
  let color: string;
  let description: string;

  if (percentage >= 90) {
    status = 'THRIVING';
    color = 'emerald';
    description = 'Your business is firing on all cylinders!';
  } else if (percentage >= 80) {
    status = 'STRONG';
    color = 'green';
    description = 'Solid foundation in place with room for optimization.';
  } else if (percentage >= 70) {
    status = 'STABLE';
    color = 'yellow';
    description = 'Good progress with clear opportunities for improvement.';
  } else if (percentage >= 60) {
    status = 'BUILDING';
    color = 'orange';
    description = 'Foundation developing, focused attention needed.';
  } else if (percentage >= 50) {
    status = 'STRUGGLING';
    color = 'red';
    description = 'Major gaps requiring immediate attention.';
  } else {
    status = 'URGENT';
    color = 'red';
    description = 'Critical issues need immediate action.';
  }

  return {
    score,
    maxScore,
    percentage,
    status,
    color,
    description
  };
}

function generateInsights(sections: SectionScore[], answers: Record<string, any>): AssessmentInsight[] {
  const insights: AssessmentInsight[] = [];

  // Find top strengths
  const sortedSections = [...sections].sort((a, b) => b.percentage - a.percentage);
  
  // Top 2 strengths
  sortedSections.slice(0, 2).forEach(section => {
    if (section.percentage >= 70) {
      insights.push({
        type: 'strength',
        title: `Strong ${section.name}`,
        description: `Your ${section.name} is performing at ${section.percentage}%. This is a key strength to leverage.`,
        section: section.name,
        priority: 'medium'
      });
    }
  });

  // Bottom 2 improvement areas
  sortedSections.slice(-2).forEach(section => {
    if (section.percentage < 60) {
      insights.push({
        type: 'improvement',
        title: `Improve ${section.name}`,
        description: `Your ${section.name} score is ${section.percentage}%. Focus here for maximum impact.`,
        section: section.name,
        priority: section.percentage < 40 ? 'high' : 'medium'
      });
    }
  });

  // Add specific opportunities based on answers
  const revenueStage = answers['q1']?.value;
  if (revenueStage === 'under_250k') {
    insights.push({
      type: 'opportunity',
      title: 'Focus on Revenue Growth',
      description: 'At the Foundation stage, prioritize proving your concept and reaching consistent monthly revenue.',
      section: 'Business Foundation',
      priority: 'high'
    });
  }

  const profitMargin = answers['q2']?.value;
  if (profitMargin === 'losing' || profitMargin === 'breakeven') {
    insights.push({
      type: 'opportunity',
      title: 'Improve Profitability',
      description: 'Your current margins need attention. Consider pricing optimization and cost reduction strategies.',
      section: 'Profitability Health',
      priority: 'high'
    });
  }

  return insights;
}