import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SidebarLayout from '@/components/layout/sidebar-layout'
import { Toaster } from 'sonner'
import { BusinessContextProvider } from '@/contexts/BusinessContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WisdomBi - Business Intelligence',
  description: 'Transform your business with data-driven coaching and business intelligence',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
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