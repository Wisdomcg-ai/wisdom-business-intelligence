'use client'

import { useState } from 'react'
import {
  Clock, DollarSign, ListChecks, Target,
  ChevronRight, ChevronLeft, Check, Loader2
} from 'lucide-react'
import { JargonTooltip } from '@/components/ui/Tooltip'
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
  const [currentStep, setCurrentStep] = useState(1)

  const {
    // Loading & Error
    isLoading,
    error,

    // Auto-save
    saveStatus,

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
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
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
    <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                <JargonTooltip term="stopDoing">Stop Doing List</JargonTooltip>
              </h1>
              <p className="text-gray-600 mt-1">
                Identify and eliminate low-value activities to reclaim your time
              </p>
            </div>

            {/* Save Status Indicator */}
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                saveStatus === 'saving' ? 'bg-gray-100 text-gray-600' :
                saveStatus === 'saved' ? 'bg-green-100 text-green-700' :
                'bg-red-100 text-red-700'
              }`}>
                {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                {saveStatus === 'saved' && <Check className="w-4 h-4" />}
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Error saving'}
              </div>
            )}
          </div>
        </div>

        {/* Step Navigation */}
        <div className="mb-8">
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
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
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => goToStep(step.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-teal-600 text-white'
                        : isCompleted
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-white/20' :
                      isCompleted ? 'bg-green-200' : 'bg-gray-200'
                    }`}>
                      {isCompleted && !isActive ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="text-left hidden md:block">
                      <p className="font-medium text-sm">{step.title}</p>
                      {step.optional && (
                        <p className="text-xs opacity-75">Optional</p>
                      )}
                    </div>
                    <span className="md:hidden font-medium text-sm">{step.shortTitle}</span>
                  </button>

                  {index < STEPS.length - 1 && (
                    <ChevronRight className="w-5 h-5 text-gray-300 mx-2 hidden sm:block" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
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
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevStep}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="text-sm text-gray-500">
            Step {currentStep} of {STEPS.length}
          </div>

          <button
            onClick={goToNextStep}
            disabled={currentStep === 4 || !canProceed()}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {currentStep === 4 ? 'Complete' : 'Next'}
            {currentStep < 4 && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Progress Summary (always visible at bottom) */}
        {stepCompletion.overallProgress > 0 && (
          <div className="mt-8 bg-gray-50 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm text-gray-500">{stepCompletion.overallProgress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all duration-500"
                style={{ width: `${stepCompletion.overallProgress}%` }}
              />
            </div>
          </div>
        )}
    </div>
  )
}
