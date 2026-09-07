/**
 * POST /api/cfo/recon-round-worker — the recon-round runner's server API.
 *
 * Runner machines (Matt's Mac, Vanessa's PC) used to talk to the database
 * with the service key; a master key does not belong on a VA's machine, so
 * this route is now the runners' ONLY server surface. It is gated by
 * RECON_WATCHER_TOKEN (fail-closed, CRON_SECRET house pattern) and exposes
 * exactly three operations:
 *
 *   op: 'claim'   — janitor stale rows, atomically claim the oldest live
 *                   pending request, and return everything a run needs:
 *                   the roster (connected + badge-only, hidden excluded),
 *                   prior capture account names, and any roster warning.
 *   op: 'stamp'   — record a claimed run's outcome. A 'done' claim is
 *                   verified SERVER-side against the captures actually
 *                   written (a runner cannot attest its own success).
 *   op: 'request' — queue a run (deduped; used by manual --request).
 *
 * The unattended child Claude never sees this token — only the watcher
 * process does. Timeout ladder: watcher kill 60 < board liveness 65 <
 * server janitors 75 (here and recon-round-request/route.ts).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withSchema } from '@/lib/api/with-schema'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { AFFINITY_WINDOW_MINUTES, affinityEligible } from '@/lib/cfo/claim-affinity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PICKUP_WINDOW_MINUTES = 30
/** Must exceed the watcher's 60-min kill + SIGKILL escalation + stamp round
 *  trip, and the board's 65-min liveness bound. Matches the sibling
 *  recon-round-request route's SERVER_RUNNING_TIMEOUT_MINUTES. */
const RUNNING_JANITOR_MINUTES = 75

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const PostBodySchema = z
  .object({
    op: z.enum(['claim', 'stamp', 'request']),
    request_id: z.string().optional(),
    status: z.enum(['done', 'failed']).optional(),
    claim_nonce: z.string().max(100).optional(),
    note: z.string().max(2000).optional(),
    source: z.string().max(40).optional(),
    runner_owner_email: z.string().max(200).optional(),
  })
  .passthrough()

async function expireStaleRows() {
  const nowIso = new Date().toISOString()
  const capture = (which: string, error: unknown) => {
    // The janitor is the queue's recovery path — its failures must never be
    // silent (house rule: every swallowed write failure gets an invariant).
    if (error) {
      Sentry.captureException(error, {
        tags: { route: 'cfo/recon-round-worker', invariant: 'recon_worker_janitor_write_failed' },
        extra: { context: `[Recon Worker] janitor write failed: ${which}` },
      } as any)
    }
  }
  const { error: expireErr } = await supabase
    .from('recon_round_requests')
    .update({ status: 'expired', finished_at: nowIso, result_note: `Not picked up within ${PICKUP_WINDOW_MINUTES} min (runner machine asleep or watcher not running)` })
    .eq('status', 'pending')
    .lt('requested_at', new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString())
  capture('pending->expired', expireErr)
  const { error: timeoutErr } = await supabase
    .from('recon_round_requests')
    .update({ status: 'failed', finished_at: nowIso, result_note: `Run exceeded the runner's 60 min timeout and was retired by the server at ${RUNNING_JANITOR_MINUTES} min (runner crashed or the machine slept)` })
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - RUNNING_JANITOR_MINUTES * 60_000).toISOString())
  capture('running->failed', timeoutErr)
}

/**
 * The org roster a run must cover: active connections of board-visible
 * clients, plus badge-only clients (board_manual_include with a complete
 * settings row and no connection rows in either id-space). Mirrors the
 * board route's rules — one suppression definition everywhere.
 */
