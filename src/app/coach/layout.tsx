import { CoachLayout } from '@/components/layouts/CoachLayout'

export default function CoachRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CoachLayout>{children}</CoachLayout>
}
