'use client'
// Read-only renderer for ReportSnapshotV1 payloads captured at approval time.
// Everything needed to render must come from the payload itself — this component
// does NOT fetch live data. That is the point of the snapshot: the client sees
// exactly what the coach approved, frozen in time (D-19).
//
// Audience is the business OWNER, not an accountant (CLAUDE.md: "the target user
// is not a numbers person; simplicity beats completeness"). So the page leads
// with a plain-language scorecard, then the detail, then the coach's notes.
// Budget/variance columns appear only when the report actually has a budget.
//
// Schema-version gating: if snapshot.schema_version !== 1 we render a graceful
// fallback banner rather than crashing (RESEARCH.md §Pitfall 3).

import { Fragment } from 'react'
import { deserializeReportSections } from '@/app/finances/monthly-report/utils/snapshot-serializer'
import type { ReportSection, ReportLine } from '@/app/finances/monthly-report/types'

interface SnapshotReport {
  report_month?: string
  fiscal_year?: number
  sections?: unknown
  summary?: {
    revenue: { actual: number; budget: number; variance: number; variance_percent: number }
    cogs: { actual: number; budget: number; variance: number; variance_percent: number }
    gross_profit: { actual: number; budget: number; variance: number; gp_percent: number }
    opex: { actual: number; budget: number; variance: number; variance_percent: number }
    net_profit: { actual: number; budget: number; variance: number; np_percent: number }
  }
  gross_profit_row?: ReportLine
  net_profit_row?: ReportLine
  has_budget?: boolean
  budget_forecast_name?: string
}

interface CommentaryEntry {
  coach_note?: string
  vendor_summary?: { vendor_name?: string; amount?: number }[]
}

interface ReportSnapshotV1 {
  schema_version: number
  captured_at: string
  business: { id: string; name: string; slug: string | null; industry: string | null }
  period: { month: string; fiscal_year: number; label: string }
  coach: { name: string; email: string }
  report: SnapshotReport | null
  commentary: Record<string, CommentaryEntry> | null
  settings_applied: { sections: unknown; template_id: string | null }
  consolidated?: unknown
}

interface Props {
  snapshot: ReportSnapshotV1
  snapshotTakenAt: string | null
}

// ---------------------------------------------------------------------------
// Formatting — whole dollars. Cents are noise to the reader of this page.
// ---------------------------------------------------------------------------
const money = (n: number | null | undefined): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(v)).toLocaleString('en-AU')}`
}

const pct = (n: number | null | undefined): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(1)}%`
}

const C = {
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  panel: '#f8fafc',
  good: '#047857',
  bad: '#b91c1c',
  navy: '#1e293b',
}

/**
 * Favourable/unfavourable colouring. `calcVariance` upstream already applies the
 * sign convention (revenue: actual−budget; expenses: budget−actual), so a
 * positive variance is ALWAYS good news by the time it reaches this page.
 */
const varianceColour = (amount: number): string =>
  amount === 0 ? C.muted : amount > 0 ? C.good : C.bad

