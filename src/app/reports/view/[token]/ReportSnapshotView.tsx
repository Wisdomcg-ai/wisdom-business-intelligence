'use client'
// Read-only renderer for ReportSnapshotV1 payloads captured at approval time.
// Everything needed to render must come from the payload itself — this component
// does NOT fetch live data.
//
// Schema-version gating: if snapshot.schema_version !== 1 we render a graceful
// fallback banner rather than crashing (RESEARCH.md §Pitfall 3). The email link
// already sent to the client continues to work — the payload just predates this
// renderer's format.
//
// TODO(Plan 35-06): replace the minimal "report is ready" body below with the
// rich tab-by-tab rendering (P&L, variance, commentary, full-year). Plan 35-05
// intentionally ships only the flow-proving placeholder so the snapshot read
// path (token -> DB -> render) ships end-to-end without blocking on the full
// read-only UI.

interface ReportSnapshotV1 {
  schema_version: number
  captured_at: string
  business: { id: string; name: string; slug: string | null; industry: string | null }
  period: { month: string; fiscal_year: number; label: string }
  coach: { name: string; email: string }
  report: unknown // GeneratedReport — shape defined by Plan 35-06 caller
  commentary: unknown | null
  settings_applied: { sections: unknown; template_id: string | null }
  consolidated?: unknown
}

interface Props {
  snapshot: ReportSnapshotV1
  snapshotTakenAt: string | null
}

export default function ReportSnapshotView({ snapshot, snapshotTakenAt }: Props) {
  if (snapshot.schema_version !== 1) {
    return (
      <div style={{ padding: 24, background: '#fef3c7', borderRadius: 8 }}>
        <h1>Report snapshot captured in an older format</h1>
        <p>
          This link was generated before a platform update. Ask your coach to re-approve the
          report to regenerate this view.
        </p>
      </div>
    )
  }

  return (
    <article>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>{snapshot.business.name}</h1>
        <p style={{ margin: '4px 0', color: '#6b7280' }}>
          {snapshot.period.label} financial report
        </p>
        {snapshotTakenAt && (
          <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>
            Captured{' '}
            {new Date(snapshotTakenAt).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {snapshot.coach?.name ? ` • Prepared by ${snapshot.coach.name}` : ''}
          </p>
        )}
      </header>

      {/*
        TODO(Plan 35-06): render the detailed report body from snapshot.report
        (GeneratedReport shape). For Wave 2 we ship a minimal "report is ready"
        placeholder to prove the flow end-to-end without blocking on the full
        read-only UI.
      */}
      <section style={{ padding: 24, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <p>Your {snapshot.period.label} financial report is available below.</p>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          The PDF attached to the email you received is the printable version of this report.
        </p>
      </section>
    </article>
  )
}
