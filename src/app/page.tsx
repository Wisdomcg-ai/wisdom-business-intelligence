'use client'

import Link from 'next/link'
import Image from 'next/image'
import { BarChart3, Target, CheckCircle2, Users, Zap, ArrowRight, TrendingUp, Calendar, MessageCircle } from 'lucide-react'

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
            <div className="flex items-center gap-4">
              <Link
                href="/auth/login"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/auth/login"
                className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Your Business Command Center
              <span className="block text-teal-600">From Vision to Weekly Execution</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Wisdom BI gives small business owners the structure to set clear goals, track what matters, and take action every week — with your coach by your side.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center px-8 py-4 bg-teal-600 text-white rounded-xl font-semibold text-lg hover:bg-teal-700 transition-colors gap-2"
              >
                Get Started <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Hero Screenshot */}
          <div className="relative max-w-6xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 rounded-2xl blur-3xl"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              <Image
                src="/Images/screenshot1.png"
                alt="Wisdom BI Dashboard - Your business command center"
                width={1200}
                height={675}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Value Prop Strip */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600">5</div>
              <div className="text-sm text-gray-600">Business Stages</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600">44</div>
              <div className="text-sm text-gray-600">Business Builds</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600">Weekly</div>
              <div className="text-sm text-gray-600">Review & Planning</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600">Direct</div>
              <div className="text-sm text-gray-600">Coach Access</div>
            </div>
          </div>
        </div>
      </section>

      {/* The Wisdom Roadmap Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                The Wisdom Roadmap
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Know exactly where you are — and what&apos;s next. Our 5-stage roadmap shows your current level and the specific &quot;builds&quot; to complete at each stage.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900">Foundation</span>
                    <span className="text-gray-600"> — $0-$500K: Clear offer, basic systems, first clients</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900">Traction</span>
                    <span className="text-gray-600"> — $500K-$1M: First hire, documented processes</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900">Growth</span>
                    <span className="text-gray-600"> — $1M-$5M: Sales team, predictable lead flow</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900">Scale</span>
                    <span className="text-gray-600"> — $5M-$10M: Leadership team, business runs without you</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900">Mastery</span>
                    <span className="text-gray-600"> — $10M+: Board chair role, generational wealth</span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 rounded-2xl blur-2xl"></div>
              <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <Image
                  src="/Images/screenshot2.png"
                  alt="The Wisdom Roadmap - Your stage-by-stage guide to business freedom"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Run Your Business
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From annual goals to weekly priorities — all connected, all in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Annual & 90-Day Goals</h3>
              <p className="text-gray-600">
                Set your annual targets, break them into quarterly rocks, and track progress with time-based indicators showing days remaining.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Business Dashboard</h3>
              <p className="text-gray-600">
                Track Revenue, Gross Profit, and Net Profit against quarterly targets. Enter weekly numbers and see immediately if you&apos;re on pace.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Financial Forecasting</h3>
              <p className="text-gray-600">
                Build a 12-month P&L forecast in 4 simple steps. Connect Xero to pull actuals automatically and compare forecast vs actual monthly.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Weekly Review</h3>
              <p className="text-gray-600">
                Structured weekly reflection: Wins, Challenges, Key Learnings. Review last week&apos;s goals, plan next week&apos;s priorities.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Coach Connection</h3>
              <p className="text-gray-600">
                Direct messaging with your coach built right in. No separate apps or emails. Get support when you need it.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Xero Integration</h3>
              <p className="text-gray-600">
                Connect your accounting software to automatically sync financial data. See real numbers, not guesswork.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Business Dashboard Screenshot */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 rounded-2xl blur-2xl"></div>
              <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <Image
                  src="/Images/screenshot6.png"
                  alt="Business Dashboard - Track your weekly progress against targets"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Track What Matters — Weekly
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Your Business Dashboard shows quarterly progress at a glance. Revenue, Gross Profit, Net Profit — all tracked against your targets with clear &quot;on pace&quot; or &quot;behind&quot; indicators.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">Q2 Progress with week-by-week tracking</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">Financial goals + core business metrics</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">Manage KPIs and update actuals in real-time</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Assess Your Business</h3>
              <p className="text-gray-600">
                Complete your Business Profile and our 54-question assessment. We&apos;ll identify your current stage and priority areas.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Set Your Goals</h3>
              <p className="text-gray-600">
                Define your annual targets, quarterly rocks, and weekly priorities. Build your financial forecast and one-page plan.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Execute Weekly</h3>
              <p className="text-gray-600">
                Track your numbers, complete weekly reviews, and stay connected with your coach. Take action every week.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Financial Forecast Screenshot */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Financial Forecasting Made Simple
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Build your 12-month forecast in 4 guided steps. Set revenue goals, allocate distribution, add costs, and review your projections. Connect Xero to automatically sync actuals.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">Step-by-step forecast wizard</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">Automatic Xero sync for actuals</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <span className="text-gray-700">P&L forecast with monthly breakdown</span>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 rounded-2xl blur-2xl"></div>
              <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <Image
                  src="/Images/screenshot4.png"
                  alt="Financial Forecast - Build your 12-month P&L forecast"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-teal-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Built by Coaches, for Coaches and Their Clients
          </h2>
          <p className="text-xl text-teal-100 mb-8">
            Wisdom BI was born from years of coaching small business owners. We saw the same challenges again and again: scattered data, unclear priorities, and no single source of truth. So we built one.
          </p>
          <p className="text-lg text-teal-100">
            This isn&apos;t just software — it&apos;s a complete business operating system that connects your vision to your weekly actions, with your coach alongside every step.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            Ready to Take Control of Your Business?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join business owners who use Wisdom BI to turn their goals into action — every single week.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-8 py-4 bg-teal-600 text-white rounded-xl font-semibold text-lg hover:bg-teal-700 transition-colors gap-2"
          >
            Get Started Today <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-xl font-bold text-white">W</span>
              </div>
              <span className="text-xl font-bold text-white">Wisdom BI</span>
            </div>
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Wisdom BI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
