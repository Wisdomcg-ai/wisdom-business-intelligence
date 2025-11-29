import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SidebarLayout from '@/components/layout/sidebar-layout'
import { Toaster } from 'sonner'
import { BusinessContextProvider } from '@/contexts/BusinessContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Business Coaching Platform',
  description: 'Transform your business with data-driven coaching',
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
          {/* Wrap all page content with SidebarLayout */}
          <SidebarLayout>
            {children}
          </SidebarLayout>
        </BusinessContextProvider>
      </body>
    </html>
  )
}