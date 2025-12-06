'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Briefcase,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  User,
  Mail,
  Phone,
  Globe,
  MapPin
} from 'lucide-react'

// Step types
interface StepProps {
  data: WizardData
  updateData: (updates: Partial<WizardData>) => void
  errors: Record<string, string>
}

export interface WizardData {
  // Step 1: Basic Information
  businessName: string
  industry: string
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  ownerPhone: string
  website: string
  address: string

  // Step 2: Program Setup
  programType: string
  sessionFrequency: string
  customFrequency: string
  engagementStartDate: string
  contractLength: string

  // Step 3: Module Selection
  enabledModules: {
    // Strategy & Planning
    visionMission: boolean
    annualPlan: boolean
    quarterlyRocks: boolean
    strategicInitiatives: boolean
    onePagePlan: boolean

    // Goals & Tracking
    goals: boolean
    weeklyReviews: boolean
    quarterlyReviews: boolean

    // Finance
    forecast: boolean
    financials: boolean
    xeroIntegration: boolean

    // Operations
    issuesList: boolean
    stopDoing: boolean
    openLoops: boolean

    // Team
    accountability: boolean
    hiringRoadmap: boolean

    // Analysis
    swotAnalysis: boolean
    assessment: boolean

    // Communication
    chat: boolean
    documents: boolean
  }
}

const defaultData: WizardData = {
  businessName: '',
  industry: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerPhone: '',
  website: '',
  address: '',
  programType: '',
  sessionFrequency: 'Fortnightly',
  customFrequency: '',
  engagementStartDate: new Date().toISOString().split('T')[0],
  contractLength: '12',
  enabledModules: {
    // Strategy & Planning
    visionMission: true,
    annualPlan: true,
    quarterlyRocks: true,
    strategicInitiatives: true,
    onePagePlan: true,

    // Goals & Tracking
    goals: true,
    weeklyReviews: true,
    quarterlyReviews: true,

    // Finance
    forecast: true,
    financials: true,
    xeroIntegration: false,

    // Operations
    issuesList: true,
    stopDoing: true,
    openLoops: true,

    // Team
    accountability: true,
    hiringRoadmap: true,

    // Analysis
    swotAnalysis: true,
    assessment: true,

    // Communication
    chat: true,
    documents: true,
  },
}

const steps = [
  { id: 1, title: 'Basic Information', icon: Building2 },
  { id: 2, title: 'Program Setup', icon: Briefcase },
  { id: 3, title: 'Modules', icon: LayoutGrid },
]

const industries = [
  // Professional Services (expanded)
  'Professional Services - Bookkeeping',
  'Professional Services - Accounting',
  'Professional Services - Recruitment',
  'Professional Services - HR Consulting',
  'Professional Services - Engineering',
  'Professional Services - Financial Advisory',
  'Professional Services - Business Consulting',
  'Professional Services - IT Consulting',
  'Professional Services - Marketing Agency',
  'Professional Services - Legal Services',
  'Professional Services - Other',

  // Building, Construction & Trades
  'Building & Construction - General Builder',
  'Building & Construction - Residential',
  'Building & Construction - Commercial',
  'Trades - Plumbing',
  'Trades - Electrical',
  'Trades - HVAC',
  'Trades - Carpentry',
  'Trades - Landscaping',
  'Trades - Painting',
  'Trades - Other',

  // Allied Health & Wellness
  'Allied Health - Physiotherapy',
  'Allied Health - Occupational Therapy',
  'Allied Health - Chiropractic',
  'Allied Health - Psychology',
  'Allied Health - Dietetics/Nutrition',
  'Allied Health - Podiatry',
  'Health & Fitness - Gym/Fitness Studio',
  'Health & Fitness - Personal Training',
  'Health & Fitness - Yoga/Pilates',
  'Medical & Healthcare - General Practice',
  'Medical & Healthcare - Dental',
  'Medical & Healthcare - Specialist',

  // E-commerce & Retail
  'E-commerce - Product-based',
  'E-commerce - Dropshipping',
  'E-commerce - Amazon FBA',
  'Retail - Bricks & Mortar',
  'Retail - Online + Physical',

  // Other Industries
  'Technology & Software',
  'Real Estate',
  'Hospitality & Tourism',
  'Education & Training',
  'Transport & Logistics',
  'Agriculture & Farming',
  'Mining & Resources',
  'Manufacturing',
  'Wholesale & Distribution',
  'Non-Profit',
  'Government',
  'Other',
]

