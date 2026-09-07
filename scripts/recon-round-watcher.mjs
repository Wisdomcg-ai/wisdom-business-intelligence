#!/usr/bin/env node
/**
 * Recon-round watcher — the runner-machine side of the CFO board's "Update
 * from Xero" button. Cross-platform (macOS launchd / Windows Task Scheduler)
 * and standalone: no npm dependencies, no repo secrets.
 *
 *   --tick               claim a pending request from the server and run the
 *                        round (scheduler calls this every 60s; exits
 *                        immediately when nothing to do)
 *   --request [source]   queue a request manually
 *
 * Configuration lives in ~/.wisdombi/recon-runner.env — BESIDE the sandbox
 * dir, never inside the child's cwd (installer writes the template, a human
 * fills the token — secrets never pass through Claude):
 *   RECON_WATCHER_TOKEN=...        required — must match the Vercel env var
 *   WISDOMBI_URL=https://www.wisdombi.ai   optional override
 *   CLAUDE_BIN=...                 optional path to the claude CLI
 *   RUNNER_OWNER_EMAIL=...         optional — this machine's owner (their
 *                                  WisdomBI login email). With it set, a
 *                                  button press is routed to the presser's
 *                                  own machine for its first 5 minutes;
 *                                  without it this is a generic runner that
 *                                  claims anything immediately.
 *
 * All queue/roster/verification logic lives SERVER-side behind
 * /api/cfo/recon-round-worker (token-gated): this machine holds no database
 * key, and a 'done' outcome is verified by the server against the captures
 * actually written — a runner cannot attest its own success.
 *
 * The unattended child Claude (spawned per run) keeps the same security
 * model as always: sandboxed runner dir, explicit tool list, no shell, no
 * database, no token — it reports via a RECON_RESULT stdout line. It NEVER
 * logs in and never sees credentials; an expired Xero session becomes a
 * 'failed' run with an honest note, not a fake capture.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const IS_WINDOWS = process.platform === 'win32'
const HOME = process.env.HOME || process.env.USERPROFILE
const RUNNER_DIR = join(HOME, '.wisdombi', 'recon-runner')
/** A full round over ~12 orgs runs 30-45 min. The server's pickup window
 *  (30) and janitor (60/75) and the board's liveness bounds pair with this. */
const RUN_TIMEOUT_MINUTES = 60

// Runner config lives BESIDE the sandbox dir, not inside it — the child's
// cwd must never contain the token.
const ENV_PATH = join(HOME, '.wisdombi', 'recon-runner.env')

