// Phase 35 D-19/D-20: Custom 404 for /reports/view/[token].
// Rendered when verifyReportToken returns null (invalid/tampered token) OR
// when the signed statusId doesn't resolve to a cfo_report_status row with
// snapshot_data populated.
export default function ReportNotFound() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: '80px auto',
        padding: '0 16px',
        textAlign: 'center',
      }}
    >
      <h1>Report not found</h1>
      <p style={{ color: '#6b7280' }}>
        This report link is invalid or has expired. If you need a fresh copy, please reply to
        the email you received and your coach will resend it.
      </p>
    </main>
  )
}
