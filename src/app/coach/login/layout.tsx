// Login page uses its own layout (no CoachLayout wrapper)
export default function CoachLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
