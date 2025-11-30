'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, ArrowRight, MessageCircle, Users } from 'lucide-react'

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
              Business Intelligence That Turns Data Into Decisions
              <span className="block text-teal-600">— And Decisions Into Action</span>
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-3xl mx-auto">
              The all-in-one platform powered by the WISE Framework
            </p>
            <p className="text-lg text-teal-600 font-semibold mb-8">
              Wisdom • Insights • Strategy • Execution
            </p>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Transform your numbers into clarity, direction, and weekly action.
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
      <section className="py-12 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              From Data to Decisions to Done.
            </h2>
            <p className="text-gray-400">
              The only platform built for SMEs that connects data → insights → strategy → execution in one seamless system.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-400">5</div>
              <div className="text-sm text-gray-400">Business Stages</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-400">44</div>
              <div className="text-sm text-gray-400">Business Builds</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-400">Weekly</div>
              <div className="text-sm text-gray-400">Execution Rhythm</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-400">Direct</div>
              <div className="text-sm text-gray-400">Coach Connection</div>
            </div>
          </div>
        </div>
      </section>

      {/* The WISE Framework */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              The WISE Framework
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Four pillars that turn business complexity into clarity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Wisdom */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl font-bold text-white">W</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Wisdom</h3>
              <p className="text-sm text-teal-600 font-medium mb-3">Know where you are</p>
              <p className="text-gray-600">
                Complete your business assessment to identify your current stage and the specific builds to focus on.
              </p>
            </div>

            {/* Insights */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl font-bold text-white">I</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Insights</h3>
              <p className="text-sm text-teal-600 font-medium mb-3">See what matters</p>
              <p className="text-gray-600">
                Track Revenue, Profit, and KPIs weekly. Connect Xero for automatic financial data.
              </p>
            </div>

            {/* Strategy */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl font-bold text-white">S</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Strategy</h3>
              <p className="text-sm text-teal-600 font-medium mb-3">Plan with purpose</p>
              <p className="text-gray-600">
                Set annual goals, 90-day rocks, and weekly priorities. Build your financial forecast.
              </p>
            </div>

            {/* Execution */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl font-bold text-white">E</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Execution</h3>
              <p className="text-sm text-teal-600 font-medium mb-3">Take action every week</p>
              <p className="text-gray-600">
                Weekly reviews, accountability tracking, and direct coach connection.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Wisdom Roadmap Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Your Stage-by-Stage Guide to Business Freedom
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                The Wisdom Roadmap shows exactly where you are and what to build next — from $0 to $10M+.
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

      {/* Feature Showcase - 3 Screenshots */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need in One Platform
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From insights to strategy to execution — all connected.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Insights Dashboard */}
            <div className="group">
              <div className="relative mb-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm group-hover:shadow-lg transition-shadow">
                <Image
                  src="/Images/screenshot6.png"
                  alt="Business Dashboard - See your entire business health at a glance"
                  width={400}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Insights Dashboard</h3>
              <p className="text-gray-600">
                See your entire business health at a glance. Revenue, Gross Profit, Net Profit — tracked weekly against your targets.
              </p>
            </div>

            {/* Strategy & Goals */}
            <div className="group">
              <div className="relative mb-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm group-hover:shadow-lg transition-shadow">
                <Image
                  src="/Images/screenshot1.png"
                  alt="Strategy & Goals - Set annual targets and quarterly rocks"
                  width={400}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Strategy & Goals</h3>
              <p className="text-gray-600">
                Set annual targets, break them into quarterly rocks, and track progress with time-based indicators showing days remaining.
              </p>
            </div>

            {/* Financial Forecast */}
            <div className="group">
              <div className="relative mb-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm group-hover:shadow-lg transition-shadow">
                <Image
                  src="/Images/screenshot4.png"
                  alt="Financial Forecast - Build your 12-month P&L forecast"
                  width={400}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Financial Forecast</h3>
              <p className="text-gray-600">
                Build your 12-month P&L forecast in 4 guided steps. Connect Xero to sync actuals automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Get Started in Three Steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Assess</h3>
              <p className="text-gray-600">
                Complete your Business Profile and 54-question assessment. We&apos;ll identify your stage and priorities.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Plan</h3>
              <p className="text-gray-600">
                Set your annual goals, quarterly rocks, and financial forecast. Build your one-page plan.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Execute</h3>
              <p className="text-gray-600">
                Track your numbers weekly. Complete reviews. Stay connected with your coach.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Coach Connection Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-3xl p-8 md:p-12 lg:p-16">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <MessageCircle className="w-4 h-4" />
                  Built-In Coach Connection
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                  Your Coach, Right Inside the Platform
                </h2>
                <p className="text-xl text-teal-100 mb-6">
                  Wisdom BI isn&apos;t just software — it&apos;s a complete business operating system with your coach alongside every step.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-teal-100">
                    <CheckCircle2 className="w-5 h-5 text-teal-300" />
                    Direct messaging — no separate apps or emails
                  </li>
                  <li className="flex items-center gap-3 text-teal-100">
                    <CheckCircle2 className="w-5 h-5 text-teal-300" />
                    Session notes and action tracking
                  </li>
                  <li className="flex items-center gap-3 text-teal-100">
                    <CheckCircle2 className="w-5 h-5 text-teal-300" />
                    Weekly accountability and support
                  </li>
                </ul>
              </div>
              <div className="hidden lg:flex items-center justify-center">
                <div className="w-48 h-48 bg-white/10 rounded-full flex items-center justify-center">
                  <Users className="w-24 h-24 text-white/80" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Built by Wisdom Consulting Group
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            After coaching over 1,000 businesses, we saw the same pattern — owners drowning in data and ideas but lacking clarity, focus, and execution.
          </p>
          <p className="text-lg text-gray-400 mb-8">
            So we built Wisdom BI, powered by the WISE Framework, to close the gap between knowing and doing.
          </p>
          <p className="text-xl text-teal-400 font-semibold">
            You don&apos;t just see your numbers. You finally know what to do with them.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            Ready to Build a Business That Runs on Clarity?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join business owners who use Wisdom BI to turn goals into action — every single week.
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
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 border-t border-gray-800">
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
