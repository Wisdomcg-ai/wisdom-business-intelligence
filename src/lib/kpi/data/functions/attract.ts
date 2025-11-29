// src/lib/kpi/data/functions/attract.ts

/**
 * ATTRACT Function - Marketing & Lead Generation KPIs
 * Focus: Marketing effectiveness, lead generation, brand awareness, and customer acquisition
 * Total: 30 KPIs across paid advertising, content marketing, SEO, and brand building
 * All IDs prefixed with 'attract-' to prevent conflicts
 */

import { KPIDefinition } from '../../types'
import {
  Megaphone,
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  MousePointerClick,
  Eye,
  Search,
  Share2,
  ThumbsUp,
  MessageCircle,
  Mail,
  Globe,
  BarChart3,
  DollarSign,
  Zap,
  Award,
  Heart,
  Star,
  Radio,
  Video,
  FileText,
  Phone,
  UserPlus,
  Activity,
  Percent
} from 'lucide-react'

export const ATTRACT_KPIS: KPIDefinition[] = [
  // ==================== CUSTOMER ACQUISITION COST ====================
  {
    id: 'attract-customer-acquisition-cost',
    name: 'Customer Acquisition Cost (CAC)',
    plainName: 'Cost to Acquire Each New Customer',
    function: 'ATTRACT',
    category: 'Marketing Efficiency',
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
    unit: 'currency',
    frequency: 'monthly',
    description: 'Total sales and marketing costs divided by number of new customers acquired',
    whyItMatters: 'If you spend more to acquire customers than they generate in profit, you\'re on a path to bankruptcy',
    actionToTake: 'Track by channel. Your CAC must be less than 1/3 of Customer Lifetime Value for sustainable growth',
    formula: '(Total Sales + Marketing Costs) / Number of New Customers',
    benchmarks: {
      poor: 500,
      average: 300,
      good: 150,
      excellent: 75
    },
    icon: DollarSign,
    tags: ['cac', 'acquisition-cost', 'marketing-efficiency', 'customer-cost'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-cost-per-lead',
    name: 'Cost Per Lead (CPL)',
    plainName: 'Cost to Generate Each Lead',
    function: 'ATTRACT',
    category: 'Marketing Efficiency',
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
    unit: 'currency',
    frequency: 'weekly',
    description: 'Total marketing spend divided by number of leads generated',
    whyItMatters: 'Shows which marketing channels are efficient and which are wasting money',
    actionToTake: 'Track by source. Cut channels with CPL over $100 unless they convert exceptionally well',
    formula: 'Total Marketing Spend / Number of Leads Generated',
    benchmarks: {
      poor: 100,
      average: 50,
      good: 25,
      excellent: 10
    },
    icon: Megaphone,
    tags: ['cpl', 'lead-cost', 'marketing-spend', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-cac-payback-period',
    name: 'CAC Payback Period',
    plainName: 'Months to Recover Customer Acquisition Cost',
    function: 'ATTRACT',
    category: 'Marketing Efficiency',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'months',
    frequency: 'quarterly',
    description: 'Number of months to recover the cost of acquiring a customer',
    whyItMatters: 'Long payback periods tie up cash and limit growth. Short payback enables aggressive scaling',
    actionToTake: 'Target under 12 months. If over 18 months, focus on increasing early customer spend or reducing CAC',
    formula: 'CAC / (Average Monthly Revenue per Customer × Gross Margin %)',
    benchmarks: {
      poor: 24,
      average: 12,
      good: 6,
      excellent: 3
    },
    icon: TrendingUp,
    tags: ['payback', 'cac-recovery', 'cash-flow', 'efficiency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== LEAD GENERATION ====================
  {
    id: 'attract-lead-volume',
    name: 'Monthly Lead Volume',
    plainName: 'Total Leads Generated Per Month',
    function: 'ATTRACT',
    category: 'Lead Generation',
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
    unit: 'number',
    frequency: 'weekly',
    description: 'Total number of qualified leads generated each month',
    whyItMatters: 'Leads are your sales pipeline fuel - no leads means no sales means no business',
    actionToTake: 'Set weekly and monthly targets. If consistently missing targets, increase marketing spend or try new channels',
    formula: 'Count of all qualified leads per month',
    benchmarks: {
      poor: 20,
      average: 50,
      good: 100,
      excellent: 250
    },
    icon: Users,
    tags: ['leads', 'pipeline', 'volume', 'lead-generation'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-lead-quality-score',
    name: 'Lead Quality Score',
    plainName: 'Percentage of High-Quality Leads',
    function: 'ATTRACT',
    category: 'Lead Generation',
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
    description: 'Percentage of leads that meet ideal customer profile criteria',
    whyItMatters: 'Quantity without quality wastes sales time. High-quality leads convert 5-10x better than poor leads',
    actionToTake: 'Define what makes a qualified lead, then score each lead. Focus marketing on channels producing quality',
    formula: '(Qualified Leads / Total Leads) × 100',
    benchmarks: {
      poor: 30,
      average: 50,
      good: 70,
      excellent: 85
    },
    icon: Target,
    tags: ['lead-quality', 'qualification', 'fit-score', 'targeting'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-lead-source-diversity',
    name: 'Lead Source Diversity',
    plainName: 'Number of Active Lead Sources',
    function: 'ATTRACT',
    category: 'Lead Generation',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'quarterly',
    description: 'Number of marketing channels generating at least 10% of leads',
    whyItMatters: 'Relying on one channel is risky - algorithm changes or market shifts can kill your pipeline overnight',
    actionToTake: 'Target 3-5 consistent lead sources. No single source should represent more than 50% of leads',
    formula: 'Count of channels producing 10%+ of total leads',
    benchmarks: {
      poor: 1,
      average: 2,
      good: 4,
      excellent: 6
    },
    icon: Share2,
    tags: ['diversity', 'risk-management', 'channels', 'sources'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-lead-response-time',
    name: 'Lead Response Time',
    plainName: 'Speed of First Contact With Leads',
    function: 'ATTRACT',
    category: 'Lead Management',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'minutes',
    frequency: 'weekly',
    description: 'Average time from lead inquiry to first contact attempt',
    whyItMatters: 'Responding within 5 minutes increases conversion by 100x compared to 30 minutes - speed wins deals',
    actionToTake: 'Target under 5 minutes for web leads, under 60 seconds for phone leads. Set up instant notifications',
    formula: 'Average(First Contact Time - Lead Received Time)',
    benchmarks: {
      poor: 120,
      average: 30,
      good: 10,
      excellent: 5
    },
    icon: Zap,
    tags: ['response-time', 'speed-to-lead', 'follow-up', 'conversion'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== MARKETING ROI & PERFORMANCE ====================
  {
    id: 'attract-marketing-roi',
    name: 'Marketing Return on Investment (ROI)',
    plainName: 'Revenue Generated Per Marketing Dollar',
    function: 'ATTRACT',
    category: 'Marketing Performance',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'monthly',
    description: 'Revenue generated from marketing efforts divided by marketing spend',
    whyItMatters: 'Shows whether marketing is an investment (positive ROI) or expense (negative ROI)',
    actionToTake: 'Target 3:1 minimum (3x return). Above 5:1 means you should invest more in marketing',
    formula: '(Revenue from Marketing - Marketing Cost) / Marketing Cost',
    benchmarks: {
      poor: 1,
      average: 3,
      good: 5,
      excellent: 10
    },
    icon: TrendingUp,
    tags: ['roi', 'roas', 'marketing-performance', 'return'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-marketing-spend-percentage',
    name: 'Marketing Spend as Percentage of Revenue',
    plainName: 'Marketing Budget Relative to Sales',
    function: 'ATTRACT',
    category: 'Marketing Investment',
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
    description: 'Total marketing spend as percentage of total revenue',
    whyItMatters: 'Benchmarks show successful companies spend 7-12% of revenue on marketing - too little limits growth',
    actionToTake: 'Growing companies: 10-20%. Mature companies: 5-10%. Under 5% limits growth potential',
    formula: '(Marketing Spend / Total Revenue) × 100',
    benchmarks: {
      poor: 2,
      average: 7,
      good: 12,
      excellent: 15
    },
    icon: Percent,
    tags: ['budget', 'investment', 'spend-rate', 'allocation'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-ltv-to-cac-ratio',
    name: 'LTV:CAC Ratio',
    plainName: 'Customer Lifetime Value to Acquisition Cost',
    function: 'ATTRACT',
    category: 'Marketing Efficiency',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'quarterly',
    description: 'Customer Lifetime Value divided by Customer Acquisition Cost',
    whyItMatters: 'The ultimate profitability metric - shows if your business model is sustainable',
    actionToTake: 'Target 3:1 minimum. Below 3:1 is unprofitable. Above 5:1 means invest more in growth',
    formula: 'Customer Lifetime Value / Customer Acquisition Cost',
    benchmarks: {
      poor: 1.5,
      average: 3,
      good: 5,
      excellent: 8
    },
    icon: BarChart3,
    tags: ['ltv-cac', 'unit-economics', 'sustainability', 'profitability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== DIGITAL MARKETING ====================
  {
    id: 'attract-website-traffic',
    name: 'Website Traffic',
    plainName: 'Monthly Unique Website Visitors',
    function: 'ATTRACT',
    category: 'Digital Marketing',
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
    unit: 'number',
    frequency: 'weekly',
    description: 'Number of unique visitors to your website each month',
    whyItMatters: 'Your website is your 24/7 salesperson - more traffic means more opportunity',
    actionToTake: 'Target 10-20% monthly growth. Track traffic sources and double down on what works',
    formula: 'Count of unique website visitors per month',
    benchmarks: {
      poor: 500,
      average: 2000,
      good: 5000,
      excellent: 15000
    },
    icon: Globe,
    tags: ['traffic', 'website', 'visitors', 'digital'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-website-conversion-rate',
    name: 'Website Conversion Rate',
    plainName: 'Percentage of Visitors Who Become Leads',
    function: 'ATTRACT',
    category: 'Digital Marketing',
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
    frequency: 'weekly',
    description: 'Percentage of website visitors who take a desired action (contact, purchase, download)',
    whyItMatters: 'A 2% conversion rate doubles your leads compared to 1% - optimization beats more traffic',
    actionToTake: 'Target 2-5% for service businesses. Test headlines, CTAs, and forms to improve conversion',
    formula: '(Website Conversions / Total Visitors) × 100',
    benchmarks: {
      poor: 0.5,
      average: 2,
      good: 4,
      excellent: 7
    },
    icon: MousePointerClick,
    tags: ['conversion', 'website', 'cro', 'optimization'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-bounce-rate',
    name: 'Website Bounce Rate',
    plainName: 'Percentage of Visitors Who Leave Immediately',
    function: 'ATTRACT',
    category: 'Digital Marketing',
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
    frequency: 'weekly',
    description: 'Percentage of visitors who leave your site after viewing only one page',
    whyItMatters: 'High bounce rates indicate poor targeting, slow site, or irrelevant content - wasted marketing spend',
    actionToTake: 'Target under 50%. Above 70% is a red flag - improve page speed, relevance, and clear CTAs',
    formula: '(Single Page Visits / Total Visits) × 100',
    benchmarks: {
      poor: 70,
      average: 55,
      good: 40,
      excellent: 30
    },
    icon: TrendingDown,
    tags: ['bounce-rate', 'engagement', 'website-quality', 'user-experience'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-average-session-duration',
    name: 'Average Session Duration',
    plainName: 'Time Visitors Spend on Your Site',
    function: 'ATTRACT',
    category: 'Digital Marketing',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'seconds',
    frequency: 'weekly',
    description: 'Average time visitors spend on your website per session',
    whyItMatters: 'Longer sessions indicate engaged visitors who are more likely to convert',
    actionToTake: 'Target 2+ minutes. Under 30 seconds means poor content or wrong traffic',
    formula: 'Total Session Time / Number of Sessions',
    benchmarks: {
      poor: 30,
      average: 90,
      good: 180,
      excellent: 300
    },
    icon: Activity,
    tags: ['engagement', 'session-duration', 'time-on-site', 'quality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SEO & ORGANIC ====================
  {
    id: 'attract-organic-search-traffic',
    name: 'Organic Search Traffic',
    plainName: 'Visitors from Google & Search Engines',
    function: 'ATTRACT',
    category: 'SEO',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of website visitors from unpaid search results',
    whyItMatters: 'Organic traffic is free and compounds over time - the gift that keeps giving',
    actionToTake: 'Target 40%+ of total traffic from organic search. Create valuable content consistently',
    formula: 'Count of visitors from organic search engines',
    benchmarks: {
      poor: 100,
      average: 500,
      good: 2000,
      excellent: 5000
    },
    icon: Search,
    tags: ['seo', 'organic', 'search-traffic', 'google'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-keyword-rankings',
    name: 'Top 10 Keyword Rankings',
    plainName: 'Keywords Ranking in Top 10 Results',
    function: 'ATTRACT',
    category: 'SEO',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of target keywords ranking in top 10 Google results',
    whyItMatters: 'First page of Google gets 95% of clicks - page two might as well not exist',
    actionToTake: 'Track 20-50 target keywords. Focus on keywords with commercial intent and achievable difficulty',
    formula: 'Count of tracked keywords in positions 1-10',
    benchmarks: {
      poor: 5,
      average: 15,
      good: 30,
      excellent: 60
    },
    icon: Award,
    tags: ['seo', 'rankings', 'keywords', 'visibility'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-domain-authority',
    name: 'Domain Authority Score',
    plainName: 'Website Authority & Trust Score',
    function: 'ATTRACT',
    category: 'SEO',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'score',
    frequency: 'quarterly',
    description: 'Measure of website authority and ranking potential (0-100 scale)',
    whyItMatters: 'Higher authority = better rankings = more organic traffic. Builds slowly over time',
    actionToTake: 'Increase through quality backlinks, consistent content, and technical SEO. Target 30+ for local, 50+ for national',
    formula: 'Moz Domain Authority or similar metric',
    benchmarks: {
      poor: 10,
      average: 25,
      good: 40,
      excellent: 60
    },
    icon: Star,
    tags: ['authority', 'seo', 'backlinks', 'trust'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-backlink-count',
    name: 'Quality Backlinks',
    plainName: 'Number of High-Quality Sites Linking to You',
    function: 'ATTRACT',
    category: 'SEO',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'quarterly',
    description: 'Number of quality external websites linking to your site',
    whyItMatters: 'Backlinks are votes of confidence - Google\'s #1 ranking factor for competitive keywords',
    actionToTake: 'Target 10+ new quality backlinks per quarter through guest posts, PR, and valuable content',
    formula: 'Count of referring domains from DA 30+ sites',
    benchmarks: {
      poor: 10,
      average: 50,
      good: 150,
      excellent: 500
    },
    icon: Share2,
    tags: ['backlinks', 'link-building', 'seo', 'authority'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== SOCIAL MEDIA ====================
  {
    id: 'attract-social-media-followers',
    name: 'Total Social Media Followers',
    plainName: 'Combined Audience Across All Platforms',
    function: 'ATTRACT',
    category: 'Social Media',
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
    description: 'Total followers/fans across all social media platforms',
    whyItMatters: 'Social following is your owned media - reach customers without paying for ads',
    actionToTake: 'Target 10% monthly growth. Focus on 1-2 platforms where your customers actually are',
    formula: 'Sum of followers across all platforms',
    benchmarks: {
      poor: 500,
      average: 2000,
      good: 5000,
      excellent: 15000
    },
    icon: Users,
    tags: ['social-media', 'followers', 'audience', 'reach'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-social-engagement-rate',
    name: 'Social Media Engagement Rate',
    plainName: 'Percentage of Followers Who Interact',
    function: 'ATTRACT',
    category: 'Social Media',
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
    frequency: 'weekly',
    description: 'Average engagement (likes, comments, shares) as percentage of followers',
    whyItMatters: 'Engagement beats follower count - 1,000 engaged followers outperform 10,000 ghosts',
    actionToTake: 'Target 2-5%. Ask questions, share value, and respond to every comment to boost engagement',
    formula: '(Total Engagements / Total Followers) × 100',
    benchmarks: {
      poor: 0.5,
      average: 2,
      good: 5,
      excellent: 10
    },
    icon: ThumbsUp,
    tags: ['engagement', 'social-media', 'interaction', 'community'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-social-reach',
    name: 'Social Media Reach',
    plainName: 'People Who See Your Content',
    function: 'ATTRACT',
    category: 'Social Media',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of unique people who see your social media content',
    whyItMatters: 'Reach extends beyond your followers - viral content reaches thousands without ad spend',
    actionToTake: 'Track reach per post. Content that gets 5x your follower count as reach is shareable gold',
    formula: 'Unique impressions across all social platforms',
    benchmarks: {
      poor: 1000,
      average: 5000,
      good: 15000,
      excellent: 50000
    },
    icon: Radio,
    tags: ['reach', 'impressions', 'visibility', 'virality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== CONTENT MARKETING ====================
  {
    id: 'attract-content-production-rate',
    name: 'Content Production Rate',
    plainName: 'New Content Pieces Published Per Month',
    function: 'ATTRACT',
    category: 'Content Marketing',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of blog posts, videos, or content pieces published monthly',
    whyItMatters: 'Consistent content builds SEO authority and positions you as an expert',
    actionToTake: 'Target 4-8 quality pieces per month. Quality beats quantity - one great piece beats ten mediocre ones',
    formula: 'Count of published content pieces per month',
    benchmarks: {
      poor: 1,
      average: 4,
      good: 8,
      excellent: 16
    },
    icon: FileText,
    tags: ['content', 'blogging', 'production', 'publishing'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-email-list-size',
    name: 'Email List Size',
    plainName: 'Number of Email Subscribers',
    function: 'ATTRACT',
    category: 'Email Marketing',
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
    unit: 'number',
    frequency: 'monthly',
    description: 'Total number of active email subscribers',
    whyItMatters: 'Email list is your most valuable asset - you own it, unlike social media followers',
    actionToTake: 'Target 10% monthly growth. Create compelling lead magnets and add email capture to every page',
    formula: 'Count of active email subscribers',
    benchmarks: {
      poor: 100,
      average: 500,
      good: 2000,
      excellent: 10000
    },
    icon: Mail,
    tags: ['email', 'subscribers', 'list-building', 'owned-media'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-email-list-growth-rate',
    name: 'Email List Growth Rate',
    plainName: 'Speed of Email List Growth',
    function: 'ATTRACT',
    category: 'Email Marketing',
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
    description: 'Net new subscribers as percentage of total list size',
    whyItMatters: 'Growing list = growing reach and revenue. Shrinking list = dying business',
    actionToTake: 'Target 5-10% monthly growth. Clean inactive subscribers quarterly to maintain list health',
    formula: '((New Subscribers - Unsubscribes) / Total Subscribers) × 100',
    benchmarks: {
      poor: 1,
      average: 5,
      good: 10,
      excellent: 20
    },
    icon: TrendingUp,
    tags: ['growth-rate', 'email', 'list-building', 'subscribers'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== REFERRALS & WORD-OF-MOUTH ====================
  {
    id: 'attract-referral-rate',
    name: 'Referral Rate',
    plainName: 'Percentage of New Customers from Referrals',
    function: 'ATTRACT',
    category: 'Referrals',
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
    description: 'Percentage of new customers acquired through referrals',
    whyItMatters: 'Referred customers have 3x higher retention and 5x higher conversion - best customers you can get',
    actionToTake: 'Target 30%+. Create a formal referral program and ask every happy customer for referrals',
    formula: '(New Customers from Referrals / Total New Customers) × 100',
    benchmarks: {
      poor: 10,
      average: 20,
      good: 35,
      excellent: 50
    },
    icon: UserPlus,
    tags: ['referrals', 'word-of-mouth', 'advocacy', 'acquisition'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-referrals-per-customer',
    name: 'Referrals Per Customer',
    plainName: 'Average Referrals Each Customer Provides',
    function: 'ATTRACT',
    category: 'Referrals',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'quarterly',
    description: 'Average number of referrals provided per existing customer',
    whyItMatters: 'If each customer brings one more, you have viral growth. Track this to engineer referrals',
    actionToTake: 'Target 0.5+ referrals per customer. Make referring easy and rewarding',
    formula: 'Total Referrals / Total Customers',
    benchmarks: {
      poor: 0.1,
      average: 0.3,
      good: 0.6,
      excellent: 1.2
    },
    icon: Share2,
    tags: ['referral-rate', 'viral-coefficient', 'growth', 'advocacy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== BRAND AWARENESS ====================
  {
    id: 'attract-brand-awareness-score',
    name: 'Brand Awareness Score',
    plainName: 'How Well Known Your Brand Is',
    function: 'ATTRACT',
    category: 'Brand',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of target market who recognize your brand',
    whyItMatters: 'Strong brand awareness reduces CAC and increases conversion - people buy from brands they know',
    actionToTake: 'Survey target market quarterly. Invest in consistent branding and thought leadership',
    formula: '(People Who Recognize Brand / Survey Sample Size) × 100',
    benchmarks: {
      poor: 10,
      average: 25,
      good: 50,
      excellent: 75
    },
    icon: Eye,
    tags: ['brand', 'awareness', 'recognition', 'market-presence'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-share-of-voice',
    name: 'Share of Voice',
    plainName: 'Your Brand Mentions vs Competitors',
    function: 'ATTRACT',
    category: 'Brand',
    tier: 'advanced',
    industries: ['all'],
    stages: [
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Your brand mentions as percentage of total industry conversation',
    whyItMatters: 'Dominating the conversation leads to market dominance - visibility drives growth',
    actionToTake: 'Track social mentions, media coverage, and search volume. Aim to own 20%+ of industry conversation',
    formula: '(Your Brand Mentions / Total Industry Mentions) × 100',
    benchmarks: {
      poor: 5,
      average: 15,
      good: 30,
      excellent: 50
    },
    icon: MessageCircle,
    tags: ['share-of-voice', 'brand-visibility', 'market-share', 'awareness'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ==================== PAID ADVERTISING ====================
  {
    id: 'attract-ad-click-through-rate',
    name: 'Ad Click-Through Rate (CTR)',
    plainName: 'Percentage of People Who Click Your Ads',
    function: 'ATTRACT',
    category: 'Paid Advertising',
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
    frequency: 'weekly',
    description: 'Percentage of ad impressions that result in clicks',
    whyItMatters: 'High CTR means relevant ads that resonate - low CTR wastes ad budget on bad targeting',
    actionToTake: 'Target 2%+ for search ads, 0.5%+ for display. Test headlines and targeting to improve CTR',
    formula: '(Ad Clicks / Ad Impressions) × 100',
    benchmarks: {
      poor: 0.5,
      average: 2,
      good: 4,
      excellent: 8
    },
    icon: MousePointerClick,
    tags: ['ctr', 'paid-ads', 'advertising', 'relevance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-ad-conversion-rate',
    name: 'Ad Conversion Rate',
    plainName: 'Percentage of Ad Clicks That Convert',
    function: 'ATTRACT',
    category: 'Paid Advertising',
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
    frequency: 'weekly',
    description: 'Percentage of ad clicks that become leads or customers',
    whyItMatters: 'High conversion means matched message and landing page - low conversion means disconnect',
    actionToTake: 'Target 5-10% for lead gen, 1-3% for e-commerce. Match ad promise to landing page delivery',
    formula: '(Conversions from Ads / Total Ad Clicks) × 100',
    benchmarks: {
      poor: 1,
      average: 3,
      good: 7,
      excellent: 12
    },
    icon: Target,
    tags: ['conversion', 'paid-ads', 'landing-page', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-roas',
    name: 'Return on Ad Spend (ROAS)',
    plainName: 'Revenue Per Dollar of Ad Spend',
    function: 'ATTRACT',
    category: 'Paid Advertising',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'ratio',
    frequency: 'weekly',
    description: 'Revenue generated for every dollar spent on advertising',
    whyItMatters: 'Shows profitability of paid advertising - below 2:1 means you\'re losing money',
    actionToTake: 'Target 4:1 minimum. Above 8:1 means increase ad spend to scale faster',
    formula: 'Revenue from Ads / Ad Spend',
    benchmarks: {
      poor: 1,
      average: 3,
      good: 5,
      excellent: 10
    },
    icon: DollarSign,
    tags: ['roas', 'roi', 'paid-advertising', 'profitability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'attract-cost-per-click',
    name: 'Cost Per Click (CPC)',
    plainName: 'Average Cost for Each Ad Click',
    function: 'ATTRACT',
    category: 'Paid Advertising',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'currency',
    frequency: 'weekly',
    description: 'Average amount paid for each click on paid advertisements',
    whyItMatters: 'Lower CPC means more efficient advertising - but cheap clicks from wrong audience waste money',
    actionToTake: 'Benchmark by industry. Improve Quality Score to reduce CPC while maintaining targeting',
    formula: 'Total Ad Spend / Total Clicks',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 2,
      excellent: 1
    },
    icon: DollarSign,
    tags: ['cpc', 'paid-ads', 'efficiency', 'google-ads'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]