function loadRunnerEnv() {
  const envPath = ENV_PATH
  let raw
  try {
    raw = readFileSync(envPath, 'utf8')
  } catch {
    console.error(`[watcher] cannot read ${envPath} — run the installer, then put RECON_WATCHER_TOKEN in it`)
    process.exit(1)
  }
  const env = {}
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const cfg = loadRunnerEnv()
if (!cfg.RECON_WATCHER_TOKEN) {
  console.error(`[watcher] RECON_WATCHER_TOKEN missing from ${ENV_PATH}`)
  process.exit(1)
}
const BASE_URL = (cfg.WISDOMBI_URL || 'https://www.wisdombi.ai').replace(/\/$/, '')

function defaultClaudeBin() {
  if (cfg.CLAUDE_BIN) return cfg.CLAUDE_BIN
  const candidates = IS_WINDOWS
    ? [join(HOME, '.local', 'bin', 'claude.exe'), join(HOME, 'AppData', 'Roaming', 'npm', 'claude.cmd'), 'claude.cmd']
    : [join(HOME, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) { if (existsSync(c)) return c } else return c
  }
  return candidates[candidates.length - 1]
}
const CLAUDE_BIN = defaultClaudeBin()

const log = (msg) => console.log(`[watcher ${new Date().toISOString()}] ${msg}`)

async function worker(op, extra = {}) {
  const res = await fetch(`${BASE_URL}/api/cfo/recon-round-worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.RECON_WATCHER_TOKEN}`,
    },
    body: JSON.stringify({ op, ...extra }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.error ?? `HTTP ${res.status}`
    throw new Error(`${op} failed: ${detail}${res.status === 401 ? ' — is RECON_WATCHER_TOKEN correct (and set in Vercel)?' : ''}`)
  }
  return body
}

function runnerPrompt(requestRoster, priorNamesByTenant) {
  const rosterLines = requestRoster.map(r => {
    const prior = priorNamesByTenant[r.tenant_id]
    return `- ${r.business} [business_id ${r.business_id}] — org "${r.tenant_name}" [tenant_id ${r.tenant_id}]` +
      (r.short_code ? ` — shortcode ${r.short_code}` : ' — NO shortcode: use Xero\'s org switcher by name') +
      (r.badge_only
        ? ' — BADGE-ONLY client: no WisdomBI connection exists, so this name is the WisdomBI business name and the Xero header may differ slightly (e.g. a "Pty Ltd" suffix) — treat a close name match as the correct org'
        : '') +
      (prior ? ` — account names used by the last capture: ${prior.map(n => `"${n}"`).join(', ')}` : '')
  }).join('\n')
  return `You are running UNATTENDED to refresh the CFO board's Xero badge counts.
Run the full Xero recon round by following .claude/skills/xero-recon-round/SKILL.md (badge walk over
every org, then the date pass, posting captures WITH per-account months histograms from a logged-in
${BASE_URL} tab) — with these overrides for unattended mode:
1. You have NO database access. Skip the skill's SQL enumeration and DB verification steps entirely.
   The round's org set is EXACTLY this live roster (use these business_id/tenant_id values in POSTs):
${rosterLines}
2. HARD RULES: never log in anywhere and never touch credentials. If Xero or WisdomBI shows a login
   page, STOP and report it. A badge you could not read is a SKIPPED org, never a 0. Never invent a
   month bucket to make a histogram foot — omit months for that account and say so in notes.
   NAME STABILITY: Xero shows the SAME account under different labels on different screens (panel
   nickname, Tasks list, a PayPal login email). When an account is clearly the same one as an entry
   in that org's "account names used by the last capture" list, POST it under that prior spelling
   EXACTLY — ignore-lists and merges match on the name. Only use a new name when it is genuinely a
   different or new account (say so in notes); when unsure, keep the name you see and note the doubt.
3. POST INCREMENTALLY — this is mandatory. The moment you finish a business's badge read, POST its
   capture (without months). After you finish that business's date pass, POST it again with months.
   Never hold captures back to post in one batch at the end: you run under a hard ${RUN_TIMEOUT_MINUTES}-minute
   kill switch, and anything unposted when it fires is lost. Work business by business: badges →
   post → dates → post → next business.
4. When finished OR stopped, end your reply with ONE final line, exactly this shape:
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
  // Scoped: the child may read the skill files and NOTHING else on disk.
  'Read(./.claude/skills/**)',
].join(',')
const CHILD_DISALLOWED_TOOLS = [
  'mcp__claude-in-chrome__file_upload',
  'mcp__claude-in-chrome__upload_image',
  'mcp__claude-in-chrome__gif_creator',
  'mcp__claude-in-chrome__shortcuts_execute',
  'mcp__claude-in-chrome__shortcuts_list',
  'Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch',
].join(',')

/** Minimal clean env for the child. Inherited CLAUDE_ or ANTHROPIC_ vars
 *  from a parent Claude session break the child's OAuth (observed 5 Sep
 *  2026); Windows needs its profile dirs for the CLI to find its config. */
function childEnv() {
  if (IS_WINDOWS) {
    return {
      USERPROFILE: process.env.USERPROFILE,
      HOMEDRIVE: process.env.HOMEDRIVE,
      HOMEPATH: process.env.HOMEPATH,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      SYSTEMROOT: process.env.SYSTEMROOT,
      COMSPEC: process.env.COMSPEC,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PATH: process.env.PATH,
      USERNAME: process.env.USERNAME,
    }
  }
  return {
    HOME: process.env.HOME,
    USER: process.env.USER,
    PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
  }
}

async function tick() {
  const claim = await worker('claim', cfg.RUNNER_OWNER_EMAIL ? { runner_owner_email: cfg.RUNNER_OWNER_EMAIL } : {})
  if (!claim.claimed) {
    // Surface WHY nothing was claimed, except the two quiet-by-design cases
    // (idle tick; another machine mid-run). Without this, a misdeclared
    // RUNNER_OWNER_EMAIL is indistinguishable from health — the reserved
    // reason is the only signal that affinity is refusing this machine.
    if (claim.reason && claim.reason !== 'nothing pending' && claim.reason !== 'a run is already in progress') {
      log(`claim declined: ${claim.reason}`)
    }
    return
  }
  const { claimed, roster, roster_warning, prior_names } = claim
  const withWarning = (note) => (roster_warning ? `${note} — ${roster_warning}` : note).slice(0, 990)
  log(`claimed request ${claimed.id} (source: ${claimed.source}) — launching the round over ${roster.length} orgs`)

  let spawnErr = null
  let stdout = ''
  // The prompt goes via STDIN, never argv: it interpolates strings that
  // originate from Xero pages and the database, and Node's shell:true does
  // NOT quote argv (a metacharacter in a business name would execute as a
  // command). Every remaining argv item is a static metacharacter-free
  // literal. shell is needed only for npm's .cmd shim on Windows — Node
  // refuses .cmd without it (CVE-2024-27980).
  const prompt = runnerPrompt(roster, prior_names ?? {})
  const child = spawn(
    CLAUDE_BIN,
    [
      '-p',
      // --chrome connects the Claude-in-Chrome extension to this headless
      // session — without it the browser MCP is absent.
      '--chrome',
      '--allowedTools', CHILD_ALLOWED_TOOLS,
      '--disallowedTools', CHILD_DISALLOWED_TOOLS,
    ],
    {
      cwd: RUNNER_DIR,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: childEnv(),
      shell: IS_WINDOWS && CLAUDE_BIN.endsWith('.cmd'),
    },
  )
  child.stdin.on('error', () => { /* child died before reading — close path handles it */ })
  child.stdin.write(prompt)
  child.stdin.end()
  child.stdout.on('data', chunk => {
    stdout += chunk
    process.stdout.write(chunk) // tee into the watcher log
  })

  // Wall-clock watchdog with SIGKILL escalation: spawn's own timeout is
  // monotonic and freezes during sleep, and SIGTERM can be trapped — either
  // would leave this tick holding the scheduler slot forever.
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
  log(`claude run for ${claimed.id} exited (code ${code}, signal ${signal ?? 'none'}) after ${elapsedMin} min`)

  const stamp = async (status, note) => {
    try {
      const res = await worker('stamp', { request_id: claimed.id, claim_nonce: claimed.claim_nonce ?? '', status, note: withWarning(note) })
      if (!res.stamped) log(`stamp skipped — ${res.reason ?? 'verdict already stands'}`)
      else if (status === 'done' && res.status === 'failed') log('server verify downgraded the done claim — see result_note')
    } catch (err) {
      // The server janitor will retire the row if this never lands.
      console.error(`[watcher] stamp failed: ${err.message}`)
    }
  }

  const resultMatch = /RECON_RESULT\s+(\{.*\})/.exec(stdout)
  if (resultMatch) {
    let parsed = null
    try { parsed = JSON.parse(resultMatch[1]) } catch { /* malformed — falls through */ }
    if (parsed && (parsed.status === 'done' || parsed.status === 'failed')) {
      // The server re-verifies 'done' against captures actually written.
      await stamp(parsed.status, String(parsed.note ?? '').slice(0, 900))
      return
    }
  }

  let note
  if (spawnErr) {
    note = `Could not start the claude CLI at ${CLAUDE_BIN}: ${spawnErr.message} — set CLAUDE_BIN in ${ENV_PATH}`
  } else if (timedOut || signal) {
    note = `Run killed after the ${RUN_TIMEOUT_MINUTES} min timeout (${signal ?? 'watchdog'}) — captures posted before the kill are kept`
  } else if (code !== 0 && elapsedMin < 2) {
    note = `Claude run exited with code ${code} almost immediately — is the claude CLI logged in on this machine? Run \`claude\` once in a terminal`
  } else if (code !== 0) {
    note = `Claude run exited with code ${code} before reporting an outcome — check the watcher log`
  } else {
    note = 'Run ended without reporting an outcome — check the watcher log'
  }
  await stamp('failed', note)
}

const mode = process.argv[2]
try {
  if (mode === '--tick') {
    await tick()
  } else if (mode === '--request') {
    const res = await worker('request', { source: process.argv[3] || 'schedule' })
    log(res.existing ? 'request skipped — a live request already exists' : 'queued a recon round')
  } else {
    console.error('Usage: recon-round-watcher.mjs --tick | --request [source]')
    process.exit(1)
  }
} catch (err) {
  console.error(`[watcher] ${err.message}`)
  process.exit(1)
}
