'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsAndConditionsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms and Conditions</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 mb-4">
                These Terms and Conditions (&quot;Terms&quot;) constitute a legally binding agreement between you
                (&quot;you&quot;, &quot;your&quot;, &quot;Client&quot;) and Envisage Australia Pty Ltd ATF Malouf Family Trust
                (ABN 11 331 804 705) trading as Wisdom Coaching (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;, &quot;Company&quot;).
              </p>
              <p className="text-gray-700 mb-4">
                By accessing or using our business coaching platform (the &quot;Platform&quot;), you agree to be
                bound by these Terms. If you do not agree to these Terms, you must not access or use the Platform.
              </p>
              <p className="text-gray-700">
                These Terms are governed by the laws of the State of Queensland, Australia, and you submit
                to the non-exclusive jurisdiction of the courts of Queensland.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Definitions</h2>
              <p className="text-gray-700 mb-4">In these Terms:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li><strong>&quot;Business Day&quot;</strong> means a day that is not a Saturday, Sunday, or public holiday in Queensland, Australia.</li>
                <li><strong>&quot;Coaching Services&quot;</strong> means the business coaching, mentoring, and advisory services provided through the Platform.</li>
                <li><strong>&quot;Content&quot;</strong> means all information, data, text, software, images, and other materials available on or through the Platform.</li>
                <li><strong>&quot;Intellectual Property&quot;</strong> means all patents, trademarks, trade names, copyright, moral rights, designs, know-how, trade secrets, and any other intellectual property rights.</li>
                <li><strong>&quot;Platform&quot;</strong> means our web application, including all associated tools, features, and services.</li>
                <li><strong>&quot;Subscription&quot;</strong> means your paid access to the Platform and Coaching Services.</li>
                <li><strong>&quot;User Data&quot;</strong> means any data, information, or content you submit to or create on the Platform.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Account Registration</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">3.1 Eligibility</h3>
              <p className="text-gray-700 mb-4">
                To use the Platform, you must be at least 18 years old and have the legal capacity to enter
                into a binding contract. If you are registering on behalf of a business, you represent that
                you have authority to bind that business to these Terms.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">3.2 Account Security</h3>
              <p className="text-gray-700 mb-4">
                You are responsible for maintaining the confidentiality of your account credentials and for
                all activities that occur under your account. You must immediately notify us of any
                unauthorised use of your account or any other security breach.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">3.3 Account Information</h3>
              <p className="text-gray-700">
                You agree to provide accurate, current, and complete information during registration and
                to update such information as necessary to keep it accurate, current, and complete.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Coaching Services</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">4.1 Nature of Services</h3>
              <p className="text-gray-700 mb-4">
                The Coaching Services are designed to provide business guidance, strategic planning support,
                accountability, and professional development. Coaching is not therapy, counselling, or
                professional consulting in areas such as law, accounting, or financial planning.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.2 No Guarantees</h3>
              <p className="text-gray-700 mb-4">
                While we strive to provide valuable coaching and support, we make no guarantees regarding
                specific business outcomes, financial results, or success. Results depend on many factors
                including your own effort, decisions, market conditions, and circumstances beyond our control.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.3 Client Responsibilities</h3>
              <p className="text-gray-700 mb-4">You agree to:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Attend scheduled coaching sessions or provide reasonable notice for cancellations</li>
                <li>Provide accurate and complete information about your business</li>
                <li>Take responsibility for your own business decisions</li>
                <li>Implement agreed action items to the best of your ability</li>
                <li>Maintain open and honest communication with your coach</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.4 Session Cancellations</h3>
              <p className="text-gray-700">
                Coaching sessions cancelled with less than 24 hours&apos; notice may be forfeited or subject
                to a cancellation fee, as specified in your Subscription agreement. We will endeavour to
                reschedule sessions where reasonable notice is provided.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Fees and Payment</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">5.1 Subscription Fees</h3>
              <p className="text-gray-700 mb-4">
                Access to the Platform and Coaching Services requires a paid Subscription. Current fees
                are displayed on our website or will be communicated to you directly. All fees are in
                Australian Dollars (AUD) unless otherwise specified.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.2 Payment Processing</h3>
              <p className="text-gray-700 mb-4">
                Payments are processed securely via Stripe. By providing payment information, you authorise
                us to charge your nominated payment method for all fees due. You are responsible for keeping
                your payment information current.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.3 GST</h3>
              <p className="text-gray-700 mb-4">
                All fees are exclusive of GST unless otherwise stated. GST will be added at the applicable
                rate where required under Australian law.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.4 Failed Payments</h3>
              <p className="text-gray-700 mb-4">
                If payment fails, we may suspend your access to the Platform until payment is received.
                We will attempt to notify you of failed payments and provide an opportunity to update
                your payment method.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.5 Refunds</h3>
              <p className="text-gray-700">
                Refunds are provided in accordance with Australian Consumer Law. If you are not satisfied
                with our services, please contact us within 14 days to discuss your concerns. Refunds for
                prepaid Subscription periods may be prorated at our discretion.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Intellectual Property</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">6.1 Our Intellectual Property</h3>
              <p className="text-gray-700 mb-4">
                All Intellectual Property in the Platform, including but not limited to software, designs,
                text, graphics, logos, and methodologies, is owned by or licensed to us. You may not copy,
                modify, distribute, sell, or lease any part of the Platform without our prior written consent.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">6.2 Your Content</h3>
              <p className="text-gray-700 mb-4">
                You retain ownership of your User Data. By submitting User Data to the Platform, you grant
                us a non-exclusive, worldwide, royalty-free licence to use, store, and process your User Data
                solely for the purpose of providing the Platform and Coaching Services to you.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">6.3 Feedback</h3>
              <p className="text-gray-700">
                If you provide us with feedback, suggestions, or ideas regarding the Platform, you grant us
                the right to use such feedback without restriction or compensation to you.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Confidentiality</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">7.1 Our Obligations</h3>
              <p className="text-gray-700 mb-4">
                We will keep your business information confidential and will not disclose it to third parties
                except as required to provide the Services, with your consent, or as required by law.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">7.2 Your Obligations</h3>
              <p className="text-gray-700 mb-4">
                You agree to keep confidential any proprietary information, methodologies, tools, or materials
                we provide to you through the Coaching Services and not to share them with third parties
                without our prior written consent.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">7.3 Exceptions</h3>
              <p className="text-gray-700">
                Confidentiality obligations do not apply to information that is publicly available,
                independently developed, or rightfully received from third parties without restriction.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Acceptable Use</h2>
              <p className="text-gray-700 mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Use the Platform for any unlawful purpose or in violation of any applicable laws</li>
                <li>Attempt to gain unauthorised access to the Platform or other users&apos; accounts</li>
                <li>Interfere with or disrupt the Platform&apos;s operation or security</li>
                <li>Upload or transmit viruses, malware, or other harmful code</li>
                <li>Scrape, harvest, or collect data from the Platform without permission</li>
                <li>Use the Platform to harass, abuse, or harm others</li>
                <li>Impersonate any person or entity or misrepresent your affiliation</li>
                <li>Share your account credentials with others or allow others to access your account</li>
                <li>Use the Platform to compete with us or develop a competing product</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Third-Party Services</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">9.1 Integrations</h3>
              <p className="text-gray-700 mb-4">
                The Platform may integrate with third-party services such as Xero. Your use of such
                integrations is subject to the terms and privacy policies of those third parties.
                We are not responsible for third-party services or any data you share with them.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">9.2 Third-Party Links</h3>
              <p className="text-gray-700">
                The Platform may contain links to third-party websites. We do not control and are not
                responsible for the content or practices of such websites.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Limitation of Liability</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">10.1 Consumer Guarantees</h3>
              <p className="text-gray-700 mb-4">
                Our Services come with guarantees that cannot be excluded under the Australian Consumer Law.
                For major failures with the service, you are entitled to cancel your service contract and
                receive a refund, or compensation for the reduced value of the services.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">10.2 Exclusion of Liability</h3>
              <p className="text-gray-700 mb-4">
                To the maximum extent permitted by law, we exclude all liability for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
                <li>Any indirect, incidental, special, consequential, or punitive damages</li>
                <li>Loss of profits, revenue, data, or business opportunities</li>
                <li>Any damages arising from your business decisions or actions</li>
                <li>Any damages exceeding the fees paid by you in the 12 months preceding the claim</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">10.3 No Professional Advice</h3>
              <p className="text-gray-700">
                The Coaching Services do not constitute legal, financial, accounting, or tax advice.
                You should seek independent professional advice for such matters. We are not liable for
                any decisions you make based on coaching discussions or Platform content.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Indemnification</h2>
              <p className="text-gray-700">
                You agree to indemnify and hold harmless the Company, its officers, directors, employees,
                and agents from any claims, damages, losses, liabilities, and expenses (including legal fees)
                arising out of or related to your use of the Platform, your breach of these Terms, or your
                violation of any rights of a third party.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Termination</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">12.1 Termination by You</h3>
              <p className="text-gray-700 mb-4">
                You may terminate your account at any time by contacting us or through your account settings.
                Upon termination, your access to the Platform will cease, but you remain liable for any
                outstanding fees.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">12.2 Termination by Us</h3>
              <p className="text-gray-700 mb-4">
                We may suspend or terminate your account immediately if you breach these Terms, engage in
                fraudulent activity, or if required by law. We may also terminate your account with 30 days&apos;
                notice for any reason.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">12.3 Effect of Termination</h3>
              <p className="text-gray-700">
                Upon termination, your right to use the Platform ceases immediately. We will retain your
                data in accordance with our Privacy Policy. Provisions of these Terms that by their nature
                should survive termination will remain in effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Dispute Resolution</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">13.1 Informal Resolution</h3>
              <p className="text-gray-700 mb-4">
                Before initiating any formal dispute resolution, you agree to first contact us to attempt
                to resolve any dispute informally. Most concerns can be quickly resolved this way.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">13.2 Mediation</h3>
              <p className="text-gray-700 mb-4">
                If informal resolution fails, the parties agree to submit the dispute to mediation
                administered by the Resolution Institute (or similar body) in Brisbane, Queensland,
                before pursuing litigation.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">13.3 Jurisdiction</h3>
              <p className="text-gray-700">
                These Terms are governed by the laws of Queensland, Australia. You agree to submit to
                the non-exclusive jurisdiction of the courts of Queensland for any legal proceedings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">14. General Provisions</h2>
              <h3 className="text-lg font-medium text-gray-800 mb-3">14.1 Entire Agreement</h3>
              <p className="text-gray-700 mb-4">
                These Terms, together with our Privacy Policy and any Subscription agreement, constitute
                the entire agreement between you and us regarding the Platform.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">14.2 Amendments</h3>
              <p className="text-gray-700 mb-4">
                We may amend these Terms at any time by posting the amended version on the Platform.
                Material changes will be notified via email or Platform notification. Your continued use
                after such notice constitutes acceptance of the amended Terms.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">14.3 Waiver</h3>
              <p className="text-gray-700 mb-4">
                Our failure to enforce any right or provision of these Terms will not be deemed a waiver
                of such right or provision.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">14.4 Severability</h3>
              <p className="text-gray-700 mb-4">
                If any provision of these Terms is held to be invalid or unenforceable, that provision
                will be limited or eliminated to the minimum extent necessary, and the remaining provisions
                will remain in full force and effect.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">14.5 Assignment</h3>
              <p className="text-gray-700">
                You may not assign or transfer these Terms without our prior written consent. We may assign
                our rights and obligations under these Terms at any time.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">15. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms, please contact us:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-700">
                <p className="font-medium">Envisage Australia Pty Ltd ATF Malouf Family Trust</p>
                <p>Trading as Wisdom Coaching</p>
                <p>ABN: 11 331 804 705</p>
                <p className="mt-2">Email: support@wisdombi.ai</p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <Link href="/privacy" className="text-brand-orange hover:text-brand-orange-700">
            View Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}
