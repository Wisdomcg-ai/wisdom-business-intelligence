'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, DollarSign, ListChecks, Target,
  ChevronRight, ChevronLeft, Check, Loader2, Ban, CheckCircle
} from 'lucide-react'
import { JargonTooltip } from '@/components/ui/Tooltip'
import PageHeader from '@/components/ui/PageHeader'
import type { SaveStatus } from '@/hooks/useAutoSave'
import { useStopDoingList } from './hooks/useStopDoingList'
import Step1TimeLog from './components/Step1TimeLog'
import Step2HourlyRate from './components/Step2HourlyRate'
import Step3Wizard from './components/Step3Wizard'
import Step4ActionPlan from './components/Step5ActionPlan'

const STEPS = [
  {
    id: 1,
    title: 'Time Log',
    shortTitle: 'Time',
    description: 'Track how you spend your time',
    icon: Clock,
    optional: true
  },
  {
    id: 2,
    title: 'Hourly Rate',
    shortTitle: 'Rate',
    description: 'Calculate your true hourly rate',
    icon: DollarSign,
    optional: false
  },
  {
    id: 3,
    title: 'Activities & Analysis',
    shortTitle: 'Activities',
    description: 'List activities and identify what to stop',
    icon: ListChecks,
    optional: false
  },
  {
    id: 4,
    title: 'Stop Doing List',
    shortTitle: 'Stop List',
    description: 'Your commitment to stop',
    icon: Target,
    optional: false
  }
]

export default function StopDoingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)

  const {
    // Loading & Error
    isLoading,
    error,

    // Auto-save
    saveStatus,
    lastSaved,

    // Step 1: Time Logs
    timeLogs,
    currentTimeLog,
    currentWeekStart,
    changeWeek,
    updateTimeLogEntry,
    markTimeLogComplete,
    getMondayOfWeek,

    // Step 2: Hourly Rate
    targetAnnualIncome,
    setTargetAnnualIncome,
    workingWeeksPerYear,
    setWorkingWeeksPerYear,
    hoursPerWeek,
    setHoursPerWeek,
    calculatedHourlyRate,
    saveHourlyRate,

    // Step 3: Activities
    activities,
    addActivity,
    updateActivity,
    deleteActivity,
    hasTimeLogData,
    getTimeLogSummary,
    importActivitiesFromTimeLog,

    // Step 4 & 5: Stop Doing Items
    stopDoingItems,
    createStopDoingItemFromActivity,
    updateStopDoingItem,
    deleteStopDoingItem,
    updateStopDoingItemStatus,

    // Summary
    getTotalMonthlyHoursFreed,
    getTotalMonthlySavings,
    getCompletedCount,
    getInProgressCount,

    // Step completion
    stepCompletion
  } = useStopDoingList()

  // Navigation
  const goToStep = (step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step)
    }
  }

  const goToNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const goToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Skip time log step
  const skipTimeLog = () => {
    setCurrentStep(2)
  }

  // Check if can proceed to next step
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true // Time log is optional
      case 2:
        return calculatedHourlyRate > 0
      case 3:
        return activities.length >= 1
      case 4:
        return true
      default:
        return true
    }
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
          <p className="text-gray-600">Loading your Stop Doing List...</p>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading data</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Stop Doing List"
        subtitle="Identify and eliminate low-value activities to reclaim your time"
        icon={Ban}
        saveIndicator={{
          status: saveStatus as SaveStatus,
          lastSaved
        }}
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Step Navigation */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6 gap-4 overflow-x-auto">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id || (
                step.id === 1 ? stepCompletion.step1Complete :
                step.id === 2 ? stepCompletion.step2Complete :
                step.id === 3 ? (stepCompletion.step3Complete && stepCompletion.step4Complete) :
                stepCompletion.step5Complete
              )

              return (
                <div key={step.id} className="flex items-center w-full sm:w-auto">
                  <button
                    onClick={() => goToStep(step.id)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors flex-1 sm:flex-initial ${
                      isActive
                        ? 'bg-brand-orange text-white'
                        : isCompleted
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'bg-white/20' :
                      isCompleted ? 'bg-green-200' : 'bg-gray-200'
                    }`}>
                      {isCompleted && !isActive ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="text-left hidden lg:block">
                      <p className="font-medium text-sm">{step.title}</p>
                      {step.optional && (
                        <p className="text-xs opacity-75">Optional</p>
                      )}
                    </div>
                    <span className="lg:hidden font-medium text-sm truncate">{step.shortTitle}</span>
                  </button>

                  {index < STEPS.length - 1 && (
                    <ChevronRight className="w-5 h-5 text-gray-300 mx-2 hidden sm:block flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6 mb-6">
          {currentStep === 1 && (
            <Step1TimeLog
              onSkipStep={skipTimeLog}
              currentTimeLog={currentTimeLog}
              currentWeekStart={currentWeekStart}
              timeLogs={timeLogs}
              onWeekChange={changeWeek}
              onUpdateEntry={updateTimeLogEntry}
              onMarkComplete={markTimeLogComplete}
              getMondayOfWeek={getMondayOfWeek}
              saveStatus={saveStatus}
            />
          )}

          {currentStep === 2 && (
            <Step2HourlyRate
              targetAnnualIncome={targetAnnualIncome}
              workingWeeksPerYear={workingWeeksPerYear}
              hoursPerWeek={hoursPerWeek}
              calculatedHourlyRate={calculatedHourlyRate}
              onTargetIncomeChange={setTargetAnnualIncome}
              onWorkingWeeksChange={setWorkingWeeksPerYear}
              onHoursPerWeekChange={setHoursPerWeek}
              onSave={saveHourlyRate}
              isSaving={saveStatus === 'saving'}
            />
          )}

          {currentStep === 3 && (
            <Step3Wizard
              activities={activities}
              onAddActivity={addActivity}
              onUpdateActivity={updateActivity}
              onDeleteActivity={deleteActivity}
              hasTimeLogData={hasTimeLogData}
              getTimeLogSummary={getTimeLogSummary}
              onImportFromTimeLog={importActivitiesFromTimeLog}
              stopDoingItems={stopDoingItems}
              calculatedHourlyRate={calculatedHourlyRate}
              onSelectActivity={createStopDoingItemFromActivity}
            />
          )}

          {currentStep === 4 && (
            <Step4ActionPlan
              stopDoingItems={stopDoingItems}
              calculatedHourlyRate={calculatedHourlyRate}
              onUpdateItem={updateStopDoingItem}
              onDeleteItem={deleteStopDoingItem}
              onUpdateStatus={updateStopDoingItemStatus}
              getTotalMonthlyHoursFreed={getTotalMonthlyHoursFreed}
              getTotalMonthlySavings={getTotalMonthlySavings}
              getCompletedCount={getCompletedCount}
              getInProgressCount={getInProgressCount}
            />
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={goToPrevStep}
            disabled={currentStep === 1}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm sm:text-base">Previous</span>
          </button>

          <div className="text-sm text-gray-500 order-first sm:order-none">
            Step {currentStep} of {STEPS.length}
          </div>

          {currentStep === 4 ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm sm:text-base">Complete</span>
            </button>
          ) : (
            <button
              onClick={goToNextStep}
              disabled={!canProceed()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-sm sm:text-base">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress Summary (always visible at bottom) */}
        {stepCompletion.overallProgress > 0 && (
          <div className="mt-6 rounded-xl shadow-sm border border-gray-200 bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm text-gray-500">{stepCompletion.overallProgress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-orange transition-all duration-500"
                style={{ width: `${stepCompletion.overallProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
