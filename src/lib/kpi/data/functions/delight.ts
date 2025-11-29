// src/lib/kpi/data/functions/delight.ts

/**
 * DELIGHT Function - Customer Satisfaction & Retention KPIs
 * Focus: Customer experience, satisfaction, loyalty, and long-term value
 * Total: 35 KPIs across customer service, retention, and engagement
 * All IDs prefixed with 'delight-' to prevent conflicts
 */

import { KPIDefinition } from '../../types'
import {
  Heart,
  Star,
  Users,
  TrendingUp,
  Clock,
  MessageSquare,
  ThumbsUp,
  Award,
  Target,
  Repeat,
  UserCheck,
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
  Calendar,
  Smile,
  Zap,
  Gift,
  UserPlus,
  BarChart3,
  UserX,
  TrendingDown
} from 'lucide-react'

export const delightKPIs: KPIDefinition[] = [
  // ==================== CUSTOMER SATISFACTION METRICS ====================
  {
    id: 'delight-net-promoter-score',
    name: 'Net Promoter Score (NPS)',
    plainName: 'How Likely Customers Are to Recommend You',
    function: 'DELIGHT',
    category: 'Customer Satisfaction',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'quarterly',
    description: 'Measures customer loyalty by asking how likely they are to recommend your business on a 0-10 scale',
    whyItMatters: 'NPS is the #1 predictor of business growth - promoters drive referrals while detractors damage your brand',
    actionToTake: 'Survey customers quarterly, follow up with detractors immediately, and turn promoters into advocates with referral programs',
    formula: '(% Promoters [9-10] - % Detractors [0-6]) = Score from -100 to +100',
    benchmarks: {
      poor: -10,
      average: 20,
      good: 50,
      excellent: 70
    },
    icon: Star,
    tags: ['nps', 'loyalty', 'satisfaction', 'advocacy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  
  {
    id: 'delight-customer-satisfaction-score',
    name: 'Customer Satisfaction Score (CSAT)',
    plainName: 'How Happy Your Customers Are',
    function: 'DELIGHT',
    category: 'Customer Satisfaction',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who rate their experience as satisfied or very satisfied',
    whyItMatters: 'Direct measure of customer happiness - dissatisfied customers rarely complain, they just leave',
    actionToTake: 'Survey after every interaction, track by service type, and address scores below 80% immediately',
    formula: '(Number of Satisfied Responses / Total Responses) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: Smile,
    tags: ['csat', 'satisfaction', 'happiness', 'experience'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-effort-score',
    name: 'Customer Effort Score (CES)',
    plainName: 'How Easy It Is to Do Business With You',
    function: 'DELIGHT',
    category: 'Customer Satisfaction',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'quarterly',
    description: 'Measures how easy it is for customers to get their issues resolved or complete transactions',
    whyItMatters: '96% of customers who have high-effort experiences become disloyal, versus only 9% with low-effort experiences',
    actionToTake: 'Ask "How easy was it to resolve your issue?" after support interactions. Scores below 5 indicate friction to eliminate',
    formula: 'Average score on 1-7 scale where 1 = Very Difficult, 7 = Very Easy',
    benchmarks: {
      poor: 4.0,
      average: 5.0,
      good: 5.5,
      excellent: 6.0
    },
    icon: Zap,
    tags: ['ces', 'effort', 'ease', 'friction', 'ux'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-online-review-rating',
    name: 'Average Online Review Rating',
    plainName: 'Your Star Rating Across Review Sites',
    function: 'DELIGHT',
    category: 'Customer Satisfaction',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'monthly',
    description: 'Average star rating across all review platforms (Google, Facebook, industry-specific sites)',
    whyItMatters: '93% of consumers read online reviews before making a purchase. Ratings below 4.0 stars significantly impact conversion',
    actionToTake: 'Monitor all review platforms weekly, respond to every review within 24 hours, and implement systematic review generation',
    formula: 'Sum of all ratings / Number of reviews = Average (typically 1-5 scale)',
    benchmarks: {
      poor: 3.5,
      average: 4.0,
      good: 4.5,
      excellent: 4.8
    },
    icon: Star,
    tags: ['reviews', 'ratings', 'reputation', 'online-presence'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== RETENTION METRICS ====================
  {
    id: 'delight-customer-retention-rate',
    name: 'Customer Retention Rate',
    plainName: 'Percentage of Customers Who Keep Coming Back',
    function: 'DELIGHT',
    category: 'Customer Retention',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who continue doing business with you over a specific period',
    whyItMatters: 'Acquiring a new customer costs 5-25x more than retaining one. A 5% retention increase can boost profits by 25-95%',
    actionToTake: 'Track monthly and by customer segment. If dropping below 85%, implement win-back campaigns and investigate churn reasons',
    formula: '((Customers at End - New Customers) / Customers at Start) × 100',
    benchmarks: {
      poor: 70,
      average: 80,
      good: 90,
      excellent: 95
    },
    icon: Repeat,
    tags: ['retention', 'churn', 'loyalty', 'repeat-business'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-churn-rate',
    name: 'Customer Churn Rate',
    plainName: 'Percentage of Customers You Lose Each Period',
    function: 'DELIGHT',
    category: 'Customer Retention',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who stop doing business with you in a given period',
    whyItMatters: 'Churn is growth\'s silent killer - high churn means you\'re running on a treadmill, constantly replacing customers',
    actionToTake: 'Interview every churned customer to understand why. Focus on preventing churn in the first 90 days when it\'s highest',
    formula: '(Customers Lost / Customers at Start of Period) × 100',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 3,
      excellent: 1
    },
    icon: UserX,
    tags: ['churn', 'attrition', 'loss', 'retention'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-lifetime-value',
    name: 'Customer Lifetime Value (CLV)',
    plainName: 'Total Value a Customer Brings Over Their Lifetime',
    function: 'DELIGHT',
    category: 'Customer Value',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'quarterly',
    description: 'The total revenue a customer will generate during their entire relationship with your business',
    whyItMatters: 'CLV determines how much you can afford to spend acquiring customers. High CLV businesses can invest aggressively in growth',
    actionToTake: 'Your CLV should be at least 3x your Customer Acquisition Cost. Increase CLV by improving retention, upselling, and referrals',
    formula: '(Average Purchase Value × Purchase Frequency × Customer Lifespan)',
    benchmarks: {
      poor: 1000,
      average: 5000,
      good: 15000,
      excellent: 50000
    },
    icon: TrendingUp,
    tags: ['clv', 'ltv', 'lifetime-value', 'customer-value'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-repeat-purchase-rate',
    name: 'Repeat Purchase Rate',
    plainName: 'Percentage of Customers Who Buy Again',
    function: 'DELIGHT',
    category: 'Customer Retention',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who make more than one purchase',
    whyItMatters: 'Repeat customers spend 67% more than new customers and cost far less to serve',
    actionToTake: 'Build an automated follow-up sequence, create loyalty programs, and reach out personally to one-time buyers',
    formula: '(Customers Who Purchased 2+ Times / Total Customers) × 100',
    benchmarks: {
      poor: 20,
      average: 30,
      good: 40,
      excellent: 50
    },
    icon: Repeat,
    tags: ['repeat-purchase', 'frequency', 'loyalty'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-days-since-last-purchase',
    name: 'Average Days Since Last Purchase',
    plainName: 'How Long Between Customer Purchases',
    function: 'DELIGHT',
    category: 'Customer Engagement',
    tier: 'recommended',
    industries: [
      'retail-ecommerce',
      'health-wellness',
      'professional-services',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'days',
    frequency: 'weekly',
    description: 'Average time elapsed since a customer\'s last purchase or engagement',
    whyItMatters: 'Identifies at-risk customers who may be drifting away before they officially churn',
    actionToTake: 'Set up automated win-back campaigns for customers who exceed your typical purchase cycle by 50%',
    formula: 'Average(Today\'s Date - Last Purchase Date) across all active customers',
    benchmarks: {
      poor: 180,
      average: 90,
      good: 60,
      excellent: 30
    },
    icon: Calendar,
    tags: ['recency', 'engagement', 'at-risk', 'win-back'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== CUSTOMER SERVICE METRICS ====================
  {
    id: 'delight-first-response-time',
    name: 'First Response Time',
    plainName: 'How Quickly You Respond to Customer Inquiries',
    function: 'DELIGHT',
    category: 'Customer Service',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'daily',
    description: 'Average time it takes to send the first response to a customer inquiry',
    whyItMatters: '90% of customers rate an immediate response as important or very important when they have a service question',
    actionToTake: 'Set up auto-responses acknowledging receipt, prioritize urgent issues, and measure response time by channel',
    formula: 'Sum of (First Response Time - Inquiry Time) / Number of Inquiries',
    benchmarks: {
      poor: 24,
      average: 12,
      good: 4,
      excellent: 1
    },
    icon: Clock,
    tags: ['response-time', 'support', 'service-level'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-average-resolution-time',
    name: 'Average Resolution Time',
    plainName: 'How Long It Takes to Solve Customer Problems',
    function: 'DELIGHT',
    category: 'Customer Service',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'weekly',
    description: 'Average time from when a customer reports an issue until it\'s completely resolved',
    whyItMatters: 'Long resolution times frustrate customers and create negative word-of-mouth, even if the issue is eventually solved',
    actionToTake: 'Track resolution time by issue type, empower front-line staff to resolve common issues, and escalate quickly when needed',
    formula: 'Sum of (Resolution Time - Initial Contact Time) / Number of Resolved Issues',
    benchmarks: {
      poor: 72,
      average: 48,
      good: 24,
      excellent: 12
    },
    icon: CheckCircle,
    tags: ['resolution', 'support', 'issue-handling'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-first-contact-resolution',
    name: 'First Contact Resolution Rate',
    plainName: 'Percentage of Issues Solved on First Contact',
    function: 'DELIGHT',
    category: 'Customer Service',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of customer issues that are completely resolved in the first interaction',
    whyItMatters: 'High FCR dramatically improves customer satisfaction while reducing support costs',
    actionToTake: 'Train support staff thoroughly, create comprehensive knowledge bases, and empower staff to make decisions',
    formula: '(Issues Resolved on First Contact / Total Issues) × 100',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 75,
      excellent: 85
    },
    icon: Zap,
    tags: ['fcr', 'efficiency', 'support-quality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-complaint-rate',
    name: 'Customer Complaint Rate',
    plainName: 'Number of Complaints Per 100 Customers',
    function: 'DELIGHT',
    category: 'Customer Service',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of formal complaints received per 100 customers served',
    whyItMatters: 'For every complaint you hear, there are 26 unhappy customers who don\'t complain - they just leave',
    actionToTake: 'Track complaints by category, resolve within 48 hours, and use insights to prevent future issues',
    formula: '(Total Complaints / Total Customers) × 100',
    benchmarks: {
      poor: 5,
      average: 3,
      good: 1,
      excellent: 0.5
    },
    icon: AlertCircle,
    tags: ['complaints', 'issues', 'service-quality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-support-ticket-backlog',
    name: 'Support Ticket Backlog',
    plainName: 'Number of Unresolved Customer Issues',
    function: 'DELIGHT',
    category: 'Customer Service',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'daily',
    description: 'Number of open support tickets waiting to be resolved',
    whyItMatters: 'Growing backlog indicates capacity issues and leads to frustrated customers and stressed staff',
    actionToTake: 'Keep backlog under 20 tickets per support person. If growing, hire support staff or implement self-service solutions',
    formula: 'Count of Open Tickets at end of period',
    benchmarks: {
      poor: 100,
      average: 50,
      good: 25,
      excellent: 10
    },
    icon: AlertCircle,
    tags: ['backlog', 'capacity', 'workload'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== ENGAGEMENT METRICS ====================
  {
    id: 'delight-customer-engagement-score',
    name: 'Customer Engagement Score',
    plainName: 'How Actively Customers Interact With Your Business',
    function: 'DELIGHT',
    category: 'Customer Engagement',
    tier: 'advanced',
    industries: [
      'professional-services',
      'health-wellness',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'monthly',
    description: 'Composite score measuring customer activity across multiple touchpoints',
    whyItMatters: 'Engaged customers are 23% more likely to spend more and are far less likely to churn',
    actionToTake: 'Create engagement scoring models, identify low-engagement segments, and implement targeted activation campaigns',
    formula: 'Weighted average of: Product Usage (40%) + Purchase Frequency (30%) + Content Engagement (20%) + Support Interactions (10%)',
    benchmarks: {
      poor: 30,
      average: 50,
      good: 70,
      excellent: 85
    },
    icon: BarChart3,
    tags: ['engagement', 'activity', 'usage'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-health-score',
    name: 'Customer Health Score',
    plainName: 'Overall Health of Customer Relationships',
    function: 'DELIGHT',
    category: 'Customer Engagement',
    tier: 'advanced',
    industries: [
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'monthly',
    description: 'Predictive score indicating likelihood of renewal, churn risk, and expansion opportunities',
    whyItMatters: 'Enables proactive intervention before customers churn and identifies expansion opportunities',
    actionToTake: 'Create traffic-light system (red/yellow/green). Assign account managers to at-risk accounts',
    formula: 'Weighted score: Product Usage (30%) + Support Tickets (20%) + Payment History (20%) + Engagement (15%) + NPS (15%)',
    benchmarks: {
      poor: 40,
      average: 60,
      good: 75,
      excellent: 90
    },
    icon: Heart,
    tags: ['health-score', 'churn-risk', 'retention'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-product-adoption-rate',
    name: 'Product/Service Adoption Rate',
    plainName: 'Percentage of Customers Actually Using What They Bought',
    function: 'DELIGHT',
    category: 'Customer Engagement',
    tier: 'advanced',
    industries: [
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who actively use the products or services they purchased',
    whyItMatters: 'Non-users don\'t realize value and will churn. Active users become advocates and buy more',
    actionToTake: 'Implement onboarding sequences, track time-to-first-value, and re-engage non-active users within 30 days',
    formula: '(Active Users / Total Customers) × 100',
    benchmarks: {
      poor: 50,
      average: 65,
      good: 80,
      excellent: 90
    },
    icon: UserCheck,
    tags: ['adoption', 'activation', 'onboarding'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-email-open-rate',
    name: 'Email Open Rate',
    plainName: 'Percentage of Customers Who Open Your Emails',
    function: 'DELIGHT',
    category: 'Customer Communication',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of email recipients who open your messages',
    whyItMatters: 'Low open rates mean your messages aren\'t reaching customers, limiting your ability to engage and retain them',
    actionToTake: 'Test subject lines, personalize content, segment your list, and clean out inactive subscribers quarterly',
    formula: '(Unique Opens / Emails Delivered) × 100',
    benchmarks: {
      poor: 15,
      average: 20,
      good: 25,
      excellent: 35
    },
    icon: Mail,
    tags: ['email', 'engagement', 'communication'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-email-click-rate',
    name: 'Email Click-Through Rate',
    plainName: 'Percentage of Email Recipients Who Click Links',
    function: 'DELIGHT',
    category: 'Customer Communication',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of email recipients who click on links in your emails',
    whyItMatters: 'Indicates content relevance and engagement - low CTR means your content isn\'t compelling enough',
    actionToTake: 'Use clear CTAs, segment content by customer interest, and A/B test email layouts and messaging',
    formula: '(Unique Clicks / Emails Delivered) × 100',
    benchmarks: {
      poor: 1.5,
      average: 2.5,
      good: 4.0,
      excellent: 6.0
    },
    icon: Target,
    tags: ['email', 'ctr', 'engagement'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== REFERRAL & ADVOCACY METRICS ====================
  {
    id: 'delight-referral-rate',
    name: 'Customer Referral Rate',
    plainName: 'Percentage of Customers Who Refer Others',
    function: 'DELIGHT',
    category: 'Customer Advocacy',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers who actively refer new customers to your business',
    whyItMatters: 'Referrals have the highest conversion rate (30-50%) and lowest acquisition cost of any marketing channel',
    actionToTake: 'Create a formal referral program, ask for referrals at peak satisfaction moments, and reward referrers meaningfully',
    formula: '(Customers Who Referred / Total Customers) × 100',
    benchmarks: {
      poor: 5,
      average: 10,
      good: 20,
      excellent: 30
    },
    icon: UserPlus,
    tags: ['referrals', 'word-of-mouth', 'acquisition'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-referral-conversion-rate',
    name: 'Referral Conversion Rate',
    plainName: 'Percentage of Referrals That Become Customers',
    function: 'DELIGHT',
    category: 'Customer Advocacy',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of referred prospects who become paying customers',
    whyItMatters: 'Referred customers typically convert 3-5x higher than cold leads and have higher lifetime value',
    actionToTake: 'Track conversion by referral source, follow up quickly with referred prospects, and optimize your referral onboarding',
    formula: '(Referrals Who Became Customers / Total Referrals) × 100',
    benchmarks: {
      poor: 20,
      average: 30,
      good: 40,
      excellent: 50
    },
    icon: TrendingUp,
    tags: ['referrals', 'conversion', 'advocacy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-social-media-mentions',
    name: 'Social Media Mentions',
    plainName: 'Times Your Business Is Mentioned on Social Media',
    function: 'DELIGHT',
    category: 'Customer Advocacy',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'weekly',
    description: 'Number of times your business is mentioned across social media platforms',
    whyItMatters: 'Social mentions indicate brand health and word-of-mouth activity - both positive and negative',
    actionToTake: 'Monitor mentions daily, respond to all mentions within 24 hours, and encourage positive mentions through campaigns',
    formula: 'Count of brand mentions across all social platforms',
    benchmarks: {
      poor: 10,
      average: 50,
      good: 100,
      excellent: 250
    },
    icon: MessageSquare,
    tags: ['social-media', 'mentions', 'brand-awareness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-testimonials',
    name: 'Customer Testimonials Generated',
    plainName: 'Number of Success Stories and Testimonials',
    function: 'DELIGHT',
    category: 'Customer Advocacy',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of customer success stories, case studies, and testimonials collected',
    whyItMatters: '92% of consumers trust recommendations from others over brand advertising - testimonials are conversion gold',
    actionToTake: 'Ask for testimonials after successful outcomes, make it easy with templates, and feature them prominently on your site',
    formula: 'Count of new testimonials collected per period',
    benchmarks: {
      poor: 1,
      average: 3,
      good: 5,
      excellent: 10
    },
    icon: Award,
    tags: ['testimonials', 'social-proof', 'advocacy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== LOYALTY PROGRAM METRICS ====================
  {
    id: 'delight-loyalty-program-participation',
    name: 'Loyalty Program Participation Rate',
    plainName: 'Percentage of Customers in Loyalty Program',
    function: 'DELIGHT',
    category: 'Customer Loyalty',
    tier: 'advanced',
    industries: [
      'retail-ecommerce',
      'health-wellness',
      'professional-services',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of customers enrolled in your loyalty or rewards program',
    whyItMatters: 'Loyalty program members spend 12-18% more per year and have 2x retention rates',
    actionToTake: 'Promote enrollment at checkout and via email, make sign-up frictionless, and communicate value clearly',
    formula: '(Loyalty Members / Total Customers) × 100',
    benchmarks: {
      poor: 20,
      average: 35,
      good: 50,
      excellent: 70
    },
    icon: Gift,
    tags: ['loyalty', 'rewards', 'program'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-loyalty-program-redemption',
    name: 'Loyalty Reward Redemption Rate',
    plainName: 'Percentage of Loyalty Points/Rewards Redeemed',
    function: 'DELIGHT',
    category: 'Customer Loyalty',
    tier: 'advanced',
    industries: [
      'retail-ecommerce',
      'health-wellness',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of earned loyalty rewards that are actually redeemed',
    whyItMatters: 'High redemption means engaged members. Low redemption suggests rewards aren\'t valuable or program is too complex',
    actionToTake: 'Send redemption reminders, make rewards easy to use, and ensure rewards are actually desirable',
    formula: '(Rewards Redeemed / Rewards Earned) × 100',
    benchmarks: {
      poor: 20,
      average: 35,
      good: 50,
      excellent: 65
    },
    icon: Gift,
    tags: ['loyalty', 'redemption', 'engagement'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== QUALITY METRICS ====================
  {
    id: 'delight-service-quality-score',
    name: 'Service Quality Score',
    plainName: 'Overall Quality Rating of Your Service',
    function: 'DELIGHT',
    category: 'Service Quality',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'monthly',
    description: 'Composite score measuring service delivery quality across multiple dimensions',
    whyItMatters: 'Quality issues are the #1 reason customers leave - measuring quality helps prevent churn',
    actionToTake: 'Score based on timeliness, accuracy, professionalism, and communication. Address any dimension scoring below 80%',
    formula: 'Average of: Timeliness (25%) + Accuracy (25%) + Professionalism (25%) + Communication (25%)',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: Star,
    tags: ['quality', 'service-delivery', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-on-time-delivery-rate',
    name: 'On-Time Delivery Rate',
    plainName: 'Percentage of Deliveries Made On Time',
    function: 'DELIGHT',
    category: 'Service Quality',
    tier: 'recommended',
    industries: [
      'construction-trades',
      'operations-logistics',
      'retail-ecommerce',
      'professional-services',
      'all'
    ],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of products or services delivered by the promised date',
    whyItMatters: 'Late deliveries frustrate customers and damage trust - even if quality is perfect',
    actionToTake: 'Set realistic deadlines, track completion rates by service type, and proactively communicate if delays occur',
    formula: '(On-Time Deliveries / Total Deliveries) × 100',
    benchmarks: {
      poor: 80,
      average: 90,
      good: 95,
      excellent: 98
    },
    icon: Clock,
    tags: ['delivery', 'timeliness', 'reliability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-defect-rate',
    name: 'Service/Product Defect Rate',
    plainName: 'Percentage of Work That Needs to Be Redone',
    function: 'DELIGHT',
    category: 'Service Quality',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of delivered work requiring rework, returns, or corrections',
    whyItMatters: 'Defects double your costs (you pay to do it twice) and damage customer relationships',
    actionToTake: 'Track defects by type and cause, implement quality checks before delivery, and train staff on common issues',
    formula: '(Items Requiring Rework / Total Items Delivered) × 100',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 2,
      excellent: 1
    },
    icon: AlertCircle,
    tags: ['defects', 'quality', 'rework'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-onboarding-completion',
    name: 'Customer Onboarding Completion Rate',
    plainName: 'Percentage of New Customers Who Complete Onboarding',
    function: 'DELIGHT',
    category: 'Customer Success',
    tier: 'advanced',
    industries: [
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of new customers who complete your onboarding process',
    whyItMatters: 'Customers who complete onboarding have 3x higher retention rates and reach ROI faster',
    actionToTake: 'Track completion rates by step, identify drop-off points, and personally reach out to incomplete customers',
    formula: '(Customers Completing Onboarding / New Customers) × 100',
    benchmarks: {
      poor: 60,
      average: 75,
      good: 85,
      excellent: 95
    },
    icon: UserCheck,
    tags: ['onboarding', 'activation', 'adoption'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-time-to-value',
    name: 'Time to Value',
    plainName: 'How Quickly Customers See Results',
    function: 'DELIGHT',
    category: 'Customer Success',
    tier: 'advanced',
    industries: [
      'professional-services',
      'health-wellness',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'days',
    frequency: 'monthly',
    description: 'Average time from purchase until customer experiences meaningful value',
    whyItMatters: 'Faster time-to-value reduces early churn and increases satisfaction. Slow value realization kills retention',
    actionToTake: 'Map customer journey to first value moment, eliminate unnecessary steps, and celebrate early wins with customers',
    formula: 'Average(Date of First Value - Purchase Date) in days',
    benchmarks: {
      poor: 90,
      average: 60,
      good: 30,
      excellent: 14
    },
    icon: Zap,
    tags: ['ttv', 'value', 'onboarding', 'activation'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'delight-customer-reactivation-rate',
    name: 'Customer Reactivation Rate',
    plainName: 'Percentage of Lost Customers You Win Back',
    function: 'DELIGHT',
    category: 'Win-Back',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of churned customers who return to become active customers again',
    whyItMatters: 'Winning back customers is easier and cheaper than acquiring new ones - they already know your value',
    actionToTake: 'Implement win-back campaigns for churned customers, address their original concerns, and offer incentives to return',
    formula: '(Reactivated Customers / Total Churned Customers) × 100',
    benchmarks: {
      poor: 5,
      average: 10,
      good: 15,
      excellent: 25
    },
    icon: Repeat,
    tags: ['win-back', 'reactivation', 'churn-recovery'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]