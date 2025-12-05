'use client'

import { useState } from 'react'
import { HelpCircle, Book, Mail, MessageSquare, FileText, Search, ChevronDown, ChevronUp } from 'lucide-react'

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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <HelpCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Help & Support</h1>
                <p className="text-teal-100 text-sm">Find answers and get support</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="mailto:support@wisdombi.ai"
            className="bg-white rounded-lg border border-gray-200 p-6 hover:border-teal-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <Mail className="w-6 h-6 text-teal-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Email Support</h3>
                <p className="text-sm text-gray-600">Get help via email</p>
                <p className="text-xs text-teal-600 mt-2">support@wisdombi.ai</p>
              </div>
            </div>
          </a>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-6 h-6 text-teal-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Message Your Coach</h3>
                <p className="text-sm text-gray-600">Get personalized support</p>
                <p className="text-xs text-gray-500 mt-2">Available in Messages tab</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-3">
              <Book className="w-6 h-6 text-teal-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Documentation</h3>
                <p className="text-sm text-gray-600">Feature guides & tutorials</p>
                <p className="text-xs text-gray-500 mt-2">Coming soon</p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <FileText className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Frequently Asked Questions</h2>
          </div>

          {categories.map((category) => {
            const categoryFAQs = filteredFAQs.filter(faq => faq.category === category)
            if (categoryFAQs.length === 0) return null

            return (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
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
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <span className="font-medium text-gray-900">{faq.question}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 text-sm text-gray-600">
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
              <p className="text-gray-500">No results found. Try a different search term.</p>
            </div>
          )}
        </div>

        {/* Contact Section */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-teal-900 mb-2">Still need help?</h3>
          <p className="text-sm text-teal-700 mb-3">
            Can't find what you're looking for? Our support team is here to help.
          </p>
          <a
            href="mailto:support@wisdombi.ai"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
        </div>
      </div>
    </div>
  )
}
