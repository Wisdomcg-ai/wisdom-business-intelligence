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
   (dual-ID house rule). Skip clients hidden from the board only if Matt says
   so — hidden clients may still need reconciliation.

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
       accounts: [{ name, count }, ...],
       notes: '<anything skipped/odd>',
     }] }),
   }).then(r => r.json())
   ```

   A non-2xx or `{error}` response = that business FAILED; report it, don't
   retry blindly (401 means Matt's WisdomBI session expired — ask him to log
   in there too).

4. **Verify + report**: query `reconciliation_dashboard_captures` for rows
   with this round's timestamps; summarise per client (badge total, top
   accounts), name every skipped/failed org, and remind Matt the board's
   expanded panels now show the captured badges next to the API count.

## Timing

~13 orgs × (1 nav + badge read) ≈ 5–8 minutes. Xero sessions expire —
if the round dies mid-way with login pages, resume from the first skipped
org after Matt re-authenticates; captures are append-only, re-posting an
org is harmless.
