import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cocktails with Claude — Bali 2026 | WisdomBi',
  description: 'Your build resources from the Cocktails with Claude session. Frameworks, prompts, tool guides and references — all in one place.',
  openGraph: {
    title: 'Cocktails with Claude — Bali 2026',
    description: 'Frameworks, prompts, tool guides and references from the WisdomBi retreat session.',
    siteName: 'WisdomBi',
    type: 'website',
    images: [{
      url: '/images/logo-main.png',
      width: 800,
      height: 600,
      alt: 'WisdomBi — Deep Work with AI',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cocktails with Claude — Bali 2026',
    description: 'Frameworks, prompts, tool guides and references from the WisdomBi retreat session.',
  },
}

export default function BaliRetreatLayout({
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
