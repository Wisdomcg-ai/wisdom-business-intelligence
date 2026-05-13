// Forecast page is now available to all authenticated users — clients, coaches,
// and super_admins. The previous coach/super_admin-only guard redirected
// clients to /dashboard, which was the source of the "click Financial
// Forecast and it kicks me back" bug. The page itself enforces business-
// scoping via resolveBusinessId, so this layer was redundant for actual
// data protection.
//
// Kept as a passthrough so the route remains a separate layout segment
// (in case future role-aware shells need to wrap the forecast view).

export default function ForecastLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
