'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BusinessProfileService } from './services/business-profile-service'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import toast, { Toaster } from 'react-hot-toast'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  User,
  DollarSign,
  Users,
  Target,
  CheckCircle,
  AlertCircle,
  Globe,
  Instagram,
  Facebook,
  Linkedin,
  X,
  Loader2
} from 'lucide-react'
import type { BusinessProfile, SaveStatus, ValidationError } from './types'

const STEPS = [
  { id: 1, name: 'Company Information', icon: Building2 },
  { id: 2, name: 'Owner Profile', icon: User },
  { id: 3, name: 'Your Goals & Vision', icon: Target },
  { id: 4, name: 'Financial Snapshot', icon: DollarSign },
  { id: 5, name: 'Team & Organisation', icon: Users },
  { id: 6, name: 'Current Situation', icon: CheckCircle },
]

// Industry list organized by category
const INDUSTRIES = [
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

const BUSINESS_MODELS = [
  'B2B (Business to Business)',
  'B2C (Business to Consumer)',
  'B2B2C (Both)',
  'Marketplace',
  'SaaS (Software as a Service)',
  'Subscription',
  'E-commerce',
  'Professional Services',
  'Manufacturing',
  'Retail',
  'Wholesale',
  'Franchise',
]

export default function EnhancedBusinessProfile() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [currentStep, setCurrentStep] = useState(1)
  const [business, setBusiness] = useState<Partial<BusinessProfile>>({})
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  // Load business data on mount or when active business changes
  useEffect(() => {
    if (!contextLoading) {
      loadBusiness()
    }
  }, [contextLoading, activeBusiness?.id])

  // Validation function
  const validateBusinessProfile = (): ValidationError[] => {
    const errors: ValidationError[] = []

    if (!business.name || business.name.trim() === '') {
      errors.push({ field: 'name', message: 'Business name is required' })
    }

    if (!business.industry || business.industry.trim() === '') {
      errors.push({ field: 'industry', message: 'Industry is required' })
    }

    if (business.annual_revenue === undefined || business.annual_revenue === null) {
      errors.push({ field: 'annual_revenue', message: 'Annual revenue is required' })
    }

    if (business.employee_count === undefined || business.employee_count === null) {
      errors.push({ field: 'employee_count', message: 'Employee count is required' })
    }

    if (business.years_in_operation === undefined || business.years_in_operation === null) {
      errors.push({ field: 'years_in_operation', message: 'Years in operation is required' })
    }

    return errors
  }

  // Helper to check if field has error
  const hasFieldError = (fieldName: string): boolean => {
    return validationErrors.some(err => err.field === fieldName)
  }

  // Helper to get field error message
  const getFieldError = (fieldName: string): string | undefined => {
    return validationErrors.find(err => err.field === fieldName)?.message
  }

  // Consistent input styling
  const getInputClassName = (fieldName?: string) => {
    const hasError = fieldName ? hasFieldError(fieldName) : false
    return `w-full h-11 px-4 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
      hasError
        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
        : 'border-gray-300 focus:border-teal-500 focus:ring-teal-100'
    } [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`
  }

  const getSelectClassName = (fieldName?: string) => {
    const hasError = fieldName ? hasFieldError(fieldName) : false
    return `w-full h-11 pl-4 pr-10 border rounded-lg focus:ring-2 focus:outline-none transition-colors appearance-none bg-white cursor-pointer ${
      hasError
        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
        : 'border-gray-300 focus:border-teal-500 focus:ring-teal-100'
    } bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236B7280%22%20d%3D%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[center_right_12px] bg-no-repeat`
  }

  const getTextareaClassName = () => {
    return 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors resize-none'
  }

  // Format number with commas
  const formatCurrency = (value: number | undefined | null): string => {
    if (!value && value !== 0) return ''
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  const loadBusiness = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Determine which business to load:
      // 1. If activeBusiness is set (coach viewing client), use it
      // 2. Otherwise, load user's own business profile
      const { data, businessId: bizId, profileId: profId, error } = activeBusiness?.id
        ? await BusinessProfileService.getBusinessProfileByBusinessId(activeBusiness.id)
        : await BusinessProfileService.loadBusinessProfile(user.id)

      if (error) {
        console.error('❌ Error loading business profile:', error)
        toast.error('Failed to load business profile: ' + error)
        setSaveStatus('error')
      } else if (data) {
        console.log('✅ Loaded business profile:', {
          businessId: bizId,
          profileId: profId,
          hasData: !!data,
          dataKeys: Object.keys(data),
          name: data.name,
          industry: data.industry,
          employee_count: data.employee_count
        })
        setBusiness(data)
        setBusinessId(bizId)
        setProfileId(profId)

        if (data.profile_updated_at) {
          setLastSaved(new Date(data.profile_updated_at))
        }

        // Initialize empty key_roles if not present
        if (!data.key_roles || (data.key_roles as any[]).length === 0) {
          setBusiness((prev: any) => ({
            ...prev,
            key_roles: [
              { title: '', name: '', status: '' },
              { title: '', name: '', status: '' },
              { title: '', name: '', status: '' }
            ]
          }))
        }
      }
    } catch (error) {
      console.error('Error loading business:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-save function
  const autoSave = useCallback(async () => {
    if (!businessId || !profileId) return

    setSaveStatus('saving')

    try {
      const profileData = {
        ...business,
        profile_completed: calculateCompletion() === 100
      }

      const { success, error } = await BusinessProfileService.saveBusinessProfile(
        businessId,
        profileId,
        profileData
      )

      if (error) {
        console.error('❌ Error saving business profile:', error)
        toast.error('Auto-save failed: ' + error)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else if (success) {
        setLastSaved(new Date())
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Unexpected error during auto-save')
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [business, businessId, profileId])

  // Handle field changes with debounced auto-save
  const handleFieldChange = (field: string, value: any) => {
    setBusiness((prev: any) => ({ ...prev, [field]: value }))
    
    // Clear existing timer
    if (saveTimer) clearTimeout(saveTimer)
    
    // Set new timer for auto-save (2 seconds after user stops typing)
    const newTimer = setTimeout(() => {
      autoSave()
    }, 2000)
    
    setSaveTimer(newTimer)
  }

  // Handle array field changes
  const handleArrayFieldChange = (field: string, index: number, value: string) => {
    const currentArray = ((business as Record<string, unknown>)[field] as string[]) || []
    const newArray = [...currentArray]
    newArray[index] = value
    handleFieldChange(field, newArray)
  }

  // Add item to array field
  const addArrayItem = (field: string) => {
    const currentArray = ((business as Record<string, unknown>)[field] as string[]) || []
    handleFieldChange(field, [...currentArray, ''])
  }

  // Remove item from array field
  const removeArrayItem = (field: string, index: number) => {
    const currentArray = ((business as Record<string, unknown>)[field] as string[]) || []
    const newArray = currentArray.filter((_, i) => i !== index)
    handleFieldChange(field, newArray)
  }

  // Handle JSON field changes
  const handleJsonFieldChange = (field: string, data: any) => {
    handleFieldChange(field, data)
  }

  // Calculate completion percentage
  const calculateCompletion = (): number => {
    let totalFields = 0
    let filledFields = 0

    // Required business fields (5 fields)
    const requiredBusinessFields: (keyof BusinessProfile)[] = [
      'name', 'industry', 'annual_revenue',
      'employee_count', 'years_in_operation'
    ]
    totalFields += requiredBusinessFields.length
    filledFields += requiredBusinessFields.filter(field => business[field]).length

    // Required owner_info fields (7 fields)
    const ownerInfo = business.owner_info || {}
    const requiredOwnerFields = [
      'owner_name', 'ownership_percentage', 'primary_goal',
      'time_horizon', 'current_hours', 'desired_role', 'risk_tolerance'
    ] as const
    totalFields += requiredOwnerFields.length
    filledFields += requiredOwnerFields.filter(field => (ownerInfo as any)[field]).length

    // Required financial fields (2 pairs - at least one from each)
    // Gross Profit: at least one of $ or %
    totalFields += 1
    if (business.gross_profit || business.gross_profit_margin) filledFields++

    // Net Profit: at least one of $ or %
    totalFields += 1
    if (business.net_profit || business.net_profit_margin) filledFields++

    // Total: 14 required fields
    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0
  }

  // Calculate revenue stage (matches Business Roadmap stages)
  const getRevenueStage = (revenue?: number | null): string => {
    if (!revenue) return 'Foundation'
    if (revenue < 500000) return 'Foundation ($0-$500K)'
    if (revenue < 1000000) return 'Traction ($500K-$1M)'
    if (revenue < 5000000) return 'Growth ($1M-$5M)'
    if (revenue < 10000000) return 'Scale ($5M-$10M)'
    return 'Mastery ($10M+)'
  }

  // Manual save function with validation
  const manualSave = async () => {
    if (saveTimer) clearTimeout(saveTimer)

    // Validate before saving
    const errors = validateBusinessProfile()
    setValidationErrors(errors)

    if (errors.length > 0) {
      toast.error(`Please fix ${errors.length} validation error${errors.length > 1 ? 's' : ''} before saving`)
      return
    }

    setIsSaving(true)
    try {
      await autoSave()
      toast.success('Business profile saved successfully!')
    } catch (error) {
      toast.error('Failed to save business profile')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
        <div className="text-gray-600">Loading business profile...</div>
      </div>
    )
  }

  // Get social media data or initialize empty
  const socialMedia = business?.social_media || {}
  const ownerInfo = business?.owner_info || {}
  const partners = ownerInfo.partners || []

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      {/* Toast Notifications */}
      <Toaster position="top-right" />

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="mb-6 text-teal-600 hover:text-teal-700 flex items-center gap-2 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Business Profile</h1>
              <p className="text-gray-600 text-base">
                Build your comprehensive business context to power personalized insights
              </p>
            </div>

            <div className={`text-right px-6 py-4 rounded-lg border shadow-sm ${
              calculateCompletion() === 100
                ? 'bg-green-50 border-green-200'
                : 'bg-white border-gray-200'
            }`}>
              <div className={`text-3xl font-bold ${
                calculateCompletion() === 100 ? 'text-green-600' :
                calculateCompletion() >= 80 ? 'text-teal-600' :
                calculateCompletion() >= 50 ? 'text-teal-500' : 'text-gray-400'
              }`}>
                {calculateCompletion()}%
              </div>
              <div className={`text-sm mt-1 font-semibold ${
                calculateCompletion() === 100 ? 'text-green-700' : 'text-gray-600'
              }`}>
                {calculateCompletion() === 100 ? '✓ Complete!' : 'Complete'}
              </div>
              {lastSaved && (
                <div className="text-xs text-gray-500 mt-2">
                  Saved {lastSaved.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const isActive = currentStep === step.id
              const isCompleted = step.id < currentStep

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <button
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all w-full ${
                      isActive
                        ? 'bg-teal-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-teal-600 text-white'
                        : isCompleted
                        ? 'bg-teal-100 text-teal-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-medium text-center transition-colors ${
                      isActive
                        ? 'text-teal-600'
                        : isCompleted
                        ? 'text-gray-700'
                        : 'text-gray-400'
                    }`}>
                      {step.name}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={`h-0.5 w-full mx-2 transition-colors ${
                      isCompleted ? 'bg-teal-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 relative">
          {/* Auto-Save Status Indicator */}
          <div className="absolute top-6 right-6 z-10">
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-2 text-teal-600 bg-teal-50 px-3 py-1.5 rounded-md shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Auto-saving...</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-md shadow-sm">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Auto-saved</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-md shadow-sm">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Error saving</span>
              </div>
            )}
          </div>

          {/* Profile Complete Success Banner */}
          {calculateCompletion() === 100 && (
            <div className="mb-8 bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-green-900 mb-2">
                    🎉 Profile Complete!
                  </h3>
                  <p className="text-green-800 mb-4">
                    Great! Now let's complete your business assessment to unlock personalized insights and recommendations.
                  </p>
                  <button
                    onClick={() => router.push('/assessment')}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-sm"
                  >
                    Start Assessment →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Company Information */}
          {currentStep === 1 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Company Information</h2>
                <p className="text-gray-600 mt-1">Tell us about your business</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={business.name || ''}
                    onChange={(e) => {
                      handleFieldChange('name', e.target.value)
                      setValidationErrors(errors => errors.filter(e => e.field !== 'name'))
                    }}
                    className={getInputClassName('name')}
                    placeholder="Enter business name"
                  />
                  {hasFieldError('name') && (
                    <p className="text-red-600 text-sm mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {getFieldError('name')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Industry <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={business.industry || ''}
                    onChange={(e) => {
                      handleFieldChange('industry', e.target.value)
                      setValidationErrors(errors => errors.filter(e => e.field !== 'industry'))
                    }}
                    className={getSelectClassName('industry')}
                  >
                    <option value="">Select industry...</option>
                    {INDUSTRIES.map(industry => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                  {hasFieldError('industry') && (
                    <p className="text-red-600 text-sm mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {getFieldError('industry')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Years in Business <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={business.years_in_operation || ''}
                    onChange={(e) => {
                      handleFieldChange('years_in_operation', parseInt(e.target.value) || 0)
                      setValidationErrors(errors => errors.filter(e => e.field !== 'years_in_operation'))
                    }}
                    className={getInputClassName('years_in_operation')}
                    min="0"
                    max="100"
                    placeholder="0"
                  />
                  {hasFieldError('years_in_operation') && (
                    <p className="text-red-600 text-sm mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {getFieldError('years_in_operation')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Business Model
                  </label>
                  <select
                    value={business.business_model || ''}
                    onChange={(e) => handleFieldChange('business_model', e.target.value)}
                    className={getSelectClassName()}
                  >
                    <option value="">Select model...</option>
                    {BUSINESS_MODELS.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Online Presence */}
              <div className="border-t border-gray-200 pt-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Online Presence</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Globe className="inline w-4 h-4 mr-1" />
                      Website
                    </label>
                    <input
                      type="url"
                      value={socialMedia.website || ''}
                      onChange={(e) => {
                        const updated = { ...socialMedia, website: e.target.value }
                        handleJsonFieldChange('social_media', updated)
                      }}
                      className={getInputClassName()}
                      placeholder="https://www.example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Linkedin className="inline w-4 h-4 mr-1" />
                      LinkedIn
                    </label>
                    <input
                      type="url"
                      value={socialMedia.linkedin || ''}
                      onChange={(e) => {
                        const updated = { ...socialMedia, linkedin: e.target.value }
                        handleJsonFieldChange('social_media', updated)
                      }}
                      className={getInputClassName()}
                      placeholder="https://linkedin.com/company/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Facebook className="inline w-4 h-4 mr-1" />
                      Facebook
                    </label>
                    <input
                      type="url"
                      value={socialMedia.facebook || ''}
                      onChange={(e) => {
                        const updated = { ...socialMedia, facebook: e.target.value }
                        handleJsonFieldChange('social_media', updated)
                      }}
                      className={getInputClassName()}
                      placeholder="https://facebook.com/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Instagram className="inline w-4 h-4 mr-1" />
                      Instagram
                    </label>
                    <input
                      type="url"
                      value={socialMedia.instagram || ''}
                      onChange={(e) => {
                        const updated = { ...socialMedia, instagram: e.target.value }
                        handleJsonFieldChange('social_media', updated)
                      }}
                      className={getInputClassName()}
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                </div>
              </div>

              {/* Locations */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Locations / Service Areas
                </label>
                <div className="space-y-2">
                  {(business.locations || ['']).map((location: string, index: number) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => handleArrayFieldChange('locations', index, e.target.value)}
                        className={`flex-1 ${getInputClassName()}`}
                        placeholder="e.g., Sydney, Melbourne, Australia-wide"
                      />
                      {(business.locations?.length || 0) > 1 && (
                        <button
                          onClick={() => removeArrayItem('locations', index)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addArrayItem('locations')}
                    className="text-teal-600 hover:text-teal-700 text-sm font-medium transition-colors"
                  >
                    + Add Location
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Owner Profile */}
          {currentStep === 2 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Owner Profile</h2>
                <p className="text-gray-600 mt-1">Tell us about yourself and your ownership structure</p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm text-teal-900 leading-relaxed">
                  Understanding your background and ownership structure helps us provide personalized coaching.
                </p>
              </div>

              {/* Primary Owner Information */}
              <div className="border-b border-gray-200 pb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Primary Owner / Founder</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Owner/Founder Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ownerInfo.owner_name || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, owner_name: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                      placeholder="Enter your name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Ownership % <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={ownerInfo.ownership_percentage || ''}
                        onChange={(e) => {
                          const updated = { ...ownerInfo, ownership_percentage: parseFloat(e.target.value) || 0 }
                          handleJsonFieldChange('owner_info', updated)
                        }}
                        className={getInputClassName()}
                        min="0"
                        max="100"
                        placeholder="100"
                      />
                      <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={ownerInfo.date_of_birth || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, date_of_birth: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Total Years in Business (Any Business)
                    </label>
                    <input
                      type="number"
                      value={ownerInfo.total_years_business || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, total_years_business: parseInt(e.target.value) || 0 }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                      min="0"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Years in THIS Business
                    </label>
                    <input
                      type="number"
                      value={ownerInfo.years_this_business || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, years_this_business: parseInt(e.target.value) || 0 }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                      min="0"
                      placeholder="0"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Your Key Strengths/Expertise
                    </label>
                    <textarea
                      value={ownerInfo.key_expertise || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, key_expertise: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getTextareaClassName()}
                      rows={2}
                      placeholder="e.g., Sales, Operations, Technical expertise, Finance..."
                    />
                  </div>
                </div>
              </div>

              {/* Business Partners */}
              <div className="border-b border-gray-200 pb-8">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Business Partners</h3>
                    <p className="text-sm text-gray-600">Additional owners or partners in the business</p>
                  </div>
                </div>

                {partners.length === 0 ? (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-4">No business partners added yet</p>
                    <button
                      onClick={() => {
                        const updated = { 
                          ...ownerInfo, 
                          partners: [{ 
                            name: '', 
                            ownership_percentage: 0, 
                            role: '', 
                            involvement: '',
                            years_with_business: 0,
                            responsibilities: ''
                          }] 
                        }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                    >
                      + Add First Partner
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {partners.map((partner: any, index: number) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-medium text-gray-900">Partner {index + 1}</h4>
                          <button
                            onClick={() => {
                              const updatedPartners = partners.filter((_: any, i: number) => i !== index)
                              const updated = { ...ownerInfo, partners: updatedPartners }
                              handleJsonFieldChange('owner_info', updated)
                            }}
                            className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                          >
                            <X className="w-4 h-4" />
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Partner Name
                            </label>
                            <input
                              type="text"
                              value={partner.name || ''}
                              onChange={(e) => {
                                const updatedPartners = [...partners]
                                updatedPartners[index] = { ...partner, name: e.target.value }
                                const updated = { ...ownerInfo, partners: updatedPartners }
                                handleJsonFieldChange('owner_info', updated)
                              }}
                              className={getInputClassName()}
                              placeholder="Partner's name"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Ownership %
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                value={partner.ownership_percentage || ''}
                                onChange={(e) => {
                                  const updatedPartners = [...partners]
                                  updatedPartners[index] = { ...partner, ownership_percentage: parseFloat(e.target.value) || 0 }
                                  const updated = { ...ownerInfo, partners: updatedPartners }
                                  handleJsonFieldChange('owner_info', updated)
                                }}
                                className={getInputClassName()}
                                min="0"
                                max="100"
                                placeholder="0"
                              />
                              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">%</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Role/Title
                            </label>
                            <input
                              type="text"
                              value={partner.role || ''}
                              onChange={(e) => {
                                const updatedPartners = [...partners]
                                updatedPartners[index] = { ...partner, role: e.target.value }
                                const updated = { ...ownerInfo, partners: updatedPartners }
                                handleJsonFieldChange('owner_info', updated)
                              }}
                              className={getInputClassName()}
                              placeholder="e.g., Co-Founder, CFO"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Active Involvement
                            </label>
                            <select
                              value={partner.involvement || ''}
                              onChange={(e) => {
                                const updatedPartners = [...partners]
                                updatedPartners[index] = { ...partner, involvement: e.target.value }
                                const updated = { ...ownerInfo, partners: updatedPartners }
                                handleJsonFieldChange('owner_info', updated)
                              }}
                              className={getSelectClassName()}
                            >
                              <option value="">Select...</option>
                              <option value="Full-time active">Full-time active</option>
                              <option value="Part-time active">Part-time active</option>
                              <option value="Advisory only">Advisory only</option>
                              <option value="Silent partner">Silent partner</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Years with Business
                            </label>
                            <input
                              type="number"
                              value={partner.years_with_business || ''}
                              onChange={(e) => {
                                const updatedPartners = [...partners]
                                updatedPartners[index] = { ...partner, years_with_business: parseInt(e.target.value) || 0 }
                                const updated = { ...ownerInfo, partners: updatedPartners }
                                handleJsonFieldChange('owner_info', updated)
                              }}
                              className={getInputClassName()}
                              min="0"
                              placeholder="0"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Key Responsibilities
                            </label>
                            <textarea
                              value={partner.responsibilities || ''}
                              onChange={(e) => {
                                const updatedPartners = [...partners]
                                updatedPartners[index] = { ...partner, responsibilities: e.target.value }
                                const updated = { ...ownerInfo, partners: updatedPartners }
                                handleJsonFieldChange('owner_info', updated)
                              }}
                              className={getTextareaClassName()}
                              rows={2}
                              placeholder="What does this partner focus on?"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        const updatedPartners = [
                          ...partners,
                          { 
                            name: '', 
                            ownership_percentage: 0, 
                            role: '', 
                            involvement: '',
                            years_with_business: 0,
                            responsibilities: ''
                          }
                        ]
                        const updated = { ...ownerInfo, partners: updatedPartners }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600 transition-colors"
                    >
                      + Add Another Partner
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Step 3: Your Goals & Vision */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Your Goals & Vision</h2>
                <p className="text-gray-600 mt-1">What you want from your business and how you want to work</p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm text-teal-900 leading-relaxed">
                  Your goals drive our coaching recommendations. Be honest about what you want - there's no "right" answer.
                </p>
              </div>

              {/* Business Goals */}
              <div className="border-b border-gray-200 pb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">What You Want From This Business</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Primary Business Goal <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ownerInfo.primary_goal || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, primary_goal: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getSelectClassName()}
                    >
                      <option value="">Select your main goal...</option>
                      <option value="Build income & wealth">Build income & wealth</option>
                      <option value="Create freedom & lifestyle">Create freedom & lifestyle</option>
                      <option value="Make an impact">Make an impact</option>
                      <option value="Build to sell">Build to sell</option>
                      <option value="Create legacy">Create legacy</option>
                      <option value="Survive & stabilize">Survive & stabilize</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Time Horizon <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ownerInfo.time_horizon || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, time_horizon: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getSelectClassName()}
                    >
                      <option value="">How long do you plan to run this?</option>
                      <option value="1-2 years">1-2 years</option>
                      <option value="3-5 years">3-5 years</option>
                      <option value="5-10 years">5-10 years</option>
                      <option value="10+ years">10+ years</option>
                      <option value="Forever/retirement">Forever/until retirement</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Exit Strategy
                    </label>
                    <select
                      value={ownerInfo.exit_strategy || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, exit_strategy: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getSelectClassName()}
                    >
                      <option value="">What's your exit plan?</option>
                      <option value="Sell to third party">Sell to third party</option>
                      <option value="Pass to family">Pass to family</option>
                      <option value="Management buyout">Management buyout</option>
                      <option value="Run forever">No exit - run forever</option>
                      <option value="Haven't thought about it">Haven't thought about it</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Working Style */}
              <div className="border-b border-gray-200 pb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Your Working Style</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Current Hours Per Week <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={ownerInfo.current_hours || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, current_hours: parseInt(e.target.value) || 0 }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                      min="0"
                      placeholder="40"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Desired Hours Per Week
                    </label>
                    <input
                      type="number"
                      value={ownerInfo.desired_hours || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, desired_hours: parseInt(e.target.value) || 0 }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getInputClassName()}
                      min="0"
                      placeholder="30"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Desired Role in Business <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ownerInfo.desired_role || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, desired_role: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getSelectClassName()}
                    >
                      <option value="">Select...</option>
                      <option value="Working IN - doing the work">Working IN - doing the work</option>
                      <option value="Working ON - building systems">Working ON - building systems</option>
                      <option value="Mix of both">Mix of both</option>
                      <option value="Strategic only - minimal operations">Strategic only - minimal operations</option>
                      <option value="Want to step back completely">Want to step back completely</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      What You LOVE Doing
                    </label>
                    <textarea
                      value={ownerInfo.love_doing || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, love_doing: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getTextareaClassName()}
                      rows={2}
                      placeholder="What gives you energy?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      What You HATE Doing
                    </label>
                    <textarea
                      value={ownerInfo.hate_doing || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, hate_doing: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getTextareaClassName()}
                      rows={2}
                      placeholder="What drains your energy?"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Needs */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Personal Financial Needs</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Minimum Income Needed (Annual)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ownerInfo.minimum_income ? formatCurrency(ownerInfo.minimum_income) : ''}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9]/g, '')
                          const updated = { ...ownerInfo, minimum_income: numericValue ? parseFloat(numericValue) : 0 }
                          handleJsonFieldChange('owner_info', updated)
                        }}
                        className="w-full h-11 pl-8 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                        placeholder="100,000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Target Income Desired (Annual)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ownerInfo.target_income ? formatCurrency(ownerInfo.target_income) : ''}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9]/g, '')
                          const updated = { ...ownerInfo, target_income: numericValue ? parseFloat(numericValue) : 0 }
                          handleJsonFieldChange('owner_info', updated)
                        }}
                        className="w-full h-11 pl-8 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                        placeholder="250,000"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Risk Tolerance <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ownerInfo.risk_tolerance || ''}
                      onChange={(e) => {
                        const updated = { ...ownerInfo, risk_tolerance: e.target.value }
                        handleJsonFieldChange('owner_info', updated)
                      }}
                      className={getSelectClassName()}
                    >
                      <option value="">Select...</option>
                      <option value="Conservative - Minimize risk">Conservative - Minimize risk</option>
                      <option value="Moderate - Balanced approach">Moderate - Balanced approach</option>
                      <option value="Aggressive - High growth focus">Aggressive - High growth focus</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Financial Snapshot */}
          {currentStep === 4 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Financial Snapshot</h2>
                <p className="text-gray-600 mt-1">Last financial year numbers (or current year to date if that's more accurate)</p>
              </div>

              {/* Revenue Stage Indicator */}
              {business.annual_revenue && (
                <div className="bg-teal-600 rounded-lg p-6 text-white">
                  <div className="text-sm opacity-90">Revenue Stage</div>
                  <div className="text-2xl font-bold mt-1">{getRevenueStage(business.annual_revenue)}</div>
                </div>
              )}

              <div className="space-y-6">
                {/* Annual Revenue */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Annual Revenue (Last FY) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium pointer-events-none">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={business.annual_revenue ? formatCurrency(business.annual_revenue) : ''}
                      onChange={(e) => {
                        const numericValue = e.target.value.replace(/[^0-9]/g, '')
                        const revenue = numericValue ? parseFloat(numericValue) : 0
                        handleFieldChange('annual_revenue', revenue)
                        setValidationErrors(errors => errors.filter(e => e.field !== 'annual_revenue'))

                        // Recalculate margins if profits are set
                        if (business.gross_profit && revenue > 0) {
                          handleFieldChange('gross_profit_margin', (business.gross_profit / revenue) * 100)
                        }
                        if (business.net_profit && revenue > 0) {
                          handleFieldChange('net_profit_margin', (business.net_profit / revenue) * 100)
                        }
                      }}
                      className="w-full h-11 pl-8 pr-4 border rounded-lg focus:ring-2 focus:outline-none transition-colors border-gray-300 focus:border-teal-500 focus:ring-teal-100"
                      placeholder="0"
                    />
                  </div>
                  {hasFieldError('annual_revenue') && (
                    <p className="text-red-600 text-sm mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {getFieldError('annual_revenue')}
                    </p>
                  )}
                </div>

                {/* Gross Profit / Margin */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Gross Profit <span className="text-sm font-normal text-gray-600">(Enter $ or %, we'll calculate the other)</span></h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Gross Profit ($) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium pointer-events-none">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={business.gross_profit ? formatCurrency(business.gross_profit) : ''}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9]/g, '')
                            const grossProfit = numericValue ? parseFloat(numericValue) : 0
                            handleFieldChange('gross_profit', grossProfit)

                            // Auto-calculate margin if revenue exists
                            if (business.annual_revenue && business.annual_revenue > 0) {
                              handleFieldChange('gross_profit_margin', (grossProfit / business.annual_revenue) * 100)
                            }
                          }}
                          className="w-full h-11 pl-8 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Gross Margin (%) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={business.gross_profit_margin || ''}
                          onChange={(e) => {
                            const margin = parseFloat(e.target.value) || 0
                            handleFieldChange('gross_profit_margin', margin)

                            // Auto-calculate profit if revenue exists
                            if (business.annual_revenue && business.annual_revenue > 0) {
                              handleFieldChange('gross_profit', (business.annual_revenue * margin) / 100)
                            }
                          }}
                          className={getInputClassName()}
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Profit / Margin */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Net Profit <span className="text-sm font-normal text-gray-600">(Enter $ or %, we'll calculate the other)</span></h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Net Profit ($) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium pointer-events-none">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={business.net_profit ? formatCurrency(business.net_profit) : ''}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9-]/g, '')
                            const netProfit = numericValue ? parseFloat(numericValue) : 0
                            handleFieldChange('net_profit', netProfit)

                            // Auto-calculate margin if revenue exists
                            if (business.annual_revenue && business.annual_revenue > 0) {
                              handleFieldChange('net_profit_margin', (netProfit / business.annual_revenue) * 100)
                            }
                          }}
                          className="w-full h-11 pl-8 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Net Margin (%) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={business.net_profit_margin || ''}
                          onChange={(e) => {
                            const margin = parseFloat(e.target.value) || 0
                            handleFieldChange('net_profit_margin', margin)

                            // Auto-calculate profit if revenue exists
                            if (business.annual_revenue && business.annual_revenue > 0) {
                              handleFieldChange('net_profit', (business.annual_revenue * margin) / 100)
                            }
                          }}
                          className={getInputClassName()}
                          placeholder="0"
                          min="-100"
                          max="100"
                          step="0.1"
                        />
                        <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Margin Health Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Gross Margin Health</div>
                  <div className={`text-lg font-semibold ${
                    (business.gross_profit_margin || 0) >= 50 ? 'text-green-600' :
                    (business.gross_profit_margin || 0) >= 30 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {(business.gross_profit_margin || 0) >= 50 ? 'Excellent' :
                     (business.gross_profit_margin || 0) >= 30 ? 'Good' :
                     'Needs Improvement'}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Net Margin Health</div>
                  <div className={`text-lg font-semibold ${
                    (business.net_profit_margin || 0) >= 20 ? 'text-green-600' :
                    (business.net_profit_margin || 0) >= 10 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {(business.net_profit_margin || 0) >= 20 ? 'Excellent' :
                     (business.net_profit_margin || 0) >= 10 ? 'Good' :
                     'Needs Improvement'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Team & Organisation */}
          {currentStep === 5 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Team & Organisation</h2>
                <p className="text-gray-600 mt-1">Your team structure and key roles</p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm text-teal-900 leading-relaxed">
                  Understanding your team helps us identify capacity, delegation opportunities, and hiring needs.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Total Employees <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={business.employee_count || ''}
                    onChange={(e) => {
                      handleFieldChange('employee_count', parseInt(e.target.value) || 0)
                      setValidationErrors(errors => errors.filter(e => e.field !== 'employee_count'))
                    }}
                    className={getInputClassName('employee_count')}
                    min="0"
                    placeholder="0"
                  />
                  {hasFieldError('employee_count') && (
                    <p className="text-red-600 text-sm mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {getFieldError('employee_count')}
                    </p>
                  )}
                  {!hasFieldError('employee_count') && business.annual_revenue && business.employee_count && business.employee_count > 0 && (
                    <p className="text-sm text-gray-600 mt-1.5">
                      Revenue per employee: ${formatCurrency(Math.round(business.annual_revenue / business.employee_count))}
                    </p>
                  )}
                </div>
              </div>

              {/* Key Roles */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Key Team Members
                </label>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2 px-3">
                    <div className="text-xs font-semibold text-gray-600">Role</div>
                    <div className="text-xs font-semibold text-gray-600">Name</div>
                    <div className="text-xs font-semibold text-gray-600">Status</div>
                    <div className="w-8"></div>
                  </div>
                  <div className="space-y-2">
                    {((business.key_roles as any[] || []).length < 3
                      ? [...(business.key_roles as any[] || []), ...Array(3 - (business.key_roles as any[] || []).length).fill({ title: '', name: '', status: '' })]
                      : (business.key_roles as any[] || [])
                    ).map((role: any, index: number) => {
                      const actualRoles = business.key_roles as any[] || []
                      const isActualRole = index < actualRoles.length
                      const hasContent = role.title || role.name || role.status

                      return (
                        <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                            <input
                              type="text"
                              value={role.title || ''}
                              onChange={(e) => {
                                const roles = [...(business.key_roles as any[] || [])]
                                if (!roles[index]) roles[index] = { title: '', name: '', status: '' }
                                roles[index] = { ...roles[index], title: e.target.value }
                                handleJsonFieldChange('key_roles', roles)
                              }}
                              className="h-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                              placeholder="e.g., CEO, Sales Manager"
                            />
                            <input
                              type="text"
                              value={role.name || ''}
                              onChange={(e) => {
                                const roles = [...(business.key_roles as any[] || [])]
                                if (!roles[index]) roles[index] = { title: '', name: '', status: '' }
                                roles[index] = { ...roles[index], name: e.target.value }
                                handleJsonFieldChange('key_roles', roles)
                              }}
                              className="h-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors"
                              placeholder="Person's name"
                            />
                            <select
                              value={role.status || ''}
                              onChange={(e) => {
                                const roles = [...(business.key_roles as any[] || [])]
                                if (!roles[index]) roles[index] = { title: '', name: '', status: '' }
                                roles[index] = { ...roles[index], status: e.target.value }
                                handleJsonFieldChange('key_roles', roles)
                              }}
                              className="h-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-500 focus:outline-none transition-colors appearance-none bg-white cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236B7280%22%20d%3D%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[center_right_8px] bg-no-repeat"
                            >
                              <option value="">Select Status</option>
                              <option value="Full Time">Full Time</option>
                              <option value="Part Time">Part Time</option>
                              <option value="Casual">Casual</option>
                              <option value="Virtual Assistant">Virtual Assistant</option>
                            </select>
                            {isActualRole && hasContent && (
                              <button
                                onClick={() => {
                                  const roles = (business.key_roles as any[] || []).filter((_, i) => i !== index)
                                  handleJsonFieldChange('key_roles', roles.length > 0 ? roles : [])
                                }}
                                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete role"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {(!isActualRole || !hasContent) && (
                              <div className="w-8"></div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {(business.key_roles as any[] || []).length >= 3 && (
                    <button
                      onClick={() => {
                        const roles = [...(business.key_roles as any[] || []), { title: '', name: '', status: '' }]
                        handleJsonFieldChange('key_roles', roles)
                      }}
                      className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors"
                    >
                      + Add Another Role
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Current Situation */}
          {currentStep === 6 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Current Situation</h2>
                <p className="text-gray-600 mt-1">Your challenges and opportunities</p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm text-teal-900 leading-relaxed">
                  This provides critical context for AI recommendations. Be specific and honest about your challenges and opportunities.
                </p>
              </div>

              {/* Top Challenges */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  Top 3 Current Challenges
                </label>
                <div className="space-y-3">
                  {[0, 1, 2].map((index) => (
                    <div key={index}>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-semibold text-sm">
                          {index + 1}
                        </div>
                        <textarea
                          value={(business.top_challenges || [])[index] || ''}
                          onChange={(e) => {
                            const challenges = [...(business.top_challenges || ['', '', ''])]
                            challenges[index] = e.target.value
                            handleFieldChange('top_challenges', challenges)
                          }}
                          className={`flex-1 ${getTextareaClassName()}`}
                          rows={2}
                          placeholder={`Challenge ${index + 1}: Be specific about what's holding you back...`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Growth Opportunities */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  Top 3 Growth Opportunities
                </label>
                <div className="space-y-3">
                  {[0, 1, 2].map((index) => (
                    <div key={index}>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-semibold text-sm">
                          {index + 1}
                        </div>
                        <textarea
                          value={(business.growth_opportunities || [])[index] || ''}
                          onChange={(e) => {
                            const opportunities = [...(business.growth_opportunities || ['', '', ''])]
                            opportunities[index] = e.target.value
                            handleFieldChange('growth_opportunities', opportunities)
                          }}
                          className={`flex-1 ${getTextareaClassName()}`}
                          rows={2}
                          placeholder={`Opportunity ${index + 1}: What could accelerate your growth...`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Context */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Anything Else We Should Know?
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  Any other context, goals, constraints, or information that would help us support you better
                </p>
                <textarea
                  value={ownerInfo.additional_context || ''}
                  onChange={(e) => {
                    const updated = { ...ownerInfo, additional_context: e.target.value }
                    handleJsonFieldChange('owner_info', updated)
                  }}
                  className={getTextareaClassName()}
                  rows={4}
                  placeholder="Share any additional information that might be helpful for your coaching journey..."
                />
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                currentStep === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
              Previous
            </button>

            {currentStep < STEPS.length && (
              <button
                onClick={() => setCurrentStep(Math.min(STEPS.length, currentStep + 1))}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold transition-colors shadow-sm"
              >
                Next
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            {currentStep === STEPS.length && (
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold transition-colors shadow-sm"
              >
                Complete Profile
                <CheckCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}