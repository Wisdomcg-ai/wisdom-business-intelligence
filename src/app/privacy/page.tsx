'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
  const lastUpdated = 'November 30, 2024'

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold text-white">W</span>
              </div>
              <span className="font-semibold text-gray-900">Wisdom BI</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-500 mb-8">Last updated: {lastUpdated}</p>

          <div className="prose prose-lg prose-gray max-w-none">
            {/* Introduction */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 mb-4">
                Wisdom BI is operated by Wisdom Consulting Group (ABN 11 331 804 705), located at Suite 5, 12 Laycock Avenue, Cronulla NSW 2230, Australia.
              </p>
              <p className="text-gray-700 mb-4">
                We respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
              </p>
              <p className="text-gray-700">
                By using Wisdom BI, you consent to the data practices described in this policy. If you do not agree with the terms of this policy, please do not access or use our services.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.1 Information You Provide</h3>
              <p className="text-gray-700 mb-4">We collect information you voluntarily provide when using our platform:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li><strong>Account Information:</strong> Name, email address, password, and contact details when you create an account.</li>
                <li><strong>Business Profile:</strong> Business name, industry, number of employees, annual revenue, and other business details you provide during onboarding.</li>
                <li><strong>Assessment Data:</strong> Responses to our business assessment questionnaires.</li>
                <li><strong>Goals and Plans:</strong> Business goals, targets, strategic plans, and reviews you create within the platform.</li>
                <li><strong>Communications:</strong> Messages exchanged with your coach through our messaging feature.</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.2 Financial Data (via Xero Integration)</h3>
              <p className="text-gray-700 mb-4">
                If you connect your Xero account, we access financial data including revenue, expenses, profit and loss statements, and account balances. This data is used solely to provide financial insights and forecasting features within the platform. We do not store your Xero credentials — authentication is handled securely through Xero&apos;s OAuth system.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.3 Automatically Collected Information</h3>
              <p className="text-gray-700 mb-4">When you use our platform, we automatically collect:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Usage Data:</strong> Pages visited, features used, time spent on the platform, and interaction patterns.</li>
                <li><strong>Device Information:</strong> Browser type, operating system, device type, and screen resolution.</li>
                <li><strong>Log Data:</strong> IP address, access times, and referring URLs.</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">We use your information for the following purposes:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Provide Our Services:</strong> To deliver the features and functionality of Wisdom BI, including dashboards, assessments, goal tracking, and coaching tools.</li>
                <li><strong>Personalise Your Experience:</strong> To tailor content, recommendations, and insights based on your business profile and usage patterns.</li>
                <li><strong>Facilitate Coaching:</strong> To enable communication between you and your assigned business coach.</li>
                <li><strong>Generate Insights:</strong> To create financial forecasts, business assessments, and strategic recommendations.</li>
                <li><strong>Improve Our Platform:</strong> To analyse usage patterns, identify issues, and enhance our services.</li>
                <li><strong>Communicate With You:</strong> To send account notifications, updates, and (with your consent) marketing communications.</li>
                <li><strong>Ensure Security:</strong> To detect, prevent, and address technical issues and security threats.</li>
                <li><strong>Comply With Law:</strong> To meet legal obligations and respond to lawful requests.</li>
              </ul>
            </section>

            {/* Legal Basis */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Legal Basis for Processing</h2>
              <p className="text-gray-700 mb-4">We process your personal information based on the following legal grounds:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Contract:</strong> Processing is necessary to provide the services you&apos;ve requested.</li>
                <li><strong>Consent:</strong> You have given explicit consent for specific processing activities (e.g., marketing emails, Xero integration).</li>
                <li><strong>Legitimate Interests:</strong> Processing is necessary for our legitimate business interests, such as improving our services and ensuring platform security.</li>
                <li><strong>Legal Obligation:</strong> Processing is necessary to comply with applicable laws.</li>
              </ul>
            </section>

            {/* How We Share Your Information */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. How We Share Your Information</h2>
              <p className="text-gray-700 mb-4">We do not sell your personal information. We may share your data in the following circumstances:</p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.1 Service Providers</h3>
              <p className="text-gray-700 mb-4">We use trusted third-party services to operate our platform:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li><strong>Supabase:</strong> Database hosting and user authentication (data stored in secure cloud infrastructure).</li>
                <li><strong>Vercel:</strong> Website hosting and content delivery.</li>
                <li><strong>Xero:</strong> Accounting software integration (only when you choose to connect).</li>
                <li><strong>OpenAI:</strong> AI-powered features and insights generation.</li>
                <li><strong>Resend:</strong> Transactional email delivery.</li>
              </ul>
              <p className="text-gray-700 mb-4">
                These providers are contractually obligated to protect your data and may only use it to provide services to us.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.2 Your Business Coach</h3>
              <p className="text-gray-700 mb-4">
                If you are assigned a business coach through our platform, they will have access to your business profile, assessments, goals, and progress data to provide effective coaching services.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.3 Legal Requirements</h3>
              <p className="text-gray-700">
                We may disclose your information if required by law, court order, or government regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
              </p>
            </section>

            {/* Data Storage and Security */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Storage and Security</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.1 Where We Store Your Data</h3>
              <p className="text-gray-700 mb-4">
                Your data is stored on secure servers operated by our service providers. This may include servers located in the United States, European Union, and Australia. By using our platform, you consent to the transfer of your data to these locations.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.2 Security Measures</h3>
              <p className="text-gray-700 mb-4">We implement industry-standard security measures including:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                <li>Secure authentication with password hashing</li>
                <li>Role-based access controls</li>
                <li>Regular security audits and updates</li>
                <li>Secure OAuth integration for third-party connections</li>
              </ul>
              <p className="text-gray-700">
                While we take reasonable precautions, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security of your data.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.3 Data Retention</h3>
              <p className="text-gray-700">
                We retain your personal information for as long as your account is active or as needed to provide services. If you close your account, we will delete or anonymise your data within 90 days, unless we are required to retain it for legal, accounting, or compliance purposes.
              </p>
            </section>

            {/* Your Rights */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
              <p className="text-gray-700 mb-4">Under the Australian Privacy Act 1988 and applicable privacy laws, you have the following rights:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal obligations).</li>
                <li><strong>Data Portability:</strong> Request a copy of your data in a structured, machine-readable format.</li>
                <li><strong>Withdraw Consent:</strong> Withdraw consent for processing where consent is the legal basis.</li>
                <li><strong>Object:</strong> Object to processing based on legitimate interests.</li>
                <li><strong>Restrict Processing:</strong> Request restriction of processing in certain circumstances.</li>
              </ul>
              <p className="text-gray-700">
                To exercise any of these rights, please contact us at <a href="mailto:info@wisdombi.ai" className="text-teal-600 hover:underline">info@wisdombi.ai</a>. We will respond to your request within 30 days.
              </p>
            </section>

            {/* Cookies */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Cookies and Tracking</h2>
              <p className="text-gray-700 mb-4">We use cookies and similar technologies to:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li><strong>Essential Cookies:</strong> Enable core functionality like user authentication and session management.</li>
                <li><strong>Analytics Cookies:</strong> Understand how users interact with our platform to improve our services.</li>
                <li><strong>Preference Cookies:</strong> Remember your settings and preferences.</li>
              </ul>
              <p className="text-gray-700">
                You can control cookies through your browser settings. Note that disabling certain cookies may affect platform functionality.
              </p>
            </section>

            {/* Children's Privacy */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Children&apos;s Privacy</h2>
              <p className="text-gray-700">
                Wisdom BI is a business platform intended for users aged 18 and over. We do not knowingly collect personal information from children under 18. If we become aware that we have collected data from a child under 18, we will take steps to delete that information promptly.
              </p>
            </section>

            {/* Changes to This Policy */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Changes to This Policy</h2>
              <p className="text-gray-700">
                We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the &quot;Last updated&quot; date. For material changes, we will also send you an email notification. We encourage you to review this policy periodically.
              </p>
            </section>

            {/* Contact Us */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <p className="text-gray-700 mb-2"><strong>Wisdom Consulting Group</strong></p>
                <p className="text-gray-700 mb-2">ABN: 11 331 804 705</p>
                <p className="text-gray-700 mb-2">Suite 5, 12 Laycock Avenue</p>
                <p className="text-gray-700 mb-2">Cronulla NSW 2230, Australia</p>
                <p className="text-gray-700 mb-2">Email: <a href="mailto:info@wisdombi.ai" className="text-teal-600 hover:underline">info@wisdombi.ai</a></p>
                <p className="text-gray-700">Phone: 02 8526 9181</p>
              </div>
            </section>

            {/* Complaints */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Complaints</h2>
              <p className="text-gray-700 mb-4">
                If you believe we have breached the Australian Privacy Principles or your privacy rights, you may lodge a complaint with us. We will investigate and respond within 30 days.
              </p>
              <p className="text-gray-700">
                If you are not satisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">www.oaic.gov.au</a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 border-t border-gray-100">
        <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Wisdom BI. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
