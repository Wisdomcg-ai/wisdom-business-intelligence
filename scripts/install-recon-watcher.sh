#!/bin/bash
# Install (or reinstall) the recon-round watcher launchd job on this Mac.
#
#   com.wisdombi.recon-watcher — every 60s: picks up queued "Update from
#   Xero" requests from the CFO board and runs the Chrome recon round.
#
# Manual-trigger only (Matt, 5 Sep 2026): runs happen when the board button
# queues one — no scheduled runs, since the Mac is rarely logged into Xero
# unattended. Idempotent: re-running replaces the job. Remove with:
#   launchctl bootout gui/$(id -u)/com.wisdombi.recon-watcher
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || echo /opt/homebrew/bin/node)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs"
RUNNER_DIR="$HOME/.wisdombi/recon-runner"
UID_N="$(id -u)"
mkdir -p "$AGENTS_DIR" "$LOG_DIR"

# Sandboxed working directory for the unattended child Claude run: ONLY the
# skills are reachable (symlink), no .env.local anywhere in scope, and the
# runner's own settings deny shell/file-write/env-file access outright
# (deny beats allow, whatever tool list the spawn passes).
mkdir -p "$RUNNER_DIR/.claude"
ln -sfn "$REPO_ROOT/.claude/skills" "$RUNNER_DIR/.claude/skills"
cat > "$RUNNER_DIR/.claude/settings.json" <<'EOF'
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
      "Read(**/*credentials*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
EOF

write_plist() {
  local label="$1" ; shift
  local extra="$1" ; shift
  local args="$1"
  cat > "$AGENTS_DIR/$label.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_ROOT/scripts/recon-round-watcher.mjs</string>
    $args
  </array>
  <key>WorkingDirectory</key><string>$REPO_ROOT</string>
  <key>StandardOutPath</key><string>$LOG_DIR/wisdombi-recon-watcher.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/wisdombi-recon-watcher.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  $extra
</dict>
</plist>
EOF
  launchctl bootout "gui/$UID_N/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_N" "$AGENTS_DIR/$label.plist"
  echo "installed $label"
}

write_plist "com.wisdombi.recon-watcher" \
  "<key>StartInterval</key><integer>60</integer>" \
  "<string>--tick</string>"

# The old weekday-morning auto-queue job is retired — remove it if present.
launchctl bootout "gui/$UID_N/com.wisdombi.recon-morning" 2>/dev/null || true
rm -f "$AGENTS_DIR/com.wisdombi.recon-morning.plist"

echo "done — logs: $LOG_DIR/wisdombi-recon-watcher.log"
