import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'The AI Advantage — Session Reference | WisdomBi',
  description: 'Every framework, prompt and model from The AI Advantage workshop. Includes the 5-Layer Model, C3 Method, DEEPER Framework, and downloadable slide deck.',
  openGraph: {
    title: 'The AI Advantage — Session Reference',
    description: 'Every framework, prompt and model from the session. Bookmark this — it\'s yours to keep.',
    siteName: 'WisdomBi',
    type: 'website',
    url: 'https://wisdombi.ai/ai-advantage',
    images: [{
      url: '/images/logo-main.png',
      width: 800,
      height: 600,
      alt: 'WisdomBi — The AI Advantage',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The AI Advantage — Session Reference',
    description: 'Every framework, prompt and model from the session. Bookmark this — it\'s yours to keep.',
  },
}

export default function AIAdvantageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={jetbrainsMono.variable}>
      {children}
    </div>
  )
}
