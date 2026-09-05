#!/usr/bin/env node
/**
 * Recon-round watcher — the Mac side of the CFO board's "Update from Xero"
 * button (and the weekday-morning schedule).
 *
 * The Xero badge counts can only be captured by Claude driving Matt's
 * logged-in Chrome (no API exposes the badge — Xero, 2 Sep 2026), so the web
 * app can only QUEUE a run (recon_round_requests). This script, invoked by
 * launchd, does the local half:
 *
 *   --tick               claim a pending request and run the round (launchd,
 *                        every 60s; exits immediately when nothing to do)
 *   --request [source]   queue a request (the 7am weekday launchd job uses
 *                        source 'schedule'); dedupes against live requests
 *
 * Install both launchd jobs with scripts/install-recon-watcher.sh.
 *
 * Security model for the UNATTENDED child run (adversarial review, 5 Sep):
 * - The child gets NO database access. The watcher pre-enumerates the org
 *   roster and injects it into the prompt; the child reports its outcome by
 *   printing a RECON_RESULT line on stdout, which the watcher parses and
 *   stamps — and a 'done' claim is mechanically cross-checked against the
 *   captures actually written before it is believed.
 * - The child runs in ~/.wisdombi/recon-runner (built by the installer):
 *   only the skills are reachable (symlink), no .env.local, and the runner's
 *   own settings deny Bash/Write/env-file reads. Allowed tools are an
 *   explicit enumeration, not server-wide grants.
 * - A wall-clock watchdog SIGTERM→SIGKILLs the child at the timeout (Node's
 *   spawn timeout is monotonic and freezes during Mac sleep), so the tick
 *   always exits, launchd keeps ticking, and stale rows get retired.
 * - The child NEVER logs in and never sees credentials; an expired Xero
 *   session becomes a 'failed' run with an honest note, not a fake capture.
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUNNER_DIR = join(process.env.HOME, '.wisdombi', 'recon-runner')
const CLAUDE_BIN = process.env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`
/** Must match PICKUP_WINDOW_MINUTES on the request route. */
const PICKUP_WINDOW_MINUTES = 30
/** Badge walk + date pass over 13 orgs runs ~10-20 min; past this it's dead.
 *  The board's RUNNING_TIMEOUT_MINUTES (45) and the route's server janitor
 *  (60) must stay above this. */
const RUN_TIMEOUT_MINUTES = 40

