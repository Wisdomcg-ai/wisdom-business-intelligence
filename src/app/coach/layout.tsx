import CoachLayoutNew from '@/components/layouts/CoachLayoutNew'

export default function CoachRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CoachLayoutNew>{children}</CoachLayoutNew>
}
