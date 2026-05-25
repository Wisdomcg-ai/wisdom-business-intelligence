"use client"

import * as Sentry from "@sentry/nextjs"
import { useState } from "react"

export default function SentryExamplePage() {
  const [sent, setSent] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Sentry Test Page</h1>
        <p className="text-sm text-gray-600 mb-6">
          Click the button below to send a test error to Sentry.
          Check your Sentry dashboard to confirm it arrives.
        </p>

        <button
          onClick={() => {
            Sentry.captureException(new Error("Sentry test error from WisdomBI — " + new Date().toISOString()))
            setSent(true)
          }}
          className="px-6 py-3 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium text-sm"
        >
          {sent ? "Error Sent — Check Sentry Dashboard" : "Send Test Error to Sentry"}
        </button>

        {sent && (
          <p className="mt-4 text-sm text-green-600 font-medium">
            Test error sent. It should appear in your Sentry dashboard within 30 seconds.
          </p>
        )}
      </div>
    </div>
  )
}
