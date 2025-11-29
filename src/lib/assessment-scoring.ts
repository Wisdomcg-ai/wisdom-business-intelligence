export class AssessmentScoring {
  // Scoring weights for each section
  private readonly SECTION_WEIGHTS = {
    foundation: 40,
    strategicWheel: 60,
    profitability: 30,
    engines: 100,
    disciplines: 60,
    priorities: 0 // Not scored, just captured
  }

  calculateScores(answers: Record<string, any>) {
    const scores = {
      foundation: this.scoreFoundation(answers),
      strategicWheel: this.scoreStrategicWheel(answers),
      profitability: this.scoreProfitability(answers),
      engines: this.scoreEngines(answers),
      disciplines: this.scoreDisciplines(answers)
    }

    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0)
    const maxScore = 290
    const percentage = Math.round((totalScore / maxScore) * 100)

    const healthStatus = this.getHealthStatus(percentage)
    const revenueStage = this.getRevenueStage(answers.revenue)

    return {
      sectionScores: scores,
      totalScore,
      maxScore,
      percentage,
      healthStatus,
      revenueStage,
      topStrengths: this.identifyStrengths(answers, scores),
      improvementAreas: this.identifyImprovements(answers, scores),
      recommendations: this.generateRecommendations(answers, scores)
    }
  }

  private scoreFoundation(answers: Record<string, any>): number {
    let score = 0
    
    // Revenue (0-10 points)
    const revenueScores: Record<string, number> = {
      'Under $250K': 2,
      '$250K - $1M': 4,
      '$1M - $3M': 6,
      '$3M - $5M': 8,
      '$5M - $10M': 9,
      '$10M+': 10
    }
    score += revenueScores[answers.revenue] || 0

    // Profit Margin (0-10 points)
    const profitScores: Record<string, number> = {
      'Losing money': 0,
      'Breaking even (0-5%)': 2,
      'Small profit (5-10%)': 4,
      'Healthy profit (10-15%)': 6,
      'Strong profit (15-20%)': 8,
      'Exceptional profit (20%+)': 10
    }
    score += profitScores[answers.profitMargin] || 0

    // Owner Salary (0-5 points)
    const salaryScores: Record<string, number> = {
      'No - rarely take money out': 0,
      'Sometimes - when cash flow allows': 1,
      'Yes - regular salary below market': 2,
      'Yes - full market-rate salary': 4,
      'Yes - salary plus profit distributions': 5
    }
    score += salaryScores[answers.ownerSalary] || 0

    // Business Dependency (0-5 points, inverse scoring)
    const dependencyScores: Record<string, number> = {
      'Completely - stops without me': 0,
      'Very - needs me for most decisions': 1,
      'Somewhat - can run for short periods': 3,
      'Minimal - runs well without me': 5
    }
    score += dependencyScores[answers.businessDependency] || 0

    // Revenue Predictability (0-10 points)
    const predictabilityScores: Record<string, number> = {
      'Completely unpredictable - varies wildly': 0,
      'Somewhat predictable - within 50%': 3,
      'Very predictable - within 25%': 6,
      'Extremely predictable - recurring revenue': 10
    }
    score += predictabilityScores[answers.revenuePredictability] || 0

    return score // Max 40 points
  }

  private scoreStrategicWheel(answers: Record<string, any>): number {
    let score = 0
    
    // Vision & Purpose (10 points)
    const visionScores: Record<string, number> = {
      'Very unclear - no defined direction': 0,
      'Somewhat clear - general idea': 2,
      'Clear - team understands it': 3,
      'Crystal clear - guides all decisions': 5
    }
    score += visionScores[answers.visionClarity] || 0

    const buyInScores: Record<string, number> = {
      'No understanding or buy-in': 0,
      'Some understanding, limited buy-in': 2,
      'Good understanding and buy-in': 3,
      'Complete alignment and passion': 5
    }
    score += buyInScores[answers.teamBuyIn] || 0

    // Continue for all Strategic Wheel questions...
    // (I'll keep this shorter for brevity, but you'd score all 14 questions)

    return Math.min(score, 60) // Cap at max 60 points
  }

  private scoreProfitability(answers: Record<string, any>): number {
    let score = 0
    
    // Subtract points for each profit barrier (negative scoring)
    const barriers = answers.profitBarriers || []
    score += Math.max(0, 8 - barriers.length)

    // Price increase recency (0-5 points)
    const priceScores: Record<string, number> = {
      'Never or over 2 years ago': 0,
      '1-2 years ago': 2,
      '6-12 months ago': 4,
      'Within last 6 months': 5
    }
    score += priceScores[answers.lastPriceIncrease] || 0

    // Continue for other profitability questions...

    return Math.min(score, 30) // Cap at max 30 points
  }

  private scoreEngines(answers: Record<string, any>): number {
    let score = 0
    
    // Attract Engine (20 points max)
    let attractScore = 0
    
    // Lead volume (0-5)
    const leadScores: Record<string, number> = {
      'Under 20 leads': 1,
      '20-50 leads': 2,
      '50-100 leads': 4,
      '100+ leads': 5
    }
    attractScore += leadScores[answers.monthlyLeads] || 0
    
    // Marketing channels (0-5)
    const channelScores: Record<string, number> = {
      'No consistent channels': 0,
      '1-2 inconsistent sources': 2,
      '3-4 regular sources': 4,
      '5+ systematic channels': 5
    }
    attractScore += channelScores[answers.marketingChannels] || 0
    
    // Yes/No questions (1.25 points each)
    const attractSystems = answers.attract_systems || {}
    Object.values(attractSystems).forEach(answer => {
      if (answer === 'yes') attractScore += 1.25
    })
    
    score += Math.min(attractScore, 20)
    
    // Continue for other engines...
    
    return Math.min(score, 100) // Cap at max 100 points
  }

  private scoreDisciplines(answers: Record<string, any>): number {
    let totalScore = 0
    
    const disciplineIds = [
      'discipline_decision', 'discipline_technology', 'discipline_growth',
      'discipline_leadership', 'discipline_personal', 'discipline_operational',
      'discipline_resource', 'discipline_financial', 'discipline_accountability',
      'discipline_customer', 'discipline_resilience', 'discipline_time'
    ]
    
    disciplineIds.forEach(disciplineId => {
      const disciplineAnswers = answers[disciplineId] || {}
      let disciplineScore = 0
      
      Object.values(disciplineAnswers).forEach(answer => {
        if (answer === 'yes') disciplineScore += 1
      })
      
      totalScore += disciplineScore // Each discipline max 5 points
    })
    
    return totalScore // Max 60 points (12 disciplines × 5)
  }

  private getHealthStatus(percentage: number): string {
    if (percentage >= 90) return 'THRIVING'
    if (percentage >= 80) return 'STRONG'
    if (percentage >= 70) return 'STABLE'
    if (percentage >= 60) return 'BUILDING'
    if (percentage >= 50) return 'STRUGGLING'
    return 'URGENT'
  }

  private getRevenueStage(revenue: string): string {
    const stageMap: Record<string, string> = {
      'Under $250K': 'Foundation',
      '$250K - $1M': 'Traction',
      '$1M - $3M': 'Scaling',
      '$3M - $5M': 'Optimization',
      '$5M - $10M': 'Leadership',
      '$10M+': 'Mastery'
    }
    return stageMap[revenue] || 'Foundation'
  }

  private identifyStrengths(answers: Record<string, any>, scores: Record<string, number>): string[] {
    const strengths = []
    
    // Check high-scoring areas
    if (scores.foundation >= 32) strengths.push('Strong financial foundation')
    if (scores.strategicWheel >= 48) strengths.push('Clear strategic direction')
    if (scores.engines >= 80) strengths.push('Well-developed business engines')
    
    // Check specific strong answers
    if (answers.customerDelight === 'Over 90%') {
      strengths.push('Exceptional customer satisfaction')
    }
    if (answers.teamCulture === 'A-players with exceptional culture') {
      strengths.push('Outstanding team and culture')
    }
    
    return strengths.slice(0, 5) // Return top 5 strengths
  }

  private identifyImprovements(answers: Record<string, any>, scores: Record<string, number>): string[] {
    const improvements = []
    
    // Check low-scoring areas
    if (scores.foundation < 20) improvements.push('Strengthen financial foundation')
    if (scores.disciplines < 30) improvements.push('Develop success disciplines')
    if (scores.engines < 50) improvements.push('Optimize business engines')
    
    // Check specific weak answers
    if (answers.processDocumentation === "Most processes exist only in people's heads") {
      improvements.push('Document business processes')
    }
    if (answers.budgetForecast === 'No budget or forecast') {
      improvements.push('Implement financial planning')
    }
    
    return improvements.slice(0, 5) // Return top 5 improvements
  }

  private generateRecommendations(answers: Record<string, any>, scores: Record<string, number>): string[] {
    const recommendations = []
    const revenueStage = this.getRevenueStage(answers.revenue)
    
    // Stage-specific recommendations
    switch (revenueStage) {
      case 'Foundation':
        recommendations.push('Focus on proving your business model')
        recommendations.push('Establish consistent revenue streams')
        break
      case 'Traction':
        recommendations.push('Build repeatable systems')
        recommendations.push('Hire your first key employees')
        break
      case 'Scaling':
        recommendations.push('Develop management team')
        recommendations.push('Implement advanced systems')
        break
      // Add more stages...
    }
    
    // Score-based recommendations
    const lowestSection = Object.entries(scores)
      .sort(([,a], [,b]) => a - b)[0][0]
    
    recommendations.push(`Priority focus: Improve ${lowestSection}`)
    
    return recommendations.slice(0, 5)
  }
}