async function buildRoster(): Promise<{
  roster: Array<{ business: string; business_id: string; tenant_id: string; tenant_name: string; short_code: string | null; badge_only: boolean }>
  roster_warning: string | null
}> {
  const { data: allConns, error: connErr } = await supabase
    .from('xero_connections')
    .select('tenant_id, tenant_name, business_id')
    .eq('is_active', true)
  if (connErr || !allConns?.length) throw new Error(`roster enumeration failed: ${connErr?.message ?? 'no active connections'}`)

  const { data: settingsRows, error: settingsErr } = await supabase
    .from('monthly_report_settings')
    .select('business_id, hide_from_board, board_manual_include, manual_xero_shortcode, manual_tenant_key')
  // Fail closed the cheap way: a settings-read failure runs the FULL
  // connected roster (extra coverage is harmless; silent skips are not).
  const hidden = new Set(
    settingsErr ? [] : (settingsRows ?? []).filter(s => s.hide_from_board).map(s => s.business_id),
  )
  const conns = allConns.filter(c => !hidden.has(c.business_id))

  const { data: anyConnRows } = await supabase.from('xero_connections').select('business_id')
  const { data: profileRows } = await supabase.from('business_profiles').select('id, business_id')
  const profileToBiz = new Map((profileRows ?? []).map(p => [p.id, p.business_id]))
  const connectedBiz = new Set(
    (anyConnRows ?? []).map(r => profileToBiz.get(r.business_id) ?? r.business_id),
  )
  const flaggedManual = settingsErr ? [] : (settingsRows ?? []).filter(s =>
    s.board_manual_include && !s.hide_from_board && !connectedBiz.has(s.business_id),
  )
  const manual = flaggedManual.filter(s => s.manual_tenant_key && s.manual_xero_shortcode)
  const misconfigured = flaggedManual.filter(s => !s.manual_tenant_key || !s.manual_xero_shortcode)
  const roster_warning = misconfigured.length > 0
    ? `${misconfigured.length} badge-only client(s) flagged but NOT coverable: ${misconfigured
        .map(m => `${m.business_id} (missing ${[!m.manual_tenant_key && 'manual_tenant_key', !m.manual_xero_shortcode && 'manual_xero_shortcode'].filter(Boolean).join(' + ')})`)
        .join(', ')} — complete their settings row or the board shows them as never-captured forever`
    : null
  if (!conns.length && !manual.length) throw new Error('roster enumeration failed: every client is hidden from the board')

  const bizIds = [...new Set([...conns.map(c => c.business_id), ...manual.map(m => m.business_id)])]
  const { data: bizzes } = await supabase.from('businesses').select('id, name').in('id', bizIds)
  const bizName = new Map((bizzes ?? []).map(b => [b.id, b.name]))
  const { data: shortcodes } = await supabase
    .from('bank_account_status')
    .select('tenant_id, short_code')
    .in('tenant_id', conns.map(c => c.tenant_id))
  const codeByTenant = new Map<string, string>()
  for (const s of shortcodes ?? []) {
    if (s.short_code && !codeByTenant.has(s.tenant_id)) codeByTenant.set(s.tenant_id, s.short_code)
  }

  return {
    roster: [
      ...conns.map(c => ({
        business: bizName.get(c.business_id) ?? '(unknown business)',
        business_id: c.business_id,
        tenant_id: c.tenant_id,
        tenant_name: c.tenant_name ?? '(unnamed org)',
        short_code: codeByTenant.get(c.tenant_id) ?? null,
        badge_only: false,
      })),
      ...manual.map(m => ({
        business: bizName.get(m.business_id) ?? '(unknown business)',
        business_id: m.business_id,
        tenant_id: m.manual_tenant_key as string,
        tenant_name: bizName.get(m.business_id) ?? '(unknown business)',
        short_code: m.manual_xero_shortcode as string,
        badge_only: true,
      })),
    ],
    roster_warning,
  }
}

/** Account names from each tenant's latest capture — keeps names stable
 *  across runs so recon_ignored_accounts matching can't be dodged by Xero's
 *  per-screen relabelling. Advisory: a failure costs stability, not the run. */
