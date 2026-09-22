# Recon-round runner — machine setup guide

Any machine set up with this guide can execute the CFO board's **Update from
Xero** runs. Multiple runner machines can coexist (Matt's Mac + Vanessa's PC):
the server hands each queued run to exactly one of them, whichever claims it
first. A runner machine holds **no database key** — only `RECON_WATCHER_TOKEN`,
which unlocks the three queue operations and nothing else.

## What a runner machine needs

1. **Node.js 18+** — nodejs.org LTS installer.
2. **Claude Code** (the `claude` CLI), signed in: run `claude` once in a
   terminal and complete the browser login. Runs consume this account's
   Claude usage.
3. **Google Chrome** with the **Claude in Chrome** extension, connected to
   the same Claude account.
4. **Chrome logged in to Xero** with a user that can open every client org
   on the board (the run stops honestly at any login wall — it never enters
   credentials).
5. **Chrome logged in to WisdomBI** (www.wisdombi.ai) with an account that
   can post reconciliation captures for every board client.
6. A clone of this repository (it is the source of the watcher script and
   the skill): `git clone https://github.com/Wisdomcg-ai/wisdom-business-intelligence.git`

## Install

- **macOS**: `bash scripts/install-recon-watcher.sh`
- **Windows**: `powershell -ExecutionPolicy Bypass -File scripts\install-recon-watcher-windows.ps1`

Both create the sandbox dir (`~/.wisdombi/recon-runner`) and a scheduler job
that checks for queued runs every minute, and write a config template at
`~/.wisdombi/recon-runner.env`.

## The token (a human step, on purpose)

Generate one token (any machine):

```bash
openssl rand -hex 32
```

Put the SAME value in BOTH places yourself — do not paste it into Claude:

1. Vercel → wisdom-business-intelligence → Settings → Environment Variables →
   `RECON_WATCHER_TOKEN` (Production) → redeploy.
2. `~/.wisdombi/recon-runner.env` on every runner machine
   (`RECON_WATCHER_TOKEN=...`).

Rotating the token = repeat both steps with a new value.

## Verify

```bash
node scripts/recon-round-watcher.mjs --tick
```

Silence (or "nothing pending") = healthy. A 401 = token mismatch. Then click
**Update from Xero** on the board and watch `~/.wisdombi/logs` (Windows) or
`~/Library/Logs/wisdombi-recon-watcher.log` (macOS).

## Whose machine runs a click (press-affinity)

Set `RUNNER_OWNER_EMAIL` in each machine's `recon-runner.env` to that
machine's owner — their **WisdomBI login email**. Then a button press is
reserved for the presser's own machine for its first **5 minutes** (their
Chrome, their Xero session); if that machine doesn't pick it up in time, any
other runner takes over so the run still happens. A machine with the value
unset is a generic runner: it claims anything immediately — including other
people's presses — so set it on EVERY machine once there is more than one.

## Day-to-day facts

- The machine must be awake with Chrome running, Xero + WisdomBI logged in,
  while a run executes (~30–45 min; counts land on the board client by
  client from the first few minutes).
- If nothing picks a queued run up within 30 minutes, the button says so and
  the request expires — no silent hangs.
- After a `git pull` in the repo clone, re-run the installer — it refreshes
  the skills copy (Windows copies; macOS symlinks pick changes up
  automatically) and appends any newly introduced env keys. The watcher
  script itself runs FROM the clone, so new watcher behavior (e.g.
  press-affinity) needs the pull, not just the installer.
