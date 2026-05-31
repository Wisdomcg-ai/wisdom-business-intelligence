import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SidebarLayout from '@/components/layout/sidebar-layout'
import { Toaster } from 'sonner'
import { BusinessContextProvider } from '@/contexts/BusinessContext'
import { ContextErrorToast } from '@/components/providers/ContextErrorToast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { APP_TITLE, APP_DESCRIPTION, FAVICON_PATH } from '@/lib/config/brand'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  icons: {
    icon: FAVICON_PATH,
    shortcut: FAVICON_PATH,
    apple: FAVICON_PATH,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Skip link for keyboard navigation accessibility */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Business Context Provider - manages active business for coach/client views */}
        <BusinessContextProvider>
          {/* Global toast notifications */}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
          {/* Surfaces BusinessContext errors (e.g. transient role-query
              failures) as a persistent toast so users don't see a silently
              broken page. */}
          <ContextErrorToast />
          {/* Wrap all page content with ErrorBoundary and SidebarLayout */}
          <ErrorBoundary>
            <SidebarLayout>
              {children}
            </SidebarLayout>
          </ErrorBoundary>
        </BusinessContextProvider>
      </body>
    </html>
  )
}