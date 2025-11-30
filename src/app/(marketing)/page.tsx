'use client'

import Link from 'next/link'
import {
  BarChart3,
  Brain,
  Target,
  CheckCircle2,
  Users,
  Zap,
  ArrowRight,
  Play,
  Quote
} from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-xl font-bold text-white">W</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Wisdom BI</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#testimonials" className="text-gray-600 hover:text-gray-900 transition-colors">Testimonials</a>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/auth/login"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/auth/login"
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-white to-teal-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-100 text-teal-800 rounded-full text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              Business Intelligence for SMEs
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Business Intelligence That Turns Data Into Decisions —
              <span className="text-teal-600"> And Decisions Into Action.</span>
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-3xl mx-auto">
              Introducing <strong>Wisdom BI</strong> — the all-in-one intelligence platform that transforms raw numbers into clarity, strategy, and execution.
            </p>
            <p className="text-lg text-teal-600 font-semibold mb-10">
              WISDOM = Wisdom • Insights • Strategy • Decisions • Outcomes • Momentum
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/login"
                className="w-full sm:w-auto px-8 py-4 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all font-semibold text-lg shadow-lg shadow-teal-200 flex items-center justify-center gap-2"
              >
                Book a Demo
                <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold text-lg border border-gray-200 flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                See How It Works
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Strip */}
      <section className="py-8 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-lg md:text-xl">
            The only BI platform built for SMEs that doesn't stop at dashboards.
            <span className="text-teal-400 font-semibold"> Wisdom BI connects data → insights → strategy → execution</span> — all in one place.
          </p>
        </div>
      </section>

      {/* Key Benefits */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Run Smarter
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From data to decisions to done.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Benefit 1 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Real-Time Business Intelligence</h3>
              <p className="text-gray-600">
                Live dashboards, clear KPIs, and easy-to-read financial and operational insights.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <Brain className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Smart Insights Engine</h3>
              <p className="text-gray-600">
                Automatic interpretations, alerts, opportunities, and risk signals — no analyst required.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Strategy Builder</h3>
              <p className="text-gray-600">
                Turn insights into priorities, quarterly plans, and strategic focus areas fast.
              </p>
            </div>

            {/* Benefit 4 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <CheckCircle2 className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Execution & Accountability</h3>
              <p className="text-gray-600">
                Convert strategy into actions, KPIs, owners, and timelines — all inside the platform.
              </p>
            </div>

            {/* Benefit 5 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Coaching Layer</h3>
              <p className="text-gray-600">
                Integrates seamlessly with Wisdom Business Coaching for deeper support and guidance.
              </p>
            </div>

            {/* Benefit 6 */}
            <div className="p-8 rounded-2xl bg-white border border-gray-200 hover:border-teal-200 hover:shadow-lg transition-all">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Designed for SMEs</h3>
              <p className="text-gray-600">
                Built for simplicity, clarity, and fast implementation — no IT department needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Screenshots */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How Wisdom BI Works
            </h2>
            <p className="text-xl text-gray-600">
              Three simple steps to transform your business
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-12 h-12 bg-teal-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-6">1</div>
              <div className="h-48 bg-gradient-to-br from-teal-100 to-teal-50 rounded-xl mb-6 flex items-center justify-center">
                <BarChart3 className="w-20 h-20 text-teal-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Insights Dashboard</h3>
              <p className="text-gray-600">See your entire business health at a glance.</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-12 h-12 bg-teal-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-6">2</div>
              <div className="h-48 bg-gradient-to-br from-teal-100 to-teal-50 rounded-xl mb-6 flex items-center justify-center">
                <Target className="w-20 h-20 text-teal-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Strategy Engine</h3>
              <p className="text-gray-600">Turn insights into 90-day priorities with one click.</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-12 h-12 bg-teal-600 text-white rounded-full flex items-center justify-center text-xl font-bold mb-6">3</div>
              <div className="h-48 bg-gradient-to-br from-teal-100 to-teal-50 rounded-xl mb-6 flex items-center justify-center">
                <CheckCircle2 className="w-20 h-20 text-teal-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Execution Tracker</h3>
              <p className="text-gray-600">Assign, action, and track progress in real time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Trusted by Growing SMEs
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-gray-200">
              <Quote className="w-10 h-10 text-teal-200 mb-4" />
              <p className="text-gray-700 text-lg mb-6">
                "Wisdom BI helped us increase profit, remove bottlenecks, and execute our plan in record time."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                  <span className="text-teal-600 font-bold">JD</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">John Davies</p>
                  <p className="text-gray-500 text-sm">CEO, Construction Co</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-200">
              <Quote className="w-10 h-10 text-teal-200 mb-4" />
              <p className="text-gray-700 text-lg mb-6">
                "Finally, a BI tool that doesn't require a data scientist. We were up and running in a day."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                  <span className="text-teal-600 font-bold">SM</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Sarah Mitchell</p>
                  <p className="text-gray-500 text-sm">Founder, Retail Group</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-200">
              <Quote className="w-10 h-10 text-teal-200 mb-4" />
              <p className="text-gray-700 text-lg mb-6">
                "The coaching integration is a game changer. Strategy and execution finally connected."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                  <span className="text-teal-600 font-bold">MP</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Michael Park</p>
                  <p className="text-gray-500 text-sm">Director, Services Firm</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Built by Wisdom Consulting Group
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Trusted by growing SMEs across Australia.
          </p>
          <div className="text-lg text-gray-400 space-y-4">
            <p>
              After coaching and advising over 1,000 businesses, we saw the same gap —
              business owners were drowning in data but lacking clarity, focus, and execution.
            </p>
            <p>
              So we created <span className="text-teal-400 font-semibold">Wisdom BI</span>, the platform that closes the gap between:
            </p>
            <p className="text-2xl font-semibold text-white">
              data → insight → strategy → action
            </p>
            <p className="text-xl text-teal-400 mt-8">
              You don't just see the numbers. You finally know what to do with them.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-teal-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to build a business that runs on clarity, strategy, and execution?
          </h2>
          <p className="text-xl text-teal-100 mb-10">
            Get started with Wisdom BI today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/login"
              className="w-full sm:w-auto px-8 py-4 bg-white text-teal-600 rounded-xl hover:bg-gray-100 transition-all font-semibold text-lg flex items-center justify-center gap-2"
            >
              Book a Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="w-full sm:w-auto px-8 py-4 bg-teal-700 text-white rounded-xl hover:bg-teal-800 transition-all font-semibold text-lg border border-teal-500 flex items-center justify-center gap-2">
              <Play className="w-5 h-5" />
              Watch a Walkthrough
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold text-white">W</span>
              </div>
              <span className="font-semibold text-white">Wisdom BI</span>
            </div>
            <p className="text-sm">
              © 2025 Wisdom Consulting Group. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