const programTypes = [
  { value: '1:1 Coaching', label: '1:1 Coaching', description: 'One-on-one business coaching sessions' },
  { value: 'Think Bigger', label: 'Think Bigger', description: 'Group coaching program for business growth' },
  { value: 'Coaching + CFO Services', label: 'Coaching + CFO Services', description: 'Coaching combined with fractional CFO support' },
]

// Step Components
function Step1BasicInfo({ data, updateData, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Business Information</h2>
        <p className="text-gray-500">Enter the basic details about your new client.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Business Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={data.businessName}
              onChange={(e) => updateData({ businessName: e.target.value })}
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
                errors.businessName ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter business name"
            />
          </div>
          {errors.businessName && <p className="mt-1 text-sm text-red-500">{errors.businessName}</p>}
        </div>

        {/* Industry */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Industry <span className="text-red-500">*</span>
          </label>
          <select
            value={data.industry}
            onChange={(e) => updateData({ industry: e.target.value })}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
              errors.industry ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select industry</option>
            {industries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          {errors.industry && <p className="mt-1 text-sm text-red-500">{errors.industry}</p>}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Owner / Primary Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={data.ownerFirstName}
                onChange={(e) => updateData({ ownerFirstName: e.target.value })}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
                  errors.ownerFirstName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="First name"
              />
            </div>
            {errors.ownerFirstName && <p className="mt-1 text-sm text-red-500">{errors.ownerFirstName}</p>}
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.ownerLastName}
              onChange={(e) => updateData({ ownerLastName: e.target.value })}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
                errors.ownerLastName ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Last name"
            />
            {errors.ownerLastName && <p className="mt-1 text-sm text-red-500">{errors.ownerLastName}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={data.ownerEmail}
                onChange={(e) => updateData({ ownerEmail: e.target.value })}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
                  errors.ownerEmail ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="email@example.com"
              />
            </div>
            {errors.ownerEmail && <p className="mt-1 text-sm text-red-500">{errors.ownerEmail}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                value={data.ownerPhone}
                onChange={(e) => updateData({ ownerPhone: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                placeholder="Phone number"
              />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="url"
                value={data.website}
                onChange={(e) => updateData({ website: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                placeholder="https://"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={data.address}
                onChange={(e) => updateData({ address: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
                placeholder="Business address"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step2ProgramSetup({ data, updateData, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Program Setup</h2>
        <p className="text-gray-500">Configure the coaching program details.</p>
      </div>

      {/* Program Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Program Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {programTypes.map((program) => (
            <button
              key={program.value}
              type="button"
              onClick={() => updateData({ programType: program.value, customFrequency: '' })}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                data.programType === program.value
                  ? 'border-brand-orange bg-brand-orange-50'
                  : 'border-gray-200 hover:border-brand-orange-300'
              }`}
            >
              <p className="font-semibold text-gray-900">{program.label}</p>
              <p className="text-sm text-gray-500 mt-1">{program.description}</p>
            </button>
          ))}
        </div>
        {errors.programType && <p className="mt-2 text-sm text-red-500">{errors.programType}</p>}
      </div>

      {/* Session Frequency - Only for 1:1 Coaching */}
      {data.programType === '1:1 Coaching' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Coaching Frequency</label>
          <div className="flex gap-3">
            {['Weekly', 'Fortnightly', 'Monthly'].map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => updateData({ sessionFrequency: freq })}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  data.sessionFrequency === freq
                    ? 'bg-brand-orange text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Frequency - Only for Coaching + CFO Services */}
      {data.programType === 'Coaching + CFO Services' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Custom Frequency <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.customFrequency || ''}
            onChange={(e) => updateData({ customFrequency: e.target.value })}
            placeholder="e.g., Coaching weekly + CFO review monthly"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange ${
              errors.customFrequency ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.customFrequency && <p className="mt-1 text-sm text-red-500">{errors.customFrequency}</p>}
          <p className="mt-2 text-sm text-gray-500">
            Describe the bespoke schedule for coaching and CFO services
          </p>
        </div>
      )}

      {/* Start Date - Always shown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={data.engagementStartDate}
            onChange={(e) => updateData({ engagementStartDate: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
        </div>
      </div>
    </div>
  )
}

function Step3Modules({ data, updateData }: StepProps) {
  const [accessMode, setAccessMode] = useState<'full' | 'custom'>('full')

  const enableAllModules = () => {
    setAccessMode('full')
    updateData({
      enabledModules: {
        visionMission: true,
        annualPlan: true,
        quarterlyRocks: true,
        strategicInitiatives: true,
        onePagePlan: true,
        goals: true,
        weeklyReviews: true,
        quarterlyReviews: true,
        forecast: true,
        financials: true,
        xeroIntegration: true,
        issuesList: true,
        stopDoing: true,
        openLoops: true,
        accountability: true,
        hiringRoadmap: true,
        swotAnalysis: true,
        assessment: true,
        chat: true,
        documents: true,
      }
    })
  }

  const selectCustomAccess = () => {
    setAccessMode('custom')
  }

  const moduleCategories = [
    {
      title: 'Strategy & Planning',
      modules: [
        { key: 'visionMission' as const, label: 'Vision & Mission', description: 'Core purpose and long-term vision' },
        { key: 'annualPlan' as const, label: 'Annual Plan', description: 'Yearly goals and strategic priorities' },
        { key: 'quarterlyRocks' as const, label: 'Quarterly Rocks', description: '90-day priorities and milestones' },
        { key: 'strategicInitiatives' as const, label: 'Strategic Initiatives', description: 'Key projects and initiatives' },
        { key: 'onePagePlan' as const, label: 'One Page Plan', description: 'Business plan summary on one page' },
      ]
    },
    {
      title: 'Goals & Tracking',
      modules: [
        { key: 'goals' as const, label: 'Goals & KPIs', description: 'Goal setting and key performance indicators' },
        { key: 'weeklyReviews' as const, label: 'Weekly Reviews', description: 'Weekly check-ins and progress tracking' },
        { key: 'quarterlyReviews' as const, label: 'Quarterly Reviews', description: 'Quarterly business reviews' },
      ]
    },
    {
      title: 'Finance',
      modules: [
        { key: 'forecast' as const, label: 'Financial Forecast', description: 'P&L forecast and projections' },
        { key: 'financials' as const, label: 'Financials Dashboard', description: 'Financial overview and metrics' },
        { key: 'xeroIntegration' as const, label: 'Xero Integration', description: 'Connect to Xero accounting' },
      ]
    },
    {
      title: 'Operations',
      modules: [
        { key: 'issuesList' as const, label: 'Issues List', description: 'Track and resolve business issues' },
        { key: 'stopDoing' as const, label: 'Stop Doing List', description: 'Things to eliminate or delegate' },
        { key: 'openLoops' as const, label: 'Open Loops', description: 'Unfinished tasks and follow-ups' },
      ]
    },
    {
      title: 'Team',
      modules: [
        { key: 'accountability' as const, label: 'Accountability Chart', description: 'Team roles and responsibilities' },
        { key: 'hiringRoadmap' as const, label: 'Hiring Roadmap', description: 'Future hiring plans' },
      ]
    },
    {
      title: 'Analysis',
      modules: [
        { key: 'swotAnalysis' as const, label: 'SWOT Analysis', description: 'Strengths, weaknesses, opportunities, threats' },
        { key: 'assessment' as const, label: 'Business Assessment', description: 'Comprehensive business health check' },
      ]
    },
    {
      title: 'Communication',
      modules: [
        { key: 'chat' as const, label: 'Messages', description: 'Direct messaging with coach' },
        { key: 'documents' as const, label: 'Documents', description: 'Shared files and resources' },
      ]
    },
  ]

  const toggleModule = (key: keyof typeof data.enabledModules) => {
    updateData({
      enabledModules: {
        ...data.enabledModules,
        [key]: !data.enabledModules[key]
      }
    })
  }

  const toggleCategory = (modules: { key: keyof typeof data.enabledModules }[]) => {
    const allEnabled = modules.every(m => data.enabledModules[m.key])
    const updates: Partial<typeof data.enabledModules> = {}
    modules.forEach(m => {
      updates[m.key] = !allEnabled
    })
    updateData({
      enabledModules: {
        ...data.enabledModules,
        ...updates
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Module Selection</h2>
        <p className="text-gray-500">Choose which features to enable for this client.</p>
      </div>

      {/* Full Access Option */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={enableAllModules}
          className={`p-6 border-2 rounded-xl text-left transition-all ${
            accessMode === 'full'
              ? 'border-brand-orange bg-brand-orange-50'
              : 'border-gray-200 hover:border-brand-orange-300'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              accessMode === 'full' ? 'bg-brand-orange' : 'bg-gray-200'
            }`}>
              {accessMode === 'full' && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-lg">Full Access</p>
          </div>
          <p className="text-sm text-gray-500">Grant access to all platform features and modules</p>
        </button>

        <button
          type="button"
          onClick={selectCustomAccess}
          className={`p-6 border-2 rounded-xl text-left transition-all ${
            accessMode === 'custom'
              ? 'border-brand-orange bg-brand-orange-50'
              : 'border-gray-200 hover:border-brand-orange-300'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              accessMode === 'custom' ? 'bg-brand-orange' : 'bg-gray-200'
            }`}>
              {accessMode === 'custom' && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-lg">Custom Access</p>
          </div>
          <p className="text-sm text-gray-500">Choose specific modules to enable for this client</p>
        </button>
      </div>

      {/* Detailed Module List - Only show if Custom Access is selected */}
      {accessMode === 'custom' && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700">Select which modules to enable:</p>

          {moduleCategories.map((category) => {
            const allCategoryEnabled = category.modules.every(m => data.enabledModules[m.key])
            const someCategoryEnabled = category.modules.some(m => data.enabledModules[m.key])

            return (
              <div key={category.title} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Category Header */}
                <div
                  className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCategory(category.modules)}
                >
                  <h3 className="font-semibold text-gray-900">{category.title}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      {category.modules.filter(m => data.enabledModules[m.key]).length}/{category.modules.length} enabled
                    </span>
                    <div className={`w-10 h-6 rounded-full transition-colors ${
                      allCategoryEnabled ? 'bg-brand-orange' : someCategoryEnabled ? 'bg-brand-orange-300' : 'bg-gray-300'
                    }`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${
                        allCategoryEnabled || someCategoryEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </div>
                  </div>
                </div>

                {/* Module List */}
                <div className="divide-y divide-gray-100">
                  {category.modules.map((module) => (
                    <div
                      key={module.key}
                      className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                        data.enabledModules[module.key] ? 'bg-brand-orange-50/50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => toggleModule(module.key)}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{module.label}</p>
                        <p className="text-sm text-gray-500">{module.description}</p>
                      </div>
                      <div className={`w-10 h-6 rounded-full transition-colors ${
                        data.enabledModules[module.key] ? 'bg-brand-orange' : 'bg-gray-300'
                      }`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${
                          data.enabledModules[module.key] ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Main Wizard Component
interface OnboardingWizardProps {
  onComplete: (data: WizardData) => Promise<void>
  onCancel: () => void
}

const STORAGE_KEY = 'coach_onboarding_wizard_data'
const STORAGE_STEP_KEY = 'coach_onboarding_wizard_step'

export function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<WizardData>(defaultData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load saved data on mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY)
    const savedStep = localStorage.getItem(STORAGE_STEP_KEY)

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setData({ ...defaultData, ...parsed })
        setLastSaved(new Date())
      } catch (e) {
        console.error('Failed to parse saved wizard data:', e)
      }
    }

    if (savedStep) {
      const step = parseInt(savedStep, 10)
      if (step >= 1 && step <= 6) {
        setCurrentStep(step)
      }
    }
  }, [])

  // Autosave data whenever it changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      localStorage.setItem(STORAGE_STEP_KEY, currentStep.toString())
      setLastSaved(new Date())
    }, 500) // Debounce by 500ms

    return () => clearTimeout(timeoutId)
  }, [data, currentStep])

  // Clear saved data after successful submission
  const clearSavedData = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_STEP_KEY)
  }

  const updateData = (updates: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...updates }))
    // Clear errors for updated fields
    const updatedKeys = Object.keys(updates)
    setErrors(prev => {
      const newErrors = { ...prev }
      updatedKeys.forEach(key => delete newErrors[key])
      return newErrors
    })
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!data.businessName.trim()) newErrors.businessName = 'Business name is required'
      if (!data.industry) newErrors.industry = 'Industry is required'
      if (!data.ownerFirstName.trim()) newErrors.ownerFirstName = 'First name is required'
      if (!data.ownerLastName.trim()) newErrors.ownerLastName = 'Last name is required'
      if (!data.ownerEmail.trim()) newErrors.ownerEmail = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.ownerEmail)) {
        newErrors.ownerEmail = 'Invalid email format'
      }
    }

    if (step === 2) {
      if (!data.programType) newErrors.programType = 'Program type is required'
      if (data.programType === 'Coaching + CFO Services' && !data.customFrequency.trim()) {
        newErrors.customFrequency = 'Custom frequency is required for this program type'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3))
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    setSaving(true)
    setSubmitError(null)
    try {
      await onComplete(data)
      clearSavedData() // Clear autosaved data on successful submission
    } catch (error) {
      console.error('Error saving client:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to create client. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    clearSavedData() // Clear autosaved data when canceling
    onCancel()
  }

  const handleStartFresh = () => {
    clearSavedData()
    setData(defaultData)
    setCurrentStep(1)
    setLastSaved(null)
  }

  const renderStep = () => {
    const stepProps = { data, updateData, errors }

    switch (currentStep) {
      case 1: return <Step1BasicInfo {...stepProps} />
      case 2: return <Step2ProgramSetup {...stepProps} />
      case 3: return <Step3Modules {...stepProps} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-gray-900">Add New Client</h1>
              {lastSaved && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <button
                  onClick={handleStartFresh}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Start Fresh
                </button>
              )}
              <button
                onClick={handleCancel}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const Icon = step.icon
              const isActive = step.id === currentStep
              const isCompleted = step.id < currentStep

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-brand-orange text-white'
                        : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span className={`text-xs mt-1 hidden sm:block ${
                      isActive ? 'text-brand-orange font-medium' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-12 sm:w-20 h-0.5 mx-2 ${
                      step.id < currentStep ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          {renderStep()}
        </div>

        {/* Error Message */}
        {submitError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-red-800">Error creating client</p>
              <p className="text-sm text-red-700 mt-1">{submitError}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              currentStep === 1
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange-600 transition-colors"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Client...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Client
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OnboardingWizard
