'use client'

import { useState } from 'react'
import { HelpCircle, Book, Mail, MessageSquare, FileText, Search, ChevronDown, ChevronUp } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

interface FAQItem {
  question: string
  answer: string
  category: string
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null)

  const faqs: FAQItem[] = [
    {
      category: 'Getting Started',
      question: 'How do I get started with the platform?',
      answer: 'Start by completing your business profile in the Dashboard. Then, connect your Xero integration to sync financial data. Your coach will schedule sessions and create action items to guide your progress.'
    },
    {
      category: 'Getting Started',
      question: 'How do I connect Xero?',
      answer: 'Go to Integrations in the top menu, click "Connect Xero", and follow the OAuth flow to authorize access to your Xero account. Once connected, data will sync automatically every 24 hours.'
    },
    {
      category: 'Sessions',
      question: 'How do coaching sessions work?',
      answer: 'Your coach will schedule sessions with you. After each session, you\'ll receive action items and notes. You can view all past sessions in the Sessions tab.'
    },
    {
      category: 'Sessions',
      question: 'Can I reschedule a session?',
      answer: 'Contact your coach directly to reschedule sessions. You can message them through the Messages tab.'
    },
    {
      category: 'Features',
      question: 'What are action items?',
      answer: 'Action items are tasks created during coaching sessions. Track them in the Actions tab, mark them complete, and your coach will be notified of your progress.'
    },
    {
      category: 'Features',
      question: 'How do I upload documents?',
      answer: 'Go to the Documents tab and drag-and-drop files, or click to browse. Documents are organized by folders and can be downloaded anytime.'
    },
    {
      category: 'Analytics',
      question: 'What is the health score?',
      answer: 'Your health score is calculated based on session frequency, action completion rate, and recent activity. A score of 80+ is excellent, 60-79 is good, 40-59 needs attention, and below 40 requires immediate focus.'
    },
    {
      category: 'Account',
      question: 'How do I update my profile?',
      answer: 'Click your profile icon in the top right, select "Account Settings", and update your name, email, or password.'
    }
  ]

  const filteredFAQs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const categories = Array.from(new Set(faqs.map(faq => faq.category)))

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <PageHeader
          title="Help & Support"
          subtitle="Find answers and get support"
          icon={HelpCircle}
        />

        <div className="space-y-6">

          {/* Search */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm sm:text-base"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <a
              href="mailto:support@wisdombi.ai"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:border-brand-orange-400 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">Email Support</h3>
                  <p className="text-xs sm:text-sm text-gray-600">Get help via email</p>
                  <p className="text-xs text-brand-orange mt-2">support@wisdombi.ai</p>
                </div>
              </div>
            </a>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">Message Your Coach</h3>
                  <p className="text-xs sm:text-sm text-gray-600">Get personalized support</p>
                  <p className="text-xs text-gray-500 mt-2">Available in Messages tab</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <Book className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">Documentation</h3>
                  <p className="text-xs sm:text-sm text-gray-600">Feature guides & tutorials</p>
                  <p className="text-xs text-gray-500 mt-2">Coming soon</p>
                </div>
              </div>
            </div>
          </div>

          {/* FAQs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="w-5 h-5 text-brand-orange" />
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Frequently Asked Questions</h2>
            </div>

            {categories.map((category) => {
              const categoryFAQs = filteredFAQs.filter(faq => faq.category === category)
              if (categoryFAQs.length === 0) return null

              return (
                <div key={category} className="mb-6 last:mb-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {categoryFAQs.map((faq, index) => {
                      const globalIndex = faqs.indexOf(faq)
                      const isExpanded = expandedFAQ === globalIndex

                      return (
                        <div
                          key={globalIndex}
                          className="border border-gray-200 rounded-lg overflow-hidden"
                        >
                          <button
                            onClick={() => setExpandedFAQ(isExpanded ? null : globalIndex)}
                            className="w-full flex items-center justify-between p-3 sm:p-4 text-left hover:bg-gray-50 transition-colors"
                          >
                            <span className="font-medium text-gray-900 text-sm sm:text-base pr-2">{faq.question}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 text-xs sm:text-sm text-gray-600">
                              {faq.answer}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {filteredFAQs.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm sm:text-base text-gray-500">No results found. Try a different search term.</p>
              </div>
            )}
          </div>

          {/* Contact Section */}
          <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-brand-navy mb-2">Still need help?</h3>
            <p className="text-xs sm:text-sm text-brand-orange-700 mb-3">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <a
              href="mailto:support@wisdombi.ai"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