function loadEnvLocal() {
  const raw = readFileSync(join(REPO_ROOT, '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}

const env = loadEnvLocal()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error('[watcher] .env.local is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

const log = (msg) => console.log(`[watcher ${new Date().toISOString()}] ${msg}`)
const logWriteError = (label, error) => {
  // Janitor/stamp writes are the recovery path — a silent failure here means
  // rows rot forever. Message only; never key material.
  if (error) console.error(`[watcher] ${label} WRITE FAILED: ${error.message}`)
}

async function requestRun(source) {
  // Mirror the route's dedupe: 'running' at any age, 'pending' only inside
  // the pickup window. The one-live unique index backstops races.
  const windowStart = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
  const { data: existing, error: readError } = await supabase
    .from('recon_round_requests')
    .select('id, status')
    .or(`status.eq.running,and(status.eq.pending,requested_at.gte.${windowStart})`)
    .limit(1)
    .maybeSingle()
  if (readError) throw new Error(`request dedupe read failed: ${readError.message}`)
  if (existing) {
    log(`request skipped — live request ${existing.id} (${existing.status}) already exists`)
    return
  }
  const { error } = await supabase.from('recon_round_requests').insert({ source })
  if (error) {
    if (error.code === '23505') {
      log('request skipped — a concurrent request won the one-live index race')
      return
    }
    throw new Error(`request insert failed: ${error.message}`)
  }
  log(`queued a recon round (source: ${source})`)
}

async function expireStaleRows() {
  const pendingCutoff = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
  const { error: expireErr } = await supabase
    .from('recon_round_requests')
    .update({ status: 'expired', finished_at: new Date().toISOString(), result_note: `Not picked up within ${PICKUP_WINDOW_MINUTES} min (Mac asleep or watcher not running)` })
    .eq('status', 'pending')
    .lt('requested_at', pendingCutoff)
  logWriteError('expire pending->expired', expireErr)
  const runningCutoff = new Date(Date.now() - RUN_TIMEOUT_MINUTES * 60_000).toISOString()
  const { error: timeoutErr } = await supabase
    .from('recon_round_requests')
    .update({ status: 'failed', finished_at: new Date().toISOString(), result_note: `Run did not complete within ${RUN_TIMEOUT_MINUTES} min (timed out, crashed, or the Mac slept)` })
    .eq('status', 'running')
    .lt('started_at', runningCutoff)
  logWriteError('timeout running->failed', timeoutErr)
}

/** The org roster the child must cover — enumerated HERE so the child needs
 *  no database access. Live xero_connections is the source of truth, never
 *  the skill's cached shortcode list. */
async function enumerateRoster() {
  const { data: conns, error: connErr } = await supabase
    .from('xero_connections')
    .select('tenant_id, tenant_name, business_id')
    .eq('is_active', true)
  if (connErr || !conns?.length) throw new Error(`roster enumeration failed: ${connErr?.message ?? 'no active connections'}`)
  const { data: bizzes } = await supabase
    .from('businesses')
    .select('id, name')
    .in('id', [...new Set(conns.map(c => c.business_id))])
  const bizName = new Map((bizzes ?? []).map(b => [b.id, b.name]))
  const { data: shortcodes } = await supabase
    .from('bank_account_status')
    .select('tenant_id, short_code')
    .in('tenant_id', conns.map(c => c.tenant_id))
  const codeByTenant = new Map()
  for (const s of shortcodes ?? []) {
    if (s.short_code && !codeByTenant.has(s.tenant_id)) codeByTenant.set(s.tenant_id, s.short_code)
  }
  return conns.map(c => ({
    business: bizName.get(c.business_id) ?? '(unknown business)',
    business_id: c.business_id,
    tenant_id: c.tenant_id,
    tenant_name: c.tenant_name ?? '(unnamed org)',
    short_code: codeByTenant.get(c.tenant_id) ?? null,
  }))
}

function runnerPrompt(roster) {
  const rosterLines = roster.map(r =>
    `- ${r.business} [business_id ${r.business_id}] — org "${r.tenant_name}" [tenant_id ${r.tenant_id}]` +
    (r.short_code ? ` — shortcode ${r.short_code}` : ' — NO shortcode: use Xero\'s org switcher by name')
  ).join('\n')
  return `You are running UNATTENDED on Matt's Mac to refresh the CFO board's Xero badge counts.
Run the full Xero recon round by following .claude/skills/xero-recon-round/SKILL.md (badge walk over
every org, then the date pass, posting captures WITH per-account months histograms from a logged-in
https://www.wisdombi.ai tab) — with these overrides for unattended mode:
1. You have NO database access. Skip the skill's SQL enumeration and DB verification steps entirely.
   The round's org set is EXACTLY this live roster (use these business_id/tenant_id values in POSTs):
${rosterLines}
2. HARD RULES: never log in anywhere and never touch credentials. If Xero or WisdomBI shows a login
   page, STOP and report it. A badge you could not read is a SKIPPED org, never a 0. Never invent a
   month bucket to make a histogram foot — omit months for that account and say so in notes.
3. When finished OR stopped, end your reply with ONE final line, exactly this shape:
   RECON_RESULT {"status":"done","note":"<orgs captured; anything odd>"}
   or RECON_RESULT {"status":"failed","note":"<what was captured; which orgs were skipped and WHY>"}
   Use "done" ONLY if every org in the roster was captured (badge walk complete). Any skip, stop, or
   login wall is "failed" with the reason. Do not ask questions. Do not wait for input.`
}

const CHILD_ALLOWED_TOOLS = [
  'mcp__claude-in-chrome__tabs_context_mcp',
  'mcp__claude-in-chrome__tabs_create_mcp',
  'mcp__claude-in-chrome__tabs_close_mcp',
  'mcp__claude-in-chrome__navigate',
  'mcp__claude-in-chrome__find',
  'mcp__claude-in-chrome__read_page',
  'mcp__claude-in-chrome__get_page_text',
  'mcp__claude-in-chrome__computer',
  'mcp__claude-in-chrome__form_input',
  'mcp__claude-in-chrome__javascript_tool',
  'mcp__claude-in-chrome__read_console_messages',
  'mcp__claude-in-chrome__read_network_requests',
  'mcp__claude-in-chrome__browser_batch',
  'Read',
].join(',')
const CHILD_DISALLOWED_TOOLS = [
  'mcp__claude-in-chrome__file_upload',
  'mcp__claude-in-chrome__upload_image',
  'mcp__claude-in-chrome__gif_creator',
  'mcp__claude-in-chrome__shortcuts_execute',
  'mcp__claude-in-chrome__shortcuts_list',
  'Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch',
].join(',')

/** A 'done' claim is only believed if fresh chrome_routine captures exist
 *  for EVERY roster tenant. Unverifiable (query error) is not verified. */
async function verifyDoneClaim(roster, claimStartIso) {
  const { data, error } = await supabase
    .from('reconciliation_dashboard_captures')
    .select('tenant_id')
    .eq('method', 'chrome_routine')
    .gte('captured_at', claimStartIso)
  if (error) return `VERIFY: cross-check query failed — ${error.message}`
  const captured = new Set((data ?? []).map(r => r.tenant_id))
  const missing = roster.filter(r => !captured.has(r.tenant_id))
  if (missing.length > 0) {
    return `VERIFY: captures cover ${roster.length - missing.length}/${roster.length} orgs — missing: ${missing.map(m => m.tenant_name).join(', ')}`
  }
  return null
}

async function stampOutcome(id, status, note) {
  // Guarded on status='running': if the watchdog/server already retired the
  // row, its verdict is final and this stamp is a no-op.
  const { data, error } = await supabase
    .from('recon_round_requests')
    .update({ status, finished_at: new Date().toISOString(), result_note: note })
    .eq('id', id)
    .eq('status', 'running')
    .select('id')
    .maybeSingle()
  logWriteError(`stamp ${status}`, error)
  if (!error && !data) log(`stamp skipped — row ${id} was already retired (watchdog/server verdict stands)`)
}

async function tick() {
  await expireStaleRows()

  const { data: running, error: runningErr } = await supabase
    .from('recon_round_requests')
    .select('id')
    .eq('status', 'running')
    .limit(1)
    .maybeSingle()
  if (runningErr) { console.error(`[watcher] running-check read failed: ${runningErr.message}`); return }
  if (running) {
    log(`round ${running.id} still running — nothing to do`)
    return
  }

  const windowStart = new Date(Date.now() - PICKUP_WINDOW_MINUTES * 60_000).toISOString()
  const { data: pending, error: pendingErr } = await supabase
    .from('recon_round_requests')
    .select('id, source, requested_at')
    .eq('status', 'pending')
    .gte('requested_at', windowStart)
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pendingErr) { console.error(`[watcher] pending read failed: ${pendingErr.message}`); return }
  if (!pending) return

  // Atomic claim — a concurrent tick loses the update and does nothing.
  const { data: claimed } = await supabase
    .from('recon_round_requests')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) {
    log(`request ${pending.id} was claimed by another tick`)
    return
  }

  let roster
  try {
    roster = await enumerateRoster()
  } catch (err) {
    await stampOutcome(pending.id, 'failed', `Could not enumerate the org roster: ${err.message}`)
    return
  }
  log(`claimed request ${pending.id} (source: ${pending.source}) — launching the round over ${roster.length} orgs`)

  const claimStartIso = new Date().toISOString()
  let spawnErr = null
  let stdout = ''
  // Clean environment: a CLAUDE_*/ANTHROPIC_* var inherited from a parent
  // Claude session breaks the child's OAuth (observed 5 Sep 2026). launchd
  // is already clean; this keeps manual --tick runs identical. cwd is the
  // sandboxed runner dir (installer-built): skills only, no .env.local, own
  // deny-rules settings.
  const child = spawn(
    CLAUDE_BIN,
    [
      '-p', runnerPrompt(roster),
      // --chrome connects the Claude-in-Chrome extension to this headless
      // session (verified 5 Sep 2026) — without it the browser MCP is absent.
      '--chrome',
      '--allowedTools', CHILD_ALLOWED_TOOLS,
      '--disallowedTools', CHILD_DISALLOWED_TOOLS,
    ],
    {
      cwd: RUNNER_DIR,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: {
        HOME: process.env.HOME,
        USER: process.env.USER,
        PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
      },
    },
  )
  child.stdout.on('data', chunk => {
    stdout += chunk
    process.stdout.write(chunk) // tee into the watcher log
  })

  // Wall-clock watchdog with SIGKILL escalation: Node's spawn timeout is
  // monotonic and freezes during Mac sleep, and SIGTERM can be trapped by a
  // hung child — either would leave this tick holding the launchd label
  // forever. Wall clock + SIGKILL guarantees the tick exits.
  const startedMs = Date.now()
  const killAt = startedMs + RUN_TIMEOUT_MINUTES * 60_000
  let timedOut = false
  const watchdog = setInterval(() => {
    if (Date.now() >= killAt + 60_000) {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    } else if (Date.now() >= killAt) {
      timedOut = true
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
  }, 30_000)

  const { code, signal } = await new Promise(resolve => {
    child.on('close', (code, signal) => resolve({ code, signal }))
    child.on('error', err => { spawnErr = err; resolve({ code: null, signal: null }) })
  })
  clearInterval(watchdog)
  const elapsedMin = Math.round((Date.now() - startedMs) / 60_000)
  log(`claude run for ${pending.id} exited (code ${code}, signal ${signal ?? 'none'}) after ${elapsedMin} min`)

  // Outcome: the child reports via a RECON_RESULT stdout line; the watcher
  // stamps. A 'done' claim is cross-checked against captures actually
  // written before it is believed (self-attestation is not verification).
  const resultMatch = /RECON_RESULT\s+(\{.*\})/.exec(stdout)
  if (resultMatch) {
    let parsed = null
    try { parsed = JSON.parse(resultMatch[1]) } catch { /* malformed — falls through */ }
    if (parsed && (parsed.status === 'done' || parsed.status === 'failed')) {
      const note = String(parsed.note ?? '').slice(0, 900)
      if (parsed.status === 'done') {
        const verifyFailure = await verifyDoneClaim(roster, claimStartIso)
        if (verifyFailure) {
          await stampOutcome(pending.id, 'failed', `${note} — ${verifyFailure}`.slice(0, 990))
        } else {
          await stampOutcome(pending.id, 'done', note || `All ${roster.length} orgs captured`)
        }
      } else {
        await stampOutcome(pending.id, 'failed', note || 'Run reported failure with no detail')
      }
      return
    }
  }

  // No (usable) RECON_RESULT — pick the honest note for how it died.
  let note
  if (spawnErr) {
    note = `Could not start the claude CLI at ${CLAUDE_BIN}: ${spawnErr.message}`
  } else if (timedOut || signal) {
    note = `Run killed after the ${RUN_TIMEOUT_MINUTES} min timeout (${signal ?? 'watchdog'}) — captures posted before the kill are kept`
  } else if (code !== 0 && elapsedMin < 2) {
    note = `Claude run exited with code ${code} almost immediately — is the claude CLI logged in? Run \`claude\` once in a terminal`
  } else if (code !== 0) {
    note = `Claude run exited with code ${code} before reporting an outcome — check the watcher log`
  } else {
    note = 'Run ended without reporting an outcome — check the watcher log'
  }
  await stampOutcome(pending.id, 'failed', note)
}

const mode = process.argv[2]
try {
  if (mode === '--tick') {
    await tick()
  } else if (mode === '--request') {
    await requestRun(process.argv[3] || 'schedule')
  } else {
    console.error('Usage: recon-round-watcher.mjs --tick | --request [source]')
    process.exit(1)
  }
} catch (err) {
  console.error(`[watcher] ${err.message}`)
  process.exit(1)
}
