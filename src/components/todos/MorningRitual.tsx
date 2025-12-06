// /src/components/todos/MorningRitual.tsx
// 5-step morning planning ritual

import React, { useState } from 'react'
import type { SupabaseClient } from '@supabase/auth-helpers-nextjs'
import { Sun, Target, Coffee, Brain, Rocket, X } from 'lucide-react'

interface MorningRitualProps {
  userId: string
  businessId: string
  supabase: SupabaseClient
  onComplete: () => void
  onSkip: () => void
}

export function MorningRitual({ 
  userId, 
  businessId, 
  supabase, 
  onComplete, 
  onSkip 
}: MorningRitualProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [gratitude, setGratitude] = useState('')
  const [intention, setIntention] = useState('')
  const [biggestWin, setBiggestWin] = useState('')
  const [selectedMusts, setSelectedMusts] = useState<string[]>([])
  const [reflection, setReflection] = useState('')
  
  const steps = [
    {
      number: 1,
      title: 'Gratitude',
      icon: Sun,
      prompt: 'What are you grateful for today?',
      description: 'Start with appreciation to set a positive tone'
    },
    {
      number: 2,
      title: 'Intention',
      icon: Target,
      prompt: 'What is your intention for today?',
      description: 'Set your focus and energy direction'
    },
    {
      number: 3,
      title: 'Select Daily MUSTs',
      icon: Brain,
      prompt: 'Choose your 3 most important tasks',
      description: '1 TRUE MUST + 2 TOP PRIORITY tasks'
    },
    {
      number: 4,
      title: 'Visualize Success',
      icon: Rocket,
      prompt: 'What will your biggest win look like?',
      description: 'See yourself completing your MUSTs'
    },
    {
      number: 5,
      title: 'Commit',
      icon: Coffee,
      prompt: 'Make your commitment',
      description: 'Promise yourself to focus on what matters'
    }
  ]
  
  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }
  
  const handleComplete = async () => {
    try {
      // Save morning ritual data
      const ritualData = {
        business_id: businessId,
        user_id: userId,
        date: new Date().toISOString().split('T')[0],
        gratitude,
        intention,
        biggest_win: biggestWin,
        reflection,
        completed_at: new Date().toISOString()
      }
      
      // You can save this to a morning_rituals table if needed
      console.log('Morning ritual completed:', ritualData)
      
      onComplete()
    } catch (error) {
      console.error('Error saving morning ritual:', error)
    }
  }
  
  const CurrentStepIcon = steps[currentStep - 1].icon
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-navy to-brand-orange p-6 text-white rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Morning Ritual</h2>
              <p className="text-brand-orange-100">5 minutes to set up your perfect day</p>
            </div>
            <button
              onClick={onSkip}
              className="text-white hover:bg-white/20 rounded-lg p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between mb-2">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className={`flex-1 text-center text-xs ${
                    step.number <= currentStep ? 'text-white' : 'text-brand-orange-200'
                  }`}
                >
                  Step {step.number}
                </div>
              ))}
            </div>
            <div className="bg-brand-navy-800 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <CurrentStepIcon className="w-16 h-16 text-brand-navy mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              {steps[currentStep - 1].title}
            </h3>
            <p className="text-gray-600">
              {steps[currentStep - 1].description}
            </p>
          </div>
          
          {/* Step Content */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {steps[currentStep - 1].prompt}
            </label>
            
            {currentStep === 1 && (
              <textarea
                value={gratitude}
                onChange={(e) => setGratitude(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                rows={3}
                placeholder="I'm grateful for..."
              />
            )}
            
            {currentStep === 2 && (
              <textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                rows={3}
                placeholder="Today I intend to..."
              />
            )}
            
            {currentStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-3">
                  Select from your pending tasks or type new ones
                </p>
                <input
                  type="text"
                  placeholder="TRUE MUST - The ONE thing that must happen"
                  className="w-full p-3 border-2 border-yellow-400 rounded-lg focus:ring-2 focus:ring-yellow-500"
                />
                <input
                  type="text"
                  placeholder="TOP PRIORITY 1"
                  className="w-full p-3 border border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                />
                <input
                  type="text"
                  placeholder="TOP PRIORITY 2"
                  className="w-full p-3 border border-brand-orange-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                />
              </div>
            )}
            
            {currentStep === 4 && (
              <textarea
                value={biggestWin}
                onChange={(e) => setBiggestWin(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                rows={3}
                placeholder="When I complete my MUSTs today, I will feel..."
              />
            )}
            
            {currentStep === 5 && (
              <div className="bg-brand-navy-50 rounded-lg p-4">
                <p className="text-brand-navy-900 font-medium mb-3">Your Commitment:</p>
                <p className="text-gray-700 italic mb-3">
                  "I commit to focusing on my 3 MUSTs today. I will not let distractions
                  pull me away from what truly matters. Today, I choose progress over perfection."
                </p>
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange"
                  rows={2}
                  placeholder="Any additional thoughts or commitments..."
                />
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={onSkip}
              className="px-6 py-2 text-gray-600 hover:text-gray-800"
            >
              Skip for today
            </button>
            
            <div className="flex gap-3">
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Back
                </button>
              )}
              
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700"
              >
                {currentStep === 5 ? 'Complete Ritual' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}