function ScoreCard({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string
  value: string
  sub?: { text: string; colour: string } | null
  emphasis?: boolean
}) {
  return (
    <div
      style={{
        flex: '1 1 160px',
        minWidth: 150,
        padding: '14px 16px',
        background: emphasis ? C.navy : C.panel,
        border: `1px solid ${emphasis ? C.navy : C.line}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 0.3, color: emphasis ? '#cbd5e1' : C.muted, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: emphasis ? '#fff' : C.ink }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 13, marginTop: 2, color: emphasis ? '#cbd5e1' : sub.colour }}>{sub.text}</div>
      )}
    </div>
  )
}

function LineRow({ line, hasBudget, bold }: { line: ReportLine; hasBudget: boolean; bold?: boolean }) {
  const weight = bold ? 600 : 400
  const bg = bold ? C.panel : undefined
  return (
    <tr style={{ background: bg }}>
      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.line}`, fontWeight: weight, color: C.ink }}>
        {line.account_name}
      </td>
      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', fontWeight: weight, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        {money(line.actual)}
      </td>
      {hasBudget && (
        <>
          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
            {money(line.budget)}
          </td>
          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', fontWeight: weight, color: varianceColour(line.variance_amount), fontVariantNumeric: 'tabular-nums' }}>
            {money(line.variance_amount)}
          </td>
        </>
      )}
    </tr>
  )
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

  const report = snapshot.report
  const summary = report?.summary
  const hasBudget = report?.has_budget === true

  // Sections may be stored as an array (the cfo_report_status path) or as the
  // named map used by monthly_report_snapshots (Phase 71-10 D4). Deserialize
  // handles both plus legacy numeric-keyed objects.
  const sections: ReportSection[] = report?.sections
    ? deserializeReportSections(report.sections as never)
    : []

  const commentaryEntries = Object.entries(snapshot.commentary ?? {}).filter(
    ([, v]) => typeof v?.coach_note === 'string' && v.coach_note.trim().length > 0,
  )

  const capturedLabel = snapshotTakenAt
    ? new Date(snapshotTakenAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <article style={{ color: C.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <header style={{ marginBottom: 28, borderBottom: `2px solid ${C.line}`, paddingBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.4 }}>{snapshot.business.name}</h1>
        <p style={{ margin: '6px 0 0', color: C.muted, fontSize: 17 }}>
          {snapshot.period.label} financial report
        </p>
        <p style={{ margin: '10px 0 0', color: C.faint, fontSize: 13 }}>
          {capturedLabel ? `Prepared ${capturedLabel}` : 'Prepared by your coach'}
          {snapshot.coach?.name ? ` • ${snapshot.coach.name}` : ''}
        </p>
      </header>

      {!report || !summary ? (
        <section style={{ padding: 24, border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel }}>
          <p style={{ margin: 0 }}>
            Your {snapshot.period.label} report is attached to the email as a PDF.
          </p>
          <p style={{ margin: '8px 0 0', color: C.muted, fontSize: 14 }}>
            The online summary isn&apos;t available for this report. Your coach can re-send it if you need one.
          </p>
        </section>
      ) : (
        <>
          {/* Headline scorecard — the "how did we do" answer, up front. */}
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
            <ScoreCard
              label="Revenue"
              value={money(summary.revenue.actual)}
              sub={
                hasBudget
                  ? {
                      text: `${money(summary.revenue.variance)} vs budget`,
                      colour: varianceColour(summary.revenue.variance),
                    }
                  : null
              }
            />
            <ScoreCard
              label="Gross profit"
              value={money(summary.gross_profit.actual)}
              sub={{ text: `${pct(summary.gross_profit.gp_percent)} margin`, colour: C.muted }}
            />
            <ScoreCard
              label="Operating costs"
              value={money(summary.opex.actual)}
              sub={
                hasBudget
                  ? {
                      text: `${money(summary.opex.variance)} vs budget`,
                      colour: varianceColour(summary.opex.variance),
                    }
                  : null
              }
            />
            <ScoreCard
              emphasis
              label="Net profit"
              value={money(summary.net_profit.actual)}
              sub={{ text: `${pct(summary.net_profit.np_percent)} of revenue`, colour: C.muted }}
            />
          </section>

          {/* Detail — one table per category, with the section subtotal in bold. */}
          {sections.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>The detail</h2>
              <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: hasBudget ? 560 : 360 }}>
                  <thead>
                    <tr style={{ background: C.panel }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `1px solid ${C.line}`, color: C.muted, fontWeight: 600 }}>
                        Account
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: `1px solid ${C.line}`, color: C.muted, fontWeight: 600 }}>
                        This month
                      </th>
                      {hasBudget && (
                        <>
                          <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: `1px solid ${C.line}`, color: C.muted, fontWeight: 600 }}>
                            Budget
                          </th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: `1px solid ${C.line}`, color: C.muted, fontWeight: 600 }}>
                            Difference
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((section) => (
                      <Fragment key={section.category}>
                        <tr>
                          <td
                            colSpan={hasBudget ? 4 : 2}
                            style={{ padding: '14px 12px 6px', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: C.faint }}
                          >
                            {section.category}
                          </td>
                        </tr>
                        {section.lines.map((line, i) => (
                          <LineRow key={`${section.category}-${line.account_name}-${i}`} line={line} hasBudget={hasBudget} />
                        ))}
                        <LineRow line={section.subtotal} hasBudget={hasBudget} bold />
                      </Fragment>
                    ))}
                    {report.gross_profit_row && (
                      <LineRow line={report.gross_profit_row} hasBudget={hasBudget} bold />
                    )}
                    {report.net_profit_row && (
                      <LineRow line={report.net_profit_row} hasBudget={hasBudget} bold />
                    )}
                  </tbody>
                </table>
              </div>
              {hasBudget && (
                <p style={{ margin: '8px 2px 0', fontSize: 12, color: C.faint }}>
                  A positive difference is better than plan; a negative one is worse.
                </p>
              )}
            </section>
          )}

          {/* Coach commentary — the "what it means" half of the report. */}
          {commentaryEntries.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Notes from {snapshot.coach?.name || 'your coach'}</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {commentaryEntries.map(([account, entry]) => (
                  <div
                    key={account}
                    style={{ padding: '12px 14px', border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.navy}`, borderRadius: 8, background: '#fff' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{account}</div>
                    <div style={{ fontSize: 14, color: C.ink, whiteSpace: 'pre-wrap' }}>{entry.coach_note}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.line}`, color: C.faint, fontSize: 12 }}>
        <p style={{ margin: 0 }}>
          This is a fixed copy of the report as approved
          {capturedLabel ? ` on ${capturedLabel}` : ''}. The PDF attached to your email contains the
          same figures plus any extra sections.
        </p>
        {snapshot.coach?.email && (
          <p style={{ margin: '6px 0 0' }}>
            Questions? Reply to the email or contact {snapshot.coach.name || 'your coach'} at{' '}
            {snapshot.coach.email}.
          </p>
        )}
      </footer>
    </article>
  )
}
