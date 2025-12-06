'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation - Large prominent header like EOS One */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-36 lg:h-44">
            {/* Large Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/images/logo-tight.png"
                alt="WisdomBi"
                width={550}
                height={300}
                className="h-28 lg:h-36 w-auto"
                priority
              />
            </Link>

            {/* Nav + CTAs */}
            <div className="flex items-center gap-8">
              <nav className="hidden lg:flex items-center gap-8">
                <Link href="#platform" className="text-gray-600 hover:text-gray-900 font-medium">
                  Platform
                </Link>
                <Link href="#framework" className="text-gray-600 hover:text-gray-900 font-medium">
                  WISE Framework
                </Link>
                <Link href="#features" className="text-gray-600 hover:text-gray-900 font-medium">
                  Features
                </Link>
              </nav>
              <div className="flex items-center gap-4">
                <Link
                  href="/auth/login"
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Login
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center px-6 py-2.5 bg-brand-navy text-white font-semibold rounded-lg hover:bg-brand-navy-800 transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-44 lg:pt-56 pb-16 lg:pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Copy */}
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
                Turn Data Into Decisions — And Decisions Into Action
              </h1>

              <p className="mt-8 text-xl text-gray-600 leading-relaxed max-w-xl">
                The all-in-one platform for SME owners and their coaches. Track your numbers, set your priorities, and execute weekly with the WISE Framework.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-brand-orange text-white text-lg font-semibold rounded-lg hover:bg-brand-orange-600 transition-colors shadow-lg shadow-brand-orange-200"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <button className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-gray-700 text-lg font-semibold rounded-lg border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                  <Play className="w-5 h-5" />
                  Watch Demo
                </button>
              </div>

              <div className="mt-10 flex items-center gap-8 text-sm text-gray-500">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-brand-orange" />
                  14-day free trial
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-brand-orange" />
                  No credit card required
                </span>
              </div>
            </div>

            {/* Right - Product Screenshot */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <Image
                  src="/images/screenshot1.png"
                  alt="WisdomBi Platform"
                  width={800}
                  height={500}
                  className="w-full"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-gray-900">1,000+</div>
              <div className="text-gray-500 mt-1">Businesses Coached</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">5</div>
              <div className="text-gray-500 mt-1">Business Stages</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">44</div>
              <div className="text-gray-500 mt-1">Business Builds</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-900">Weekly</div>
              <div className="text-gray-500 mt-1">Execution Rhythm</div>
            </div>
          </div>
        </div>
      </section>

      {/* WISE Framework */}
      <section className="py-24 lg:py-32" id="framework">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl lg:text-5xl font-bold text-gray-900 tracking-tight">
              The WISE Framework
            </h2>
            <p className="mt-6 text-xl text-gray-600">
              Four pillars that turn business complexity into clarity and action.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { letter: 'W', title: 'Wisdom', desc: 'Know where you are. Complete your business assessment to identify your current stage and focus areas.' },
              { letter: 'I', title: 'Insights', desc: 'See what matters. Track Revenue, Profit, and KPIs weekly. Connect Xero for automatic data.' },
              { letter: 'S', title: 'Strategy', desc: 'Plan with purpose. Set annual goals, quarterly rocks, and build your financial forecast.' },
              { letter: 'E', title: 'Execution', desc: 'Take action every week. Weekly reviews, accountability, and direct coach connection.' }
            ].map((item, i) => (
              <div key={i} className="text-center p-8">
                <div className="w-20 h-20 bg-brand-navy rounded-2xl flex items-center justify-center text-3xl font-bold text-white mx-auto">
                  {item.letter}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mt-6">{item.title}</h3>
                <p className="text-gray-600 mt-4 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="py-24 lg:py-32 bg-gray-50" id="platform">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl lg:text-5xl font-bold text-gray-900 tracking-tight">
              Everything You Need to Run Your Business
            </h2>
            <p className="mt-6 text-xl text-gray-600">
              One platform. Complete visibility. Weekly accountability.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { title: 'Financial Dashboard', desc: 'Revenue, Gross Profit, Net Profit — tracked weekly against your targets with Xero integration.' },
              { title: 'Goals & Rocks', desc: 'Set annual goals, break them into quarterly rocks, and track progress in real-time.' },
              { title: 'Weekly Reviews', desc: 'Structured weekly check-ins that keep you focused and accountable.' },
              { title: 'KPI Tracking', desc: 'Monitor the metrics that matter most to your business stage.' },
              { title: 'Coach Connection', desc: 'Direct messaging, session notes, and action items — all in one place.' },
              { title: 'Business Roadmap', desc: '44 builds across 5 stages. Always know what to focus on next.' }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-xl border border-gray-200 hover:shadow-lg transition-shadow">
                <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                <p className="text-gray-600 mt-3 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Highlight */}
      <section className="py-24 lg:py-32" id="features">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-5xl font-bold text-gray-900 tracking-tight">
                Your Entire Business at a Glance
              </h2>
              <p className="mt-6 text-xl text-gray-600 leading-relaxed">
                Stop logging into 5 different tools. See revenue, profit, KPIs, and progress toward your goals — all on one screen, updated weekly.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  'Real-time financial tracking',
                  'Progress toward annual targets',
                  'KPI performance indicators',
                  'Automatic Xero integration'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-700">
                    <CheckCircle2 className="w-6 h-6 text-brand-orange flex-shrink-0" />
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/login"
                className="mt-10 inline-flex items-center gap-2 px-8 py-4 bg-brand-navy text-white font-semibold rounded-lg hover:bg-brand-navy-800 transition-colors"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            <div>
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <Image
                  src="/images/screenshot6.png"
                  alt="WisdomBi Dashboard"
                  width={700}
                  height={500}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-24 lg:py-32 bg-brand-navy">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <blockquote className="text-2xl lg:text-3xl text-white font-medium leading-relaxed">
            "After coaching over 1,000 businesses, we saw the same pattern — owners drowning in data and ideas but lacking clarity, focus, and execution. WisdomBi closes the gap between knowing and doing."
          </blockquote>
          <p className="mt-8 text-gray-300">
            — Wisdom Consulting Group
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 lg:py-32">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-gray-900 tracking-tight">
            Ready to Build a Business That Runs on Clarity?
          </h2>
          <p className="mt-6 text-xl text-gray-600">
            Join business owners who use WisdomBi to turn goals into action — every single week.
          </p>
          <Link
            href="/auth/login"
            className="mt-10 inline-flex items-center gap-2 px-10 py-5 bg-brand-orange text-white text-lg font-semibold rounded-lg hover:bg-brand-orange-600 transition-colors shadow-lg shadow-brand-orange-200"
          >
            Start Your Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-6 text-gray-500">
            No credit card required. 14-day free trial.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Image
              src="/images/logo-tight.png"
              alt="WisdomBi"
              width={550}
              height={300}
              className="h-20 w-auto"
            />
            <div className="flex items-center gap-8 text-gray-500">
              <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
            </div>
            <p className="text-gray-400">
              © {new Date().getFullYear()} WisdomBi. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
