---
name: xero-recon-round
description: Walk Matt's logged-in Chrome through every Xero client org, read the per-account "Reconcile N items" dashboard badges, and post them to the CFO board's dashboard-capture endpoint (method chrome_routine). Use when Matt asks to check/refresh unreconciled counts, run the recon round, or capture the Xero badges.
---

# Xero reconciliation round (Chrome routine)

Captures the ONLY banner-exact unreconciled numbers available: Xero's
per-account "Reconcile N items" dashboard badges. The API cannot see these —
Xero support confirmed in writing (2 Sep 2026) that the bankstatement report
scope is dead for everyone and statement lines are banks-only. The board's
API count (recorded transactions) measures a different population; this
routine feeds the badge side via `reconciliation_dashboard_captures`
(`method: 'chrome_routine'`), which `/api/cfo/board` already consumes.

## Hard rules

- **Never log in.** If any org shows the Xero login page, STOP the round and
  ask Matt to log into Xero in Chrome (his MFA), then resume. Credentials are
  never typed, stored, or requested.
- Matt's real Chrome via `mcp__claude-in-chrome__*` only — his live session,
  interactive pace. No headless browsers, no stored sessions.
- A badge you could not read is a SKIPPED org, reported by name — never a 0.
- Dashboard badges cover dashboard-VISIBLE accounts; note this caveat in the
  capture `notes` if any org's account panels look incomplete.

## Procedure

1. **Enumerate the round** (supabase-wisdombi MCP, read-only):

   ```sql
   select distinct b.id as business_id, b.name, xc.tenant_id, xc.tenant_name, bas.short_code
   from xero_connections xc
   join businesses b on b.id = xc.business_id
   left join business_profiles bp on bp.id = xc.business_id  -- dual-ID: resolve if needed
   left join (select distinct tenant_id, short_code from bank_account_status) bas
     on bas.tenant_id = xc.tenant_id
   where xc.is_active
   order by b.name;
   ```

   Resolve any profile-space `business_id` to canonical `businesses.id`
   (dual-ID house rule). Clients hidden from the board
   (`monthly_report_settings.hide_from_board = true`) are EXCLUDED from the
   round (Matt, 5 Sep 2026) — cover one only if Matt explicitly asks, or
   after he restores it to the board.

2. **Per org** (one Chrome tab, reused):
   - Navigate `https://go.xero.com/organisationlogin/default.aspx?shortcode=<CODE>&redirecturl=%2FDashboard%2F`
     (URL-encode the short code — they contain `!`).
   - Wait for the dashboard; confirm the org name matches `tenant_name`
     (the header shows it). Wrong org or login page → skip + report.
   - Read every bank-account panel's badge: `find` "Reconcile N items"
     buttons, or `read_page` the account widgets. Collect
     `{ name: <account panel title>, count: N }` per account; an account with
     no reconcile button counts 0. Missing short_code → use Xero's org
     switcher menu by name instead.

3. **Post captures** — from a `https://www.wisdombi.ai` tab (Matt's app
   session provides auth; the endpoint is coach-gated). Per business:

   ```js
   await fetch('/api/cfo/reconciliation/dashboard-capture', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ business_id, captures: [{
       tenant_id, total_count, method: 'chrome_routine',
       accounts: [{ name, count, months: { '2026-08': 15, '2026-09': 32 } }, ...],
       notes: '<anything skipped/odd>',
     }] }),
   }).then(r => r.json())
   ```

   `months` comes from the date pass below and DRIVES the board's
   READY/BLOCKED verdict — post it whenever you ran the date pass for that
   account. It must foot to `count` exactly or the server refuses the
   capture. If the extraction doesn't foot to the badge (±1-2 is usually
   page furniture), re-read the page; if it still doesn't foot, OMIT
   `months` for that account and put the approximate split in `notes` —
   never invent a bucket to make it add up. An account without `months`
   fails closed: the board shows it as "could be blocking", never as ready.

   A non-2xx or `{error}` response = that business FAILED; report it, don't
   retry blindly (401 means Matt's WisdomBI session expired — ask him to log
   in there too).

   **Post incrementally, business by business** — badge read → POST (no
   months yet) → date pass → POST again with months → next business.
   Captures are append-only and latest-per-tenant wins, so re-posting is
   free. Never hold everything back for one batch at the end: unattended
   runs die at a hard kill switch, and anything unposted is lost (learned
   5 Sep 2026 — a 40-minute run was killed with 13 orgs read and zero
   captures posted).

4. **Verify + report**: query `reconciliation_dashboard_captures` for rows
   with this round's timestamps; summarise per client (badge total, top
   accounts), name every skipped/failed org, and remind Matt the board's
   expanded panels now show the captured badges next to the API count.

## Timing

~13 orgs × (1 nav + badge read) ≈ 5–8 minutes. Xero sessions expire —
if the round dies mid-way with login pages, resume from the first skipped
org after Matt re-authenticates; captures are append-only, re-posting an
org is harmless.

## Date pass (period relevance — run after the badge walk)

The badge is a total; reporting only cares about lines dated ON OR BEFORE the
report month's end (Sep lines don't block an August pack). Since 5 Sep 2026
the board computes its READY/BLOCKED verdict from the per-account `months`
histogram, so the date pass is part of the standard round, not an optional
extra. For every account with a badge > 0 (skip known legacy monsters —
list them in the business's `recon_ignored_accounts` board setting instead):

1. Open its reconcile screen (same tab):
   `https://go.xero.com/BankRec/BankRec.aspx?accountId=<ACCOUNT_ID>` —
   prefix with the shortcode login redirect when switching orgs. Account IDs:
   `bank_account_status.bank_account_id` (DB), else harvest from the
   dashboard: `document.querySelectorAll('[href*="BankRec.aspx"]')`.
2. Extract a month histogram via javascript_tool:
   `document.body.innerText.match(/\b\d{1,2} (Jan|...|Dec) \d{4}\b/g)` →
   bucket by year-month. The match count should EQUAL the badge; a ±1-2
   mismatch is page-furniture noise (report as approximate), a big mismatch
   means pagination (page shows ~50 lines) — note it, don't guess.
3. Post the histogram as the account's `months` field (step 3 above) —
   `{"2026-07": 2, "2026-08": 15, "2026-09": 32}`, keys YYYY-MM, values
   footing to the account count. Also report per client:
   "AUG-RELEVANT: N of TOTAL (account splits)".

## Known org short codes (verified 5 Sep 2026)

Attaquer !34Px3 · Digital Bond !Bzt6F · Dragon Roofing !v2-mT ·
Easy Hail !Yy7Hg · IICT Aust !88FXr · IICT Group Ltd !KlQ18 ·
IICT Group Pty !v3fct · JDS/Aeris !N9hJb · Sharon King !ygLv0 ·
Urban Road !9XB-5 · Armstrong !grQ46 · Malouf Family Trust !XGy7z ·
Sydney Pressed Metal !QrzNw
(URL-encode the leading '!' as %21. New orgs: use the switcher's search box.)

## Standing observations (recheck each round)

- Urban Road: "Paypal Account - DO NOT USE" carries ~19,920 ancient lines —
  archive that feed; exclude from counts, note as legacy.
- Armstrong: Amex feed expires — if statement balance is stale, tell Matt to
  renew the feed (missing imports understate the badge).
