# Install (or reinstall) the recon-round watcher on a Windows machine.
#
# Run from a cloned wisdom-business-intelligence checkout, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\install-recon-watcher-windows.ps1
#
# Creates %USERPROFILE%\.wisdombi\recon-runner (sandbox for the unattended
# Claude run: skills COPY, deny-rules settings, .env template) and registers
# a Task Scheduler job "WisdomBI Recon Watcher" that runs the watcher tick
# every minute. See scripts/RECON-RUNNER-SETUP.md for the full setup guide.
#
# Idempotent: re-running refreshes the skills copy and the task. Remove with:
#   schtasks /Delete /TN "WisdomBI Recon Watcher" /F
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$RunnerDir = Join-Path $env:USERPROFILE '.wisdombi\recon-runner'
$LogDir    = Join-Path $env:USERPROFILE '.wisdombi\logs'
New-Item -ItemType Directory -Force -Path (Join-Path $RunnerDir '.claude') | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Skills: COPY (symlinks need special privileges on Windows). Re-run this
# installer after a `git pull` to refresh them.
$SkillsSrc = Join-Path $RepoRoot '.claude\skills'
$SkillsDst = Join-Path $RunnerDir '.claude\skills'
if (Test-Path $SkillsDst) { Remove-Item -Recurse -Force $SkillsDst }
Copy-Item -Recurse -Force $SkillsSrc $SkillsDst

# Sandbox permissions for the unattended child run: no shell, no writes, no
# env/credential file reads (deny beats allow, whatever the spawn passes).
@'
{
  "permissions": {
    "deny": [
      "Bash",
      "Write",
      "Edit",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "Read(**/.env*)",
      "Read(//**/.env*)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Read(**/*credentials*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $RunnerDir '.claude\settings.json')

# Runner config template — a HUMAN fills in the token (must match Vercel's
# RECON_WATCHER_TOKEN). Never overwrite an existing .env.
$EnvPath = Join-Path $env:USERPROFILE '.wisdombi\recon-runner.env'
if (-not (Test-Path $EnvPath)) {
  @'
# Fill in and keep private. Must match the RECON_WATCHER_TOKEN env var in Vercel.
RECON_WATCHER_TOKEN=
WISDOMBI_URL=https://www.wisdombi.ai
# This machine's owner (their WisdomBI login email). A button press runs on
# the presser's own machine first; other machines wait 5 minutes.
RUNNER_OWNER_EMAIL=
# Optional: full path to the claude CLI if it is not auto-detected.
# CLAUDE_BIN=C:\Users\you\AppData\Roaming\npm\claude.cmd
'@ | Set-Content -Encoding UTF8 $EnvPath
  Write-Host "created $EnvPath - put RECON_WATCHER_TOKEN in it"
}

# Existing env files predate press-affinity: append the new key (never touch
# the token line) so re-running the installer migrates the machine.
if (-not (Select-String -Path $EnvPath -Pattern '^RUNNER_OWNER_EMAIL=' -Quiet)) {
  Add-Content -Encoding UTF8 -Path $EnvPath -Value @'
# This machine's owner (their WisdomBI login email). A button press runs on
# the presser's own machine first; other machines wait 5 minutes.
RUNNER_OWNER_EMAIL=
'@
  Write-Host "added RUNNER_OWNER_EMAIL to $EnvPath - fill it in (this machine's owner's WisdomBI login email)"
}

$NodeBin = (Get-Command node -ErrorAction Stop).Source
$Watcher = Join-Path $RepoRoot 'scripts\recon-round-watcher.mjs'
$LogFile = Join-Path $LogDir 'recon-watcher.log'

# One wrapper script, registered by plain path — no schtasks /TR quoting
# layer to go wrong across PowerShell versions.
$RunCmd = Join-Path $env:USERPROFILE '.wisdombi\run-recon-tick.cmd'
@"
@echo off
"$NodeBin" "$Watcher" --tick >> "$LogFile" 2>&1
"@ | Set-Content -Encoding ASCII $RunCmd

$TaskAction  = New-ScheduledTaskAction -Execute $RunCmd
$TaskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'WisdomBI Recon Watcher' -Action $TaskAction -Trigger $TaskTrigger -Force -ErrorAction Stop | Out-Null

Write-Host "installed 'WisdomBI Recon Watcher' (every minute) - log: $LogFile"
Write-Host "next: fill in $EnvPath, then follow scripts/RECON-RUNNER-SETUP.md"