async function priorAccountNames(tenantIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  const { data, error } = await supabase
    .from('reconciliation_dashboard_captures')
    .select('tenant_id, captured_at, accounts')
    .in('tenant_id', tenantIds)
    .order('captured_at', { ascending: false })
    .limit(400)
  if (error) return out
  for (const row of data ?? []) {
    if (out[row.tenant_id]) continue // newest-first
    const names = ((row.accounts as Array<{ name?: unknown }> | null) ?? [])
      .map(a => a?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
    if (names.length > 0) out[row.tenant_id] = names
  }
  return out
}

/**
 * Resolve a request's presser to an email for press-affinity. Failure
 * resolves to null (no affinity): a deleted user or an auth-API hiccup must
 * route the run to whoever asks, never wedge the queue. Read-only, so the
 * swallowed error needs no invariant capture.
 */
async function requesterEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null
  try {
    const { data } = await supabase.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

async function postHandler(request: Request) {
  try {
    // Fail-closed token gate (CRON_SECRET house pattern): a missing env var
    // means NOBODY gets in, never everybody.
    const watcherToken = process.env.RECON_WATCHER_TOKEN
    const auth = request.headers.get('authorization')
    if (!watcherToken || auth !== `Bearer ${watcherToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const op: unknown = body?.op

    if (op === 'request') {
      await expireStaleRows()
      const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 40) : 'schedule'
      const windowStart = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
      const { data: existing } = await supabase
        .from('recon_round_requests')
        .select('id')
        .or(`status.eq.running,and(status.eq.pending,requested_at.gte.${windowStart})`)
        .limit(1)
        .maybeSingle()
      // No live ids in the response — a token holder learns only that a
      // request exists, not which row to stamp.
      if (existing) return NextResponse.json({ success: true, existing: true })
      const { data: row, error } = await supabase
        .from('recon_round_requests')
        .insert({ source })
        .select('id, status, requested_at')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ success: true, existing: true })
        }
        throw error
      }
      return NextResponse.json({ success: true, request: row, existing: false })
    }

    if (op === 'claim') {
      await expireStaleRows()
      const { data: running } = await supabase
        .from('recon_round_requests')
        .select('id')
        .eq('status', 'running')
        .limit(1)
        .maybeSingle()
      if (running) return NextResponse.json({ claimed: null, reason: 'a run is already in progress' })

      const windowStart = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
      const { data: pendingRows } = await supabase
        .from('recon_round_requests')
        .select('id, source, requested_at, requested_by')
        .eq('status', 'pending')
        .gte('requested_at', windowStart)
        .order('requested_at', { ascending: true })
        .limit(5)
      if (!pendingRows?.length) return NextResponse.json({ claimed: null, reason: 'nothing pending' })

      // Press-affinity: for its first minutes a request is reserved for the
      // presser's own machine (their Chrome, their Xero session); after the
      // window any runner may take it so the run still happens. Requester
      // emails are only resolved when the runner actually declares an owner.
      const declaredOwner =
        typeof body.runner_owner_email === 'string' && body.runner_owner_email.trim()
          ? body.runner_owner_email.trim()
          : null
      const nowMs = Date.now()
      let pending: (typeof pendingRows)[number] | null = null
      for (const row of pendingRows) {
        const email = declaredOwner ? await requesterEmail(row.requested_by ?? null) : null
        if (affinityEligible({ declaredOwnerEmail: declaredOwner, requesterEmail: email, requestedAt: row.requested_at, nowMs })) {
          pending = row
          break
        }
      }
      if (!pending) {
        // Known, accepted trade-off: a token holder can distinguish this
        // reason from 'nothing pending' and probe declared emails against the
        // presser's until a claim succeeds — a login-email confirmation
        // oracle. Accepted because the token already exposes the far more
        // sensitive full client roster on any claim, the operator population
        // is two known people, and this reason string is what makes a
        // misdeclared RUNNER_OWNER_EMAIL diagnosable at all.
        return NextResponse.json({
          claimed: null,
          reason: `pending run is reserved for the requester's own machine for its first ${AFFINITY_WINDOW_MINUTES} min`,
        })
      }

      // Atomic claim — a concurrent runner loses this update and gets null.
      // The nonce binds the eventual stamp to THIS claim: a token holder who
      // never claimed cannot finalize someone else's run.
      const nonce = crypto.randomUUID()
      let { data: claimed, error: claimErr } = await supabase
        .from('recon_round_requests')
        .update({ status: 'running', started_at: new Date().toISOString(), claim_nonce: nonce })
        .eq('id', pending.id)
        .eq('status', 'pending')
        .select('id, source, started_at')
        .maybeSingle()
      // Code deploys before the hand-applied migration (house rule): retry
      // without the new column rather than wedging the queue.
      if (claimErr && ((claimErr as { code?: string }).code === '42703' || (claimErr as { code?: string }).code === 'PGRST204')) {
        ;({ data: claimed } = await supabase
          .from('recon_round_requests')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', pending.id)
          .eq('status', 'pending')
          .select('id, source, started_at')
          .maybeSingle())
      }
      if (!claimed) return NextResponse.json({ claimed: null, reason: 'claimed by another runner' })

      try {
        const { roster, roster_warning } = await buildRoster()
        const prior_names = await priorAccountNames(roster.map(r => r.tenant_id))
        // Snapshot the assigned roster so 'done' verification judges the run
        // against what it was ASKED to cover, not a roster that may have
        // grown mid-run. Server-written — never accepted from the runner.
        await supabase
          .from('recon_round_requests')
          .update({ roster_snapshot: roster.map(r => ({ tenant_id: r.tenant_id, tenant_name: r.tenant_name })) })
          .eq('id', claimed.id)
          .eq('status', 'running')
        return NextResponse.json({ claimed: { ...claimed, claim_nonce: nonce }, roster, roster_warning, prior_names })
      } catch (rosterError) {
        // A claim without a roster is unrunnable — retire it honestly so the
        // queue can't wedge, and tell the runner why.
        const message = rosterError instanceof Error ? rosterError.message : String(rosterError)
        await supabase
          .from('recon_round_requests')
          .update({ status: 'failed', finished_at: new Date().toISOString(), result_note: `Could not enumerate the org roster: ${message}`.slice(0, 990) })
          .eq('id', claimed.id)
          .eq('status', 'running')
        return NextResponse.json({ claimed: null, reason: `roster enumeration failed: ${message}` })
      }
    }

    if (op === 'stamp') {
      const requestId: unknown = body.request_id
      const status: unknown = body.status
      const claimNonce: unknown = body.claim_nonce
      const note = typeof body.note === 'string' ? body.note : ''
      if (typeof requestId !== 'string' || (status !== 'done' && status !== 'failed') || typeof claimNonce !== 'string' || !claimNonce) {
        return NextResponse.json({ error: 'stamp needs request_id, claim_nonce and status done|failed' }, { status: 400 })
      }
      const { data: row } = await supabase
        .from('recon_round_requests')
        .select('id, status, started_at, claim_nonce, roster_snapshot')
        .eq('id', requestId)
        .maybeSingle()
      if (!row) return NextResponse.json({ error: 'unknown request_id' }, { status: 404 })
      if (row.status !== 'running') {
        // Watchdog/server verdict already stands — final, never overwritten.
        return NextResponse.json({ success: true, stamped: false, reason: `row is '${row.status}', verdict stands` })
      }
      // Nonce binds the stamp to the claim (null nonce = pre-migration claim
      // fallback — accept, the column just landed).
      if (row.claim_nonce && row.claim_nonce !== claimNonce) {
        return NextResponse.json({ error: 'claim_nonce mismatch' }, { status: 403 })
      }

      let finalStatus: 'done' | 'failed' = status
      let finalNote = note
      if (status === 'done') {
        // Never trust a runner's self-attested 'done': fresh chrome_routine
        // captures must exist for EVERY tenant the run was ASKED to cover
        // (the claim-time snapshot; live rebuild only for pre-snapshot rows).
        // Unverifiable (roster or query failure) is not verified.
        try {
          const snapshot = Array.isArray(row.roster_snapshot)
            ? (row.roster_snapshot as Array<{ tenant_id: string; tenant_name: string }>)
            : null
          const expected = snapshot && snapshot.length > 0
            ? snapshot
            : (await buildRoster()).roster.map(r => ({ tenant_id: r.tenant_id, tenant_name: r.tenant_name }))
          const { data: caps, error: capErr } = await supabase
            .from('reconciliation_dashboard_captures')
            .select('tenant_id')
            .eq('method', 'chrome_routine')
            .gte('captured_at', row.started_at ?? new Date(0).toISOString())
          if (capErr) throw capErr
          const captured = new Set((caps ?? []).map(c => c.tenant_id))
          const missing = expected.filter(r => !captured.has(r.tenant_id))
          if (missing.length > 0) {
            finalStatus = 'failed'
            finalNote = `${note} — VERIFY: captures cover ${expected.length - missing.length}/${expected.length} orgs — missing: ${missing.map(m => m.tenant_name).join(', ')}`
          } else if (!finalNote.trim()) {
            finalNote = `All ${expected.length} orgs captured`
          }
        } catch (verifyError) {
          finalStatus = 'failed'
          finalNote = `${note} — VERIFY: cross-check failed (${verifyError instanceof Error ? verifyError.message : 'unknown error'})`
        }
      }
      if (finalStatus === 'failed' && !finalNote.trim()) finalNote = 'Run reported failure with no detail'
      const { data: stamped, error: stampErr } = await supabase
        .from('recon_round_requests')
        .update({ status: finalStatus, finished_at: new Date().toISOString(), result_note: finalNote.slice(0, 990) })
        .eq('id', requestId)
        .eq('status', 'running')
        .select('id, status')
        .maybeSingle()
      if (stampErr) throw stampErr
      return NextResponse.json({ success: true, stamped: !!stamped, status: stamped?.status ?? null })
    }

    return NextResponse.json({ error: 'unknown op' }, { status: 400 })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'cfo/recon-round-worker', invariant: 'recon_worker_op_failed' },
      extra: { context: '[Recon Worker] op failed' },
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('cfo/recon-round-worker', PostBodySchema, postHandler)
