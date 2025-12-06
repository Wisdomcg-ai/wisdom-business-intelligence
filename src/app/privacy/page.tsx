'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
  const lastUpdated = '5 December 2024'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-brand-orange hover:text-brand-orange-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 mb-4">
                Envisage Australia Pty Ltd ATF Malouf Family Trust (ABN 11 331 804 705) trading as Wisdom Coaching
                (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your privacy and complying with the
                Australian Privacy Principles (&quot;APPs&quot;) contained in the <em>Privacy Act 1988</em> (Cth).
              </p>
              <p className="text-gray-700 mb-4">
                This Privacy Policy describes how we collect, use, disclose, and protect your personal information
                when you use our business coaching platform and related services (the &quot;Platform&quot;).
              </p>
              <p className="text-gray-700">
                By using the Platform, you consent to the collection and use of your information as described in this policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">2.1 Personal Information</h3>
              <p className="text-gray-700 mb-4">We may collect the following types of personal information:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Name, email address, phone number, and business address</li>
                <li>Business name, ABN, and role within your organisation</li>
                <li>Account credentials (username and encrypted password)</li>
                <li>Payment and billing information (processed securely via Stripe)</li>
                <li>Business performance data, goals, and coaching session notes</li>
                <li>Financial data you choose to integrate from Xero</li>
                <li>Communications between you and your coach</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">2.2 Automatically Collected Information</h3>
              <p className="text-gray-700 mb-4">When you use our Platform, we automatically collect:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Device information (browser type, operating system)</li>
                <li>IP address and general location data</li>
                <li>Usage data (pages visited, features used, time spent)</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">2.3 Sensitive Information</h3>
              <p className="text-gray-700">
                We do not intentionally collect sensitive information as defined under the Privacy Act 1988.
                If you provide sensitive information to us (such as health information relevant to your
                business performance), we will only use it for the purpose for which it was provided and
                with your explicit consent.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">We use your personal information to:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Provide and improve our coaching platform and services</li>
                <li>Create and manage your account</li>
                <li>Facilitate coaching sessions and track your business progress</li>
                <li>Process payments and manage subscriptions via Stripe</li>
                <li>Integrate with third-party services at your request (e.g., Xero)</li>
                <li>Send you service-related communications and updates</li>
                <li>Analyse usage patterns to improve user experience</li>
                <li>Comply with legal obligations and resolve disputes</li>
                <li>Protect against fraud and unauthorised access</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. How We Share Your Information</h2>
              <p className="text-gray-700 mb-4">We may share your personal information with:</p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.1 Your Business Coach</h3>
              <p className="text-gray-700 mb-4">
                Your assigned coach will have access to your business data, goals, session notes, and
                performance metrics to provide effective coaching services.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.2 Service Providers</h3>
              <p className="text-gray-700 mb-4">We use trusted third-party service providers including:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li><strong>Supabase</strong> - Database hosting and authentication (data stored in Australia/Singapore)</li>
                <li><strong>Stripe</strong> - Payment processing (PCI-DSS compliant)</li>
                <li><strong>Xero</strong> - Accounting integration (only when you authorise connection)</li>
                <li><strong>Vercel</strong> - Application hosting</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.3 Legal Requirements</h3>
              <p className="text-gray-700">
                We may disclose your information if required by law, court order, or government authority,
                or to protect our rights, property, or safety, or that of our users or the public.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement appropriate technical and organisational measures to protect your personal
                information, including:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                <li>Secure authentication with password hashing</li>
                <li>Role-based access controls</li>
                <li>Regular security assessments and updates</li>
                <li>Secure cloud infrastructure with reputable providers</li>
              </ul>
              <p className="text-gray-700">
                While we take reasonable steps to protect your information, no method of transmission
                over the Internet is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain your personal information for as long as necessary to provide our services
                and comply with legal obligations. Specifically:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Account data is retained while your account is active</li>
                <li>Coaching records and session notes are retained for 7 years after your last session</li>
                <li>Financial records are retained as required by Australian tax law (minimum 5 years)</li>
                <li>You may request deletion of your data at any time (subject to legal retention requirements)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Your Rights</h2>
              <p className="text-gray-700 mb-4">Under Australian privacy law, you have the right to:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li><strong>Access</strong> - Request a copy of the personal information we hold about you</li>
                <li><strong>Correction</strong> - Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion</strong> - Request deletion of your personal information (subject to legal requirements)</li>
                <li><strong>Portability</strong> - Request your data in a portable format</li>
                <li><strong>Withdraw consent</strong> - Withdraw consent for specific processing activities</li>
                <li><strong>Complaint</strong> - Lodge a complaint with the Office of the Australian Information Commissioner (OAIC)</li>
              </ul>
              <p className="text-gray-700">
                To exercise these rights, please contact us using the details below.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Cookies and Tracking</h2>
              <p className="text-gray-700 mb-4">
                We use cookies and similar technologies to enhance your experience. These include:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li><strong>Essential cookies</strong> - Required for the Platform to function (authentication, security)</li>
                <li><strong>Analytics cookies</strong> - Help us understand how users interact with the Platform</li>
                <li><strong>Preference cookies</strong> - Remember your settings and preferences</li>
              </ul>
              <p className="text-gray-700">
                You can control cookies through your browser settings. Disabling certain cookies may
                affect Platform functionality.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Third-Party Integrations</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">9.1 Xero Integration</h3>
              <p className="text-gray-700 mb-4">
                If you choose to connect your Xero account, we will access financial data including
                profit and loss reports, balance sheets, and account information. This data is used
                solely to provide coaching insights and is subject to Xero&apos;s own privacy policy.
                You can disconnect Xero at any time through your account settings.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">9.2 Stripe Payments</h3>
              <p className="text-gray-700">
                Payment information is processed directly by Stripe and is subject to Stripe&apos;s
                privacy policy. We do not store your full credit card details on our servers.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Cross-Border Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your data may be transferred to and processed in countries outside Australia where our
                service providers are located. We ensure that any such transfers comply with the APPs
                and that appropriate safeguards are in place. Our primary service providers maintain
                data centres in Australia, Singapore, and the United States.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Children&apos;s Privacy</h2>
              <p className="text-gray-700">
                Our Platform is not intended for individuals under 18 years of age. We do not knowingly
                collect personal information from children. If we become aware that we have collected
                personal information from a child, we will take steps to delete such information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Changes to This Policy</h2>
              <p className="text-gray-700">
                We may update this Privacy Policy from time to time. We will notify you of any material
                changes by posting the new policy on the Platform and updating the &quot;Last updated&quot; date.
                We encourage you to review this policy periodically.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this Privacy Policy or wish to exercise your rights,
                please contact us:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-700">
                <p className="font-medium">Envisage Australia Pty Ltd ATF Malouf Family Trust</p>
                <p>Trading as Wisdom Coaching</p>
                <p>ABN: 11 331 804 705</p>
                <p className="mt-2">Email: support@wisdombi.ai</p>
              </div>
              <p className="text-gray-700 mt-4">
                If you are not satisfied with our response, you may lodge a complaint with the
                Office of the Australian Information Commissioner (OAIC) at{' '}
                <a
                  href="https://www.oaic.gov.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:text-brand-orange-700 underline"
                >
                  www.oaic.gov.au
                </a>.
              </p>
            </section>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <Link href="/terms" className="text-brand-orange hover:text-brand-orange-700">
            View Terms and Conditions
          </Link>
        </div>
      </div>
    </div>
  )
}
